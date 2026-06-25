<!-- 经络信息面板：展示选中经脉的名称、走向、穴位等详细信息 -->
<script setup lang="ts">
import type { IMeridianDef } from '@/types/meridian'

defineProps<{
  /** 当前选中的经脉定义数据 */
  meridianDef: IMeridianDef
}>()

defineEmits<{
  /** 关闭面板 */
  (e: 'close'): void
  /** 确认该经脉部位不适 */
  (e: 'confirm-discomfort'): void
}>()
</script>

<template>
  <div class="meridian-info-panel">
    <!-- 头部：经脉名称 + 编号 + 关闭按钮 -->
    <div class="meridian-panel-header">
      <div style="display: flex; align-items: center; gap: 16px;">
        <span class="meridian-panel-name">{{ meridianDef.name }}</span>
        <span class="meridian-panel-code">{{ meridianDef.code }}</span>
      </div>
      <button class="meridian-panel-close" @click="$emit('close')">✕</button>
    </div>

    <!-- 描述 -->
    <div class="meridian-panel-section">
      <div class="meridian-panel-label">经络概述</div>
      <div class="meridian-panel-value">{{ meridianDef.description }}</div>
    </div>

    <!-- 走向路线 -->
    <div class="meridian-panel-section">
      <div class="meridian-panel-label">走向路线</div>
      <div class="meridian-panel-pathway">{{ meridianDef.pathway }}</div>
    </div>

    <!-- 主要穴位 -->
    <div class="meridian-panel-section">
      <div class="meridian-panel-label">主要穴位</div>
      <div class="meridian-panel-acupoints">
        <span
          v-for="(ap, idx) in meridianDef.keyAcupoints"
          :key="idx"
          class="meridian-panel-acupoint-tag"
          :title="ap.brief"
        >
          {{ ap.name }}
        </span>
      </div>
    </div>

    <!-- 确认按钮 -->
    <div class="meridian-panel-section">
      <button class="meridian-confirm-btn" @click="$emit('confirm-discomfort')">
        该部位不适
      </button>
    </div>
  </div>
</template>
