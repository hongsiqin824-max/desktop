/** LLM 意图识别结果 */
export interface IIntentResult {
  /** 就诊意图：none=无不适、acute=突发、chronic=亚健康、null=无法识别 */
  intent: 'none' | 'acute' | 'chronic' | null
  /** 具体症状名称 */
  symptom: string | null
  /** 严重程度：severe=严重、moderate=较重、mild=较轻 */
  severity: 'severe' | 'moderate' | 'mild' | null
  /** 意图细分类型：major_disease=重大疾病、product=产品咨询、other=其他无关 */
  subType: 'major_disease' | 'product' | 'other' | null
  /** 识别置信度 0-1 */
  confidence: number
  /** 推理过程说明 */
  reasoning: string
}

/** 大模型请求消息格式 */
export interface ILlmRequestMessage {
  /** 角色：system=系统提示、user=用户输入、assistant=模型回复 */
  role: 'system' | 'user' | 'assistant'
  /** 消息内容 */
  content: string
}

/** LLM 选项分类结果 */
export interface IOptionMatchResult {
  /** 精确匹配到的选项标签（单选） */
  matchedLabel: string | null
  /** 模糊匹配时的多个候选标签 */
  matchedLabels: string[]
  /** 模糊匹配时的追问语 */
  clarificationQuestion: string | null
  /** 匹配置信度 0-1 */
  confidence: number
  /** 推理过程说明 */
  reasoning: string
}

/** 大模型调用配置选项 */
export interface ILlmCallOptions {
  /** API 基础地址 */
  baseUrl?: string
  /** API 密钥 */
  apiKey?: string
  /** 模型名称 */
  model?: string
  /** 温度参数 */
  temperature?: number
  /** 最大返回 token 数 */
  maxTokens?: number
}

/** LLM 用户信息提取结果 */
export interface IUserInfoParseResult {
  /** 姓名 */
  name: string | null
  /** 性别："男"或"女" */
  gender: '男' | '女' | null
  /** 年龄（整数） */
  age: number | null
  /** 身高（cm，整数） */
  height: number | null
  /** 体重（kg，整数） */
  weight: number | null
  /** 手机号（11位数字） */
  phone: string | null
}