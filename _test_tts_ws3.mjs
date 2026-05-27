// 测试 TTS WebSocket - 不需要 response.create
import WebSocket from 'ws'
import { readFileSync } from 'fs'

const envContent = readFileSync('.env.local', 'utf8')
const apiKeyMatch = envContent.match(/VITE_LLM_API_KEY=(.+)/)
const apiKey = apiKeyMatch?.[1]?.trim()

const ws = new WebSocket(`wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime`, {
  headers: { 'Authorization': `Bearer ${apiKey}` },
})

ws.on('open', () => {
  console.log('✅ 连接成功！')
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      model: 'qwen3-tts-flash-realtime',
      voice: 'Cherry',
      output_audio_format: 'pcm',
    },
  }))
  ws.send(JSON.stringify({ type: 'input_text_buffer.append', text: '你好，这是一段测试语音。' }))
  ws.send(JSON.stringify({ type: 'input_text_buffer.commit' }))
  // 不发 response.create，看看是否自动生成
})

ws.on('message', (data) => {
  try {
    const event = JSON.parse(data.toString())
    if (event.type === 'response.audio.delta') {
      const audioData = event.delta || event.audio || event.data
      console.log(`🎵 音频帧: 长度=${audioData?.length || 0}`)
    } else if (event.type === 'response.done' || event.type === 'response.audio.done') {
      console.log(`✅ ${event.type}`)
    } else {
      console.log(`📩 ${event.type}: ${JSON.stringify(event).substring(0, 150)}`)
    }
  } catch { /* */ }
})

ws.on('error', (err) => console.log('❌', err.message))
ws.on('close', (code, reason) => {
  console.log(`🔒 关闭: code=${code}, reason=${reason?.toString() || ''}`)
  process.exit(0)
})

setTimeout(() => { console.log('⏱️ 超时'); process.exit(1) }, 15000)
