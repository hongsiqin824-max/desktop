// 舌脉问题 & 答案保存 API：对接后端的舌脉问题获取和答案提交
//
// 两个接口：
//   1. GET  /mp/customer/getDigitalHumanQuestionsByModel → 获取舌脉问题列表
//   2. POST /mp/customer/saveDigitalHumanTonguePulseAnswers → 保存舌脉答案
//
// 代理策略：
//   - 浏览器开发模式：Vite 代理 /mp → http://39.106.163.181:8092
//   - Tauri 模式：Rust 代理 /mp → 同上（带 JSESSIONID Cookie）

import { PROXY_HTTP_BASE, isTauri } from '@/config/proxy'
import { authFetch } from '@/api/auth'
import type {
  ITonguePulseQuestionsResponse,
  ITonguePulseSaveRequest,
  ITonguePulseSaveResponse,
} from '@/types/consultation'

const BIZ_API_BASE = isTauri ? PROXY_HTTP_BASE : ''

// ── 获取舌脉问题列表 ──────────────────────────────────────────────
// GET /mp/customer/getDigitalHumanQuestionsByModel?answerSheetId=xxx&kqmId=xxx
// 需要 Cookie（JSESSIONID）
// 返回：tongueQuestions[] + pulseQuestions[]

/**
 * 获取指定辨证模型下的舌脉问题列表
 * @param answerSheetId 答题纸 ID（createSession 返回）
 * @param kqmId 辨证模型 ID（如 "588282635315314688"）
 * @returns 舌诊问题 + 脉诊问题（含完整选项树）
 */
export async function fetchTonguePulseQuestions(
  answerSheetId: string,
  kqmId: string,
): Promise<ITonguePulseQuestionsResponse['obj']> {
  const params = new URLSearchParams({
    answerSheetId,
    kqmId,
  })

  const res = await authFetch(
    `${BIZ_API_BASE}/mp/customer/getDigitalHumanQuestionsByModel?${params.toString()}`,
  )

  if (!res.ok) {
    throw new Error(`获取舌脉问题失败: HTTP ${res.status}`)
  }

  const data: ITonguePulseQuestionsResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(`获取舌脉问题失败: ${data.msg || '后端返回异常'}`)
  }

  if (import.meta.env.DEV) {
    const obj = data.obj
    console.log('[舌脉问题] 获取成功:', {
      answerSheetId: obj.answerSheetId,
      kqmId: obj.kqmId,
      舌诊问题数: obj.tongueQuestions.length,
      脉诊问题数: obj.pulseQuestions.length,
    })
    for (const q of obj.tongueQuestions) {
      console.log(`  舌诊: ${q.kqiName} (${q.kqiCode}) → ${q.kytOptions.length}个选项`)
      // 打印每个选项的名称，方便调试匹配问题
      console.log(`    选项:`, q.kytOptions.map(o => `${o.koiOption}(${o.koiOptionCode})`).join(', '))
    }
    for (const q of obj.pulseQuestions) {
      console.log(`  脉诊: ${q.kqiName} (${q.kqiCode}) → ${q.kytOptions.length}个选项`)
      console.log(`    选项:`, q.kytOptions.map(o => `${o.koiOption}(${o.koiOptionCode})`).join(', '))
    }
  }

  return data.obj
}

// ── 保存舌脉答案 ──────────────────────────────────────────────
// POST /mp/customer/saveDigitalHumanTonguePulseAnswers
// 需要 Cookie（JSESSIONID）
// 请求体：{ answerSheetId, kqmId, maibo, tongueQuestions, pulseQuestions }
// 返回：{ status: 200, obj: { answerCount, ... } }

/**
 * 保存用户选择的舌脉答案到后端
 * @param request 答案数据（包含每个选项的 koiIsChoose）
 * @returns 保存结果（含答案统计）
 */
export async function saveTonguePulseAnswers(
  request: ITonguePulseSaveRequest,
): Promise<ITonguePulseSaveResponse['obj']> {
  const res = await authFetch(
    `${BIZ_API_BASE}/mp/customer/saveDigitalHumanTonguePulseAnswers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  )

  if (!res.ok) {
    throw new Error(`保存舌脉答案失败: HTTP ${res.status}`)
  }

  const data: ITonguePulseSaveResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(`保存舌脉答案失败: ${data.msg || '后端返回异常'}`)
  }

  if (import.meta.env.DEV) {
    console.log('[舌脉答案] 保存成功:', {
      answerSheetId: data.obj.answerSheetId,
      答案总数: data.obj.answerCount,
      舌诊问题数: data.obj.tongueQuestionCount,
      脉诊问题数: data.obj.pulseQuestionCount,
      脉搏: data.obj.maibo,
    })
  }

  return data.obj
}
