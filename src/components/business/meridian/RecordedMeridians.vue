<!-- 已记录经脉指示器：在3D场景左侧显示已记录的所有经脉标签 -->
<script setup lang="ts">
import type { MeridianCodeType } from '@/types/meridian'
import { MERIDIAN_CODE_MAP } from '@/data/meridianData'

defineProps<{
  /** 已记录的经脉编号集合 */
  recordedMeridians: Set<MeridianCodeType>
}>()
</script>

<template>
  <div class="recorded-meridians">
    <div
      v-for="code in Array.from(recordedMeridians)"
      :key="code"
      class="recorded-meridian-tag"
    >
      <span class="recorded-meridian-dot"></span>
      <span>{{ MERIDIAN_CODE_MAP[code]?.shortName ?? code }}</span>
    </div>
  </div>
</template>
