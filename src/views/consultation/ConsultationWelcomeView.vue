<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/global/user'
import { useTTSStore } from '@/stores/global/tts'
import './styles/ConsultationWelcomeView.css'

const router = useRouter()
const userStore = useUserStore()
const ttsStore = useTTSStore()

const isNewUser = computed(() => userStore.isNewUser)

const fullText = computed(() => {
  if (isNewUser.value) {
    return '您好，新朋友！欢迎您！🌺\n中医师这就来为您问诊辨证，请放松心情～'
  }
  return '老朋友您好，欢迎回来！💐\n我请中医师继续为您问诊辨证，马上开始～'
})

const btnText = computed(() => {
  return isNewUser.value ? '进入问诊' : '继续问诊'
})

const displayedText = ref('')

onMounted(async () => {
  // 文字直接显示完整内容，TTS 作为背景音播放
  displayedText.value = fullText.value
  // 等待前一页的清理任务完成，避免旧 stop() 取消新 speakSync
  await nextTick()
  ttsStore.speakSync(fullText.value, 'nurse', () => {})
})

onUnmounted(() => {
  ttsStore.stop()
})

const onContinueClick = () => {
  ttsStore.stop()
  router.push('/consultation/transition')
}
</script>

<template>
  <div class="welcome-view">
    <!-- 上半屏：护士数字人 -->
    <div class="assistant-section">
      <img class="assistant-img" src="@/assets/assistant.png" alt="护士" />
    </div>

    <!-- 下半屏：气泡 -->
    <div class="dialog-section">
      <div class="chat-bubble">
        <div class="chat-text">{{ displayedText }}</div>
      </div>
    </div>

    <!-- 底部按钮（立即显示，用户可随时跳过语音） -->
    <button class="action-btn" @click="onContinueClick">{{ btnText }}</button>
  </div>
</template>