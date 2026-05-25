<script setup lang="ts">

import '../styles/ValidationAlert.css'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 're-edit'): void
}>()
</script>

<template>
  <div class="validation-alert-overlay" v-if="show">
    <!-- 警示图标 -->
    <div class="alert-icon">!</div>

    <!-- 提示文字 -->
    <div class="alert-text">您填写的身高 / 体重数值异常，请核对</div>
    
    <!-- 小字 -->
    <div class="alert-subtext">身高一般为 100–250cm，体重一般为 20–300kg</div>

    <!-- 底部单按钮：只能重新填写 -->
    <div class="alert-actions alert-actions-center">
      <button class="btn-primary" @click="emit('re-edit')">重新填写</button>
    </div>
  </div>
</template>
