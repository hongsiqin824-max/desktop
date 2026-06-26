// 脉诊仪 API：蓝牙脉诊笔（BLE）数据采集 + 数据转换
//
// 双模式运行：
//   1. 真实硬件模式：连接脉诊笔 → 寸关尺采集 → SDK 分析 → 数据转换
//   2. Mock 模式：返回固定数据（开发/演示/硬件不可用时自动回退）
//
// 回退策略：真实模式的任何环节失败都会自动回退到 mock，确保流程不中断
//
// 强制 mock：设置环境变量 VITE_PULSE_MOCK=true

import type { IPulseAnalysisData } from '@/types/consultation'
import { isTauri } from '@/config/proxy'
import type {
  PulseCollectionPenClient,
  PenCollectionCompletedEvent,
  PenPulsePosition,
  PenCommandResult,
  PenRealtimeData,
  PenCollectionProgress,
  PenPressureLevel,
  PenDeviceWorkStatus,
  PenCollectionInvalidEvent,
  PenPressureCompletedEvent,
  PenErrorEvent,
} from '@/lib/pulse-pen'
import { convertPulseData } from '@/lib/pulse-pen/convertPulseData'

// ── 脉象阈值 ──────────────────────────────────────────────────

/** 脉象判定阈值：置信度 > 此值判定为该脉象 */
export const PULSE_THRESHOLD = 0.6

/**
 * 将脉诊仪返回的置信度(0~1)转换为代码(0/1)
 * 规则：> 0.6 → 1，否则 → 0
 */
export function pulseConfidenceToCode(confidence: number): 0 | 1 {
  return confidence > PULSE_THRESHOLD ? 1 : 0
}

// ── 进度回调 ──────────────────────────────────────────────────

export type PulseReadPhase = 'connecting' | 'collecting_cun' | 'collecting_guan' | 'collecting_chi' | 'done'

/** 设备工作状态（对应 SDK PenDeviceWorkStatus: 1=待机 2=寻脉 3=采脉） */
export type DeviceWorkStatus = 'standby' | 'search' | 'collect' | 'unknown'

export interface PulseReadProgress {
  phase: PulseReadPhase
  message: string
  percent: number
  // ── 新增字段（全部可选，向后兼容）──
  /** 当前采集部位 */
  currentPosition?: 'cun' | 'guan' | 'chi'
  /** 当前压力档（浮/中/沉） */
  currentPressure?: 'float' | 'middle' | 'deep'
  /** 设备工作状态 */
  deviceStatus?: DeviceWorkStatus
  /** 单压力档采集进度 0-100 */
  pressurePercent?: number
  /** 总体进度 0-100（3 部位 × 3 压力档） */
  overallPercent?: number
  /** 实时脉搏波形值（用于 Canvas 绘制） */
  pulseValue?: number
  /** 压力等级指示（0=过小 1=浮 2=中 3=沉 4=过大） */
  pressureLevel?: number
  /** 采集无效原因（null 表示正常） */
  invalidReason?: string
  /** 刚完成的压力档信息 */
  pressureCompleted?: { position: string; pressure: string }
  /** 各部位已完成的压力档 */
  completedPressures?: Record<string, string[]>
}

export type PulseReadProgressCallback = (progress: PulseReadProgress) => void

// ── 采集部位配置 ──────────────────────────────────────────────

const COLLECTION_POSITIONS: { position: PenPulsePosition; phase: PulseReadPhase; label: string }[] = [
  { position: 'cun', phase: 'collecting_cun', label: '寸' },
  { position: 'guan', phase: 'collecting_guan', label: '关' },
  { position: 'chi', phase: 'collecting_chi', label: '尺' },
]

/** 单个部位采集超时（毫秒） */
const POSITION_TIMEOUT_MS = 60_000

// ── SDK 值 → 应用层标签映射 ──────────────────────────────────

/** SDK pressureType(1/3/5) → 应用层标签 */
const PRESSURE_MAP: Record<number, string> = { 1: 'float', 3: 'middle', 5: 'deep' }

/** SDK deviceStatus(1/2/3) → 应用层标签 */
const DEVICE_STATUS_MAP: Record<number, DeviceWorkStatus> = { 1: 'standby', 2: 'search', 3: 'collect' }

/** 部位英文 → 中文 */
const POSITION_NAMES: Record<string, string> = { cun: '寸', guan: '关', chi: '尺' }

/** 压力档英文 → 中文 */
const PRESSURE_NAMES: Record<string, string> = { float: '浮', middle: '中', deep: '沉' }

// ── Mock 脉诊数据 ─────────────────────────────────────────────

/**
 * 模拟脉诊设备数据（BLE 不可用或失败时的兜底）
 */
async function mockPulseDeviceRead(): Promise<IPulseAnalysisData> {
  await new Promise(resolve => setTimeout(resolve, 2000))

  return {
    maibo: 78,          // 脉搏 78 次/分钟
    xianmai: 0.82,      // 弦脉 0.82 > 0.6 → LXMB = 1
    huamai: 0.35,       // 滑脉 0.35 < 0.6 → LHMB = 0
    semai: 0.12,        // 涩脉 0.12 < 0.6 → LSMB = 0
    ruomai: 0.28,       // 弱脉 0.28 < 0.6 → LWMB = 0
    jiedai: 0.15,       // 结代脉 0.15 < 0.6 → MBJD = 0
  }
}

// ── 真实 BLE 采集 ─────────────────────────────────────────────

/** SDK 客户端单例（延迟初始化） */
let penClient: PulseCollectionPenClient | null = null

/** 动态加载 SDK（避免不支持 Web Bluetooth 的环境报错） */
async function loadPenSDK(): Promise<typeof import('@/lib/pulse-pen')> {
  return import('@/lib/pulse-pen/index.js')
}

/** 采集上下文（跨 3 个部位共享已完成状态） */
interface CollectionContext {
  position: PenPulsePosition
  phase: PulseReadPhase
  positionIndex: number  // 0, 1, 2
  completedPressures: Record<string, string[]>
}

/** 采集世代计数器（防止旧事件处理器污染新采集） */
let collectionGeneration = 0

/** 等待单个部位的 collection-completed 事件，同时转发丰富进度 */
function waitForCollection(
  client: PulseCollectionPenClient,
  timeoutMs: number,
  context: CollectionContext,
  onProgress?: PulseReadProgressCallback,
): Promise<PenCollectionCompletedEvent> {
  return new Promise((resolve, reject) => {
    const gen = ++collectionGeneration

    function isCurrent(): boolean { return gen === collectionGeneration }

    /** 构造进度对象（共享字段 + 事件特有字段） */
    function baseProgress(): PulseReadProgress {
      const posName = POSITION_NAMES[context.position] ?? context.position
      const doneCount = Object.values(context.completedPressures).reduce((s, arr) => s + arr.length, 0)
      return {
        phase: context.phase,
        message: `正在采集${posName}部…`,
        percent: Math.round((doneCount / 9) * 100),
        currentPosition: context.position,
        currentPressure: undefined,
        deviceStatus: undefined,
        pressurePercent: 0,
        overallPercent: Math.round((doneCount / 9) * 100),
        pressureLevel: 2,
        invalidReason: undefined,
        pressureCompleted: undefined,
        completedPressures: { ...context.completedPressures },
      }
    }

    // ── 命名事件处理器（用于 cleanup）──

    let lastLogTime = 0

    function handleRealtimeData(data: PenRealtimeData): void {
      if (!isCurrent()) return
      // 开发环境日志（节流）
      if (import.meta.env.DEV) {
        const now = Date.now()
        if (now - lastLogTime > 2000) {
          lastLogTime = now
          console.log('[脉诊笔] 实时数据:', {
            stable: data.stable,
            pressureLevel: data.pressureLevel,
            pressureType: data.pressureType,
            position: data.position,
            deviceStatus: data.deviceStatus,
            pulseValue: data.pulseValue,
          })
        }
      }
      const p = baseProgress()
      p.pulseValue = data.pulseValue
      p.pressureLevel = data.pressureLevel
      p.deviceStatus = DEVICE_STATUS_MAP[data.deviceStatus] ?? 'unknown'
      if (data.pressureType) {
        p.currentPressure = (PRESSURE_MAP[data.pressureType] ?? undefined) as 'float' | 'middle' | 'deep' | undefined
      }
      onProgress?.(p)
    }

    function handleCollectionProgress(event: PenCollectionProgress): void {
      if (!isCurrent()) return
      const pressureLabel = PRESSURE_MAP[event.pressureType] as 'float' | 'middle' | 'deep' | undefined
      const posName = POSITION_NAMES[context.position] ?? context.position
      const presName = pressureLabel ? PRESSURE_NAMES[pressureLabel] ?? '' : ''
      const p = baseProgress()
      p.currentPressure = pressureLabel
      p.pressurePercent = event.percent
      // 总体进度：已完成数 + 当前压力档进度
      const doneCount = Object.values(context.completedPressures).reduce((s, arr) => s + arr.length, 0)
      p.overallPercent = Math.round(((doneCount + event.percent / 100) / 9) * 100)
      p.message = `${posName}部 ${presName}脉采集中 ${Math.round(event.percent)}%`
      onProgress?.(p)
    }

    function handlePressureLevel(level: PenPressureLevel): void {
      if (!isCurrent()) return
      const p = baseProgress()
      p.pressureLevel = level
      onProgress?.(p)
    }

    function handleDeviceStatus(status: PenDeviceWorkStatus): void {
      if (!isCurrent()) return
      const p = baseProgress()
      p.deviceStatus = DEVICE_STATUS_MAP[status] ?? 'unknown'
      onProgress?.(p)
    }

    function handleCollectionInvalid(event: PenCollectionInvalidEvent): void {
      if (!isCurrent()) return
      if (import.meta.env.DEV) {
        console.log(`[脉诊笔] 采集无效(${event.reason})，等待SDK自动重试...`)
      }
      const p = baseProgress()
      p.invalidReason = event.reason
      p.message = `采集无效：${event.reason}，正在重试…`
      onProgress?.(p)
    }

    function handlePressureCompleted(event: PenPressureCompletedEvent): void {
      if (!isCurrent()) return
      const pos = event.position ?? context.position
      const pres = PRESSURE_MAP[event.pressureType]
      // 记录已完成
      if (pres) {
        if (!context.completedPressures[pos]) context.completedPressures[pos] = []
        if (!context.completedPressures[pos].includes(pres)) {
          context.completedPressures[pos].push(pres)
        }
      }
      const posName = POSITION_NAMES[pos] ?? pos
      const presName = pres ? PRESSURE_NAMES[pres] ?? '' : ''
      const p = baseProgress()
      p.currentPressure = (pres ?? undefined) as 'float' | 'middle' | 'deep' | undefined
      p.pressurePercent = 100
      p.pressureCompleted = { position: pos, pressure: pres ?? '' }
      const doneCount = Object.values(context.completedPressures).reduce((s, arr) => s + arr.length, 0)
      p.overallPercent = Math.round((doneCount / 9) * 100)
      p.message = `${posName}部 ${presName}脉采集完成`
      onProgress?.(p)
    }

    function handleCollectionCompleted(event: PenCollectionCompletedEvent): void {
      clearTimeout(timer)
      cleanup()
      resolve(event)
    }

    function handleError(error: PenErrorEvent): void {
      clearTimeout(timer)
      cleanup()
      reject(new Error(`设备错误: ${error.message}`))
    }

    // ── 注册所有事件处理器 ──
    client.onRealtimeData(handleRealtimeData)
    client.onCollectionProgress(handleCollectionProgress)
    client.onPressureLevel(handlePressureLevel)
    client.onDeviceStatus(handleDeviceStatus)
    client.onCollectionInvalid(handleCollectionInvalid)
    client.onPressureCompleted(handlePressureCompleted)
    client.onCollectionCompleted(handleCollectionCompleted)
    client.onError(handleError)

    // ── 清理函数（移除所有处理器，防止跨部位泄漏）──
    function cleanup(): void {
      client.removeEventListener('realtime-data', handleRealtimeData as unknown as EventListener)
      client.removeEventListener('collection-progress', handleCollectionProgress as unknown as EventListener)
      client.removeEventListener('pressure-level', handlePressureLevel as unknown as EventListener)
      client.removeEventListener('device-status', handleDeviceStatus as unknown as EventListener)
      client.removeEventListener('collection-invalid', handleCollectionInvalid as unknown as EventListener)
      client.removeEventListener('pressure-completed', handlePressureCompleted as unknown as EventListener)
      client.removeEventListener('collection-completed', handleCollectionCompleted as unknown as EventListener)
      client.removeEventListener('error-message', handleError as unknown as EventListener)
    }

    // ── 超时保护（清理 + reject）──
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('采集超时'))
    }, timeoutMs)
  })
}

/** 采集一个部位（设置位置 → 等待浮中沉完成） */
async function collectOnePosition(
  client: PulseCollectionPenClient,
  position: PenPulsePosition,
  context: CollectionContext,
  onProgress?: PulseReadProgressCallback,
): Promise<PenCollectionCompletedEvent> {
  // 设置采集部位，设备会自动开始浮→中→沉采集
  const result: PenCommandResult = client.setPulsePosition(position)
  if (result.code !== 0) {
    throw new Error(`设置采集部位(${position})失败: ${result.message}`)
  }

  // 等待该部位的浮中沉全部完成
  return waitForCollection(client, POSITION_TIMEOUT_MS, context, onProgress)
}

/**
 * 真实 BLE 脉诊笔采集流程
 * 连接 → 寸关尺依次采集 → 断开 → 数据转换
 */
async function readPulseFromDevice(
  onProgress?: PulseReadProgressCallback,
): Promise<IPulseAnalysisData> {
  // 1. 加载 SDK
  const sdk = await loadPenSDK()

  // 1.5 Tauri 环境：注入 BLE 垫片（让 navigator.bluetooth 存在，SDK 才能通过环境检查）
  if (isTauri) {
    const { installBleAdapter, resetBleAdapter } = await import('@/lib/pulse-pen/bleAdapter')
    resetBleAdapter()  // 重置上次连接的状态
    // 清理残留的 BLE 连接（上次采集超时/异常退出时可能未断开）
    // BLE 设备在已连接状态下不广播，不清理的话后续扫描找不到设备
    try {
      await (await import('@tauri-apps/api/core')).invoke('ble_disconnect')
      if (import.meta.env.DEV) console.log('[脉诊笔] 扫描前清理残留连接完成')
    } catch { /* 无残留连接时正常报错 */ }
    await installBleAdapter()
  }

  // 2. 环境检查
  const envCheck = sdk.checkBluetoothEnv()
  if (!envCheck.ok) {
    throw new Error(`蓝牙环境不可用: ${envCheck.reason}`)
  }

  // 3. 创建客户端
  if (!penClient) {
    penClient = sdk.PulseCollectionPenClient.create({
      autoReconnect: false,
      verboseLog: import.meta.env.DEV,
    })
  }

  // 4. 连接设备
  onProgress?.({ phase: 'connecting', message: '正在连接脉诊笔…', percent: 0 })

  // 优先尝试已授权设备（免弹窗）
  const authorizedDevices = await penClient.getAuthorizedDevices()
  const matchedDevice = authorizedDevices.find(d => d.name?.startsWith('MZY'))

  let connectResult: PenCommandResult
  if (matchedDevice) {
    connectResult = await penClient.connectAuthorizedDevice(matchedDevice)
  } else {
    // 无已授权设备 → 弹出蓝牙选择窗口
    const device = await penClient.requestDevice({ namePrefix: 'MZY' })
    connectResult = await penClient.connect(device)
  }

  if (connectResult.code !== 0) {
    throw new Error(`连接脉诊笔失败: ${connectResult.message}`)
  }

  if (import.meta.env.DEV) {
    console.log('[脉诊笔] ✅ 已连接:', penClient.getDevice()?.name)
  }

  // 4.5 切换到采脉模式（设备必须在此模式下才能自动开始浮→中→沉采集）
  try {
    const collectResult = await penClient.enterCollect()
    if (collectResult.code !== 0) {
      console.warn('[脉诊笔] ⚠️ 切换到采脉模式失败:', collectResult.message)
      // 不抛出错误，继续尝试（有些设备可能自动进入采脉模式）
    } else if (import.meta.env.DEV) {
      console.log('[脉诊笔] ✅ 已切换到采脉模式')
    }
  } catch (e) {
    console.warn('[脉诊笔] ⚠️ 切换到采脉模式异常:', e)
    // 不抛出错误，继续尝试
  }

  // 5. 依次采集三个部位（try/finally 确保无论成功/失败/超时都断开连接）
  const completedEvents: PenCollectionCompletedEvent[] = []

  // 已完成压力档跟踪（跨 3 个部位共享，用于进度计算）
  const completedPressures: Record<string, string[]> = { cun: [], guan: [], chi: [] }

  try {
    for (let i = 0; i < COLLECTION_POSITIONS.length; i++) {
      const { position, phase, label } = COLLECTION_POSITIONS[i]!
      const percent = Math.round(((i + 1) / COLLECTION_POSITIONS.length) * 100)

      onProgress?.({
        phase, message: `正在采集${label}部…`, percent,
        currentPosition: position,
        overallPercent: Math.round((i / 3) * 100),
        completedPressures: { ...completedPressures },
      })

      const context: CollectionContext = {
        position,
        phase,
        positionIndex: i,
        completedPressures,
      }

      const event = await collectOnePosition(penClient, position, context, onProgress)
      completedEvents.push(event)

      if (import.meta.env.DEV) {
        console.log(`[脉诊笔] ${label}部采集完成:`, {
          记录数: event.records.length,
          分析: event.analysis ? '有' : '无',
        })
      }
    }
  } finally {
    // 6. 无论采集成功、失败、超时，都断开 BLE 连接
    //    防止设备保持连接状态不广播，导致后续扫描找不到
    if (penClient) {
      try {
        await penClient.disconnect()
      } catch {
        // 断开失败不影响数据
      }
    }
    // 重置 SDK 客户端，下次调用时创建新实例，避免残留内部状态
    penClient = null
  }

  // 7. 合并三个部位的数据，取分析结果最佳的
  //    BPM 用 oneAds 最长的记录，脉象概率取三个部位的平均值
  const allRecords = completedEvents.flatMap(e => e.records)
  const analyses = completedEvents.map(e => e.analysis).filter(Boolean)

  // 平均各维度的 value
  const avgAnalysis = analyses.length > 0 ? {
    position: {
      label: '脉位',
      value: analyses.reduce((s, a) => s + a.position.value, 0) / analyses.length,
      normalLower: 0.3, normalUpper: 0.7, text: '',
    },
    rate: {
      label: '脉率',
      value: analyses.reduce((s, a) => s + a.rate.value, 0) / analyses.length,
      normalLower: 0.35, normalUpper: 0.65, text: '',
    },
    strength: {
      label: '脉力',
      value: analyses.reduce((s, a) => s + a.strength.value, 0) / analyses.length,
      normalLower: 0.3, normalUpper: 0.7, text: '',
    },
    tension: {
      label: '脉势',
      value: analyses.reduce((s, a) => s + a.tension.value, 0) / analyses.length,
      normalLower: 0, normalUpper: 0.72, text: '',
    },
    smoothness: {
      label: '流利度',
      value: analyses.reduce((s, a) => s + a.smoothness.value, 0) / analyses.length,
      normalLower: 0.3, normalUpper: 0.7, text: '',
    },
    kValue: analyses.reduce((s, a) => s + a.kValue, 0) / analyses.length,
  } : undefined

  // 用合并后的数据构造一个虚拟的 completedEvent 传入转换函数
  const mergedEvent: PenCollectionCompletedEvent = {
    mode: 1,
    records: allRecords,
    analysis: avgAnalysis ?? completedEvents[0]!.analysis,
    timestamp: new Date().toISOString(),
  }

  onProgress?.({ phase: 'done', message: '采集完成', percent: 100 })

  return convertPulseData(mergedEvent)
}

// ── 对外接口 ──────────────────────────────────────────────────

/**
 * 从脉诊设备读取脉象数据
 *
 * 优先使用真实 BLE 脉诊笔，任何环节失败都自动回退到 mock 数据。
 * 通过 onProgress 回调可获取实时采集进度（用于 UI 展示）。
 *
 * @param onProgress 可选的进度回调
 * @returns 脉象分析数据
 */
export async function readPulseData(
  onProgress?: PulseReadProgressCallback,
): Promise<IPulseAnalysisData> {
  // 强制 mock 模式（环境变量）
  const forceMock = import.meta.env.VITE_PULSE_MOCK === 'true'

  if (!forceMock) {
    try {
      const data = await readPulseFromDevice(onProgress)

      if (import.meta.env.DEV) {
        console.log('[脉诊仪] ✅ 真实采集完成:', {
          脉搏: `${data.maibo}次/分`,
          弦脉: `${data.xianmai} → ${pulseConfidenceToCode(data.xianmai)}`,
          滑脉: `${data.huamai} → ${pulseConfidenceToCode(data.huamai)}`,
          涩脉: `${data.semai} → ${pulseConfidenceToCode(data.semai)}`,
          弱脉: `${data.ruomai} → ${pulseConfidenceToCode(data.ruomai)}`,
          结代脉: `${data.jiedai ?? 'N/A'} → ${data.jiedai != null ? pulseConfidenceToCode(data.jiedai) : 'N/A'}`,
        })
      }

      return data
    } catch (e) {
      // BLE 任何环节失败 → 自动回退到 mock
      if (import.meta.env.DEV) {
        console.warn('[脉诊仪] ⚠️ BLE 采集失败，回退到 mock 模式:', e instanceof Error ? e.message : e)
      }
    }
  }

  // ── Mock 兜底 ──────────────────────────────────────────────
  if (import.meta.env.DEV) {
    console.log('[脉诊仪] 使用 mock 模式')
  }

  const data = await mockPulseDeviceRead()

  if (import.meta.env.DEV) {
    console.log('[脉诊仪] mock 数据:', {
      脉搏: `${data.maibo}次/分`,
      弦脉: `${data.xianmai} → ${pulseConfidenceToCode(data.xianmai)}`,
      滑脉: `${data.huamai} → ${pulseConfidenceToCode(data.huamai)}`,
      涩脉: `${data.semai} → ${pulseConfidenceToCode(data.semai)}`,
      弱脉: `${data.ruomai} → ${pulseConfidenceToCode(data.ruomai)}`,
      结代脉: `${data.jiedai ?? 'N/A'} → ${data.jiedai != null ? pulseConfidenceToCode(data.jiedai) : 'N/A'}`,
    })
  }

  return data
}
