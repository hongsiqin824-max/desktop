// LLM 意图识别组合式函数：调用大模型 + 超时兜底 + 关键词回退

import { ref } from 'vue'
import { callLLM } from '@/api/llm'
import { buildIntentMessages, parseIntentResult, buildOptionMatchMessages, parseOptionMatchResult } from '@/api/llm/prompt'
import type { IIntentResult, IOptionMatchResult } from '@/types/llm'

const LLM_TIMEOUT_MS = 8000

export function useLLM() {
  const isLoading = ref(false)
  const error = ref('')

  const recognizeIntent = async (
    userText: string,
    stepId: string,
    currentSymptom?: string,
  ): Promise<IIntentResult | null> => {
    isLoading.value = true
    error.value = ''

    try {
      const messages = buildIntentMessages(userText, stepId, currentSymptom)

      const resultPromise = callLLM(messages)

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('LLM 超时')), LLM_TIMEOUT_MS)
      })

      const raw = await Promise.race([resultPromise, timeoutPromise])
      const result = parseIntentResult(raw)

      isLoading.value = false
      return result
    } catch (e) {
      const msg = e instanceof Error ? e.message : '意图识别失败'
      error.value = msg
      isLoading.value = false
      return null
    }
  }

  const classifyOption = async (
    userText: string,
    stepId: string,
    options: { label: string; semanticDesc?: string }[],
    doctorText?: string,
    contextHint?: string,
  ): Promise<IOptionMatchResult | null> => {
    isLoading.value = true
    error.value = ''

    try {
      const messages = buildOptionMatchMessages(userText, stepId, options, doctorText, contextHint)

      const resultPromise = callLLM(messages)

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('LLM 超时')), LLM_TIMEOUT_MS)
      })

      const raw = await Promise.race([resultPromise, timeoutPromise])
      const result = parseOptionMatchResult(raw)

      isLoading.value = false
      return result
    } catch (e) {
      const msg = e instanceof Error ? e.message : '选项分类失败'
      error.value = msg
      isLoading.value = false
      return null
    }
  }

  return { isLoading, error, recognizeIntent, classifyOption }
}