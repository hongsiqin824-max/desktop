// 脉诊笔交互式采集 composable
//
// 状态机：
//   idle → connecting → searching ⇄ collecting → position_done → done
//                            ↑         ↓              │
//                            └─────────┘  (下一部位)  │
//                                            (3部位全完成)
//                                               ↓
//                                             done
//
// 每个部位的完整流程：
//   1. enterSearch() → 用户通过波形找位置 → signalDetected=true
//   2. 用户点击"已就位" → enterCollect() → setPulsePosition()
//   3. SDK 自动采集浮→中→沉（用户控制按压力度）
//   4. onCollectionCompleted → 保存数据 → position_done
//   5. 显示分析结果 → 提示移动 → 用户确认 → 回到步骤 1（下一部位）
//
// 错误处理：
//   - BLE 连接失败 → error → 外部回退 mock
//   - 采集超时（60秒）→ error
//   - 用户取消 → cancelled → 外部回退 mock
//   - 蓝牙断开 → error → 外部回退 mock

import { ref, computed } from 'vue'
import { isTauri } from '@/config/proxy'
import type {
  PulseCollectionPenClient,
  PenCollectionCompletedEvent,
  PenPulsePosition,
  PenRealtimeData,
  PenCollectionProgress,
  PenPressureLevel,
  PenDeviceWorkStatus,
  PenCollectionInvalidEvent,
  PenPressureCompletedEvent,
  PenErrorEvent,
  PenPulseAnalysisReport,
} from '@/lib/pulse-pen'
import { convertPulseData } from '@/lib/pulse-pen/convertPulseData'
import type { IPulseAnalysisData } from '@/types/consultation'

// ── 类型 ──────────────────────────────────────────────────

export type PulsePhase =
  | 'idle' | 'connecting' | 'searching' | 'collecting'
  | 'position_done' | 'done' | 'error'

export type PositionKey = 'cun' | 'guan' | 'chi'
export type PressureKey = 'float' | 'middle' | 'deep'

// ── 常量 ──────────────────────────────────────────────────

const POSITIONS: PositionKey[] = ['cun', 'guan', 'chi']
const POSITION_NAMES: Record<PositionKey, string> = { cun: '寸', guan: '关', chi: '尺' }
const PRESSURE_MAP: Record<number, PressureKey> = { 1: 'float', 3: 'middle', 5: 'deep' }
const PRESSURE_NAMES: Record<PressureKey, string> = { float: '浮', middle: '中', deep: '沉' }
const DEVICE_STATUS_MAP: Record<number, string> = { 1: 'standby', 2: 'search', 3: 'collect' }
const COLLECTION_TIMEOUT_MS = 60_000
const SIGNAL_BUFFER_SIZE = 100
const SEARCH_NO_SIGNAL_WARN_MS = 120_000  // 2 分钟无信号警告
const SEARCH_IDLE_PROMPT_MS = 30_000      // 30 秒空闲提示

// ── Composable ────────────────────────────────────────────

export function usePulsePen() {
  // ── 响应式状态 ──
  const phase = ref<PulsePhase>('idle')
  const currentPosition = ref<PositionKey | null>(null)
  const positionIndex = ref(0)
  const positionsDone = ref<Record<PositionKey, boolean>>({ cun: false, guan: false, chi: false })

  // 寻脉
  const signalDetected = ref(false)

  // 采脉
  const currentPressure = ref<PressureKey | null>(null)
  const pressureLevel = ref(2)
  const pressuresDone = ref<Record<PressureKey, boolean>>({ float: false, middle: false, deep: false })
  const collectProgress = ref(0)
  const invalidReason = ref<string | null>(null)
  const deviceStatus = ref('unknown')

  // 分析结果
  const currentAnalysis = ref<PenPulseAnalysisReport | null>(null)

  // 完成状态
  const cancelled = ref(false)

  // 最新脉搏值（供外部转发给 Canvas 波形图）
  const latestPulseValue = ref(0)

  // 寻脉阶段提示
  const searchWarning = ref('')  // 2分钟无信号 / 30秒空闲 的提示文字

  // ── 内部状态（非响应式）──
  let client: PulseCollectionPenClient | null = null
  let collectTimer: ReturnType<typeof setTimeout> | null = null
  let searchNoSignalTimer: ReturnType<typeof setTimeout> | null = null
  let searchIdleTimer: ReturnType<typeof setTimeout> | null = null
  let collectGen = 0  // 防止旧 handler 干扰
  let signalBuffer: number[] = []
  let lastSignalCheck = 0

  // 每个部位的原始采集事件（用于最终数据转换）
  const completedEvents: Record<PositionKey, PenCollectionCompletedEvent | null> = {
    cun: null, guan: null, chi: null,
  }

  // ── 计算属性 ──
  const isDone = computed(() => phase.value === 'done')

  // ── 内部工具函数 ──

  function resetCollectState(): void {
    pressuresDone.value = { float: false, middle: false, deep: false }
    currentPressure.value = null
    collectProgress.value = 0
    pressureLevel.value = 2
    invalidReason.value = null
    currentAnalysis.value = null
  }

  function resetSignalDetection(): void {
    signalBuffer = []
    signalDetected.value = false
    lastSignalCheck = 0
  }

  function stopCollectTimer(): void {
    if (collectTimer) { clearTimeout(collectTimer); collectTimer = null }
  }

  /** 启动寻脉阶段的定时器（无信号警告 + 空闲提示） */
  function startSearchTimers(): void {
    searchWarning.value = ''
    // 30 秒空闲提示
    searchIdleTimer = setTimeout(() => {
      if (phase.value === 'searching' && !signalDetected.value) {
        searchWarning.value = 'idle'
      }
    }, SEARCH_IDLE_PROMPT_MS)
    // 2 分钟无信号警告
    searchNoSignalTimer = setTimeout(() => {
      if (phase.value === 'searching' && !signalDetected.value) {
        searchWarning.value = 'no_signal'
      }
    }, SEARCH_NO_SIGNAL_WARN_MS)
  }

  /** 停止寻脉定时器 */
  function stopSearchTimers(): void {
    if (searchIdleTimer) { clearTimeout(searchIdleTimer); searchIdleTimer = null }
    if (searchNoSignalTimer) { clearTimeout(searchNoSignalTimer); searchNoSignalTimer = null }
    searchWarning.value = ''
  }

  function cleanupHandlers(): void {
    if (!client) return
    const names = [
      'realtime-data', 'collection-progress', 'pressure-level',
      'device-status', 'collection-invalid', 'pressure-completed',
      'collection-completed', 'error-message', 'disconnected',
    ]
    for (const name of names) {
      // 移除该事件的所有监听器（通过传入空函数不会报错）
      // 由于 SDK 扩展 EventTarget，我们用命名 handler 清理
      // 但这里简化处理：在 startCollectTimer 中用命名函数清理
    }
    // 注意：实际清理由 startCollectTimer 内部的 cleanup 函数负责
  }

  async function safeDisconnect(): Promise<void> {
    if (client) {
      try { await client.disconnect() } catch { /* ignore */ }
      client = null
    }
  }

  // ── 信号检测（寻脉阶段）──

  function checkSignal(pulseValue: number): void {
    signalBuffer.push(pulseValue)
    if (signalBuffer.length > SIGNAL_BUFFER_SIZE) signalBuffer.shift()

    const now = Date.now()
    if (now - lastSignalCheck < 500) return
    lastSignalCheck = now

    if (signalBuffer.length < 30) return

    // 计算方差，判断是否有稳定的脉搏波形
    const mean = signalBuffer.reduce((s, v) => s + v, 0) / signalBuffer.length
    const variance = signalBuffer.reduce((s, v) => s + (v - mean) ** 2, 0) / signalBuffer.length

    // 阈值 50 是基于 SDK 原始值范围的经验值（(raw-1400)/10 变换后）
    if (variance > 50 && !signalDetected.value) {
      signalDetected.value = true
      // 检测到信号后清除空闲提示
      if (searchIdleTimer) { clearTimeout(searchIdleTimer); searchIdleTimer = null }
      searchWarning.value = ''
      if (import.meta.env.DEV) {
        console.log('[usePulsePen] ✅ 检测到稳定脉搏信号, variance:', variance.toFixed(1))
      }
    }
  }

  // ── SDK 事件注册（采脉阶段）──

  function startCollectTimer(): void {
    if (!client) return
    const gen = ++collectGen
    const pos = currentPosition.value!

    function isCurrent(): boolean { return gen === collectGen }

    function handleRealtimeData(data: PenRealtimeData): void {
      if (!isCurrent()) return
      pressureLevel.value = data.pressureLevel
      deviceStatus.value = DEVICE_STATUS_MAP[data.deviceStatus] ?? 'unknown'
      latestPulseValue.value = data.pulseValue
      if (data.pressureType) {
        currentPressure.value = PRESSURE_MAP[data.pressureType] ?? null
      }
    }

    function handleCollectionProgress(event: PenCollectionProgress): void {
      if (!isCurrent()) return
      collectProgress.value = event.percent
      const pres = PRESSURE_MAP[event.pressureType]
      if (pres) currentPressure.value = pres
    }

    function handlePressureLevel(level: PenPressureLevel): void {
      if (!isCurrent()) return
      pressureLevel.value = level
    }

    function handleDeviceStatus(status: PenDeviceWorkStatus): void {
      if (!isCurrent()) return
      deviceStatus.value = DEVICE_STATUS_MAP[status] ?? 'unknown'
    }

    function handleCollectionInvalid(event: PenCollectionInvalidEvent): void {
      if (!isCurrent()) return
      invalidReason.value = event.reason
      if (import.meta.env.DEV) {
        console.log(`[usePulsePen] 采集无效(${event.reason})，等待SDK重试`)
      }
    }

    function handlePressureCompleted(event: PenPressureCompletedEvent): void {
      if (!isCurrent()) return
      const pres = PRESSURE_MAP[event.pressureType]
      if (pres) {
        pressuresDone.value = { ...pressuresDone.value, [pres]: true }
      }
      if (import.meta.env.DEV) {
        const doneCount = Object.values(pressuresDone.value).filter(Boolean).length
        console.log(`[usePulsePen] 压力档完成: ${pres}, 已完成 ${doneCount}/3`)
      }
    }

    function handleCollectionCompleted(event: PenCollectionCompletedEvent): void {
      if (!isCurrent()) return
      stopCollectTimer()
      cleanup()

      // 保存采集结果
      completedEvents[pos] = event
      currentAnalysis.value = event.analysis ?? null
      positionsDone.value = { ...positionsDone.value, [pos]: true }
      phase.value = 'position_done'

      if (import.meta.env.DEV) {
        console.log(`[usePulsePen] ${POSITION_NAMES[pos]}部采集完成`, {
          记录数: event.records.length,
          分析: event.analysis ? '有' : '无',
        })
      }
    }

    function handleError(error: PenErrorEvent): void {
      if (!isCurrent()) return
      stopCollectTimer()
      cleanup()
      phase.value = 'error'
      if (import.meta.env.DEV) {
        console.error(`[usePulsePen] 设备错误: ${error.message}`)
      }
    }

    function handleDisconnected(): void {
      if (!isCurrent()) return
      stopCollectTimer()
      cleanup()
      phase.value = 'error'
      if (import.meta.env.DEV) {
        console.warn('[usePulsePen] 蓝牙连接断开')
      }
    }

    // 注册
    client.onRealtimeData(handleRealtimeData)
    client.onCollectionProgress(handleCollectionProgress)
    client.onPressureLevel(handlePressureLevel)
    client.onDeviceStatus(handleDeviceStatus)
    client.onCollectionInvalid(handleCollectionInvalid)
    client.onPressureCompleted(handlePressureCompleted)
    client.onCollectionCompleted(handleCollectionCompleted)
    client.onError(handleError)
    client.onDisconnected(handleDisconnected)

    function cleanup(): void {
      if (!client) return
      client.removeEventListener('realtime-data', handleRealtimeData as unknown as EventListener)
      client.removeEventListener('collection-progress', handleCollectionProgress as unknown as EventListener)
      client.removeEventListener('pressure-level', handlePressureLevel as unknown as EventListener)
      client.removeEventListener('device-status', handleDeviceStatus as unknown as EventListener)
      client.removeEventListener('collection-invalid', handleCollectionInvalid as unknown as EventListener)
      client.removeEventListener('pressure-completed', handlePressureCompleted as unknown as EventListener)
      client.removeEventListener('collection-completed', handleCollectionCompleted as unknown as EventListener)
      client.removeEventListener('error-message', handleError as unknown as EventListener)
      client.removeEventListener('disconnected', handleDisconnected as unknown as EventListener)
    }

    // 超时保护
    collectTimer = setTimeout(() => {
      cleanup()
      phase.value = 'error'
      if (import.meta.env.DEV) {
        console.warn('[usePulsePen] 采集超时')
      }
    }, COLLECTION_TIMEOUT_MS)
  }

  // ── 公共方法 ──

  /**
   * 启动脉诊采集流程
   * 连接设备 → 进入寻脉 → 等待用户交互
   */
  async function startCollection(): Promise<void> {
    phase.value = 'connecting'
    cancelled.value = false

    try {
      // 1. 加载 SDK
      const sdk = await import('@/lib/pulse-pen/index.js')

      // 2. 安装 BLE 垫片（Tauri 环境）
      if (isTauri) {
        const { installBleAdapter, resetBleAdapter } = await import('@/lib/pulse-pen/bleAdapter')
        resetBleAdapter()
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('ble_disconnect')
        } catch { /* 无残留连接时正常 */ }
        await installBleAdapter()
      }

      // 3. 环境检查
      const envCheck = sdk.checkBluetoothEnv()
      if (!envCheck.ok) {
        phase.value = 'error'
        return
      }

      // 4. 创建客户端 + 连接
      client = sdk.PulseCollectionPenClient.create({
        autoReconnect: false,
        verboseLog: import.meta.env.DEV,
      })

      const device = await client.requestDevice({ namePrefix: 'MZY' })
      const connectResult = await client.connect(device)
      if (connectResult.code !== 0) {
        phase.value = 'error'
        return
      }

      // 5. 切换到采脉模式（预热设备，然后会进入寻脉）
      try {
        await client.enterCollect()
      } catch {
        // 不阻塞流程
      }

      // 6. 开始寻脉（让用户找位置）
      try {
        await client.enterSearch()
      } catch {
        // 不阻塞流程
      }

      // 7. 设置第一个部位
      currentPosition.value = 'cun'
      positionIndex.value = 0
      resetCollectState()
      resetSignalDetection()
      phase.value = 'searching'
      startSearchTimers()

      if (import.meta.env.DEV) {
        console.log('[usePulsePen] ✅ 已连接，进入寻脉模式')
      }
    } catch (e) {
      phase.value = 'error'
      if (import.meta.env.DEV) {
        console.error('[usePulsePen] 连接失败:', e instanceof Error ? e.message : e)
      }
    }
  }

  /**
   * 用户确认位置（寻脉阶段）或确认移到下一部位（position_done 阶段）
   */
  async function confirmPosition(): Promise<void> {
    if (!client) return

    if (phase.value === 'searching') {
      // 寻脉 → 采脉
      stopSearchTimers()
      try {
        await client.enterCollect()
      } catch { /* 可能已经在采脉模式 */ }

      const result = client.setPulsePosition(currentPosition.value!)
      if (result.code !== 0) {
        phase.value = 'error'
        return
      }

      phase.value = 'collecting'
      resetCollectState()
      startCollectTimer()

      if (import.meta.env.DEV) {
        console.log(`[usePulsePen] 开始采集 ${POSITION_NAMES[currentPosition.value!]}部`)
      }
    } else if (phase.value === 'position_done') {
      // 当前部位完成 → 下一部位或全部完成
      const nextIndex = positionIndex.value + 1

      if (nextIndex < POSITIONS.length) {
        // 还有下一个部位
        positionIndex.value = nextIndex
        currentPosition.value = POSITIONS[nextIndex]!
        resetCollectState()
        resetSignalDetection()

        // 回到寻脉模式
        try { await client.enterSearch() } catch { /* ignore */ }
        phase.value = 'searching'
        startSearchTimers()

        if (import.meta.env.DEV) {
          console.log(`[usePulsePen] 切换到 ${POSITION_NAMES[currentPosition.value]}部寻脉`)
        }
      } else {
        // 全部完成
        phase.value = 'done'
        await safeDisconnect()

        if (import.meta.env.DEV) {
          console.log('[usePulsePen] ✅ 全部采集完成')
        }
      }
    }
  }

  /**
   * 用户取消采集
   */
  async function cancel(): Promise<void> {
    cancelled.value = true
    stopCollectTimer()
    stopSearchTimers()
    collectGen++
    await safeDisconnect()
    phase.value = 'idle'
  }

  /**
   * 重试采集（从错误状态恢复到当前部位的寻脉）
   */
  async function retry(): Promise<void> {
    if (!client) {
      // 客户端已断开，需要重新开始
      await startCollection()
      return
    }
    stopCollectTimer()
    resetCollectState()
    resetSignalDetection()
    try { await client.enterSearch() } catch { /* ignore */ }
    phase.value = 'searching'
    startSearchTimers()
  }

  /**
   * 获取最终合并的脉诊数据（3 部位平均值）
   */
  function getFinalData(): IPulseAnalysisData {
    const events = Object.values(completedEvents).filter(
      (e): e is PenCollectionCompletedEvent => e !== null,
    )

    if (events.length === 0) {
      // 无数据，返回默认值
      return { maibo: 72, xianmai: 0, huamai: 0, semai: 0, ruomai: 0, jiedai: 0 }
    }

    // 合并所有部位的 records
    const allRecords = events.flatMap(e => e.records)
    // 合并分析结果（取平均值）
    const analyses = events.map(e => e.analysis).filter(
      (a): a is PenPulseAnalysisReport => a != null,
    )

    const avgAnalysis = analyses.length > 0 ? {
      position: {
        label: '脉位', value: analyses.reduce((s, a) => s + a.position.value, 0) / analyses.length,
        normalLower: 0.3, normalUpper: 0.7, text: '',
      },
      rate: {
        label: '脉率', value: analyses.reduce((s, a) => s + a.rate.value, 0) / analyses.length,
        normalLower: 0.35, normalUpper: 0.65, text: '',
      },
      strength: {
        label: '脉力', value: analyses.reduce((s, a) => s + a.strength.value, 0) / analyses.length,
        normalLower: 0.3, normalUpper: 0.7, text: '',
      },
      tension: {
        label: '脉势', value: analyses.reduce((s, a) => s + a.tension.value, 0) / analyses.length,
        normalLower: 0, normalUpper: 0.72, text: '',
      },
      smoothness: {
        label: '流利度', value: analyses.reduce((s, a) => s + a.smoothness.value, 0) / analyses.length,
        normalLower: 0.3, normalUpper: 0.7, text: '',
      },
      kValue: analyses.reduce((s, a) => s + a.kValue, 0) / analyses.length,
    } : events[0]!.analysis

    const mergedEvent: PenCollectionCompletedEvent = {
      mode: 1,
      records: allRecords,
      analysis: avgAnalysis ?? events[0]!.analysis,
      timestamp: new Date().toISOString(),
    }

    return convertPulseData(mergedEvent)
  }

  /**
   * 推入脉搏波形值（供 Canvas 使用，绕过 Vue 响应式）
   */
  function pushPulseValue(value: number): void {
    // 信号检测（寻脉阶段）
    if (phase.value === 'searching') {
      checkSignal(value)
    }
  }

  return {
    // 响应式状态
    phase, currentPosition, positionIndex, positionsDone,
    signalDetected, currentPressure, pressureLevel, pressuresDone,
    collectProgress, invalidReason, deviceStatus, currentAnalysis,
    cancelled, isDone, latestPulseValue, searchWarning,
    // 方法
    startCollection, confirmPosition, cancel, retry, getFinalData, pushPulseValue,
    // 常量（供 UI 使用）
    POSITION_NAMES, PRESSURE_NAMES, POSITIONS,
  }
}
