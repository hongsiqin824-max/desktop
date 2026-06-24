// 问诊流程状态机数据定义

import type { StepIdType, IFlowStep, IAnalysisData, ITonguePulseCodes } from '@/types/consultation'

// 拒答/未回答/不确定时的兜底跳转步骤
export const REFUSAL_FALLBACK: Record<string, StepIdType> = {
  initial: 'branch_a_free',
  branch_a_free: 'end_a_other',
  end_a_other: 'initial',
  branch_b_symptom: 'branch_b_clarify',
  branch_b_clarify: 'end_hospital',
  branch_c_condition: 'branch_c_clarify',
  branch_c_clarify: 'end_hospital',
  severity: 'end_moderate',
  analysis_review: 'analysis_fail',
  analysis_abnormal: 'analysis_hospital',
  analysis_fail: 'analysis_hospital',
  detail_transition: 'detail_question',
  detail_question: 'detail_summary',
  detail_summary: 'detail_done',
  detail_done: 'self_feature_intro',
  self_feature_intro: 'self_feature_question',
  self_feature_question: 'self_feature_summary',
  self_feature_summary: 'self_feature_done',
  self_feature_done: 'syndrome_output',
}

/**
 * 根据舌脉文本描述计算代码编号
 * 参考文档：关于舌和脉的症状定义及计算.docx
 */
function computeTonguePulseCodes(
  tongueCoating: string,
  tongueCoatingColor: string,  // 新增：舌苔颜色
  tongueColor: string,
  tongueSize: string,
  tongueBottom: string,
  pulseType: string,
  pulseRate: number
): ITonguePulseCodes {
  const codes: ITonguePulseCodes = {
    // 脉象代码
    LMB1: pulseRate,
    MBJD: 0,
    LXMB: 0,
    LHMB: 0,
    LSMB: 0,
    LWMB: 0,
    // 舌形代码
    LSZ1: 0,
    LSZ2: 0,
    LSZ3: 0,
    LSZ4: 0,
    LSZ5: 0,
    // 舌质颜色代码
    LSZ6: 0,
    LSZ7: 0,
    LSZ8: 0,
    LSZ9: 0,
    LSZ10: 0,
    // 舌苔形态代码
    LSZ11: 0,
    LSZ12: 0,
    LSZ13: 0,
    LSZ14: 0,
    LSZ15: 0,
    LSZ16: 0,
    // 舌苔颜色代码
    LSZ17: 0,
    LSZ18: 0,
    LSZ19: 0,
    // 舌下代码
    LSZ20: 0,
  }

  // 脉象映射
  if (pulseType === '弦脉') codes.LXMB = 1
  else if (pulseType === '滑脉') codes.LHMB = 1
  else if (pulseType === '涩脉') codes.LSMB = 1
  else if (pulseType === '无力脉') codes.LWMB = 1

  // 舌质颜色映射
  if (tongueColor === '淡白') codes.LSZ6 = 1
  else if (tongueColor === '淡红') codes.LSZ7 = 1
  else if (tongueColor === '红' || tongueColor === '暗红') codes.LSZ8 = 1
  else if (tongueColor === '绛') codes.LSZ9 = 1
  else if (tongueColor === '紫') codes.LSZ10 = 1

  // 舌形映射
  if (tongueSize.includes('齿痕')) {
    codes.LSZ1 = 1
    codes.LSZ2 = 1
  } else if (tongueSize === '胖大') {
    codes.LSZ2 = 1
  } else if (tongueSize === '瘦薄') {
    codes.LSZ3 = 1
  }

  // 舌苔形态映射
  if (tongueCoating === '厚苔') codes.LSZ11 = 1
  else if (tongueCoating === '薄苔') codes.LSZ12 = 1
  else if (tongueCoating === '腻苔') codes.LSZ13 = 1
  else if (tongueCoating === '苔腐') codes.LSZ14 = 1
  else if (tongueCoating === '苔滑') codes.LSZ15 = 1
  else if (tongueCoating === '剥苔') codes.LSZ16 = 1

  // 舌苔颜色映射
  if (tongueCoatingColor === '白') codes.LSZ17 = 1
  else if (tongueCoatingColor === '浅黄') codes.LSZ18 = 1
  else if (tongueCoatingColor === '深黄') codes.LSZ19 = 1

  // 舌下状态映射
  if (tongueBottom === '青紫') codes.LSZ20 = 1

  return codes
}

// 模拟舌脉分析数据（按主症映射）
export const MOCK_ANALYSIS: Record<string, IAnalysisData> = {
  '感冒': {
    tongueCoating: '薄苔', tongueCoatingColor: '白', tongueColor: '淡红', tongueSize: '正常', tongueBottom: '正常',
    pulseType: '浮脉', pulseRate: 72, isAbnormal: false,
    codes: computeTonguePulseCodes('薄苔', '白', '淡红', '正常', '正常', '浮脉', 72)
  },
  '头痛': {
    tongueCoating: '薄苔', tongueCoatingColor: '白', tongueColor: '红', tongueSize: '正常', tongueBottom: '正常',
    pulseType: '弦脉', pulseRate: 78, isAbnormal: false,
    codes: computeTonguePulseCodes('薄苔', '白', '红', '正常', '正常', '弦脉', 78)
  },
  '咳嗽': {
    tongueCoating: '腻苔', tongueCoatingColor: '白', tongueColor: '淡红', tongueSize: '正常', tongueBottom: '正常',
    pulseType: '细脉', pulseRate: 70, isAbnormal: false,
    codes: computeTonguePulseCodes('腻苔', '白', '淡红', '正常', '正常', '细脉', 70)
  },
  '慢性疲劳': {
    tongueCoating: '薄苔', tongueCoatingColor: '白', tongueColor: '淡白', tongueSize: '胖大有齿痕', tongueBottom: '青紫',
    pulseType: '无力脉', pulseRate: 58, isAbnormal: true,
    codes: computeTonguePulseCodes('薄苔', '白', '淡白', '胖大有齿痕', '青紫', '无力脉', 58)
  },
  '失眠': {
    tongueCoating: '腻苔', tongueCoatingColor: '浅黄', tongueColor: '红', tongueSize: '正常', tongueBottom: '迂曲',
    pulseType: '弦脉', pulseRate: 82, isAbnormal: false,
    codes: computeTonguePulseCodes('腻苔', '浅黄', '红', '正常', '迂曲', '弦脉', 82)
  },
  '发热': {
    tongueCoating: '薄苔', tongueCoatingColor: '浅黄', tongueColor: '红', tongueSize: '正常', tongueBottom: '正常',
    pulseType: '数脉', pulseRate: 88, isAbnormal: false,
    codes: computeTonguePulseCodes('薄苔', '浅黄', '红', '正常', '正常', '数脉', 88)
  },
  '怕冷': {
    tongueCoating: '薄苔', tongueCoatingColor: '白', tongueColor: '淡白', tongueSize: '正常', tongueBottom: '正常',
    pulseType: '迟脉', pulseRate: 56, isAbnormal: true,
    codes: computeTonguePulseCodes('薄苔', '白', '淡白', '正常', '正常', '迟脉', 56)
  },
  '血压偏高': {
    tongueCoating: '腻苔', tongueCoatingColor: '浅黄', tongueColor: '暗红', tongueSize: '正常', tongueBottom: '迂曲',
    pulseType: '弦脉', pulseRate: 80, isAbnormal: false,
    codes: computeTonguePulseCodes('腻苔', '浅黄', '暗红', '正常', '迂曲', '弦脉', 80)
  },
  '腹型肥胖': {
    tongueCoating: '厚苔', tongueCoatingColor: '白', tongueColor: '淡红', tongueSize: '胖大', tongueBottom: '正常',
    pulseType: '沉脉', pulseRate: 68, isAbnormal: false,
    codes: computeTonguePulseCodes('厚苔', '白', '淡红', '胖大', '正常', '沉脉', 68)
  },
  '脂肪肝': {
    tongueCoating: '腻苔', tongueCoatingColor: '深黄', tongueColor: '暗红', tongueSize: '正常', tongueBottom: '粗张',
    pulseType: '弦脉', pulseRate: 76, isAbnormal: false,
    codes: computeTonguePulseCodes('腻苔', '深黄', '暗红', '正常', '粗张', '弦脉', 76)
  },
  '肝郁气滞': {
    tongueCoating: '薄苔', tongueCoatingColor: '白', tongueColor: '暗红', tongueSize: '正常', tongueBottom: '迂曲',
    pulseType: '弦脉', pulseRate: 74, isAbnormal: false,
    codes: computeTonguePulseCodes('薄苔', '白', '暗红', '正常', '迂曲', '弦脉', 74)
  },
  '焦虑': {
    tongueCoating: '薄苔', tongueCoatingColor: '浅黄', tongueColor: '红', tongueSize: '正常', tongueBottom: '正常',
    pulseType: '弦脉', pulseRate: 84, isAbnormal: false,
    codes: computeTonguePulseCodes('薄苔', '浅黄', '红', '正常', '正常', '弦脉', 84)
  },
}

export const FLOW_STEPS: Record<StepIdType, IFlowStep> = {
  initial: {
    id: 'initial',
    doctorText: '您好，请问您是有突发不适症状，还是想调理亚健康状态？',
    options: [
      { label: '都不是', nextStep: 'branch_a_free' },
      { label: '突发不适', nextStep: 'branch_b_symptom' },
      { label: '调理亚健康', nextStep: 'branch_c_condition' },
    ],
    isFreeInput: false,
  },

  // ── 分支 A：都不是 ──────────────────────────────────────────────────
  branch_a_free: {
    id: 'branch_a_free',
    doctorText: '好的，如果您有其他需求，可以告诉我～',
    options: [],
    isFreeInput: true,
  },
  end_a_major: {
    id: 'end_a_major',
    doctorText: '咱们这里只是调理，不治病，若情况紧急，请及时就医或拨打120，祝您早日康复！',
    isEnd: true,
  },
  end_a_product: {
    id: 'end_a_product',
    doctorText: '关于产品方面的问题，可以联系我们的客服了解茶饮、肠道调理等相关产品，希望能帮到您！',
    isEnd: true,
  },
  end_a_other: {
    id: 'end_a_other',
    doctorText: '我们目前仅提供中医辨证调理服务，很抱歉不能满足您的需求。如果您确实有调理方面的需求，可以重新开始问诊。',
    isEnd: false,
    isFreeInput: true,
    options: [
      { label: '我想重新问诊', nextStep: 'initial' },
      { label: '确实不需要', nextStep: 'end_a_other_final' },
    ],
  },
  end_a_other_final: {
    id: 'end_a_other_final',
    doctorText: '好的，感谢您的信任，如有调理方面的需求，欢迎随时咨询！祝您健康！',
    isEnd: true,
  },
  end_unsupported_symptom: {
    id: 'end_unsupported_symptom',
    doctorText: '不好意思，咱们目前没有针对该症状的调理问诊呢，请理解。',
    isEnd: true,
  },

  // ── 分支 B：突发不适 ─────────────────────────────────────────────────
  branch_b_symptom: {
    id: 'branch_b_symptom',
    doctorText: '请问您具体是哪种突发不适？',
    options: [
      { label: '感冒', nextStep: 'severity', payload: '感冒' },
      { label: '头痛', nextStep: 'severity', payload: '头痛' },
      { label: '咳嗽', nextStep: 'severity', payload: '咳嗽' },
    ],
    isFreeInput: true,
  },
  branch_b_clarify: {
    id: 'branch_b_clarify',
    doctorText: '方便告诉我您的具体不适表现吗？例如头痛、发热、怕冷、流鼻涕等？',
    options: [],
    isFreeInput: true,
  },

  // ── 分支 C：调理亚健康 ───────────────────────────────────────────────
  branch_c_condition: {
    id: 'branch_c_condition',
    doctorText: '请问您亚健康具体有哪种表现？',
    options: [
      { label: '慢性疲劳', nextStep: 'severity', payload: '慢性疲劳' },
      { label: '失眠', nextStep: 'severity', payload: '失眠' },
    ],
    isFreeInput: true,
  },
  branch_c_clarify: {
    id: 'branch_c_clarify',
    doctorText: '方便描述一下您的具体状态吗？例如乏力、血压偏高、肝郁气滞等？',
    options: [],
    isFreeInput: true,
  },

  // ── 程度判断（通用） ─────────────────────────────────────────────────
  severity: {
    id: 'severity',
    doctorText: '请问您的症状严重吗？',
    options: [
      { label: '很严重', nextStep: 'end_severe', semanticDesc: '用户表达症状非常严重、难以忍受、很厉害、特别难受，核心是"程度严重"' },
      { label: '较重', nextStep: 'end_moderate', semanticDesc: '用户表达症状比较明显、有些难受、不太舒服，核心是"程度中等偏重"' },
      { label: '较轻', nextStep: 'end_moderate', semanticDesc: '用户表达症状轻微、不太严重、还好、还行、一般般，核心是"程度轻微"' },
    ],
    isFreeInput: true,
  },
  end_severe: {
    id: 'end_severe',
    doctorText: '您的症状较为严重，我们的中医调理属于辅助性质，不能替代医疗，建议您先及时就医。若调理有需求，我们随时在！',
    isEnd: true,
  },
  end_moderate: {
    id: 'end_moderate',
    doctorText: '好的，接下来帮您采集舌象和脉象信息，以便更准确地辨证。',
    isEnd: false,
    autoAdvance: { nextStep: 'tongue_top_intro', delay: 1000 },
  },
  end_hospital: {
    id: 'end_hospital',
    doctorText: '根据您的描述，建议您先到医院进行专业诊断。我们的中医调理服务侧重亚健康和调理方向，若有需要欢迎随时回来！',
    isEnd: true,
  },
  end_clarify_hospital: {
    id: 'end_clarify_hospital',
    doctorText: '您的情况我暂时无法准确匹配，建议先到专业医院进行检查。若需要调理或有其他问题，欢迎随时咨询！',
    isEnd: true,
  },

  // ── 舌象采集：舌面 ─────────────────────────────────────────
  // autoAdvance 已移除：由 useTonguePulseCapture composable 控制流程推进
  tongue_top_intro: {
    id: 'tongue_top_intro',
    doctorText: '请对着设备自然伸出舌头，保持放松，我来采集舌面照片。',
    captureType: 'tongue_top',
  },

  // ── 舌象采集：舌下 ─────────────────────────────────────────
  tongue_bottom_intro: {
    id: 'tongue_bottom_intro',
    doctorText: '舌面已采集。请将舌头向上卷起，露出舌下脉络，我再看看。',
    captureType: 'tongue_bottom',
  },

  // ── 脉象采集 ──────────────────────────────────────────────
  pulse_intro: {
    id: 'pulse_intro',
    doctorText: '舌象采集完成。请将手腕贴近脉诊设备，开始测量脉搏。',
    captureType: 'pulse',
  },

  pulse_done: {
    id: 'pulse_done',
    doctorText: '脉象已采集完毕，正在为您分析舌脉信息。',
    autoAdvance: { nextStep: 'analysis_review', delay: 1000 },
  },

  // ── 系统分析结果与确认 ───────────────────────────────────
  analysis_review: {
    id: 'analysis_review',
    doctorText: '',
    options: [
      { label: '确认相符', nextStep: 'analysis_normal' },
      { label: '采集有问题', nextStep: 'analysis_fail' },
    ],
    isFreeInput: true,
  },

  // 无明显异常 → 进入详细辨证
  analysis_normal: {
    id: 'analysis_normal',
    doctorText: '',
    autoAdvance: { nextStep: 'detail_transition', delay: 200 },
  },

// 明显异常 → 温馨提示
  analysis_abnormal: {
    id: 'analysis_abnormal',
    doctorText: '从您目前的舌脉来看，存在一些比较明显的气血运行方面的特征。咱们这里主要是通过药食同源的产品进行日常调理，如果您目前不适感较强，建议优先去医院进一步检查。如果确认仍希望通过调理改善，请告诉我。',
    options: [
      { label: '继续调理', nextStep: 'analysis_continue' },
      { label: '我想先去医院', nextStep: 'analysis_hospital' },
    ],
  },

  // 确认继续调理
  analysis_continue: {
    id: 'analysis_continue',
    doctorText: '好的，我们继续为您辨证调理。',
    autoAdvance: { nextStep: 'detail_transition', delay: 800 },
  },

  // 采集失败 → 引导重新采集
  analysis_fail: {
    id: 'analysis_fail',
    doctorText: '采集可能受到光线或设备影响，请确保光线充足后重新采集，可以吗？',
    options: [
      { label: '重新采集', nextStep: 'tongue_top_intro' },
      { label: '暂时不采集', nextStep: 'analysis_hospital' },
    ],
  },

  // 建议线下就诊
  analysis_hospital: {
    id: 'analysis_hospital',
    doctorText: '好的，建议您前往线下中医馆进行专业舌脉诊断，若有需要欢迎随时回来咨询。',
    isEnd: true,
  },

  // ── 过渡至详细问诊 ──────────────────────────────────────
  detail_transition: {
    id: 'detail_transition',
    doctorText: '',
    isEnd: false,
    autoAdvance: { nextStep: 'detail_question', delay: 800 },
  },

  // ── 详细问诊：动态问题步骤 ──────────────────────────────
  detail_question: {
    id: 'detail_question',
    doctorText: '',
    options: [],
    isFreeInput: true,
  },

  // ── 详细问诊结果汇总 ───────────────────────────────────
  detail_summary: {
    id: 'detail_summary',
    doctorText: '',
    options: [
      { label: '确认提交', nextStep: 'detail_done' },
      { label: '重新填写', nextStep: 'detail_question' },
    ],
  },

  // ── 详细问诊完成 → 过渡至自选特征 ──────────────────────────────
  detail_done: {
    id: 'detail_done',
    doctorText: '感谢您的耐心配合！前面的问诊信息已经全部记录好了。',
    autoAdvance: { nextStep: 'self_feature_intro', delay: 1000 },
  },

  // ── 自选特征：开场引导 ──────────────────────────────────────
  self_feature_intro: {
    id: 'self_feature_intro',
    doctorText: '',
    autoAdvance: { nextStep: 'self_feature_question', delay: 1000 },
  },

  // ── 自选特征：动态问题步骤 ──────────────────────────────
  self_feature_question: {
    id: 'self_feature_question',
    doctorText: '',
    options: [],
    isFreeInput: true,
  },

  // ── 自选特征结果汇总 ───────────────────────────────────────
  self_feature_summary: {
    id: 'self_feature_summary',
    doctorText: '',
    options: [
      { label: '确认提交', nextStep: 'self_feature_done' },
      { label: '重新选择', nextStep: 'self_feature_question' },
    ],
  },

  // ── 自选特征完成 ─────────────────────────────────────────────
  self_feature_done: {
    id: 'self_feature_done',
    doctorText: '好的，所有信息已确认完成，接下来系统将根据您的整体情况进行辨证分析。',
    autoAdvance: { nextStep: 'syndrome_output', delay: 1500 },
  },

  // ── 证型输出：辨证分析结果展示 ──────────────────────────────
  syndrome_output: {
    id: 'syndrome_output',
    doctorText: '',
    isEnd: true,
  },
}
