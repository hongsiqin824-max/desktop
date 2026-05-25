import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { templateCompilerOptions } from '@tresjs/core'

export default defineConfig({
  plugins: [
    vue(templateCompilerOptions),
    vueDevTools(),
    basicSsl(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    host: true,
    proxy: {
      '/llm-proxy': {
        target: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm-proxy/, ''),
      },
      '/tts-proxy': {
        target: 'http://localhost:8766',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tts-proxy/, ''),
      },
      '/asr-proxy': {
        target: 'ws://localhost:8765',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
