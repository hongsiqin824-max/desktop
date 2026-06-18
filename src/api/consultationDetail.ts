// 详细问诊 API：对接后端的必问问题获取、追问获取、答案保存、补充问题、辩证计算
//
// 五个接口：
//   7.  GET  /mp/customer/getRequiredQuestionsForDigital → 获取必问问题
//   8.  POST /answersheet/basic/batchSaveQuestionAnswer → 批量保存答案
//   9.  GET  /mp/customer/getRelationQuestionforDigital → 获取追问问题
//   10. GET  /mp/customer/getProgramQuestionsForDigital → 获取补充问题
//   11. GET  /mp/customer/computeAnswerSheet → 计算辩证结果
//
// 代理策略：
//   - 浏览器开发模式：Vite 代理 /mp → http://39.106.163.181:8092
//   - Tauri 模式：Rust 代理 /mp → 同上（带 JSESSIONID Cookie）

import { PROXY_HTTP_BASE, isTauri } from '@/config/proxy'
import { authFetch } from '@/api/auth'
import type {
  IDetailQuestionsResponse,
  IBatchSaveRequest,
  IBatchSaveResponse,
} from '@/types/consultationDetail'

const BIZ_API_BASE = isTauri ? PROXY_HTTP_BASE : ''

// ── 获取必问问题（接口 7） ──────────────────────────────────────
// GET /mp/customer/getRequiredQuestionsForDigital?questionModel=xxx&answerSheetId=xxx
// 返回：必问问题列表（含选项和子选项）

/**
 * 获取详细问诊的必问问题列表
 * @param answerSheetId 答题纸 ID（createSession 返回）
 * @param kqmId 辨证模型 ID
 * @returns 必问问题列表（含选项树）
 */
export async function fetchRequiredQuestions(
  answerSheetId: string,
  kqmId: string,
): Promise<IDetailQuestionsResponse['obj']> {
  const params = new URLSearchParams({
    questionModel: kqmId,
    answerSheetId,
  })

  const res = await authFetch(
    `${BIZ_API_BASE}/mp/customer/getRequiredQuestionsForDigital?${params.toString()}`,
  )

  if (!res.ok) {
    throw new Error(`获取必问问题失败: HTTP ${res.status}`)
  }

  const data: IDetailQuestionsResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(`获取必问问题失败: ${data.msg || '后端返回异常'}`)
  }

  if (import.meta.env.DEV) {
    const obj = data.obj
    console.log('[必问问题] 获取成功:', {
      answerSheetId: obj.answerSheetId,
      questionSeqConfigId: obj.questionSeqConfigId,
      问题数: obj.questionList.length,
    })
    for (const q of obj.questionList) {
      const optionCount = q.kytOptions.length
      const childCount = q.kytOptions.filter(o => o.koihHasChild === 1).length
      console.log(`  ${q.kqihName} (${q.kqihId}): ${optionCount}个选项, ${childCount}个有子选项`)
      if (import.meta.env.DEV) {
        console.log(`    选项:`, q.kytOptions.map(o =>
          `${o.koihOption}(${o.koihOptionCode})${o.koihHasChild ? ' → [' + o.koihChildsOption.map(c => c.koihOption).join('/') + ']' : ''}`
        ).join(', '))
      }
    }
  }

  return data.obj
}

// ── 获取追问问题（接口 9） ──────────────────────────────────────
// GET /mp/customer/getRelationQuestionforDigital?questionModel=xxx&answerSheetId=xxx
// 返回：追问问题列表（根据已答内容动态返回）

/**
 * 获取详细问诊的追问问题列表（根据已答内容动态生成）
 * @param answerSheetId 答题纸 ID
 * @param kqmId 辨证模型 ID
 * @returns 追问问题列表（含选项树和条件公式）
 */
export async function fetchFollowUpQuestions(
  answerSheetId: string,
  kqmId: string,
): Promise<IDetailQuestionsResponse['obj']> {
  const params = new URLSearchParams({
    questionModel: kqmId,
    answerSheetId,
  })

  const res = await authFetch(
    `${BIZ_API_BASE}/mp/customer/getRelationQuestionforDigital?${params.toString()}`,
  )

  if (!res.ok) {
    throw new Error(`获取追问问题失败: HTTP ${res.status}`)
  }

  const data: IDetailQuestionsResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(`获取追问问题失败: ${data.msg || '后端返回异常'}`)
  }

  if (import.meta.env.DEV) {
    const obj = data.obj
    console.log('[追问问题] 获取成功:', {
      answerSheetId: obj.answerSheetId,
      问题数: obj.questionList.length,
    })
    for (const q of obj.questionList) {
      console.log(`  ${q.kqihName} (条件: ${q.kqihShowFormular || '无'}): ${q.kytOptions.length}个选项`)
    }
  }

  return data.obj
}

// ── 获取补充问题（接口 10） ──────────────────────────────────────
// GET /mp/customer/getProgramQuestionsForDigital?questionModel=xxx&answerSheetId=xxx
// 返回：补充问题列表（结构与必问问题相同）

/**
 * 获取详细问诊的补充问题列表（与 question_model 相关的其他问题）
 * @param answerSheetId 答题纸 ID
 * @param kqmId 辨证模型 ID
 * @returns 补充问题列表（含选项树）
 */
export async function fetchProgramQuestions(
  answerSheetId: string,
  kqmId: string,
): Promise<IDetailQuestionsResponse['obj']> {
  const params = new URLSearchParams({
    questionModel: kqmId,
    answerSheetId,
  })

  const res = await authFetch(
    `${BIZ_API_BASE}/mp/customer/getProgramQuestionsForDigital?${params.toString()}`,
  )

  if (!res.ok) {
    throw new Error(`获取补充问题失败: HTTP ${res.status}`)
  }

  const data: IDetailQuestionsResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(`获取补充问题失败: ${data.msg || '后端返回异常'}`)
  }

  if (import.meta.env.DEV) {
    const obj = data.obj
    console.log('[补充问题] 获取成功:', {
      answerSheetId: obj.answerSheetId,
      问题数: obj.questionList.length,
    })
    for (const q of obj.questionList) {
      console.log(`  ${q.kqihName} (${q.kqihId}): ${q.kytOptions.length}个选项`)
    }
  }

  return data.obj
}

// ── 批量保存答案（接口 8） ──────────────────────────────────────
// POST /answersheet/basic/batchSaveQuestionAnswer
// 请求体：{ answerSheetId, kqmId, dialecticCount, answers: [{ questionId, selectedOptionIds }] }
// 注意：路径是 /answersheet/basic/ 不是 /mp/customer/

/**
 * 批量保存详细问诊答案到后端
 * @param request 答案数据（questionId = kqihId, selectedOptionIds = koihId 路径）
 */
export async function batchSaveAnswers(
  request: IBatchSaveRequest,
): Promise<void> {
  // 注意：保存接口路径前缀不同
  const saveApiBase = isTauri ? PROXY_HTTP_BASE : ''

  const res = await authFetch(
    `${saveApiBase}/answersheet/basic/batchSaveQuestionAnswer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  )

  if (!res.ok) {
    throw new Error(`保存详细问诊答案失败: HTTP ${res.status}`)
  }

  const data: IBatchSaveResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(`保存详细问诊答案失败: ${data.msg || '后端返回异常'}`)
  }

  if (import.meta.env.DEV) {
    console.log('[详细问诊答案] 保存成功:', {
      answerSheetId: request.answerSheetId,
      kqmId: request.kqmId,
      dialecticCount: request.dialecticCount,
      答案数: request.answers.length,
    })
    for (const a of request.answers) {
      console.log(`  问题 ${a.questionId}: 选中 [${a.selectedOptionIds.join(' → ')}]`)
    }
  }
}

// ── 保存经脉八维数值（接口 12）────────────────────────────────────
// POST /mp/customer/saveAnswerCalcVals
// 入参：{ answerSheetId: string, calcVals: { code: string, val: number }[] }
// 返回：{ status: number, msg: string, obj: { answerSheetId: string, saveCount: number } }

export interface ICalcVal {
  code: string
  val: number
}

export interface ISaveCalcValsRequest {
  answerSheetId: string
  calcVals: ICalcVal[]
}

export interface ISaveCalcValsResponse {
  status: number
  msg: string
  obj: {
    answerSheetId: string
    saveCount: number
  }
}

export async function saveAnswerCalcVals(
  answerSheetId: string,
  calcVals: ICalcVal[],
): Promise<ISaveCalcValsResponse> {
  const request: ISaveCalcValsRequest = { answerSheetId, calcVals }

  console.log('[经脉八维] 开始保存，请求:', {
    answerSheetId,
    码数量: calcVals.length,
    calcVals,
  })

  const res = await authFetch(
    `${BIZ_API_BASE}/mp/customer/saveAnswerCalcVals`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  )

  if (!res.ok) {
    throw new Error(`保存经脉八维数值失败: HTTP ${res.status}`)
  }

  const data: ISaveCalcValsResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(`保存经脉八维数值失败: ${data.msg || '后端返回异常'}`)
  }

  console.log('[经脉八维] ✅ 保存成功:', {
    answerSheetId: data.obj?.answerSheetId,
    saveCount: data.obj?.saveCount,
  })

  return data
}

// ── 计算辩证结果（接口 11） ──────────────────────────────────────
// GET /mp/customer/computeAnswerSheet?answerSheetId=xxx
// 返回：辩证结果数据（预期包含证型信息，失败时调用方降级为 mock）

/**
 * 计算辩证结果（替代 submitConsultation）
 * @param answerSheetId 答题纸 ID
 * @returns 辩证结果数据（实际返回可能包含证型信息）
 */
export async function computeAnswerSheet(
  answerSheetId: string,
): Promise<any> {
  const params = new URLSearchParams({
    answerSheetId,
  })

  const res = await authFetch(
    `${BIZ_API_BASE}/mp/customer/computeAnswerSheet?${params.toString()}`,
  )

  if (!res.ok) {
    throw new Error(`计算辩证结果失败: HTTP ${res.status}`)
  }

  const data = await res.json()

  if (data.status !== 200) {
    throw new Error(`计算辩证结果失败: ${data.msg || '后端返回异常'}`)
  }

  if (import.meta.env.DEV) {
    console.log('[辩证计算] 成功:', data.obj)
  }

  return data.obj
}

// ── 获取辨证计算结果（接口 13）────────────────────────────────────
// GET /mp/customer/getComputeAnswerRes?answerSheetId=xxx&type=3
// 返回：辨证结论 + 推荐方案（茶饮、方剂、中成药等）

export interface IComputeAnswerGraphicItem {
  code: string
  key: string
  value: string
  index: number
}

export interface IComputeAnswerRecommendItem {
  key: string
  value: string
}

export interface IComputeAnswerResObj {
  name: string
  sex: string
  age: string
  telNum: string
  time: string
  modelName: string
  graphicList: IComputeAnswerGraphicItem[]
  tuijianList: IComputeAnswerRecommendItem[]
  kytFormulas: any[]
  kytGraphicModels: any[]
}

export interface IGetComputeAnswerResResponse {
  status: number
  msg: string
  obj: IComputeAnswerResObj
}

export async function getComputeAnswerRes(
  answerSheetId: string,
  type: number = 3,
): Promise<IGetComputeAnswerResResponse> {
  const params = new URLSearchParams({ answerSheetId, type: String(type) })

  console.log('[辨证结果] 请求 getComputeAnswerRes:', { answerSheetId, type })

  const res = await authFetch(
    `${BIZ_API_BASE}/mp/customer/getComputeAnswerRes?${params.toString()}`,
  )

  if (!res.ok) {
    throw new Error(`获取辨证结果失败: HTTP ${res.status}`)
  }

  const data: IGetComputeAnswerResResponse = await res.json()

  if (data.status !== 200) {
    throw new Error(`获取辨证结果失败: ${data.msg || '后端返回异常'}`)
  }

  console.log('[辨证结果] getComputeAnswerRes 返回:', {
    modelName: data.obj?.modelName,
    tuijianList数量: data.obj?.tuijianList?.length ?? 0,
    graphicList数量: data.obj?.graphicList?.length ?? 0,
  })

  return data
}
