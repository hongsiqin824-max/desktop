<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTTS } from '@/composables/useTTS'
import './styles/AssistantWelcomeView.css'

const router = useRouter()
const { speakSync, stop: ttsStop } = useTTS()

const displayedText = ref('')
const fullText = '您好！欢迎使用中医智能问诊系统～'

onMounted(() => {
  // TTS 作为背景音播放，按钮立即显示，用户可随时点击跳过
  speakSync(fullText, 'nurse', (char) => {
    displayedText.value += char
  })
})

onUnmounted(() => {
  ttsStop()
})

const onStartClick = () => {
  ttsStop()
  router.push('/user/form')
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
    <button class="action-btn" @click="onStartClick">开始问诊</button>
  </div>
</template>