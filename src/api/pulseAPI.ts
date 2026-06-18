// 脉诊仪 API：蓝牙脉诊设备数据采集 + 脉诊仪服务分析
//
// 完整流程：
//   蓝牙设备采集原始脉搏数据 → 提交给脉诊仪服务 → 服务返回各脉象置信度(0~1)
//   前端根据阈值(>0.6)将置信度转换为 0/1 代码
//
// 当前状态：mock 实现（硬件设备尚未到位）
// TODO: 硬件到位后替换 readPulseDevice() 为真实蓝牙通信
// TODO: 脉诊仪服务 API 地址待确认，当前 mock 直接返回数据

import type { IPulseAnalysisData } from '@/types/consultation'

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

// ── Mock 脉诊仪服务 ─────────────────────────────────────────────
// 模拟蓝牙设备采集 + 脉诊仪服务分析的完整流程
// 返回固定的脉象置信度数据，用于开发测试

/**
 * 模拟蓝牙脉诊设备采集数据（开发阶段使用）
 * 返回固定的脉象分析结果
 *
 * ⏳ 待确认信息（硬件到位后需要替换）：
 *   - 蓝牙设备的通信协议（经典蓝牙 SPP / BLE）
 *   - 脉诊仪服务的 API 地址和请求格式
 *   - 设备是否直接返回脉象分类还是需要自己计算
 */
async function mockPulseDeviceRead(): Promise<IPulseAnalysisData> {
  // 模拟设备采集延迟（实际蓝牙通信需要几秒）
  await new Promise(resolve => setTimeout(resolve, 2000))

  return {
    maibo: 78,          // 脉搏 78 次/分钟（正常范围）
    xianmai: 0.82,      // 弦脉 0.82 > 0.6 → LXMB = 1
    huamai: 0.35,       // 滑脉 0.35 < 0.6 → LHMB = 0
    semai: 0.12,        // 涩脉 0.12 < 0.6 → LSMB = 0
    ruomai: 0.28,       // 弱脉 0.28 < 0.6 → LWMB = 0
    jiedai: 0.15,       // 结代脉 0.15 < 0.6 → MBJD = 0
  }
}

// ── 真实脉诊设备读取（预留接口） ──────────────────────────────────
// 硬件到位后，替换此函数的实现即可
// 可能的方式：
//   A. Tauri 命令调用 Rust 层的蓝牙通信代码
//   B. Web Bluetooth API（如果设备支持 BLE 且浏览器支持）
//   C. 串口通信（如果设备通过 COM 口暴露数据）

/**
 * 从蓝牙脉诊设备读取脉象数据
 * 当前为 mock 实现，硬件到位后替换
 */
export async function readPulseData(): Promise<IPulseAnalysisData> {
  if (import.meta.env.DEV) {
    console.log('[脉诊仪] 开始采集脉象数据（mock模式）...')
  }

  const data = await mockPulseDeviceRead()

  if (import.meta.env.DEV) {
    console.log('[脉诊仪] 采集完成:', {
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
