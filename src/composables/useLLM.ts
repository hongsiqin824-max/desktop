// LLM 意图识别组合式函数：调用大模型 + 超时兜底 + 关键词回退

import { ref } from 'vue'
import { callLLM } from '@/api/llm'
import { buildIntentMessages, parseIntentResult, buildOptionMatchMessages, parseOptionMatchResult } from '@/data/llmPrompt'
import type { IIntentResult, IOptionMatchResult } from '@/types/llm'

const LLM_TIMEOUT_MS = 8000

export function useLLM() {
  const isLoading = ref(false)
  const error = ref('')

  // 当前正在进行的 LLM 请求控制器，用于取消
  let currentController: AbortController | null = null

  const abort = () => {
    if (currentController) {
      currentController.abort()
      currentController = null
    }
  }

  const recognizeIntent = async (
    userText: string,
    stepId: string,
    currentSymptom?: string,
  ): Promise<IIntentResult | null> => {
    isLoading.value = true
    error.value = ''

    const messages = buildIntentMessages(userText, stepId, currentSymptom)

    abort()
    currentController = new AbortController()
    const resultPromise = callLLM(messages, { signal: currentController.signal })

    let timeoutId: ReturnType<typeof setTimeout> = undefined!
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('LLM 超时')), LLM_TIMEOUT_MS)
    })

    try {
      const raw = await Promise.race([resultPromise, timeoutPromise])
      clearTimeout(timeoutId)
      const result = parseIntentResult(raw)

      isLoading.value = false
      return result
    } catch (e) {
      clearTimeout(timeoutId)
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

    const messages = buildOptionMatchMessages(userText, stepId, options, doctorText, contextHint)

    abort()
    currentController = new AbortController()
    const resultPromise = callLLM(messages, { signal: currentController.signal })

    let timeoutId: ReturnType<typeof setTimeout> = undefined!
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('LLM 超时')), LLM_TIMEOUT_MS)
    })

    try {
      const raw = await Promise.race([resultPromise, timeoutPromise])
      clearTimeout(timeoutId)
      const result = parseOptionMatchResult(raw)

      isLoading.value = false
      return result
    } catch (e) {
      clearTimeout(timeoutId)
      const msg = e instanceof Error ? e.message : '选项分类失败'
      error.value = msg
      isLoading.value = false
      return null
    }
  }

  return { isLoading, error, recognizeIntent, classifyOption, abort }
}