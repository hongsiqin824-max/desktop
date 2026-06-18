// 认证相关 API：验证码获取、登录、问卷模型查询
// Cookie 管理策略：
//   - 浏览器开发模式：Vite 代理透传 Set-Cookie，浏览器自动管理
//   - Tauri 模式：Rust 代理内部维护 JSESSIONID，前端无需手动携带

import { PROXY_HTTP_BASE, isTauri } from '@/config/proxy'

const API_BASE = isTauri ? PROXY_HTTP_BASE : ''

// ── 统一认证请求封装 ────────────────────────────────────
// 浏览器模式：credentials='same-origin' 让浏览器自动带 Cookie
// Tauri 模式：Rust 代理自动注入 Cookie，前端不需要手动处理
// 如果响应 401/403，清除登录状态并跳转登录页

export async function authFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: isTauri ? 'omit' : 'same-origin',
  })

  // 检测未认证（Cookie 过期），由调用方处理跳转
  if (res.status === 401 || res.status === 403) {
    // 动态导入避免循环依赖
    const { useSessionStore } = await import('@/stores/global/session')
    const sessionStore = useSessionStore()
    sessionStore.clearSession()
    // 使用 window.location 跳转到登录页（避免在非组件上下文中使用 router）
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  }

  return res
}

// ── 获取验证码图片 ──────────────────────────────────────
// GET /verifyCode
// 后端返回图片二进制流，转为 Blob URL 供 <img> 标签展示
// 注意：调用方在不再需要时应 revokeObjectURL 释放内存

export async function fetchVerifyCode(): Promise<string> {
  const res = await fetch(`${API_BASE}/verifyCode`, {
    credentials: isTauri ? 'omit' : 'same-origin',
  })

  if (!res.ok) {
    throw new Error(`获取验证码失败: HTTP ${res.status}`)
  }

  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

// ── 登录并获取 Cookie ───────────────────────────────────
// POST /doLogin
// Content-Type: application/x-www-form-urlencoded
// 后端验证 username + password + code（验证码）
// Tauri 模式：响应体中包含 jsessionId 字段（Rust 代理注入）

export interface LoginResponse {
  status: number
  msg: string
  /** Tauri 模式下 Rust 代理注入的 JSESSIONID */
  jsessionId?: string
  [key: string]: unknown
}

export async function doLogin(
  username: string,
  password: string,
  code: string,
): Promise<LoginResponse> {
  const body = new URLSearchParams({
    username,
    password,
    code,
  })

  const res = await fetch(`${API_BASE}/doLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    credentials: isTauri ? 'omit' : 'same-origin',
  })

  if (!res.ok) {
    throw new Error(`登录请求失败: HTTP ${res.status}`)
  }

  const data: LoginResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(data.msg || '登录失败')
  }

  return data
}

// ── 获取业务类型列表 ────────────────────────────────────
// GET /questionModel/basic/getDistinctBizTypes
// 返回：{ status: 200, msg: "", obj: ["必问", "数字人", "问卷"] }

export interface BizTypesResponse {
  status: number
  msg: string
  obj: string[]
}

export async function fetchBizTypes(): Promise<string[]> {
  const res = await authFetch(
    `${API_BASE}/questionModel/basic/getDistinctBizTypes`,
  )

  if (!res.ok) {
    throw new Error(`获取业务类型失败: HTTP ${res.status}`)
  }

  const data: BizTypesResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(data.msg || '获取业务类型失败')
  }

  return data.obj
}

// ── 根据类型获取问卷模型列表 ────────────────────────────
// GET /questionModel/basic/getQuestionModels?page=1&size=100&kqmBizType=数字人
// 返回：{ total: number, data: QuestionModel[] }

export interface QuestionModel {
  kqmId: string
  kqmName: string
  kqmIsEnable: string
  kqmEcharType: string | null
  copyFromQmId: string | null
  kqmInvisible: string
  kqmCostNumEnable: string
  kqmNameBianshi: string
  kqmNameRemark: string
  kqmResName: string
  kqmResRemark: string
  kqmCrowd: string
  kqmBizType: string
}

export interface QuestionModelsResponse {
  total: number
  data: QuestionModel[]
}

export async function fetchQuestionModels(
  bizType: string,
  page: number = 1,
  size: number = 100,
): Promise<QuestionModelsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
    kqmBizType: bizType,
  })

  const res = await authFetch(
    `${API_BASE}/questionModel/basic/getQuestionModels?${params.toString()}`,
  )

  if (!res.ok) {
    throw new Error(`获取问卷模型失败: HTTP ${res.status}`)
  }

  const data: QuestionModelsResponse = await res.json()
  return data
}
