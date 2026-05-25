# 中医智能问诊系统

基于 Vue 3 + TypeScript + Vite 构建的中医智能问诊对话式应用，支持 LLM 意图识别、讯飞语音输入、浏览器 TTS 语音播报。

## 功能概述

- **启动页**：品牌展示 + 加载动画
- **首页欢迎**：护士数字人语音引导
- **用户信息**：虚拟键盘填写个人信息（姓名、性别、年龄、身高、体重、手机号）
- **问诊流程**：状态机驱动的对话式问诊（主症判断 → 程度评估 → 舌脉采集 → 详细辨证 → 自选特征）
- **LLM 意图识别**：通过 DeepSeek 等国产大模型识别用户就诊意图
- **语音输入**：讯飞 WebSocket 实时语音转文字
- **语音播报**：浏览器 SpeechSynthesis 同步打字机效果朗读

## 推荐开发环境

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar)（请禁用 Vetur）

## 项目启动

```sh
npm install
```

### 开发模式（热重载）

```sh
npm run dev
```

### 生产构建

```sh
npm run build
```

### 代码检查

```sh
npm run lint
```

### 类型检查

```sh
npm run type-check
```

## 环境变量配置

复制 `.env.example` 为 `.env.local`，填写以下配置：

- `VITE_LLM_BASE_URL`：LLM API 代理地址
- `VITE_LLM_API_KEY`：LLM API 密钥
- `VITE_LLM_MODEL`：LLM 模型名称
- `VITE_XUNFEI_APPID`：讯飞语音 APP ID
- `VITE_XUNFEI_API_KEY`：讯飞语音 API Key
- `VITE_XUNFEI_API_SECRET`：讯飞语音 API Secret