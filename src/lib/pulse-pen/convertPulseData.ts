// 脉诊笔 SDK 数据 → 项目 IPulseAnalysisData 转换
//
// 转换规则：
//   弦脉 (xianmai): tension.value（脉势维度概率值，>0.72 为弦脉）
//   滑脉 (huamai):  smoothness.value（流利度概率值，>0.7 为滑脉）
//   涩脉 (semai):   1 - smoothness.value（流利度低 → 涩脉，<0.3 为涩脉）
//   弱脉 (ruomai):  1 - strength.value（脉力低 → 弱脉，<0.3 为虚/弱脉）
//   结代脉 (jiedai): 从 rawAds 完整波形中检测 15 个脉搏间隔，套公式计算
//   脉搏 (maibo):   BPM = 3000 / oneAds.length

import type { IPulseAnalysisData } from '@/types/consultation'
import type { PenCollectionCompletedEvent, PenProcessedPulseRecord } from './index'

// ── BPM 计算参数（脉至语提供） ─────────────────────────────────
const BPM_P = 200   // 固定值
const BPM_T = 4     // 固定值
// BPM = (60 * P) / (N * T) = 12000 / (N * 4) = 3000 / N

// ── 结代脉计算参数 ─────────────────────────────────────────────
const JIEDAI_PULSE_COUNT = 15        // 需要观察的脉搏数
const JIEDAI_MIN_INTERVAL = 0.3      // 最小脉搏间隔（秒），用于过滤噪声峰

/**
 * 从完整波形中检测脉搏波峰，返回相邻波峰的间隔（采样点数）
 */
function detectPeakIntervals(rawAds: number[]): number[] {
  if (rawAds.length < 10) return []

  // 计算动态阈值：均值 + 0.3 × 标准差
  const mean = rawAds.reduce((s, v) => s + v, 0) / rawAds.length
  const variance = rawAds.reduce((s, v) => s + (v - mean) ** 2, 0) / rawAds.length
  const threshold = mean + 0.3 * Math.sqrt(variance)

  // 检测局部极大值（波峰）
  const peaks: number[] = []
  for (let i = 1; i < rawAds.length - 1; i++) {
    const prev = rawAds[i - 1] ?? 0
    const curr = rawAds[i] ?? 0
    const next = rawAds[i + 1] ?? 0
    if (curr > prev && curr > next && curr > threshold) {
      // 与上一个波峰保持最小间隔，避免同一波峰被重复检测
      if (peaks.length === 0 || i - peaks[peaks.length - 1]! > 5) {
        peaks.push(i)
      }
    }
  }

  // 计算相邻波峰间隔
  const intervals: number[] = []
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i]! - peaks[i - 1]!)
  }

  return intervals
}

/**
 * 计算结代脉（脉律不齐）
 * 公式：观察 15 个脉搏间隔，取 2 个最大间隔平均值 LMB2，
 *       取 2 个最小间隔平均值 LMB3，差值 LMB4 = LMB2 - LMB3
 *       MBJD = IF(LMB4 > LMB3/4, 1, 0)
 */
function calculateJiedai(rawAds: number[]): number {
  const intervals = detectPeakIntervals(rawAds)

  if (intervals.length < JIEDAI_PULSE_COUNT) {
    // 数据不足，无法判断，返回 0（未检出）
    if (import.meta.env.DEV) {
      console.warn(`[脉诊笔] 结代脉计算：仅检测到 ${intervals.length} 个间隔，需要 ${JIEDAI_PULSE_COUNT} 个`)
    }
    return 0
  }

  // 取前 15 个间隔
  const selected = intervals.slice(0, JIEDAI_PULSE_COUNT)
  const sorted = [...selected].sort((a, b) => a - b)

  // 2 个最大间隔的平均值
  const lmb2 = (sorted[sorted.length - 1]! + sorted[sorted.length - 2]!) / 2
  // 2 个最小间隔的平均值
  const lmb3 = (sorted[0]! + sorted[1]!) / 2
  // 差值
  const lmb4 = lmb2 - lmb3

  // 判定
  const mbjd = lmb4 > lmb3 / 4 ? 1 : 0

  if (import.meta.env.DEV) {
    console.log('[脉诊笔] 结代脉计算:', {
      间隔数: intervals.length,
      LMB2: lmb2.toFixed(1),
      LMB3: lmb3.toFixed(1),
      LMB4: lmb4.toFixed(1),
      'LMB3/4': (lmb3 / 4).toFixed(1),
      MBJD: mbjd,
    })
  }

  return mbjd
}

/**
 * 从采集记录中找到最适合计算 BPM 的记录（优先选择 oneAds 最长的）
 */
function findBestRecord(records: PenProcessedPulseRecord[]): PenProcessedPulseRecord | undefined {
  if (records.length === 0) return undefined
  return records.reduce((best, r) =>
    r.oneAds.length > best.oneAds.length ? r : best,
  records[0]!)
}

/**
 * 从采集记录中找到最适合计算结代脉的记录（优先选择 rawAds 最长的）
 */
function findLongestRawRecord(records: PenProcessedPulseRecord[]): PenProcessedPulseRecord | undefined {
  if (records.length === 0) return undefined
  return records.reduce((best, r) =>
    r.rawAds.length > best.rawAds.length ? r : best,
  records[0]!)
}

/**
 * 将脉诊笔 SDK 的采集结果转换为项目需要的 IPulseAnalysisData
 *
 * @param event SDK 的 collection-completed 事件数据
 * @returns 项目标准脉象数据格式
 */
export function convertPulseData(event: PenCollectionCompletedEvent): IPulseAnalysisData {
  const { records, analysis } = event

  // ── 1. 脉搏 BPM ────────────────────────────────────────────
  const bestRecord = findBestRecord(records)
  const cycleLength = bestRecord?.oneAds?.length ?? 0
  const maibo = cycleLength > 0 ? Math.round((60 * BPM_P) / (cycleLength * BPM_T)) : 72

  // ── 2. 四种脉象概率值（直接取 SDK 维度分析的 value）────────
  const xianmai = analysis?.tension?.value ?? 0     // 弦脉：脉势维度
  const huamai = analysis?.smoothness?.value ?? 0   // 滑脉：流利度维度
  const semai = 1 - (analysis?.smoothness?.value ?? 1) // 涩脉：流利度的反面
  const ruomai = 1 - (analysis?.strength?.value ?? 1)  // 弱脉：脉力的反面

  // ── 3. 结代脉（从原始波形计算）────────────────────────────
  const longestRecord = findLongestRawRecord(records)
  const jiedai = longestRecord
    ? calculateJiedai(longestRecord.rawAds)
    : 0

  const result: IPulseAnalysisData = {
    maibo,
    xianmai: Math.max(0, Math.min(1, xianmai)),
    huamai: Math.max(0, Math.min(1, huamai)),
    semai: Math.max(0, Math.min(1, semai)),
    ruomai: Math.max(0, Math.min(1, ruomai)),
    jiedai,
  }

  if (import.meta.env.DEV) {
    console.log('[脉诊笔] 数据转换结果:', {
      脉搏: `${result.maibo} BPM (cycle长度: ${cycleLength})`,
      弦脉: `${result.xianmai.toFixed(2)} (tension: ${analysis?.tension?.value})`,
      滑脉: `${result.huamai.toFixed(2)} (smoothness: ${analysis?.smoothness?.value})`,
      涩脉: `${result.semai.toFixed(2)}`,
      弱脉: `${result.ruomai.toFixed(2)} (strength: ${analysis?.strength?.value})`,
      结代脉: result.jiedai,
      记录数: records.length,
    })
  }

  return result
}
