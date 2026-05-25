<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/global/user'
import './styles/TransitionView.css'

const router = useRouter()
const userStore = useUserStore()

const isNewUser = computed(() => userStore.isNewUser)

const mainText = computed(() => {
  return isNewUser.value
    ? '正在为您连线中医师…'
    : '老朋友回来啦，正在为您连线中医师…'
})

const subText = computed(() => {
  return isNewUser.value
    ? '中医师会像聊天一样和您交流，请放松心情～'
    : '很高兴又见到您，我们马上开始～'
})

onMounted(() => {
  // 3秒后自动跳转到问诊界面
  setTimeout(() => {
    router.push('/consultation')
  }, 3000)
})
</script>

<template>
  <div class="transition-view">
    <!-- 数字人圆形头像（带呼吸光晕） -->
    <div class="transition-assistant-section">
      <img class="transition-assistant-img" src="@/assets/doctor.png" alt="老中医师" />
    </div>

    <!-- 过渡文案 -->
    <div class="transition-text">{{ mainText }}</div>
    <div class="transition-subtext">{{ subText }}</div>

    <!-- 跳动圆点加载动画 -->
    <div class="transition-loading">
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
    </div>

    <!-- 底部进度条 -->
    <div class="transition-progress-bar">
      <div class="transition-progress-fill"></div>
    </div>
  </div>
</template>
