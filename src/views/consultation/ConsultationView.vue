<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/global/user'
import { useUIStore } from '@/stores/global/ui'
import { useSessionStore } from '@/stores/global/session'
import { useConsultationStore } from '@/stores/consultation'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import { useTTSStore } from '@/stores/global/tts'
import type { PersonaType } from '@/types/consultation'
import { useLLM } from '@/composables/useLLM'
import type { IIntentResult } from '@/types/llm'
import { fetchLLMCompletion } from '@/api/llm'
import { buildInterpretationMessages, parseInterpretationResult } from '@/data/llmPrompt'
import type { IInterpretationContext, IKytFormula } from '@/data/llmPrompt'
import { FLOW_STEPS, REFUSAL_FALLBACK, MOCK_ANALYSIS } from '@/data/consultationFlow'
import type { StepIdType, IChatOption, IChatMessage, IStepSnapshot, ISyndromeOutput, IDetailAnswer } from '@/types/consultation'
import { KEYWORD_CONFIG, RETRY_CONFIG, generateResponse } from '@/data/consultationResponse'
import { generateMockSyndromeOutput, mergeSeverityDuplicates, getCategoryTitle } from '@/data/syndromeOutput'
import { fetchRequiredQuestions, fetchFollowUpQuestions, fetchProgramQuestions, batchSaveAnswers, computeAnswerSheet, saveAnswerCalcVals, getComputeAnswerRes } from '@/api/consultationDetail'
import { ZONE_PREFIX_MAP } from '@/data/selfFeature'
import type { ICalcVal } from '@/api/consultationDetail'
import type { IDetailQuestionItem, IDetailQuestionOption } from '@/types/consultationDetail'
import { useDetailQuestion } from '@/composables/useDetailQuestion'
import { useSelfFeature } from '@/composables/useSelfFeature'
import { useTonguePulseCapture } from '@/composables/useTonguePulseCapture'
import type { MeridianCodeType } from '@/types/meridian'
import MeridianBodyView from '@/components/business/meridian/MeridianBodyView.vue'
import CameraCapture from '@/components/CameraCapture.vue'
import PulseCollectionOverlay from '@/components/PulseCollectionOverlay.vue'
import type { PulseReadProgress } from '@/api/pulseAPI'

import './styles/ConsultationView.css'

// ── 用户信息 ─────────────────────────────────────────────────
const userStore = useUserStore()
const uiStore = useUIStore()
const sessionStore = useSessionStore()
const consultationStore = useConsultationStore()
const router = useRouter()
const userName = computed(() => userStore.userInfo.name || '朋友')
const userInfo = computed(() => userStore.userInfo)

/** 清理问题名称：去掉"问"前缀和"情况"/"状况"后缀，避免话术冗余 */
const cleanQuestionName = (name: string): string => {
  return name
    .replace(/^问/, '')
    .replace(/情况$/, '')
    .replace(/状况$/, '')
}

/** 获取有效举例文本：优先用选项名称，如果没有有效选项则用 kqihIllustrate 兜底 */
const getQuestionIllustrate = (q: { kqihIllustrate: string; kytOptions: { koihOption: string }[] }): string => {
  const labels = q.kytOptions
    .map(opt => opt.koihOption)
    .filter(opt => opt !== '暂无' && opt !== '无以上症状')
    .slice(0, 4)
  if (labels.length > 0) {
    return labels.join('、')
  }
  if (q.kqihIllustrate && q.kqihIllustrate !== '暂无') {
    return q.kqihIllustrate
  }
  return ''
}

/** 统一生成医生问话（清理名称 + 过滤无效举例 + 多模板适配） */
const buildDoctorQuestionText = (q: { kqihName: string; kqihIllustrate: string; kytOptions: { koihOption: string }[] }): string => {
  const cleanName = cleanQuestionName(q.kqihName)
  const illustrate = getQuestionIllustrate(q)
  const exampleText = illustrate ? `比如${illustrate}` : ''
  const name = q.kqihName

  // 0. 多症状列举：kqihName 本身就是多个症状的枚举（含"、"或"，"）
  //    → 直接问"是否有...的情况"，不加"比如"（因为名称本身就是选项的列举）
  if (name.includes('、') || name.includes('，')) {
    return `请问您有${cleanName}的情况吗？`
  }

  // 1. 颜色/色泽/面色 → "是什么样的"
  if (name.includes('颜色') || name.includes('色泽') || name.includes('面色')) {
    return `请问您的${cleanName}是什么样的？${exampleText}`
  }
  // 2. 频率/次数 → "频率如何"
  if (name.includes('频率') || name.includes('次数')) {
    return `请问${cleanName}的频率如何？${exampleText}`
  }
  // 3. 属性/状态类（睡眠、月经、食欲等）→ "怎么样"
  if (/睡眠|月经|经期|食欲|饮食|口味|口渴|小便|大便|汗|情绪|精神|体力|精力/.test(name)) {
    return `请问您的${cleanName}怎么样？${exampleText}`
  }
  // 4. 形态/表现类（大便形态、头痛表现等）→ "是什么样的"
  if (/形态|表现|舌象|舌苔|舌质/.test(name)) {
    return `请问您的${cleanName}是什么样的？${exampleText}`
  }
  // 5. 默认（症状/证型类：阴虚、血热、寒热等）→ "有...的情况吗"
  return `请问您有${cleanName}的情况吗？${exampleText}`
}

/** 倍速切换：1 → 1.25 → 1.5 → 1 循环 */
const cycleSpeed = () => {
  const next = uiStore.playbackSpeed === 1 ? 1.25 : uiStore.playbackSpeed === 1.25 ? 1.5 : 1
  uiStore.setPlaybackSpeed(next as 1 | 1.25 | 1.5)
}

// ── 对话记录 ─────────────────────────────────────────────────
const messages = ref<IChatMessage[]>([])
const chatAreaRef = ref<HTMLElement | null>(null)

// ── 流程状态 ─────────────────────────────────────────────────
const goToStepGeneration = ref(0) // 代次计数器：跳过/重新选择时递增，用于终止旧的异步流程
const currentStepId = ref<StepIdType>('initial')
const currentSymptom = ref('症状')
const detailBranch = ref<string>('')
const detailQuestionQueue = ref<string[]>([])
const detailIsFirstQuestion = ref<boolean>(true)

// ── API 驱动的详细问诊状态 ──────────────────────────────────────
/** 当前选中的父选项（等待用户选择子选项时暂存） */
const pendingParentOption = ref<{ questionId: string; optionId: string; label: string; category: string; questionText: string } | null>(null)
/** 当前展示的子选项（较轻/较重 或 其他类型的子选项） */
const apiChildOptions = ref<{ label: string; koihId: string; koihOptionCode?: string; semanticDesc?: string }[]>([])

/** 多选队列：存储待逐个处理子选项追问的选项列表 */
const multiSelectQueue = ref<IDetailQuestionOption[]>([])
/** 多选模式下已收集的 selectedOptionIds（最终一次性提交） */
const multiSelectCollectedIds = ref<string[]>([])
/** 多选模式下当前所属的问题 ID */
const multiSelectQuestionId = ref<string>('')

/** 判断题目是否支持多选：任意一个选项有 koihOptionMutualExclusion 字段即为多选 */
const isMultiSelectQuestion = (question: IDetailQuestionItem): boolean => {
  return question.kytOptions.some(opt => opt.koihOptionMutualExclusion != null)
}

/** 判断子选项是否为程度类（较轻/较重） */
const isSeverityChildren = (children: { label: string }[]): boolean => {
  return children.length >= 2 && children.every(c => c.label === '较轻' || c.label === '较重')
}

/** 判断当前是否处于程度追问状态（覆盖 API 模式 / 本地模式 / 自选症状模式） */
const isSeverityPending = (): boolean => {
  // API 模式：有父选项暂存 + 子选项是较轻/较重
  if (pendingParentOption.value && apiChildOptions.value.length > 0) {
    return isSeverityChildren(apiChildOptions.value)
  }
  // 本地模式：detail 的程度追问待处理
  if (detail.detailSeverityPending.value) {
    return true
  }
  // 自选症状模式：当前子步骤是 severity
  if (currentStepId.value === 'self_feature_question'
      && selfFeature.selfFeatureSubStep.value === 'severity') {
    return true
  }
  return false
}

// ── 舌脉采集状态 ─────────────────────────────────────────────
const isCapturing = ref(false)
const captureType = ref<'tongue_top' | 'tongue_bottom' | 'pulse' | null>(null)
const captureProgress = ref(0)
const captureCompleted = ref(false)
const captureProgressIntervalId = ref<number | null>(null)
const captureStartTimerId = ref<number | null>(null)
const autoAdvanceTimerId = ref<number | null>(null)
const analysisData = ref<typeof MOCK_ANALYSIS[string] | null>(null)
/** 脉诊笔 BLE 采集进度信息（connecting → collecting_cun/guan/chi → done） */
const pulsePhase = ref('')
const pulseMessage = ref('')

/** 脉诊采集丰富进度（含部位、压力、波形等） */
const pulseProgress = ref<PulseReadProgress>({
  phase: 'connecting',
  message: '',
  percent: 0,
})
const pulseOverlayRef = ref<InstanceType<typeof PulseCollectionOverlay> | null>(null)

/** 舌面拍照时是否显示摄像头预览 */
const showTongueCamera = computed(() =>
  isCapturing.value && captureType.value === 'tongue_top' && tonguePulseCapture.showCamera.value
)

// ── 证型输出状态 ─────────────────────────────────────────────
const syndromeOutputData = ref<ISyndromeOutput | null>(null)

// ── 输入框 ───────────────────────────────────────────────────
const inputText = ref('')
const isTyping = ref(false)
const clarificationCandidates = ref<string[]>([])

// ── TTS / LLM / 语音识别 ────────────────────────────────────
const ttsStore = useTTSStore()
const { isLoading: llmIsLoading, recognizeIntent, classifyOption, abort: abortLLM } = useLLM()
const { status: speechStatus, errorMessage: speechError, transcript: speechTranscript, startAndWait: startSpeechAndWait, stop: stopSpeech } = useSpeechRecognition()
const showVoiceToast = ref(false)
const showErrorToast = ref(false)
const errorToastText = ref('')
const voiceToastText = ref('正在聆听，请说话…') // 语音录音提示文本（支持动态更新）
// 键盘快捷键操作反馈 toast（蓝色，区别于红色错误 toast）
const showActionToast = ref(false)
const actionToastText = ref('')
let actionToastTimer: ReturnType<typeof setTimeout> | null = null
const isSkipping = ref(false) // 用户主动跳过朗读时设为 true，阻止 onError toast 弹出
let lastDoctorFullText = '' // 记录当前正在朗读的医生完整文本，跳过时用于强制补全文字
let interpretationAbortController: AbortController | null = null // Phase 2 LLM 解读请求控制器

// ── 空格键长按录音状态（独立于按钮 toggle 模式）──────────────────
const isLongPressRecording = ref(false) // 是否正在长按录音
let recordingDuration = 0 // 录音时长计数器（秒）
let durationTimer: number | null = null // 每秒更新定时器
let recordingTimeoutTimer: number | null = null // 60 秒超时定时器
let recordingPromise: Promise<string> | null = null // 存储 startAndWait 的 promise
let recordStartTime = 0 // 录音开始时间戳（用于最短时长检查）

// ── 异常回答关键词 ────────────────────────────────────────────
const { refusal: REFUSAL_KEYWORDS, uncertain: UNCERTAIN_KEYWORDS, guarantee: GUARANTEE_KEYWORDS, severityMild: SEVERITY_MILD_KEYWORDS, severityModerate: SEVERITY_MODERATE_KEYWORDS, severitySevere: SEVERITY_SEVERE_KEYWORDS } = KEYWORD_CONFIG
const invalidRetryCount = ref(0)

const buildDetailSummary = (answers: IDetailAnswer[]): string => {
  const merged = mergeSeverityDuplicates(answers)

  // 按分类分组，保持出现顺序
  const groups: { title: string; items: IDetailAnswer[] }[] = []
  for (const a of merged) {
    const title = getCategoryTitle(a.category)
    const existing = groups.find(g => g.title === title)
    if (existing) existing.items.push(a)
    else groups.push({ title, items: [a] })
  }

  // 格式化
  const lines = groups.map(g => {
    const entries = g.items.map(a => {
      if (a.label === '没有') {
        return a.questionText ? `${a.questionText} → ${a.label}` : a.label
      }
      return a.label
    })
    return `【${g.title}】${entries.join('、')}`
  })

  return lines.join('\n')
}

// ── 工具函数 ─────────────────────────────────────────────────
const scrollToBottom = async () => {
  await nextTick()
  if (chatAreaRef.value) {
    chatAreaRef.value.scrollTop = chatAreaRef.value.scrollHeight
  }
}

/** 在最新一条用户消息右下角标记 ✓（零耗时视觉反馈，替代 O_VALID 语音确认） */
const confirmLastUserMessage = () => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i]!.role === 'user') {
      messages.value[i]!.confirmed = true
      break
    }
  }
}

/** 显示键盘快捷键操作反馈（1.5 秒自动消失） */
const showActionFeedback = (msg: string) => {
  if (actionToastTimer) { clearTimeout(actionToastTimer); actionToastTimer = null }
  actionToastText.value = msg
  showActionToast.value = true
  actionToastTimer = setTimeout(() => {
    showActionToast.value = false
    actionToastTimer = null
  }, 1500)
}

const doctorSay = (text: string, delay = 300, persona: PersonaType = 'doctor') => {
  // 锁定当前句倍速（中途切换不影响本句，下一句生效）
  const speed = uiStore.playbackSpeed
  const gen = goToStepGeneration.value
  lastDoctorFullText = text
  return new Promise<void>((resolve) => {
    isTyping.value = true
    let msgIdx = -1
    setTimeout(async () => {
      await ttsStore.speakSync(text, persona, (char) => {
        if (msgIdx === -1) {
          msgIdx = messages.value.length
          messages.value.push({ role: persona, text: '' })
          isTyping.value = false
        }
        messages.value[msgIdx]!.text += char
        scrollToBottom()
      }, speed, () => {
        // TTS 失败：瞬间倾泻文字 + toast 告知用户原因（用户主动跳过时不弹 toast）
        if (isSkipping.value) return
        errorToastText.value = '语音服务暂时不可用，已切换为文字模式'
        showErrorToast.value = true
        setTimeout(() => { showErrorToast.value = false }, 5000)
      })
      if (msgIdx === -1) {
        messages.value.push({ role: persona, text })
      } else {
        messages.value[msgIdx]!.text = text
      }
      isTyping.value = false
      await scrollToBottom()
      // 代次变化（用户点击跳过或触发新流程）→ 静默退出，不执行后续步骤跳转
      if (goToStepGeneration.value !== gen) { resolve(); return }
      resolve()
    }, delay / speed)
  })
}

/** 跳过医生当前说话：停止TTS，瞬间显示完整文字，递增代次终止旧流程 */
const skipDoctorSay = () => {
  // 防抖：医生未在说话时不响应
  if (!isTyping.value && !ttsStore.isSpeaking) return
  isSkipping.value = true // 标记为主动跳过，阻止 onError toast
  ttsStore.stop()
  isTyping.value = false
  // 递增代次计数器，使所有进行中的旧异步流程静默退出
  goToStepGeneration.value++

  // 强制将最后一条医生/护士消息补全为完整文本
  // （ttsStop 会释放 speakSync 的 promise，doctorSay 中 await 之后的文字赋值
  //  可能因异步时序而延迟，此处同步补全确保用户立即看到完整文字）
  if (lastDoctorFullText) {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const msg = messages.value[i]!
      if (msg.role === 'doctor' || msg.role === 'nurse') {
        msg.text = lastDoctorFullText
        break
      }
    }
  }

  // 如果当前步骤有 autoAdvance（过渡步骤），跳过后流程不能断裂，需立即推进到下一步
  const flowStep = FLOW_STEPS[currentStepId.value]
  if (flowStep?.autoAdvance) {
    goToStep(flowStep.autoAdvance.nextStep)
  }
}

/** → 右键：跳过 TTS / 跳过问题 / 取消语音 */
const handleArrowRight = async () => {
  // 采集引导步骤 → 右键无响应（不能跳过采集引导语）
  const currentFlowStep = FLOW_STEPS[currentStepId.value]
  if (currentFlowStep?.captureType) return

  // 1. TTS 正在播报 → 停止语音 + 文字全显
  if (isTyping.value || ttsStore.isSpeaking) {
    skipDoctorSay()
    showActionFeedback('→ 已跳过语音')
    return
  }

  // 2. 语音识别中（正在录音）→ 取消识别 + 跳过问题
  if (speechStatus.value === 'listening') {
    stopSpeech()
    if (isSeverityPending()) {
      showActionFeedback('请用 ↑↓ 选择轻重程度')
      return
    }
    await onSubmitText('没有')
    showActionFeedback('→ 已取消并跳过')
    return
  }

  // 3. 语音识别中（正在处理）→ 停止等待 + 跳过问题
  if (speechStatus.value === 'processing') {
    stopSpeech()
    if (isSeverityPending()) {
      showActionFeedback('请用 ↑↓ 选择轻重程度')
      return
    }
    await onSubmitText('没有')
    showActionFeedback('→ 已取消并跳过')
    return
  }

  // 4. 程度追问中 → 不允许跳过
  if (isSeverityPending()) {
    showActionFeedback('请用 ↑↓ 选择轻重程度')
    return
  }

  // 5. API 详细问诊中 → 跳过当前问题（等同于说"没有"）
  if (currentStepId.value === 'detail_question') {
    await onSubmitText('没有')
    showActionFeedback('→ 已跳过该问题')
    return
  }

  // 6. 自选症状 — meridian 子步骤（跳过选择，进入确认页）
  //    第一轮（0条记录）→ 等同于"没有其他不适了" → 空数据进入确认
  //    第二轮+（N条记录）→ 等同于"没有了，就这些" → 带已有数据进入确认
  if (currentStepId.value === 'self_feature_question'
      && selfFeature.selfFeatureSubStep.value === 'meridian') {
    const label = selfFeature.selfFeatureRecords.value.length > 0
      ? '没有了，就这些'
      : '没有其他不适了'
    await selfFeature.handleSelfFeatureOptionClick(label)
    showActionFeedback('→ 已跳过自选症状')
    return
  }

  // 7. 自选症状 — continue 子步骤（不再添加，进入确认页）
  if (currentStepId.value === 'self_feature_question'
      && selfFeature.selfFeatureSubStep.value === 'continue') {
    await selfFeature.handleSelfFeatureOptionClick('没有了，就这些')
    showActionFeedback('→ 已确认提交')
    return
  }
}

/** ↑ 上键：选择"较轻" */
const handleArrowUp = async () => {
  if (!isSeverityPending()) return

  // API 模式
  if (pendingParentOption.value && apiChildOptions.value.length > 0) {
    await onSubmitText('较轻')
    showActionFeedback('↑ 已选择：较轻')
    return
  }

  // 本地模式
  if (detail.detailSeverityPending.value) {
    await detail.handleDetailOptionClick('较轻')
    showActionFeedback('↑ 已选择：较轻')
    return
  }

  // 自选症状模式
  if (selfFeature.selfFeatureSubStep.value === 'severity') {
    await selfFeature.handleSelfFeatureOptionClick('较轻')
    showActionFeedback('↑ 已选择：较轻')
    return
  }
}

/** ↓ 下键：选择"较重" */
const handleArrowDown = async () => {
  if (!isSeverityPending()) return

  // API 模式
  if (pendingParentOption.value && apiChildOptions.value.length > 0) {
    await onSubmitText('较重')
    showActionFeedback('↓ 已选择：较重')
    return
  }

  // 本地模式
  if (detail.detailSeverityPending.value) {
    await detail.handleDetailOptionClick('较重')
    showActionFeedback('↓ 已选择：较重')
    return
  }

  // 自选症状模式
  if (selfFeature.selfFeatureSubStep.value === 'severity') {
    await selfFeature.handleSelfFeatureOptionClick('较重')
    showActionFeedback('↓ 已选择：较重')
    return
  }
}

/** 键盘快捷键主入口 */
const handleKeyDown = (e: KeyboardEvent) => {
  // 只响应方向键和空格键
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== ' ') return

  // 焦点在输入框时不响应（避免干扰文字输入）
  const tag = (document.activeElement as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  // 采集阶段不响应
  if (isCapturing.value) return

  // LLM 处理中不响应
  if (llmIsLoading.value) return

  // 自动过渡步骤中，只允许 → 跳过 TTS，阻止 ↑↓ 和空格
  if (isAutoTransition.value && e.key !== 'ArrowRight') return

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault()
      handleArrowRight()
      break
    case 'ArrowUp':
      e.preventDefault()
      handleArrowUp()
      break
    case 'ArrowDown':
      e.preventDefault()
      handleArrowDown()
      break
    case ' ': // 空格键长按录音
      e.preventDefault() // 阻止页面滚动

      // 如果还没开始录音，启动录音
      // 使用 isLongPressRecording 防止按键重复事件触发多次
      if (!isLongPressRecording.value) {
        startVoiceRecording()
      }
      break
  }
}

/** 键盘松开事件处理器（用于空格键长按录音） */
const handleKeyUp = (e: KeyboardEvent) => {
  // 只响应空格键
  if (e.key !== ' ') return

  // 如果正在长按录音，停止录音
  if (isLongPressRecording.value) {
    e.preventDefault()
    stopVoiceRecording()
  }
}

/** 窗口失焦保护：强制停止录音 */
const handleWindowBlur = () => {
  if (isLongPressRecording.value) {
    stopVoiceRecording()
  }
}

const clearTimers = () => {
  if (autoAdvanceTimerId.value) { clearTimeout(autoAdvanceTimerId.value); autoAdvanceTimerId.value = null }
  if (captureStartTimerId.value) { clearTimeout(captureStartTimerId.value); captureStartTimerId.value = null }
  if (captureProgressIntervalId.value) { clearInterval(captureProgressIntervalId.value); captureProgressIntervalId.value = null }
  abortLLM()
  ttsStore.stop()
  // 取消 Phase 2 解读 LLM 请求（防止页面离开后回调写入已清空的数据）
  if (interpretationAbortController) { interpretationAbortController.abort(); interpretationAbortController = null }
  isCapturing.value = false
  captureType.value = null
  pulsePhase.value = ''
  pulseMessage.value = ''
  pulseProgress.value = { phase: 'connecting', message: '', percent: 0 }
  captureProgress.value = 0
  captureCompleted.value = false
}

/** 重置问诊状态并返回首页 */
const resetAndGoHome = () => {
  clearTimers()
  // 重置问诊 store 数据
  consultationStore.reset()
  // 重置对话记录
  messages.value = []
  // 重置流程状态
  currentStepId.value = 'initial'
  currentSymptom.value = '症状'
  detailBranch.value = ''
  detailQuestionQueue.value = []
  detailIsFirstQuestion.value = true
  // 重置详细问诊状态
  detail.detailQuestionCategory.value = 'chillHeat'
  detail.detailAskedCategories.value = new Set()
  detail.detailAnswers.value = []
  detail.detailSeverityPending.value = null
  detail.detailFailCount.value = 0
  detail.genderQuestionsInjected.value = false
  // 重置 API 详细问诊子选项 + 多选批量状态
  pendingParentOption.value = null
  apiChildOptions.value = []
  multiSelectQueue.value = []
  multiSelectCollectedIds.value = []
  multiSelectQuestionId.value = ''
  // 重置自选特征状态
  selfFeature.resetSelfFeature()
  // 重置分析数据
  analysisData.value = null
  syndromeOutputData.value = null
  // 重置其他状态
  invalidRetryCount.value = 0
  clarificationCandidates.value = []
  lastSnapshot.value = null
  // 返回首页
  router.push('/welcome')
}

// ── 初始化组合式函数（goToStep 通过 lambda 延迟引用，避免暂时性死区）──
const detail = useDetailQuestion({
  currentSymptom, messages, detailIsFirstQuestion, detailBranch, detailQuestionQueue,
  goToStep: (stepId, symptom?) => goToStep(stepId, symptom),
  doctorSay, scrollToBottom, confirmLastUserMessage,
})

const selfFeature = useSelfFeature({
  userInfo, messages,
  goToStep: (stepId, symptom?) => goToStep(stepId, symptom),
  doctorSay, scrollToBottom, confirmLastUserMessage,
})

// ── 舌脉采集 composable（真实 API 链路）──
const tonguePulseCapture = useTonguePulseCapture()

// ── 步骤计算 ─────────────────────────────────────────────────
const currentStep = computed(() => {
  if (currentStepId.value === 'detail_question') {
    // ── API 驱动模式：后端有问题列表时使用 ──
    const apiQuestion = consultationStore.getCurrentQuestion()

    if (apiQuestion) {
      // 子选项模式：用户选了有子选项的项，正在追问
      if (pendingParentOption.value && apiChildOptions.value.length > 0) {
        const isSeverity = isSeverityChildren(apiChildOptions.value)
        const childLabels = apiChildOptions.value.map(c => c.label).join('、')
        const doctorText = isSeverity
          ? `请问这个情况的程度是较轻还是较重？`
          : `请问以下哪种更符合您的情况？您可以直接说：${childLabels}`
        return {
          id: 'detail_question' as StepIdType,
          doctorText,
          options: apiChildOptions.value.map((child) => ({
            label: child.label,
            nextStep: 'detail_question' as StepIdType,
            payload: undefined,
          })) as IChatOption[],
          isFreeInput: true, isEnd: false,
        }
      }

      // 主问题模式：统一使用 buildDoctorQuestionText 生成话术
      const doctorText = buildDoctorQuestionText(apiQuestion)

      return {
        id: 'detail_question' as StepIdType,
        doctorText,
        options: apiQuestion.kytOptions.map((opt) => ({
          label: opt.koihOption,
          nextStep: 'detail_question' as StepIdType,
          payload: undefined,
        })) as IChatOption[],
        isFreeInput: true, isEnd: false,
      }
    }

    // ── 本地降级模式：API 没有数据时使用原有逻辑 ──
    if (detail.detailSeverityPending.value) {
      return {
        id: 'detail_question' as StepIdType,
        doctorText: `请问${detail.detailSeverityPending.value.subjectText}的程度是较轻还是较重？`,
        options: [
          { label: '较轻', nextStep: 'detail_question' as StepIdType, payload: undefined },
          { label: '较重', nextStep: 'detail_question' as StepIdType, payload: undefined },
        ] as IChatOption[],
        isFreeInput: false, isEnd: false,
      }
    }

    const question = detail.findQuestion(detail.detailQuestionCategory.value)
    if (!question) return FLOW_STEPS['detail_question']
    const answeredTaCodes = new Set(detail.detailAnswers.value.map(a => a.taCode))
    const filteredOptions = question.options.filter((opt) => {
      if (!opt.excludeAfter) return true
      return !opt.excludeAfter.some((excluded: string) => answeredTaCodes.has(excluded))
    })
    return {
      id: 'detail_question' as StepIdType,
      doctorText: question.doctorText,
      options: filteredOptions.map((opt) => ({ label: opt.label, nextStep: 'detail_question' as StepIdType, payload: undefined })) as IChatOption[],
      isFreeInput: question.isFreeInput ?? false, isEnd: false,
    }
  }
  if (currentStepId.value === 'self_feature_question') {
    return selfFeature.buildSelfFeatureStep()
  }
  return FLOW_STEPS[currentStepId.value]
})

// ── 意图步骤集合 ─────────────────────────────────────────────
const INTENT_STEPS: Set<StepIdType> = new Set([
  'initial', 'branch_a_free', 'branch_b_symptom', 'branch_b_clarify',
  'branch_c_condition', 'branch_c_clarify',
])
const isSelfFeaturePhase = computed(() =>
  currentStepId.value === 'self_feature_intro' || currentStepId.value === 'self_feature_question' || currentStepId.value === 'self_feature_summary'
)

const progressPercent = computed(() => {
  const phases: [Set<StepIdType>, number][] = [
    [new Set(['initial', 'branch_a_free', 'branch_b_symptom', 'branch_b_clarify', 'branch_c_condition', 'branch_c_clarify', 'severity', 'end_moderate']), 15],
    [new Set(['tongue_top_intro', 'tongue_bottom_intro', 'pulse_intro', 'pulse_done', 'analysis_review', 'analysis_normal', 'analysis_abnormal', 'analysis_continue', 'analysis_fail']), 40],
    [new Set(['detail_transition', 'detail_question', 'detail_summary', 'detail_done']), 70],
    [new Set(['self_feature_intro', 'self_feature_question', 'self_feature_summary', 'self_feature_done']), 85],
    [new Set(['syndrome_output']), 100],
  ]
  for (const [steps, percent] of phases) {
    if (steps.has(currentStepId.value)) return percent
  }
  return 0
})

const canReselect = computed(() => lastSnapshot.value !== null && !isTyping.value && !ttsStore.isSpeaking && !llmIsLoading.value && !currentStep.value.isEnd && !isCapturing.value)

/** 当前步骤是否为纯自动过渡（无需用户输入，自动跳到下一步） */
const isAutoTransition = computed(() => {
  const step = currentStep.value
  return step.autoAdvance && !step.isFreeInput && !(step.options && step.options.length > 0)
})

// ── LLM 结果处理 ─────────────────────────────────────────────
const SYMPTOM_ALIAS: Record<string, string> = {
  '伤风': '感冒', '外感': '感冒', '发热': '发热', '怕冷': '怕冷',
  '恶寒': '怕冷', '头疼': '头痛', '咳': '咳嗽', '流鼻涕': '感冒',
  '鼻塞': '感冒', '乏力': '慢性疲劳', '睡不着': '失眠', '多梦': '失眠',
  '血压高': '血压偏高', '肚子大': '腹型肥胖', '生气': '肝郁气滞',
}
const UNSUPPORTED_SYMPTOMS = new Set(['发热', '怕冷', '血压偏高', '腹型肥胖', '脂肪肝', '肝郁气滞'])

const processLLMResult = (result: IIntentResult): boolean => {
  if (result.intent === null) return false
  const isInConsultation = currentStepId.value === 'detail_question' || currentStepId.value === 'detail_summary'
    || currentStepId.value === 'self_feature_question' || currentStepId.value === 'self_feature_summary'
    || currentStepId.value === 'severity' || currentStepId.value === 'detail_transition'
    || currentStepId.value === 'detail_done' || currentStepId.value === 'tongue_top_intro'
    || currentStepId.value === 'tongue_bottom_intro' || currentStepId.value === 'pulse_intro'
    || currentStepId.value === 'pulse_done' || currentStepId.value === 'analysis_review'
    || currentStepId.value === 'analysis_abnormal' || currentStepId.value === 'analysis_fail'

  if (result.intent === 'none') {
    if (isInConsultation) return false
    if (result.subType === 'major_disease') goToStep('end_a_major')
    else if (result.subType === 'product') goToStep('end_a_product')
    else goToStep('end_a_other')
    return true
  }

  if (result.intent === 'acute') {
    const mapped = SYMPTOM_ALIAS[result.symptom!] || result.symptom
    if (mapped) {
      currentSymptom.value = mapped
      consultationStore.setMainSymptom(mapped)
      // 通过症状名映射到真实 kqmId（如 "感冒" → "588282635315314688"）
      const kqmId = sessionStore.findModelIdBySymptom(mapped)
      if (kqmId) {
        consultationStore.setQuestionModel(kqmId)
        if (import.meta.env.DEV) console.log(`[问诊] 症状"${mapped}" → kqmId="${kqmId}"`)
      } else {
        consultationStore.setQuestionModel(mapped)
        if (import.meta.env.DEV) console.warn(`[问诊] 未找到"${mapped}"对应的模型，暂存症状名`)
      }
    }
    if (UNSUPPORTED_SYMPTOMS.has(currentSymptom.value)) { goToStep('end_unsupported_symptom'); return true }
    if (result.severity === 'severe') {
      consultationStore.setSeverityLevel('severe')
      goToStep('end_severe'); return true
    }
    if (result.severity === 'moderate' || result.severity === 'mild') {
      consultationStore.setSeverityLevel(result.severity)
      goToStep('end_moderate'); return true
    }
    goToStep(mapped ? 'severity' : 'branch_b_symptom')
    return true
  }

  if (result.intent === 'chronic') {
    const mapped = SYMPTOM_ALIAS[result.symptom!] || result.symptom
    if (mapped) {
      currentSymptom.value = mapped
      consultationStore.setMainSymptom(mapped)
      // 通过症状名映射到真实 kqmId（如 "失眠" → "588282635315314688"）
      const kqmId = sessionStore.findModelIdBySymptom(mapped)
      if (kqmId) {
        consultationStore.setQuestionModel(kqmId)
        if (import.meta.env.DEV) console.log(`[问诊] 症状"${mapped}" → kqmId="${kqmId}"`)
      } else {
        consultationStore.setQuestionModel(mapped)
        if (import.meta.env.DEV) console.warn(`[问诊] 未找到"${mapped}"对应的模型，暂存症状名`)
      }
    }
    if (UNSUPPORTED_SYMPTOMS.has(currentSymptom.value)) { goToStep('end_unsupported_symptom'); return true }
    if (result.severity === 'severe') {
      consultationStore.setSeverityLevel('severe')
      goToStep('end_severe'); return true
    }
    if (result.severity === 'moderate' || result.severity === 'mild') {
      consultationStore.setSeverityLevel(result.severity)
      goToStep('end_moderate'); return true
    }
    goToStep(mapped ? 'severity' : 'branch_c_condition')
    return true
  }

  return false
}

// ── 快照 / 重新选择 ──────────────────────────────────────────
const lastSnapshot = ref<IStepSnapshot | null>(null)

const saveSnapshot = () => {
  lastSnapshot.value = {
    stepId: currentStepId.value, symptom: currentSymptom.value, messagesLength: messages.value.length,
    detailQuestionCategory: detail.detailQuestionCategory.value, detailBranch: detailBranch.value,
    detailQuestionQueue: [...detailQuestionQueue.value], detailAskedCategories: [...detail.detailAskedCategories.value],
    detailAnswers: [...detail.detailAnswers.value], detailIsFirstQuestion: detailIsFirstQuestion.value,
    detailSeverityPending: detail.detailSeverityPending.value ? { ...detail.detailSeverityPending.value } : null,
    detailFailCount: detail.detailFailCount.value, genderQuestionsInjected: detail.genderQuestionsInjected.value, invalidRetryCount: invalidRetryCount.value,
    selfFeatureSubStep: selfFeature.selfFeatureSubStep.value, selfFeatureRecords: [...selfFeature.selfFeatureRecords.value],
    selfFeatureCurrentLocation: selfFeature.selfFeatureCurrentLocation.value,
    selfFeatureCurrentLocationZone: selfFeature.selfFeatureCurrentLocationZone.value,
    selfFeatureCurrentSymptom: selfFeature.selfFeatureCurrentSymptom.value,
    selfFeatureCurrentSymptomCategory: selfFeature.selfFeatureCurrentSymptomCategory.value,
    selfFeatureCurrentSymptomBaseCode: selfFeature.selfFeatureCurrentSymptomBaseCode.value,
    selfFeatureCurrentSymptomFixedTaCode: selfFeature.selfFeatureCurrentSymptomFixedTaCode.value,
    selfFeatureCurrentMeridianCode: selfFeature.selfFeatureCurrentMeridianCode.value,
    selfFeatureCurrentMeridianName: selfFeature.selfFeatureCurrentMeridianName.value,
    selfFeatureExpandKey: selfFeature.selfFeatureExpandKey.value,
    analysisData: analysisData.value, syndromeOutputData: syndromeOutputData.value,
  }
}

const reselectCurrentAnswer = async () => {
  const snap = lastSnapshot.value
  if (!snap) return
  clearTimers(); ttsStore.stop()
  currentStepId.value = snap.stepId; currentSymptom.value = snap.symptom
  messages.value.splice(snap.messagesLength)
  detail.detailQuestionCategory.value = snap.detailQuestionCategory
  detailBranch.value = snap.detailBranch
  detailQuestionQueue.value = [...snap.detailQuestionQueue]
  detail.detailAskedCategories.value = new Set(snap.detailAskedCategories)
  detail.detailAnswers.value = [...snap.detailAnswers]
  detailIsFirstQuestion.value = snap.detailIsFirstQuestion
  detail.detailSeverityPending.value = snap.detailSeverityPending
  detail.detailFailCount.value = snap.detailFailCount
  detail.genderQuestionsInjected.value = snap.genderQuestionsInjected
  invalidRetryCount.value = snap.invalidRetryCount
  selfFeature.selfFeatureSubStep.value = snap.selfFeatureSubStep
  selfFeature.selfFeatureRecords.value = [...snap.selfFeatureRecords]
  selfFeature.selfFeatureCurrentLocation.value = snap.selfFeatureCurrentLocation
  selfFeature.selfFeatureCurrentLocationZone.value = snap.selfFeatureCurrentLocationZone
  selfFeature.selfFeatureCurrentSymptom.value = snap.selfFeatureCurrentSymptom
  selfFeature.selfFeatureCurrentSymptomCategory.value = snap.selfFeatureCurrentSymptomCategory
  selfFeature.selfFeatureCurrentSymptomBaseCode.value = snap.selfFeatureCurrentSymptomBaseCode
  selfFeature.selfFeatureCurrentSymptomFixedTaCode.value = snap.selfFeatureCurrentSymptomFixedTaCode
  selfFeature.selfFeatureCurrentMeridianCode.value = snap.selfFeatureCurrentMeridianCode as MeridianCodeType | ''
  selfFeature.selfFeatureCurrentMeridianName.value = snap.selfFeatureCurrentMeridianName
  selfFeature.selfFeatureExpandKey.value = snap.selfFeatureExpandKey
  analysisData.value = snap.analysisData; syndromeOutputData.value = snap.syndromeOutputData
  lastSnapshot.value = null
  await scrollToBottom()
}

// ── 步骤切换时重置计数 ───────────────────────────────────────
watch(currentStepId, () => {
  invalidRetryCount.value = 0; detail.resetCounters()
  clarificationCandidates.value = []
})

// ── 采集时序参数 ─────────────────────────────────────────────
// 注意：采集步骤已改为真实 API 调用（useTonguePulseCapture），不再使用固定延时

// ── 处理流程跳转 ─────────────────────────────────────────────
const goToStep = async (stepId: StepIdType, symptom?: string) => {
  clearTimers()
  isSkipping.value = false // 重置跳过标志，确保新流程中 TTS 失败时能正常弹出 toast
  // 递增代次计数器，使上一次 goToStep 的旧异步流程静默退出
  goToStepGeneration.value++
  const gen = goToStepGeneration.value
  // 锁定当前步骤倍速
  const speed = uiStore.playbackSpeed
  if (symptom) currentSymptom.value = symptom

  // detail_transition: API 与 TTS 并行执行（API 提前发起，TTS 播放期间等待结果）
  let fetchQuestionsPromise: Promise<void> | null = null

  // ── 从 severity 步骤离开时，自动记录严重程度 ──
  if (currentStepId.value === 'severity') {
    if (stepId === 'end_severe') consultationStore.setSeverityLevel('severe')
    else if (stepId === 'end_moderate') consultationStore.setSeverityLevel('mild')
  }

  if (UNSUPPORTED_SYMPTOMS.has(currentSymptom.value) && (stepId === 'severity' || stepId === 'detail_transition' || stepId === 'detail_question')) {
    stepId = 'end_unsupported_symptom'
  }

  currentStepId.value = stepId

  // ── 关键阶段衔接日志 ──
  if (stepId === 'detail_summary') {
    console.log('[详细问诊] 📋 进入汇总确认页')
  } else if (stepId === 'detail_done') {
    console.log('[详细问诊] ✅ 用户确认汇总 → 即将进入自选症状（3D模型）')
  } else if (stepId === 'self_feature_intro') {
    console.log('[详细问诊] 🧍 进入自选症状（3D经脉模型）')
  }

  const step = FLOW_STEPS[stepId]
  let text = step.doctorText

  // ── Phase 2 解读所需的函数级变量（由 syndrome_output 块内赋值，Phase 2 块读取）──
  let phase2Output: ISyndromeOutput | null = null
  let phase2KytFormulas: IKytFormula[] = []

  if (stepId === 'severity') {
    text = `请问您的【${currentSymptom.value}】严重吗？`
  }
  if (stepId === 'analysis_review') {
    // 优先使用真实采集数据（composable 已存入 store），降级使用 MOCK_ANALYSIS
    const realAnalysis = consultationStore.analysisData
    const mockData = MOCK_ANALYSIS[currentSymptom.value] ?? MOCK_ANALYSIS['感冒']!
    const data = realAnalysis ?? mockData
    analysisData.value = data
    if (!realAnalysis) {
      consultationStore.setAnalysisData(data)
    }
    text = `根据系统分析，我这边看到的情况如下，请您确认是否与您目前的状态相符：

舌象分析：
• 舌苔厚薄：${data.tongueCoating || '未检测到'}
• 舌苔颜色：${data.tongueCoatingColor || '未检测到'}
• 舌质颜色：${data.tongueColor || '未检测到'}
• 舌质大小：${data.tongueSize || '未检测到'}

脉象分析：
• 脉象特征：${data.pulseType}
• 脉搏次数：${data.pulseRate}次/分`
  }
  if (stepId === 'analysis_normal') text = generateResponse('ANALYSIS_CONFIRM_NORMAL', { symptom: currentSymptom.value })
  if (stepId === 'detail_transition') {
    text = generateResponse('DETAIL_TRANSITION', { symptom: currentSymptom.value })
    // 调用接口 7：获取必问问题（每次都重新获取，确保数据最新）
    if (import.meta.env.DEV) {
      console.log('[详细问诊] 进入 detail_transition 步骤:', {
        answerSheetId: consultationStore.answerSheetId,
        questionModel: consultationStore.questionModel,
        previousQuestionsLength: consultationStore.requiredQuestions.length,
      })
    }
    if (consultationStore.answerSheetId) {
      // 非阻塞：API 与后续 TTS 并行执行
      fetchQuestionsPromise = (async () => {
        try {
          const result = await fetchRequiredQuestions(
            consultationStore.answerSheetId,
            consultationStore.questionModel,
          )
          consultationStore.setRequiredQuestions(result.questionList)
          if (import.meta.env.DEV) {
            console.log('[详细问诊] 必问问题已更新:', result.questionList.length, '个问题')
            // ── 调试日志：打印每个选项的互斥组标识（验证单选/多选标志）──
            for (const q of result.questionList) {
              console.log(`[互斥组] ${q.kqihName} (${q.kqihId}):`)
              for (const opt of q.kytOptions) {
                console.log(`  → "${opt.koihOption}" mutualExclusion=${JSON.stringify(opt.koihOptionMutualExclusion)}`)
              }
            }
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.error('[详细问诊] 获取必问问题失败，将使用本地题库降级:', e)
          }
          // API 失败不阻断流程，继续使用本地题库
        }
      })()
    }
  }
  if (stepId === 'detail_question' && detailIsFirstQuestion.value) {
    // API 模式：使用 currentStep 生成的 doctorText
    if (consultationStore.getCurrentQuestion()) {
      text = currentStep.value.doctorText || ''
    } else {
      // 本地降级模式
      const firstCategory = detail.initFirstQuestion(currentSymptom.value)
      text = detail.getFirstQuestionText(currentSymptom.value, firstCategory)
    }
  }
  if (stepId === 'detail_summary') {
    console.log('[详细问诊] 📋 汇总数据:', detail.detailAnswers.value.length, '条答案')
    const summary = buildDetailSummary(detail.detailAnswers.value)
    console.log('[详细问诊] 📋 汇总文本:', summary || '(空)')
    text = generateResponse('DETAIL_SUMMARY', { summary })
  }
  if (stepId === 'self_feature_intro') {
    selfFeature.resetSelfFeature()
    text = '接下来，我请您在上面的人体经脉图上，点击您感觉不舒服的位置。每条经脉对应不同的脏腑和气血通道，您点上去就能看到经脉名称和基本信息。选好经脉之后，再告诉我是什么感觉，最多可以记录5处不适。'
  }
  if (stepId === 'self_feature_summary') text = selfFeature.getSummaryText()
  if (stepId === 'syndrome_output') {
    consultationStore.endConsultation()
    consultationStore.finalizeBackendPayload()

    // ── 保存经脉八维数值（接口 12）──
    const calcVals = buildCalcVals()
    if (calcVals.length > 0) {
      try {
        await saveAnswerCalcVals(consultationStore.answerSheetId, calcVals)
      } catch (e) {
        console.error('[经脉八维] ❌ 保存失败（不阻断流程）:', e)
      }
    } else {
      console.log('[经脉八维] 无自选记录，跳过保存')
    }

    // ── 获取辨证结果：computeAnswerSheet（触发计算） + getComputeAnswerRes（取结果）──
    let output: ISyndromeOutput
    let savedKytFormulas: IKytFormula[] = [] // ★ 提升到 try 外，供 Phase 2 LLM 解读使用
    const mockOutput = () => generateMockSyndromeOutput(currentSymptom.value, detail.detailAnswers.value, selfFeature.selfFeatureRecords.value, analysisData.value)

    // 1. 触发后端计算
    console.log('[辨证结果] 开始获取辨证结果...')
    try {
      const computeResult = await computeAnswerSheet(consultationStore.answerSheetId)
      console.log('[辨证结果] computeAnswerSheet 完成:', computeResult ? '有返回' : '无返回')
    } catch (e) {
      console.warn('[辨证结果] ⚠️ computeAnswerSheet 失败（继续尝试获取结果）:', e)
    }

    // 2. 获取计算结果
    try {
      const resData = await getComputeAnswerRes(consultationStore.answerSheetId)
      const obj = resData.obj

      // ── 调试日志：打印后端原始返回的 tuijianList ──
      console.log('[辨证结果] 📋 后端原始 tuijianList:', JSON.stringify(obj?.tuijianList, null, 2))
      console.log('[辨证结果] 📋 后端返回的所有字段:', Object.keys(obj || {}))

      // 保存方剂详情供 Phase 2 LLM 解读使用
      savedKytFormulas = obj?.kytFormulas || []

      // 从 kytFormulas 提取 F-code → 中文名映射
      const fCodeMap: Record<string, string> = {}
      if (obj?.kytFormulas?.length > 0) {
        for (const f of obj.kytFormulas as { kfName?: string; kfNameCn?: string }[]) {
          if (f.kfName && /^F\d+$/.test(f.kfName) && f.kfNameCn) {
            fCodeMap[f.kfName] = f.kfNameCn
          }
        }
        console.log('[辨证结果] F-code 映射表:', fCodeMap)
      }

      // 解析 graphicList 中的辨证结论（并将 F-code 替换为中文名）
      let syndromeConclusion: { key: string; val: string }[] = []
      if (obj?.graphicList?.length > 0) {
        const conclusionItem = obj.graphicList.find(g => g.value?.startsWith('['))
        if (conclusionItem) {
          try {
            const parsed = JSON.parse(conclusionItem.value)
            if (Array.isArray(parsed)) {
              syndromeConclusion = parsed.map((item: { key?: string; val?: string }) => {
                const code = String(item.key || '')
                const cnName = fCodeMap[code]
                // 显示格式：中文名 (F8) 或原始 code（若没有映射）
                const displayKey = cnName ? `${cnName} (${code})` : code
                return { key: displayKey, val: String(item.val || '') }
              })
            }
            console.log('[辨证结果] 辨证结论解析成功:', syndromeConclusion)
          } catch (e) {
            console.warn('[辨证结果] ⚠️ 辨证结论 JSON 解析失败:', conclusionItem.value, e)
          }
        }
      }

      // 检查数据是否有效（至少有推荐方案或辨证结论）
      const hasTuijian = obj?.tuijianList?.length > 0
      const hasConclusion = syndromeConclusion.length > 0

      if (hasTuijian || hasConclusion) {
        output = {
          isRealData: true,
          userInfo: { name: obj.name, sex: obj.sex, age: obj.age, time: obj.time },
          modelName: obj.modelName,
          syndromeConclusion,
          recommendations: obj.tuijianList || [],
        }
        console.log('[辨证结果] ✅ 使用真实 API 数据:', {
          modelName: output.modelName,
          结论数: syndromeConclusion.length,
          推荐数: output.recommendations!.length,
        })
      } else {
        console.warn('[辨证结果] ⚠️ API 返回数据为空，降级为 mock')
        output = mockOutput()
      }
    } catch (e) {
      console.error('[辨证结果] ❌ getComputeAnswerRes 失败，降级为 mock:', e)
      output = mockOutput()
    }

    syndromeOutputData.value = output
    consultationStore.setSyndromeOutput(output)
    // 保存到函数级变量，供 Phase 2 解读块读取
    phase2Output = output
    phase2KytFormulas = savedKytFormulas
    text = '好的，根据您提供的所有信息，辨证分析已经完成，以下是您的辨证分析报告：'
  }

  // 发送消息（特殊类型标记）
  if (stepId === 'analysis_review') {
    await doctorSay(text, 800); if (goToStepGeneration.value !== gen) return; const lastMsg = messages.value[messages.value.length - 1]; if (lastMsg) lastMsg.type = 'analysis'
  } else if (stepId === 'detail_summary') {
    await doctorSay(text, 800); if (goToStepGeneration.value !== gen) return; const lastMsg = messages.value[messages.value.length - 1]; if (lastMsg) lastMsg.type = 'summary'
  } else if (stepId === 'self_feature_summary') {
    await doctorSay(text, 800); if (goToStepGeneration.value !== gen) return; const lastMsg = messages.value[messages.value.length - 1]; if (lastMsg && selfFeature.selfFeatureRecords.value.length > 0) lastMsg.type = 'summary'
  } else if (stepId === 'syndrome_output') {
    // ── Phase 1：朗读引导语 + 报告卡片已渲染 ──
    await doctorSay(text, 1200); if (goToStepGeneration.value !== gen) return; const lastMsg = messages.value[messages.value.length - 1]; if (lastMsg) lastMsg.type = 'syndrome'

    // ── Phase 2：LLM 生成辨证解读 + 处方解读（仅真实数据模式）──
    if (phase2Output?.isRealData && (phase2Output.syndromeConclusion?.length || phase2Output.recommendations?.length)) {
      console.log('[辨证解读] Phase 2 开始：准备调用 LLM 生成解读')

      // 标记加载中（报告卡片底部显示"正在解读"指示器）
      if (syndromeOutputData.value) syndromeOutputData.value.interpretationLoading = true

      // 过渡话术 TTS 和 LLM 并行启动
      const transitionText = '让我为您详细解读一下辨证结果和处方。'

      // 构建 LLM 上下文
      const interpretationContext: IInterpretationContext = {
        userInfo: { name: phase2Output.userInfo?.name || '', sex: phase2Output.userInfo?.sex || '', age: phase2Output.userInfo?.age || '' },
        mainSymptom: currentSymptom.value,
        severity: consultationStore.severityLevel || '未评估',
        detailSummary: buildDetailSummary(detail.detailAnswers.value),
        syndromeConclusion: phase2Output.syndromeConclusion || [],
        kytFormulas: phase2KytFormulas,
        recommendations: phase2Output.recommendations || [],
      }
      console.log('[辨证解读] 上下文已构建:', {
        症状摘要长度: interpretationContext.detailSummary.length,
        结论数: interpretationContext.syndromeConclusion.length,
        方剂数: interpretationContext.kytFormulas.length,
        推荐数: interpretationContext.recommendations.length,
      })

      // 创建 AbortController 并启动 LLM 请求
      interpretationAbortController = new AbortController()
      const llmMessages = buildInterpretationMessages(interpretationContext)

      // 并行：TTS 朗读过渡语 + LLM 生成解读
      const llmPromise = fetchLLMCompletion(llmMessages, {
        maxTokens: 1024,
        temperature: 0.3,
        signal: interpretationAbortController.signal,
      })

      // 15 秒超时保护
      let interpretationTimeoutId: ReturnType<typeof setTimeout> = undefined!
      const timeoutPromise = new Promise<never>((_, reject) => {
        interpretationTimeoutId = setTimeout(() => reject(new Error('解读生成超时（15s）')), 15000)
      })

      // TTS 朗读过渡语（~2s，与 LLM 并行）
      await doctorSay(transitionText)
      if (goToStepGeneration.value !== gen) {
        interpretationAbortController.abort()
        interpretationAbortController = null
        clearTimeout(interpretationTimeoutId)
        return
      }

      // 等待 LLM 返回（TTS 期间可能已经返回了）
      try {
        const raw = await Promise.race([llmPromise, timeoutPromise])
        clearTimeout(interpretationTimeoutId)
        interpretationAbortController = null

        if (goToStepGeneration.value !== gen) {
          console.log('[辨证解读] 代次已变化，丢弃 LLM 结果')
          return
        }

        console.log('[辨证解读] LLM 原始返回长度:', raw.length)
        const result = parseInterpretationResult(raw)

        if (result && syndromeOutputData.value) {
          // 安全赋值：确认 syndromeOutputData 未被清空
          if (result.syndromeInterpretation) {
            syndromeOutputData.value.syndromeInterpretation = result.syndromeInterpretation
          }
          if (result.prescriptionInterpretation) {
            syndromeOutputData.value.prescriptionInterpretation = result.prescriptionInterpretation
          }
          // 同步到 store（确保导出数据时包含解读内容）
          consultationStore.setSyndromeOutput(syndromeOutputData.value)
          console.log('[辨证解读] ✅ 解读已生成并渲染:', {
            辨证解读长度: result.syndromeInterpretation.length,
            处方解读长度: result.prescriptionInterpretation.length,
          })
          scrollToBottom()
        } else {
          console.warn('[辨证解读] ⚠️ LLM 返回解析失败或字段为空')
        }
      } catch (e) {
        clearTimeout(interpretationTimeoutId)
        interpretationAbortController = null
        if (e instanceof Error && e.name === 'AbortError') {
          console.log('[辨证解读] LLM 请求已取消（用户离开）')
        } else {
          console.warn('[辨证解读] ⚠️ LLM 调用失败，跳过解读:', e)
        }
      } finally {
        if (syndromeOutputData.value) {
          syndromeOutputData.value.interpretationLoading = false
        }
      }
    }
  } else if (stepId === 'analysis_normal') {
    // 静默过渡：不播报，等 autoAdvance 自动跳到 detail_transition
  } else if (text) {
    await doctorSay(text)
  }

  // detail_transition: TTS 播放期间 API 并行执行，此处等待结果
  if (fetchQuestionsPromise) {
    await fetchQuestionsPromise
  }

  // 代次变化（用户跳过）→ 不启动采集和自动推进
  if (goToStepGeneration.value !== gen) return

  // ── 舌脉采集步骤：调用真实 API 链路（替代旧的模拟动画）──
  // 采集步骤不再使用 autoAdvance，由 composable 控制流程推进
  if (step.captureType) {
    // 立即显示采集浮层
    isCapturing.value = true
    captureType.value = step.captureType
    captureProgress.value = 0
    captureCompleted.value = false

    try {
      if (stepId === 'tongue_top_intro') {
        await tonguePulseCapture.stepTongueTop()
        if (goToStepGeneration.value !== gen) return
        captureCompleted.value = true
        await new Promise(r => setTimeout(r, 300))
        if (goToStepGeneration.value !== gen) return
        isCapturing.value = false
        goToStep('pulse_intro')  // 跳过舌底拍照，直接进入脉诊
      } else if (stepId === 'pulse_intro') {
        // 脉搏采集 + AI分析 + 问题获取 + 自动匹配（全自动）
        pulsePhase.value = ''
        pulseMessage.value = ''
        pulseProgress.value = { phase: 'connecting', message: '', percent: 0 }
        await tonguePulseCapture.stepAnalyzeAndMatch((progress) => {
          pulsePhase.value = progress.phase
          pulseMessage.value = progress.message
          pulseProgress.value = progress
          // 波形数据直接推送到 Canvas（绕过 Vue 响应式）
          if (progress.pulseValue) {
            pulseOverlayRef.value?.pushPulseValue(progress.pulseValue)
          }
        })
        pulsePhase.value = 'done'
        pulseMessage.value = ''
        if (goToStepGeneration.value !== gen) return
        captureCompleted.value = true
        await new Promise(r => setTimeout(r, 300))
        if (goToStepGeneration.value !== gen) return
        isCapturing.value = false
        goToStep('pulse_done')
      }
    } catch (e) {
      isCapturing.value = false
      if (import.meta.env.DEV) {
        console.error('[采集] 流程中断:', e)
      }
      // 采集失败时不自动跳转，等待用户操作（analysis_fail 选项可重新采集）
      tonguePulseCapture.resetCapture()
      // 显示错误提示
      const errorMsg = e instanceof Error ? e.message : '采集过程出现错误'
      await doctorSay(`${errorMsg}，请确认设备和网络正常后重新采集。`)
    }
    return  // 采集步骤不走下面的 autoAdvance 逻辑
  }

  // 非采集步骤：保留原有的 autoAdvance 定时器逻辑
  if (step.autoAdvance) {
    autoAdvanceTimerId.value = window.setTimeout(() => { clearTimers(); goToStep(step.autoAdvance!.nextStep) }, step.autoAdvance.delay / speed)
  }
}

// ── 处理 analysis_review 确认：保存舌脉数据到后端 ──────────────────
// 按钮点击和语音输入两条路径共用，确保无论用户通过哪种方式确认都能触发保存
async function handleAnalysisConfirm() {
  if (consultationStore.tongueReport && !consultationStore.tonguePulseSaved) {
    try {
      await tonguePulseCapture.stepSave()
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('[保存] 舌脉答案保存失败:', e)
      }
      // 保存失败不阻断流程，继续推进
    }
  }
}

// ── API 驱动的详细问诊选项处理 ──────────────────────────────────
// 处理用户选择（按钮或语音 LLM 分类后都调此函数）
async function handleApiDetailOption(label: string, originalText?: string) {
  const apiQuestion = consultationStore.getCurrentQuestion()
  if (!apiQuestion) return

  // ── 子选项模式：用户正在选择较轻/较重 ──
  if (pendingParentOption.value && apiChildOptions.value.length > 0) {
    const selectedChild = apiChildOptions.value.find(c => c.label === label)
    if (selectedChild) {
      // 同步到汇总显示用的 detailAnswers（两种模式都需要）
      detail.detailAnswers.value.push({
        taCode: selectedChild.koihOptionCode || selectedChild.koihId,
        label: `${pendingParentOption.value.label}(${selectedChild.label})`,
        category: pendingParentOption.value.category,
        questionText: pendingParentOption.value.questionText,
      })

      // 先保存 questionId，再清除子选项状态
      const savedQuestionId = pendingParentOption.value.questionId
      pendingParentOption.value = null
      apiChildOptions.value = []

      // ── 多选批量模式：收集子选项 ID，处理队列中下一个 ──
      // 用 multiSelectQuestionId 判断是否在多选模式（队列 shift 后可能已空）
      if (multiSelectQuestionId.value) {
        multiSelectCollectedIds.value.push(selectedChild.koihId)
        await processNextMultiSelectItem()
        return
      }

      // ── 单选模式：直接提交 ──
      consultationStore.addDetailSelectedAnswer({
        questionId: savedQuestionId,
        selectedOptionIds: [selectedChild.koihId],
      })
      await advanceApiQuestion()
      return
    }
    // 未匹配到子选项，清除状态并推进
    pendingParentOption.value = null
    apiChildOptions.value = []
    if (multiSelectQuestionId.value) {
      await processNextMultiSelectItem()
    } else {
      await advanceApiQuestion()
    }
    return
  }

  // ── 主问题模式：用户选择了一个选项 ──
  const selectedOption = apiQuestion.kytOptions.find(opt => opt.koihOption === label)
  if (!selectedOption) {
    // 未匹配到选项（用户说"没有"），跳过此题
    await advanceApiQuestion()
    return
  }

  if (selectedOption.koihHasChild === 1 && selectedOption.koihChildsOption.length > 0) {
    const severityChildren = isSeverityChildren(selectedOption.koihChildsOption.map(c => ({ label: c.koihOption })))

    // ── 程度类子选项（较轻/较重）：自动检测程度关键词，一步完成 ──
    if (severityChildren) {
      let autoSeverity: '较轻' | '较重' | null = null
      if (originalText) {
        if (/一点|轻微|不太|稍微|有点|轻度|不怎么|较轻/.test(originalText)) {
          autoSeverity = '较轻'
        } else if (/很|挺|比较|特别|严重|重度|蛮|较重/.test(originalText)) {
          autoSeverity = '较重'
        }
      }

      // 如果自动识别到程度，一步完成
      if (autoSeverity) {
        const child = selectedOption.koihChildsOption.find(c => c.koihOption === autoSeverity)
        if (child) {
          if (import.meta.env.DEV) {
            console.log('[详细问诊] 自动识别程度:', autoSeverity, '一步完成记录')
          }
          consultationStore.addDetailSelectedAnswer({
            questionId: apiQuestion.kqihId,
            selectedOptionIds: [child.koihId],
          })
          // 同步到汇总显示用的 detailAnswers
          detail.detailAnswers.value.push({
            taCode: child.koihOptionCode || child.koihId,
            label: `${selectedOption.koihOption}(${child.koihOption})`,
            category: apiQuestion.kqihName,
            questionText: buildDoctorQuestionText(apiQuestion),
          })
          await advanceApiQuestion()
          return
        }
      }
    }

    // ── 设置子选项状态（程度类和通用类共用）──
    pendingParentOption.value = {
      questionId: apiQuestion.kqihId,
      optionId: selectedOption.koihId,
      label: selectedOption.koihOption,
      category: apiQuestion.kqihName,
      questionText: buildDoctorQuestionText(apiQuestion),
    }
    apiChildOptions.value = selectedOption.koihChildsOption.map(child => ({
      label: child.koihOption,
      koihId: child.koihId,
      koihOptionCode: child.koihOptionCode,
      semanticDesc: child.koihOpIllustrate || undefined,
    }))

    // ── 生成追问语并语音播报 ──
    if (severityChildren) {
      if (import.meta.env.DEV) {
        console.log('[详细问诊] 程度类子选项，追问程度:', selectedOption.koihOption)
      }
      await doctorSay('请问这个情况的程度是较轻还是较重？')
    } else {
      const childLabels = apiChildOptions.value.map(c => c.label).join('、')
      if (import.meta.env.DEV) {
        console.log('[详细问诊] 通用子选项，追问:', selectedOption.koihOption, '→', childLabels)
      }
      await doctorSay(`请问以下哪种更符合您的情况？您可以直接说：${childLabels}`)
    }
    return
  }

  // 无子选项：直接记录答案并推进
  consultationStore.addDetailSelectedAnswer({
    questionId: apiQuestion.kqihId,
    selectedOptionIds: [selectedOption.koihId],
  })
  // 同步到汇总显示用的 detailAnswers
  detail.detailAnswers.value.push({
    taCode: selectedOption.koihOptionCode || selectedOption.koihId,
    label: selectedOption.koihOption,
    category: apiQuestion.kqihName,
    questionText: buildDoctorQuestionText(apiQuestion),
  })
  await advanceApiQuestion()
}

// ── API 模式多选处理：用户一句话说了多个选项 ──────────────────────
async function handleApiDetailBatchSelect(labels: string[]) {
  const apiQuestion = consultationStore.getCurrentQuestion()
  if (!apiQuestion) return

  // ① 查找选项对象
  const selectedOptions = labels
    .map(label => apiQuestion.kytOptions.find(opt => opt.koihOption === label))
    .filter((opt): opt is IDetailQuestionOption => opt != null)

  if (selectedOptions.length === 0) {
    console.warn('[多选] 未找到匹配的选项，跳过')
    await advanceApiQuestion()
    return
  }

  if (import.meta.env.DEV) {
    console.log('[多选] 匹配到选项:', selectedOptions.map(o => o.koihOption))
  }

  // ② 互斥检查：遍历所有选项对，检查 mutualExclusion
  const conflicts: [IDetailQuestionOption, IDetailQuestionOption][] = []
  for (let i = 0; i < selectedOptions.length; i++) {
    for (let j = i + 1; j < selectedOptions.length; j++) {
      const a = selectedOptions[i]!
      const b = selectedOptions[j]!
      const aExcludes = a.koihOptionMutualExclusion || []
      const bExcludes = b.koihOptionMutualExclusion || []
      if (aExcludes.includes(b.koihOptionCode) || bExcludes.includes(a.koihOptionCode)) {
        conflicts.push([a, b])
      }
    }
  }

  // ③ 有冲突 → 追问用户
  if (conflicts.length > 0) {
    const [optA, optB] = conflicts[0]!
    const question = `您说的【${optA.koihOption}】和【${optB.koihOption}】不能同时选择，请问具体是哪一种？`
    console.log('[多选] 互斥冲突:', optA.koihOption, 'vs', optB.koihOption)
    await doctorSay(question)
    return
  }

  // ④ 无冲突 → 初始化多选状态
  multiSelectCollectedIds.value = []
  multiSelectQuestionId.value = apiQuestion.kqihId

  // 分类：有子选项的放入队列逐个追问，无子选项的直接记录
  const queueItems: IDetailQuestionOption[] = []
  for (const opt of selectedOptions) {
    if (opt.koihHasChild === 1 && opt.koihChildsOption.length > 0) {
      queueItems.push(opt)
    } else {
      // 无子选项 → 直接记录
      multiSelectCollectedIds.value.push(opt.koihId)
      detail.detailAnswers.value.push({
        taCode: opt.koihOptionCode || opt.koihId,
        label: opt.koihOption,
        category: apiQuestion.kqihName,
        questionText: buildDoctorQuestionText(apiQuestion),
      })
    }
  }

  // ⑤ 如果全部无子选项 → 直接提交
  if (queueItems.length === 0) {
    consultationStore.addDetailSelectedAnswer({
      questionId: apiQuestion.kqihId,
      selectedOptionIds: [...multiSelectCollectedIds.value],
    })
    multiSelectCollectedIds.value = []
    multiSelectQueue.value = []
    await advanceApiQuestion()
    return
  }

  // ⑥ 有子选项需要逐个追问 → 设置队列，开始第一个
  multiSelectQueue.value = queueItems
  await processNextMultiSelectItem()
}

/** 处理多选队列中的下一个选项（追问子选项或直接提交） */
async function processNextMultiSelectItem() {
  if (multiSelectQueue.value.length === 0) {
    // 队列清空 → 提交所有收集的 ID
    const apiQuestion = consultationStore.getCurrentQuestion()
    if (apiQuestion) {
      consultationStore.addDetailSelectedAnswer({
        questionId: multiSelectQuestionId.value,
        selectedOptionIds: [...multiSelectCollectedIds.value],
      })
    }
    multiSelectCollectedIds.value = []
    multiSelectQuestionId.value = ''
    await advanceApiQuestion()
    return
  }

  // 取出队列第一个选项，设置 pendingParentOption 进入子选项模式
  const currentOpt = multiSelectQueue.value.shift()!
  const severityChildren = currentOpt.koihChildsOption.filter(
    c => c.koihOption === '较轻' || c.koihOption === '较重'
  )
  const isSeverity = severityChildren.length >= 2

  pendingParentOption.value = {
    questionId: multiSelectQuestionId.value,
    optionId: currentOpt.koihId,
    label: currentOpt.koihOption,
    category: consultationStore.getCurrentQuestion()?.kqihName || '',
    questionText: buildDoctorQuestionText(consultationStore.getCurrentQuestion()!),
  }
  apiChildOptions.value = currentOpt.koihChildsOption.map(child => ({
    label: child.koihOption,
    koihId: child.koihId,
    koihOptionCode: child.koihOptionCode,
    semanticDesc: child.koihOpIllustrate || undefined,
  }))

  // 追问
  if (isSeverity) {
    await doctorSay(`${currentOpt.koihOption}的程度是较轻还是较重？`)
  } else {
    const childLabels = apiChildOptions.value.map(c => c.label).join('、')
    await doctorSay(`${currentOpt.koihOption}请问以下哪种更符合？您可以直接说：${childLabels}`)
  }
}

// ── 累加自选症状的经脉八维数值 ──────────────────────────────────
function buildCalcVals(): ICalcVal[] {
  const records = selfFeature.selfFeatureRecords.value
  console.log('[经脉八维] 开始累加，共', records.length, '条自选记录')

  const accumulator = new Map<string, number>()

  for (const r of records) {
    if (!r.meridianCode || !r.symptomCategory || !r.symptomBaseCode) {
      console.warn('[经脉八维] ⚠️ 跳过不完整记录:', r)
      continue
    }

    // 经脉辨证码: meridianCode + symptomCategory (如 JM1 + K → JM1K)
    const meridianCode = `${r.meridianCode}${r.symptomCategory}`
    // 八维辨证码: zonePrefix + symptomBaseCode (如 S + RT → SRT)
    const zonePrefix = ZONE_PREFIX_MAP[r.locationZone] || 'S'
    const eightCode = `${zonePrefix}${r.symptomBaseCode}`

    accumulator.set(meridianCode, (accumulator.get(meridianCode) || 0) + r.severity)
    accumulator.set(eightCode, (accumulator.get(eightCode) || 0) + r.severity)
  }

  const calcVals: ICalcVal[] = Array.from(accumulator.entries()).map(([code, val]) => ({
    code,
    val,
  }))

  console.log('[经脉八维] 累加结果:', calcVals.length, '个码 →', JSON.stringify(calcVals))
  return calcVals
}

// ── 推进到下一题或进入保存流程 ──────────────────────────────────
async function advanceApiQuestion() {
  consultationStore.advanceQuestionIndex()
  const nextQuestion = consultationStore.getCurrentQuestion()

  if (nextQuestion) {
    // 还有题目，展示下一题
    detailIsFirstQuestion.value = false
    console.log(`[详细问诊] 下一题 (${consultationStore.detailPhase}): ${nextQuestion.kqihName}`)
    const questionText = buildDoctorQuestionText(nextQuestion)
    await doctorSay(questionText)
    return
  }

  // 当前阶段题目全部答完
  console.log(`[详细问诊] === ${consultationStore.detailPhase} 阶段全部答完 ===`)
  if (consultationStore.detailPhase === 'required') {
    // 必问问题答完 → 保存 → 获取追问
    await saveAndFetchFollowUp()
  } else if (consultationStore.detailPhase === 'followUp') {
    // 追问答完 → 保存 → 获取补充问题
    await saveFollowUpAndFetchProgram()
  } else if (consultationStore.detailPhase === 'program') {
    // 补充答完 → 保存 → 进入 detail_summary
    await saveProgramAnswers()
  }
}

// ── 通用答案保存（含单选题冲突自动剔除重试）──────────────────────
async function saveAnswersWithRetry(phase: string): Promise<void> {
  let answers = [...consultationStore.detailSelectedAnswers]

  // 没有追问答案时跳过保存（后端不接受空数组）
  if (answers.length === 0) {
    console.log(`[详细问诊] ${phase}无追问答案，跳过保存`)
    return
  }

  console.log(`[详细问诊] === ${phase}答案开始保存 ===`)
  console.log(`[详细问诊] answerSheetId:`, consultationStore.answerSheetId)
  console.log(`[详细问诊] 共 ${answers.length} 条答案:`, JSON.stringify(answers))

  let retryCount = 0
  const maxRetries = 5

  while (retryCount <= maxRetries) {
    try {
      await batchSaveAnswers({
        answerSheetId: consultationStore.answerSheetId,
        kqmId: consultationStore.questionModel,
        dialecticCount: '1',
        answers,
      })
      console.log(`[详细问诊] ✅ ${phase}答案保存成功（${answers.length} 条）`)
      return
    } catch (e: unknown) {
      const err = e as { message?: string }
      const msg = err?.message || ''
      const match = msg.match(/questionId[:\s：]+([A-Fa-f0-9]+)/i)

      if (match && (msg.includes('单选') || msg.includes('选择一个'))) {
        const badId = match[1]
        retryCount++
        console.warn(`[详细问诊] ⚠️ ${phase}保存失败（第 ${retryCount} 次）: 单选题冲突 → questionId: ${badId}`)

        const before = answers.length
        answers = answers.filter(a => a.questionId !== badId)
        console.log(`[详细问诊] 已剔除冲突题目 ${badId}，答案从 ${before} 条减为 ${answers.length} 条`)

        if (answers.length === 0) {
          console.error(`[详细问诊] ❌ ${phase}答案全部被剔除，放弃保存`)
          return
        }
        // 继续下一轮重试
      } else {
        // 非单选题错误，不重试
        console.error(`[详细问诊] ❌ ${phase}答案保存失败（不重试）:`, msg)
        return
      }
    }
  }

  console.error(`[详细问诊] ❌ ${phase}答案保存失败：重试 ${maxRetries} 次后仍有冲突，放弃`)
}

// ── 保存必问答案 + 获取追问问题 ──────────────────────────────────
async function saveAndFetchFollowUp() {
  // 打印当前状态，帮助排查问题
  console.log('[详细问诊] === 必问问题答完，开始保存 ===')
  console.log('[详细问诊] answerSheetId:', consultationStore.answerSheetId)
  console.log('[详细问诊] questionModel:', consultationStore.questionModel)

  await saveAnswersWithRetry('必问')

  // 获取追问问题
  console.log('[详细问诊] --- 开始获取追问问题 ---')
  try {
    const result = await fetchFollowUpQuestions(
      consultationStore.answerSheetId,
      consultationStore.questionModel,
    )
    console.log('[详细问诊] 追问问题获取成功:', result.questionList.length, '个问题')
    if (result.questionList.length > 0) {
      // 清空答案收集，切换到追问阶段
      consultationStore.resetDetailAnswers()
      consultationStore.setFollowUpQuestions(result.questionList)
      detailIsFirstQuestion.value = false
      // 展示第一个追问问题
      const firstQ = result.questionList[0]!
      const questionText = buildDoctorQuestionText(firstQ)
      await doctorSay(questionText)
      return
    }
    console.log('[详细问诊] 无追问问题，进入下一阶段')
  } catch (e) {
    console.error('[详细问诊] ❌ 获取追问问题失败:', e)
  }

  // 无追问或获取失败 → 继续获取补充问题（接口 10）
  console.log('[详细问诊] 无追问问题，继续获取补充问题')
  await saveFollowUpAndFetchProgram()
}

// ── 保存追问答案 + 获取补充问题 ──────────────────────────────────
async function saveFollowUpAndFetchProgram() {
  // 1. 保存追问答案
  console.log('[详细问诊] === 追问答完，开始保存 ===')
  console.log('[详细问诊] answerSheetId:', consultationStore.answerSheetId)

  await saveAnswersWithRetry('追问')

  // 2. 获取补充问题
  console.log('[详细问诊] --- 开始获取补充问题 ---')
  try {
    const result = await fetchProgramQuestions(
      consultationStore.answerSheetId,
      consultationStore.questionModel,
    )
    if (result.questionList.length > 0) {
      console.log('[详细问诊] 补充问题获取成功:', result.questionList.length, '个问题')
      // 有补充问题：清空答案收集，切换到补充阶段
      consultationStore.resetDetailAnswers()
      consultationStore.setProgramQuestions(result.questionList)
      detailIsFirstQuestion.value = false
      // 展示第一个补充问题
      const firstQ = result.questionList[0]!
      const questionText = buildDoctorQuestionText(firstQ)
      await doctorSay(questionText)
      return
    }
    console.log('[详细问诊] 无补充问题，进入汇总')
  } catch (e) {
    console.error('[详细问诊] ❌ 获取补充问题失败（流程继续）:', e)
  }

  // 3. 无补充问题或获取失败 → 进入 detail_summary
  console.log('[详细问诊] → 进入 detail_summary（汇总确认）')
  consultationStore.detailPhase = 'done'
  await goToStep('detail_summary')
}

// ── 保存补充答案 ──────────────────────────────────────────────
async function saveProgramAnswers() {
  console.log('[详细问诊] === 补充答完，开始保存 ===')
  console.log('[详细问诊] answerSheetId:', consultationStore.answerSheetId)

  await saveAnswersWithRetry('补充')

  console.log('[详细问诊] → 进入 detail_summary（汇总确认）')
  consultationStore.detailPhase = 'done'
  await goToStep('detail_summary')
}

// ── 第三层级兜底追问 ─────────────────────────────────────────
const buildFallbackQuestion = (): string => {
  const stepId = currentStepId.value; const symptom = currentSymptom.value
  const step = currentStep.value; const optionLabels = step.options?.map(opt => opt.label).join('、') ?? ''

  if (step.isEnd) return generateResponse('D_REFUSAL')

  switch (stepId) {
    case 'initial': return '为了准确了解您的情况，请问您是有突发不适症状，还是想调理亚健康状态？您可以直接说"突发不适""调理亚健康"或"都不是"。'
    case 'severity': return `您说的我没太理解，请问您的【${symptom || '症状'}】是特别严重、比较难受，还是只有一点点不舒服？您可以直接说"很严重""比较重"或"较轻"。`
    case 'analysis_review': return '您说的我没太理解，请问舌脉分析结果和您的实际情况是否相符？如果感觉不太准，可以说"不对"或"有问题"；如果相符，可以说"对的"或"没问题"。'
    case 'analysis_abnormal': return '您说的我没太理解，请问您是想继续通过药食同源产品调理，还是想先去医院检查一下？您可以直接说"继续调理"或"去医院"。'
    case 'analysis_fail': return '您说的我没太理解，请问是想重新采集舌脉信息，还是暂时不采集了？您可以直接说"重新采集"或"算了，暂时不采"。'
    case 'detail_summary': return '您说的我没太理解，请问前面的问诊信息是否准确无误？您可以直接说"确认提交"或者"需要修改，重新填写"。'
    case 'self_feature_summary': return '您说的我没太理解，请问自选特征信息是否确认无误？您可以直接说"确认提交"或者"选错了，重新选择"。'
    case 'branch_a_free': return '方便再具体说一下您的需求吗？比如您是想了解产品、有重大疾病需要就医，还是其他方面的问题？'
    case 'branch_b_symptom': return '方便再具体说一下您的不适吗？比如是感冒、头痛、咳嗽，还是其他症状？'
    case 'branch_b_clarify': return '方便描述一下您的具体不适吗？比如头痛、发热、怕冷、流鼻涕等？'
    case 'branch_c_condition': return '方便再具体说一下您亚健康的表现吗？比如是慢性疲劳、失眠，还是其他状态？'
    case 'branch_c_clarify': return '方便描述一下您的具体状态吗？比如乏力、血压偏高、肝郁气滞等？'
    case 'end_a_other': return '您可以直接说"我想重新问诊"继续问诊，或说"确实不需要"结束本次对话。'
    default: break
  }

  if (stepId === 'detail_question') {
    // API 子选项模式（追问）
    if (pendingParentOption.value && apiChildOptions.value.length > 0) {
      const labels = apiChildOptions.value.map(c => c.label).join('、')
      const isSeverity = isSeverityChildren(apiChildOptions.value)
      if (isSeverity) {
        return `您说的我没太理解，请问这个情况的程度是较轻还是较重？您可以直接说：${labels}。`
      }
      return `您说的我没太理解，请问以下哪种更符合您的情况？您可以直接说：${labels}。`
    }

    // API 模式
    const apiQuestion = consultationStore.getCurrentQuestion()
    if (apiQuestion) {
      const doctorText = buildDoctorQuestionText(apiQuestion)
      const labels = apiQuestion.kytOptions.map(opt => opt.koihOption).filter(opt => opt !== '暂无').join('、')
      return `您说的我没太理解，${doctorText.replace(/？$/, '')}？您可以直接说：${labels}。`
    }

    // 本地降级模式
    if (detail.detailSeverityPending.value) {
      return `您说的我没太理解，请问${detail.detailSeverityPending.value.subjectText}的程度是较轻还是较重？您可以直接说"较轻"或"较重"。`
    }

    const question = detail.findQuestion(detail.detailQuestionCategory.value)
    if (question) {
      const labels = question.options.map((opt) => opt.label).join('、')
      return `您说的我没太理解，${question.doctorText.replace(/如果不太理解.*$/, '')}您可以直接说：${labels}。`
    }
    return '请您简单描述一下您的感受，我会帮您匹配到对应的选项。'
  }

  if (stepId === 'self_feature_question') {
    if (selfFeature.selfFeatureSubStep.value === 'meridian') return '您说的我没太理解，请您在右边的人体经脉图上，点击您不舒服的位置。也可以直接说出经脉名称，比如"肺经""胃经""肝经"等。如果没有其他不适了，可以说"没有了"。'
    if (selfFeature.selfFeatureSubStep.value === 'location') return '您说的我没太理解，请告诉我不舒服在哪个部位？比如头、脖子、肩膀、腰、腿等。如果没有其他不适了，可以说"没有了"。'
    if (selfFeature.selfFeatureSubStep.value === 'nature' || selfFeature.selfFeatureSubStep.value === 'nature_expand') return '您说的我没太理解，请问这种不适具体是什么感觉？比如热痛、冷痛、胀痛、麻木、痒等。如果想看更多选项，可以说"更多疼痛类"或"外观变化类"。'
    if (selfFeature.selfFeatureSubStep.value === 'severity') return `您说的我没太理解，请问${selfFeature.selfFeatureCurrentSymptom.value}的程度如何？您可以直接说"较轻"或"较重"。`
    if (selfFeature.selfFeatureSubStep.value === 'continue') return '您说的我没太理解，请问还有其他部位不适吗？您可以直接说"继续添加"或"没有了，就这些"。'
  }

  if (step.options && step.options.length > 0) return `您说的我没太理解，这道题请您直接从以下选项中选择：${optionLabels}。`
  return generateResponse('D_VAGUE')
}

// ── 处理自由文本/语音转文字提交 ───────────────────────────────
const onSubmitText = async (text: string) => {
  const step = currentStep.value
  const isTransitionStep = step.autoAdvance && !(step.options && step.options.length > 0) && !step.isFreeInput
  if (isTransitionStep) return

  clearTimers()

  // 空输入处理
  if (!text.trim()) {
    invalidRetryCount.value++
    if (invalidRetryCount.value >= RETRY_CONFIG.maxEmptyRetries) {
      const genBeforeSay = goToStepGeneration.value
      await doctorSay(generateResponse('O_EMPTY_3'))
      if (goToStepGeneration.value !== genBeforeSay) { invalidRetryCount.value = 0; return }
      const fallback = REFUSAL_FALLBACK[currentStepId.value]
      if (fallback) await goToStep(fallback)
      invalidRetryCount.value = 0; return
    }
    if (step.options && step.options.length > 0) {
      const optionLabels = step.options.map(opt => opt.label).join('、')
      if (invalidRetryCount.value === 1) await doctorSay(generateResponse('O_EMPTY_1', { optionLabels }))
      else await doctorSay(generateResponse('O_EMPTY_2'))
    } else {
      if (invalidRetryCount.value === 1) await doctorSay(generateResponse('D_EMPTY_1'))
      else await doctorSay(generateResponse('D_EMPTY_2'))
    }
    return
  }

  inputText.value = ''; saveSnapshot()
  messages.value.push({ role: 'user', text }); await scrollToBottom()
  invalidRetryCount.value = 0

  // 拒答检测
  if (REFUSAL_KEYWORDS.some(kw => text.includes(kw))) {
    const genBeforeSay = goToStepGeneration.value
    await doctorSay(generateResponse('O_REFUSAL'))
    if (goToStepGeneration.value !== genBeforeSay) return
    const fallback = REFUSAL_FALLBACK[currentStepId.value]
    if (fallback) await goToStep(fallback); return
  }
  // 不确定检测
  if (UNCERTAIN_KEYWORDS.some(kw => text.includes(kw))) {
    const genBeforeSay = goToStepGeneration.value
    await doctorSay(generateResponse('UNCERTAIN'))
    if (goToStepGeneration.value !== genBeforeSay) return
    const fallback = REFUSAL_FALLBACK[currentStepId.value]
    if (fallback) await goToStep(fallback); return
  }

  // ── severity 步骤关键词预匹配（避免走通用意图识别导致无法识别口语化表达）──
  if (currentStepId.value === 'severity') {
    // 先检查是否包含疗效保证关键词
    if (GUARANTEE_KEYWORDS.some(kw => text.includes(kw))) {
      await doctorSay(generateResponse('SEVERITY_GUARANTEE'))
      return
    }
    // 按严重程度从高到低匹配，避免"不严重"被"严重"误匹配
    if (SEVERITY_SEVERE_KEYWORDS.some(kw => text.includes(kw))) {
      await goToStep('end_severe')
      return
    }
    if (SEVERITY_MODERATE_KEYWORDS.some(kw => text.includes(kw))) {
      await goToStep('end_moderate')
      return
    }
    if (SEVERITY_MILD_KEYWORDS.some(kw => text.includes(kw))) {
      await goToStep('end_moderate')
      return
    }
  }

  // ── detail_question 子选项追问处理（API 子选项模式：程度类或通用类）──
  if (currentStepId.value === 'detail_question' && pendingParentOption.value && apiChildOptions.value.length > 0) {
    isTyping.value = true
    const isSeverity = isSeverityChildren(apiChildOptions.value)

    // 动态生成 LLM 分类用的选项描述
    const classifyOptions = apiChildOptions.value.map(c => {
      if (c.semanticDesc) {
        // 通用子选项：使用后端提供的 koihOpIllustrate
        return { label: c.label, semanticDesc: c.semanticDesc }
      }
      // 程度子选项：使用硬编码的程度描述
      return {
        label: c.label,
        semanticDesc: c.label === '较重'
          ? '用户表达程度严重、很厉害、挺重、比较重、很严重、有点重、蛮重、特别重，核心是"程度偏重"'
          : '用户表达程度轻微、不太严重、还好、还行、一般般、不重、不怎么重、一点点，核心是"程度轻微"',
      }
    })

    // 动态生成追问语（传给 LLM 和重试提示）
    const childLabels = apiChildOptions.value.map(c => c.label).join('、')
    const doctorText = isSeverity
      ? '请问这个情况的程度是较轻还是较重？'
      : `请问以下哪种更符合您的情况？您可以直接说：${childLabels}`
    const retryText = isSeverity
      ? '请您再说一下，这个情况是较轻还是比较重呢？'
      : `请您再说一下，具体是哪一种呢？您可以直接说：${childLabels}`

    const optionResult = await classifyOption(text, 'detail_question', classifyOptions, doctorText); isTyping.value = false
    if (optionResult && optionResult.matchedLabel && optionResult.confidence >= 0.5) {
      const lastIdx = messages.value.length - 1
      if (lastIdx >= 0 && messages.value[lastIdx]!.role === 'user') messages.value.splice(lastIdx, 1)
      // 替换为匹配后的选项标签
      messages.value.push({ role: 'user', text: optionResult.matchedLabel! })
      await handleApiDetailOption(optionResult.matchedLabel!)
      return
    }
    // 未匹配，提示重试
    await doctorSay(retryText)
    return
  }

  // ── detail_question 程度追问处理（本地降级模式）──
  if (currentStepId.value === 'detail_question' && detail.detailSeverityPending.value) {
    isTyping.value = true
    const severityOptions = [
      { label: '较重', semanticDesc: '用户表达程度严重、很厉害、挺重、比较重、很严重、有点重、蛮重、特别重，核心是"程度偏重"' },
      { label: '较轻', semanticDesc: '用户表达程度轻微、不太严重、还好、还行、一般般、不重、不怎么重、一点点，核心是"程度轻微"' },
    ]
    const optionResult = await classifyOption(text, 'detail_question', severityOptions, `请问${detail.detailSeverityPending.value.subjectText}的程度是较轻还是较重？`); isTyping.value = false
    if (optionResult && optionResult.matchedLabel && optionResult.confidence >= 0.5) {
      detail.detailFailCount.value = 0
      const lastIdx = messages.value.length - 1
      if (lastIdx >= 0 && messages.value[lastIdx]!.role === 'user') messages.value.splice(lastIdx, 1)
      await detail.handleDetailOptionClick(optionResult.matchedLabel!)
      return
    }
    // LLM 未匹配，交由 handleDetailSubmitText 显示重试提示
    await detail.handleDetailSubmitText(text)
    return
  }

  // ── 大模型分类 ─────────────────────────────────────────────
  // detail_question 的选项是动态的（从题库获取），需要特殊处理
  let hasOptions = step.options && step.options.length > 0
  if (!hasOptions && currentStepId.value === 'detail_question') {
    const question = detail.findQuestion(detail.detailQuestionCategory.value)
    hasOptions = !!(question?.options && question.options.length > 0)
  }
  const isIntent = INTENT_STEPS.has(currentStepId.value)

  if (isIntent) {
    isTyping.value = true
    const result = await recognizeIntent(text, currentStepId.value, currentSymptom.value); isTyping.value = false
    if (result && processLLMResult(result)) { invalidRetryCount.value = 0; return }
  } else if (hasOptions) {
    isTyping.value = true
    let currentDoctorText: string | undefined
    let contextHint: string | undefined
    let llmOptions: { label: string; semanticDesc?: string }[]
    let isCurrentQuestionMultiSelect = false

    if (currentStepId.value === 'detail_question') {
      // ── 否定回答检测：用户说"没有"、"无"、"都不是"等，跳过当前问题 ──
      // 具体否定短语（可在句中任意位置匹配）
      const NEGATION_PHRASES = [
        '没有该症状', '没有这个症状', '没有这些症状', '没有这种情况', '没有这个情况',
        '没有这些', '都没有这些', '都没有', '都不是', '都没有这些',
        '没有以上', '没有上述', '无上述', '无以上',
        '没这个情况', '没这种情况', '没这些情况',
        '不存在这种情况', '不存在这些情况',
        '暂时还没有', '目前还没有', '目前还没有该症状',
        '没有呢', '没有过',
      ]
      // 简短否定（仅匹配开头，避免"无畏寒"等误判）
      const SHORT_NEGATION = [/^没有/, /^无$/]
      const trimmed = text.trim()
      const isNegation = NEGATION_PHRASES.some(p => trimmed.includes(p)) || SHORT_NEGATION.some(p => p.test(trimmed))
      if (isNegation) {
        await advanceApiQuestion()
        return
      }

      const apiQuestion = consultationStore.getCurrentQuestion()

      if (apiQuestion) {
        // API 模式：使用 API 选项进行分类（传入 koihOpIllustrate 作为语义描述，帮助 LLM 理解选项边界）
        currentDoctorText = buildDoctorQuestionText(apiQuestion)
        llmOptions = apiQuestion.kytOptions.map((opt) => ({
          label: opt.koihOption,
          semanticDesc: opt.koihOpIllustrate || undefined,
        }))
        // 判断是否为多选题
        isCurrentQuestionMultiSelect = isMultiSelectQuestion(apiQuestion)
      } else {
        // 本地降级模式：使用本地题库选项
        const question = detail.findQuestion(detail.detailQuestionCategory.value)
        currentDoctorText = question?.doctorText
        llmOptions = (question?.options || step.options!).map((opt) => ({ label: opt.label, semanticDesc: opt.semanticDesc }))
      }

      // 构建上下文提示：已记录的答案帮助 LLM 理解当前匹配方向
      const recordedLabels = detail.detailAnswers.value.map(a => a.label).filter(Boolean)
      if (recordedLabels.length > 0) {
        contextHint = `用户已记录：${recordedLabels.join('、')}`
      }
    } else {
      llmOptions = (step.options!).map((opt) => ({ label: opt.label, semanticDesc: opt.semanticDesc }))
    }

    if (clarificationCandidates.value.length >= 2) {
      llmOptions = llmOptions.filter(opt => clarificationCandidates.value.includes(opt.label))
    }

    const optionResult = await classifyOption(text, currentStepId.value, llmOptions, currentDoctorText, contextHint, isCurrentQuestionMultiSelect); isTyping.value = false

    if (optionResult && optionResult.matchedLabel && optionResult.confidence >= 0.5) {
      clarificationCandidates.value = []

      // detail_question 的特殊处理：API 模式或本地模式
      if (currentStepId.value === 'detail_question') {
        const lastIdx = messages.value.length - 1
        if (lastIdx >= 0 && messages.value[lastIdx]!.role === 'user') messages.value.splice(lastIdx, 1)
        // 替换为匹配后的选项标签（方案 B）
        messages.value.push({ role: 'user', text: optionResult.matchedLabel! })
        if (consultationStore.getCurrentQuestion()) {
          // API 驱动模式：传入原始文本用于程度自动识别
          await handleApiDetailOption(optionResult.matchedLabel!, text)
        } else {
          // 本地降级模式
          detail.detailFailCount.value = 0
          await detail.handleDetailOptionClick(optionResult.matchedLabel!)
        }
        return
      }

      // self_feature_question 的特殊处理：子步骤（meridian→nature→severity→continue）由 handleSelfFeatureOptionClick 统一管理
      // 不走通用 goToStep（会跳过 subStep 状态流转，导致 pushRecord 不执行、数据丢失、流程卡死）
      if (currentStepId.value === 'self_feature_question') {
        const lastIdx = messages.value.length - 1
        if (lastIdx >= 0 && messages.value[lastIdx]!.role === 'user') messages.value.splice(lastIdx, 1)
        await selfFeature.handleSelfFeatureOptionClick(optionResult.matchedLabel!)
        return
      }

      // 其他步骤：从 step.options 中查找并调用
      const matched = step.options!.find(opt => opt.label === optionResult.matchedLabel)
      if (matched) {
        // analysis_review 确认时，先保存舌脉数据
        if (currentStepId.value === 'analysis_review' && matched.label === '确认相符') {
          await handleAnalysisConfirm()
        }
        await goToStep(matched.nextStep, matched.payload); return
      }
    }

    // detail_question 多部位批量匹配：用户一次说出多个选项时，批量处理
    if (currentStepId.value === 'detail_question' && optionResult && optionResult.matchedLabels.length >= 2 && !optionResult.clarificationQuestion) {
      const lastIdx = messages.value.length - 1
      if (lastIdx >= 0 && messages.value[lastIdx]!.role === 'user') messages.value.splice(lastIdx, 1)
      messages.value.push({ role: 'user', text })
      await scrollToBottom()

      if (consultationStore.getCurrentQuestion()) {
        // ── API 模式多选 ──
        const apiQuestion = consultationStore.getCurrentQuestion()!
        const validLabels = optionResult.matchedLabels.filter(label =>
          apiQuestion.kytOptions.some(opt => opt.koihOption === label)
        )
        if (validLabels.length >= 2) {
          clarificationCandidates.value = []
          await handleApiDetailBatchSelect(validLabels)
          return
        }
      } else {
        // ── 本地降级模式多选 ──
        const question = detail.findQuestion(detail.detailQuestionCategory.value)
        const validLabels = optionResult.matchedLabels.filter(label => question?.options.some(opt => opt.label === label))
        if (validLabels.length >= 2) {
          clarificationCandidates.value = []
          await detail.handleDetailBatchSelect(validLabels)
          return
        }
      }
    }

    // ── 兜底：LLM 返回多个匹配但未生成追问语 → 自动生成追问（概括性回答引导）──
    if (optionResult && optionResult.matchedLabels.length >= 2 && !optionResult.clarificationQuestion) {
      const filterOptions = currentStepId.value === 'detail_question'
        ? (detail.findQuestion(detail.detailQuestionCategory.value)?.options || [])
        : (step.options || [])
      const candidates = optionResult.matchedLabels.filter(label => filterOptions.some((opt) => opt.label === label))
      if (candidates.length >= 2) {
        clarificationCandidates.value = candidates
        const defaultClarification = `请问具体是哪一种呢？您可以直接说：${candidates.join('、')}。`
        await doctorSay(defaultClarification)
        return
      }
    }

    if (optionResult && optionResult.matchedLabels.length >= 2 && optionResult.clarificationQuestion) {
      // detail_question 使用动态题库查找，其他步骤使用 step.options
      const filterOptions = currentStepId.value === 'detail_question'
        ? (detail.findQuestion(detail.detailQuestionCategory.value)?.options || [])
        : (step.options || [])
      const candidates = optionResult.matchedLabels.filter(label => filterOptions.some((opt) => opt.label === label))
      if (candidates.length >= 2) { clarificationCandidates.value = candidates; await doctorSay(optionResult.clarificationQuestion); return }
    }

    // ── LLM 识别到用户否定所有选项 → 跳过当前问题 ──
    if (currentStepId.value === 'detail_question' && consultationStore.getCurrentQuestion()
      && optionResult && !optionResult.matchedLabel && optionResult.confidence === 0
      && optionResult.reasoning.startsWith('【否定】')) {
      await advanceApiQuestion()
      return
    }

    // ── detail_question API 模式兜底：LLM 无法匹配时的处理 ──
    // 否定词已在前面处理（跳过问题），这里的所有情况都应该引导用户匹配选项
    if (currentStepId.value === 'detail_question' && consultationStore.getCurrentQuestion()) {
      if (!optionResult || !optionResult.matchedLabel || optionResult.confidence < 0.3) {
        // 引导用户说具体症状或选择选项
        await doctorSay(buildFallbackQuestion())
        return
      }
    }
  }

  // ── 大模型未匹配时，按步骤类型兜底处理 ─────────────────────
  switch (currentStepId.value) {
    case 'severity': {
      if (GUARANTEE_KEYWORDS.some(kw => text.includes(kw))) await doctorSay(generateResponse('SEVERITY_GUARANTEE'))
      else await doctorSay(generateResponse('SEVERITY_UNMATCHED', { symptom: currentSymptom.value }))
      break
    }
    case 'self_feature_question': await selfFeature.handleSelfFeatureSubmitText(text); break
    default: await doctorSay(buildFallbackQuestion()); break
  }
}

// ── 麦克风按钮 ───────────────────────────────────────────────
const onMicClick = async () => {
  ttsStore.stop()
  if (speechStatus.value === 'listening') { showVoiceToast.value = false; stopSpeech(); return }
  if (speechStatus.value === 'error') { showVoiceToast.value = false; showErrorToast.value = false; stopSpeech(); return }

  // 重置 toast 文本为默认值（兼容长按模式可能修改过的文本）
  voiceToastText.value = '正在聆听，请说话…'
  showVoiceToast.value = true; showErrorToast.value = false
  const text = await startSpeechAndWait(); showVoiceToast.value = false

  if (speechError.value) {
    showErrorToast.value = true; errorToastText.value = speechError.value || '语音识别失败，请重试'
    setTimeout(() => { showErrorToast.value = false }, 3000); return
  }
  if (text) { inputText.value = text; onSubmitText(text) }
}

/**
 * 启动语音录音（空格键长按模式）
 * 与 onMicClick 的 toggle 模式独立，专门处理 press-and-hold 交互
 */
const startVoiceRecording = () => {
  // 防护条件 1：输入框聚焦时不响应
  const tag = (document.activeElement as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return

  // 防护条件 2：采集阶段不响应
  if (isCapturing.value) return

  // 防护条件 3：LLM 处理中不响应
  if (llmIsLoading.value) return

  // 防护条件 4：终态步骤不响应
  if (currentStep.value.isEnd) return

  // 防护条件 5：TTS 播报时不响应（用户确认的需求）
  if (ttsStore.isSpeaking) return

  // 防护条件 6：自动过渡步骤不响应
  if (isAutoTransition.value) return

  // 防护条件 7：已经在录音（按钮 toggle 模式或长按模式）
  if (speechStatus.value !== 'idle') return

  // 停止 TTS（以防万一）
  ttsStore.stop()

  // 设置录音状态
  isLongPressRecording.value = true
  recordStartTime = Date.now() // 记录开始时间（用于最短时长检查）
  showVoiceToast.value = true
  showErrorToast.value = false

  // 初始化录音时长显示
  recordingDuration = 0
  voiceToastText.value = '🎙️ 正在录音... 0秒'

  // 启动每秒更新定时器
  durationTimer = window.setInterval(() => {
    recordingDuration++
    voiceToastText.value = `🎙️ 正在录音... ${recordingDuration}秒`
  }, 1000)

  // 启动 60 秒超时保护
  recordingTimeoutTimer = window.setTimeout(() => {
    if (isLongPressRecording.value) {
      stopVoiceRecording()
      errorToastText.value = '录音时长已达 60 秒上限，自动停止'
      showErrorToast.value = true
      setTimeout(() => { showErrorToast.value = false }, 3000)
    }
  }, 60000)

  // 启动语音识别（不等待结果，存储 promise）
  recordingPromise = startSpeechAndWait()
}

/**
 * 停止语音录音并提交结果（空格键长按模式）
 */
const stopVoiceRecording = async () => {
  // 如果已经不在录音状态，直接返回（防止重复调用）
  if (!isLongPressRecording.value) return

  // 清除定时器
  if (durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
  if (recordingTimeoutTimer) {
    clearTimeout(recordingTimeoutTimer)
    recordingTimeoutTimer = null
  }

  // 最短录音时长检查（防止误触空格键）
  const MIN_RECORD_DURATION = 300 // 最少 300ms
  const elapsed = Date.now() - recordStartTime
  if (elapsed < MIN_RECORD_DURATION) {
    // 重置录音状态
    isLongPressRecording.value = false
    showVoiceToast.value = false
    // 取消语音识别（不调用 stopSpeech，直接丢弃 promise）
    recordingPromise = null
    // 显示提示
    showErrorToast.value = true
    errorToastText.value = '录音时间太短，请长按空格键'
    setTimeout(() => { showErrorToast.value = false }, 2000)
    return
  }

  // 重置录音状态
  isLongPressRecording.value = false

  // 更新 toast 为"识别中"
  voiceToastText.value = '⏳ 识别中...'

  // 停止录音
  stopSpeech()

  // 等待识别结果
  const text = await recordingPromise
  recordingPromise = null

  // 隐藏录音 toast
  showVoiceToast.value = false

  // 处理识别结果
  if (speechError.value) {
    // 显示错误 toast
    showErrorToast.value = true
    errorToastText.value = speechError.value || '语音识别失败，请重试'
    setTimeout(() => {
      showErrorToast.value = false
    }, 3000)
    return
  }

  // 识别成功，自动提交
  if (text) {
    inputText.value = text
    onSubmitText(text)
  }
}

watch(speechTranscript, (val) => { if (speechStatus.value === 'listening' && val) inputText.value = val })

// ── 初始化 ───────────────────────────────────────────────────
onMounted(async () => {
  consultationStore.startConsultation()
  // 注册键盘快捷键监听
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keyup', handleKeyUp) // 空格键松开检测
  window.addEventListener('blur', handleWindowBlur) // 窗口失焦保护
  await doctorSay(`${userName.value}您好，我是您的中医师 🌿 接下来我会帮您了解一下身体状况，请放松心情～`, 800)
  await goToStep('initial')
})

// ── 全局跳过按钮监听：当 App.vue 的全局跳过按钮调用 stop() 时，
//    stopGeneration 递增，此处触发问诊页的跳过逻辑（补全文字 + 推进流程）──
let isUnmounting = false
watch(() => ttsStore.stopGeneration, () => {
  // 仅当 stop() 来自外部调用（全局跳过按钮）时才触发跳过逻辑
  // 自然播放完成不经过 stop()，stopGeneration 不变，watcher 不触发
  if (!isUnmounting && ttsStore.consumeGlobalSkip()) {
    skipDoctorSay()
  }
})

onUnmounted(() => {
  isUnmounting = true
  clearTimers()
  stopSpeech()
  // 清除键盘快捷键监听
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', handleWindowBlur)
  // 清理长按录音定时器
  if (durationTimer) { clearInterval(durationTimer); durationTimer = null }
  if (recordingTimeoutTimer) { clearTimeout(recordingTimeoutTimer); recordingTimeoutTimer = null }
  // 清理 action toast 定时器
  if (actionToastTimer) { clearTimeout(actionToastTimer); actionToastTimer = null }
})
</script>

<template>
  <div class="consultation-view">

    <!-- 顶部：医生形象 / 自选特征阶段显示3D经脉模型 -->
    <div class="doctor-section" :class="{ 'is-meridian': isSelfFeaturePhase }">
      <!-- 自选特征阶段：显示3D经脉交互模型（替代 body.png） -->
      <MeridianBodyView
        v-if="isSelfFeaturePhase"
        :recorded-meridians="selfFeature.recordedMeridianCodes.value"
        @meridian-select="selfFeature.handleMeridianSelect"
      />
      <!-- 非自选特征阶段：显示老中医师形象（保持不变） -->
      <img
        v-else
        class="doctor-img"
        src="@/assets/doctor.webp"
        alt="老中医师"
      />
      <div class="doctor-badge">
        <div class="doctor-badge-dot"></div>
        <div class="doctor-badge-name">{{ isSelfFeaturePhase ? '点击经脉查看信息' : '中医师 · 在线问诊' }}</div>
      </div>
      <!-- 倍速切换按钮：1x → 1.25x → 1.5x → 1x 循环 -->
      <button
        class="speed-toggle-btn"
        :class="`speed-${uiStore.playbackSpeed}`"
        :title="`当前 ${uiStore.playbackSpeed}x，点击切换倍速`"
        @click="cycleSpeed"
      >
        {{ uiStore.playbackSpeed }}x
      </button>
    </div>

    <!-- 问诊进度条 -->
    <div v-if="progressPercent > 0 && !currentStep.isEnd" class="progress-bar-area">
      <div class="progress-label">{{ progressPercent }}%</div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
    </div>

    <!-- 中间：对话区 -->
    <div class="chat-area" ref="chatAreaRef">
      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        class="chat-msg"
        :class="msg.role"
      >
        <!-- 医生头像 -->
        <img v-if="msg.role === 'doctor'" class="chat-avatar" src="@/assets/doctor.webp" alt="老中医师" />
        <!-- 护士头像 -->
        <img v-else-if="msg.role === 'nurse'" class="chat-avatar" src="@/assets/assistant.webp" alt="护士" />
        <!-- 用户头像 -->
        <div v-else class="chat-avatar-user">👤</div>

        <!-- 气泡 -->
        <div :class="[
          msg.role !== 'user' ? 'chat-bubble-doctor' : 'chat-bubble-user',
          msg.type === 'analysis' ? 'chat-bubble-analysis' : '',
          msg.type === 'summary' ? 'chat-bubble-summary' : '',
          msg.type === 'syndrome' ? 'chat-bubble-syndrome' : ''
        ]">
          {{ msg.text }}
          <span v-if="msg.confirmed" class="msg-confirmed-badge">✓</span>
        </div>
      </div>

      <!-- 证型输出报告卡片 -->
      <div v-if="syndromeOutputData" class="syndrome-card" ref="syndromeCardRef">
        <div class="syndrome-card-header">
          <span class="syndrome-card-icon">📋</span>
          <span class="syndrome-card-title">辨证分析报告</span>
        </div>

        <!-- ── 真实 API 数据 ── -->
        <template v-if="syndromeOutputData.isRealData">
          <!-- 用户信息 -->
          <div v-if="syndromeOutputData.userInfo" class="syndrome-card-section">
            <div class="syndrome-section-title">基本信息</div>
            <div class="syndrome-section-content" style="font-size: 0.9em; color: #666;">
              姓名：{{ syndromeOutputData.userInfo.name }}
              性别：{{ syndromeOutputData.userInfo.sex }}
              年龄：{{ syndromeOutputData.userInfo.age }}
              <br />
              模型：{{ syndromeOutputData.modelName }}
              时间：{{ syndromeOutputData.userInfo.time }}
            </div>
          </div>

          <!-- 辨证结论 -->
          <div v-if="syndromeOutputData.syndromeConclusion && syndromeOutputData.syndromeConclusion.length > 0" class="syndrome-card-section syndrome-highlight-section">
            <div class="syndrome-section-title">一、辨证结论</div>
            <div class="syndrome-section-content">
              <div v-for="(item, i) in syndromeOutputData.syndromeConclusion" :key="i" class="syndrome-symptom-item">
                <span class="syndrome-symptom-num">{{ i + 1 }}</span>
                <span>{{ item.key }}：{{ item.val }}分</span>
              </div>
            </div>
          </div>

          <!-- 推荐方案（动态遍历 tuijianList） -->
          <div v-for="(rec, i) in syndromeOutputData.recommendations" :key="i" class="syndrome-card-section">
            <div class="syndrome-section-title">{{ i + (syndromeOutputData.syndromeConclusion?.length ? 2 : 1) }}、{{ rec.key }}</div>
            <div class="syndrome-section-content">
              <div class="syndrome-result-detail" style="white-space: pre-wrap; line-height: 1.8;">{{ rec.value }}</div>
            </div>
          </div>

          <!-- 解读加载指示器（Phase 2 LLM 生成中） -->
          <div v-if="syndromeOutputData.interpretationLoading" class="syndrome-card-section syndrome-interpreting">
            <span class="thinking-icon">🤔</span>
            <span class="interpreting-text">正在为您详细解读辨证结果…</span>
          </div>

          <!-- 辨证解读（LLM 生成） -->
          <div v-if="syndromeOutputData.syndromeInterpretation" class="syndrome-card-section">
            <div class="syndrome-section-title">辨证解读</div>
            <div class="syndrome-section-content syndrome-interpretation-text">{{ syndromeOutputData.syndromeInterpretation }}</div>
          </div>

          <!-- 处方解读（LLM 生成） -->
          <div v-if="syndromeOutputData.prescriptionInterpretation" class="syndrome-card-section">
            <div class="syndrome-section-title">处方解读</div>
            <div class="syndrome-section-content syndrome-prescription-text">{{ syndromeOutputData.prescriptionInterpretation }}</div>
          </div>
        </template>
        <template v-else>
          <div class="syndrome-card-section">
            <div class="syndrome-section-title">一、病种 + 主症</div>
            <div class="syndrome-section-content">
              <span class="syndrome-tag disease-tag">{{ syndromeOutputData.diseaseCategory }}</span>
              <span class="syndrome-tag symptom-tag">{{ syndromeOutputData.mainSymptom }}</span>
            </div>
          </div>
          <div class="syndrome-card-section">
            <div class="syndrome-section-title">二、主要症状</div>
            <div class="syndrome-section-content">
              <div class="syndrome-symptom-list">
                <div v-for="(s, i) in syndromeOutputData.mainSymptoms" :key="i" class="syndrome-symptom-item">
                  <span class="syndrome-symptom-num">{{ i + 1 }}</span>
                  <span>{{ s }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="syndrome-card-section syndrome-highlight-section">
            <div class="syndrome-section-title">三、辨证结果</div>
            <div class="syndrome-section-content">
              <div class="syndrome-result-name">{{ syndromeOutputData.syndromeResult }}</div>
              <div class="syndrome-result-detail">{{ syndromeOutputData.syndromeDetail }}</div>
            </div>
          </div>
          <div class="syndrome-card-section">
            <div class="syndrome-section-title">四、调理方案</div>
            <div class="syndrome-section-content">
              <div class="syndrome-plan-list">
                <div v-for="(p, i) in syndromeOutputData.conditioningPlan" :key="i" class="syndrome-plan-item">
                  <span class="syndrome-plan-num">{{ i + 1 }}</span>
                  <span>{{ p }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="syndrome-card-section">
            <div class="syndrome-section-title">五、产品配套</div>
            <div class="syndrome-section-content">
              <div class="syndrome-product-list">
                <div v-for="(prod, i) in syndromeOutputData.productRecommendation" :key="i" class="syndrome-product-item">
                  <span class="syndrome-product-badge">推荐</span>
                  <span>{{ prod }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="syndrome-card-footer">
            <div class="syndrome-footer-tip">以上为模拟辨证分析结果，仅供参考（接口未返回有效数据）。</div>
          </div>
        </template>
      </div>

      <!-- 医生思考中 / 打字中 -->
      <div v-if="isTyping" class="chat-msg doctor">
        <img class="chat-avatar" src="@/assets/doctor.webp" alt="老中医师" />
        <div v-if="llmIsLoading" class="chat-bubble-doctor thinking-bubble">
          <span class="thinking-icon">🤔</span>
          <span class="thinking-text">正在分析您的描述…</span>
        </div>
        <div v-else class="chat-bubble-doctor">
          <span class="typing-cursor"></span>
        </div>
      </div>
    </div>

    <!-- 底部输入区：语音输入按钮（所有非终步骤均可使用） -->
    <div class="input-area voice-only" v-if="!isTyping && !ttsStore.isSpeaking && !llmIsLoading && !currentStep.isEnd && !isAutoTransition">
      <button
        v-if="canReselect"
        class="reselect-btn"
        @click="reselectCurrentAnswer"
        title="重新选择"
      >
        ↩ 重新选择
      </button>
      <button
        class="mic-btn"
        :class="speechStatus"
        @click="onMicClick"
        :title="speechStatus === 'listening' ? '点击停止录音' : '点击开始语音输入'"
      >
        {{ speechStatus === 'listening' ? '🔴' : speechStatus === 'processing' ? '⏳' : '🎙️' }}
      </button>
    </div>

    <!-- 终态返回首页按钮 -->
    <div class="input-area" v-if="currentStep.isEnd && !isTyping && !ttsStore.isSpeaking">
      <button
        class="go-home-btn"
        @click="resetAndGoHome"
      >
        🏠 返回首页
      </button>
    </div>

    <!-- 舌脉采集浮层 -->
    <div class="capture-overlay" v-if="isCapturing">
      <div class="capture-card">
        <!-- 采集完成：显示成功提示 -->
        <template v-if="captureCompleted">
          <div class="capture-success-icon">✓</div>
          <div class="capture-success-text">采集成功</div>
        </template>
        <!-- 采集中：显示加载状态 -->
        <template v-else>
          <!-- 舌面拍照：摄像头预览模式 -->
          <template v-if="showTongueCamera">
            <CameraCapture
              @captured="tonguePulseCapture.onCameraCaptured"
              @cancel="tonguePulseCapture.onCameraCancel"
              @error="tonguePulseCapture.onCameraError"
            />
            <button class="camera-file-btn" @click="tonguePulseCapture.selectFromFile">
              📁 从文件选择
            </button>
            <div class="capture-tip">请自然伸出舌头，面对镜头</div>
          </template>
          <!-- 脉诊采集：使用增强组件 -->
          <template v-else-if="captureType === 'pulse'">
            <PulseCollectionOverlay
              ref="pulseOverlayRef"
              :phase="pulseProgress.phase"
              :message="pulseProgress.message"
              :current-position="pulseProgress.currentPosition ?? null"
              :current-pressure="pulseProgress.currentPressure ?? null"
              :device-status="pulseProgress.deviceStatus ?? 'unknown'"
              :pressure-percent="pulseProgress.pressurePercent ?? 0"
              :overall-percent="pulseProgress.overallPercent ?? 0"
              :is-completed="captureCompleted"
              :invalid-reason="pulseProgress.invalidReason ?? null"
              :pressure-level="pulseProgress.pressureLevel ?? 2"
              :completed-pressures="pulseProgress.completedPressures ?? { cun: [], guan: [], chi: [] }"
            />
          </template>
          <!-- 舌象采集（非脉诊）：保持原有加载状态 -->
          <template v-else>
            <div class="capture-icon">
              <span v-if="captureType === 'tongue_top'">📷</span>
              <span v-else-if="captureType === 'tongue_bottom'">📷</span>
            </div>
            <div class="capture-title">正在拍摄舌象…</div>
            <div class="capture-loading">
              <span class="capture-spinner"></span>
              <span>处理中，请稍候…</span>
            </div>
            <div class="capture-tip">
              {{ captureType === 'tongue_top' ? '请自然伸出舌头，面对镜头' : '请将舌头卷起，露出舌下脉络' }}
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- 语音录音提示浮层 -->
    <div class="voice-toast" v-if="showVoiceToast">
      <div class="voice-toast-wave">
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
      </div>
      <span>{{ voiceToastText }}</span>
    </div>

    <!-- 错误提示 -->
    <div class="error-toast" v-if="showErrorToast">⚠️ {{ errorToastText }}</div>

    <!-- 键盘快捷键操作反馈 -->
    <div class="action-toast" v-if="showActionToast">{{ actionToastText }}</div>

  </div>
</template>
