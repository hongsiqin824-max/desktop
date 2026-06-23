// 脉诊笔 SDK 类型声明（自包含版本）
// 原始来源：@mzy-devices-link/pulse-collection-pen
// pulse-common 类型已内联，无需外部依赖

// ── pulse-common 内联类型 ────────────────────────────────────────

export interface PulseAnalysisDimension {
  label: string
  value: number
  normalLower: number
  normalUpper: number
  text: string
}

export interface PulseAnalysisReport {
  position: PulseAnalysisDimension
  rate: PulseAnalysisDimension
  strength: PulseAnalysisDimension
  tension: PulseAnalysisDimension
  smoothness: PulseAnalysisDimension
  kValue: number
}

export interface CycleResult {
  cycle: number[]
  start: number
  end: number
  debug: any
}

export declare class PulseAnalyzer {
  labelPosition(value: number): string
  labelRate(value: number): string
  labelStrength(value: number): string
  labelTension(value: number): string
  labelSmoothness(value: number): string
  normalizeValue(value: number): number
}

// ── 脉诊笔类型 ───────────────────────────────────────────────────

export type PenConnectionStatus = 'idle' | 'unsupported' | 'requesting' | 'selected' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error'
export type PenEnvCode = 'OK' | 'NOT_BROWSER' | 'NO_BLUETOOTH_SUPPORT' | 'INSECURE_CONTEXT'
export type PenErrorCode = 'ENV_NOT_SUPPORTED' | 'REQUEST_CANCELLED' | 'REQUEST_FAILED' | 'NO_DEVICE' | 'NO_GATT' | 'NOT_CONNECTED' | 'PROTOCOL_NOT_READY' | 'INVALID_POSITION' | 'COLLECTION_NOT_READY' | 'NO_CHARACTERISTIC' | 'CONNECT_FAILED' | 'DISCONNECT_FAILED' | 'RECONNECT_FAILED' | 'WRITE_FAILED'
export type PenBluetoothServiceUUID = string | number

export interface PenBluetoothLEScanFilter {
  name?: string
  namePrefix?: string
  services?: PenBluetoothServiceUUID[]
}

export interface PenBluetoothRequestDeviceOptions {
  filters?: PenBluetoothLEScanFilter[]
  optionalServices?: PenBluetoothServiceUUID[]
  acceptAllDevices?: boolean
}

export interface PenBluetoothRemoteGATTServer {
  connected: boolean
  connect(): Promise<PenBluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryService?(service: PenBluetoothServiceUUID): Promise<PenBluetoothRemoteGATTService>
}

export interface PenBluetoothRemoteGATTService {
  getCharacteristic(characteristic: PenBluetoothServiceUUID): Promise<PenBluetoothRemoteGATTCharacteristic>
}

export interface PenBluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView
  startNotifications?(): Promise<PenBluetoothRemoteGATTCharacteristic>
  stopNotifications?(): Promise<PenBluetoothRemoteGATTCharacteristic>
  writeValue?(value: BufferSource): Promise<void>
  writeValueWithResponse?(value: BufferSource): Promise<void>
  writeValueWithoutResponse?(value: BufferSource): Promise<void>
}

export interface PenBluetoothDevice extends EventTarget {
  id: string
  name?: string
  gatt?: PenBluetoothRemoteGATTServer
}

export interface PenCommandResult {
  code: 0 | -1
  message: string
  errorCode?: PenErrorCode
}

export interface PenEnvCheckResult {
  ok: boolean
  code: PenEnvCode
  reason: string
}

export interface PenDeviceInfo {
  id: string
  name: string
}

export interface PenStatusChangeEvent {
  status: PenConnectionStatus
  message: string
  device?: PenDeviceInfo | null
}

export interface PenErrorEvent {
  code: PenErrorCode
  message: string
}

export interface PulseCollectionPenOptions {
  namePrefix?: string
  filters?: PenBluetoothLEScanFilter[]
  optionalServices?: PenBluetoothServiceUUID[]
  autoReconnect?: boolean
  reconnectAttempts?: number
  reconnectDelayMs?: number
  verboseLog?: boolean
}

export interface PenRequestDeviceOptions extends Partial<PulseCollectionPenOptions> {
  acceptAllDevices?: boolean
}

export interface PenSnapshot {
  status: PenConnectionStatus
  isConnected: boolean
  isProtocolReady: boolean
  canExecute: boolean
  isCollecting: boolean
  device: PenDeviceInfo | null
  pulsePosition: PenPulsePosition | null
  pressureLevel: PenPressureLevel | null
  deviceStatus: PenDeviceWorkStatus | null
  collection: PenCollectionProgress | null
  lastError: PenErrorEvent | null
  options: PulseCollectionPenOptions
}

export type PenPulsePosition = 'cun' | 'guan' | 'chi'
export type PenPressureType = 1 | 3 | 5
export type PenPressureLevel = 0 | 1 | 2 | 3 | 4
export type PenDeviceWorkStatus = 1 | 2 | 3

export interface PenRealtimeData {
  position: PenPulsePosition | null
  pressureType: PenPressureType | null
  staticPressure: number
  pulseValue: number
  pressureLevel: PenPressureLevel
  deviceStatus: PenDeviceWorkStatus
  stable: boolean
  timestamp: string
}

export interface PenCollectionProgress {
  position: PenPulsePosition | null
  pressureType: PenPressureType
  count: number
  total: number
  percent: number
}

export interface PenPressureCompletedEvent {
  position: PenPulsePosition | null
  pressureType: PenPressureType
  records: PenRealtimeData[]
  timestamp: string
}

export interface PenCollectionInvalidEvent {
  position: PenPulsePosition | null
  pressureType: PenPressureType | null
  count: number
  reason: 'unstable-frame' | 'early-end' | 'new-start' | 'pressure-mismatch' | 'invalid-frame'
}

export type PenPulseAnalysisDimension = PulseAnalysisDimension
export type PenPulseAnalysisReport = PulseAnalysisReport
export type PenPulseAnalysisSeries = number[] | PenRealtimeData[]

export interface PenPulseAnalysisInput {
  float: PenPulseAnalysisSeries
  middle: PenPulseAnalysisSeries
  deep: PenPulseAnalysisSeries
}

export type PenPulseNumericPosition = 1 | 2 | 3

export interface PenProcessedPulseRecord {
  tagName: string
  position: PenPulseNumericPosition
  positionName: string
  type: 1
  pretype: PenPressureType
  pretypeName: string
  pressure: number
  rawAds: number[]
  rawPulse: number[]
  checkCount: number
  timestamp: string
  oneAdsJsn: CycleResult
  oneAds: number[]
  motorData: number[]
}

export interface PenCollectionCompletedEvent {
  mode: 1
  records: PenProcessedPulseRecord[]
  analysis: PenPulseAnalysisReport
  timestamp: string
}

export interface PenEventMap {
  'status-change': PenStatusChangeEvent
  'device-selected': PenDeviceInfo
  connected: PenDeviceInfo
  disconnected: PenDeviceInfo | null
  'reconnect-failed': PenErrorEvent
  'realtime-data': PenRealtimeData
  'pressure-level': PenPressureLevel
  'device-status': PenDeviceWorkStatus
  'collection-progress': PenCollectionProgress
  'pressure-completed': PenPressureCompletedEvent
  'collection-completed': PenCollectionCompletedEvent
  'collection-invalid': PenCollectionInvalidEvent
  'device-id': string
  log: string
  'error-message': PenErrorEvent
}

export type PenEventName = keyof PenEventMap
export type PenEventHandler<T extends PenEventName> = (payload: PenEventMap[T]) => void

export declare class PulseCollectionPenClient extends EventTarget {
  private constructor()
  static create(options?: Partial<PulseCollectionPenOptions>): PulseCollectionPenClient
  get isConnected(): boolean
  get isProtocolReady(): boolean
  get canExecute(): boolean
  checkEnv(): PenEnvCheckResult
  requestDevice(options?: PenRequestDeviceOptions): Promise<PenBluetoothDevice>
  getAuthorizedDevices(): Promise<PenBluetoothDevice[]>
  connectAuthorizedDevice(device: PenBluetoothDevice, options?: Partial<PulseCollectionPenOptions>): Promise<PenCommandResult>
  connect(device?: PenBluetoothDevice | null, options?: Partial<PulseCollectionPenOptions>): Promise<PenCommandResult>
  disconnect(): Promise<PenCommandResult>
  reconnect(): Promise<PenCommandResult>
  getDevice(): PenBluetoothDevice | null
  setPulsePosition(position: PenPulsePosition): PenCommandResult
  startCollection(position?: PenPulsePosition): PenCommandResult
  analyzePulseData(input: PenPulseAnalysisInput): PenPulseAnalysisReport
  clearCollection(): void
  readDeviceId(): Promise<PenCommandResult>
  queryDeviceStatus(): Promise<PenCommandResult>
  enterStandby(): Promise<PenCommandResult>
  enterSearch(): Promise<PenCommandResult>
  enterCollect(): Promise<PenCommandResult>
  toggleDeviceMode(): Promise<PenCommandResult>
  getSnapshot(): PenSnapshot
  on<T extends PenEventName>(eventName: T, handler: PenEventHandler<T>): this
  onStatusChange(handler: PenEventHandler<'status-change'>): this
  onDeviceSelected(handler: PenEventHandler<'device-selected'>): this
  onConnected(handler: PenEventHandler<'connected'>): this
  onDisconnected(handler: PenEventHandler<'disconnected'>): this
  onReconnectFailed(handler: PenEventHandler<'reconnect-failed'>): this
  onRealtimeData(handler: PenEventHandler<'realtime-data'>): this
  onPressureLevel(handler: PenEventHandler<'pressure-level'>): this
  onDeviceStatus(handler: PenEventHandler<'device-status'>): this
  onCollectionProgress(handler: PenEventHandler<'collection-progress'>): this
  onPressureCompleted(handler: PenEventHandler<'pressure-completed'>): this
  onCollectionCompleted(handler: PenEventHandler<'collection-completed'>): this
  onCollectionInvalid(handler: PenEventHandler<'collection-invalid'>): this
  onDeviceId(handler: PenEventHandler<'device-id'>): this
  onLog(handler: PenEventHandler<'log'>): this
  onError(handler: PenEventHandler<'error-message'>): this
}

export declare const PEN_DEFAULT_OPTIONS: Required<Pick<PulseCollectionPenOptions, 'namePrefix' | 'autoReconnect' | 'reconnectAttempts' | 'reconnectDelayMs' | 'verboseLog'>>

export declare function checkBluetoothEnv(): PenEnvCheckResult

export declare class PulsePenAnalyzer extends PulseAnalyzer {
  analyzePulse(float: PenPulseAnalysisSeries, middle: PenPulseAnalysisSeries, deep: PenPulseAnalysisSeries): PenPulseAnalysisReport
  analyzeCollectedData(input: PenPulseAnalysisInput): PenPulseAnalysisReport
}

export declare const pulsePenAnalyzer: PulsePenAnalyzer
