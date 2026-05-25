// 大模型接口客户端（兼容通用协议）

import type { ILlmRequestMessage, ILlmCallOptions } from '@/types/llm'

const DEFAULT_BASE_URL = '/llm-proxy'
const DEFAULT_MODEL = 'deepseek-chat'

export async function callLLM(
  messages: ILlmRequestMessage[],
  options?: ILlmCallOptions,
): Promise<string> {
  const baseUrl = options?.baseUrl
    || import.meta.env.VITE_LLM_BASE_URL
    || DEFAULT_BASE_URL
  const apiKey = options?.apiKey
    || import.meta.env.VITE_LLM_API_KEY
    || ''

  const model = options?.model
    || import.meta.env.VITE_LLM_MODEL
    || DEFAULT_MODEL

  if (!apiKey) {
    throw new Error('LLM API Key 未配置，请在 .env.local 中设置 VITE_LLM_API_KEY')
  }

  const url = `${baseUrl}/chat/completions`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.1,
      max_tokens: options?.maxTokens ?? 256,
    }),
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