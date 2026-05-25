<!-- 视角切换按钮组：正面/背面/左侧/右侧 四个预设视角 -->
<script setup lang="ts">
import type { ViewAngleType } from '@/types/meridian'
import { VIEW_ANGLES } from '@/data/meridianData'

defineProps<{
  /** 当前激活的视角标识 */
  currentView: ViewAngleType
}>()

defineEmits<{
  /** 视角切换事件 */
  (e: 'view-change', view: ViewAngleType): void
}>()
</script>

<template>
  <div class="view-angle-controls">
    <button
      v-for="angle in VIEW_ANGLES"
      :key="angle.key"
      class="view-angle-btn"
      :class="{ active: currentView === angle.key }"
      @click="$emit('view-change', angle.key)"
    >
      {{ angle.label }}
    </button>
  </div>
</template>
