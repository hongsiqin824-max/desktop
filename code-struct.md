# Vue 3 项目开发规范（优化版）

## 一、强制规范
- **语言要求**：所有技术文档、需求沟通、代码注释、提交信息等均使用中文；思考过程、任务清单等内部产出物也需以中文呈现。
- **应用语言要求**：生成的应用界面、提示文案等默认使用简体中文，仅在特殊业务需求下可调整为其他语言。

## 二、文件目录与命名规范

### 2.1 页面文件规范
- **页面目录要求**：新增页面时，需在 `src/views` 下创建与页面业务域匹配的独立文件夹，示例：账单页面 → `src/views/billing`。
- **页面组件命名**：
  - 页面根组件统一使用帕斯卡命名法（PascalCase）。
  - 命名规则调整为「业务语义 + 页面类型」（替代原“强制两个单词”），核心以语义清晰为原则，示例：
    - 账单页面 → `src/views/billing/BillingView.vue`
    - 登录页面 → `src/views/login/LoginView.vue`（无需强行拼凑无意义单词）。
- **页面组件分类**：
  - **页面私有组件**（仅当前页面使用）：放在页面文件夹下的 `components` 目录，示例：账单页订单列表 → `src/views/billing/components/OrderHistory.vue`。
  - **跨页面通用组件**：禁止放在页面私有 `components` 目录，需迁移至 `src/components/business/`（业务通用组件）或 `src/components/base/`（基础原子组件），示例：全局订单列表 → `src/components/business/order/OrderHistory.vue`。

### 2.2 状态存储规范
- **存储文件位置**：页面 / 业务域相关状态文件放在 `src/stores` 目录下，按业务域命名，示例：账单相关状态 → `src/stores/billing.ts`。
- **存储拆分规则**：
  - **全局状态**（用户、权限、主题）：放在 `src/stores/global/` 目录，示例：用户状态 → `src/stores/global/user.ts`。
  - **业务模块状态**：单文件代码量超过 300 行时，拆分为 `src/stores/modules/[业务域]/` 多文件结构，示例：账单查询 / 提交状态 → `src/stores/modules/billing/query.ts`、`src/stores/modules/billing/submit.ts`。
- **类型关联要求**：状态相关的 TS 类型需与存储文件同名，放在 `src/types` 目录，示例：账单状态类型 → `src/types/billing.d.ts`。

### 2.3 类型定义规范
- **类型文件位置**：所有类型定义统一放在 `src/types` 目录，按业务域命名，示例：账单相关类型 → `src/types/billing.d.ts`。
- **类型命名规则**：
  - 接口命名前缀为 `I` + 业务语义，示例：账单列表接口 → `interface IBillingList`。
  - 类型别名使用 `[语义] + Type`，示例：账单金额类型 → `type BillingAmountType = number | string`。
  - 全局通用类型：放在 `src/types/global.d.ts`，示例：分页参数类型 → `interface IPagination`。

### 2.4 API 接口规范
- **API 目录结构**：按业务域（而非页面）划分目录，示例：账单相关接口 → `src/api/billing`。
- **API 文件命名**：
  - 核心规则：小写 + 短横线分隔（kebab-case），与对应业务域 Store 文件语义一致，示例：账单列表接口 → `src/api/billing/list.ts`。
  - 单业务域接口数量 ≤ 3 个时，可合并为 `src/api/billing/index.ts`，避免目录冗余。
- **API 编码规范**：接口函数命名使用小驼峰，前缀体现请求动作，示例：
  - 获取账单列表 → `getBillingList()`
  - 提交账单 → `submitBilling()`

## 三、样式与颜色规范

### 3.1 颜色变量规范（核心优化）
- **颜色变量分层**：所有颜色变量统一在 `src/assets/styles/variables.css` 中定义，分为三层：
  - **基础色值层**：按颜色 + 色阶命名（50-900，50 最浅、900 最深），示例：
    - 红色系 → `--color-red-50`、`--color-red-500`、`--color-red-900`
    - 绿色系 → `--color-green-100`、`--color-green-600`
  - **主题语义层**：绑定业务语义，关联基础色值，示例：
    - 主品牌色 → `--theme-primary: var(--color-green-500)`
    - 危险 / 错误色 → `--theme-danger: var(--color-red-500)`
  - **组件状态层**：绑定组件 + 状态，关联主题层，示例：
    - 主按钮背景色 → `--btn-primary-bg: var(--theme-primary)`
    - 账单金额文本色 → `--billing-amount-text: var(--theme-primary)`
- **新增颜色规则**：
  - 禁止直接新增 `--brown-4` / `--red-4` 等无意义序号，需先确认色阶语义。
  - 新增颜色需在 `variables.css` 中按 “基础层 → 主题层 → 组件层” 依次补充，禁止在组件内直接写死色值。

### 3.2 样式文件规范
- **样式文件位置**：
  - 全局通用样式 → `src/assets/styles/global.css`
  - 组件专属样式：
    - 基础组件 → `src/components/base/[组件名]/[组件名].css`
    - 业务组件 → `src/components/business/[业务域]/[组件名].css`
  - 页面专属样式 → `src/views/[页面]/styles/[页面名].css`
- **样式使用规则**：所有组件 / 页面样式必须引用全局颜色变量，禁止硬编码十六进制色值。