// 全局 UI 状态管理：播放倍速设置
import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 播放倍速可选值 */
export type PlaybackSpeedType = 1 | 1.25 | 1.5

const STORAGE_KEY = 'playback_speed'

export const useUIStore = defineStore('globalUI', () => {
  const stored = localStorage.getItem(STORAGE_KEY)
  const initial: PlaybackSpeedType = stored === '1.25' ? 1.25 : stored === '1.5' ? 1.5 : 1

  const playbackSpeed = ref<PlaybackSpeedType>(initial)

  const setPlaybackSpeed = (speed: PlaybackSpeedType) => {
    playbackSpeed.value = speed
    localStorage.setItem(STORAGE_KEY, String(speed))
  }

  return {
    playbackSpeed,
    setPlaybackSpeed,
  }
})
