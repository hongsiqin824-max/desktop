// 语音朗读组合式函数（薄封装，实际逻辑已迁移至全局 Pinia Store）
// 保留此文件仅为兼容，建议直接使用 useTTSStore
import { useTTSStore } from '@/stores/global/tts'
import type { PersonaType } from '@/types/consultation'

export type { PersonaType }

export function useTTS() {
  const store = useTTSStore()
  return {
    isSpeaking: store.isSpeaking,
    isSupported: store.isSupported,
    speakSync: store.speakSync,
    stop: store.stop,
  }
}
