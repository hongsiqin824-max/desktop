// 详细问诊逻辑组合式函数：问题队列推进、程度追问、答案记录
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { StepIdType, IChatOption, IDetailAnswer, IDetailSeverityPending, IChatMessage } from '@/types/consultation'
import { DETAIL_QUESTION_MAP, DETAIL_SEQUENCE_MAP, DETAIL_FIRST_QUESTION, DETAIL_EXPLANATION_MAP, COLD_QUESTIONS, COLD_QUESTION_SEQUENCE, GENDER_QUESTIONS, GENDER_QUESTION_SEQUENCE, GENDER_CONDITIONS, SHARED_CHILL_HEAT_QUESTIONS, SHARED_THIRST_QUESTIONS, SHARED_TASTE_QUESTIONS, SHARED_STOOL_QUESTIONS, SHARED_BLOOD_STASIS_QUESTIONS, SHARED_SWEAT_QUESTIONS, SHARED_FATIGUE_QUESTIONS, SHARED_FOLLOWUP_MAP } from '@/data/consultationDetail'
import { generateResponse } from '@/data/consultationResponse'
import { useUserStore } from '@/stores/global/user'

export interface IDetailContext {
  currentSymptom: Ref<string>
  messages: Ref<IChatMessage[]>
  detailIsFirstQuestion: Ref<boolean>
  detailBranch: Ref<string>
  detailQuestionQueue: Ref<string[]>
  goToStep: (stepId: StepIdType, symptom?: string) => Promise<void>
  doctorSay: (text: string, delay?: number) => Promise<void>
  scrollToBottom: () => Promise<void>
}

export function useDetailQuestion(ctx: IDetailContext) {
  const { currentSymptom, messages, detailIsFirstQuestion, detailBranch, detailQuestionQueue, goToStep, doctorSay, scrollToBottom } = ctx

  const detailQuestionCategory = ref<string>('chillHeat')
  const detailAskedCategories = ref<Set<string>>(new Set())
  const detailAnswers = ref<IDetailAnswer[]>([])
  const detailSeverityPending = ref<IDetailSeverityPending | null>(null)
  const detailFailCount = ref(0)
  const genderQuestionsInjected = ref(false)

  // 查找问题定义：先查症状专属题库，再查共享题库（寒热/口渴/口味/大便/血瘀），最后查性别共享题库
  const findQuestion = (category: string) => {
    const questionSet = DETAIL_QUESTION_MAP[currentSymptom.value] || COLD_QUESTIONS
    return questionSet[category] || SHARED_CHILL_HEAT_QUESTIONS[category] || SHARED_THIRST_QUESTIONS[category] || SHARED_TASTE_QUESTIONS[category] || SHARED_STOOL_QUESTIONS[category] || SHARED_BLOOD_STASIS_QUESTIONS[category] || SHARED_SWEAT_QUESTIONS[category] || SHARED_FATIGUE_QUESTIONS[category] || GENDER_QUESTIONS[category]
  }

  // 解析共享追问的通用 key 为当前症状的实际 key
  const resolveFollowUps = (keys: string[]): string[] => {
    const map = SHARED_FOLLOWUP_MAP[currentSymptom.value]
    if (!map) return keys
    return keys.map(key => map[key] || key)
  }

  // 尝试注入性别特异性问题（仅执行一次）
  const tryInjectGenderQuestions = (): boolean => {
    if (genderQuestionsInjected.value) return false
    genderQuestionsInjected.value = true

    const userStore = useUserStore()
    const gender = userStore.userInfo.gender
    const age = userStore.userInfo.age
    const genderKey = gender === '男' ? 'male' : gender === '女' ? 'female' : null
    if (!genderKey || !age) return false

    const cond = GENDER_CONDITIONS[genderKey]
    if (age < cond.ageRange[0] || age > cond.ageRange[1]) return false

    const seq = GENDER_QUESTION_SEQUENCE[genderKey]
    detailQuestionQueue.value = [...seq]
    return true
  }

  // 程度追问完成后或首题回答后，从队列取下一题（跳过已问过的追加问诊）
  const advanceDetailQueue = async () => {
    const answeredTaCodes = new Set(detailAnswers.value.map(a => a.taCode))

    // 跳过已问过的题目
    while (detailQuestionQueue.value.length > 0 && detailAskedCategories.value.has(detailQuestionQueue.value[0]!)) {
      detailQuestionQueue.value.shift()
    }

    // 跳过无效题目（excludeAfter 等）
    while (detailQuestionQueue.value.length > 0) {
      const category = detailQuestionQueue.value[0]!
      if (detailAskedCategories.value.has(category)) {
        detailQuestionQueue.value.shift()
        continue
      }
      const question = findQuestion(category)
      if (!question) {
        detailQuestionQueue.value.shift()
        detailAskedCategories.value.add(category)
        continue
      }
      const hasValidOption = question.options.some(opt => {
        if (!opt.excludeAfter) return true
        return !opt.excludeAfter.some(excluded => answeredTaCodes.has(excluded))
      })
      if (!hasValidOption) {
        detailQuestionQueue.value.shift()
        detailAskedCategories.value.add(category)
        continue
      }
      break
    }

    if (detailQuestionQueue.value.length > 0) {
      const category = detailQuestionQueue.value.shift()!
      detailAskedCategories.value.add(category)
      detailQuestionCategory.value = category
      const currentQ = findQuestion(category)
      await doctorSay(generateResponse('O_VALID'), 300)
      if (currentQ) {
        await doctorSay(currentQ.doctorText)
      }
      return
    }

    // 队列为空时，尝试注入性别特异性问题
    if (tryInjectGenderQuestions()) {
      // 注入成功，重新执行队列推进
      await advanceDetailQueue()
      return
    }

    await goToStep('detail_summary')
  }

  // 从队列中跳过无效题目并取出下一有效题（用于首题/程度追问后的队列推进）
  const shiftNextValidFromQueue = async (): Promise<boolean> => {
    const answeredTaCodes = new Set(detailAnswers.value.map(a => a.taCode))

    while (detailQuestionQueue.value.length > 0 && detailAskedCategories.value.has(detailQuestionQueue.value[0]!)) {
      detailQuestionQueue.value.shift()
    }
    while (detailQuestionQueue.value.length > 0) {
      const cat = detailQuestionQueue.value[0]!
      if (detailAskedCategories.value.has(cat)) {
        detailQuestionQueue.value.shift()
        continue
      }
      const q = findQuestion(cat)
      if (!q) {
        detailQuestionQueue.value.shift()
        detailAskedCategories.value.add(cat)
        continue
      }
      const hasValid = q.options.some(opt => {
        if (!opt.excludeAfter) return true
        return !opt.excludeAfter.some(excluded => answeredTaCodes.has(excluded))
      })
      if (!hasValid) {
        detailQuestionQueue.value.shift()
        detailAskedCategories.value.add(cat)
        continue
      }
      break
    }

    if (detailQuestionQueue.value.length > 0) {
      detailQuestionCategory.value = detailQuestionQueue.value.shift()!
      detailAskedCategories.value.add(detailQuestionCategory.value)
      await doctorSay(generateResponse('O_VALID'), 300)
      const nextQ = findQuestion(detailQuestionCategory.value)
      if (nextQ) {
        await doctorSay(nextQ.doctorText)
      }
      return true
    }
    return false
  }

  // 处理详细问诊选项点击，返回 true 表示已处理
  const handleDetailOptionClick = async (label: string): Promise<boolean> => {
    // ── 程度追问回答处理 ──
    if (detailSeverityPending.value) {
      detailFailCount.value = 0
      messages.value.push({ role: 'user', text: label })
      await scrollToBottom()

      const severityTaCode = label === '较轻'
        ? detailSeverityPending.value.lighterCode
        : detailSeverityPending.value.heavierCode

      detailAnswers.value.push({
        taCode: severityTaCode,
        label: `${detailSeverityPending.value.parentLabel}(${label})`,
        category: detailSeverityPending.value.parentCategory,
      })

      const pending = detailSeverityPending.value
      detailSeverityPending.value = null

      // 程度追问完成后，若有后续追问则插入队列头部
      if (pending.followUpQuestions && pending.followUpQuestions.length > 0) {
        detailQuestionQueue.value = [...pending.followUpQuestions, ...detailQuestionQueue.value]
      }

      if (pending.isFirstQuestion) {
        detailBranch.value = pending.parentLabel
        detailIsFirstQuestion.value = false
        const sequenceMap = DETAIL_SEQUENCE_MAP[currentSymptom.value] || COLD_QUESTION_SEQUENCE
        const sequence = sequenceMap[pending.parentLabel]
        if (sequence && sequence.length > 0) {
          detailQuestionQueue.value = [...detailQuestionQueue.value, ...sequence]
        }
        const hasNext = await shiftNextValidFromQueue()
        if (!hasNext) {
          // 队列为空时尝试注入性别问题
          if (tryInjectGenderQuestions()) {
            await advanceDetailQueue()
          } else {
            await goToStep('detail_summary')
          }
        }
        return true
      }

      await advanceDetailQueue()
      return true
    }

    // ── 正常问题回答处理 ──
    detailFailCount.value = 0
    messages.value.push({ role: 'user', text: label })
    await scrollToBottom()

    detailAskedCategories.value.add(detailQuestionCategory.value)
    const question = findQuestion(detailQuestionCategory.value)
    const matchedOpt = question?.options.find(opt => opt.label === label)
    if (matchedOpt && question) {
      // 选项级 excludeAfter：若已记录过互斥编码，跳过该选项直接推进下一题
      if (matchedOpt.excludeAfter && matchedOpt.excludeAfter.length > 0) {
        const answeredCodes = new Set(detailAnswers.value.map(a => a.taCode))
        if (matchedOpt.excludeAfter.some(code => answeredCodes.has(code))) {
          await doctorSay(generateResponse('O_VALID'), 300)
          await advanceDetailQueue()
          return true
        }
      }

      // 有 taCode 的选项才记录答案，没有 taCode 的是否定选项（不记录编码，仅推进流程）
      if (matchedOpt.taCode) {
        detailAnswers.value.push({ taCode: matchedOpt.taCode, label: matchedOpt.label, category: question.category })
      }

      if (matchedOpt.followUpQuestions && matchedOpt.followUpQuestions.length > 0) {
        detailQuestionQueue.value = [...resolveFollowUps(matchedOpt.followUpQuestions), ...detailQuestionQueue.value]
      }

      if (matchedOpt.severityQuestion) {
        detailSeverityPending.value = {
          subjectText: matchedOpt.severityQuestion.subjectText,
          lighterCode: matchedOpt.severityQuestion.lighterCode,
          heavierCode: matchedOpt.severityQuestion.heavierCode,
          parentLabel: matchedOpt.label,
          parentCategory: question.category,
          isFirstQuestion: detailIsFirstQuestion.value,
          followUpQuestions: matchedOpt.severityQuestion.followUpQuestions
            ? resolveFollowUps(matchedOpt.severityQuestion.followUpQuestions)
            : undefined,
        }
        await doctorSay(generateResponse('O_VALID'), 300)
        await doctorSay(`请问${matchedOpt.severityQuestion.subjectText}的程度是较轻还是较重？`)
        return true
      }
    }

    if (detailIsFirstQuestion.value) {
      detailBranch.value = label
      detailIsFirstQuestion.value = false
      const sequenceMap = DETAIL_SEQUENCE_MAP[currentSymptom.value] || COLD_QUESTION_SEQUENCE
      const sequence = sequenceMap[label]
      if (sequence && sequence.length > 0) {
        detailQuestionQueue.value = [...detailQuestionQueue.value, ...sequence]
      }
    }

    await advanceDetailQueue()
    return true
  }

  // 处理详细问诊自由文本输入，返回 true 表示已处理
  const handleDetailSubmitText = async (text: string): Promise<boolean> => {
    if (detailSeverityPending.value) {
      detailFailCount.value++
      if (detailFailCount.value >= 3) {
        detailFailCount.value = 0
        await doctorSay(`我已经尝试多次理解您的描述，为了准确记录，请问${detailSeverityPending.value.subjectText}的程度是较轻还是较重？请直接说"较轻"或"较重"。`)
      } else {
        await doctorSay(`您说的我没太理解，请问${detailSeverityPending.value.subjectText}的程度是较轻还是较重？您可以直接说"较轻"或"较重"。`)
      }
      return true
    }

    const explanationMap = DETAIL_EXPLANATION_MAP[currentSymptom.value]?.[detailQuestionCategory.value]
    if (explanationMap && (text.includes('解释') || text.includes('什么意思') || text.includes('不懂') || text.includes('不理解'))) {
      const explanationText = Object.entries(explanationMap)
        .map(([key, value]) => `${key}：${value}`)
        .join('\n')
      detailFailCount.value = 0
      await doctorSay('我为您逐一解释一下这些术语：\n\n' + explanationText)
      return true
    }

    detailFailCount.value++
    if (detailFailCount.value >= 3) {
      detailFailCount.value = 0
      const question = findQuestion(detailQuestionCategory.value)
      if (question) {
        const labels = question.options.map(opt => opt.label).join('、')
        await doctorSay(`我已经尝试多次理解您的描述，为了准确记录，请您直接从以下选项中选择一项：${labels}。`)
      } else {
        await doctorSay('请您从给出的选项中选择最符合您情况的一项，这样我能更准确地记录。')
      }
    } else {
      const question = findQuestion(detailQuestionCategory.value)
      if (question) {
        const labels = question.options.map(opt => opt.label).join('、')
        await doctorSay(`您说的我没太理解，${question.doctorText.replace(/如果不太理解.*$/, '')}您可以直接说：${labels}。`)
      } else {
        await doctorSay('请您从给出的选项中选择最符合您情况的一项，这样我能更准确地记录。')
      }
    }
    return true
  }

  // 初始化详细问诊首题
  const initFirstQuestion = (symptom: string) => {
    const firstCategory = DETAIL_FIRST_QUESTION[symptom] || 'chillHeat'
    detailQuestionCategory.value = firstCategory
    detailQuestionQueue.value = []
    detailAskedCategories.value = new Set()
    detailAnswers.value = []
    genderQuestionsInjected.value = false
    return firstCategory
  }

  // 生成首题引导语文本
  const getFirstQuestionText = (symptom: string, firstCategory: string): string => {
    const questionSet = DETAIL_QUESTION_MAP[symptom] || COLD_QUESTIONS
    const firstQuestion = questionSet[firstCategory]
    return generateResponse('DETAIL_QUESTION_INTRO') + '\n\n' + (firstQuestion?.doctorText || '')
  }

  // 重置计数（步骤切换时调用）
  const resetCounters = () => {
    detailFailCount.value = 0
  }

  return {
    detailQuestionCategory,
    detailAskedCategories,
    detailAnswers,
    detailSeverityPending,
    detailFailCount,
    handleDetailOptionClick,
    handleDetailSubmitText,
    advanceDetailQueue,
    initFirstQuestion,
    getFirstQuestionText,
    resetCounters,
  }
}
