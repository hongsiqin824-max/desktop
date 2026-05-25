<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTTS } from '@/composables/useTTS'
import './styles/AssistantWelcomeView.css'

const router = useRouter()
const { speakSync, stop: ttsStop } = useTTS()

const displayedText = ref('')
const showButton = ref(false)
const fullText = '您好！欢迎使用中医智能问诊系统～'

onMounted(async () => {
  await speakSync(fullText, 'nurse', (char) => {
    displayedText.value += char
  })
  showButton.value = true
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

    <!-- 底部按钮（语音结束后显示） -->
    <button class="action-btn" v-if="showButton" @click="onStartClick">开始问诊</button>
  </div>
</template>