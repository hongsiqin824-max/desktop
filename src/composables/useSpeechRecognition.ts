// 阿里云百炼 Qwen3.5-Omni-Plus-Realtime 语音识别组合式函数
// WebSocket 流式音频 → Base64 PCM → Realtime JSON 事件协议
import { ref } from 'vue'
import type { SpeechStatusType } from '@/types/consultation'
import { PROXY_WS_BASE, isTauri } from '@/config/proxy'

export function useSpeechRecognition() {
  const status = ref<SpeechStatusType>('idle')
  const transcript = ref('')
  const errorMessage = ref('')

  const hasMediaApi = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const isSupported = ref(typeof WebSocket !== 'undefined' && hasMediaApi)

  if (!isSupported.value) {
    if (!hasMediaApi) {
      errorMessage.value = '您的浏览器不支持语音输入，请使用 Chrome 浏览器'
    }
  }

  let ws: WebSocket | null = null
  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let workletNode: AudioWorkletNode | null = null
  let sendTimer: number | null = null
  let fallbackTimer: number | null = null
  let audioActivityTimer: number | null = null
  let retryTimer: number | null = null
  let hasAudioActivity = false
  let pcmChunks: Int16Array[] = []
  let finalText = ''
  let interimText = ''
  let resolveStop: ((text: string) => void) | null = null
  let stopping = false
  let sessionReady = false
  let responseDone = false
  let transcriptionDone = false
  let retryCount = 0
  let workletReady = false

  const RETRY_DELAYS = [3000, 6000, 12000]
  const TARGET_SAMPLE_RATE = 16000
  const SEND_INTERVAL_MS = 100
  const FILTER_TAPS = 65
  const FILTER_CUTOFF_HZ = 6500
  const AGC_TARGET_LEVEL = 0.6
  const AGC_MAX_GAIN = 10
  const AGC_DECAY_FACTOR = 0.97

  let firCoeffs: Float32Array | null = null
  let firOverlap: Float32Array | null = null
  let agcPeak = 0

  const designLowpassFIR = (cutoffHz: number, sampleRate: number): Float32Array => {
    const N = FILTER_TAPS
    const coeffs = new Float32Array(N)
    const mid = (N - 1) / 2
    const fc = cutoffHz / sampleRate

    for (let i = 0; i < N; i++) {
      const n = i - mid
      if (n === 0) {
        coeffs.set([2 * fc], i)
      } else {
        const val = Math.sin(2 * Math.PI * fc * n) / (Math.PI * n)
        coeffs.set([val * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (N - 1)))], i)
      }
    }

    let sum = 0
    for (let i = 0; i < N; i++) sum += coeffs[i] ?? 0
    for (let i = 0; i < N; i++) coeffs.set([coeffs[i]! / sum], i)

    return coeffs
  }

  const resampleFiltered = (chunk: Float32Array, srcRate: number): Int16Array => {
    const dstRate = TARGET_SAMPLE_RATE

    if (srcRate === dstRate) {
      let peak = 0
      for (let i = 0; i < chunk.length; i++) {
        const v = chunk[i] ?? 0
        const abs = v > 0 ? v : -v
        if (abs > peak) peak = abs
      }
      agcPeak = Math.max(peak, agcPeak * AGC_DECAY_FACTOR)
      const gain = Math.min(AGC_MAX_GAIN, AGC_TARGET_LEVEL / Math.max(agcPeak, 0.01))
      const out = new Int16Array(chunk.length)
      for (let i = 0; i < chunk.length; i++) {
        out[i] = Math.max(-32768, Math.min(32767, Math.round((chunk[i] ?? 0) * gain * 32767)))
      }
      return out
    }

    if (!firCoeffs) {
      firCoeffs = designLowpassFIR(FILTER_CUTOFF_HZ, srcRate)
      firOverlap = new Float32Array(FILTER_TAPS - 1)
    }

    const N = FILTER_TAPS
    const overlapLen = N - 1
    const L = chunk.length

    const extended = new Float32Array(overlapLen + L)
    extended.set(firOverlap!)
    extended.set(chunk, overlapLen)

    firOverlap = chunk.slice(-overlapLen)

    const filtered = new Float32Array(L)
    for (let i = 0; i < L; i++) {
      let sum = 0
      for (let j = 0; j < N; j++) {
        const coeff = firCoeffs?.[j] ?? 0
        const extVal = extended[overlapLen + i - j] ?? 0
        sum += coeff * extVal
      }
      filtered[i] = sum
    }

    const ratio = srcRate / dstRate
    const outputLen = Math.floor(L / ratio)
    let chunkPeak = 0
    for (let i = 0; i < L; i++) {
      const v = filtered[i] ?? 0
      const abs = v > 0 ? v : -v
      if (abs > chunkPeak) chunkPeak = abs
    }
    agcPeak = Math.max(chunkPeak, agcPeak * AGC_DECAY_FACTOR)
    const gain = Math.min(AGC_MAX_GAIN, AGC_TARGET_LEVEL / Math.max(agcPeak, 0.01))
    const out = new Int16Array(outputLen)
    for (let i = 0; i < outputLen; i++) {
      const srcIdx = Math.floor(i * ratio)
      out[i] = Math.max(-32768, Math.min(32767, Math.round((filtered[srcIdx] ?? 0) * gain * 32767)))
    }

    return out
  }

  const mergePcm = (chunks: Int16Array[]): Int16Array => {
    const total = chunks.reduce((s, c) => s + c.length, 0)
    const merged = new Int16Array(total)
    let off = 0
    for (const c of chunks) { merged.set(c, off); off += c.length }
    return merged
  }

  const audioBufferToBase64 = (buffer: Int16Array): string => {
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)))
    }
    return btoa(binary)
  }

  const release = () => {
    if (sendTimer) { clearInterval(sendTimer); sendTimer = null }
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null }
    if (audioActivityTimer) { clearTimeout(audioActivityTimer); audioActivityTimer = null }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    hasAudioActivity = false
    if (processor) { processor.disconnect(); processor.onaudioprocess = null; processor = null }
    if (workletNode) { workletNode.disconnect(); workletNode.port.onmessage = null; workletNode = null }
    if (sourceNode) { sourceNode.disconnect(); sourceNode = null }
    if (audioContext) { audioContext.close(); audioContext = null }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null }
    if (ws) {
      ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null
      try { ws.close() } catch {}
      ws = null
    }
    pcmChunks = []
    firCoeffs = null
    firOverlap = null
    agcPeak = 0
    stopping = false
    sessionReady = false
    responseDone = false
    transcriptionDone = false
    workletReady = false
  }

  const finish = (text: string) => {
    release()
    transcript.value = text
    status.value = 'idle'
    resolveStop?.(text)
    resolveStop = null
  }

  const finishWithError = (msg: string) => {
    release()
    errorMessage.value = msg
    status.value = 'error'
    resolveStop?.('')
    resolveStop = null
  }

  const buildWsUrl = (): string => {
    const asrPath = import.meta.env.VITE_ASR_PROXY_URL || '/asr-proxy'
    // Tauri 走 Rust 代理，浏览器走 Vite proxy
    if (isTauri) return `${PROXY_WS_BASE}${asrPath}`
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${location.host}${asrPath}`
  }

  const sendAudioChunk = (merged: Int16Array) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !sessionReady) return
    const base64 = audioBufferToBase64(merged)
    ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64,
    }))
  }

  // ── 仅关闭 WebSocket 连接，保留音频管线和 resolve 回调（用于限流重试）──
  const releaseWsOnly = () => {
    if (sendTimer) { clearInterval(sendTimer); sendTimer = null }
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null }
    if (audioActivityTimer) { clearTimeout(audioActivityTimer); audioActivityTimer = null }
    sessionReady = false
    responseDone = false
    transcriptionDone = false
    hasAudioActivity = false
    pcmChunks = []
    if (ws) {
      ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null
      try { ws.close() } catch {}
      ws = null
    }
  }

  // ── 启动音频发送（sendTimer + 无音频超时检测）──
  // 需要同时满足：sessionReady + workletReady（如果用 worklet）
  const startAudioSending = () => {
    if (sendTimer) return // 已启动，不重复
    // 使用 worklet 时，必须等 worklet 就绪
    if (workletNode && !workletReady) return

    sendTimer = window.setInterval(() => {
      if (pcmChunks.length > 0 && ws?.readyState === WebSocket.OPEN && sessionReady) {
        hasAudioActivity = true
        const merged = mergePcm(pcmChunks)
        pcmChunks = []
        sendAudioChunk(merged)
      }
    }, SEND_INTERVAL_MS)

    audioActivityTimer = window.setTimeout(() => {
      if (!hasAudioActivity && status.value === 'listening' && !stopping) {
        finishWithError('未检测到音频输入，请检查麦克风后重试')
      }
    }, 3000)
  }

  // ── 建立 WebSocket 连接（可重试）──
  const connectWs = (): void => {
    const url = buildWsUrl()
    const localWs = new WebSocket(url)
    ws = localWs

    localWs.onopen = () => {
      localWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text'],
          instructions: '你是一个语音转文字引擎。请逐字重复用户说的话，不要添加任何额外内容、解释或评论。只输出用户说的原文。所有数字必须使用阿拉伯数字输出，禁止使用中文数字（如"138"而非"一三八"，"34"而非"三十四"，"170"而非"一百七十"）。',
          input_audio_format: 'pcm',
          input_audio_transcription: {
            model: 'qwen3-asr-flash-realtime',
          },
          turn_detection: null,
        },
      }))
    }

    localWs.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      try {
        const event = JSON.parse(ev.data)

        switch (event.type) {
          case 'session.created':
            sessionReady = true
            status.value = 'listening'
            // 尝试启动音频发送（如果用 worklet 则需要等 worklet 就绪）
            startAudioSending()
            break

          case 'conversation.item.input_audio_transcription.delta':
            interimText = (event.text || '') + (event.stash || '')
            transcript.value = finalText + interimText
            break

          case 'conversation.item.input_audio_transcription.completed':
            if (event.transcript) {
              finalText += event.transcript
              interimText = ''
              transcript.value = finalText
            }
            transcriptionDone = true
            if (stopping && responseDone) {
              finish(finalText.trim() || '未检测到语音，请再试一次')
            }
            break

          case 'response.done':
            responseDone = true
            if (stopping && transcriptionDone) {
              finish(finalText.trim() || '未检测到语音，请再试一次')
            }
            break

          case 'error':
            console.error('[ASR] server error:', event.error?.message)
            finishWithError(`识别服务错误: ${event.error?.message || '未知错误'}`)
            break
        }
      } catch { /* 忽略 JSON 解析异常 */ }
    }

    localWs.onerror = () => {
      // 不在 onerror 中直接处理错误，因为 onerror 后总会触发 onclose
      // 真正的错误处理在 onclose（限流重试）和 onmessage（服务端 error 事件）中
      console.error('[ASR] WebSocket error (will be handled by onclose)')
    }

    localWs.onclose = (ev: CloseEvent) => {
      // 服务端限流（1011）：保留音频管线，等旧连接确认关闭后延迟重连
      if (ev.code === 1011 && ev.reason?.includes('Too many requests') && retryCount < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[retryCount]!
        retryCount++
        console.warn(`[ASR] 服务端限流，等旧连接关闭后 ${delay / 1000}s 重试 (${retryCount}/${RETRY_DELAYS.length})`)

        // 保存旧 WS 引用（releaseWsOnly 会置空 ws）
        const oldWs = localWs
        releaseWsOnly()

        // 等旧连接确认关闭后再开始倒计时重连
        let closeConfirmed = false
        const startRetry = () => {
          if (closeConfirmed) return
          closeConfirmed = true
          retryTimer = window.setTimeout(() => {
            retryTimer = null
            if (!stopping && resolveStop) {
              connectWs()
            }
          }, delay)
        }

        // 在旧 WS 上设置新的 onclose 监听（若仍在 CLOSING 状态则等待关闭事件）
        if (oldWs && (oldWs.readyState === WebSocket.CLOSING || oldWs.readyState === WebSocket.OPEN)) {
          oldWs.onopen = null
          oldWs.onmessage = null
          oldWs.onerror = null
          oldWs.onclose = () => startRetry()
          try { oldWs.close() } catch {}
          // 超时兜底：若旧连接一直不触发 onclose，500ms 后强制开始倒计时
          setTimeout(startRetry, 500)
        } else {
          // 旧连接已不在活跃状态，直接开始倒计时
          startRetry()
        }
        return
      }

      // 如果已完成或已主动停止，不再处理
      if (status.value !== 'listening' && status.value !== 'processing') return

      // 正常断开：如果有已识别文本则返回
      const text = (finalText + interimText).trim()
      if (text) {
        finish(text)
      } else {
        finishWithError('语音识别服务暂时繁忙，请稍后再试')
      }
    }
  }

  const doStart = async (resolve: (text: string) => void) => {
    if (!isSupported.value) {
      errorMessage.value = '您的浏览器不支持语音输入，请使用 Chrome 浏览器'
      status.value = 'error'
      resolve('')
      return
    }

    release()
    retryCount = 0
    finalText = ''
    interimText = ''
    transcript.value = ''
    errorMessage.value = ''
    resolveStop = resolve
    firCoeffs = null
    firOverlap = null
    agcPeak = 0
    sessionReady = false

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
    } catch (_e: unknown) {
      errorMessage.value = (_e as Error).name === 'NotAllowedError'
        ? '麦克风权限被拒绝，请在浏览器设置中允许'
        : '麦克风启动失败，请检查设备设置'
      status.value = 'error'
      resolve('')
      resolveStop = null
      return
    }

    try {
      audioContext = new AudioContext()
      await audioContext.resume()
      sourceNode = audioContext.createMediaStreamSource(mediaStream!)
      const srcRate = audioContext.sampleRate

      let useWorklet = false
      if (audioContext.audioWorklet) {
        try {
          const workletUrl = new URL('./worklets/pcmResampleProcessor.js', import.meta.url)
          await audioContext.audioWorklet.addModule(workletUrl)
          workletNode = new AudioWorkletNode(audioContext, 'pcm-resample-processor')
          workletReady = false
          workletNode.port.onmessage = (e: MessageEvent) => {
            if (e.data.type === 'pcm') {
              pcmChunks.push(e.data.data)
            } else if (e.data.type === 'ready') {
              workletReady = true
              // worklet 就绪后，如果 session 也已就绪，启动音频发送
              if (sessionReady && !sendTimer) {
                startAudioSending()
              }
            }
          }
          workletNode.onprocessorerror = () => {
            finishWithError('音频处理器异常，请重试')
          }
          sourceNode.connect(workletNode)
          workletNode.connect(audioContext.destination)
          useWorklet = true
          // 立即发送 start，不等 session.created
          workletNode.port.postMessage({ type: 'start' })
        } catch { /* AudioWorklet 不可用，回退到 ScriptProcessorNode */ }
      }

      if (!useWorklet) {
        processor = audioContext.createScriptProcessor(4096, 1, 1)
        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          const f32 = e.inputBuffer.getChannelData(0)
          pcmChunks.push(resampleFiltered(f32, srcRate))
        }
        sourceNode.connect(processor)
        processor.connect(audioContext.destination)
      }

      // 建立 WebSocket（支持重试）
      connectWs()

    } catch {
      finishWithError('语音识别初始化失败，请重试')
      resolve('')
    }
  }

  const startAndWait = (): Promise<string> => new Promise(doStart)

  const stop = () => {
    if (!ws && !audioContext) {
      finish(finalText.trim())
      return
    }

    // 限流重试中：WS 已断开但音频管线仍在运行，用户此时点停止应直接提示
    if (!ws && audioContext && retryTimer) {
      finishWithError('语音识别服务繁忙，请稍后再试')
      return
    }

    // WS 未就绪（正在连接或重试中）：无法发送 commit，直接结束
    if (!ws || ws.readyState !== WebSocket.OPEN || !sessionReady) {
      const text = (finalText + interimText).trim()
      if (text) {
        finish(text)
      } else {
        finishWithError('语音识别服务连接未完成，请稍后再试')
      }
      return
    }

    stopping = true
    responseDone = false
    transcriptionDone = false
    if (audioActivityTimer) { clearTimeout(audioActivityTimer); audioActivityTimer = null }

    let committed = false
    const commitAndRequest = () => {
      if (committed) return
      committed = true
      if (processor) { processor.disconnect(); processor.onaudioprocess = null; processor = null }
      if (sourceNode) { sourceNode.disconnect(); sourceNode = null }
      if (sendTimer) { clearInterval(sendTimer); sendTimer = null }

      if (ws?.readyState === WebSocket.OPEN && sessionReady) {
        const merged = mergePcm(pcmChunks)
        pcmChunks = []
        if (merged.length > 0) sendAudioChunk(merged)
        ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
        ws.send(JSON.stringify({ type: 'response.create' }))
      }

      fallbackTimer = window.setTimeout(() => {
        if (stopping) {
          finish((finalText || interimText).trim())
        }
      }, 5000)
    }

    if (workletNode) {
      const origHandler = workletNode.port.onmessage
      workletNode.port.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'pcm' && status.value === 'listening') {
          pcmChunks.push(e.data.data)
        }
        if (e.data.type === 'flushed') {
          workletNode!.port.onmessage = origHandler
          try { workletNode!.disconnect() } catch {}
          workletNode = null
          commitAndRequest()
        }
      }
      workletNode.port.postMessage({ type: 'stop' })
      setTimeout(() => {
        if (workletNode) {
          try { workletNode.disconnect() } catch {}
          workletNode = null
          commitAndRequest()
        }
      }, 200)
    } else {
      commitAndRequest()
    }
  }

  const getCurrentTranscript = () => transcript.value

  return { status, transcript, errorMessage, isSupported, startAndWait, stop, getCurrentTranscript }
}
