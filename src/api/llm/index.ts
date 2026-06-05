// 大模型接口客户端（兼容通用协议）

import type { ILlmRequestMessage, ILlmCallOptions } from '@/types/llm'
import { PROXY_HTTP_BASE } from '@/config/proxy'

// 运行时判断：Tauri 走 Rust 代理，浏览器走 Vite proxy
const isTauri = typeof window !== 'undefined' && !!window.__TAURI__
const DEFAULT_BASE_URL = isTauri ? `${PROXY_HTTP_BASE}/llm-proxy` : '/llm-proxy'
// 默认模型：qwen3.7-max（阿里云百炼平台）
// 如需切换模型，请修改 .env.local 中的 VITE_LLM_MODEL
const DEFAULT_MODEL = 'qwen3.7-max'

export async function fetchLLMCompletion(
  messages: ILlmRequestMessage[],
  options?: ILlmCallOptions,
): Promise<string> {
  const baseUrl = options?.baseUrl
    || import.meta.env.VITE_LLM_BASE_URL
    || DEFAULT_BASE_URL

  const model = options?.model
    || import.meta.env.VITE_LLM_MODEL
    || DEFAULT_MODEL

  const url = `${baseUrl}/chat/completions`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.1,
      max_tokens: options?.maxTokens ?? 256,
      enable_thinking: options?.enableThinking ?? false,
    }),
    signal: options?.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM API 错误 (${res.status}): ${text}`)
  }

  const data = await res.json()

  const content: string | undefined = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM 返回内容为空')
  }

  return content.trim()
}
