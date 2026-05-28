# 代码优化修复总结

本次修复解决了 5 个关键问题，涵盖资源泄漏、状态管理、请求控制等方面。所有修改均通过 TypeScript 类型检查。

---

## 问题 2：组件卸载资源泄漏（ConsultationView）

**问题描述**  
ConsultationView.vue 在组件卸载时只停止了 TTS，但未清理语音识别、定时器等其他资源，可能导致内存泄漏和幽灵定时器。

**修复内容**
```typescript
// 修改前
onUnmounted(() => { ttsStop() })

// 修改后
onUnmounted(() => {
  stopSpeech()        // 停止语音识别
  clearTimers()       // 清理所有定时器
  ttsStop()           // 停止 TTS
  abortLLM()          // 取消进行中的 LLM 请求
})
```

**影响范围**
- 文件：`src/views/consultation/ConsultationView.vue`
- 安全性：✅ 无负面影响，仅补充清理逻辑

---

## 问题 3：LLM 超时定时器泄漏

**问题描述**  
`useLLM` 中的 `recognizeIntent` 和 `classifyOption` 使用 `Promise.race` 实现超时控制，但当 LLM 请求先完成时，超时定时器未被清理，导致内存泄漏。

**修复内容**
```typescript
// 修改前
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error('LLM 超时')), LLM_TIMEOUT_MS)
})

// 修改后
let timeoutId: ReturnType<typeof setTimeout> = undefined!
const timeoutPromise = new Promise<never>((_, reject) => {
  timeoutId = setTimeout(() => reject(new Error('LLM 超时')), LLM_TIMEOUT_MS)
})

try {
  const raw = await Promise.race([resultPromise, timeoutPromise])
  clearTimeout(timeoutId)  // ✅ 请求成功时清理定时器
  // ...
} catch (e) {
  clearTimeout(timeoutId)  // ✅ 请求失败时也清理定时器
  // ...
}
```

**影响范围**
- 文件：`src/composables/useLLM.ts`
- 函数：`recognizeIntent`、`classifyOption`
- 安全性：✅ 不影响业务逻辑，仅防止内存泄漏

---

## 问题 4：快照缺少性别问题注入状态

**问题描述**  
`IStepSnapshot` 接口未包含 `genderQuestionsInjected` 状态，导致"重新选择"功能在某些边界场景下可能重复注入性别相关问题。

**修复内容**

1. **类型定义**（`src/types/consultation.d.ts`）
```typescript
export interface IStepSnapshot {
  // ... 其他字段
  detailFailCount: number
  genderQuestionsInjected: boolean  // ✅ 新增
  invalidRetryCount: number
  // ...
}
```

2. **暴露状态**（`src/composables/useDetailQuestion.ts`）
```typescript
return {
  // ... 其他返回值
  genderQuestionsInjected,  // ✅ 新增导出
  // ...
}
```

3. **快照保存/恢复**（`src/views/consultation/ConsultationView.vue`）
```typescript
// saveSnapshot 中
genderQuestionsInjected: detail.genderQuestionsInjected.value,

// reselectCurrentAnswer 中
detail.genderQuestionsInjected.value = snap.genderQuestionsInjected
```

**影响范围**
- 文件：3 个文件
- 安全性：✅ 防御性修复，当前流程行为不变

---

## 问题 5：LLM 请求无法取消

**问题描述**  
用户快速连续操作时（如快速点击"重新选择"），之前的 LLM 请求仍在执行，返回后可能操作已变更的步骤状态。

**修复内容**

1. **API 层支持 signal**（`src/api/llm/index.ts`）
```typescript
const res = await fetch(url, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ ... }),
  signal: options?.signal,  // ✅ 新增
})
```

2. **类型定义**（`src/types/llm.d.ts`）
```typescript
export interface ILlmCallOptions {
  // ... 其他选项
  signal?: AbortSignal  // ✅ 新增
}
```

3. **useLLM 实现 abort**
```typescript
let currentController: AbortController | null = null

const abort = () => {
  if (currentController) {
    currentController.abort()
    currentController = null
  }
}

// 每次调用前取消上一个请求
abort()
currentController = new AbortController()
const resultPromise = callLLM(messages, { signal: currentController.signal })

// 导出 abort 方法
return { isLoading, error, recognizeIntent, classifyOption, abort }
```

4. **ConsultationView 集成**
```typescript
const { isLoading, recognizeIntent, classifyOption, abort: abortLLM } = useLLM()

// 在 clearTimers 中调用
const clearTimers = () => {
  // ... 清理定时器
  abortLLM()  // ✅ 取消 LLM 请求
  ttsStop()
}

// 在 onUnmounted 中调用
onUnmounted(() => {
  stopSpeech()
  clearTimers()  // 已包含 abortLLM()
  ttsStop()
})
```

**影响范围**
- 文件：4 个文件
- 安全性：✅ 正常流程不受影响（请求已完成时 abort 是 no-op），仅在边界场景生效

---

## 额外修复：useTTS 类型错误

**问题描述**  
`speakCloud` 函数声明为 `async` 但返回类型标注为 `void`，应为 `Promise<void>`。

**修复内容**
```typescript
// 修改前
const speakCloud = async (...): void => {

// 修改后
const speakCloud = async (...): Promise<void> => {
```

---

## 修改文件清单

| 文件路径 | 修改类型 | 问题编号 |
|---------|---------|---------|
| `src/views/consultation/ConsultationView.vue` | 修改 | #2, #4, #5 |
| `src/composables/useLLM.ts` | 修改 | #3, #5 |
| `src/composables/useDetailQuestion.ts` | 修改 | #4 |
| `src/types/consultation.d.ts` | 修改 | #4 |
| `src/types/llm.d.ts` | 修改 | #5 |
| `src/api/llm/index.ts` | 修改 | #5 |
| `src/composables/useTTS.ts` | 修改 | 额外 |

---

## 验证结果

✅ TypeScript 类型检查通过（`npm run type-check`）  
✅ 无编译错误  
✅ 所有修复均经过影响分析，确认不影响正常业务流程  

---

## 后续建议

1. **问题 1（API Key 暴露）**：需要搭建后端代理，将 API Key 从前端移至后端（高优先级，部署前必须解决）
2. **问题 6（THREE.js 资源泄漏）**：在 MeridianBodyView 卸载时调用 `dispose()` 释放 GPU 资源
3. **问题 7（生产环境 console.log）**：使用环境变量控制的 logger 替代直接 console 调用
4. **问题 8（ScriptProcessorNode 废弃）**：低优先级，当前 AudioWorklet 为主路径
5. **问题 9（用户信息不持久化）**：使用 Pinia 持久化插件保存用户信息到 localStorage
