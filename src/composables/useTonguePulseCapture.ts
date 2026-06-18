// 舌脉采集流程编排 composable
//
// 完整流程：
//   舌面拍照 → AI 分析 → 脉诊采集 → 获取问题 → 自动匹配 → 展示确认 → 保存
//
// 注意：第三方 AI 只需要舌面照片，不需要舌底照片
//
// 硬件抽象：
//   - 摄像头拍照：开发阶段让用户选择本地图片，硬件到位后替换为真实设备
//   - 脉诊设备：开发阶段用 mock 数据，硬件到位后替换为真实蓝牙通信
//
// 此 composable 提供：
//   - stepTongueTop()          舌面拍照（返回 File）
//   - stepAnalyzeAndMatch()    AI 分析 + 脉诊 + 匹配
//   - stepSave()               保存答案
//   - 各阶段的状态和进度

import { ref, computed } from 'vue'
import { useConsultationStore } from '@/stores/consultation'
import { useUserStore } from '@/stores/global/user'
import { analyzeTongue } from '@/api/tongueAI'
import { readPulseData } from '@/api/pulseAPI'
import { fetchTonguePulseQuestions, saveTonguePulseAnswers } from '@/api/tonguePulse'
import {
  matchTongueQuestions,
  matchPulseQuestions,
  toSubmitQuestions,
  extractTongueResultText,
  extractPulseResultText,
} from '@/data/tonguePulseMatcher'
import type { ITonguePulseQuestion, IPulseAnalysisData } from '@/types/consultation'
import { isTauri } from '@/config/proxy'

// Tauri 模式：使用原生文件对话框（绕过 WebView2 文件输入限制）
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'

// ── 采集阶段枚举 ──────────────────────────────────────────────
export type CapturePhase =
  | 'idle'               // 未开始
  | 'tongue_top'         // 等待舌面拍照
  | 'tongue_top_upload'  // 舌面照片上传中
  | 'tongue_bottom'      // 等待舌下拍照
  | 'tongue_bottom_upload' // 舌下照片上传中
  | 'ai_analyzing'       // AI 分析中
  | 'pulse'              // 等待脉诊采集
  | 'pulse_reading'      // 脉诊设备读取中
  | 'fetching_questions' // 获取后端问题中
  | 'matching'           // 自动匹配中
  | 'confirming'         // 等待用户确认
  | 'saving'             // 保存答案中
  | 'done'               // 完成
  | 'error'              // 出错

export function useTonguePulseCapture() {
  const store = useConsultationStore()
  const userStore = useUserStore()

  // ── 状态 ──────────────────────────────────────────────────────
  const phase = ref<CapturePhase>('idle')
  const errorMessage = ref('')

  // 舌面照片（File 对象，由硬件或用户选择提供）
  const tongueTopFile = ref<File | null>(null)

  // 匹配后的问题列表（带 koiIsChoose）
  const matchedTongue = ref<ITonguePulseQuestion[]>([])
  const matchedPulse = ref<ITonguePulseQuestion[]>([])

  // AI 分析结果的可读文本
  const resultTextLines = ref<string[]>([])

  // 脉诊数据
  const pulseData = ref<IPulseAnalysisData | null>(null)

  // ── 计算属性 ──────────────────────────────────────────────
  const isProcessing = computed(() =>
    phase.value !== 'idle' &&
    phase.value !== 'done' &&
    phase.value !== 'error' &&
    phase.value !== 'tongue_top' &&
    phase.value !== 'tongue_bottom' &&
    phase.value !== 'pulse' &&
    phase.value !== 'confirming'
  )

  const isWaitingForUser = computed(() =>
    phase.value === 'tongue_top' ||
    phase.value === 'tongue_bottom' ||
    phase.value === 'pulse' ||
    phase.value === 'confirming'
  )

  // ── Mock 拍照：让用户选择本地图片文件 ──────────────────────
  // ⏳ 硬件到位后，替换为真实设备调用（无需用户手动选择文件）

  /**
   * 模拟拍照：打开文件选择器让用户选择本地图片
   *
   * Tauri 模式：使用原生文件对话框（@tauri-apps/plugin-dialog）
   *   - 绕过 WebView2 对 input.click() 的安全限制
   *   - 弹出 Windows 原生文件选择器
   *
   * 浏览器模式：使用 HTML <input type="file">
   *   - 需要用户激活（user activation），在同步点击事件中触发
   *
   * @returns 用户选择的图片 File 对象
   */
  async function mockCaptureImage(): Promise<File> {
    if (isTauri) {
      // ── Tauri 模式：使用原生文件对话框 ──
      const filePath = await open({
        multiple: false,
        directory: false,
        filters: [
          { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }
        ],
        title: '选择舌象照片',
      })

      if (!filePath) {
        throw new Error('用户取消了拍照')
      }

      // 读取文件二进制数据
      const fileData = await readFile(filePath)
      const blob = new Blob([fileData], { type: getMimeType(filePath) })

      // 提取文件名（兼容 Windows 路径分隔符 \）
      const fileName = filePath.split(/[\\/]/).pop() || 'photo.jpg'

      if (import.meta.env.DEV) {
        console.log('[采集] Tauri 原生对话框选择文件:', fileName, `(${(blob.size / 1024).toFixed(0)}KB)`)
      }

      return new File([blob], fileName, { type: blob.type })
    }

    // ── 浏览器模式：使用 HTML input ──
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'

      input.onchange = () => {
        const file = input.files?.[0]
        if (file) {
          resolve(file)
        } else {
          reject(new Error('未选择图片'))
        }
      }

      input.oncancel = () => {
        reject(new Error('用户取消了拍照'))
      }

      input.click()
    })
  }

  /** 根据文件扩展名推断 MIME 类型 */
  function getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      bmp: 'image/bmp',
    }
    return mimeMap[ext || ''] || 'image/jpeg'
  }

  // ── 拍照接口（开发阶段 = mock，硬件到位后替换） ──────────────

  /** 舌面拍照 */
  async function captureTongueTopImage(): Promise<File> {
    phase.value = 'tongue_top'
    const file = await mockCaptureImage()
    tongueTopFile.value = file
    if (import.meta.env.DEV) {
      console.log('[采集] 舌面照片:', file.name, `(${(file.size / 1024).toFixed(0)}KB)`)
    }
    return file
  }

  // ── 完整采集流水线 ──────────────────────────────────────────

  /**
   * 执行完整的舌脉采集 → 分析 → 匹配 → 确认 → 保存流程
   *
   * 此函数会在需要用户操作的阶段暂停等待（拍照、确认），
   * 调用方需要按顺序调用各子步骤。
   *
   * 也可以一次性调用 runFullPipeline()，它会自动推进各阶段。
   */

  /**
   * 步骤1: 舌面拍照 + 上传
   * 注意：第三方 AI 只需要舌面照片，不需要舌底照片
   */
  async function stepTongueTop(): Promise<void> {
    try {
      const file = await captureTongueTopImage()
      phase.value = 'tongue_top_upload'
      tongueTopFile.value = file
    } catch (e) {
      phase.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : '舌面拍照失败'
      throw e
    }
  }

  /**
   * 步骤2: AI 分析舌象 + 脉诊采集 + 获取问题 + 自动匹配
   * 这是一个自动推进的步骤，不需要用户操作
   */
  async function stepAnalyzeAndMatch(): Promise<void> {
    try {
      // 3a. AI 舌象分析（用舌面照片）
      phase.value = 'ai_analyzing'
      if (!tongueTopFile.value) {
        throw new Error('缺少舌面照片')
      }

      const userInfo = userStore.userInfo
      const aiReport = await analyzeTongue({
        imageFile: tongueTopFile.value,
        age: userInfo.age ?? 30,
        phone: userInfo.phone,
        sex: userInfo.gender === '男' ? 1 : 0,
        name: userInfo.name,
      })
      store.setTongueReport(aiReport)

      // 3b. 脉诊采集
      phase.value = 'pulse_reading'
      const pulse = await readPulseData()
      pulseData.value = pulse
      store.setPulseAnalysis(pulse)

      // 3c. 获取后端舌脉问题
      phase.value = 'fetching_questions'
      const questionsData = await fetchTonguePulseQuestions(
        store.answerSheetId,
        store.questionModel,
      )

      // 3d. 自动匹配
      phase.value = 'matching'
      const matchedT = matchTongueQuestions(questionsData.tongueQuestions, aiReport)
      const matchedP = matchPulseQuestions(questionsData.pulseQuestions, pulse)

      matchedTongue.value = matchedT
      matchedPulse.value = matchedP
      store.setMatchedTongueQuestions(matchedT)
      store.setMatchedPulseQuestions(matchedP)

      // 3e. 生成可读结果文本
      const tongueLines = extractTongueResultText(matchedT)
      const pulseLines = extractPulseResultText(matchedP, pulse)
      resultTextLines.value = [...tongueLines, ...pulseLines]

      // 3f. 同步生成 IAnalysisData（必须在展示 analysis_review 之前）
      syncAnalysisData()

      // 进入确认阶段
      phase.value = 'confirming'
    } catch (e) {
      phase.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : '分析匹配失败'
      throw e
    }
  }

  /**
   * 步骤4: 用户确认后保存答案
   */
  async function stepSave(): Promise<void> {
    try {
      phase.value = 'saving'

      const request = {
        answerSheetId: store.answerSheetId,
        kqmId: store.questionModel,
        maibo: String(pulseData.value?.maibo ?? '0'),
        tongueQuestions: toSubmitQuestions(matchedTongue.value),
        pulseQuestions: toSubmitQuestions(matchedPulse.value),
      }

      await saveTonguePulseAnswers(request)
      store.markTonguePulseSaved()

      phase.value = 'done'
    } catch (e) {
      phase.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : '保存失败'
      throw e
    }
  }

  /**
   * 将匹配结果同步到 IAnalysisData 格式（兼容现有的 analysis_review 展示逻辑）
   * 使用匹配后的后端选项名（koiOption），而不是 AI 原始返回值
   */
  function syncAnalysisData(): void {
    const pulse = store.pulseAnalysis
    if (!pulse) return

    // 从匹配后的舌诊问题中提取已选中的选项名（按 kqiCode 分类）
    const getSelectedOptions = (kqiCode: string): string => {
      const question = matchedTongue.value.find(q => q.kqiCode === kqiCode)
      if (!question) return ''
      const selected = question.kytOptions
        .filter(o => o.koiIsChoose === '1')
        .map(o => o.koiOption)
      return selected.join('、') || ''
    }

    // 使用匹配后的后端选项名
    const tongueColor = getSelectedOptions('LSZ02') || ''       // 舌质颜色
    const tongueSize = getSelectedOptions('LSZ01') || ''        // 舌形
    const tongueCoatingColor = getSelectedOptions('LSZ04') || '' // 苔色
    const tongueCoating = getSelectedOptions('LSZ03') || ''     // 苔质

    // 从脉诊数据提取脉象类型
    const pulseTypes: string[] = []
    if (pulse.xianmai > 0.6) pulseTypes.push('弦脉')
    if (pulse.huamai > 0.6) pulseTypes.push('滑脉')
    if (pulse.semai > 0.6) pulseTypes.push('涩脉')
    if (pulse.ruomai > 0.6) pulseTypes.push('无力脉')
    const pulseType = pulseTypes.length > 0 ? pulseTypes.join('、') : '平脉'

    // 构建 codes（兼容旧的 ITonguePulseCodes 格式）
    const codes = {
      LMB1: pulse.maibo,
      MBJD: (pulse.jiedai != null && pulse.jiedai > 0.6 ? 1 : 0) as 0 | 1,
      LXMB: (pulse.xianmai > 0.6 ? 1 : 0) as 0 | 1,
      LHMB: (pulse.huamai > 0.6 ? 1 : 0) as 0 | 1,
      LSMB: (pulse.semai > 0.6 ? 1 : 0) as 0 | 1,
      LWMB: (pulse.ruomai > 0.6 ? 1 : 0) as 0 | 1,
      LSZ1: 0 as 0 | 1, LSZ2: 0 as 0 | 1, LSZ3: 0 as 0 | 1, LSZ4: 0 as 0 | 1, LSZ5: 0 as 0 | 1,
      LSZ6: 0 as 0 | 1, LSZ7: 0 as 0 | 1, LSZ8: 0 as 0 | 1, LSZ9: 0 as 0 | 1, LSZ10: 0 as 0 | 1,
      LSZ11: 0 as 0 | 1, LSZ12: 0 as 0 | 1, LSZ13: 0 as 0 | 1, LSZ14: 0 as 0 | 1, LSZ15: 0 as 0 | 1, LSZ16: 0 as 0 | 1,
      LSZ17: 0 as 0 | 1, LSZ18: 0 as 0 | 1, LSZ19: 0 as 0 | 1,
      LSZ20: 0 as 0 | 1,
    }

    // 从匹配后的问题中提取 codes
    for (const question of matchedTongue.value) {
      for (const option of question.kytOptions) {
        if (option.koiIsChoose === '1' && option.koiOptionCode) {
          const code = option.koiOptionCode as keyof typeof codes
          if (code in codes && code !== 'LMB1') {
            (codes as Record<string, number>)[code] = 1
          }
        }
      }
    }

    const analysisResult = {
      tongueCoating,
      tongueCoatingColor,
      tongueColor,
      tongueSize,
      pulseType,
      pulseRate: pulse.maibo,
      isAbnormal: false, // TODO: 根据脉象/舌象判断是否异常
      codes,
    }

    store.setAnalysisData(analysisResult)
  }

  /**
   * 重置采集状态（重新采集时调用）
   */
  function resetCapture(): void {
    phase.value = 'idle'
    errorMessage.value = ''
    tongueTopFile.value = null
    matchedTongue.value = []
    matchedPulse.value = []
    resultTextLines.value = []
    pulseData.value = null
  }

  return {
    // 状态
    phase,
    errorMessage,
    isProcessing,
    isWaitingForUser,
    matchedTongue,
    matchedPulse,
    resultTextLines,
    pulseData,
    tongueTopFile,
    // 分步调用
    stepTongueTop,
    stepAnalyzeAndMatch,
    stepSave,
    resetCapture,
  }
}
