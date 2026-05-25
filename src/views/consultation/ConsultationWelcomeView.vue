<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/global/user'
import { useTTS } from '@/composables/useTTS'
import './styles/ConsultationWelcomeView.css'

const router = useRouter()
const userStore = useUserStore()
const { speakSync, stop: ttsStop } = useTTS()

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
const showButton = ref(false)

onMounted(async () => {
  await speakSync(fullText.value, 'nurse', (char) => {
    displayedText.value += char
  })
  showButton.value = true
})

onUnmounted(() => {
  ttsStop()
})

const onContinueClick = () => {
  ttsStop()
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

    <!-- 底部按钮（语音结束后显示） -->
    <button class="action-btn" v-if="showButton" @click="onContinueClick">{{ btnText }}</button>
  </div>
</template>