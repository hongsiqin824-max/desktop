// 问诊数据提交接口：将 IBackendPayload 发送给 Rust 代理，获取辨证结果
import type { ISyndromeOutput } from '@/types/consultation'
import type { IBackendPayload } from '@/stores/consultation'
import { PROXY_HTTP_BASE, isTauri } from '@/config/proxy'

interface ConsultationResponse {
  success: boolean
  syndrome: ISyndromeOutput | null
}

/**
 * 提交问诊数据到后端，获取辨证结果
 * - Tauri 模式：通过 Rust 代理 (localhost:1420) 转发
 * - 浏览器模式：通过 Vite proxy 转发
 * - 失败时返回 null，前端降级使用 mock 数据
 */
export async function submitConsultation(
  payload: IBackendPayload,
): Promise<ISyndromeOutput | null> {
  const baseUrl = isTauri ? PROXY_HTTP_BASE : ''

  const res = await fetch(`${baseUrl}/consultation/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(`问诊提交失败: ${res.status}`)
  }

  const data: ConsultationResponse = await res.json()

  if (!data.success) {
    throw new Error('辨证后台返回失败')
  }

  // syndrome 为 null 时前端降级使用 mock 数据
  return data.syndrome
}
