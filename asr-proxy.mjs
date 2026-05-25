// 阿里云百炼实时语音识别WebSocket代理服务器
// 浏览器无法设置WebSocket自定义HTTP头，因此需要在代理层注入Authorization
// 浏览器 → 本代理(ws://localhost:8765) → DashScope(wss://dashscope.aliyuncs.com)
// 关键：ws库服务端所有消息都收为Buffer，必须用isBinary标志区分文本/二进制帧

import { WebSocket, WebSocketServer } from 'ws'

const DASHSCOPE_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-omni-plus-realtime'
const API_KEY = 'sk-REDACTED-REMOVED-FOR-SECURITY'
const PROXY_PORT = 8765

const wss = new WebSocketServer({ port: PROXY_PORT })

const logMsg = (label, raw, isBinary) => {
  if (!isBinary) {
    const text = typeof raw === 'string' ? raw : raw.toString('utf8')
    console.log(`[${label}] 文本帧 ${text.slice(0, 120)}`)
  } else {
    const len = typeof raw === 'string' ? raw.length : raw.length
    console.log(`[${label}] 二进制帧 ${len}字节`)
  }
}

const sendToDash = (dashWs, raw, isBinary) => {
  if (!isBinary) {
    dashWs.send(typeof raw === 'string' ? raw : raw.toString('utf8'))
  } else {
    dashWs.send(raw)
  }
}

const sendToClient = (clientWs, raw, isBinary) => {
  if (!isBinary) {
    clientWs.send(typeof raw === 'string' ? raw : raw.toString('utf8'))
  } else {
    clientWs.send(raw)
  }
}

wss.on('connection', (clientWs, req) => {
  const clientIp = req.socket.remoteAddress
  console.log(`[连接] 浏览器客户端 ${clientIp} 已接入`)

  const pendingMessages = []
  let dashReady = false

  const dashWs = new WebSocket(DASHSCOPE_WS_URL, {
    headers: {
      Authorization: `bearer ${API_KEY}`,
    },
  })

  dashWs.on('open', () => {
    console.log('[连接] DashScope WebSocket 已建立')
    dashReady = true

    for (const { data, isBinary } of pendingMessages) {
      if (dashWs.readyState === WebSocket.OPEN) {
        sendToDash(dashWs, data, isBinary)
        logMsg('缓冲发送→DashScope', data, isBinary)
      }
    }
    pendingMessages.length = 0
  })

  dashWs.on('message', (raw, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      sendToClient(clientWs, raw, isBinary)
      logMsg('接收←DashScope', raw, isBinary)
    }
  })

  dashWs.on('close', (code, reason) => {
    console.log(`[断开] DashScope连接关闭 code=${code} reason=${reason}`)
    clientWs.close(code, reason.toString())
  })

  dashWs.on('error', (err) => {
    console.error(`[错误] DashScope连接失败: ${err.message}`)
    clientWs.close(1011, err.message)
  })

  clientWs.on('message', (raw, isBinary) => {
    logMsg('浏览器→代理', raw, isBinary)
    if (dashReady && dashWs.readyState === WebSocket.OPEN) {
      sendToDash(dashWs, raw, isBinary)
      logMsg('直接→DashScope', raw, isBinary)
    } else {
      pendingMessages.push({ data: raw, isBinary })
      console.log(`[缓冲] DashScope未就绪，缓冲第${pendingMessages.length}条`)
    }
  })

  clientWs.on('close', () => {
    console.log(`[断开] 浏览器客户端 ${clientIp} 已断开`)
    if (dashWs.readyState === WebSocket.OPEN || dashWs.readyState === WebSocket.CONNECTING) {
      dashWs.close()
    }
  })

  clientWs.on('error', (err) => {
    console.error(`[错误] 浏览器客户端异常: ${err.message}`)
    dashWs.close()
  })
})

wss.on('error', (err) => {
  console.error(`[错误] 代理服务器异常: ${err.message}`)
})

console.log(`百炼ASR WebSocket代理已启动 → ws://localhost:${PROXY_PORT}`)
console.log(`使用方式: npm run dev:all  (同时启动Vite+代理)`)