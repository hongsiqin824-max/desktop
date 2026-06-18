// 全局会话状态管理：登录状态 + Cookie + 数字人模型列表
// Tauri 模式下手动管理 JSESSIONID，浏览器模式下由浏览器自动管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { QuestionModel } from '@/api/auth'

const STORAGE_KEY = 'jsessionid'

export const useSessionStore = defineStore('globalSession', () => {
  // ── 登录状态 ──────────────────────────────────────────
  const jsessionId = ref<string>('')
  const isLoggedIn = computed(() => jsessionId.value !== '')

  // ── 数字人模型列表（登录后拉取）───────────────────────
  const digitalHumanModels = ref<QuestionModel[]>([])

  // ── 初始化：从 localStorage 恢复登录状态 ──────────────
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    jsessionId.value = stored
  }

  // ── 设置 JSESSIONID（登录成功后调用）─────────────────
  const setSession = (id: string) => {
    jsessionId.value = id
    localStorage.setItem(STORAGE_KEY, id)
    if (import.meta.env.DEV) {
      console.log('[会话] 已存储 JSESSIONID:', id)
    }
  }

  // ── 清除登录状态（登出/Cookie 过期时调用）─────────────
  const clearSession = () => {
    jsessionId.value = ''
    digitalHumanModels.value = []
    localStorage.removeItem(STORAGE_KEY)
    if (import.meta.env.DEV) {
      console.log('[会话] 已清除登录状态')
    }
  }

  // ── 存储数字人模型列表 ────────────────────────────────
  const setDigitalHumanModels = (models: QuestionModel[]) => {
    digitalHumanModels.value = models
    if (import.meta.env.DEV) {
      console.log('[会话] 已存储数字人模型列表:', models.length, '条')
    }
  }

  // ── 根据主症名称匹配数字人模型的 kqmId ────────────────
  // 匹配规则：kqmName 包含主症名称（如 "感冒辨证-数字人" 包含 "感冒"）
  // 未匹配到时返回默认值（当前唯一的模型，或空字符串）
  const findModelIdBySymptom = (symptomName: string): string => {
    // 精确匹配：kqmName 包含症状名
    const matched = digitalHumanModels.value.find(m =>
      m.kqmName.includes(symptomName),
    )
    if (matched) return matched.kqmId

    // 未匹配到：返回第一个模型作为默认值
    if (digitalHumanModels.value.length > 0) {
      return digitalHumanModels.value[0]!.kqmId
    }

    return ''
  }

  return {
    // 状态
    jsessionId,
    isLoggedIn,
    digitalHumanModels,
    // 方法
    setSession,
    clearSession,
    setDigitalHumanModels,
    findModelIdBySymptom,
  }
})
