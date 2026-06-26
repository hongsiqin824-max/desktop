<template>
  <div class="pulse-overlay">
    <!-- ═══ 连接中 ═══ -->
    <template v-if="phase === 'connecting'">
      <div class="capture-icon">🫀</div>
      <div class="capture-title">脉诊采集中</div>
      <div class="capture-loading">
        <span class="capture-spinner"></span>
        <span>正在连接脉诊笔…</span>
      </div>
      <div class="pulse-tip">🔌 请在弹出的蓝牙窗口中选择脉诊笔设备</div>
    </template>

    <!-- ═══ 寻脉阶段 ═══ -->
    <template v-else-if="phase === 'searching'">
      <div class="pulse-header">
        <div class="pulse-icon">🫀</div>
        <div class="pulse-title">脉诊采集中</div>
        <div class="pulse-device-badge status-search">寻脉</div>
      </div>

      <!-- 部位追踪 -->
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

      <!-- 波形图（寻脉模式：帮用户找位置） -->
      <div class="pulse-waveform-container">
        <canvas ref="waveformCanvas" class="pulse-waveform-canvas"></canvas>
        <div class="waveform-label">脉搏波形</div>
      </div>

      <!-- 信号状态 -->
      <div class="pulse-signal-status" :class="{ 'signal-found': signalDetected }">
        {{ signalDetected ? '✅ 已检测到稳定脉搏信号' : '🔍 正在检测脉搏信号…' }}
      </div>

      <!-- 操作指导 -->
      <div class="pulse-tip">
        💡 {{ searchTip }}
      </div>

      <!-- 寻脉警告（30秒空闲 / 2分钟无信号） -->
      <Transition name="fade">
        <div v-if="searchWarning === 'idle'" class="pulse-search-warning">
          💡 如果波形不明显，请检查笔是否紧贴皮肤，或按设备 M 键确认已进入寻脉状态
        </div>
        <div v-else-if="searchWarning === 'no_signal'" class="pulse-search-warning pulse-search-warning--danger">
          ⚠️ 2 分钟内未检测到脉搏信号，请检查设备佩戴或尝试跳过脉诊
        </div>
      </Transition>

      <!-- 确认按钮 -->
      <button
        class="pulse-confirm-btn"
        :class="{ 'is-ready': signalDetected }"
        @click="$emit('confirm')"
      >
        {{ signalDetected ? '✅ 已就位，开始采集' : '已就位，开始采集' }}
      </button>
    </template>

    <!-- ═══ 采脉阶段 ═══ -->
    <template v-else-if="phase === 'collecting'">
      <div class="pulse-header">
        <div class="pulse-icon">🫀</div>
        <div class="pulse-title">脉诊采集中</div>
        <div class="pulse-device-badge status-collect">采脉</div>
      </div>

      <!-- 部位追踪 -->
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

      <!-- 波形图（采脉模式：确认脉搏在被采集） -->
      <div class="pulse-waveform-container">
        <canvas ref="waveformCanvas" class="pulse-waveform-canvas"></canvas>
        <div class="waveform-label">脉搏波形</div>
      </div>

      <!-- 当前压力档进度条 -->
      <div class="pulse-progress-row">
        <div class="capture-progress-bar">
          <div class="capture-progress-fill" :style="{ width: collectProgress + '%' }"></div>
        </div>
        <span class="pulse-progress-text">{{ Math.round(collectProgress) }}%</span>
      </div>

      <!-- 采集无效提示 -->
      <Transition name="fade">
        <div v-if="invalidReason" class="pulse-invalid-toast">
          ⚠️ {{ invalidReasonText }}
        </div>
      </Transition>

      <!-- 操作指导 -->
      <div class="pulse-tip">{{ collectTip }}</div>

      <!-- 采集无效时显示跳过按钮 -->
      <button
        v-if="invalidReason"
        class="pulse-confirm-btn"
        style="margin-top: 12px; background: #999; color: white; font-size: 14px;"
        @click="$emit('skip-position')"
      >
        ⏭️ 跳过此部位（30 秒后自动跳过）
      </button>
    </template>

    <!-- ═══ 部位完成 ═══ -->
    <template v-else-if="phase === 'position_done'">
      <div class="pulse-header">
        <div class="pulse-icon">🫀</div>
        <div class="pulse-title">脉诊采集中</div>
      </div>

      <!-- 部位追踪 -->
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

      <!-- 当前部位分析结果 -->
      <div class="pulse-analysis-panel" v-if="currentAnalysis">
        <div class="pulse-analysis-title">
          {{ currentPositionName }}脉象分析
        </div>
        <div class="pulse-analysis-grid">
          <div class="pulse-analysis-item" v-for="dim in analysisDimensions" :key="dim.label">
            <span class="analysis-dim-label">{{ dim.label }}</span>
            <span class="analysis-dim-value">{{ dim.value }}</span>
          </div>
        </div>
      </div>
      <!-- early-end 无分析数据时的提示 -->
      <div v-else class="pulse-analysis-panel pulse-analysis-panel--partial">
        <div class="pulse-analysis-title">
          {{ currentPositionName }}采集数据不完整
        </div>
        <div class="pulse-tip" style="text-align: center; padding: 12px 0;">
          设备提前结束了采集，部分压力档数据已记录。<br>
          可以继续下一部位或重试当前部位。
        </div>
      </div>

      <!-- 移动提示 -->
      <div class="pulse-tip">
        {{ moveTip }}
      </div>

      <!-- 确认按钮 -->
      <button class="pulse-confirm-btn is-ready" @click="$emit('confirm')">
        {{ isLastPosition ? '✅ 查看最终结果' : '✅ 已就位，开始下一部位' }}
      </button>
    </template>

    <!-- ═══ 全部完成 ═══ -->
    <template v-else-if="phase === 'done'">
      <div class="capture-success-icon">✓</div>
      <div class="capture-success-text">采集成功</div>
    </template>

    <!-- ═══ 错误 ═══ -->
    <template v-else-if="phase === 'error'">
      <div class="capture-icon">⚠️</div>
      <div class="capture-title" style="font-size: 36px;">
        {{ invalidReason === 'early-end' ? '采集数据不完整' : '采集遇到问题' }}
      </div>
      <div class="pulse-tip">
        {{ invalidReason === 'early-end'
          ? '设备提前结束了采集，可能是按压力度发生了变化。请保持稳定力度重试。'
          : '请检查设备连接和佩戴情况' }}
      </div>
      <div style="display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;">
        <button class="pulse-confirm-btn is-ready" @click="$emit('retry')">
          🔄 重新采集当前部位
        </button>
        <button class="pulse-confirm-btn" @click="$emit('cancel')" style="background: #999; color: white;">
          跳过脉诊，使用模拟数据
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

// ── Props ──────────────────────────────────────────────────
const props = defineProps<{
  phase: string
  currentPosition: string | null
  positionIndex: number
  positionsDone: Record<string, boolean>
  signalDetected: boolean
  currentPressure: string | null
  pressureLevel: number
  pressuresDone: Record<string, boolean>
  collectProgress: number
  invalidReason: string | null
  deviceStatus: string
  currentAnalysis: {
    position?: { value: number }
    rate?: { value: number }
    strength?: { value: number }
    tension?: { value: number }
    smoothness?: { value: number }
    kValue?: number
  } | null
  searchWarning: string
  lastCompletedPressure: string | null
}>()

defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'retry'): void
  (e: 'skip-position'): void
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

const POSITION_NAMES: Record<string, string> = { cun: '寸', guan: '关', chi: '尺' }

const INVALID_REASON_MAP: Record<string, string> = {
  'unstable-frame': '帧不稳定，请保持手腕完全静止',
  'early-end': '采集提前结束，请保持稳定按压',
  'new-start': '重新开始采集',
  'pressure-mismatch': '压力档位不匹配，请调整力度',
  'invalid-frame': '无效帧，正在重试',
  'skipped': '该部位采集跳过，使用其他部位数据',
}

// ── 计算属性 ──────────────────────────────────────────────

const currentPositionName = computed(() =>
  props.currentPosition ? POSITION_NAMES[props.currentPosition] ?? '' : ''
)

const isLastPosition = computed(() => props.positionIndex >= 2)

const invalidReasonText = computed(() =>
  INVALID_REASON_MAP[props.invalidReason ?? ''] ?? '采集无效，正在重试…'
)

const collectTip = computed(() => {
  // 压力档过渡提示（刚完成一档，提示进入下一档）
  if (props.lastCompletedPressure === 'float') {
    return '✅ 浮取完成，请稍微加大力度进入中取'
  }
  if (props.lastCompletedPressure === 'middle') {
    return '✅ 中取完成，请继续加大力度进入沉取'
  }
  if (props.lastCompletedPressure === 'deep') {
    return '✅ 沉取完成，三档采集完毕'
  }
  // 异常状态
  if (props.invalidReason) {
    return '💡 请保持手腕放松不动，设备正在尝试自动恢复'
  }
  if (props.pressureLevel === 0) return '⚠️ 力度过轻，请稍微加大按压'
  if (props.pressureLevel === 4) return '⚠️ 力度过大，请稍微减轻按压'
  // 各压力档采集中的引导
  if (props.currentPressure === 'float') return '浮取采集中 — 轻搭笔头，不要用力'
  if (props.currentPressure === 'middle') return '中取采集中 — 保持中等力度按压'
  if (props.currentPressure === 'deep') return '沉取采集中 — 保持较重力度按压'
  return '请保持手腕稳定，不要移动'
})

// 寻脉阶段提示（按部位区分）
const searchTip = computed(() => {
  if (props.currentPosition === 'cun') return '将笔轻放在寸部（靠近手掌），找到脉搏最强的位置'
  if (props.currentPosition === 'guan') return '向小臂方向移动约一指宽至关部，找到脉搏最强的位置'
  if (props.currentPosition === 'chi') return '继续向小臂移动约一指宽至尺部，找到脉搏最强的位置'
  return '调整笔的位置，找到脉搏波形最高的点'
})

const moveTip = computed(() => {
  if (props.positionIndex === 0) return '📍 寸部完成，将笔向小臂方向移动约一指宽至关部'
  if (props.positionIndex === 1) return '📍 关部完成，继续向小臂方向移动约一指宽至尺部'
  return '📍 尺部完成，全部采集完毕'
})

const analysisDimensions = computed(() => {
  const a = props.currentAnalysis
  if (!a) return []
  return [
    { label: '脉位', value: a.position?.value?.toFixed(2) ?? '-' },
    { label: '脉率', value: a.rate?.value?.toFixed(2) ?? '-' },
    { label: '脉力', value: a.strength?.value?.toFixed(2) ?? '-' },
    { label: '紧张度', value: a.tension?.value?.toFixed(2) ?? '-' },
    { label: '流利度', value: a.smoothness?.value?.toFixed(2) ?? '-' },
    { label: 'K 值', value: a.kValue?.toFixed(2) ?? '-' },
  ]
})

// ── 部位/压力状态判断 ──

function positionClass(pos: string): Record<string, boolean> {
  return {
    'is-active': props.currentPosition === pos && !props.positionsDone[pos],
    'is-done': !!props.positionsDone[pos],
    'is-pending': props.currentPosition !== pos && !props.positionsDone[pos],
  }
}

function pressureClass(pressure: string): Record<string, boolean> {
  return {
    'is-active': props.currentPressure === pressure && !props.pressuresDone[pressure],
    'is-done': !!props.pressuresDone[pressure],
  }
}

function pressureStatusText(pressure: string): string {
  if (props.pressuresDone[pressure]) return '✓'
  if (props.currentPressure === pressure) return '●'
  return '○'
}

// ── Canvas 波形图 ──────────────────────────────────────────
const waveformCanvas = ref<HTMLCanvasElement | null>(null)
let animationFrameId: number | null = null
const pulseBuffer: number[] = []
const MAX_BUFFER = 200

function pushPulseValue(value: number): void {
  const normalized = (value - 1400) / 10 + 20
  pulseBuffer.push(normalized)
  if (pulseBuffer.length > MAX_BUFFER) pulseBuffer.shift()
}

function clearBuffer(): void {
  pulseBuffer.length = 0
}

defineExpose({ pushPulseValue, clearBuffer })

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
  const yLabelWidth = 36  // Y 轴标签区域宽度

  // 清空
  ctx.clearRect(0, 0, w, h)

  // 网格线 + Y 轴刻度
  ctx.strokeStyle = 'rgba(200, 180, 160, 0.15)'
  ctx.fillStyle = 'rgba(140, 106, 74, 0.4)'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'right'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = (h * i) / 4
    ctx.beginPath()
    ctx.moveTo(yLabelWidth, y)
    ctx.lineTo(w, y)
    ctx.stroke()
    // Y 轴刻度值（80, 60, 40, 20, 0）
    ctx.fillText(String(80 - i * 20), yLabelWidth - 4, y + 4)
  }

  if (pulseBuffer.length < 2) {
    animationFrameId = requestAnimationFrame(drawWaveform)
    return
  }

  const len = pulseBuffer.length
  const drawWidth = w - yLabelWidth
  const step = drawWidth / MAX_BUFFER

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

  const startX = yLabelWidth + (MAX_BUFFER - len) * step

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
