// 语音朗读全局单例 Store：百炼 Qwen3-TTS-Flash-Realtime 流式合成 + 打字机同步
// WebSocket 流式文本 → PCM 音频帧 → Web Audio API 边收边播
// 所有页面共享同一实例，全局跳过按钮可控制任意页面的朗读
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PersonaType } from '@/types/consultation'
import { PROXY_WS_BASE } from '@/config/proxy'

export type { PersonaType }

const WS_PATH_MAP: Record<PersonaType, string> = {
  nurse: '/tts-proxy',
  doctor: '/tts-vc-proxy',
}
const TTS_MODEL_MAP: Record<PersonaType, string> = {
  nurse: 'qwen3-tts-flash-realtime',
  doctor: 'qwen3-tts-vc-realtime-2026-01-15',
}
const TTS_SAMPLE_RATE = 24000

const VOICE_MAP: Record<PersonaType, string> = {
  nurse: 'Cherry',
  doctor: 'qwen-tts-vc-tcmvoice-voice-20260604151303931-5e41',
}

const PERSONA_CHARS_PER_SEC: Record<PersonaType, number> = {
  nurse: 3.6,
  doctor: 3.4,
}

/** PCM 帧累积到该样本数后再调度播放（约 186ms @22050Hz），减少 AudioBufferSourceNode 数量 */
const PCM_BUFFER_THRESHOLD = 4096

export const useTTSStore = defineStore('globalTTS', () => {
  // ── 响应式状态（Pinia state / getter）──
  const isSpeaking = ref(false)
  const isSupported = ref(true)
  /** 每次外部调用 stop() 时递增，供页面监听以执行跳过后的业务逻辑 */
  const stopGeneration = ref(0)

  // ── 全局跳过标志（非响应式）──
  // App.vue 在调用 stop() 前设为 true，watcher 据此区分全局按钮和内部 stop()
  let _globalSkipPending = false

  // ── 内部可变状态（闭包私有，非响应式）──
  let ws: WebSocket | null = null
  let audioContext: AudioContext | null = null
  let typewriterTimer: ReturnType<typeof setInterval> | null = null
  let safetyTimer: ReturnType<typeof setTimeout> | null = null
  let pcmBuffer: Int16Array[] = []
  let pcmBufferLen = 0
  let nextPlayTime = 0
  let lastSourceEndTime = 0
  let firstAudioReceived = false
  let typewriterStarted = false
  let twCharIndex = 0
  let _onChar: ((char: string) => void) | null = null
  let _twText = ''
  /** 当前语句播放倍速（speakSync 入口锁定，整句不可变） */
  let currentSpeed: number = 1
  /** 当前 speakSync 的 resolve 回调，用于 stop() 主动释放挂起的 promise */
  let _currentResolve: (() => void) | null = null
  /** 代次计数器，使 stop() 能终止 speakCloud 的后续执行链（替代共享布尔值避免竞态条件） */
  let _generation = 0

  // ── 清理安全定时器 ──
  const clearSafetyTimer = () => {
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
  }

  // ── 清理所有资源 ──
  const cleanup = () => {
    if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null }
    clearSafetyTimer()
    if (ws) {
      ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null
      try { ws.close() } catch { /* 忽略异常 */ }
      ws = null
    }
    if (audioContext) {
      try { audioContext.close() } catch { /* 忽略异常 */ }
      audioContext = null
    }
    pcmBuffer = []
    pcmBufferLen = 0
    nextPlayTime = 0
    lastSourceEndTime = 0
    firstAudioReceived = false
    typewriterStarted = false
    twCharIndex = 0
    _onChar = null
    _twText = ''
    currentSpeed = 1
  }

  // ── 强制输出打字机剩余文字 ──
  const finishTypewriter = (text: string, charIndex: number, onChar: (char: string) => void) => {
    if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null }
    isSpeaking.value = false
    while (charIndex < text.length) {
      onChar(text[charIndex] ?? '')
      charIndex++
    }
  }

  // ── 启动打字机动画 ──
  const startTypewriter = (text: string, onChar: (char: string) => void, speed: number) => {
    if (typewriterStarted) return
    typewriterStarted = true
    _twText = text
    _onChar = onChar
    twCharIndex = 0

    const charsPerSec = 3.4 * speed
    const charDelay = 1000 / charsPerSec
    // 不发音字符立即输出，不占用打字时间，确保与语音同步
    const isNonSpoken = (ch: string) => /[\n\s【】→、。，：；]/.test(ch)

    typewriterTimer = setInterval(() => {
      // 不发音字符立即连续输出（不占时间）
      while (twCharIndex < text.length && isNonSpoken(text[twCharIndex] ?? '')) {
        onChar(text[twCharIndex] ?? '')
        twCharIndex++
      }
      // 发音字符按正常速度输出
      if (twCharIndex < text.length) {
        onChar(text[twCharIndex] ?? '')
        twCharIndex++
      }
      // 所有字符输出完毕，停止定时器
      if (twCharIndex >= text.length) {
        if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null }
      }
    }, charDelay)
  }

  // ── 将累积的 PCM 缓冲区调度到 AudioContext 播放 ──
  const schedulePcmBuffer = () => {
    if (!audioContext || pcmBufferLen === 0) {
      return
    }

    const totalSamples = pcmBufferLen
    const merged = new Int16Array(totalSamples)
    let offset = 0
    for (const chunk of pcmBuffer) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    pcmBuffer = []
    pcmBufferLen = 0

    // PCM16转浮点
    const float32 = new Float32Array(totalSamples)
    for (let i = 0; i < totalSamples; i++) {
      float32[i] = (merged[i] ?? 0) / 32768
    }

    const audioBuffer = audioContext.createBuffer(1, totalSamples, TTS_SAMPLE_RATE)
    audioBuffer.getChannelData(0).set(float32)

    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.playbackRate.value = currentSpeed
    source.connect(audioContext.destination)

    const now = audioContext.currentTime
    if (nextPlayTime < now) {
      nextPlayTime = now + 0.02
    }

    source.start(nextPlayTime)
    nextPlayTime += audioBuffer.duration / currentSpeed
    lastSourceEndTime = nextPlayTime
  }

  // ── 处理单个 PCM 帧（解码 + 累积 + 达标后调度）──
  const handleAudioDelta = (data: string | ArrayBuffer) => {
    if (!audioContext) return

    let pcm16: Int16Array
    if (typeof data === 'string') {
      const binary = atob(data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      pcm16 = new Int16Array(bytes.buffer)
    } else {
      pcm16 = new Int16Array(data)
    }

    if (pcm16.length === 0) return

    pcmBuffer.push(pcm16)
    pcmBufferLen += pcm16.length

    if (pcmBufferLen >= PCM_BUFFER_THRESHOLD) {
      schedulePcmBuffer()
    }
  }

  // ── 核心：WebSocket 流式 TTS ──
  const speakCloud = async (
    text: string,
    persona: PersonaType,
    onChar: (char: string) => void,
    speed: number,
    doResolve: () => void,
    onError?: () => void,
  ): Promise<void> => {
    const myGen = ++_generation
    const localResolve = () => {
      if (myGen !== _generation) return
      // 未收到任何音频帧时触发降级回调
      if (!firstAudioReceived && onError) {
        onError()
      }
      const savedIndex = twCharIndex
      cleanup()
      finishTypewriter(text, savedIndex, onChar)
      doResolve()
    }

    isSpeaking.value = true
    // 音频倍速：与传入 speed 一致，直接使用 playbackRate 加速（音调会随速度升高）
    currentSpeed = speed

    // 安全超时兜底（TTS 合成时间 + 音频播放时间 + 30s 余量，按倍速缩短）
    const charsPerSec = PERSONA_CHARS_PER_SEC[persona]
    const estimatedMs = ((text.length / charsPerSec) * 1000 + 30000) / speed
    safetyTimer = setTimeout(localResolve, Math.max(estimatedMs, 20000))

    // 创建 AudioContext（WS 连接期间初始化，减少首帧延迟）
    try {
      audioContext = new AudioContext()
      await audioContext.resume()
    } catch {
      // AudioContext 不可用 → 降级为纯文字
      localResolve()
      return
    }

    // ── 建立 WebSocket ──
    try {
      // Tauri 走 Rust 代理，浏览器走 Vite proxy
      const isTauri = !!window.__TAURI__
      const wsBase = isTauri
        ? PROXY_WS_BASE
        : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
      ws = new WebSocket(`${wsBase}${WS_PATH_MAP[persona]}`)
    } catch {
      localResolve()
      return
    }

    ws.onopen = () => {
      if (!ws || myGen !== _generation) return

      // 1. 配置会话：模型 + 音色 + PCM 输出
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          model: TTS_MODEL_MAP[persona],
          voice: VOICE_MAP[persona] ?? 'Cherry',
          output_audio_format: 'pcm',
        },
      }))

      // 2. 发送待合成文本
      ws.send(JSON.stringify({
        type: 'input_text_buffer.append',
        text,
      }))

      // 3. 提交文本（server_commit 模式下自动生成音频，不需要 response.create）
      ws.send(JSON.stringify({
        type: 'input_text_buffer.commit',
      }))
    }

    ws.onmessage = (ev) => {
      if (myGen !== _generation) return
      if (typeof ev.data !== 'string') return

      try {
        const event = JSON.parse(ev.data)

        switch (event.type) {
          case 'session.created':
          case 'session.updated':
            // 会话就绪，等待音频帧
            break

          case 'response.audio.delta': {
            // 首个音频帧：启动打字机
            if (!firstAudioReceived) {
              firstAudioReceived = true
              startTypewriter(text, onChar, speed)
            }
            // 解码并调度 PCM 帧
            const delta = event.delta ?? event.audio ?? event.data
            if (delta) {
              handleAudioDelta(delta)
            }
            break
          }

          case 'response.audio.done':
            // 音频生成完毕，刷出残余 PCM 缓冲，但不 resolve（等 response.done）
            if (pcmBufferLen > 0) schedulePcmBuffer()
            break

          case 'response.done': {
            // 刷出任何残留缓冲
            if (pcmBufferLen > 0) schedulePcmBuffer()

            // 等待音频播放完毕后 resolve
            if (audioContext && lastSourceEndTime > 0) {
              const remainingMs = Math.max(
                0,
                (lastSourceEndTime - audioContext.currentTime) * 1000 + 300,
              )
              setTimeout(localResolve, remainingMs)
            } else {
              // 未收到任何音频 → 直接 resolve（降级为纯文字）
              localResolve()
            }
            break
          }

          case 'error':
            console.error('[TTS] server error:', event.error?.message ?? event)
            localResolve()
            break

          // input_text_buffer.committed / response.created 等中间事件 → 忽略
          default:
            break
        }
      } catch { /* JSON 解析异常，忽略 */ }
    }

    ws.onerror = () => {
      console.error('[TTS] WebSocket error')
    }

    ws.onclose = (ev: CloseEvent) => {
      if (myGen === _generation) {
        // 连接异常关闭（非正常 response.done 后关闭）→ 降级
        console.warn(`[TTS] WebSocket closed unexpectedly: code=${ev.code}, reason=${ev.reason}`)
        localResolve()
      }
    }
  }

  // ── 对外接口：同步语音朗读（返回 Promise，resolve 时朗读+打字机均完成）──
  // speed 在此入口锁定，整句播放期间不可变，下一句调用时可传新值
  const speakSync = (
    text: string,
    persona: PersonaType,
    onChar: (char: string) => void,
    speed: number = 1,
    onError?: () => void,
  ): Promise<void> => {
    return new Promise<void>((resolve) => {
      let resolved = false
      const doResolve = () => {
        if (resolved) return
        resolved = true
        _currentResolve = null
        resolve()
      }
      _currentResolve = doResolve
      speakCloud(text, persona, onChar, speed, doResolve, onError)
    })
  }

  // ── 对外接口：立即停止朗读 ──
  const stop = () => {
    // 递增代次，使所有旧的 speakCloud 调用的回调自动失效
    // （避免旧调用的 await 恢复后继续执行、干扰新的 TTS 调用）
    _generation++
    // 递增跳过代次计数器，供页面监听以执行跳过后的业务逻辑
    stopGeneration.value++
    cleanup()
    // 主动释放挂起的 speakSync promise（cleanup 已清空 WS 事件处理器，
    // localResolve 不会再被触发，必须由 stop 主动 resolve，否则 doctorSay 中
    // 的 await ttsSpeakSync(...) 永远不会返回）
    if (_currentResolve) {
      _currentResolve()
    }
    isSpeaking.value = false
  }

  // ── 全局跳过标志操作方法 ──
  /** App.vue 调用：在 stop() 前标记"本次 stop 来自全局跳过按钮" */
  const markGlobalSkip = () => { _globalSkipPending = true }
  /** ConsultationView 调用：读取并消费标志（读后自动重置为 false） */
  const consumeGlobalSkip = (): boolean => {
    const val = _globalSkipPending
    _globalSkipPending = false
    return val
  }

  return {
    // 状态
    isSpeaking,
    isSupported,
    stopGeneration,
    // 方法
    speakSync,
    stop,
    markGlobalSkip,
    consumeGlobalSkip,
  }
})
