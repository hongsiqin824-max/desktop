// 问诊相关后端接口：创建会话 + 提交问诊数据
import type { ISyndromeOutput } from '@/types/consultation'
import type { IUserInfo } from '@/types/user'
import type { IBackendPayload } from '@/stores/consultation'
import { PROXY_HTTP_BASE, isTauri } from '@/config/proxy'

// ── 后端业务接口基础地址 ──────────────────────────────────
// 浏览器模式走 Vite 代理（空字符串 = 当前域名），Tauri 模式走 Rust 代理
const BIZ_API_BASE = isTauri ? PROXY_HTTP_BASE : ''

// ── 创建问诊会话 ──────────────────────────────────────────

/** createSession 请求体（后端字段格式） */
interface CreateSessionRequest {
  name: string
  sex: string          // "1"=男 "0"=女
  age: string          // 字符串
  height: string       // 字符串
  weight: string       // 字符串
  phone: string
  tenantId: string     // 默认 "001"
  questionModel: string // 默认 "1"，后续确认主症后更新为对应编号
}

/** createSession 响应体 */
interface CreateSessionResponse {
  status: number
  msg: string
  obj: {
    answerSheetId: string
    cusId: string
    isNewCustomer: boolean
  }
}

/** createSession 返回值（精简后供 Store 使用） */
export interface ISessionData {
  cusId: string
  answerSheetId: string
  isNewCustomer: boolean
}

/**
 * 创建问诊会话（提交用户信息，识别新老用户）
 * - 后端根据手机号查找/创建客户记录
 * - 新增一条问卷记录，返回 cusId + answerSheetId
 * - 失败时抛出异常，由调用方处理错误提示
 */
export async function createSession(
  userInfo: IUserInfo,
  questionModel: string = '1',
): Promise<ISessionData> {
  // 前端 IUserInfo → 后端请求体字段转换
  const body: CreateSessionRequest = {
    name: userInfo.name,
    sex: userInfo.gender === '男' ? '1' : '0',
    age: String(userInfo.age ?? ''),
    height: String(userInfo.height ?? ''),
    weight: String(userInfo.weight ?? ''),
    phone: userInfo.phone,
    tenantId: '001',
    questionModel,
  }

  const res = await fetch(`${BIZ_API_BASE}/mp/customer/newDigitalHumanSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`创建会话失败: HTTP ${res.status}`)
  }

  const data: CreateSessionResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(`创建会话失败: ${data.msg || '后端返回异常'}`)
  }

  return {
    cusId: data.obj.cusId,
    answerSheetId: data.obj.answerSheetId,
    isNewCustomer: data.obj.isNewCustomer,
  }
}

// ── 提交问诊数据 ──────────────────────────────────────────

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
