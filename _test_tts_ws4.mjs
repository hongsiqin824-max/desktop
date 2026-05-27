import WebSocket from 'ws'
import { readFileSync } from 'fs'

const envContent = readFileSync('.env.local', 'utf8')
const apiKey = envContent.match(/VITE_LLM_API_KEY=(.+)/)?.[1]?.trim()

const ws = new WebSocket(`wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime`, {
  headers: { 'Authorization': `Bearer ${apiKey}` },
})

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'session.update',
    session: { model: 'qwen3-tts-flash-realtime', voice: 'Cherry', output_audio_format: 'pcm' },
  }))
  ws.send(JSON.stringify({ type: 'input_text_buffer.append', text: '测试' }))
  ws.send(JSON.stringify({ type: 'input_text_buffer.commit' }))
})

ws.on('message', (data) => {
  try {
    const event = JSON.parse(data.toString())
    if (event.type === 'session.updated') {
      // 打印完整 session 信息（含采样率）
      console.log(JSON.stringify(event.session, null, 2))
    } else if (event.type === 'response.audio.delta') {
      const b64 = event.delta || ''
      const rawBytes = Buffer.from(b64, 'base64')
      console.log(`音频帧: base64长度=${b64.length}, 解码后字节数=${rawBytes.length}, 16位样本数=${rawBytes.length / 2}`)
    } else if (event.type === 'response.done') {
      console.log('完成')
      ws.close()
    }
  } catch { /* */ }
})

ws.on('close', () => process.exit(0))
setTimeout(() => process.exit(1), 15000)
