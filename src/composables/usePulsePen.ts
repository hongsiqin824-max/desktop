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

// ── 日志工具 ──────────────────────────────────────────────

const TAG = '[usePulsePen]'

function log(...args: unknown[]): void {
  console.log(TAG, ...args)
}

function warn(...args: unknown[]): void {
  console.warn(TAG, ...args)
}

function error(...args: unknown[]): void {
  console.error(TAG, ...args)
}

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
  const searchWarning = ref('')

  // ── 内部状态（非响应式）──
  let client: PulseCollectionPenClient | null = null
  let collectTimer: ReturnType<typeof setTimeout> | null = null
  let searchNoSignalTimer: ReturnType<typeof setTimeout> | null = null
  let searchIdleTimer: ReturnType<typeof setTimeout> | null = null
  let collectGen = 0
  let signalBuffer: number[] = []
  let lastSignalCheck = 0

  // 持久监听器（贯穿整个采集生命周期：realtime + disconnected）
  let persistentRealtimeHandler: ((data: PenRealtimeData) => void) | null = null
  let persistentDisconnectHandler: (() => void) | null = null

  // 采脉阶段的 collectTimer 清理函数引用（供 cancel/retry 调用）
  let collectCleanup: (() => void) | null = null

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
    if (collectTimer) {
      clearTimeout(collectTimer)
      collectTimer = null
      log('⏱️ collectTimer 已清除')
    }
  }

  /** 启动寻脉阶段的定时器（无信号警告 + 空闲提示） */
  function startSearchTimers(): void {
    searchWarning.value = ''
    log('⏱️ 启动寻脉定时器（30s 空闲 + 120s 无信号）')
    // 30 秒空闲提示
    searchIdleTimer = setTimeout(() => {
      if (phase.value === 'searching' && !signalDetected.value) {
        searchWarning.value = 'idle'
        log('⚠️ 30秒空闲提示触发')
      }
    }, SEARCH_IDLE_PROMPT_MS)
    // 2 分钟无信号警告
    searchNoSignalTimer = setTimeout(() => {
      if (phase.value === 'searching' && !signalDetected.value) {
        searchWarning.value = 'no_signal'
        warn('⚠️ 2分钟无信号警告触发')
      }
    }, SEARCH_NO_SIGNAL_WARN_MS)
  }

  /** 停止寻脉定时器 */
  function stopSearchTimers(): void {
    if (searchIdleTimer) { clearTimeout(searchIdleTimer); searchIdleTimer = null }
    if (searchNoSignalTimer) { clearTimeout(searchNoSignalTimer); searchNoSignalTimer = null }
    searchWarning.value = ''
    log('⏱️ 寻脉定时器已清除')
  }

  /** 移除持久监听器（realtime + disconnected） */
  function removePersistentHandlers(): void {
    if (!client) return
    if (persistentRealtimeHandler) {
      client.removeEventListener(
        'realtime-data',
        persistentRealtimeHandler as unknown as EventListener,
      )
      persistentRealtimeHandler = null
      log('🔌 持久 realtime 监听器已移除')
    }
    if (persistentDisconnectHandler) {
      client.removeEventListener(
        'disconnected',
        persistentDisconnectHandler as unknown as EventListener,
      )
      persistentDisconnectHandler = null
      log('🔌 持久 disconnect 监听器已移除')
    }
  }

  async function safeDisconnect(): Promise<void> {
    removePersistentHandlers()
    if (client) {
      try { await client.disconnect() } catch { /* ignore */ }
      log('🔌 设备已断开')
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

    const mean = signalBuffer.reduce((s, v) => s + v, 0) / signalBuffer.length
    const variance = signalBuffer.reduce((s, v) => s + (v - mean) ** 2, 0) / signalBuffer.length

    if (variance > 50 && !signalDetected.value) {
      signalDetected.value = true
      if (searchIdleTimer) { clearTimeout(searchIdleTimer); searchIdleTimer = null }
      searchWarning.value = ''
      log('✅ 检测到稳定脉搏信号, variance:', variance.toFixed(1),
        ', buffer:', signalBuffer.length, '点')
    }
  }

  // ── 注册持久监听器（贯穿整个采集生命周期）──

  function registerPersistentHandlers(): void {
    if (!client) return

    // realtime：Canvas 波形 + 寻脉信号检测
    persistentRealtimeHandler = (data: PenRealtimeData) => {
      latestPulseValue.value = data.pulseValue
      if (phase.value === 'searching') {
        checkSignal(data.pulseValue)
      }
    }
    client.onRealtimeData(persistentRealtimeHandler)

    // disconnected：任何阶段蓝牙断开都进入 error
    persistentDisconnectHandler = () => {
      warn('🔌 蓝牙连接断开（持久监听器捕获）, 当前阶段:', phase.value)
      stopCollectTimer()
      stopSearchTimers()
      if (collectCleanup) { collectCleanup(); collectCleanup = null }
      phase.value = 'error'
    }
    client.onDisconnected(persistentDisconnectHandler)

    log('🔌 持久监听器已注册（realtime + disconnected）')
  }

  // ── SDK 事件注册（采脉阶段）──

  function startCollectTimer(): void {
    if (!client) return
    const gen = ++collectGen
    const pos = currentPosition.value!
    log('📋 startCollectTimer: gen=', gen, ', 部位=', POSITION_NAMES[pos])

    function isCurrent(): boolean { return gen === collectGen }

    function handleRealtimeData(data: PenRealtimeData): void {
      if (!isCurrent()) return
      pressureLevel.value = data.pressureLevel
      deviceStatus.value = DEVICE_STATUS_MAP[data.deviceStatus] ?? 'unknown'
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
      log('📊 压力等级变化:', level,
        ['(过小)', '(浮)', '(中)', '(沉)', '(过大)'][level] ?? '')
    }

    function handleDeviceStatus(status: PenDeviceWorkStatus): void {
      if (!isCurrent()) return
      deviceStatus.value = DEVICE_STATUS_MAP[status] ?? 'unknown'
    }

    function handleCollectionInvalid(event: PenCollectionInvalidEvent): void {
      if (!isCurrent()) return
      invalidReason.value = event.reason
      log('⚠️ 采集无效:', event.reason, ', 等待SDK重试')
    }

    function handlePressureCompleted(event: PenPressureCompletedEvent): void {
      if (!isCurrent()) return
      const pres = PRESSURE_MAP[event.pressureType]
      if (pres) {
        pressuresDone.value = { ...pressuresDone.value, [pres]: true }
      }
      const doneCount = Object.values(pressuresDone.value).filter(Boolean).length
      log(`✅ 压力档完成: ${pres ? PRESSURE_NAMES[pres] : '?'}, 已完成 ${doneCount}/3`)
    }

    function handleCollectionCompleted(event: PenCollectionCompletedEvent): void {
      if (!isCurrent()) return
      log(`✅ ${POSITION_NAMES[pos]}部采集完成`, {
        记录数: event.records.length,
        分析: event.analysis ? '有' : '无',
      })
      stopCollectTimer()
      cleanup()

      completedEvents[pos] = event
      currentAnalysis.value = event.analysis ?? null
      positionsDone.value = { ...positionsDone.value, [pos]: true }
      phase.value = 'position_done'
      log('📍 阶段转换: collecting → position_done')
    }

    function handleError(error: PenErrorEvent): void {
      if (!isCurrent()) return
      error('❌ 设备错误:', error.message)
      stopCollectTimer()
      cleanup()
      phase.value = 'error'
    }

    // 注意：disconnected 由持久监听器处理，这里不再注册

    // 注册采脉阶段专属监听器
    client.onRealtimeData(handleRealtimeData)
    client.onCollectionProgress(handleCollectionProgress)
    client.onPressureLevel(handlePressureLevel)
    client.onDeviceStatus(handleDeviceStatus)
    client.onCollectionInvalid(handleCollectionInvalid)
    client.onPressureCompleted(handlePressureCompleted)
    client.onCollectionCompleted(handleCollectionCompleted)
    client.onError(handleError)
    log('📋 采脉监听器已注册（8 个）')

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
      collectCleanup = null
      log('📋 采脉监听器已清理')
    }

    // 暴露 cleanup 供 cancel/retry 调用
    collectCleanup = cleanup

    // 超时保护
    collectTimer = setTimeout(() => {
      warn('⏱️ 采集超时（60秒）')
      stopCollectTimer()
      cleanup()
      phase.value = 'error'
    }, COLLECTION_TIMEOUT_MS)
  }

  // ── 公共方法 ──

  async function startCollection(): Promise<void> {
    log('🚀 startCollection() 调用, 当前阶段:', phase.value)

    // 重入保护
    if (phase.value !== 'idle' && phase.value !== 'error') {
      warn('⚠️ startCollection 被忽略：当前阶段不是 idle/error')
      return
    }

    phase.value = 'connecting'
    cancelled.value = false

    // 重置已完成数据（防止跨会话残留）
    completedEvents.cun = null
    completedEvents.guan = null
    completedEvents.chi = null

    try {
      // 1. 加载 SDK
      log('📦 加载 SDK...')
      const sdk = await import('@/lib/pulse-pen/index.js')
      log('📦 SDK 加载完成')

      // 2. 安装 BLE 垫片（Tauri 环境）
      if (isTauri) {
        log('🔧 Tauri 环境：安装 BLE 垫片')
        const { installBleAdapter, resetBleAdapter } = await import('@/lib/pulse-pen/bleAdapter')
        resetBleAdapter()
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('ble_disconnect')
          log('🔧 残留连接清理完成')
        } catch { /* 无残留连接时正常 */ }
        await installBleAdapter()
        log('🔧 BLE 垫片安装完成')
      }

      // 3. 环境检查
      const envCheck = sdk.checkBluetoothEnv()
      if (!envCheck.ok) {
        error('❌ 蓝牙环境检查失败:', envCheck.code)
        phase.value = 'error'
        return
      }
      log('✅ 蓝牙环境检查通过')

      // 4. 创建客户端 + 连接
      log('📱 创建 SDK 客户端...')
      client = sdk.PulseCollectionPenClient.create({
        autoReconnect: false,
        verboseLog: import.meta.env.DEV,
      })

      log('📱 请求设备（namePrefix: MZY）...')
      const device = await client.requestDevice({ namePrefix: 'MZY' })
      log('📱 设备已选择:', device.name ?? device.id)

      log('📱 连接设备...')
      const connectResult = await client.connect(device)
      if (connectResult.code !== 0) {
        error('❌ 连接失败:', connectResult.message)
        phase.value = 'error'
        return
      }
      log('✅ 设备连接成功')

      // 5. 切换到采脉模式（预热设备）
      log('📡 发送 enterCollect 命令...')
      try {
        await client.enterCollect()
        log('📡 enterCollect 成功')
      } catch (e) {
        warn('📡 enterCollect 异常:', e instanceof Error ? e.message : e)
      }

      // 6. 开始寻脉
      log('📡 发送 enterSearch 命令...')
      try {
        await client.enterSearch()
        log('📡 enterSearch 成功')
      } catch (e) {
        warn('📡 enterSearch 异常:', e instanceof Error ? e.message : e)
      }

      // 7. 注册持久监听器
      registerPersistentHandlers()

      // 8. 设置第一个部位
      currentPosition.value = 'cun'
      positionIndex.value = 0
      resetCollectState()
      resetSignalDetection()
      phase.value = 'searching'
      startSearchTimers()
      log('📍 阶段转换: connecting → searching（寸部）')
    } catch (e) {
      error('❌ 连接流程异常:', e instanceof Error ? e.message : e)
      phase.value = 'error'
    }
  }

  async function confirmPosition(): Promise<void> {
    log('👆 confirmPosition() 调用, 当前阶段:', phase.value,
      ', 部位:', currentPosition.value)

    if (!client) {
      warn('⚠️ confirmPosition: client 为空，忽略')
      return
    }

    if (phase.value === 'searching') {
      // 寻脉 → 采脉
      stopSearchTimers()

      log('📡 发送 enterCollect 命令...')
      try {
        await client.enterCollect()
        log('📡 enterCollect 成功')
      } catch (e) {
        warn('📡 enterCollect 异常:', e instanceof Error ? e.message : e)
      }

      const pos = currentPosition.value!
      log('📡 发送 setPulsePosition:', pos)
      const result = client.setPulsePosition(pos)
      if (result.code !== 0) {
        error('❌ setPulsePosition 失败:', result.message)
        phase.value = 'error'
        return
      }
      log('📡 setPulsePosition 成功')

      phase.value = 'collecting'
      resetCollectState()
      startCollectTimer()
      log('📍 阶段转换: searching → collecting（', POSITION_NAMES[pos], '部）')

    } else if (phase.value === 'position_done') {
      const nextIndex = positionIndex.value + 1

      if (nextIndex < POSITIONS.length) {
        // 还有下一个部位
        positionIndex.value = nextIndex
        currentPosition.value = POSITIONS[nextIndex]!
        resetCollectState()
        resetSignalDetection()

        log('📡 发送 enterSearch 命令（下一部位）...')
        try {
          await client.enterSearch()
          log('📡 enterSearch 成功')
        } catch (e) {
          warn('📡 enterSearch 异常:', e instanceof Error ? e.message : e)
          // enterSearch 失败可能是蓝牙断开，检查连接状态
          if (!client.isConnected) {
            error('❌ 蓝牙已断开，无法进入寻脉模式')
            phase.value = 'error'
            return
          }
        }
        phase.value = 'searching'
        startSearchTimers()
        log('📍 阶段转换: position_done → searching（',
          POSITION_NAMES[currentPosition.value], '部）')
      } else {
        // 全部完成
        phase.value = 'done'
        log('📍 阶段转换: position_done → done')
        await safeDisconnect()
        log('🎉 全部采集完成，设备已断开')
      }
    } else {
      log('ℹ️ confirmPosition: 当前阶段无需操作（', phase.value, '）')
    }
  }

  async function cancel(): Promise<void> {
    log('❌ cancel() 调用, 当前阶段:', phase.value)
    cancelled.value = true
    stopCollectTimer()
    stopSearchTimers()
    collectGen++  // 使所有 collectTimer handlers 失效
    if (collectCleanup) { collectCleanup(); collectCleanup = null }
    await safeDisconnect()
    phase.value = 'idle'
    log('📍 阶段转换: → idle（已取消）')
  }

  async function retry(): Promise<void> {
    log('🔄 retry() 调用, 当前阶段:', phase.value,
      ', client:', client ? '存在' : 'null',
      ', 连接:', client?.isConnected ?? false)

    stopCollectTimer()
    stopSearchTimers()
    collectGen++
    if (collectCleanup) { collectCleanup(); collectCleanup = null }

    // 检查蓝牙连接状态
    if (!client || !client.isConnected) {
      log('🔄 蓝牙已断开，执行完整重连...')
      await safeDisconnect()
      await startCollection()
      return
    }

    // 连接正常，回到当前部位的寻脉
    resetCollectState()
    resetSignalDetection()

    log('📡 发送 enterSearch 命令（重试）...')
    try {
      await client.enterSearch()
      log('📡 enterSearch 成功')
    } catch (e) {
      warn('📡 enterSearch 异常:', e instanceof Error ? e.message : e)
      // 如果 enterSearch 失败，尝试完整重连
      log('🔄 enterSearch 失败，执行完整重连...')
      await safeDisconnect()
      await startCollection()
      return
    }

    phase.value = 'searching'
    startSearchTimers()
    log('📍 阶段转换: error → searching（重试，',
      POSITION_NAMES[currentPosition.value ?? 'cun'], '部）')
  }

  function getFinalData(): IPulseAnalysisData {
    log('📊 getFinalData() 调用')
    const events = Object.values(completedEvents).filter(
      (e): e is PenCollectionCompletedEvent => e !== null,
    )
    log('📊 已完成部位:', events.length, '/3')

    if (events.length === 0) {
      warn('📊 无采集数据，返回默认值')
      return { maibo: 72, xianmai: 0, huamai: 0, semai: 0, ruomai: 0, jiedai: 0 }
    }

    const allRecords = events.flatMap(e => e.records)
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

    const result = convertPulseData(mergedEvent)
    log('📊 数据转换完成:', {
      脉搏: result.maibo,
      弦脉: result.xianmai.toFixed(2),
      滑脉: result.huamai.toFixed(2),
    })
    return result
  }

  return {
    // 响应式状态
    phase, currentPosition, positionIndex, positionsDone,
    signalDetected, currentPressure, pressureLevel, pressuresDone,
    collectProgress, invalidReason, deviceStatus, currentAnalysis,
    cancelled, isDone, latestPulseValue, searchWarning,
    // 方法
    startCollection, confirmPosition, cancel, retry, getFinalData,
    // 常量（供 UI 使用）
    POSITION_NAMES, PRESSURE_NAMES, POSITIONS,
  }
}
