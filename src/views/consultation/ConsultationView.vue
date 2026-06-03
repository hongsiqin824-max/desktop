<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/global/user'
import { useUIStore } from '@/stores/global/ui'
import { useConsultationStore } from '@/stores/consultation'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import { useTTSStore } from '@/stores/global/tts'
import type { PersonaType } from '@/types/consultation'
import { useLLM } from '@/composables/useLLM'
import type { IIntentResult } from '@/types/llm'
import { FLOW_STEPS, REFUSAL_FALLBACK, MOCK_ANALYSIS } from '@/data/consultationFlow'
import type { StepIdType, IChatOption, IChatMessage, IStepSnapshot, ISyndromeOutput, IDetailAnswer } from '@/types/consultation'
import { KEYWORD_CONFIG, RETRY_CONFIG, generateResponse } from '@/data/consultationResponse'
import { generateMockSyndromeOutput, mergeSeverityDuplicates, getCategoryTitle } from '@/data/syndromeOutput'
import { useDetailQuestion } from '@/composables/useDetailQuestion'
import { useSelfFeature } from '@/composables/useSelfFeature'
import type { MeridianCodeType } from '@/types/meridian'
import MeridianBodyView from '@/components/business/meridian/MeridianBodyView.vue'

import './styles/ConsultationView.css'

// ── 用户信息 ─────────────────────────────────────────────────
const userStore = useUserStore()
const uiStore = useUIStore()
const consultationStore = useConsultationStore()
const router = useRouter()
const userName = computed(() => userStore.userInfo.name || '朋友')
const userInfo = computed(() => userStore.userInfo)

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

// ── 舌脉采集状态 ─────────────────────────────────────────────
const isCapturing = ref(false)
const captureType = ref<'tongue_top' | 'tongue_bottom' | 'pulse' | null>(null)
const captureProgress = ref(0)
const captureCompleted = ref(false)
const captureProgressIntervalId = ref<number | null>(null)
const captureStartTimerId = ref<number | null>(null)
const autoAdvanceTimerId = ref<number | null>(null)
const analysisData = ref<typeof MOCK_ANALYSIS[string] | null>(null)

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
const isSkipping = ref(false) // 用户主动跳过朗读时设为 true，阻止 onError toast 弹出
let lastDoctorFullText = '' // 记录当前正在朗读的医生完整文本，跳过时用于强制补全文字

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

const clearTimers = () => {
  if (autoAdvanceTimerId.value) { clearTimeout(autoAdvanceTimerId.value); autoAdvanceTimerId.value = null }
  if (captureStartTimerId.value) { clearTimeout(captureStartTimerId.value); captureStartTimerId.value = null }
  if (captureProgressIntervalId.value) { clearInterval(captureProgressIntervalId.value); captureProgressIntervalId.value = null }
  abortLLM()
  ttsStore.stop()
  isCapturing.value = false
  captureType.value = null
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

// ── 步骤计算 ─────────────────────────────────────────────────
const currentStep = computed(() => {
  if (currentStepId.value === 'detail_question') {
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
    const filteredOptions = question.options.filter((opt: any) => {
      if (!opt.excludeAfter) return true
      return !opt.excludeAfter.some((excluded: string) => answeredTaCodes.has(excluded))
    })
    return {
      id: 'detail_question' as StepIdType,
      doctorText: question.doctorText,
      options: filteredOptions.map((opt: any) => ({ label: opt.label, nextStep: 'detail_question' as StepIdType, payload: undefined })) as IChatOption[],
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
const CAPTURE_READING_DELAY = 2000
const CAPTURE_SUCCESS_DELAY = 800

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

  // ── 从 severity 步骤离开时，自动记录严重程度 ──
  if (currentStepId.value === 'severity') {
    if (stepId === 'end_severe') consultationStore.setSeverityLevel('severe')
    else if (stepId === 'end_moderate') consultationStore.setSeverityLevel('mild')
  }

  if (UNSUPPORTED_SYMPTOMS.has(currentSymptom.value) && (stepId === 'severity' || stepId === 'detail_transition' || stepId === 'detail_question')) {
    stepId = 'end_unsupported_symptom'
  }

  currentStepId.value = stepId
  const step = FLOW_STEPS[stepId]
  let text = step.doctorText

  if (stepId === 'severity') {
    text = `请问您的【${currentSymptom.value}】严重吗？`
  }
  if (stepId === 'analysis_review') {
    const data = MOCK_ANALYSIS[currentSymptom.value] ?? MOCK_ANALYSIS['感冒']!
    analysisData.value = data
    consultationStore.setAnalysisData(data)
    text = `根据系统分析，我这边看到的情况如下，请您确认是否与您目前的状态相符：

舌象分析：
• 舌苔厚薄：${data.tongueCoating}
• 舌苔颜色：${data.tongueCoatingColor}
• 舌质颜色：${data.tongueColor}
• 舌质大小：${data.tongueSize}
• 舌下状态：${data.tongueBottom}

脉象分析：
• 脉象特征：${data.pulseType}
• 脉搏次数：${data.pulseRate}次/分`
  }
  if (stepId === 'analysis_normal') text = generateResponse('ANALYSIS_CONFIRM_NORMAL', { symptom: currentSymptom.value })
  if (stepId === 'detail_transition') text = generateResponse('DETAIL_TRANSITION', { symptom: currentSymptom.value })
  if (stepId === 'detail_question' && detailIsFirstQuestion.value) {
    const firstCategory = detail.initFirstQuestion(currentSymptom.value)
    text = detail.getFirstQuestionText(currentSymptom.value, firstCategory)
  }
  if (stepId === 'detail_summary') {
    const summary = buildDetailSummary(detail.detailAnswers.value)
    text = generateResponse('DETAIL_SUMMARY', { summary })
  }
  if (stepId === 'self_feature_intro') {
    selfFeature.resetSelfFeature()
    text = '接下来，我请您在上面的人体经脉图上，点击您感觉不舒服的位置。每条经脉对应不同的脏腑和气血通道，您点上去就能看到经脉名称和基本信息。选好经脉之后，再告诉我是什么感觉，最多可以记录5处不适。'
  }
  if (stepId === 'self_feature_summary') text = selfFeature.getSummaryText()
  if (stepId === 'syndrome_output') {
    const output = generateMockSyndromeOutput(currentSymptom.value, detail.detailAnswers.value, selfFeature.selfFeatureRecords.value, analysisData.value)
    syndromeOutputData.value = output
    consultationStore.setSyndromeOutput(output)
    consultationStore.endConsultation()
    consultationStore.finalizeBackendPayload()
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
    await doctorSay(text, 1200); if (goToStepGeneration.value !== gen) return; const lastMsg = messages.value[messages.value.length - 1]; if (lastMsg) lastMsg.type = 'syndrome'
  } else if (stepId === 'analysis_normal') {
    // 静默过渡：不播报，等 autoAdvance 自动跳到 detail_transition
  } else if (text) {
    await doctorSay(text)
  }

  // 代次变化（用户跳过）→ 不启动采集动画和自动推进
  if (goToStepGeneration.value !== gen) return

  // 启动采集动画
  if (step.captureType && step.autoAdvance) {
    const totalDelay = step.autoAdvance.delay
    const captureDuration = totalDelay - CAPTURE_READING_DELAY - CAPTURE_SUCCESS_DELAY
    captureStartTimerId.value = window.setTimeout(() => {
      isCapturing.value = true; captureType.value = step.captureType!
      captureProgress.value = 0; captureCompleted.value = false
      const stepMs = 50; const progressStep = 100 / (captureDuration / stepMs) * speed
      captureProgressIntervalId.value = window.setInterval(() => {
        captureProgress.value += progressStep
        if (captureProgress.value >= 100) {
          captureProgress.value = 100; captureCompleted.value = true
          if (captureProgressIntervalId.value) { clearInterval(captureProgressIntervalId.value); captureProgressIntervalId.value = null }
        }
      }, stepMs / speed)
    }, CAPTURE_READING_DELAY / speed)
  }

  if (step.autoAdvance) {
    autoAdvanceTimerId.value = window.setTimeout(() => { clearTimers(); goToStep(step.autoAdvance!.nextStep) }, step.autoAdvance.delay / speed)
  }
}

// ── 处理选项点击 ─────────────────────────────────────────────
const onOptionClick = async (label: string, nextStep: StepIdType, payload?: string) => {
  saveSnapshot(); clearTimers()

  if (currentStepId.value === 'detail_question') {
    await detail.handleDetailOptionClick(label); return
  }
  if (currentStepId.value === 'self_feature_question') {
    await selfFeature.handleSelfFeatureOptionClick(label); return
  }

  // 舌脉分析确认：异常分支
  if (currentStepId.value === 'analysis_review' && label === '确认相符' && analysisData.value?.isAbnormal) {
    await goToStep('analysis_abnormal'); return
  }

  messages.value.push({ role: 'user', text: label })
  await scrollToBottom()
  await goToStep(nextStep, payload)
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
    if (detail.detailSeverityPending.value) {
      return `您说的我没太理解，请问${detail.detailSeverityPending.value.subjectText}的程度是较轻还是较重？您可以直接说"较轻"或"较重"。`
    }

    const question = detail.findQuestion(detail.detailQuestionCategory.value)
    if (question) {
      const labels = question.options.map((opt: any) => opt.label).join('、')
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

  // ── detail_question 程度追问处理（detailSeverityPending 存在时，选项固定为"较轻/较重"）──
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

    if (currentStepId.value === 'detail_question') {
      const question = detail.findQuestion(detail.detailQuestionCategory.value)
      currentDoctorText = question?.doctorText
      llmOptions = (question?.options || step.options!).map((opt: any) => ({ label: opt.label, semanticDesc: opt.semanticDesc }))

      // 构建上下文提示：已记录的答案帮助 LLM 理解当前匹配方向
      const recordedLabels = detail.detailAnswers.value.map(a => a.label).filter(Boolean)
      if (recordedLabels.length > 0) {
        contextHint = `用户已记录：${recordedLabels.join('、')}`
      }
    } else {
      llmOptions = (step.options as any[]).map((opt: any) => ({ label: opt.label, semanticDesc: opt.semanticDesc }))
    }

    if (clarificationCandidates.value.length >= 2) {
      llmOptions = llmOptions.filter(opt => clarificationCandidates.value.includes(opt.label))
    }

    const optionResult = await classifyOption(text, currentStepId.value, llmOptions, currentDoctorText, contextHint); isTyping.value = false

    if (optionResult && optionResult.matchedLabel && optionResult.confidence >= 0.5) {
      clarificationCandidates.value = []

      // detail_question 的特殊处理：选项是动态的，直接调用 handleDetailOptionClick
      if (currentStepId.value === 'detail_question') {
        detail.detailFailCount.value = 0
        const lastIdx = messages.value.length - 1
        if (lastIdx >= 0 && messages.value[lastIdx]!.role === 'user') messages.value.splice(lastIdx, 1)
        await detail.handleDetailOptionClick(optionResult.matchedLabel!)
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
        await goToStep(matched.nextStep, matched.payload); return
      }
    }

    // detail_question 多部位批量匹配：用户一次说出多个部位时，批量记录所有匹配选项
    if (currentStepId.value === 'detail_question' && optionResult && optionResult.matchedLabels.length >= 2 && !optionResult.clarificationQuestion) {
      const question = detail.findQuestion(detail.detailQuestionCategory.value)
      const validLabels = optionResult.matchedLabels.filter(label => question?.options.some(opt => opt.label === label))
      if (validLabels.length >= 2) {
        clarificationCandidates.value = []
        const lastIdx = messages.value.length - 1
        if (lastIdx >= 0 && messages.value[lastIdx]!.role === 'user') messages.value.splice(lastIdx, 1)
        // 显示用户原始输入
        messages.value.push({ role: 'user', text })
        await scrollToBottom()
        await detail.handleDetailBatchSelect(validLabels)
        return
      }
    }

    if (optionResult && optionResult.matchedLabels.length >= 2 && optionResult.clarificationQuestion) {
      // detail_question 使用动态题库查找，其他步骤使用 step.options
      const filterOptions = currentStepId.value === 'detail_question'
        ? (detail.findQuestion(detail.detailQuestionCategory.value)?.options || [])
        : (step.options || [])
      const candidates = optionResult.matchedLabels.filter(label => filterOptions.some((opt: any) => opt.label === label))
      if (candidates.length >= 2) { clarificationCandidates.value = candidates; await doctorSay(optionResult.clarificationQuestion); return }
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

  showVoiceToast.value = true; showErrorToast.value = false
  const text = await startSpeechAndWait(); showVoiceToast.value = false

  if (speechError.value) {
    showErrorToast.value = true; errorToastText.value = speechError.value || '语音识别失败，请重试'
    setTimeout(() => { showErrorToast.value = false }, 3000); return
  }
  if (text) { inputText.value = text; onSubmitText(text) }
}

watch(speechTranscript, (val) => { if (speechStatus.value === 'listening' && val) inputText.value = val })

// ── 初始化 ───────────────────────────────────────────────────
onMounted(async () => {
  consultationStore.startConsultation()
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

onUnmounted(() => { isUnmounting = true; clearTimers(); stopSpeech() })
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
        src="@/assets/doctor.png"
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
        <img v-if="msg.role === 'doctor'" class="chat-avatar" src="@/assets/doctor.png" alt="老中医师" />
        <!-- 护士头像 -->
        <img v-else-if="msg.role === 'nurse'" class="chat-avatar" src="@/assets/assistant.png" alt="护士" />
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
          <div class="syndrome-section-title">四、经络图示</div>
          <div class="syndrome-section-content">
            <div class="syndrome-illustration">{{ syndromeOutputData.illustration }}</div>
          </div>
        </div>

        <div class="syndrome-card-section">
          <div class="syndrome-section-title">五、调理方案</div>
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
          <div class="syndrome-section-title">六、产品配套</div>
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
          <div class="syndrome-footer-tip">以上为模拟辨证分析结果，仅供参考。后续将接入真实证型计算引擎。</div>
        </div>
      </div>

      <!-- 医生思考中 / 打字中 -->
      <div v-if="isTyping" class="chat-msg doctor">
        <img class="chat-avatar" src="@/assets/doctor.png" alt="老中医师" />
        <div v-if="llmIsLoading" class="chat-bubble-doctor thinking-bubble">
          <span class="thinking-icon">🤔</span>
          <span class="thinking-text">正在分析您的描述…</span>
        </div>
        <div v-else class="chat-bubble-doctor">
          <span class="typing-cursor"></span>
        </div>
      </div>
    </div>

    <!-- 选项按钮组：全局隐藏，用户通过语音/文字自由表达，系统自动识别意图 -->
    <div class="options-area" v-if="false">
      <button
        v-for="opt in currentStep.options"
        :key="opt.label"
        class="option-btn"
        @click="onOptionClick(opt.label, opt.nextStep, opt.payload)"
      >
        {{ opt.label }}
      </button>
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
        <!-- 采集中：显示进度 -->
        <template v-else>
          <div class="capture-icon">
            <span v-if="captureType === 'tongue_top'">📷</span>
            <span v-else-if="captureType === 'tongue_bottom'">📷</span>
            <span v-else-if="captureType === 'pulse'">🫀</span>
          </div>
          <div class="capture-title">
            {{ captureType === 'pulse' ? '正在测量脉搏…' : '正在拍摄舌象…' }}
          </div>
          <div class="capture-progress-bar">
            <div class="capture-progress-fill" :style="{ width: captureProgress + '%' }"></div>
          </div>
          <div class="capture-tip">
            {{ captureType === 'tongue_top' ? '请自然伸出舌头，面对镜头' : captureType === 'tongue_bottom' ? '请将舌头卷起，露出舌下脉络' : '请将手腕内侧贴近设备感应区' }}
          </div>
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
      <span>正在聆听，请说话…</span>
    </div>

    <!-- 错误提示 -->
    <div class="error-toast" v-if="showErrorToast">⚠️ {{ errorToastText }}</div>

  </div>
</template>
