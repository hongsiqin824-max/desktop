// 问诊数据存储中心：集中管理问诊全过程采集的数据
// 用途：1) 数据可观测（devtools + console）2) 结构化导出 JSON 3) 后端对接

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { IAnalysisData, IDetailAnswer, ISelfFeatureRecord, ISyndromeOutput, ITonguePulseCodes } from '@/types/consultation'
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
  // ── 问诊流程数据 ──
  const mainSymptom = ref('')
  const severityLevel = ref<'mild' | 'moderate' | 'severe' | ''>('')
  const analysisData = ref<IAnalysisData | null>(null)
  const detailAnswers = ref<IDetailAnswer[]>([])
  const selfFeatureRecords = ref<ISelfFeatureRecord[]>([])
  const syndromeOutput = ref<ISyndromeOutput | null>(null)
  const startTime = ref('')
  const endTime = ref('')

  // ── 精简版数据快照（问诊结束时自动固化）──
  const backendPayload = ref<IBackendPayload | null>(null)

  // ── 设置方法 ──

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
    mainSymptom.value = ''
    severityLevel.value = ''
    analysisData.value = null
    detailAnswers.value = []
    selfFeatureRecords.value = []
    syndromeOutput.value = null
    startTime.value = ''
    endTime.value = ''
    backendPayload.value = null
    if (import.meta.env.DEV) {
      console.log('[问诊数据] 已重置所有数据')
    }
  }

  return {
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
