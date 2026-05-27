// 测试百炼 TTS WebSocket 连接 - 尝试不同端点和协议
import WebSocket from 'ws'
import { readFileSync } from 'fs'

const envContent = readFileSync('.env.local', 'utf8')
const apiKeyMatch = envContent.match(/VITE_LLM_API_KEY=(.+)/)
const apiKey = apiKeyMatch?.[1]?.trim()

// ── 测试 1：/api-ws/v1/realtime 带 model 参数 ──
console.log('=== 测试 1: /api-ws/v1/realtime (带 model query) ===')
const ws1 = new WebSocket(`wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime`, {
  headers: { 'Authorization': `Bearer ${apiKey}` },
})
ws1.on('open', () => {
  console.log('✅ 连接成功！发送 session.update...')
  ws1.send(JSON.stringify({
    type: 'session.update',
    session: {
      model: 'qwen3-tts-flash-realtime',
      voice: 'Cherry',
      output_audio_format: 'pcm',
    },
  }))
  ws1.send(JSON.stringify({ type: 'input_text_buffer.append', text: '你好测试' }))
  ws1.send(JSON.stringify({ type: 'input_text_buffer.commit' }))
  ws1.send(JSON.stringify({ type: 'response.create' }))
})
ws1.on('message', (data) => {
  try {
    const event = JSON.parse(data.toString())
    if (event.type === 'response.audio.delta') {
      const audioData = event.delta || event.audio || event.data
      console.log(`  🎵 音频帧: 数据长度=${audioData?.length || 0}`)
    } else {
      console.log(`  📩 ${event.type}`, JSON.stringify(event).substring(0, 200))
    }
  } catch { /* */ }
})
ws1.on('error', (err) => console.log('  ❌ 错误:', err.message))
ws1.on('close', (code, reason) => {
  console.log(`  🔒 关闭: code=${code}, reason=${reason?.toString() || ''}`)
  // 测试完后退出
  setTimeout(() => process.exit(0), 500)
})

setTimeout(() => { console.log('⏱️ 超时'); process.exit(1) }, 15000)
