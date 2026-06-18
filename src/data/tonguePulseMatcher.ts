// 舌脉自动匹配器：将 AI 分析结果 + 脉诊仪数据 → 后端问题选项的 koiIsChoose
//
// 核心逻辑：
//   1. 舌象匹配（动态）：AI 返回值 → 变体表提取特征关键词 → 与后端 API 返回的选项动态匹配
//      后端选项名由管理员在后台设定，随时可能变化，因此不写死任何选项名
//   2. 脉象匹配：脉诊仪返回的置信度(0~1) > 0.6 判定为该脉象（基于 koiOptionCode，不受选项名影响）
//   3. 无对应字段的后端问题：所有选项保持 koiIsChoose = "0"
//
// 输出：
//   1. 带 koiIsChoose 标记的问题列表（用于展示给用户确认）
//   2. 精简的提交格式（ISubmitQuestion[]）用于保存接口

import type {
  ITongueReportResponse,
  IPulseAnalysisData,
  ITonguePulseQuestion,
  ITonguePulseOption,
  ISubmitQuestion,
  ISubmitOption,
} from '@/types/consultation'
import { pulseConfidenceToCode } from '@/api/pulseAPI'

// ── 解析 AI 返回值 ──────────────────────────────────────────────
// AI 返回格式可能是 JSON 字符串：{"红舌":"描述文字"} 或 {"苔薄":"描述","苔润":"描述"}
// 需要提取所有键名作为实际值用于匹配（支持多值情况）

function parseAIValues(rawValue: string | undefined): string[] {
  if (!rawValue) return []

  // 尝试解析 JSON
  if (rawValue.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawValue)
      if (typeof parsed === 'object' && parsed !== null) {
        // 提取所有键名（AI 可能返回多个值，如 {"苔薄":"...", "苔润":"..."}）
        return Object.keys(parsed)
      }
    } catch {
      // 不是有效 JSON，继续处理
    }
  }

  // 返回原值作为单元素数组
  return [rawValue]
}

// ── 动态匹配函数 ──────────────────────────────────────────────
// 从后端 API 返回的选项中动态查找最佳匹配，不写死任何后端选项名
//
// 匹配策略（按优先级）：
//   1. 精确匹配：AI 值 === option.koiOption
//   2. 特征关键词匹配：AI 值查变体表 → 特征关键词 → 找包含该关键词的选项
//      - 多个候选时：按字符重叠度排序，相同则选名称最短的
//   若变体表无对应条目 → 不匹配（避免误匹配）

function findBestMatch(
  aiValue: string,
  backendOptions: ITonguePulseOption[],
  variantTable: Record<string, string>,
): ITonguePulseOption | null {
  if (!aiValue || backendOptions.length === 0) return null

  // 第一层：精确匹配（优先级最高，不受后端选项名变化影响）
  const exactMatch = backendOptions.find(opt => opt.koiOption === aiValue)
  if (exactMatch) return exactMatch

  // 第二层：特征关键词匹配
  // 从变体表查 AI 值（最长键优先，避免短键误匹配）
  const feature = lookupVariant(aiValue, variantTable)

  if (feature) {
    // 筛选包含特征关键词的选项
    const candidates = backendOptions.filter(opt => opt.koiOption.includes(feature))

    if (candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0]

    // 多个候选：按字符重叠度排序（高→低），相同则选名称最短的
    candidates.sort((a, b) => {
      const overlapDiff = charOverlap(aiValue, b.koiOption) - charOverlap(aiValue, a.koiOption)
      if (overlapDiff !== 0) return overlapDiff
      return a.koiOption.length - b.koiOption.length
    })
    return candidates[0]
  }

  // 变体表无对应条目 → 不匹配（避免共享"苔"/"舌"等通用字导致误匹配）
  return null
}

/** 从变体表查找特征关键词（最长键优先） */
function lookupVariant(aiValue: string, variantTable: Record<string, string>): string | null {
  const sortedKeys = Object.keys(variantTable).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (aiValue === key || aiValue.includes(key) || key.includes(aiValue)) {
      return variantTable[key]
    }
  }
  return null
}

/** 计算两个字符串的字符重叠度（共有字符数） */
function charOverlap(a: string, b: string): number {
  const setA = new Set(a.split(''))
  const setB = new Set(b.split(''))
  let count = 0
  for (const ch of setA) {
    if (setB.has(ch)) count++
  }
  return count
}

// ── AI 输入变体表 ──────────────────────────────────────────────
// 只描述 AI 可能的返回值 → 抽象特征关键词
// 不包含任何后端选项名（后端选项名由 API 动态返回）
//
// 运行时匹配流程：
//   AI 返回值 → 查此表得到特征关键词 → 在后端选项中找包含该关键词的选项

// ── 舌色变体表（shese 字段） ──────────────────────────────
// AI 返回值 → 颜色特征关键词
const TONGUE_COLOR_VARIANTS: Record<string, string> = {
  // 标准值
  '淡白舌': '淡白',
  '淡红舌': '淡红',
  '红舌': '红',
  '绛舌': '绛',
  '紫舌': '紫',
  // 无后缀
  '淡白': '淡白',
  '淡红': '淡红',
  '红': '红',
  '绛': '绛',
  '紫': '紫',
  // AI 可能返回的变体
  '暗红舌': '红',
  '暗红': '红',
  '紫暗舌': '紫',
  '紫暗': '紫',
  '鲜红舌': '红',
  '鲜红': '红',
}

// ── 舌形变体表（shexing 字段） ──────────────────────────────
// AI 返回值 → 形状特征关键词
const TONGUE_SHAPE_VARIANTS: Record<string, string> = {
  // 标准值
  '齿龈舌': '齿龈',
  '胖大舌': '胖大',
  '瘦薄舌': '瘦薄',
  '裂纹舌': '裂纹',
  '舌刺': '舌刺',
  // AI 可能返回的变体
  '齿痕舌': '齿龈',
  '瘦小舌': '瘦薄',
  '舌胖': '胖大',
  '舌瘦': '瘦薄',
  '舌裂': '裂纹',
  '舌有齿痕': '齿龈',
  '舌有刺': '舌刺',
}

// ── 苔色变体表（taise 字段） ──────────────────────────────
// AI 返回值 → 苔色特征关键词
const TONGUE_COATING_COLOR_VARIANTS: Record<string, string> = {
  // 标准值
  '苔白': '白',
  '苔浅黄': '浅黄',
  '苔深黄': '深黄',
  '苔灰': '灰',
  '苔黑': '黑',
  // AI 可能返回的变体
  '白苔': '白',
  '浅白苔': '白',
  '薄白苔': '白',
  '白': '白',
  '浅黄苔': '浅黄',
  '浅黄': '浅黄',
  '黄苔': '浅黄',
  '黄': '浅黄',
  '深黄苔': '深黄',
  '深黄': '深黄',
  '焦黄苔': '深黄',
  '灰苔': '灰',
  '灰': '灰',
  '黑苔': '黑',
  '黑': '黑',
}

// ── 苔型变体表（taixing 字段） ──────────────────────────────
// AI 返回值 → 苔型特征关键词
const TONGUE_COATING_TYPE_VARIANTS: Record<string, string> = {
  // 标准值（"苔"在前）
  '苔厚': '厚',
  '苔薄': '薄',
  '苔腻': '腻',
  '苔腐': '腐',
  '苔滑': '滑',
  '苔燥': '燥',
  '剥苔': '剥',
  // AI 可能返回的变体（"苔"在后）
  '厚苔': '厚',
  '薄苔': '薄',
  '腻苔': '腻',
  '腐苔': '腐',
  '滑苔': '滑',
  '燥苔': '燥',
  '润苔': '滑',
  '花剥苔': '剥',
  '光剥苔': '剥',
  // 简洁值
  '厚': '厚',
  '薄': '薄',
  '腻': '腻',
  '腐': '腐',
  '滑': '滑',
  '燥': '燥',
  '剥': '剥',
}

// ── AI 舌色 → 后端问题编码 ──────────────────────────────────
// 根据 AI 返回的字段名，定位到对应的后端问题 kqiCode
const AI_FIELD_TO_QKI_CODE: Record<string, string> = {
  shese: 'LSZ02',     // 舌质颜色部分
  shexing: 'LSZ01',   // 舌形
  taise: 'LSZ04',     // 舌苔颜色部分
  taixing: 'LSZ03',   // 舌苔形态部分
}

// ── 脉象选项编码 → 脉诊仪数据字段 映射 ──────────────────────────
const PULSE_CODE_TO_FIELD: Record<string, keyof IPulseAnalysisData> = {
  'LXMB': 'xianmai',   // 弦脉
  'LHMB': 'huamai',    // 滑脉
  'LSMB': 'semai',     // 涩脉
  'LWMB': 'ruomai',    // 弱脉
  'MBJD': 'jiedai',    // 结代脉
}

// ── 核心匹配函数 ──────────────────────────────────────────────

/**
 * 将 AI 舌象分析结果匹配到舌诊问题的选项上
 * @param tongueQuestions 后端舌诊问题列表
 * @param aiReport AI 分析结果
 * @returns 带 koiIsChoose 标记的问题列表（深拷贝，不修改原始数据）
 */
export function matchTongueQuestions(
  tongueQuestions: ITonguePulseQuestion[],
  aiReport: ITongueReportResponse['data'],
): ITonguePulseQuestion[] {
  // 构建 AI 字段 → 变体表 的查找表（只含输入变体，不含后端选项名）
  const fieldVariants: Record<string, Record<string, string>> = {
    shese: TONGUE_COLOR_VARIANTS,
    shexing: TONGUE_SHAPE_VARIANTS,
    taise: TONGUE_COATING_COLOR_VARIANTS,
    taixing: TONGUE_COATING_TYPE_VARIANTS,
  }

  return tongueQuestions.map(question => {
    const cloned = deepCloneQuestion(question)

    // 找到这个问题对应哪个 AI 字段
    let matchedField: string | null = null
    for (const [field, code] of Object.entries(AI_FIELD_TO_QKI_CODE)) {
      if (question.kqiCode === code) {
        matchedField = field
        break
      }
    }

    if (!matchedField || !fieldVariants[matchedField]) {
      // 这个问题没有对应的 AI 字段（如舌下部分 LSZ05）
      // 所有选项标记为未选中
      markAllUnselected(cloned)
      return cloned
    }

    // 获取 AI 返回的实际值（解析 JSON 格式，可能返回多个值）
    const aiValueRaw = (aiReport as Record<string, string>)[matchedField]
    if (!aiValueRaw) {
      // AI 没有返回这个字段的值
      markAllUnselected(cloned)
      return cloned
    }

    // 解析 AI 值（可能是 JSON 字符串如 "{\"苔薄\":\"...\",\"苔润\":\"...\"}"）
    const aiValues = parseAIValues(aiValueRaw)
    if (aiValues.length === 0) {
      markAllUnselected(cloned)
      return cloned
    }

    // 使用动态匹配，从后端返回的选项中查找最佳匹配
    const matchedOptionIds = new Set<string>()
    for (const aiValue of aiValues) {
      const matchedOption = findBestMatch(
        aiValue,
        cloned.kytOptions,
        fieldVariants[matchedField],
      )
      if (matchedOption) {
        matchedOptionIds.add(matchedOption.koiId)
        if (import.meta.env.DEV) {
          const feature = lookupVariant(aiValue, fieldVariants[matchedField])
          const optionNames = cloned.kytOptions.map(o => o.koiOption)
          console.log(
            `[动态匹配] ${question.kqiName} (${question.kqiCode}): ` +
            `AI="${aiValue}" → 关键词="${feature || '无'}" | ` +
            `后端选项: [${optionNames.join(', ')}] → 匹配: "${matchedOption.koiOption}" ✅`
          )
        }
      } else if (import.meta.env.DEV) {
        const optionNames = cloned.kytOptions.map(o => o.koiOption)
        console.warn(
          `[动态匹配] ${question.kqiName} (${question.kqiCode}): ` +
          `AI="${aiValue}" 无法匹配到后端选项 [${optionNames.join(', ')}] ❌`
        )
      }
    }

    if (matchedOptionIds.size === 0) {
      markAllUnselected(cloned)
      return cloned
    }

    // 遍历选项，标记匹配项（支持多选，通过 koiId 比较）
    for (const option of cloned.kytOptions) {
      if (matchedOptionIds.has(option.koiId)) {
        option.koiIsChoose = '1'
      } else {
        option.koiIsChoose = '0'
      }
      // 递归处理子选项（如果有）
      markChildOptionsUnselected(option)
    }

    return cloned
  })
}

/**
 * 将脉诊仪数据匹配到脉诊问题的选项上
 * @param pulseQuestions 后端脉诊问题列表
 * @param pulseData 脉诊仪返回的脉象数据
 * @returns 带 koiIsChoose 标记的问题列表
 */
export function matchPulseQuestions(
  pulseQuestions: ITonguePulseQuestion[],
  pulseData: IPulseAnalysisData,
): ITonguePulseQuestion[] {
  return pulseQuestions.map(question => {
    const cloned = deepCloneQuestion(question)

    for (const option of cloned.kytOptions) {
      const pulseField = PULSE_CODE_TO_FIELD[option.koiOptionCode]

      if (pulseField) {
        // 这个选项对应一个脉象类型
        const confidence = pulseData[pulseField]
        if (confidence != null) {
          option.koiIsChoose = pulseConfidenceToCode(confidence) ? '1' : '0'
        } else {
          option.koiIsChoose = '0'
        }
      } else {
        // 未知脉象编码，默认不选
        option.koiIsChoose = '0'
      }

      // 递归处理子选项
      markChildOptionsUnselected(option)
    }

    if (import.meta.env.DEV) {
      const selected = cloned.kytOptions
        .filter(o => o.koiIsChoose === '1')
        .map(o => o.koiOption)
      console.log(`[匹配器] ${question.kqiName}: 选中 [${selected.join(', ')}]`)
    }

    return cloned
  })
}

// ── 提交格式转换 ──────────────────────────────────────────────

/**
 * 将带 koiIsChoose 标记的完整问题列表转换为保存接口所需的精简格式
 * 只保留 koiId + koiIsChoose + koiChildsOption
 */
export function toSubmitQuestions(questions: ITonguePulseQuestion[]): ISubmitQuestion[] {
  return questions.map(q => ({
    kqiId: q.kqiId,
    kytOptions: q.kytOptions.map(opt => toSubmitOption(opt)),
  }))
}

/**
 * 递归转换单个选项为提交格式
 */
function toSubmitOption(option: ITonguePulseOption): ISubmitOption {
  return {
    koiId: option.koiId,
    koiIsChoose: (option.koiIsChoose === '1' ? '1' : '0') as '0' | '1',
    koiChildsOption: option.koiChildsOption
      ? option.koiChildsOption.map(child => toSubmitOption(child))
      : [],
  }
}

// ── 提取匹配结果的可读文本（用于展示给用户确认） ──────────────────

/**
 * 从匹配后的舌诊问题中提取可读的分析结果文本
 */
export function extractTongueResultText(questions: ITonguePulseQuestion[]): string[] {
  const results: string[] = []

  for (const question of questions) {
    const selected = question.kytOptions.filter(o => o.koiIsChoose === '1')
    if (selected.length > 0) {
      const text = selected.map(o => o.koiOption).join('、')
      results.push(`${question.kqiName}：${text}`)
    }
  }

  return results
}

/**
 * 从匹配后的脉诊问题中提取可读的分析结果文本
 */
export function extractPulseResultText(
  questions: ITonguePulseQuestion[],
  pulseData: IPulseAnalysisData,
): string[] {
  const results: string[] = []

  // 脉搏次数
  results.push(`脉搏次数：${pulseData.maibo}次/分`)

  // 选中的脉象
  for (const question of questions) {
    const selected = question.kytOptions.filter(o => o.koiIsChoose === '1')
    if (selected.length > 0) {
      const text = selected.map(o => o.koiOption).join('、')
      results.push(`脉象特征：${text}`)
    }
  }

  return results
}

// ── 工具函数 ──────────────────────────────────────────────────

/** 深拷贝问题（包括嵌套的选项和子选项） */
function deepCloneQuestion(question: ITonguePulseQuestion): ITonguePulseQuestion {
  return {
    ...question,
    kytOptions: question.kytOptions.map(opt => deepCloneOption(opt)),
  }
}

/** 深拷贝选项（递归处理子选项） */
function deepCloneOption(option: ITonguePulseOption): ITonguePulseOption {
  return {
    ...option,
    koiIsChoose: option.koiIsChoose ?? null,
    koiChildsOption: option.koiChildsOption
      ? option.koiChildsOption.map(child => deepCloneOption(child))
      : [],
  }
}

/** 将问题的所有选项标记为未选中 */
function markAllUnselected(question: ITonguePulseQuestion): void {
  for (const option of question.kytOptions) {
    option.koiIsChoose = '0'
    markChildOptionsUnselected(option)
  }
}

/** 递归将子选项标记为未选中 */
function markChildOptionsUnselected(option: ITonguePulseOption): void {
  if (option.koiChildsOption && option.koiChildsOption.length > 0) {
    for (const child of option.koiChildsOption) {
      child.koiIsChoose = '0'
      markChildOptionsUnselected(child)
    }
  }
}
