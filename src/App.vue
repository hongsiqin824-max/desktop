<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted, onUnmounted } from 'vue'
import { useTTSStore } from '@/stores/global/tts'

const ttsStore = useTTSStore()

/** 全局跳过按钮点击：先标记"全局跳过"，再停止 TTS */
const onGlobalSkip = () => {
  ttsStore.markGlobalSkip()
  ttsStore.stop()
}

// 动态计算缩放比例，使 1080×1920 的容器适配任意窗口大小
const DESIGN_W = 1080
const DESIGN_H = 1920
const updateScale = () => {
  const scaleX = window.innerWidth / DESIGN_W
  const scaleY = window.innerHeight / DESIGN_H
  const scale = Math.min(scaleX, scaleY, 1) // 不超过原始大小
  document.documentElement.style.setProperty('--app-scale', String(scale))
}

onMounted(() => {
  updateScale()
  window.addEventListener('resize', updateScale)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateScale)
})
</script>

<template>
  <div class="app-container">
    <RouterView />

    <!-- 全局跳过按钮：TTS 朗读时始终显示在右下角 -->
    <button
      v-if="ttsStore.isSpeaking"
      class="global-skip-btn"
      @click="onGlobalSkip"
      title="跳过当前朗读"
    >
      ⏭ 跳过
    </button>
  </div>
</template>

<style scoped>
.app-container {
  width: 1080px;
  height: 1920px;
  margin: 0 auto;
  position: relative;
  background-color: var(--theme-bg);
  overflow: hidden;
  box-shadow: var(--container-shadow); /* 添加些许阴影以便在PC上查看边界 */
}

/* 在较小屏幕上自动等比缩放，适配桌面开发/演示 */
@media (max-height: 1920px), (max-width: 1080px) {
  .app-container {
    transform-origin: top center;
    transform: scale(var(--app-scale, 1));
  }
}
</style>
