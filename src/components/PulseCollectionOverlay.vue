<template>
  <div class="pulse-overlay">
    <!-- 采集完成状态 -->
    <template v-if="isCompleted">
      <div class="capture-success-icon">✓</div>
      <div class="capture-success-text">采集成功</div>
    </template>

    <!-- 采集中状态 -->
    <template v-else>
      <!-- 头部：图标 + 标题 + 设备状态徽章 -->
      <div class="pulse-header">
        <div class="pulse-icon">🫀</div>
        <div class="pulse-title">脉诊采集中</div>
        <div class="pulse-device-badge" :class="'status-' + deviceStatus">
          {{ deviceStatusText }}
        </div>
      </div>

      <!-- 部位追踪：寸 → 关 → 尺 -->
      <div class="pulse-position-tracker">
        <div class="pulse-position-line"></div>
        <div
          v-for="pos in positions"
          :key="pos.key"
          class="pulse-position-step"
          :class="positionClass(pos.key)"
        >
          <div class="position-circle">{{ pos.label }}</div>
          <div class="position-name">{{ pos.name }}</div>
        </div>
      </div>

      <!-- 压力指示：浮 / 中 / 沉 -->
      <div class="pulse-pressure-indicators">
        <div
          v-for="p in pressures"
          :key="p.key"
          class="pulse-pressure-item"
          :class="pressureClass(p.key)"
        >
          <span class="pressure-label">{{ p.label }}</span>
          <span class="pressure-status">{{ pressureStatusText(p.key) }}</span>
        </div>
      </div>

      <!-- 实时波形图（Canvas） -->
      <div class="pulse-waveform-container">
        <canvas ref="waveformCanvas" class="pulse-waveform-canvas"></canvas>
        <div class="waveform-label">脉搏波形</div>
      </div>

      <!-- 总体进度条 -->
      <div class="pulse-progress-row">
        <div class="capture-progress-bar">
          <div class="capture-progress-fill" :style="{ width: overallPercent + '%' }"></div>
        </div>
        <span class="pulse-progress-text">{{ overallPercent }}%</span>
      </div>

      <!-- 状态消息 -->
      <div class="pulse-message" v-if="message">{{ message }}</div>

      <!-- 采集无效提示 -->
      <Transition name="fade">
        <div v-if="invalidReason" class="pulse-invalid-toast">
          ⚠️ {{ invalidReasonText }}
        </div>
      </Transition>

      <!-- 操作指导 -->
      <div class="pulse-tip">{{ contextualTip }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

// ── Props ──────────────────────────────────────────────────
const props = defineProps<{
  phase: string
  message: string
  currentPosition: string | null
  currentPressure: string | null
  deviceStatus: string
  pressurePercent: number
  overallPercent: number
  isCompleted: boolean
  invalidReason: string | null
  pressureLevel: number
  completedPressures: Record<string, string[]>
}>()

// ── 常量 ──────────────────────────────────────────────────
const positions = [
  { key: 'cun', label: '寸', name: '寸部' },
  { key: 'guan', label: '关', name: '关部' },
  { key: 'chi', label: '尺', name: '尺部' },
]

const pressures = [
  { key: 'float', label: '浮' },
  { key: 'middle', label: '中' },
  { key: 'deep', label: '沉' },
]

const deviceStatusLabels: Record<string, string> = {
  standby: '待机',
  search: '寻脉',
  collect: '采脉',
  unknown: '—',
}

const INVALID_REASON_MAP: Record<string, string> = {
  'unstable-frame': '帧不稳定，请保持手腕静止',
  'early-end': '采集提前结束，请等待完成',
  'new-start': '重新开始采集',
  'pressure-mismatch': '压力档位不匹配，正在调整',
  'invalid-frame': '无效帧，正在重试',
}

// ── 计算属性 ──────────────────────────────────────────────

const deviceStatusText = computed(() =>
  deviceStatusLabels[props.deviceStatus] ?? '—'
)

const invalidReasonText = computed(() =>
  INVALID_REASON_MAP[props.invalidReason ?? ''] ?? '采集无效，正在重试…'
)

function isPositionDone(pos: string): boolean {
  const done = props.completedPressures[pos]
  return done != null && done.length >= 3
}

function positionClass(pos: string): Record<string, boolean> {
  return {
    'is-active': props.currentPosition === pos && !isPositionDone(pos),
    'is-done': isPositionDone(pos),
    'is-pending': props.currentPosition !== pos && !isPositionDone(pos),
  }
}

function isPressureDone(pressure: string): boolean {
  if (!props.currentPosition) return false
  const done = props.completedPressures[props.currentPosition]
  return done != null && done.includes(pressure)
}

function pressureClass(pressure: string): Record<string, boolean> {
  return {
    'is-active': props.currentPressure === pressure && !isPressureDone(pressure),
    'is-done': isPressureDone(pressure),
  }
}

function pressureStatusText(pressure: string): string {
  if (isPressureDone(pressure)) return '✓'
  if (props.currentPressure === pressure) return '●'
  return '○'
}

const contextualTip = computed(() => {
  // 连接阶段
  if (props.phase === 'connecting') return '🔌 请在弹出的蓝牙窗口中选择脉诊笔设备'
  // 采集无效
  if (props.invalidReason) return '⚠️ 请保持手腕稳定放松，设备正在自动重试'
  // 设备状态
  if (props.deviceStatus === 'standby') return '💡 请按设备上的 M 键进入寻脉状态（三个红灯全亮）'
  if (props.deviceStatus === 'search') return '💡 请将设备佩戴到手腕，调整位置后按 M 键进入采脉状态'
  // 压力等级
  if (props.pressureLevel === 0) return '⚠️ 力度过轻（三灯全灭），请稍微加大按压力度'
  if (props.pressureLevel === 4) return '⚠️ 力度过大（三灯全亮），请稍微减轻按压力度'
  // 默认
  return '请保持手腕稳定放松，不要移动'
})

// ── Canvas 波形图 ──────────────────────────────────────────
const waveformCanvas = ref<HTMLCanvasElement | null>(null)
let animationFrameId: number | null = null
const pulseBuffer: number[] = []  // 非响应式环形缓冲区
const MAX_BUFFER = 200

/** 推入脉搏波形值（由父组件通过 ref 调用，绕过 Vue 响应式） */
function pushPulseValue(value: number): void {
  // 转换 SDK 原始值：(num - 1400) / 10 + 20（参考 SDK 测试页）
  const normalized = (value - 1400) / 10 + 20
  pulseBuffer.push(normalized)
  if (pulseBuffer.length > MAX_BUFFER) pulseBuffer.shift()
}

defineExpose({ pushPulseValue })

function drawWaveform(): void {
  const canvas = waveformCanvas.value
  if (!canvas) {
    animationFrameId = requestAnimationFrame(drawWaveform)
    return
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    animationFrameId = requestAnimationFrame(drawWaveform)
    return
  }

  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
  }

  const w = rect.width
  const h = rect.height

  // 清空
  ctx.clearRect(0, 0, w, h)

  // 网格线
  ctx.strokeStyle = 'rgba(200, 180, 160, 0.15)'
  ctx.lineWidth = 1
  for (let y = 0; y < h; y += h / 4) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  if (pulseBuffer.length < 2) {
    animationFrameId = requestAnimationFrame(drawWaveform)
    return
  }

  const len = pulseBuffer.length
  const step = w / MAX_BUFFER

  // 自动缩放 Y 轴
  let min = Infinity, max = -Infinity
  for (const v of pulseBuffer) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min || 1
  const mid = h / 2
  const scale = (h * 0.8) / range

  // 渐变填充
  const gradient = ctx.createLinearGradient(0, 0, 0, h)
  gradient.addColorStop(0, 'rgba(140, 106, 74, 0.3)')
  gradient.addColorStop(1, 'rgba(140, 106, 74, 0.02)')

  const startX = (MAX_BUFFER - len) * step

  // 画波形线
  ctx.beginPath()
  ctx.strokeStyle = '#8C6A4A'
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  for (let i = 0; i < len; i++) {
    const x = startX + i * step
    const y = mid - (pulseBuffer[i]! - (min + max) / 2) * scale
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // 填充
  const lastX = startX + (len - 1) * step
  ctx.lineTo(lastX, h)
  ctx.lineTo(startX, h)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()

  animationFrameId = requestAnimationFrame(drawWaveform)
}

onMounted(() => {
  nextTick(() => {
    animationFrameId = requestAnimationFrame(drawWaveform)
  })
})

onBeforeUnmount(() => {
  if (animationFrameId != null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  pulseBuffer.length = 0
})
</script>
