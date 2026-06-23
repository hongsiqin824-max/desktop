# @mzy-devices-link/pulse-reproduce

基于 Web Serial API 的脉象复现浏览器 SDK。

SDK 用于连接脉复仪设备，将脉象数据发送到设备进行复现，并接收设备实时返回的寸、关、尺数据。

## 引用方式

浏览器全局挂载：

```ts
window.PulseReproduceClient;
```

ES Module：

```ts
import { PulseReproduceClient } from '@mzy-devices-link/pulse-reproduce';
```

## 运行环境

- 浏览器需要支持 Web Serial API，建议使用 Chrome 或 Edge。
- 页面需要运行在 HTTPS 或 localhost。
- 串口授权必须由用户手动触发。

## 快速开始

```ts
const client = PulseReproduceClient.create();

client.on('realtime-data', (data) => {
  const { cad, gad, chad } = data;
  console.log('寸', cad, '关', gad, '尺', chad);
});

client.on('send-completed', () => {
  console.log('复现完成');
});

await client.requestPort();
await client.open();
await client.sendData(dataList, 0.8, 0);
```

## 初始化

```ts
const client = PulseReproduceClient.create(options);
```

### options

| 参数       | 类型   | 默认值 | 说明       |
| ---------- | ------ | ------ | ---------- |
| baudRate   | number | 115200 | 串口波特率 |
| dataBits   | 7 \| 8 | 8      | 数据位     |
| stopBits   | 1 \| 2 | 1      | 停止位     |
| parity     | string | none   | 校验方式   |
| bufferSize | number | 255    | 缓冲区大小 |

## API

所有异步方法返回 `{ code: 0 | -1, message: string }`。

### requestPort

```ts
await client.requestPort(filters?);
```

弹出浏览器串口选择窗口，选择目标设备。

### open

```ts
await client.open(port?, options?);
```

打开已选择的串口，建立连接。连接成功后开始接收设备数据。

### close

```ts
await client.close();
```

断开串口连接并释放资源。

### isOpen

```ts
client.isOpen;
```

只读属性，表示当前是否已连接。

### stop

```ts
await client.stop();
```

停止当前复现。

### sendData

```ts
await client.sendData(dataList, coefficient, side);
```

将脉象数据发送到设备并开始复现。

| 参数        | 类型       | 默认值 | 说明                                   |
| ----------- | ---------- | ------ | -------------------------------------- |
| dataList    | number[][] | 必填   | 脉象数据，9 组或 18 组                 |
| coefficient | number     | 0.8    | 输出力度系数，范围 0.5 到 1.2          |
| side        | 0 \| 1     | 0      | 用户当前把脉手，0 表示右手，1 表示左手 |

## 事件

SDK 继承 `EventTarget`，统一通过 `client.on('xxx', handler)` 订阅事件。

### realtime-data

```ts
client.on('realtime-data', (data) => {
  const { cad, gad, chad } = data;
});
```

设备实时复现数据，只返回寸、关、尺三项：

| 字段 | 说明 |
| ---- | ---- |
| cad  | 寸   |
| gad  | 关   |
| chad | 尺   |

### left-hand-unsupported

```ts
client.on('left-hand-unsupported', () => {
  console.warn('当前设备版本不支持左手把脉');
});
```

当前选择左手把脉，但设备版本不支持左手把脉时触发，同时会触发 `error-message`。

### progress

```ts
client.on('progress', (progress) => {
  const { index } = progress;
});
```

每组数据发送完成后触发，`index` 为当前序号。

### send-completed

```ts
client.on('send-completed', () => {});
```

本轮数据发送完成后触发。

### log

```ts
client.on('log', (message) => {
  console.log(message);
});
```

SDK 运行日志。

### error-message

```ts
client.on('error-message', (message) => {
  console.error(message);
});
```

错误信息。

## 统一监听写法

```ts
client
  .on('realtime-data', (data) => {})
  .on('left-hand-unsupported', (data) => {})
  .on('log', (message) => {})
  .on('error-message', (message) => {});
```

## 与 pulse-collection 协作

典型流程：脉诊仪采集、保存脉象记录、脉复仪复现。

```ts
collectionClient.on('collection-completed', (result) => {
  save(result.records);
});

const records = load();
// 数据顺序按照"side（左右手数据）", "type（总按分按）", "position（寸关尺）", "pretype（浮中沉）" 排序，如果顺序错误会导致脉搏复现数据错误
const dataList = records.map((record) => record.motorData);
await reproduceClient.sendData(dataList, 0.8, records[0].side === 1 ? 1 : 0);
```

可直接用于复现的记录字段：

| 字段      | 说明                     |
| --------- | ------------------------ |
| motorData | 传入 `sendData` 的数据项 |
