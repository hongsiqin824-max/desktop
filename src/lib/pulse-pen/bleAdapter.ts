// Web Bluetooth API 垫片（Tauri 环境专用）
//
// 作用：在 WebView2 中 navigator.bluetooth 不存在时，
//       创建一个兼容 Web Bluetooth API 接口的垫片对象，
//       将 SDK 的调用翻译为 Tauri Rust BLE 命令。

// Web Bluetooth API 类型声明（标准 Web API，但 TypeScript 默认不包含）
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options?: unknown): Promise<unknown>
      getAvailability(): Promise<boolean>
      referringDevice: unknown
    }
  }
}

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

// ── 内部：DataView 工具 ──────────────────────────────────────

function bytesToDataView(bytes: number[]): DataView {
  const arr = new Uint8Array(bytes)
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength)
}

function bufferSourceToBytes(buffer: BufferSource): number[] {
  if (buffer instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(buffer))
  }
  // TypedArray or DataView
  const view = buffer instanceof DataView ? buffer : new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
}

// ── 模拟 Web Bluetooth 对象 ──────────────────────────────────

class BleCharacteristic extends EventTarget {
  uuid: string
  value: DataView | null = null
  private _notifying = false
  private _unlisten: (() => void) | null = null

  constructor(uuid: string) {
    super()
    this.uuid = uuid
  }

  get notifying(): boolean {
    return this._notifying
  }

  async startNotifications(): Promise<BleCharacteristic> {
    if (this._notifying) return this

    // 注册 Tauri 事件监听
    const unlisten = await listen<number[]>('ble-notify', (event) => {
      this.value = bytesToDataView(event.payload)
      this.dispatchEvent(new Event('characteristicvaluechanged'))
    })

    this._unlisten = unlisten

    // 通知 Rust 开启 Notify
    await invoke('ble_subscribe')
    this._notifying = true
    return this
  }

  async stopNotifications(): Promise<BleCharacteristic> {
    if (this._unlisten) {
      this._unlisten()
      this._unlisten = null
    }
    this._notifying = false
    return this
  }

  async writeValue(value: BufferSource): Promise<void> {
    const data = bufferSourceToBytes(value)
    await invoke('ble_write', { data })
  }

  async writeValueWithResponse(value: BufferSource): Promise<void> {
    await this.writeValue(value)
  }

  async writeValueWithoutResponse(value: BufferSource): Promise<void> {
    await this.writeValue(value)
  }
}

class BleService {
  uuid: string
  private _characteristics = new Map<string, BleCharacteristic>()

  constructor(uuid: string) {
    this.uuid = uuid
  }

  async getCharacteristic(uuid: string): Promise<BleCharacteristic> {
    const normalizedUuid = uuid.toLowerCase()

    if (!this._characteristics.has(normalizedUuid)) {
      this._characteristics.set(normalizedUuid, new BleCharacteristic(normalizedUuid))
    }
    return this._characteristics.get(normalizedUuid)!
  }
}

class BleGATTServer {
  connected = false
  private _device: BleDevice
  private _services = new Map<string, BleService>()

  constructor(device: BleDevice) {
    this._device = device
  }

  async connect(): Promise<BleGATTServer> {
    await invoke('ble_connect', { deviceId: this._device.id })
    this.connected = true
    return this
  }

  disconnect(): void {
    this.connected = false
    invoke('ble_disconnect').catch(() => {})
  }

  async getPrimaryService(uuid: string): Promise<BleService> {
    const normalizedUuid = uuid.toLowerCase()

    if (!this._services.has(normalizedUuid)) {
      this._services.set(normalizedUuid, new BleService(normalizedUuid))
    }
    return this._services.get(normalizedUuid)!
  }
}

class BleDevice extends EventTarget {
  id: string
  name?: string
  gatt: BleGATTServer

  constructor(id: string, name?: string) {
    super()
    this.id = id
    this.name = name
    this.gatt = new BleGATTServer(this)
  }
}

// ── navigator.bluetooth 垫片 ─────────────────────────────────

const bluetoothAdapter = {
  async requestDevice(
    options?: { filters?: { namePrefix?: string }[]; optionalServices?: string[]; acceptAllDevices?: boolean }
  ): Promise<BleDevice> {
    // 调用 Rust 扫描，支持重试机制
    let devices = await invoke<{ id: string; name: string | null }[]>('ble_scan')

    // 如果第一次扫描未找到设备，等待 1 秒后重试一次
    if (devices.length === 0) {
      console.log('[BLE 垫片] 第一次扫描未找到设备，1 秒后重试...')
      await new Promise(resolve => setTimeout(resolve, 1000))
      devices = await invoke<{ id: string; name: string | null }[]>('ble_scan')
    }

    if (devices.length === 0) {
      throw new Error('未找到脉诊笔设备，请确认设备已开机')
    }

    // 取第一个匹配设备（实际使用中通常只有一个脉诊笔）
    const device = devices[0]!

    // 通知 Rust 发现设备后，执行 discover 以准备服务和特征
    // 注意：此时尚未连接，discover 在 connect 之后由 getPrimaryService 触发
    return new BleDevice(device.id, device.name ?? undefined)
  },

  // Web Bluetooth 标准属性
  getAvailability: async () => true,
  referringDevice: null,
}

// ── discover 延迟注入 ────────────────────────────────────────
// SDK 在 connect → getPrimaryService → getCharacteristic 之后才知道 UUID
// 我们在第一次 writeValue / startNotifications 时触发 Rust 的 ble_discover

let _discovered = false
let _serviceUuid = ''
let _writeUuid = ''
let _notifyUuid = ''

// 拦截 characteristic 的第一次操作，自动执行 discover
const originalWriteValue = BleCharacteristic.prototype.writeValue
BleCharacteristic.prototype.writeValue = async function (value: BufferSource): Promise<void> {
  if (!_discovered) {
    await autoDiscover(this.uuid)
  }
  return originalWriteValue.call(this, value)
}

const originalStartNotifications = BleCharacteristic.prototype.startNotifications
BleCharacteristic.prototype.startNotifications = async function (): Promise<BleCharacteristic> {
  if (!_discovered) {
    await autoDiscover(this.uuid)
  }
  return originalStartNotifications.call(this)
}

async function autoDiscover(charUuid: string): Promise<void> {
  // 收集已知的所有 UUID（从 Service 和 Characteristic 层收集）
  // SDK 通常使用同一个 service UUID，write 和 notify 是不同的 characteristic UUID
  // 由于我们无法预知 UUID，需要在第一次操作时收集
  //
  // 策略：SDK 在连接后会调用 getPrimaryService(serviceUuid) → getCharacteristic(writeUuid)
  //        然后调用另一个 getCharacteristic(notifyUuid)
  // 但我们的垫片在 getPrimaryService 时不知道哪个是 service UUID
  // 所以我们需要在 connect 后，让 Rust 发现所有服务和特征，
  // 然后由前端传入 UUID 来匹配

  // 由于 SDK 的 UUID 对我们是透明的，我们需要从 SDK 的实际调用中捕获
  // 这里使用一个简单策略：在 connect 后，让 Rust 列出所有特征，
  // 然后前端根据 UUID 特征来匹配

  // 临时方案：让 Rust discover 后返回所有特征列表，
  // 前端找到 write（可写）和 notify（可通知）的特征

  // 由于 btleplug 的 discover_services 会发现所有服务和特征，
  // 我们在这里触发 discover 并传入当前已知的 UUID

  // 注意：这个自动发现机制假设 SDK 按以下顺序调用：
  // 1. getPrimaryService(serviceUuid) → 我们记录 serviceUuid
  // 2. getCharacteristic(writeUuid) → 我们记录 writeUuid
  // 3. getCharacteristic(notifyUuid) → 我们记录 notifyUuid
  // 4. 然后调用 writeValue 或 startNotifications

  // 由于我们的 BleService.getCharacteristic 和 BleGATTServer.getPrimaryService
  // 已经被调用过了（在 autoDiscover 之前），我们可以从调用历史中获取 UUID

  _serviceUuid = _capturedServiceUuid
  _writeUuid = _capturedUuids.length >= 1 ? _capturedUuids[0]! : charUuid
  _notifyUuid = _capturedUuids.length >= 2 ? _capturedUuids[1]! : charUuid

  await invoke('ble_discover', {
    serviceUuid: _serviceUuid,
    writeUuid: _writeUuid,
    notifyUuid: _notifyUuid,
  })

  _discovered = true
}

// ── UUID 捕获（从 SDK 的实际调用中自动收集）──────────────────

let _capturedServiceUuid = ''
const _capturedUuids: string[] = []

const originalGetPrimaryService = BleGATTServer.prototype.getPrimaryService
BleGATTServer.prototype.getPrimaryService = async function (uuid: string): Promise<BleService> {
  _capturedServiceUuid = uuid
  return originalGetPrimaryService.call(this, uuid)
}

const originalGetCharacteristic = BleService.prototype.getCharacteristic
BleService.prototype.getCharacteristic = async function (uuid: string): Promise<BleCharacteristic> {
  const normalized = uuid.toLowerCase()
  if (!_capturedUuids.includes(normalized)) {
    _capturedUuids.push(normalized)
  }
  return originalGetCharacteristic.call(this, uuid)
}

// ── 安装垫片 ─────────────────────────────────────────────────

/**
 * 在 Tauri 环境中安装 Web Bluetooth API 垫片
 * 调用后 navigator.bluetooth 将指向垫片对象
 *
 * 如果 navigator.bluetooth 已存在（浏览器环境），不做任何操作
 */
export async function installBleAdapter(): Promise<void> {
  if (navigator.bluetooth) {
    if (import.meta.env.DEV) {
      console.log('[BLE 垫片] navigator.bluetooth 已存在，跳过安装')
    }
    return
  }

  // 注入垫片
  Object.defineProperty(navigator, 'bluetooth', {
    value: bluetoothAdapter,
    writable: false,
    configurable: true,
  })

  if (import.meta.env.DEV) {
    console.log('[BLE 垫片] ✅ 已安装 Web Bluetooth API 垫片（Tauri → Rust BLE）')
  }
}

/**
 * 重置垫片状态（断开连接后调用，确保下次连接时重新 discover）
 */
export function resetBleAdapter(): void {
  _discovered = false
  _capturedServiceUuid = ''
  _capturedUuids.length = 0
}
