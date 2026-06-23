# @mzy-devices-link/pulse-collection

基于 `Web Serial API` 的脉象采集浏览器 SDK。

SDK 提供：

- 设备连接管理
- 指令发送
- 实时脉象数据解析
- 自动寻脉
- 压力采集记录
- 自动整理采集结果
- 基础脉象分析能力

适用于浏览器环境下的脉象设备接入与实时数据采集场景。

---

# 安装与引用

SDK 通过 `window` 全局对象挂载：

```ts
window.PulseCollectionClient;
```

---

# 快速开始

```ts
const client = new PulseCollectionClient();

client.onMeasurement((data) => {
  console.log('实时采集数据', data);
});

client.onCollectionCompleted((result) => {
  console.log('本轮采集记录', result.records);
  console.log('脉象分析结果', result.analysis);
});

// 选择串口
await client.requestPort();

// 打开设备
await client.open();

// 开始采集
// mode: 0=标准模式
// side: 1=左手
await client.start(0, 1);
```

---

# 运行环境要求

- 浏览器需支持 `Web Serial API`
- 推荐使用 Chrome / Edge 最新版本
- 页面必须运行在：
  - `HTTPS`
  - `localhost`

- 串口授权必须由用户手动触发（浏览器安全限制）
- SDK 仅负责数据采集与事件分发，不包含 UI 绘制能力

---

# 初始化参数

```ts
const client = new PulseCollectionClient(options);
```

## options

| 参数     | 类型   | 默认值 | 说明       |
| -------- | ------ | ------ | ---------- |
| baudRate | number | 115200 | 串口波特率 |

---

# 核心 API

## 设备连接

```ts
await client.requestPort(filters?);
```

选择串口设备。

---

```ts
await client.open(port?, options?);
```

打开串口连接。

---

```ts
await client.close();
```

关闭串口连接。

---

```ts
const opened = client.isOpen;
```

获取设备连接状态。

| 返回值 | 说明   |
| ------ | ------ |
| true   | 已连接 |
| false  | 未连接 |

---

# 采集控制

## 开始采集

```ts
await client.start(mode, side);
```

### 参数说明

| 参数 | 类型   | 说明                   |
| ---- | ------ | ---------------------- |
| mode | number | 0=标准模式，1=快速模式 |
| side | number | 1=左手，2=右手         |

### 示例

```ts
await client.start(0, 1); // 标准模式 - 左手
await client.start(1, 2); // 快速模式 - 右手
```

---

## 停止采集

```ts
await client.stop();
```

手动结束当前采集流程，并清空本轮过程缓存。

---

## 清空缓存

```ts
client.clear();
```

清空：

- 当前采集缓存
- 历史缓存

建议在数据保存完成后调用。

---

# 设备控制 API

## 设置左右手模式

```ts
await client.setHandModel(side);
```

| side | 说明 |
| ---- | ---- |
| 1    | 左手 |
| 2    | 右手 |

---

## 手动寻脉

```ts
await client.enterHandSearch();
```

进入手动寻脉模式。

---

## 探头控制

```ts
await client.setMoveUp(); // 上移
await client.setMoveDown(); // 下移
await client.setMoveForward(); // 前伸
await client.setMoveBack(); // 回缩
```

---

## 允许手动寻脉

```ts
await client.allowHandSearch();
```

当自动寻脉失败后("device_failure_pulse_search")，可调用此方法进入人工辅助寻脉流程。

## 放弃采集

```ts
await client.rejectHandSearch();
```

询问用户是否进入手动寻脉时，可调用此方法结束寻脉流程。

---

# 设备信息 API

## 获取设备状态

```ts
await client.getDeviceStatus();
```

返回结果通过：

```ts
client.onDeviceStatus();
```

事件回调。

---

## 读取设备编号

```ts
await client.readDeviceNo();
```

返回结果通过：

```ts
client.onDeviceNo();
```

事件回调。

---

# API 返回格式

所有异步 API 均返回统一结构：

```ts
{
  code: number;
  message: string;
}
```

## code 说明

| code | 说明 |
| ---- | ---- |
| 0    | 成功 |
| -1   | 失败 |

---

# 自动完成机制

SDK 会自动整理采集结果，并在采集完成后触发：

```ts
collection - completed;
```

事件。

## 采集数量规则

### 快速模式

期望采集：

```txt
9 条唯一脉象记录
```

### 标准模式

期望采集：

```txt
18 条唯一脉象记录
```

采集完成后：

- 自动清理本轮缓存
- 避免旧数据混入下一轮
- 历史快照仍可通过 `getSnapshot()` 获取

---

# 事件系统

## 链式事件注册

```ts
client
  .onMeasurement((data) => console.log(data))
  .onPulseRecord((record) => console.log(record))
  .onPulseGroup((group) => console.log(group))
  .onCollectionCompleted((result) => console.log(result))
  .onDeviceNo((deviceNo) => console.log(deviceNo))
  .onDeviceStatus((flag) => console.log(flag))
  .onStatusChange((status) => console.log(status))
  .onLog((message) => console.log(message))
  .onError((message) => console.error(message));
```

---

## 通用事件注册

```ts
client.on(eventName, callback);
```

### 支持事件

| 事件名               | 对应方法              |
| -------------------- | --------------------- |
| measurement          | onMeasurement         |
| pulse-record         | onPulseRecord         |
| pulse-group          | onPulseGroup          |
| collection-completed | onCollectionCompleted |
| device-no            | onDeviceNo            |
| device-status        | onDeviceStatus        |
| status-change        | onStatusChange        |
| log                  | onLog                 |
| error-message        | onError               |

---

# 回调事件说明

---

# onMeasurement

实时采集测量数据回调。

```ts
client.onMeasurement((data) => {});
```

## 回调参数

```ts
{
  measurement: {
    cadval: number; // 寸
    gadval: number; // 关
    chadval: number; // 尺
  }

  tagName: string;
}
```

---

# onPulseRecord

单条脉象记录回调。

```ts
client.onPulseRecord((data) => {});
```

## 回调参数

```ts
{
  side: number;
  tagName: string;

  position: number;
  positionName: string;

  type: number;

  pretype: number;
  pretypeName: string;

  pressure: number;

  rawAds: number[];
  rawPulse: number[];

  checkCount: number;

  timestamp: string;
}
```

## 字段说明

| 字段       | 说明             |
| ---------- | ---------------- |
| side       | 1=左手，2=右手   |
| position   | 1=寸，2=关，3=尺 |
| pretype    | 1=浮，3=中，5=沉 |
| rawAds     | 原始脉象数据     |
| rawPulse   | 原始压力数据     |
| checkCount | 数据长度         |
| timestamp  | ISO 时间字符串   |
| type       | 1：总按，2：分按 |

---

# onPulseGroup

一组脉象数据回调。

通常包含：

```txt
3 条脉象记录
```

分别对应：

- 寸
- 关
- 尺

```ts
client.onPulseGroup((data) => {});
```

## 回调参数

```ts
{
  records: PulseRecord[];
  tagName: string;
}
```

---

# onCollectionCompleted

本轮采集完成回调。

```ts
client.onCollectionCompleted((data) => {});
```

## 回调参数

```ts
{
  mode: number;
  side: number;

  analysis: {
    position: AnalysisItem;
    rate: AnalysisItem;
    strength: AnalysisItem;
    tension: AnalysisItem;
    smoothness: AnalysisItem;

    kValue: number;
  };

  records: CollectionRecord[];

  tagName: string;

  timestamp: string;
}
```

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

---

## CollectionRecord

```ts
{
  motorData: number[];// 建议存储 脉复仪运行时必要数据

  oneAds: number[];// 建议存储 脉复仪运行时必要数据
  oneAdsJsn: object;

  position: number;// 建议存储 脉复仪运行时必要数据
  positionName: string;

  pressure: number;

  pretype: number;// 建议存储 脉复仪运行时必要数据
  pretypeName: string;

  rawAds: number[];// 建议存储 脉复仪运行时必要数据
  rawPulse: number[];// 建议存储 脉复仪运行时必要数据

  side: number; // 建议存储 脉复仪运行时必要数据

  tagName: string;

  timestamp: string;

  type: number; // 建议存储 脉复仪运行时必要数据

  checkCount: number;
}
```

---

# onDeviceNo

设备编号回调。

```ts
client.onDeviceNo((data) => {});
```

## 回调参数

```ts
'XXXXXXXXXXXXXXX';
```

---

# onDeviceStatus

设备运行状态回调。

```ts
client.onDeviceStatus((data) => {});
```

## 回调参数

```ts
true;
```

## 状态说明

| 值    | 说明         |
| ----- | ------------ |
| true  | 设备运行中   |
| false | 等待接收指令 |

---

# onStatusChange

设备状态变更回调。

```ts
client.onStatusChange((status) => {});
```

## 回调参数

```ts
{
  tagName: string;
  message: string;

  pretype?: number;
}
```

---

## 常见状态

| tagName                       | 说明         |
| ----------------------------- | ------------ |
| device_start_pulse_search     | 开始寻脉     |
| device_stop_pulse_search      | 结束寻脉     |
| device_reset_complete         | 复位完成     |
| device_overall_pressure_start | 开始总按压力 |
| device_overall_pressure_end   | 结束总按压力 |
| device_cun_pressure_start     | 开始寸按压力 |
| device_cun_pressure_end       | 结束寸按压力 |
| device_guan_pressure_start    | 开始关按压力 |
| device_guan_pressure_end      | 结束关按压力 |
| device_chi_pressure_start     | 开始尺按压力 |
| device_chi_pressure_end       | 结束尺按压力 |
| device_failure_pulse_search   | 自动寻脉失败 |

---

## pretype 说明

当状态为：

- `*_pressure_start`

时会附带：

```ts
pretype;
```

字段。

| pretype | 压力类型 |
| ------- | -------- |
| 1       | 浮       |
| 3       | 中       |
| 5       | 沉       |

---

## 自动寻脉失败处理

当收到：

```txt
device_failure_pulse_search
```

时：

- 设备会进入 50 秒等待状态
- 可询问用户是否进入手动寻脉

### 允许手动寻脉

```ts
await client.allowHandSearch();
```

之后可通过：

```ts
client.setMoveUp();
client.setMoveDown();
client.setMoveForward();
client.setMoveBack();
```

控制探头。

完成后重新调用：

```ts
client.start();
```

继续采集。

---

## 放弃采集

```ts
await client.rejectHandSearch();
```

---

# onLog

SDK 日志回调。

```ts
client.onLog((message) => {});
```

## 回调参数

```ts
string;
```

---

# onError

设备或 SDK 错误回调。

```ts
client.onError((message) => {});
```

## 回调参数

```ts
string;
```

---

# 导出成员

```ts
export { PulseCollectionClient, COLLECTION_DEFAULT_OPTIONS };

export type * from './types';
```
