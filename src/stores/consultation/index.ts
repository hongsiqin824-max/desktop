// 问诊数据存储中心：集中管理问诊全过程采集的数据
// 用途：1) 数据可观测（devtools + console）2) 结构化导出 JSON 3) 后端对接

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { IAnalysisData, IDetailAnswer, ISelfFeatureRecord, ISyndromeOutput, ITonguePulseCodes, ITonguePulseQuestion, ITongueReportResponse, IPulseAnalysisData } from '@/types/consultation'
import type { IDetailQuestionItem, IBatchSaveAnswer } from '@/types/consultationDetail'
import type { IUserInfo } from '@/types/user'
import { useUserStore } from '@/stores/global/user'
import { ZONE_PREFIX_MAP } from '@/data/selfFeature'

// ── 导出给后端的 JSON 数据结构 ──
export interface IConsultationPayload {
  userInfo: IUserInfo
  mainSymptom: string
  severityLevel: 'mild' | 'moderate' | 'severe' | ''
  analysisData: IAnalysisData | null
  detailAnswers: IDetailAnswer[]
  selfFeatureRecords: ISelfFeatureRecord[]
  syndromeOutput: ISyndromeOutput | null
  startTime: string
  endTime: string
}

// ── 精简版后端数据结构（只包含代码和数值）──
export interface IBackendSelfFeatureCode {
  meridianCode: string       // 如 "JM1K"
  eightPositionCode: string  // 如 "SRT"
  severity: 1 | 2
}

export interface IBackendPayload {
  userInfo: IUserInfo
  mainSymptom: string
  severityLevel: 'mild' | 'moderate' | 'severe' | ''
  tonguePulseCodes: ITonguePulseCodes | null
  detailAnswerCodes: string[]
  selfFeatureCodes: IBackendSelfFeatureCode[]
  startTime: string
  endTime: string
}

export const useConsultationStore = defineStore('consultation', () => {
  // ── 会话标识（来自 createSession 接口）──
  const cusId = ref('')
  const answerSheetId = ref('')
  const questionModel = ref('1')

  // ── 问诊流程数据 ──
  const mainSymptom = ref('')
  const severityLevel = ref<'mild' | 'moderate' | 'severe' | ''>('')
  const analysisData = ref<IAnalysisData | null>(null)
  const detailAnswers = ref<IDetailAnswer[]>([])
  const selfFeatureRecords = ref<ISelfFeatureRecord[]>([])
  const syndromeOutput = ref<ISyndromeOutput | null>(null)
  const startTime = ref('')
  const endTime = ref('')

  // ── 舌脉采集数据（新增）──
  /** 第三方 AI 舌象分析结果 */
  const tongueReport = ref<ITongueReportResponse['data'] | null>(null)
  /** 脉诊仪返回的脉象分析数据 */
  const pulseAnalysis = ref<IPulseAnalysisData | null>(null)
  /** 后端舌诊问题列表（已匹配 koiIsChoose） */
  const matchedTongueQuestions = ref<ITonguePulseQuestion[]>([])
  /** 后端脉诊问题列表（已匹配 koiIsChoose） */
  const matchedPulseQuestions = ref<ITonguePulseQuestion[]>([])
  /** 舌脉答案是否已保存到后端 */
  const tonguePulseSaved = ref(false)

  // ── 详细问诊数据（后端 API 驱动）──
  /** 必问问题列表（来自接口 7） */
  const requiredQuestions = ref<IDetailQuestionItem[]>([])
  /** 追问问题列表（来自接口 9） */
  const followUpQuestions = ref<IDetailQuestionItem[]>([])
  /** 补充问题列表（来自接口 10） */
  const programQuestions = ref<IDetailQuestionItem[]>([])
  /** 当前正在问第几题（索引） */
  const currentQuestionIndex = ref(0)
  /** 已收集的答案（用于接口 8 保存） */
  const detailSelectedAnswers = ref<IBatchSaveAnswer[]>([])
  /** 当前问诊阶段：required=必问, followUp=追问, program=补充, done=完成 */
  const detailPhase = ref<'required' | 'followUp' | 'program' | 'done'>('required')

  // ── 精简版数据快照（问诊结束时自动固化）──
  const backendPayload = ref<IBackendPayload | null>(null)

  // ── 设置方法 ──

  /** 设置会话标识数据（createSession 接口返回后调用） */
  const setSessionData = (data: { cusId: string; answerSheetId: string }) => {
    cusId.value = data.cusId
    answerSheetId.value = data.answerSheetId
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置会话标识:', data)
    }
  }

  /** 设置当前病种（默认"感冒"，确认主症后更新为真实病种） */
  const setQuestionModel = (model: string) => {
    questionModel.value = model
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 更新 questionModel:', model)
    }
  }

  /** 设置主症 */
  const setMainSymptom = (symptom: string) => {
    mainSymptom.value = symptom
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置主症:', symptom)
    }
  }

  /** 设置严重程度 */
  const setSeverityLevel = (level: 'mild' | 'moderate' | 'severe') => {
    severityLevel.value = level
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置严重程度:', level)
    }
  }

  /** 设置舌脉分析数据 */
  const setAnalysisData = (data: IAnalysisData) => {
    analysisData.value = data
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置舌脉分析:', data)
      console.log('[问诊数据] 舌脉代码编号:', data.codes)
    }
  }

  /** 设置详细问诊答案（完整替换） */
  const setDetailAnswers = (answers: IDetailAnswer[]) => {
    detailAnswers.value = answers
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置详细问诊答案:', answers)
    }
  }

  /** 追加单条详细问诊答案 */
  const addDetailAnswer = (answer: IDetailAnswer) => {
    detailAnswers.value.push(answer)
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 追加详细问诊答案:', answer)
    }
  }

  /** 设置自选特征记录（完整替换） */
  const setSelfFeatureRecords = (records: ISelfFeatureRecord[]) => {
    selfFeatureRecords.value = records
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置自选特征记录:', records)
    }
  }

  /** 追加单条自选特征记录 */
  const addSelfFeatureRecord = (record: ISelfFeatureRecord) => {
    selfFeatureRecords.value.push(record)
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 追加自选特征记录:', record)
    }
  }

  /** 设置证型输出结果 */
  const setSyndromeOutput = (output: ISyndromeOutput) => {
    syndromeOutput.value = output
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置证型输出:', output)
    }
  }

  // ── 舌脉采集数据设置方法（新增）──

  /** 设置第三方 AI 舌象分析结果 */
  const setTongueReport = (report: ITongueReportResponse['data']) => {
    tongueReport.value = report
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置舌象AI结果:', {
        舌色: report.shese, 舌型: report.shexing,
        苔色: report.taise, 苔型: report.taixing, 体质: report.tizhi,
      })
    }
  }

  /** 设置脉诊仪分析数据 */
  const setPulseAnalysis = (data: IPulseAnalysisData) => {
    pulseAnalysis.value = data
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置脉诊数据:', data)
    }
  }

  /** 设置匹配后的舌诊问题列表 */
  const setMatchedTongueQuestions = (questions: ITonguePulseQuestion[]) => {
    matchedTongueQuestions.value = questions
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置舌诊问题(已匹配):', questions.length, '个问题')
    }
  }

  /** 设置匹配后的脉诊问题列表 */
  const setMatchedPulseQuestions = (questions: ITonguePulseQuestion[]) => {
    matchedPulseQuestions.value = questions
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置脉诊问题(已匹配):', questions.length, '个问题')
    }
  }

  /** 标记舌脉答案已保存到后端 */
  const markTonguePulseSaved = () => {
    tonguePulseSaved.value = true
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 舌脉答案已保存')
    }
  }

  // ── 详细问诊设置方法 ──

  /** 设置必问问题列表（接口 7 返回后调用） */
  const setRequiredQuestions = (questions: IDetailQuestionItem[]) => {
    requiredQuestions.value = questions
    currentQuestionIndex.value = 0
    detailPhase.value = 'required'
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置必问问题:', questions.length, '题')
    }
  }

  /** 设置追问问题列表（接口 9 返回后调用） */
  const setFollowUpQuestions = (questions: IDetailQuestionItem[]) => {
    followUpQuestions.value = questions
    currentQuestionIndex.value = 0
    detailPhase.value = 'followUp'
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置追问问题:', questions.length, '题')
    }
  }

  /** 设置补充问题列表（接口 10 返回后调用） */
  const setProgramQuestions = (questions: IDetailQuestionItem[]) => {
    programQuestions.value = questions
    currentQuestionIndex.value = 0
    detailPhase.value = 'program'
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 设置补充问题:', questions.length, '题')
    }
  }

  /** 添加一条详细问诊答案 */
  const addDetailSelectedAnswer = (answer: IBatchSaveAnswer) => {
    detailSelectedAnswers.value.push(answer)
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 记录答案:', answer.questionId, '→', answer.selectedOptionIds)
    }
  }

  /** 推进到下一题 */
  const advanceQuestionIndex = () => {
    currentQuestionIndex.value++
  }

  /** 获取当前阶段的问题列表 */
  const getCurrentQuestionList = (): IDetailQuestionItem[] => {
    if (detailPhase.value === 'required') return requiredQuestions.value
    if (detailPhase.value === 'followUp') return followUpQuestions.value
    if (detailPhase.value === 'program') return programQuestions.value
    return []
  }

  /** 获取当前正在问的问题 */
  const getCurrentQuestion = (): IDetailQuestionItem | null => {
    const list = getCurrentQuestionList()
    return list[currentQuestionIndex.value] || null
  }

  /** 重置详细问诊数据（保留问题列表用于降级，清空答案） */
  const resetDetailAnswers = () => {
    detailSelectedAnswers.value = []
    currentQuestionIndex.value = 0
  }

  /** 开始问诊（记录开始时间） */
  const startConsultation = () => {
    startTime.value = new Date().toISOString()
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 开始问诊:', startTime.value)
    }
  }

  /** 结束问诊（记录结束时间） */
  const endConsultation = () => {
    endTime.value = new Date().toISOString()
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 结束问诊:', endTime.value)
    }
  }

  /** 固化精简版后端数据（问诊结束时自动调用，生成独立快照） */
  const finalizeBackendPayload = () => {
    backendPayload.value = exportBackendPayload()
    if (import.meta.env.DEV) {
      console.log('═══════════════════════════════════════')
      console.log('📊 后端精简数据已固化（可在 DevTools → Pinia → consultation → backendPayload 查看）')
      console.log('═══════════════════════════════════════')
      console.log(JSON.stringify(backendPayload.value, null, 2))
      console.log('═══════════════════════════════════════')
    }
  }

  // ── 数据导出 ──

  /** 导出完整问诊数据（用于发送给后端） */
  const exportData = (): IConsultationPayload => {
    const userStore = useUserStore()
    return {
      userInfo: userStore.userInfo,
      mainSymptom: mainSymptom.value,
      severityLevel: severityLevel.value,
      analysisData: analysisData.value,
      detailAnswers: detailAnswers.value,
      selfFeatureRecords: selfFeatureRecords.value,
      syndromeOutput: syndromeOutput.value,
      startTime: startTime.value,
      endTime: endTime.value
    }
  }

  /** 导出数据并打印到控制台（调试用） */
  const exportAndLog = () => {
    const data = exportData()
    console.log('═══════════════════════════════════════')
    console.log('📊 问诊数据完整 JSON')
    console.log('═══════════════════════════════════════')
    console.log(JSON.stringify(data, null, 2))
    console.log('═══════════════════════════════════════')
    return data
  }

  /** 导出数据为 JSON 文件并下载 */
  const downloadAsJSON = () => {
    const data = exportData()
    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `问诊数据_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 已下载 JSON 文件')
    }
  }

  // ── 精简版导出（只含代码，用于后端计算）──

  /** 导出精简版数据（只含代码和数值，用于后端辨证计算） */
  const exportBackendPayload = (): IBackendPayload => {
    const userStore = useUserStore()

    // 转换自选特征记录为精简代码格式
    const selfFeatureCodes: IBackendSelfFeatureCode[] = selfFeatureRecords.value
      .filter(r => r.meridianCode && r.symptomCategory && r.symptomBaseCode)
      .map(r => {
        const zonePrefix = ZONE_PREFIX_MAP[r.locationZone] || 'S'
        return {
          meridianCode: `${r.meridianCode}${r.symptomCategory}`,
          eightPositionCode: `${zonePrefix}${r.symptomBaseCode}`,
          severity: r.severity,
        }
      })

    return {
      userInfo: userStore.userInfo,
      mainSymptom: mainSymptom.value,
      severityLevel: severityLevel.value,
      tonguePulseCodes: analysisData.value?.codes ?? null,
      detailAnswerCodes: detailAnswers.value.map(a => a.taCode),
      selfFeatureCodes,
      startTime: startTime.value,
      endTime: endTime.value,
    }
  }

  /** 导出精简版并打印到控制台 */
  const exportBackendAndLog = () => {
    const data = exportBackendPayload()
    console.log('═══════════════════════════════════════')
    console.log('📊 后端精简数据 JSON')
    console.log('═══════════════════════════════════════')
    console.log(JSON.stringify(data, null, 2))
    console.log('═══════════════════════════════════════')
    return data
  }

  /** 导出精简版为 JSON 文件并下载 */
  const downloadBackendPayload = () => {
    const data = exportBackendPayload()
    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `后端数据_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 已下载精简版 JSON 文件')
    }
  }

  // ── 重置 ──

  /** 重置所有问诊数据（开始新问诊时调用） */
  const reset = () => {
    cusId.value = ''
    answerSheetId.value = ''
    questionModel.value = '1'
    mainSymptom.value = ''
    severityLevel.value = ''
    analysisData.value = null
    detailAnswers.value = []
    selfFeatureRecords.value = []
    syndromeOutput.value = null
    startTime.value = ''
    endTime.value = ''
    backendPayload.value = null
    // 舌脉采集数据重置
    tongueReport.value = null
    pulseAnalysis.value = null
    matchedTongueQuestions.value = []
    matchedPulseQuestions.value = []
    tonguePulseSaved.value = false
    // 详细问诊数据重置
    requiredQuestions.value = []
    followUpQuestions.value = []
    programQuestions.value = []
    currentQuestionIndex.value = 0
    detailSelectedAnswers.value = []
    detailPhase.value = 'required'
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 已重置所有数据')
    }
  }

  return {
    // 会话标识
    cusId,
    answerSheetId,
    questionModel,
    setSessionData,
    setQuestionModel,
    // 状态
    mainSymptom,
    severityLevel,
    analysisData,
    detailAnswers,
    selfFeatureRecords,
    syndromeOutput,
    startTime,
    endTime,
    backendPayload,
    // 舌脉采集状态
    tongueReport,
    pulseAnalysis,
    matchedTongueQuestions,
    matchedPulseQuestions,
    tonguePulseSaved,
    // 设置方法
    setMainSymptom,
    setSeverityLevel,
    setAnalysisData,
    setDetailAnswers,
    addDetailAnswer,
    setSelfFeatureRecords,
    addSelfFeatureRecord,
    setSyndromeOutput,
    startConsultation,
    endConsultation,
    finalizeBackendPayload,
    // 舌脉采集设置方法
    setTongueReport,
    setPulseAnalysis,
    setMatchedTongueQuestions,
    setMatchedPulseQuestions,
    markTonguePulseSaved,
    // 详细问诊状态
    requiredQuestions,
    followUpQuestions,
    programQuestions,
    currentQuestionIndex,
    detailSelectedAnswers,
    detailPhase,
    // 详细问诊设置方法
    setRequiredQuestions,
    setFollowUpQuestions,
    setProgramQuestions,
    addDetailSelectedAnswer,
    advanceQuestionIndex,
    getCurrentQuestionList,
    getCurrentQuestion,
    resetDetailAnswers,
    // 导出方法
    exportData,
    exportAndLog,
    downloadAsJSON,
    exportBackendPayload,
    exportBackendAndLog,
    downloadBackendPayload,
    // 重置方法
    reset
  }
})
