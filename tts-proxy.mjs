// 阿里云百炼 Qwen3-TTS-Instruct-Flash-Realtime 语音合成代理服务器
// 浏览器 → HTTP POST → 本代理 → DashScope WebSocket(Realtime JSON 事件协议) → PCM → WAV → 浏览器
// 护士：温柔女声  中医师：沉稳男声（通过 instructions 指令控制）

import { createServer } from 'http'
import { WebSocket } from 'ws'

const DASHSCOPE_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'
const API_KEY = 'sk-REDACTED-REMOVED-FOR-SECURITY'
const MODEL = 'qwen3-tts-instruct-flash-realtime'
const TTS_PORT = 8766
const SAMPLE_RATE = 24000

// ── 角色配置：通过 instructions 指令控制音色风格 ──
const PERSONA_CONFIG = {
  nurse: {
    voice: 'Cherry',
    instructions: '温柔亲切的年轻女性声音，语速适中，语调柔和甜美，像一位关心患者的护士在耐心说话。吐字清晰精准。',
  },
  doctor: {
    voice: 'Ethan',
    instructions: '请扮演一位八十岁高龄、德高望重的国医大师。要求：嗓音极度低沉浑厚，声线宽厚饱满带有胸腔共鸣感；语速极其平缓从容，每句话之间有自然停顿，绝不急促；吐字清晰稳重，咬字圆润有力；语气儒雅端庄、温和慈悲，自带医者仁心的沉稳气场；语调平和舒缓如同古琴流水，整体气质庄重安详、德高望重。请用最慢的语速说话。',
  },
}

// ── WAV 头部生成（PCM 24000Hz 16bit Mono）──
const createWavHeader = (dataLength) => {
  const buffer = Buffer.alloc(44)
  const channels = 1
  const bitsPerSample = 16
  const byteRate = SAMPLE_RATE * channels * bitsPerSample / 8
  const blockAlign = channels * bitsPerSample / 8

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)           // fmt chunk size
  buffer.writeUInt16LE(1, 20)            // PCM format
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  return buffer
}

// ── 单次合成：WebSocket 连接 → 发送文本 → 收集 PCM → 返回 WAV ──
const synthesize = (text, persona) => {
  return new Promise((resolve, reject) => {
    const config = PERSONA_CONFIG[persona] ?? PERSONA_CONFIG.nurse
    const audioChunks = []
    let timeoutId = null

    const wsUrl = `${DASHSCOPE_WS_URL}?model=${MODEL}`
    const ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
    })

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      try { ws.close() } catch {}
    }

    // 超时保护：60秒（整段文本合成需要更长时间）
    timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error('TTS 合成超时（60s）'))
    }, 60000)

    ws.on('open', () => {
      // 1. 配置会话
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          mode: 'commit',
          voice: config.voice,
          language_type: 'Auto',
          response_format: 'pcm',
          sample_rate: SAMPLE_RATE,
          instructions: config.instructions,
          optimize_instructions: true,
        },
      }))
    })

    ws.on('message', (raw) => {
      let event
      try {
        event = JSON.parse(raw.toString())
      } catch {
        return
      }

      switch (event.type) {
        case 'session.created':
          // 会话就绪，发送文本
          ws.send(JSON.stringify({
            type: 'input_text_buffer.append',
            text,
          }))
          // 提交文本触发合成
          ws.send(JSON.stringify({
            type: 'input_text_buffer.commit',
          }))
          break

        case 'response.audio.delta':
          // 收集 Base64 PCM 音频块
          audioChunks.push(Buffer.from(event.delta, 'base64'))
          break

        case 'response.audio.done':
          // 音频生成完毕，发送结束信号
          ws.send(JSON.stringify({ type: 'session.finish' }))
          break

        case 'session.finished': {
          // 会话结束，组装 WAV
          clearTimeout(timeoutId)
          const pcmBuffer = Buffer.concat(audioChunks)
          const wavHeader = createWavHeader(pcmBuffer.length)
          const wavBuffer = Buffer.concat([wavHeader, pcmBuffer])
          cleanup()
          resolve(wavBuffer)
          break
        }

        case 'error':
          clearTimeout(timeoutId)
          cleanup()
          reject(new Error(event.error?.message || 'TTS 合成错误'))
          break
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timeoutId)
      cleanup()
      reject(err)
    })

    ws.on('close', () => {
      // 如果还没 resolve 且有数据，兜底返回
      if (audioChunks.length > 0) {
        clearTimeout(timeoutId)
        const pcmBuffer = Buffer.concat(audioChunks)
        const wavHeader = createWavHeader(pcmBuffer.length)
        const wavBuffer = Buffer.concat([wavHeader, pcmBuffer])
        resolve(wavBuffer)
      }
    })
  })
}

// ── HTTP 服务器 ──
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.method !== 'POST' || req.url !== '/tts') {
    res.writeHead(404)
    res.end()
    return
  }

  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', async () => {
    try {
      const { text, persona = 'nurse' } = JSON.parse(body)
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '缺少text参数' }))
        return
      }

      const wavBuffer = await synthesize(text, persona)
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': wavBuffer.length,
      })
      res.end(wavBuffer)
      console.log(`[TTS合成/${persona}] "${text.slice(0, 30)}" → ${wavBuffer.length}字节`)
    } catch (err) {
      console.error(`[TTS错误]`, err.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `语音合成失败: ${err.message}` }))
    }
  })
}).listen(TTS_PORT, () => {
  console.log(`百炼TTS代理已启动 → http://localhost:${TTS_PORT}/tts`)
  console.log(`模型: ${MODEL}`)
  console.log('POST JSON {"text":"xxx", "persona":"nurse|doctor"} → 返回WAV音频')
})
