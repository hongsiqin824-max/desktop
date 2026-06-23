# @mzy-devices-link/pulse-collection-pen

基于 `Web Bluetooth API` 的脉诊笔浏览器 SDK。

SDK 提供：

- 蓝牙设备授权与连接管理
- 已授权设备直接连接
- 设备状态与压力等级读取
- 寸、关、尺采集部位管理
- 浮、中、沉稳定数据采集
- 实时脉搏数据回调
- 自动整理采集结果
- 基础脉象分析能力

适用于浏览器环境下的脉诊笔设备接入、实时数据显示和脉象数据采集。

---

# 安装与引用

## 包管理器

```bash
pnpm add @mzy-devices-link/pulse-collection-pen
```

```ts
import { PulseCollectionPenClient } from '@mzy-devices-link/pulse-collection-pen';
```

## 浏览器全局对象

SDK 同时挂载到 `window`：

```ts
window.PulseCollectionPenClient;
```

客户端使用单例创建方法：

```ts
const client = PulseCollectionPenClient.create();
```

---

# 快速开始

```ts
import { PulseCollectionPenClient } from '@mzy-devices-link/pulse-collection-pen';

const client = PulseCollectionPenClient.create({
  autoReconnect: true,
});

client
  .onRealtimeData((data) => {
    console.log('实时数据', data);
  })
  .onCollectionProgress((progress) => {
    console.log('采集进度', progress);
  })
  .onPressureCompleted((result) => {
    console.log('单个压力档采集完成', result);
  })
  .onCollectionCompleted((result) => {
    console.log('浮中沉采集记录', result.records);
    console.log('脉象分析结果', result.analysis);
  })
  .onCollectionInvalid((event) => {
    console.warn('本次稳定采集无效', event);
  })
  .onError((error) => {
    console.error('设备错误', error);
  });

// 首次使用时打开浏览器蓝牙设备选择窗口
const device = await client.requestDevice();

// 连接设备并初始化协议通道
const connectResult = await client.connect(device);
if (connectResult.code !== 0) {
  throw new Error(connectResult.message);
}

// 设置当前采集部位；设备上报后 SDK 会自动开始收集
client.setPulsePosition('guan');

// 如设备需要由页面主动切换到采脉状态
await client.enterCollect();
```

设备会依次返回浮、中、沉稳定数据。三档全部完成后自动触发 `collection-completed`。

---

# 运行环境要求

- 浏览器需支持 `Web Bluetooth API`
- 推荐使用 Chrome / Edge 最新版本
- 页面必须运行在：
  - `HTTPS`
  - `localhost`
- 蓝牙设备首次授权必须由用户点击操作触发
- 已授权设备可通过 `getAuthorizedDevices()` 重新获取
- SDK 仅负责连接、采集、数据整理和事件分发，不包含业务 UI

可以在调用连接功能前检查环境：

```ts
const result = client.checkEnv();

if (!result.ok) {
  console.error(result.code, result.reason);
}
```

---

# 初始化参数

```ts
const client = PulseCollectionPenClient.create(options);
```

## options

| 参数              | 类型    | 默认值  | 说明                                |
| ----------------- | ------- | ------- | ----------------------------------- |
| namePrefix        | string  | `MZY`   | 默认设备名称前缀                    |
| filters           | array   | -       | Web Bluetooth 设备筛选条件          |
| optionalServices  | array   | -       | 额外允许访问的蓝牙服务              |
| autoReconnect     | boolean | `false` | 连接断开后是否自动重连              |
| reconnectAttempts | number  | `3`     | 自动重连次数                        |
| reconnectDelayMs  | number  | `1000`  | 重连间隔，单位毫秒                  |
| verboseLog        | boolean | `false` | 是否在控制台打印低频 SDK 业务日志； |

蓝牙协议参数和稳定采集规则由 SDK 内部管理，使用层无需配置。

```ts
const client = PulseCollectionPenClient.create({
  namePrefix: 'MZY',
  autoReconnect: true,
});
```

---

# 核心 API

## 设备连接

### 选择设备

```ts
const device = await client.requestDevice(options?);
```

打开浏览器蓝牙设备选择窗口并返回设备对象。

```ts
const device = await client.requestDevice({
  namePrefix: 'MZY',
});
```

也可以使用自定义筛选条件：

```ts
const device = await client.requestDevice({
  filters: [{ namePrefix: 'MZY' }],
});
```

---

### 获取已授权设备

```ts
const devices = await client.getAuthorizedDevices();
```

返回当前浏览器已授权的蓝牙设备对象，不会再次打开设备选择窗口。

浏览器不支持 `Bluetooth.getDevices()` 或当前没有授权设备时返回空数组。

```ts
const devices = await client.getAuthorizedDevices();
const device = devices.find((item) => item.name?.startsWith('MZY'));
```

---

### 连接已授权设备

```ts
const result = await client.connectAuthorizedDevice(device, options?);
```

使用 `getAuthorizedDevices()` 返回的设备对象直接连接。

```ts
const devices = await client.getAuthorizedDevices();
const authorizedDevice = devices.find((item) => item.name?.startsWith('MZY'));

if (authorizedDevice) {
  await client.connectAuthorizedDevice(authorizedDevice);
}
```

---

### 推荐连接流程

优先连接已授权设备，没有匹配设备时再打开选择窗口：

```ts
async function connectPen() {
  const namePrefix = 'MZY';
  const authorizedDevices = await client.getAuthorizedDevices();
  const matchedDevices = authorizedDevices.filter((device) =>
    (device.name || '').startsWith(namePrefix)
  );

  const device =
    matchedDevices.find((item) => item.gatt?.connected) ||
    matchedDevices[0] ||
    (await client.requestDevice({ namePrefix }));

  return client.connectAuthorizedDevice(device);
}
```

---

### 通用连接方法

```ts
const result = await client.connect(device?, options?);
```

传入设备对象时直接连接；未传入时使用客户端最近一次保存的设备对象。

```ts
const device = await client.requestDevice();
const result = await client.connect(device);
```

---

### 断开连接

```ts
const result = await client.disconnect();
```

停止蓝牙通知、清空当前采集过程并断开 GATT 连接。

---

### 重新连接

```ts
const result = await client.reconnect();
```

使用最近一次连接的设备对象重新连接。

---

### 获取当前设备

```ts
const device = client.getDevice();
```

未选择设备时返回 `null`。

---

### 连接状态

```ts
client.isConnected;
client.isProtocolReady;
client.canExecute;
```

| 属性            | 说明                       |
| --------------- | -------------------------- |
| isConnected     | 蓝牙 GATT 是否已连接       |
| isProtocolReady | 写入和通知特征是否已初始化 |
| canExecute      | 是否已连接且协议通道可用   |

---

# 采集控制

## 设置采集部位

```ts
const result = client.setPulsePosition(position);
```

| position | 说明 |
| -------- | ---- |
| `cun`    | 寸   |
| `guan`   | 关   |
| `chi`    | 尺   |

示例：

```ts
client.setPulsePosition('guan');
```

---

## 可选：重置本轮采集

```ts
const result = client.startCollection(position?);
```

该方法用于清空本轮采集缓存并设置采集部位，不会向设备发送“开始采集”命令。

正常流程只需在连接成功后调用 `setPulsePosition()`。设备开始上报稳定数据时，SDK 会自动收集浮、中、沉三档数据，无需调用 `startCollection()`。

```ts
const result = client.startCollection('cun');

if (result.code !== 0) {
  console.error(result.message);
}
```

如果业务需要主动放弃上一轮数据并重新开始，可调用该方法。如果设备当前不在采脉模式，可另外调用：

```ts
await client.enterCollect();
```

---

## 自动完成机制

每个部位包含三个压力档：

| pressureType | 名称 |
| ------------ | ---- |
| 1            | 浮   |
| 3            | 中   |
| 5            | 沉   |

每个压力档由 SDK 自动完成稳定数据采集：

1. 单档稳定采集完成后触发 `pressure-completed`
2. 同压力档继续发送的数据会被忽略
3. 压力档切换后开始收集下一档
4. 浮、中、沉全部完成后触发一次 `collection-completed`
5. `collection-completed` 中直接包含整理后的记录和脉象分析结果

---

## 清空采集

```ts
client.clearCollection();
```

清空：

- 当前接收缓冲
- 当前压力档数据
- 已完成的浮、中、沉记录
- 当前采集状态

---

## 手动分析

```ts
const report = client.analyzePulseData({
  float,
  middle,
  deep,
});
```

`float`、`middle`、`deep` 可以是：

- `number[]`
- `PenRealtimeData[]`

示例：

```ts
const report = client.analyzePulseData({
  float: floatRecords,
  middle: middleRecords,
  deep: deepRecords,
});
```

通常无需手动调用。完整采集结束时，SDK 已在 `collection-completed.analysis` 中返回分析结果。

---

# 设备控制 API

## 读取设备编号

```ts
await client.readDeviceId();
```

结果通过 `onDeviceId` 返回：

```ts
client.onDeviceId((deviceId) => {
  console.log('设备编号', deviceId);
});
```

---

## 查询设备状态

```ts
await client.queryDeviceStatus();
```

状态通过 `onDeviceStatus` 返回。

---

## 切换到待机状态

```ts
await client.enterStandby();
```

---

## 切换到寻脉状态

```ts
await client.enterSearch();
```

---

## 切换到采脉状态

```ts
await client.enterCollect();
```

---

## 切换设备模式

```ts
await client.toggleDeviceMode();
```

---

# API 返回格式

设备操作统一返回：

```ts
interface PenCommandResult {
  code: 0 | -1;
  message: string;
  errorCode?: PenErrorCode;
}
```

示例：

```ts
const result = await client.enterCollect();

if (result.code === 0) {
  console.log(result.message);
} else {
  console.error(result.errorCode, result.message);
}
```

## code 说明

| code | 说明     |
| ---- | -------- |
| 0    | 操作成功 |
| -1   | 操作失败 |

## errorCode 说明

| errorCode            | 说明                         |
| -------------------- | ---------------------------- |
| ENV_NOT_SUPPORTED    | 当前环境不支持 Web Bluetooth |
| REQUEST_CANCELLED    | 用户取消设备选择             |
| REQUEST_FAILED       | 请求设备失败                 |
| NO_DEVICE            | 没有可连接的设备             |
| NO_GATT              | 设备不支持 GATT              |
| NOT_CONNECTED        | 设备尚未连接                 |
| PROTOCOL_NOT_READY   | 蓝牙协议通道尚未就绪         |
| INVALID_POSITION     | 采集部位无效                 |
| COLLECTION_NOT_READY | 采集条件未准备好             |
| NO_CHARACTERISTIC    | 缺少需要的蓝牙特征           |
| CONNECT_FAILED       | 连接失败                     |
| DISCONNECT_FAILED    | 断开失败                     |
| RECONNECT_FAILED     | 重连失败                     |
| WRITE_FAILED         | 设备指令写入失败             |

---

# 状态快照

```ts
const snapshot = client.getSnapshot();
```

返回结构：

```ts
{
  status: PenConnectionStatus;
  isConnected: boolean;
  isProtocolReady: boolean;
  canExecute: boolean;
  isCollecting: boolean;
  device: PenDeviceInfo | null;
  pulsePosition: 'cun' | 'guan' | 'chi' | null;
  pressureLevel: 0 | 1 | 2 | 3 | 4 | null;
  deviceStatus: 1 | 2 | 3 | null;
  collection: PenCollectionProgress | null;
  lastError: PenErrorEvent | null;
  options: PulseCollectionPenOptions;
}
```

---

# 事件系统

## 链式事件注册

```ts
client
  .onConnected((device) => console.log(device))
  .onRealtimeData((data) => console.log(data))
  .onCollectionProgress((progress) => console.log(progress))
  .onCollectionCompleted((result) => console.log(result))
  .onError((error) => console.error(error));
```

---

## 通用事件注册

```ts
client.on('realtime-data', (data) => {
  console.log(data);
});
```

## 支持事件

| 事件名               | 快捷注册方法          |
| -------------------- | --------------------- |
| status-change        | onStatusChange        |
| device-selected      | onDeviceSelected      |
| connected            | onConnected           |
| disconnected         | onDisconnected        |
| reconnect-failed     | onReconnectFailed     |
| realtime-data        | onRealtimeData        |
| pressure-level       | onPressureLevel       |
| device-status        | onDeviceStatus        |
| collection-progress  | onCollectionProgress  |
| pressure-completed   | onPressureCompleted   |
| collection-completed | onCollectionCompleted |
| collection-invalid   | onCollectionInvalid   |
| device-id            | onDeviceId            |
| log                  | onLog                 |
| error-message        | onError               |

---

# 回调事件说明

# onRealtimeData

实时数据回调。稳定和不稳定数据都会触发，可直接用于绘制实时曲线。

设备可能高频触发该事件。SDK 会完整分发每条业务采样，使用层不应为了降低页面刷新频率而丢弃稳定采集数据。绘图时建议先缓存数据，再按固定间隔批量刷新图表。

```ts
client.onRealtimeData((data) => {
  console.log(data.pulseValue);
});
```

## 回调参数

```ts
{
  position: 'cun' | 'guan' | 'chi' | null;
  pressureType: 1 | 3 | 5 | null;
  staticPressure: number;
  pulseValue: number;
  pressureLevel: 0 | 1 | 2 | 3 | 4;
  deviceStatus: 1 | 2 | 3;
  stable: boolean;
  timestamp: string;
}
```

| 字段           | 说明                                        |
| -------------- | ------------------------------------------- |
| position       | 当前寸、关、尺部位                          |
| pressureType   | 当前浮、中、沉压力档；不稳定阶段可能为 null |
| staticPressure | 当前静态压力值                              |
| pulseValue     | 当前脉搏采样值                              |
| pressureLevel  | 当前压力等级                                |
| deviceStatus   | 当前设备工作状态                            |
| stable         | 是否为稳定采集数据                          |
| timestamp      | ISO 时间字符串                              |

---

# onCollectionProgress

当前压力档采集进度回调。

```ts
client.onCollectionProgress((progress) => {
  console.log(`${Math.round(progress.percent)}%`);
});
```

## 回调参数

```ts
{
  position: 'cun' | 'guan' | 'chi' | null;
  pressureType: 1 | 3 | 5;
  percent: number;
}
```

---

# onPressureCompleted

单个压力档采集完成回调。

```ts
client.onPressureCompleted((result) => {
  console.log(result.pressureType, result.records);
});
```

## 回调参数

```ts
{
  position: 'cun' | 'guan' | 'chi' | null;
  pressureType: 1 | 3 | 5;
  records: PenRealtimeData[];
  timestamp: string;
}
```

---

# onCollectionCompleted

当前部位的浮、中、沉全部采集完成回调。

```ts
client.onCollectionCompleted((result) => {
  console.log('采集结果', result.records);
  console.log('分析结果', result.analysis);
});
```

## 回调参数

```ts
{
  mode: 1;
  records: PenProcessedPulseRecord[];
  analysis: PenPulseAnalysisReport;
  timestamp: string;
}
```

`pulse-collection-pen` 没有左右手概念，因此结果中不包含 `side`。

---

## PenProcessedPulseRecord

```ts
{
  tagName: string;
  position: 1 | 2 | 3;
  positionName: string;
  type: 1;
  pretype: 1 | 3 | 5;
  pretypeName: string;
  pressure: number;
  rawAds: number[];
  rawPulse: number[];
  timestamp: string;
  oneAdsJsn: {
    cycle: number[];
    start: number;
    end: number;
  };
  oneAds: number[];
  motorData: number[];
}
```

| 字段         | 说明                     |
| ------------ | ------------------------ |
| position     | 1=寸，2=关，3=尺         |
| positionName | 寸、关、尺中文名称       |
| type         | 固定为 1                 |
| pretype      | 1=浮，3=中，5=沉         |
| pretypeName  | 浮、中、沉中文名称       |
| pressure     | 本档静态压力平均值       |
| rawAds       | 脉搏采样值数组           |
| rawPulse     | 静态压力值数组           |
| oneAdsJsn    | 单周期提取结果           |
| oneAds       | 提取并对齐后的单周期数据 |
| motorData    | 脉复仪使用的转换数据     |

> `rawAds` 和 `rawPulse` 是已经转换后的业务数值数组，不是蓝牙协议字节。

---

## AnalysisItem

```ts
{
  label: string;
  value: number;
  normalLower: number;
  normalUpper: number;
  text: string;
}
```

分析结果：

```ts
{
  position: AnalysisItem;
  rate: AnalysisItem;
  strength: AnalysisItem;
  tension: AnalysisItem;
  smoothness: AnalysisItem;
  kValue: number;
}
```

---

# onCollectionInvalid

当前稳定采集无效回调。

```ts
client.onCollectionInvalid((event) => {
  console.warn(event.reason);
});
```

## 回调参数

```ts
{
  position: 'cun' | 'guan' | 'chi' | null;
  pressureType: 1 | 3 | 5 | null;
  reason:
    | 'unstable-frame'
    | 'early-end'
    | 'new-start'
    | 'pressure-mismatch'
    | 'invalid-frame';
}
```

| reason            | 说明                               |
| ----------------- | ---------------------------------- |
| unstable-frame    | 稳定采集完成前恢复为不稳定数据     |
| early-end         | 稳定阶段提前结束                   |
| new-start         | 当前档未完成时收到新的稳定开始信号 |
| pressure-mismatch | 数据压力档与当前采集档不一致       |
| invalid-frame     | 转换后的协议数据不符合当前采集状态 |

---

# onPressureLevel

设备压力等级变化回调。

```ts
client.onPressureLevel((level) => {
  console.log(level);
});
```

| level | 说明     |
| ----- | -------- |
| 0     | 力度过小 |
| 1     | 浮       |
| 2     | 中       |
| 3     | 沉       |
| 4     | 力度过大 |

---

# onDeviceStatus

设备工作状态变化回调。

```ts
client.onDeviceStatus((status) => {
  console.log(status);
});
```

| status | 说明 |
| ------ | ---- |
| 1      | 待机 |
| 2      | 寻脉 |
| 3      | 采脉 |

---

# onStatusChange

SDK 连接状态变化回调。

```ts
client.onStatusChange((event) => {
  console.log(event.status, event.message);
});
```

## 回调参数

```ts
{
  status:
    | 'idle'
    | 'unsupported'
    | 'requesting'
    | 'selected'
    | 'connecting'
    | 'connected'
    | 'disconnected'
    | 'reconnecting'
    | 'error';
  message: string;
  device?: {
    id: string;
    name: string;
  } | null;
}
```

---

# onDeviceSelected

用户在浏览器设备窗口中选择设备后触发。

```ts
client.onDeviceSelected((device) => {
  console.log(device.id, device.name);
});
```

---

# onConnected

设备和协议通道均连接成功后触发。

```ts
client.onConnected((device) => {
  console.log('连接成功', device);
});
```

---

# onDisconnected

设备断开后触发。

```ts
client.onDisconnected((device) => {
  console.log('连接断开', device);
});
```

---

# onReconnectFailed

自动重连达到最大次数仍失败时触发。

```ts
client.onReconnectFailed((error) => {
  console.error(error);
});
```

---

# onDeviceId

读取到设备编号后触发。

```ts
client.onDeviceId((deviceId) => {
  console.log(deviceId);
});
```

回调参数为字符串。

---

# onLog

SDK 业务日志回调。

```ts
client.onLog((message) => {
  console.log(message);
});
```

日志只描述业务动作和连接状态。

---

# onError

错误事件回调。

```ts
client.onError((error) => {
  console.error(error.code, error.message);
});
```

## 回调参数

```ts
{
  code: PenErrorCode;
  message: string;
}
```

---

# ECharts 实时曲线示例

稳定和不稳定数据属于同一条实时数据流，都应绘制。
不要在每次 `onRealtimeData` 回调中立即调用 `chart.setOption()`。下面的示例完整接收数据，但每 `50ms` 最多刷新一次图表，并只展示最近 `100` 个点：

```ts
const MAX_POINTS = 100;
const FLUSH_INTERVAL_MS = 50;
const values: number[] = [];
const pendingValues: number[] = [];
let flushTimer: number | null = null;

function flushChart() {
  flushTimer = null;
  values.push(...pendingValues.splice(0));

  if (values.length > MAX_POINTS) {
    values.splice(0, values.length - MAX_POINTS);
  }

  chart.setOption({
    series: [
      {
        name: '实时脉搏',
        type: 'line',
        showSymbol: false,
        animation: false,
        data: values,
      },
    ],
  });
}

client.onRealtimeData((data) => {
  pendingValues.push(data.pulseValue);

  if (flushTimer === null) {
    flushTimer = window.setTimeout(flushChart, FLUSH_INTERVAL_MS);
  }
});
```

`stable` 字段仅用于判断当前数据是否属于有效稳定采集，不应作为是否绘图的条件。

---

# 高频数据页面性能建议

SDK 会在内部完成数据采集和脉象分析。页面节流只应用于可视化更新，不会影响完成事件返回的业务结果。

推荐页面采用以下策略：

- 实时曲线：缓存采样值，每 `50ms` 左右批量刷新一次，约 `20 FPS`
- 采集进度：只保留最新进度，每 `100ms` 左右更新一次 DOM
- 曲线长度：仅展示最近 `100` 个点，完整采集结果以事件数据为准
- 页面日志：使用固定长度队列，例如最多保留最近 `300` 条
- 断开、清空或重连失败时：取消待执行的刷新定时器并清空待处理队列

避免以下写法：

```ts
client.onRealtimeData((data) => {
  chart.setOption({ series: [{ data: [data.pulseValue] }] });
});

client.onLog((message) => {
  logElement.textContent += `${message}\n`;
});
```

逐条刷新图表会造成频繁重绘；不断使用 `textContent +=` 会随着日志增长反复复制整个文本，页面运行时间越长，更新成本越高。

仓库中的 `test.html` 已采用上述批量刷新策略：

- 图表每 `50ms` 批量刷新
- 进度每 `100ms` 最多刷新一次
- 日志批量写入并最多保留 `300` 条
- SDK 在内部完整处理业务数据，页面刷新节流不会影响采集结果

---

# 导出成员

```ts
export {
  PulseCollectionPenClient,
  PulsePenAnalyzer,
  pulsePenAnalyzer,
  PEN_DEFAULT_OPTIONS,
  checkBluetoothEnv,
};

export type {
  PulseCollectionPenOptions,
  PenBluetoothDevice,
  PenCommandResult,
  PenSnapshot,
  PenRealtimeData,
  PenCollectionProgress,
  PenPressureCompletedEvent,
  PenCollectionCompletedEvent,
  PenProcessedPulseRecord,
  PenCollectionInvalidEvent,
  PenPulseAnalysisInput,
  PenPulseAnalysisReport,
  PenErrorEvent,
  PenEventMap,
};
```
