// 详细问诊逻辑组合式函数：问题队列推进、程度追问、答案记录
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { StepIdType, IChatOption, IDetailAnswer, IDetailSeverityPending, IChatMessage } from '@/types/consultation'
import { DETAIL_QUESTION_MAP, DETAIL_SEQUENCE_MAP, DETAIL_FIRST_QUESTION, DETAIL_EXPLANATION_MAP, COLD_QUESTIONS, COLD_QUESTION_SEQUENCE } from '@/data/consultationDetail'
import { generateResponse } from '@/data/consultationResponse'

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

  // 程度追问完成后或首题回答后，从队列取下一题（跳过已问过的追加问诊）
  const advanceDetailQueue = async () => {
    const questionSet = DETAIL_QUESTION_MAP[currentSymptom.value] || COLD_QUESTIONS
    const answeredTaCodes = new Set(detailAnswers.value.map(a => a.taCode))

    while (detailQuestionQueue.value.length > 0 && detailAskedCategories.value.has(detailQuestionQueue.value[0]!)) {
      detailQuestionQueue.value.shift()
    }

    while (detailQuestionQueue.value.length > 0) {
      const category = detailQuestionQueue.value[0]!
      if (detailAskedCategories.value.has(category)) {
        detailQuestionQueue.value.shift()
        continue
      }
      const question = questionSet[category]
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
      const currentQ = questionSet[category]
      await doctorSay(generateResponse('O_VALID'), 300)
      if (currentQ) {
        await doctorSay(currentQ.doctorText)
      }
      return
    }

    await goToStep('detail_summary')
  }

  // 从队列中跳过无效题目并取出下一有效题（用于首题/程度追问后的队列推进）
  const shiftNextValidFromQueue = async (): Promise<boolean> => {
    const questionSet = DETAIL_QUESTION_MAP[currentSymptom.value] || COLD_QUESTIONS
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
      const q = questionSet[cat]
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
      const questionSet2 = DETAIL_QUESTION_MAP[currentSymptom.value] || COLD_QUESTIONS
      await doctorSay(generateResponse('O_VALID'), 300)
      const nextQ = questionSet2[detailQuestionCategory.value]
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
          await goToStep('detail_summary')
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

    const questionSet = DETAIL_QUESTION_MAP[currentSymptom.value] || COLD_QUESTIONS

    detailAskedCategories.value.add(detailQuestionCategory.value)
    const question = questionSet[detailQuestionCategory.value]
    const matchedOpt = question?.options.find(opt => opt.label === label)
    if (matchedOpt && question) {
      detailAnswers.value.push({ taCode: matchedOpt.taCode, label: matchedOpt.label, category: question.category })

      if (matchedOpt.followUpQuestions && matchedOpt.followUpQuestions.length > 0) {
        detailQuestionQueue.value = [...matchedOpt.followUpQuestions, ...detailQuestionQueue.value]
      }

      if (matchedOpt.severityQuestion) {
        detailSeverityPending.value = {
          subjectText: matchedOpt.severityQuestion.subjectText,
          lighterCode: matchedOpt.severityQuestion.lighterCode,
          heavierCode: matchedOpt.severityQuestion.heavierCode,
          parentLabel: matchedOpt.label,
          parentCategory: question.category,
          isFirstQuestion: detailIsFirstQuestion.value,
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
      const questionSet = DETAIL_QUESTION_MAP[currentSymptom.value] || COLD_QUESTIONS
      const question = questionSet[detailQuestionCategory.value]
      if (question) {
        const labels = question.options.map(opt => opt.label).join('、')
        await doctorSay(`我已经尝试多次理解您的描述，为了准确记录，请您直接从以下选项中选择一项：${labels}。`)
      } else {
        await doctorSay('请您从给出的选项中选择最符合您情况的一项，这样我能更准确地记录。')
      }
    } else {
      const questionSet = DETAIL_QUESTION_MAP[currentSymptom.value] || COLD_QUESTIONS
      const question = questionSet[detailQuestionCategory.value]
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
