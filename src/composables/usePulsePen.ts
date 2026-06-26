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
//   1. clearCollection() + setPulsePosition() → 用户通过波形找位置 → signalDetected=true
//   2. 用户点击"已就位" → clearCollection() + setPulsePosition() + enterCollect()
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
import { getRawNotifyStats, resetRawNotifyStats } from '@/lib/pulse-pen/bleAdapter'
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
const SIGNAL_BUFFER_SIZE = 100
const SEARCH_NO_SIGNAL_WARN_MS = 120_000  // 2 分钟无信号警告
const SEARCH_IDLE_PROMPT_MS = 30_000      // 30 秒空闲提示
const INVALID_WAIT_MS = 30_000          // 采集无效后等待 SDK 自动恢复的超时（30 秒）
const INVALID_MAX_RETRIES = 2           // 不再使用（保留常量避免引用错误）

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
  const lastCompletedPressure = ref<PressureKey | null>(null)  // 刚完成的压力档（驱动过渡提示）

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
  let searchNoSignalTimer: ReturnType<typeof setTimeout> | null = null
  let searchIdleTimer: ReturnType<typeof setTimeout> | null = null
  let signalBuffer: number[] = []
  let lastSignalCheck = 0
  let rtLogThrottle = 0  // realtime 日志节流时间戳
  let invalidTimer: ReturnType<typeof setTimeout> | null = null
  let invalidRetryCount = 0

  // 持久监听器引用（供断开时移除）
  let persistentRealtimeHandler: ((data: PenRealtimeData) => void) | null = null
  let persistentDisconnectHandler: (() => void) | null = null

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
    lastCompletedPressure.value = null
    // 重置 invalid 重试状态
    invalidRetryCount = 0
    if (invalidTimer) { clearTimeout(invalidTimer); invalidTimer = null }
  }

  function resetSignalDetection(): void {
    signalBuffer = []
    signalDetected.value = false
    lastSignalCheck = 0
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

  // ── 注册所有 SDK 事件监听器（连接后立即注册，对齐 test.html）──

  function registerAllHandlers(): void {
    if (!client) return

    // realtime：Canvas 波形 + 寻脉信号检测 + 采脉阶段状态更新
    persistentRealtimeHandler = (data: PenRealtimeData) => {
      latestPulseValue.value = data.pulseValue
      if (phase.value === 'searching') {
        checkSignal(data.pulseValue)
      }
      // 采脉阶段：更新压力/设备状态（节流日志）
      if (phase.value === 'collecting') {
        pressureLevel.value = data.pressureLevel
        deviceStatus.value = DEVICE_STATUS_MAP[data.deviceStatus] ?? 'unknown'
        if (data.pressureType) {
          currentPressure.value = PRESSURE_MAP[data.pressureType] ?? null
        }
        const now = Date.now()
        if (!rtLogThrottle || now - rtLogThrottle > 2000) {
          rtLogThrottle = now
          log('📡 realtime:', {
            stable: data.stable,
            pressureLevel: data.pressureLevel,
            pressureType: data.pressureType,
            deviceStatus: data.deviceStatus,
            pulseValue: data.pulseValue,
            position: data.position,
          })
        }
      }
    }
    client.onRealtimeData(persistentRealtimeHandler)

    // disconnected
    persistentDisconnectHandler = () => {
      warn('🔌 蓝牙连接断开（持久监听器捕获）, 当前阶段:', phase.value)
      stopSearchTimers()
      phase.value = 'error'
    }
    client.onDisconnected(persistentDisconnectHandler)

    // 采集进度
    client.onCollectionProgress((event: PenCollectionProgress) => {
      if (phase.value !== 'collecting') return
      invalidReason.value = null
      // SDK 自动恢复了，取消跳过定时器
      if (invalidTimer) {
        clearTimeout(invalidTimer)
        invalidTimer = null
        log('✅ 采集恢复：invalid 定时器已取消')
      }
      collectProgress.value = event.percent
      const pres = PRESSURE_MAP[event.pressureType]
      if (pres) currentPressure.value = pres
      const rawStats = getRawNotifyStats()
      log('📈 采集进度:', {
        pressureType: event.pressureType,
        pressureName: pres ? PRESSURE_NAMES[pres] : '?',
        percent: event.percent,
        count: event.count,
        total: event.total,
        position: event.position,
        // 诊断：原始 BLE 通知数 vs SDK 解析帧数
        rawBleNotify: rawStats.count,
        rawBleBytes: rawStats.bytes,
      })
    })

    // 压力等级
    client.onPressureLevel((level: PenPressureLevel) => {
      if (phase.value !== 'collecting' && phase.value !== 'searching') return
      pressureLevel.value = level
      log('📊 压力等级变化:', level,
        ['(过小)', '(浮)', '(中)', '(沉)', '(过大)'][level] ?? '')
    })

    // 设备状态
    client.onDeviceStatus((status: PenDeviceWorkStatus) => {
      const name = DEVICE_STATUS_MAP[status] ?? 'unknown'
      deviceStatus.value = name
      log('🔧 设备状态变化:', status, '→', name)
    })

    // 采集无效 — 对齐 SDK test.html 官方用法：不调用任何 SDK 命令，等待自动恢复
    client.onCollectionInvalid((event: PenCollectionInvalidEvent) => {
      if (phase.value !== 'collecting') return
      const rawStats = getRawNotifyStats()
      log('⚠️ 采集无效:', {
        reason: event.reason,
        position: event.position,
        pressureType: event.pressureType,
        count: event.count,
        currentProgress: collectProgress.value,
        rawBleNotify: rawStats.count,
        rawBleBytes: rawStats.bytes,
      })

      // 显示提示（UI 层会根据 reason 显示不同文案）
      invalidReason.value = event.reason

      // 清除旧的跳过定时器（如果用户多次触发 invalid，重置等待时间）
      if (invalidTimer) { clearTimeout(invalidTimer); invalidTimer = null }

      // 30 秒内 SDK 没有自动恢复 → 跳过该部位
      // 注意：不调用 clearCollection() 或 setPulsePosition()！
      // SDK 官方 demo 在 collection-invalid 时不做任何 SDK 调用，
      // 设备会在用户重新稳定按压后自动恢复采集。
      invalidTimer = setTimeout(() => {
        invalidTimer = null
        if (phase.value !== 'collecting') return  // 已恢复或已完成

        warn(`⚠️ 采集无效 30 秒未恢复 (${event.reason})，跳过该部位`)
        const pos = currentPosition.value!
        positionsDone.value = { ...positionsDone.value, [pos]: true }
        phase.value = 'position_done'
        log('📍 阶段转换: collecting → position_done（30秒超时跳过）')
      }, INVALID_WAIT_MS)
    })

    // 单档完成
    client.onPressureCompleted((event: PenPressureCompletedEvent) => {
      if (phase.value !== 'collecting') return
      const pres = PRESSURE_MAP[event.pressureType]
      if (pres) {
        pressuresDone.value = { ...pressuresDone.value, [pres]: true }
        lastCompletedPressure.value = pres  // 驱动过渡提示
      }
      const doneCount = Object.values(pressuresDone.value).filter(Boolean).length
      // 诊断：打印 record 的真实结构（看 rawAds/oneAds 到底有没有数据）
      const firstRecord = event.records?.[0]
      if (firstRecord) {
        log('📋 record[0] 结构:', {
          keys: Object.keys(firstRecord),
          rawAdsType: typeof firstRecord.rawAds,
          rawAdsIsArray: Array.isArray(firstRecord.rawAds),
          rawAdsLength: firstRecord.rawAds?.length ?? 'undefined',
          rawPulseLength: (firstRecord as any).rawPulse?.length ?? 'undefined',
          oneAdsLength: firstRecord.oneAds?.length ?? 'undefined',
          motorDataLength: (firstRecord as any).motorData?.length ?? 'undefined',
          // 打印所有非数组字段
          scalarFields: Object.fromEntries(
            Object.entries(firstRecord).filter(([, v]) => !Array.isArray(v))
          ),
        })
      }
      const rawAdsLengths = event.records?.map(r => r.rawAds?.length ?? 0) ?? []
      const oneAdsLengths = event.records?.map(r => r.oneAds?.length ?? 0) ?? []
      log(`✅ 压力档完成: ${pres ? PRESSURE_NAMES[pres] : '?'}`, {
        pressureType: event.pressureType,
        records: event.records?.length ?? '?',
        position: event.position,
        doneCount: `${doneCount}/3`,
        rawAdsLengths,
        oneAdsLengths,
        maxRawAds: rawAdsLengths.length > 0 ? Math.max(...rawAdsLengths) : 0,
      })
    })

    // 整部位完成
    client.onCollectionCompleted((event: PenCollectionCompletedEvent) => {
      if (phase.value !== 'collecting') return

      // 如果 invalid 等待中，取消定时器（SDK 延迟返回了完整数据）
      if (invalidTimer) {
        clearTimeout(invalidTimer)
        invalidTimer = null
        log('✅ invalid 等待取消：onCollectionCompleted 延迟触发，数据完整')
      }
      invalidRetryCount = 0

      const pos = currentPosition.value!
      const rawStats = getRawNotifyStats()

      // 🔍 诊断：检查 SDK client 内部属性（寻找 rawAds 真实数据）
      try {
        const clientAny = client as any
        const proto = Object.getPrototypeOf(clientAny)
        const protoKeys = proto ? Object.getOwnPropertyNames(proto).filter(k => k !== 'constructor') : []
        const instanceKeys = Object.keys(clientAny)
        log('🔍 SDK 内部探测:', {
          instanceKeys: instanceKeys.slice(0, 30),
          protoMethods: protoKeys.slice(0, 30),
        })
        // 直接检查关键内部属性
        log('🔍 stableRecords:', {
          exists: 'stableRecords' in clientAny,
          isArray: Array.isArray(clientAny.stableRecords),
          length: clientAny.stableRecords?.length ?? 'N/A',
          firstKeys: clientAny.stableRecords?.[0] ? Object.keys(clientAny.stableRecords[0]) : 'empty',
        })
        log('🔍 completedRecords:', {
          exists: 'completedRecords' in clientAny,
          isArray: Array.isArray(clientAny.completedRecords),
          length: clientAny.completedRecords?.length ?? 'N/A',
          firstKeys: clientAny.completedRecords?.[0] ? Object.keys(clientAny.completedRecords[0]) : 'empty',
        })
        log('🔍 buffer:', {
          exists: 'buffer' in clientAny,
          type: typeof clientAny.buffer,
          length: clientAny.buffer?.length ?? clientAny.buffer?.byteLength ?? 'N/A',
        })
        // 如果 stableRecords 有数据，检查 rawAds
        const sr = clientAny.stableRecords
        if (Array.isArray(sr) && sr.length > 0) {
          const first = sr[0]
          log('🔍 stableRecord[0] 详情:', {
            keys: Object.keys(first),
            rawAdsLen: first.rawAds?.length,
            oneAdsLen: first.oneAds?.length,
            rawPulseLen: first.rawPulse?.length,
          })
        }
        const cr = clientAny.completedRecords
        if (Array.isArray(cr) && cr.length > 0) {
          const first = cr[0]
          log('🔍 completedRecord[0] 详情:', {
            keys: Object.keys(first),
            rawAdsLen: first.rawAds?.length,
            oneAdsLen: first.oneAds?.length,
            rawPulseLen: first.rawPulse?.length,
          })
        }
      } catch (e) {
        warn('🔍 SDK 内部探测失败:', e)
      }

      // 诊断：打印每个 record 的 rawAds 长度
      const rawAdsLengths = event.records.map(r => r.rawAds?.length ?? 0)
      const oneAdsLengths = event.records.map(r => r.oneAds?.length ?? 0)
      log(`✅✅✅ ${POSITION_NAMES[pos]}部采集完成`, {
        记录数: event.records.length,
        分析: event.analysis ? '有' : '无',
        mode: event.mode,
        timestamp: event.timestamp,
        rawAdsLengths,
        oneAdsLengths,
        maxRawAds: rawAdsLengths.length > 0 ? Math.max(...rawAdsLengths) : 0,
        // 诊断
        rawBleNotify: rawStats.count,
        rawBleBytes: rawStats.bytes,
      })

      completedEvents[pos] = event
      currentAnalysis.value = event.analysis ?? null
      positionsDone.value = { ...positionsDone.value, [pos]: true }
      phase.value = 'position_done'
      log('📍 阶段转换: collecting → position_done')
    })

    // 设备错误
    client.onError((err: PenErrorEvent) => {
      error('❌ 设备错误:', { code: err.code, message: err.message })
      phase.value = 'error'
    })

    // SDK 内部日志（诊断用）
    client.onLog((message: string) => {
      console.log('[SDK]', message)
    })

    log('🔌 所有 SDK 事件监听器已注册（11 个，含 SDK 内部日志）')
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
          // 给 BLE 设备时间重新开始广播（设备断开后不会立刻广播）
          await new Promise(r => setTimeout(r, 1000))
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

      // 5. 降低稳定帧要求：设备每次只发 ~295 帧就结束，SDK 默认要求 400 帧
      //    将阈值降到 200，让设备一轮就能完成采集
      const proto = Object.getPrototypeOf(client)
      const originalFn = proto?.getStableFrameCount
      const originalValue = typeof originalFn === 'function' ? originalFn.call(client) : 'N/A'
      log('📱 getStableFrameCount 原始值:', originalValue)

      // 在 prototype 上覆盖
      if (proto && typeof proto.getStableFrameCount === 'function') {
        proto.getStableFrameCount = function () { return 200 }
        log('📱 ✅ 已在 prototype 上覆盖 getStableFrameCount → 200')
      }
      // 同时在实例上覆盖（双重保障）
      ;(client as any).getStableFrameCount = function () { return 200 }
      log('📱 ✅ 已在 instance 上覆盖 getStableFrameCount → 200')
      log('📱 验证:', (client as any).getStableFrameCount())

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

      // 5. 清空采集缓存 + 设置初始部位（对齐 SDK test.html 官方用法）
      log('📡 clearCollection + setPulsePosition(cun)')
      client.clearCollection()
      client.setPulsePosition('cun')

      // 重置 BLE 原始通知计数（诊断丢帧用）
      resetRawNotifyStats()

      // 6. 注册所有 SDK 事件监听器（对齐 test.html：连接后立即注册）
      registerAllHandlers()

      // 7. 设置第一个部位
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

      const pos = currentPosition.value!

      // 切换到采脉模式（对齐 SDK getting-started.html 文档）
      // 顺序：setPulsePosition() → enterCollect()
      log('📡 clearCollection + setPulsePosition + enterCollect:', pos)
      client.clearCollection()
      client.setPulsePosition(pos)
      try {
        const result = await client.enterCollect()
        log('📡 enterCollect 结果:', result)
      } catch (e) {
        warn('⚠️ enterCollect 调用失败:', e)
      }
      resetRawNotifyStats()

      phase.value = 'collecting'
      resetCollectState()
      log('📍 阶段转换: searching → collecting（', POSITION_NAMES[pos], '部）')

    } else if (phase.value === 'position_done') {
      const nextIndex = positionIndex.value + 1

      if (nextIndex < POSITIONS.length) {
        // 还有下一个部位
        positionIndex.value = nextIndex
        currentPosition.value = POSITIONS[nextIndex]!
        resetCollectState()
        resetSignalDetection()

        // 清空采集缓存 + 设置下一部位（对齐 SDK test.html）
        log('📡 clearCollection + setPulsePosition:', POSITIONS[nextIndex])
        client.clearCollection()
        client.setPulsePosition(POSITIONS[nextIndex]!)
        resetRawNotifyStats()  // 重置 BLE 计数（诊断用）

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
    stopSearchTimers()
    await safeDisconnect()
    phase.value = 'idle'
    log('📍 阶段转换: → idle（已取消）')
  }

  async function retry(): Promise<void> {
    log('🔄 retry() 调用, 当前阶段:', phase.value,
      ', client:', client ? '存在' : 'null',
      ', 连接:', client?.isConnected ?? false)

    stopSearchTimers()

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

    // 清空采集缓存 + 重新设置部位（对齐 SDK test.html）
    const pos = currentPosition.value ?? 'cun'
    log('📡 clearCollection + setPulsePosition（重试）:', pos)
    client.clearCollection()
    client.setPulsePosition(pos)
    resetRawNotifyStats()  // 重置 BLE 计数（诊断用）

    phase.value = 'searching'
    startSearchTimers()
    log('📍 阶段转换: error → searching（重试，',
      POSITION_NAMES[currentPosition.value ?? 'cun'], '部）')
  }

  /** 跳过当前部位（用户手动或超时自动触发） */
  function skipPosition(): void {
    if (phase.value !== 'collecting') return
    log('⏭️ skipPosition() 调用，跳过', POSITION_NAMES[currentPosition.value ?? 'cun'], '部')

    // 取消等待定时器
    if (invalidTimer) { clearTimeout(invalidTimer); invalidTimer = null }

    const pos = currentPosition.value!
    positionsDone.value = { ...positionsDone.value, [pos]: true }
    phase.value = 'position_done'
    log('📍 阶段转换: collecting → position_done（手动跳过）')
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
    cancelled, isDone, latestPulseValue, searchWarning, lastCompletedPressure,
    // 方法
    startCollection, confirmPosition, cancel, retry, skipPosition, getFinalData,
    // 常量（供 UI 使用）
    POSITION_NAMES, PRESSURE_NAMES, POSITIONS,
  }
}
