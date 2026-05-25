// 语音朗读组合式函数：百炼CosyVoice合成+打字机同步
import { ref } from 'vue'
import type { PersonaType } from '@/types/consultation'

export type { PersonaType }

const TTS_PROXY_URL = '/tts-proxy/tts'

const PERSONA_CHARS_PER_SEC: Record<PersonaType, number> = {
  nurse: 3.6,
  doctor: 3.4,
}

export function useTTS() {
  const isSpeaking = ref(false)
  const isSupported = ref(true)

  let _currentAudio: HTMLAudioElement | null = null
  let _audioUrl: string | null = null
  let typewriterTimer: ReturnType<typeof setInterval> | null = null
  let safetyTimer: ReturnType<typeof setTimeout> | null = null

  const clearSafetyTimer = () => {
    if (safetyTimer) {
      clearTimeout(safetyTimer)
      safetyTimer = null
    }
  }

  const cleanupAudio = () => {
    if (_currentAudio) {
      _currentAudio.pause()
      _currentAudio.oncanplay = null
      _currentAudio.onended = null
      _currentAudio.onerror = null
      _currentAudio = null
    }
    if (_audioUrl) {
      URL.revokeObjectURL(_audioUrl)
      _audioUrl = null
    }
  }

  const finishTypewriter = (text: string, charIndex: number, onChar: (char: string) => void) => {
    if (typewriterTimer) {
      clearInterval(typewriterTimer)
      typewriterTimer = null
    }
    isSpeaking.value = false
    while (charIndex < text.length) {
      onChar(text[charIndex] ?? '')
      charIndex++
    }
  }

  const speakCloud = (
    text: string,
    persona: PersonaType,
    onChar: (char: string) => void,
    resolve: () => void,
    doResolve: () => void,
    charIndexRef: { value: number },
  ): void => {
    let resolved = false
    const localResolve = () => {
      if (resolved) return
      resolved = true
      doResolve()
    }

    const charsPerSec = PERSONA_CHARS_PER_SEC[persona]
    const charDelay = 1000 / charsPerSec
    const estimatedMs = (text.length / charsPerSec) * 1000 + 15000
    safetyTimer = setTimeout(localResolve, Math.max(estimatedMs, 30000))

    isSpeaking.value = true

    const doFetch = (retriesLeft: number): Promise<ArrayBuffer | null> => {
      return fetch(TTS_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, persona }),
      })
        .then(r => {
          if (!r.ok) {
            if (retriesLeft > 0) {
              return new Promise<ArrayBuffer | null>(r2 => {
                setTimeout(() => { doFetch(retriesLeft - 1).then(r2) }, 500)
              })
            }
            return null
          }
          return r.arrayBuffer()
        })
        .catch(() => {
          if (retriesLeft > 0) {
            return new Promise<ArrayBuffer | null>(r2 => {
              setTimeout(() => { doFetch(retriesLeft - 1).then(r2) }, 500)
            })
          }
          return null
        })
    }

    doFetch(1).then(audioData => {
      if (!audioData || !isSpeaking.value) {
        localResolve()
        return
      }

      const blob = new Blob([audioData], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)

      _currentAudio = audio
      _audioUrl = url

      let started = false

      audio.oncanplay = () => {
        if (started) return
        started = true
        if (!isSpeaking.value) return

        // 启动打字机
        typewriterTimer = setInterval(() => {
          if (charIndexRef.value < text.length) {
            onChar(text[charIndexRef.value] ?? '')
            charIndexRef.value++
          } else {
            if (typewriterTimer) {
              clearInterval(typewriterTimer)
              typewriterTimer = null
            }
          }
        }, charDelay)

        // 播放音频
        audio.play().catch(() => {
          localResolve()
        })
      }

      audio.onended = () => {
        cleanupAudio()
        localResolve()
      }

      audio.onerror = () => {
        cleanupAudio()
        localResolve()
      }
    })
  }

  const speakSync = (
    text: string,
    persona: PersonaType,
    onChar: (char: string) => void,
  ): Promise<void> => {
    return new Promise<void>((resolve) => {
      let resolved = false
      const charIndexRef = { value: 0 }

      const doResolve = () => {
        if (resolved) return
        resolved = true
        clearSafetyTimer()
        finishTypewriter(text, charIndexRef.value, onChar)
        resolve()
      }

      speakCloud(text, persona, onChar, resolve, doResolve, charIndexRef)
    })
  }

  const stop = () => {
    cleanupAudio()
    if (typewriterTimer) {
      clearInterval(typewriterTimer)
      typewriterTimer = null
    }
    clearSafetyTimer()
    isSpeaking.value = false
  }

  return { isSpeaking, isSupported, speakSync, stop }
}