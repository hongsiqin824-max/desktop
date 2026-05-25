// 阿里云百炼 Qwen3.5-Omni-Plus-Realtime 语音识别组合式函数
// WebSocket 流式音频 → Base64 PCM → Realtime JSON 事件协议
import { ref } from 'vue'
import type { SpeechStatusType } from '@/types/consultation'

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
  let hasAudioActivity = false
  let pcmChunks: Int16Array[] = []
  let finalText = ''
  let interimText = ''
  let resolveStop: ((text: string) => void) | null = null
  let stopping = false
  let sessionReady = false
  let responseDone = false
  let transcriptionDone = false

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

  // ── Base64 编码辅助（Realtime API 要求 PCM 数据以 Base64 传输）──
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
  }

  const finish = (text: string) => {
    console.log('[ASR] finish called with:', JSON.stringify(text))
    release()
    transcript.value = text
    status.value = 'idle'
    resolveStop?.(text)
    resolveStop = null
  }

  const buildWsUrl = (): string => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${location.host}/asr-proxy`
  }

  // ── 发送音频块到 Realtime API ──
  const sendAudioChunk = (merged: Int16Array) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !sessionReady) return
    const base64 = audioBufferToBase64(merged)
    console.log('[ASR] sendAudioChunk:', merged.length, 'samples,', base64.length, 'bytes base64')
    ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64,
    }))
  }

  const doStart = async (resolve: (text: string) => void) => {
    if (!isSupported.value) {
      errorMessage.value = '您的浏览器不支持语音输入，请使用 Chrome 浏览器'
      status.value = 'error'
      resolve('')
      return
    }

    // 防御性清理：确保上次会话完全结束
    release()

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
      console.log('[ASR] AudioContext state after resume:', audioContext.state)
      sourceNode = audioContext.createMediaStreamSource(mediaStream!)
      const srcRate = audioContext.sampleRate

      let useWorklet = false
      if (audioContext.audioWorklet) {
        try {
          const workletUrl = new URL('./worklets/pcmResampleProcessor.js', import.meta.url)
          await audioContext.audioWorklet.addModule(workletUrl)
          workletNode = new AudioWorkletNode(audioContext, 'pcm-resample-processor')
          workletNode.port.onmessage = (e: MessageEvent) => {
            if (e.data.type === 'pcm' && status.value === 'listening') {
              pcmChunks.push(e.data.data)
            }
          }
          workletNode.onprocessorerror = () => {
            errorMessage.value = '音频处理器异常，请重试'
            status.value = 'error'
            release()
            resolveStop?.('')
            resolveStop = null
          }
          sourceNode.connect(workletNode)
          workletNode.connect(audioContext.destination)
          useWorklet = true
        } catch { /* AudioWorklet 不可用，回退到 ScriptProcessorNode */ }
      }

      if (!useWorklet) {
        processor = audioContext.createScriptProcessor(4096, 1, 1)
        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          if (status.value !== 'listening') return
          const f32 = e.inputBuffer.getChannelData(0)
          pcmChunks.push(resampleFiltered(f32, srcRate))
        }
        sourceNode.connect(processor)
        processor.connect(audioContext.destination)
      }

      const url = buildWsUrl()
      ws = new WebSocket(url)

      // ── WebSocket 连接建立 → 发送 session.update 配置 ──
      ws.onopen = () => {
        console.log('[ASR] ws.onopen, sending session.update')
        ws!.send(JSON.stringify({
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

      // ── 接收 Realtime API 服务端事件 ──
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') {
          console.log('[ASR] event (binary):', ev.data.byteLength, 'bytes')
          return
        }
        try {
          const event = JSON.parse(ev.data)
          console.log('[ASR] event:', event.type, event.type === 'error' ? JSON.stringify(event) : '')

          switch (event.type) {
            case 'session.created':
              sessionReady = true
              status.value = 'listening'
              console.log('[ASR] session.created, hasAudioActivity:', hasAudioActivity)

              if (workletNode) {
                workletNode.port.postMessage({ type: 'start' })
              }

              // 定时发送音频块
              sendTimer = window.setInterval(() => {
                if (pcmChunks.length > 0 && ws?.readyState === WebSocket.OPEN && sessionReady) {
                  hasAudioActivity = true
                  const merged = mergePcm(pcmChunks)
                  pcmChunks = []
                  sendAudioChunk(merged)
                }
              }, SEND_INTERVAL_MS)

              // 防御性检查：2秒后如果还没收到任何音频，说明 AudioContext 未正常工作
              audioActivityTimer = window.setTimeout(() => {
                console.log('[ASR] 2s audio check, hasAudioActivity:', hasAudioActivity)
                if (!hasAudioActivity && status.value === 'listening' && !stopping) {
                  errorMessage.value = '麦克风未正常工作，请重新点击录音'
                  status.value = 'error'
                  release()
                  resolveStop?.('')
                  resolveStop = null
                }
              }, 2000)
              break

            // 实时转写预览（流式增量）
            case 'conversation.item.input_audio_transcription.delta':
              interimText = (event.text || '') + (event.stash || '')
              transcript.value = finalText + interimText
              console.log('[ASR] delta:', JSON.stringify({ text: event.text, stash: event.stash, interimText }))
              break

            // 转写完成 → 标记并尝试结束
            case 'conversation.item.input_audio_transcription.completed':
              console.log('[ASR] transcription.completed:', JSON.stringify({ transcript: event.transcript, finalTextBefore: finalText }))
              if (event.transcript) {
                finalText += event.transcript
                interimText = ''
                transcript.value = finalText
              }
              transcriptionDone = true
              console.log('[ASR] transcriptionDone=true, stopping:', stopping, 'responseDone:', responseDone, 'finalText:', JSON.stringify(finalText))
              if (stopping && responseDone) {
                console.log('[ASR] finish from transcription.completed, text:', JSON.stringify(finalText.trim()))
                finish(finalText.trim() || '未检测到语音，请再试一次')
              }
              break

            // 模型回复（response.text.*）已忽略：只用 ASR 转写结果，避免模型复述导致重复

            // 回复完成 → 标记并尝试结束（需等 transcription.completed 也到达）
            case 'response.done': {
              console.log('[ASR] response.done, stopping:', stopping, 'transcriptionDone:', transcriptionDone, 'finalText:', JSON.stringify(finalText), 'interimText:', JSON.stringify(interimText))
              responseDone = true
              if (stopping && transcriptionDone) {
                console.log('[ASR] finish from response.done, text:', JSON.stringify(finalText.trim()))
                finish(finalText.trim() || '未检测到语音，请再试一次')
              }
              break
            }

            case 'error':
              console.error('[ASR] error event:', JSON.stringify(event))
              errorMessage.value = `识别服务错误: ${event.error?.message || '未知错误'}`
              status.value = 'error'
              release()
              resolveStop?.('')
              resolveStop = null
              break

            default:
              console.log('[ASR] unhandled event:', event.type)
              break
          }
        } catch { /* 忽略 JSON 解析异常 */ }
      }

      ws.onerror = (ev) => {
        console.error('[ASR] ws.onerror:', ev)
        errorMessage.value = '语音识别服务连接失败，请检查网络或服务配置'
        status.value = 'error'
        release()
        resolveStop?.('')
        resolveStop = null
      }

      ws.onclose = (ev: CloseEvent) => {
        console.log('[ASR] ws.onclose, code:', ev.code, 'reason:', ev.reason, 'wasClean:', ev.wasClean, 'status:', status.value, 'stopping:', stopping, 'finalText:', JSON.stringify(finalText), 'interimText:', JSON.stringify(interimText), 'hasAudioActivity:', hasAudioActivity)
        if (status.value === 'listening') {
          const text = (finalText + interimText).trim()
          if (text) {
            finish(text)
          } else {
            errorMessage.value = '未检测到语音，请再试一次'
            status.value = 'error'
            release()
            resolveStop?.('')
            resolveStop = null
          }
        }
      }
    } catch {
      errorMessage.value = '语音识别初始化失败，请重试'
      status.value = 'error'
      release()
      resolve('')
      resolveStop = null
    }
  }

  const startAndWait = (): Promise<string> => new Promise(doStart)

  // ── 停止录音：发送剩余音频 → commit → response.create ──
  const stop = () => {
    console.log('[ASR] stop() called, ws:', !!ws, 'audioContext:', !!audioContext, 'finalText:', JSON.stringify(finalText), 'interimText:', JSON.stringify(interimText), 'hasAudioActivity:', hasAudioActivity)
    if (!ws && !audioContext) {
      finish(finalText.trim())
      return
    }

    stopping = true
    responseDone = false
    transcriptionDone = false
    // 停止时已不需要音频活跃检测
    if (audioActivityTimer) { clearTimeout(audioActivityTimer); audioActivityTimer = null }

    // 等待 worklet flush 完毕后再断开并发送 commit
    let committed = false
    const commitAndRequest = () => {
      if (committed) return
      committed = true
      console.log('[ASR] commitAndRequest, pcmChunks remaining:', pcmChunks.length, 'finalText:', JSON.stringify(finalText), 'interimText:', JSON.stringify(interimText))
      if (processor) { processor.disconnect(); processor.onaudioprocess = null; processor = null }
      if (sourceNode) { sourceNode.disconnect(); sourceNode = null }
      if (sendTimer) { clearInterval(sendTimer); sendTimer = null }

      // 发送最后一批残留音频
      if (ws?.readyState === WebSocket.OPEN && sessionReady) {
        const merged = mergePcm(pcmChunks)
        pcmChunks = []
        if (merged.length > 0) sendAudioChunk(merged)
        ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
        ws.send(JSON.stringify({ type: 'response.create' }))
      }

      // 超时兜底：5秒后若两个完成信号未全部到达，强制结束（利用 interimText 防止空结果）
      fallbackTimer = window.setTimeout(() => {
        if (stopping) {
          console.log('[ASR] fallbackTimer fired, finalText:', JSON.stringify(finalText), 'interimText:', JSON.stringify(interimText))
          finish((finalText || interimText).trim())
        }
      }, 5000)
    }

    if (workletNode) {
      // 保存原 onmessage，等待 flushed 事件后再断开
      const origHandler = workletNode.port.onmessage
      workletNode.port.onmessage = (e: MessageEvent) => {
        // 继续收集 flush 期间产生的 PCM 数据
        if (e.data.type === 'pcm' && status.value === 'listening') {
          pcmChunks.push(e.data.data)
        }
        if (e.data.type === 'flushed') {
          console.log('[ASR] worklet flushed received')
          workletNode!.port.onmessage = origHandler
          try { workletNode!.disconnect() } catch {}
          workletNode = null
          commitAndRequest()
        }
      }
      workletNode.port.postMessage({ type: 'stop' })
      // 安全兜底：如果 worklet 在 200ms 内没有回复 flushed，强制继续
      setTimeout(() => {
        if (workletNode) {
          console.log('[ASR] worklet flush TIMEOUT, forcing disconnect')
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
