// 第三方舌象 AI 分析 API（脉至语 aitongue.maizhiyu.com）
// 文档参考：相关文件/舌诊API接入文档.xlsx
//
// 流程（版本2 - 无答题版本）：
//   第一步：uploadImage → 上传舌头照片 → 获取图片 URL
//   第二步：getReport   → 提交图片 URL + 用户信息 → 获取 AI 分析结果
//
// 代理策略（解决跨域）：
//   - 浏览器开发模式：Vite 代理 /tongue-ai → https://aitongue.maizhiyu.com/api/app
//   - Tauri 模式：Rust 代理 /tongue-ai → 同上（待实现）
//   - 两种模式都通过 /tongue-ai 前缀调用，代码无需区分

import { PROXY_HTTP_BASE, isTauri } from '@/config/proxy'
import type { ITongueUploadResponse, ITongueReportResponse } from '@/types/consultation'

// ── 配置常量 ────────────────────────────────────────────────────

/** 第三方服务分配的 appId */
const TONGUE_AI_APP_ID = 'fzqVgqNPm6DbFWYXV00eA8'

/** 请求基础路径（两种模式都走代理） */
const TONGUE_AI_BASE = isTauri ? `${PROXY_HTTP_BASE}/tongue-ai` : '/tongue-ai'

// ── 生成时间戳（毫秒级） ──────────────────────────────────────────

function getTimestamp(): string {
  return String(Date.now())  // 毫秒级时间戳
}

// ── 上传图片 ────────────────────────────────────────────────────
// POST /tongue-ai/uploadImage
// Content-Type: multipart/form-data
// 请求头：appId, timestamp（作为表单字段或请求头）
// 请求体：file (图片文件)
// 返回：{ code: 0, data: "图片URL", msg: "" }

/**
 * 上传舌头照片到第三方服务
 * @param file 图片文件（来自摄像头/手柄/本地选择）
 * @returns 上传后的图片 URL
 */
export async function uploadTongueImage(file: File | Blob): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  // appId 和 timestamp 需要放在 HTTP headers 中（不是 FormData）

  const res = await fetch(`${TONGUE_AI_BASE}/uploadImage`, {
    method: 'POST',
    headers: {
      'appId': TONGUE_AI_APP_ID,
      'timestamp': getTimestamp(),
    },
    body: formData,
    // 不手动设置 Content-Type，浏览器会自动添加 multipart/form-data + boundary
  })

  if (!res.ok) {
    throw new Error(`舌象图片上传失败: HTTP ${res.status}`)
  }

  const data: ITongueUploadResponse = await res.json()

  if (data.code !== 0) {
    throw new Error(`舌象图片上传失败: ${data.msg || '未知错误'}`)
  }

  if (!data.data) {
    throw new Error('舌象图片上传成功但未返回图片URL')
  }

  if (import.meta.env.DEV) {
    console.log('[舌象AI] 图片上传成功:', data.data)
  }

  return data.data
}

// ── 获取舌象分析报告（版本2：无答题） ──────────────────────────────
// POST /tongue-ai/getReport
// Content-Type: application/json
// 请求头：appId, timestamp
// 请求体：{ age, uurl, phone, sex, name? }
// 返回：{ code: 0, data: { shese, shexing, taise, taixing, tizhi, ... } }

interface GetReportParams {
  age: number
  phone: string
  sex: 0 | 1        // 0=女 1=男
  uurl: string       // 舌头正面图片 URL（来自 uploadImage 返回值）
  name?: string
  idcard?: string
}

/**
 * 调用第三方 AI 分析舌象图片（版本2：直接返回结果，无需答题）
 * @param params 用户信息 + 图片URL
 * @returns AI 分析结果（舌色、舌型、苔色、苔型、体质）
 */
export async function getTongueReport(params: GetReportParams): Promise<ITongueReportResponse['data']> {
  const res = await fetch(`${TONGUE_AI_BASE}/getReport`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'appId': TONGUE_AI_APP_ID,
      'timestamp': getTimestamp(),
    },
    body: JSON.stringify({
      age: params.age,
      uurl: params.uurl,
      phone: params.phone,
      sex: params.sex,
      name: params.name || '',
      idcard: params.idcard || '',
    }),
  })

  if (!res.ok) {
    throw new Error(`舌象AI分析失败: HTTP ${res.status}`)
  }

  const data: ITongueReportResponse = await res.json()

  if (data.code !== 0) {
    throw new Error(`舌象AI分析失败: ${data.msg || '未知错误'}`)
  }

  if (import.meta.env.DEV) {
    console.log('[舌象AI] 分析结果:', {
      舌色: data.data.shese,
      舌型: data.data.shexing,
      苔色: data.data.taise,
      苔型: data.data.taixing,
      体质: data.data.tizhi,
    })
  }

  return data.data
}

// ── 组合调用：上传 + 分析 ──────────────────────────────────────
// 封装完整的舌象分析流程，调用方只需传入图片和用户信息

interface AnalyzeTongueParams {
  imageFile: File | Blob
  age: number
  phone: string
  sex: 0 | 1
  name?: string
}

/**
 * 完整舌象分析流程：上传图片 → AI 分析 → 返回结果
 * @param params 图片文件 + 用户基本信息
 * @returns AI 分析结果
 */
export async function analyzeTongue(params: AnalyzeTongueParams): Promise<ITongueReportResponse['data']> {
  // 第一步：上传图片
  const imageUrl = await uploadTongueImage(params.imageFile)

  // 第二步：AI 分析
  const report = await getTongueReport({
    age: params.age,
    phone: params.phone,
    sex: params.sex,
    uurl: imageUrl,
    name: params.name,
  })

  return report
}
