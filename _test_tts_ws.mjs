// 直接测试百炼 TTS WebSocket 连接
import WebSocket from 'ws'
import { readFileSync } from 'fs'

// 读取 API Key
const envContent = readFileSync('.env.local', 'utf8')
const apiKeyMatch = envContent.match(/VITE_LLM_API_KEY=(.+)/)
const apiKey = apiKeyMatch?.[1]?.trim()
console.log('API Key:', apiKey?.substring(0, 10) + '...')

const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/realtime', {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
  },
})

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功！')

  // 发送 session.update
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      model: 'qwen3-tts-flash-realtime',
      voice: 'Cherry',
      output_audio_format: 'pcm',
    },
  }))

  // 发送文本
  ws.send(JSON.stringify({
    type: 'input_text_buffer.append',
    text: '你好，这是一段测试语音。',
  }))

  // 提交
  ws.send(JSON.stringify({ type: 'input_text_buffer.commit' }))

  // 触发合成
  ws.send(JSON.stringify({ type: 'response.create' }))
})

ws.on('message', (data) => {
  try {
    const event = JSON.parse(data.toString())
    if (event.type === 'response.audio.delta') {
      const audioData = event.delta || event.audio || event.data
      console.log(`收到音频帧: ${event.type}, 数据长度=${audioData?.length || 0}`)
    } else {
      console.log(`事件: ${event.type}`, JSON.stringify(event).substring(0, 200))
    }
  } catch {
    console.log('非JSON消息:', data.toString().substring(0, 100))
  }
})

ws.on('error', (err) => {
  console.error('❌ WebSocket 错误:', err.message)
})

ws.on('close', (code, reason) => {
  console.log(`连接关闭: code=${code}, reason=${reason?.toString() || ''}`)
  process.exit(0)
})

// 10秒超时
setTimeout(() => {
  console.log('⏱️ 超时，关闭连接')
  ws.close()
}, 10000)
