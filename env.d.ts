/// <reference types="vite/client" />

// Tauri 运行时注入的全局变量，用于判断是否在 Tauri 环境中
interface Window {
  __TAURI__?: Record<string, unknown>
}

interface ImportMetaEnv {
  readonly VITE_LLM_BASE_URL: string
  readonly VITE_LLM_API_KEY: string
  readonly VITE_LLM_MODEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
