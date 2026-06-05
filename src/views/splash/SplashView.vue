<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import './styles/SplashView.css'

const router = useRouter()
const progress = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // 模拟加载进度（缩短为1秒快速过渡）
  const duration = 1000 // 1秒加载
  const interval = 30
  const step = (100 / (duration / interval))

  timer = setInterval(() => {
    progress.value += step
    if (progress.value >= 100) {
      progress.value = 100
      clearInterval(timer!)
      timer = null
      setTimeout(() => {
        router.push('/welcome')
      }, 200) // 加载满后短暂停顿跳转
    }
  }, interval)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})
</script>

<template>
  <div class="splash-view">
    <!-- 顶部 LOGO 与 品牌名 -->
    <div class="brand-section">
      <img class="logo" src="@/assets/logo.webp" alt="Logo" />
      <div class="brand-divider"></div>
      <h1 class="brand-name">中医智能问诊系统</h1>
    </div>

    <!-- 中部莲花绽放动画 -->
    <div class="lotus-section">
      <img class="lotus-img" src="@/assets/lotus.webp" alt="Lotus" />
    </div>

    <!-- 底部横向加载进度条 -->
    <div class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
      </div>
    </div>
  </div>
</template>
