import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { templateCompilerOptions } from '@tresjs/core'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const isTauri = !!process.env.TAURI_DEV

  return {
    plugins: [
      vue(templateCompilerOptions),
      vueDevTools(),
      ...isTauri ? [] : [basicSsl()],
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      host: true,
      strictPort: true,
      proxy: {
        '/llm-proxy': {
          target: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/llm-proxy/, ''),
          configure: (proxy) => {
            const apiKey = env.VITE_LLM_API_KEY
            proxy.on('proxyReq', (proxyReq) => {
              if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
            })
          },
        },
        '/tts-proxy': {
          target: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => {
            const stripped = path.replace(/^\/tts-proxy/, '')
            const separator = stripped.includes('?') ? '&' : '?'
            return `${stripped}${separator}model=qwen3-tts-flash-realtime`
          },
          configure: (proxy) => {
            const apiKey = env.VITE_LLM_API_KEY
            proxy.on('proxyReqWs', (proxyReq) => {
              if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
            })
          },
        },
        '/tts-vc-proxy': {
          target: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => {
            const stripped = path.replace(/^\/tts-vc-proxy/, '')
            const separator = stripped.includes('?') ? '&' : '?'
            return `${stripped}${separator}model=qwen3-tts-vc-realtime-2026-01-15`
          },
          configure: (proxy) => {
            const apiKey = env.VITE_LLM_API_KEY
            proxy.on('proxyReqWs', (proxyReq) => {
              if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
            })
          },
        },
        '/asr-proxy': {
          target: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => {
            const stripped = path.replace(/^\/asr-proxy/, '')
            const separator = stripped.includes('?') ? '&' : '?'
            return `${stripped}${separator}model=qwen3.5-omni-plus-realtime`
          },
          configure: (proxy) => {
            const apiKey = env.VITE_LLM_API_KEY
            proxy.on('proxyReqWs', (proxyReq) => {
              if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
            })
          },
        },
      },
    },
  }
})
