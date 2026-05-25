<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-container">
    <RouterView />
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
