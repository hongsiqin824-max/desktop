<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
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
    return '您好，您第一次来，是新朋友呀！欢迎您！🌺\n稍等，我这就请中医师来给您问诊辨证。中医师会像聊天一样和您交流，请放松心情～'
  }
  return '您好，噢，是老朋友来了！欢迎您再次光临！💐\n很高兴又见到您，我这就请中医师继续为您问诊辨证，我们马上开始～'
})

const btnText = computed(() => {
  return isNewUser.value ? '进入问诊' : '继续问诊'
})

const displayedText = ref('')

onMounted(async () => {
  // 按钮立即显示，TTS 作为背景音播放，用户可随时点击进入
  ttsStore.speakSync(fullText.value, 'nurse', (char) => {
    displayedText.value += char
  })
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