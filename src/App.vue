<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useTTSStore } from '@/stores/global/tts'

const ttsStore = useTTSStore()

/** 全局跳过按钮点击：先标记"全局跳过"，再停止 TTS */
const onGlobalSkip = () => {
  ttsStore.markGlobalSkip()
  ttsStore.stop()
}
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

/* 如果在较小屏幕上预览，可以使用 transform 缩放 */
@media (max-height: 1920px) {
  .app-container {
    transform-origin: top center;
    /* transform: scale(calc(100vh / 1920)); 可以取消注释以适应屏幕 */
  }
}
</style>
