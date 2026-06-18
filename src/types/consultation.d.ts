// 问诊业务域类型定义
// 所有问诊相关接口和类型统一在此定义

// ── 流程状态机类型 ──────────────────────────────────────────────
export type StepIdType =
  | 'initial'
  | 'branch_a_free'
  | 'branch_b_symptom'
  | 'branch_b_clarify'
  | 'branch_c_condition'
  | 'branch_c_clarify'
  | 'severity'
  | 'end_a_major'
  | 'end_a_product'
  | 'end_a_other'
  | 'end_a_other_final'
  | 'end_severe'
  | 'end_moderate'
  | 'end_hospital'
  | 'end_clarify_hospital'
  | 'tongue_top_intro'
  | 'tongue_bottom_intro'
  | 'pulse_intro'
  | 'pulse_done'
  | 'analysis_review'
  | 'analysis_normal'
  | 'analysis_abnormal'
  | 'analysis_continue'
  | 'analysis_fail'
  | 'analysis_hospital'
  | 'detail_transition'
  | 'detail_question'
  | 'detail_summary'
  | 'detail_done'
  | 'self_feature_intro'
  | 'self_feature_question'
  | 'self_feature_summary'
  | 'self_feature_done'
  | 'syndrome_output'
  | 'end_unsupported_symptom'

export interface IChatOption {
  label: string
  nextStep: StepIdType
  payload?: string
  semanticDesc?: string
}

export interface IFlowStep {
  id: StepIdType
  doctorText: string
  options?: IChatOption[]
  isFreeInput?: boolean
  isEnd?: boolean
  autoAdvance?: {
    nextStep: StepIdType
    payload?: string
    delay: number
  }
  captureType?: 'tongue_top' | 'tongue_bottom' | 'pulse'
}

// ── 详细问诊类型 ──────────────────────────────────────────────
export interface IDetailQuestionOption {
  label: string
  taCode?: string
  semanticDesc?: string
  severityQuestion?: IDetailSeverityQuestion
  followUpQuestions?: string[]
  excludeAfter?: string[]
}

export interface IDetailSeverityQuestion {
  subjectText: string
  lighterCode: string
  heavierCode: string
  followUpQuestions?: string[]
}

export interface IDetailSeverityPending {
  subjectText: string
  lighterCode: string
  heavierCode: string
  parentLabel: string
  parentCategory: string
  isFirstQuestion: boolean
  followUpQuestions?: string[]
}

export interface IDetailQuestion {
  category: string
  doctorText: string
  options: IDetailQuestionOption[]
  isFreeInput?: boolean
}

export interface IDetailAnswer {
  taCode: string
  label: string
  category: string
  questionText?: string
}

// ── 回应规范类型 ──────────────────────────────────────────────
export type ResponseScenarioType =
  | 'O_VALID'
  | 'O_EMPTY_1'
  | 'O_EMPTY_2'
  | 'O_EMPTY_3'
  | 'O_SEMANTIC'
  | 'O_INVALID'
  | 'O_AMBIGUOUS'
  | 'O_REFUSAL'
  | 'UNCERTAIN'
  | 'D_VALID'
  | 'D_SHORT'
  | 'D_EMPTY_1'
  | 'D_EMPTY_2'
  | 'D_EMPTY_3'
  | 'D_VAGUE'
  | 'D_OFFTOPIC'
  | 'D_REFUSAL'
  | 'SEVERITY_GUARANTEE'
  | 'SEVERITY_UNMATCHED'
  | 'INITIAL_GUIDE'
  | 'ANALYSIS_CONFIRM_NORMAL'
  | 'ANALYSIS_CONFIRM_ABNORMAL'
  | 'ANALYSIS_FAIL_RETRY'
  | 'DETAIL_TRANSITION'
  | 'DETAIL_QUESTION_INTRO'
  | 'DETAIL_SUMMARY'
  | 'DETAIL_EXPLAIN'

// ── 对话记录类型 ──────────────────────────────────────────────
export type PersonaType = 'nurse' | 'doctor'

export interface IChatMessage {
  role: 'doctor' | 'nurse' | 'user'
  text: string
  type?: 'text' | 'analysis' | 'capture_success' | 'summary' | 'syndrome'
  /** 用户消息右下角已记录对勾标记 */
  confirmed?: boolean
}

// ── 自选特征类型 ──────────────────────────────────────────────
export interface ISelfFeatureSymptom {
  label: string
  brief: string
  detail: string
  semanticDesc?: string
  category: 'K' | 'X' | 'P'
  baseCode: string
  fixedTaCode?: string
}

export interface ISelfFeatureCategoryOption {
  label: string
  expandKey: string
  semanticDesc?: string
  genderCondition?: 'male' | 'female'
  ageRange?: [number, number]
}

export interface ISelfFeatureLocation {
  label: string
  zone: 'upper' | 'middle' | 'lower'
  primaryMeridians: string[]
  semanticDesc?: string
  genderCondition?: 'male' | 'female'
  ageRange?: [number, number]
}

export interface ISelfFeatureRecord {
  location: string
  locationZone: 'upper' | 'middle' | 'lower'
  symptom: string
  symptomCategory: 'K' | 'X' | 'P'
  symptomBaseCode: string
  severity: 1 | 2
  fixedTaCode?: string
  /** 经脉编号（经脉模式），如 JM1、JM2 等 */
  meridianCode?: string
  /** 经脉名称（经脉模式），如"肺经" */
  meridianName?: string
}

// ── 自选特征子步骤类型 ──────────────────────────────────────────
export type SelfFeatureSubStepType = 'meridian' | 'location' | 'nature' | 'nature_expand' | 'severity' | 'continue'

// ── 舌脉代码编号接口 ──────────────────────────────────────────
// 参考文档：关于舌和脉的症状定义及计算.docx
// 所有字段均为数值类型（0 或 1），用于后端辨证算法计算
export interface ITonguePulseCodes {
  // 脉象代码
  LMB1: number   // 脉搏次数（次/分）
  MBJD: 0 | 1    // 结代脉（0=否，1=是）
  LXMB: 0 | 1    // 弦脉（0=否，1=是）
  LHMB: 0 | 1    // 滑脉（0=否，1=是）
  LSMB: 0 | 1    // 涩脉（0=否，1=是）
  LWMB: 0 | 1    // 弱脉/无力脉（0=否，1=是）

  // 舌形代码
  LSZ1: 0 | 1    // 齿龈舌（0=否，1=是）
  LSZ2: 0 | 1    // 胖大舌（0=否，1=是）
  LSZ3: 0 | 1    // 瘦薄舌（0=否，1=是）
  LSZ4: 0 | 1    // 裂纹舌（0=否，1=是）
  LSZ5: 0 | 1    // 舌刺（0=否，1=是）

  // 舌质颜色代码
  LSZ6: 0 | 1    // 淡白舌（0=否，1=是）
  LSZ7: 0 | 1    // 淡红舌（0=否，1=是）
  LSZ8: 0 | 1    // 红舌（0=否，1=是）
  LSZ9: 0 | 1    // 绛舌（0=否，1=是）
  LSZ10: 0 | 1   // 紫舌（0=否，1=是）

  // 舌苔形态代码
  LSZ11: 0 | 1   // 苔厚（0=否，1=是）
  LSZ12: 0 | 1   // 苔薄（0=否，1=是）
  LSZ13: 0 | 1   // 苔腻（0=否，1=是）
  LSZ14: 0 | 1   // 苔腐（0=否，1=是）
  LSZ15: 0 | 1   // 苔滑（0=否，1=是）
  LSZ16: 0 | 1   // 剥苔（0=否，1=是）

  // 舌苔颜色代码
  LSZ17: 0 | 1   // 苔白（0=否，1=是）
  LSZ18: 0 | 1   // 苔浅黄（0=否，1=是）
  LSZ19: 0 | 1   // 苔深黄（0=否，1=是）

  // 舌下代码
  LSZ20: 0 | 1   // 舌下紫暗（0=否，1=是）
}

// ── 舌脉分析数据接口 ──────────────────────────────────────────
export interface IAnalysisData {
  tongueCoating: string
  tongueCoatingColor: string  // 舌苔颜色：白/浅黄/深黄
  tongueColor: string
  tongueSize: string
  tongueBottom: string
  pulseType: string
  pulseRate: number
  isAbnormal: boolean
  /** 舌脉代码编号（用于后端辨证算法） */
  codes: ITonguePulseCodes
}

// ── 语音识别类型 ──────────────────────────────────────────────
export type SpeechStatusType = 'idle' | 'listening' | 'processing' | 'error'

// ── 证型输出类型 ──────────────────────────────────────────────
export interface ISyndromeOutput {
  // 旧字段（mock 降级时使用）
  diseaseCategory?: string
  mainSymptom?: string
  mainSymptoms?: string[]
  syndromeResult?: string
  syndromeDetail?: string
  illustration?: string
  conditioningPlan?: string[]
  productRecommendation?: string[]
  // 新字段（真实 API 数据）
  isRealData?: boolean
  userInfo?: { name: string; sex: string; age: string; time: string }
  modelName?: string
  syndromeConclusion?: { key: string; val: string }[]
  recommendations?: { key: string; value: string }[]
}

// ── 重新选择快照类型 ────────────────────────────────────────────
export interface IStepSnapshot {
  stepId: StepIdType
  symptom: string
  messagesLength: number
  detailQuestionCategory: string
  detailBranch: string
  detailQuestionQueue: string[]
  detailAskedCategories: string[]
  detailAnswers: IDetailAnswer[]
  detailIsFirstQuestion: boolean
  detailSeverityPending: IDetailSeverityPending | null
  detailFailCount: number
  genderQuestionsInjected: boolean
  invalidRetryCount: number
  selfFeatureSubStep: SelfFeatureSubStepType
  selfFeatureRecords: ISelfFeatureRecord[]
  selfFeatureCurrentLocation: string
  selfFeatureCurrentLocationZone: 'upper' | 'middle' | 'lower'
  selfFeatureCurrentSymptom: string
  selfFeatureCurrentSymptomCategory: 'K' | 'X' | 'P'
  selfFeatureCurrentSymptomBaseCode: string
  selfFeatureCurrentSymptomFixedTaCode: string | undefined
  selfFeatureCurrentMeridianCode: string
  selfFeatureCurrentMeridianName: string
  selfFeatureExpandKey: string
  analysisData: IAnalysisData | null
  syndromeOutputData: ISyndromeOutput | null
}

// ── 第三方舌象 AI 分析 API 类型 ────────────────────────────────
// 服务商：脉至语 (aitongue.maizhiyu.com)
// 流程（版本2-无答题）：上传图片 → 获取分析报告

/** uploadImage 响应体 */
export interface ITongueUploadResponse {
  code: number   // 0 = 成功
  data: string   // 上传后的图片 URL
  msg: string
}

/** getReport 响应体（版本2：无答题版本，直接返回分析结果） */
export interface ITongueReportResponse {
  code: number
  data: {
    age: number
    durl: string              // 背面舌象 URL
    uurl: string              // 正面舌象 URL
    faceUrl: string           // 面象 URL
    id: number
    uuId: string
    name: string
    phone: string
    psId: number
    sex: number               // 0=女 1=男
    shese: string             // 舌色（如"淡红舌"、"红舌"、"紫舌"）
    shexing: string           // 舌型（如"胖大舌"、"瘦薄舌"、"齿龈舌"）
    taise: string             // 苔色（如"白"、"浅黄"、"深黄"）
    taixing: string           // 苔型（如"薄苔"、"厚苔"、"腻苔"）
    tizhi: string             // 体质（如"气虚质"、"阳虚质"）
    tizhiDistribution: string // 体质分布
    cutUUrl: string           // AI 裁剪后的舌体图片 URL
    analysisResults: string   // 舌象分析置信度详情（JSON 字符串）
    updateTime: string
    createTime: string
  }
  msg: string
}

// ── 脉诊仪服务类型 ──────────────────────────────────────────────
// 蓝牙脉诊设备采集原始数据 → 提交给脉诊仪服务 → 返回各脉象置信度
// 置信度为 0~1 之间的数值，> 0.6 判定为该脉象

/** 脉诊仪服务返回的脉象分析数据 */
export interface IPulseAnalysisData {
  maibo: number               // 脉搏次数（次/分钟）
  xianmai: number             // 弦脉置信度 (0~1)
  huamai: number              // 滑脉置信度 (0~1)
  semai: number               // 涩脉置信度 (0~1)
  ruomai: number              // 弱脉/无力脉置信度 (0~1)
  jiedai?: number             // 结代脉置信度 (0~1)，部分设备可能不返回
}

// ── 后端舌脉问题 API 类型 ──────────────────────────────────────
// getDigitalHumanQuestionsByModel 返回的问题 + 选项树形结构
// saveDigitalHumanTonguePulseAnswers 提交的答案也使用相同结构

/** 舌脉选项（问题中的每个可选答案，支持嵌套子选项） */
export interface ITonguePulseOption {
  koiId: string
  koiBelongQus: string
  koiParentOpid: string | null
  koiOption: string                        // 选项文本（如"胖大舌"、"苔白"）
  koiOptionCode: string                    // 选项编码（如"LSZ2"、"LSZ17"）
  koiHasChild: 0 | 1                      // 是否有子选项
  koiOptionMutualExclusion: string[]       // 互斥组标识（如["SSZC"]表示同组单选）
  koiChildsOption: ITonguePulseOption[]    // 嵌套的子选项列表
  koiIsChoose?: '0' | '1' | null          // 是否选中（提交时使用）
  // 以下字段仅在获取接口返回，提交时不需要
  koiPatternVal?: string | null
  koiPatternIndex?: string | null
  koiOptionVal?: string
  koiIndex?: string
  koiQuatoCode?: string
  koiOpIllustrate?: string
  koiCreateTime?: string
  koiAddUserid?: string
  koiUpdateTime?: string
  koiUpdateUserid?: string
  koiDialecticCount?: string | null
  koiQuatoFilePath?: string | null
}

/** 舌脉问题（包含多个选项） */
export interface ITonguePulseQuestion {
  kqiId: string
  kqiIndex: string
  kqiName: string              // 问题名称（如"舌苔颜色部分"、"舌形"、"脉搏"）
  kqiCode: string              // 问题编码（如"LSZ04"、"LSZ01"、"MB"）
  kqiIllustrate: string        // 问题说明
  kytOptions: ITonguePulseOption[]
  // 以下字段仅在获取接口返回
  kqiFormulaId?: string
  kqiFormulaStr?: string | null
  kqiQusBaseid?: string | null
  kqiWeight?: string | null
  kqiIsEnable?: string
  kqiIsEnableStr?: string | null
  kqiQueType?: string
  kqiShowFormular?: string
  kqiQueTypeStr?: string | null
  kqmName?: string | null
  kqiAddTime?: string
  kqiAddUserid?: string
  kqiAddUserName?: string | null
  kqiUpdateTime?: string
  kqiUpdateUserid?: string
  kqiQueModelid?: string
  kqiDialecticCount?: string
  lastChooseOptionIds?: string[] | null
  kqiUpdateUserName?: string | null
}

/** getDigitalHumanQuestionsByModel 响应体 */
export interface ITonguePulseQuestionsResponse {
  status: number
  msg: string
  obj: {
    answerSheetId: string
    questionSeqConfigId: string
    kqmId: string
    tongueQuestions: ITonguePulseQuestion[]
    pulseQuestions: ITonguePulseQuestion[]
  }
}

// ── 舌脉答案保存 API 类型 ──────────────────────────────────────

/** 保存答案时的单个选项（只需 koiId + koiIsChoose + koiChildsOption） */
export interface ISubmitOption {
  koiId: string
  koiIsChoose: '0' | '1'
  koiChildsOption: ISubmitOption[]
}

/** 保存答案时的单个问题（只需 kqiId + kytOptions） */
export interface ISubmitQuestion {
  kqiId: string
  kytOptions: ISubmitOption[]
}

/** saveDigitalHumanTonguePulseAnswers 请求体 */
export interface ITonguePulseSaveRequest {
  answerSheetId: string
  kqmId: string
  maibo: string                            // 脉搏次数（字符串格式）
  tongueQuestions: ISubmitQuestion[]
  pulseQuestions: ISubmitQuestion[]
}

/** saveDigitalHumanTonguePulseAnswers 响应体 */
export interface ITonguePulseSaveResponse {
  status: number
  msg: string
  obj: {
    answerSheetId: string
    answerCount: number
    tongueQuestionCount: number
    pulseQuestionCount: number
    kqmId: string
    maibo: string
  }
}