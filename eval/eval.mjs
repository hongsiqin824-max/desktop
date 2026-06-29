#!/usr/bin/env node
// LLM 选项匹配评测脚本
// 用法: node eval/eval.mjs [model] [--dry-run]
// 示例: node eval/eval.mjs qwen3.7-max

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// ── 配置 ──
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const DEFAULT_MODEL = 'qwen3.7-max'
const DELAY_MS = 400
const TIMEOUT_MS = 15000

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const modelArg = args.find(a => !a.startsWith('--')) || DEFAULT_MODEL

// ── 读取 API Key ──
let apiKey = ''
const envLocalPath = join(projectRoot, '.env.local')
if (existsSync(envLocalPath)) {
  const content = readFileSync(envLocalPath, 'utf-8')
  const match = content.match(/^VITE_LLM_API_KEY\s*=\s*(.+)$/m)
  if (match) apiKey = match[1].trim().replace(/^["']|["']$/g, '')
}
if (!apiKey) apiKey = process.env.VITE_LLM_API_KEY || ''
if (!apiKey) apiKey = process.env.DASHSCOPE_API_KEY || ''
if (!apiKey) {
  console.error('❌ 未找到 API Key。请设置环境变量 DASHSCOPE_API_KEY 或在 .env.local 中配置 VITE_LLM_API_KEY')
  process.exit(1)
}

// ── 加载测试数据 ──
const testDataPath = join(__dirname, 'test-data.json')
const testData = JSON.parse(readFileSync(testDataPath, 'utf-8'))

console.log(`
╔══════════════════════════════════════════╗
║        LLM 选项匹配评测系统 v1.0          ║
╚══════════════════════════════════════════╝

模型: ${modelArg}
API:  ${BASE_URL}
数据: ${testData.version} (${testData.cases.length} 条用例)
模式: ${dryRun ? '试运行（不调用LLM）' : '正式评测'}
`)

// ══════════════════════════════════════════════════════════════
// System Prompts（从 src/api/llm/prompt.ts 同步，修改时须同步更新）
// ══════════════════════════════════════════════════════════════

const INTENT_SYSTEM_PROMPT = `你是中医智能问诊系统的意图识别引擎。你的任务是从用户说的话中，识别就诊意图和主症，并映射到系统预定义分支。

## 系统预定义分支

intent（就诊意图）：
- "none"：用户没有身体不适，或话题与问诊完全无关
  - sub_type 进一步区分：
    - "major_disease"：提及重大疾病（癌症、肿瘤、心脏病、心梗、脑梗、糖尿病等）
    - "product"：提及产品、茶饮、购买、价格、客服等
    - "other"：其它一切与问诊无关的话题
- "acute"：突发不适，最近突然出现的身体不适症状（如最近几天突然感冒、头痛）
- "chronic"：调理亚健康，长期慢性的身体不适或想改善体质（如长期疲劳、长期失眠）

symptom（具体症状）：
- 突发不适类：感冒、头痛、咳嗽、发热、怕冷、伤风、外感、流鼻涕、鼻塞等
- 亚健康类：慢性疲劳、失眠、血压偏高、腹型肥胖、脂肪肝、肝郁气滞、焦虑等
- null：用户未提及任何具体症状

severity（严重程度）：
- "severe"：用户明确说"很严重""特别严重""受不了"等
- "moderate"：用户说"较重""比较重""难受""不舒服"等
- "mild"：用户说"较轻""轻微""一点点""不太严重"等
- null：用户完全没有提及严重程度

## 识别规则

1. 先推理用户的真实意图，再输出结果——必须先输出 reasoning 思考过程
2. 只从用户原话中提取已明确表达的信息，绝不推测用户没说的内容
3. 用户可能一次提供多种信息，尽量全部提取
4. 用户说的话可能口语化、混乱、模糊，尽力理解真实意图并映射到最接近的分支
5. 若用户明确说"没有不适""挺好的""没什么不舒服""健康""还好"等 → intent为"none"、sub_type为"other"
6. 若用户说"我想调理身体""想养生""想改善体质"但没提具体症状 → intent为"chronic"、symptom为null
7. 若用户说"说不清""不知道哪里不舒服""感觉不太对劲但说不上来"等模糊但有不适倾向的表达 → intent为null，因为这暗示用户确实有不适但无法明确描述，不应归为"none"
8. 若用户提及重大疾病（癌症、肿瘤、心脏病等）→ intent为"none"、sub_type为"major_disease"，symptom忠实提取用户提及的疾病名称
9. 若完全无法识别 → intent为null

## 典型示例

用户："我这两天感冒了，有点难受"
→ reasoning: 用户明确提到"感冒"，是最近两天发生的，属于突发不适；"有点难受"表示程度较轻
→ intent:"acute", symptom:"感冒", severity:"mild", sub_type:null, confidence:0.9

用户："最近总是睡不着，想调理一下"
→ reasoning: "总是睡不着"是长期持续的，属于亚健康调理；没提严重程度
→ intent:"chronic", symptom:"失眠", severity:null, sub_type:null, confidence:0.9

用户："我头疼得厉害，还有点怕冷"
→ reasoning: "头疼得厉害"是突发不适且程度严重；"怕冷"是感冒的伴随症状，主症应归为头痛
→ intent:"acute", symptom:"头痛", severity:"severe", sub_type:null, confidence:0.85

用户："没什么不舒服，就是想看看你们的产品"
→ reasoning: "没什么不舒服"说明没有就诊意图；"想看产品"是购买咨询
→ intent:"none", symptom:null, severity:null, sub_type:"product", confidence:0.9

用户："肚子有点大，想调理"
→ reasoning: "肚子大"是腹型肥胖的口语表达，属于长期亚健康状态；没提严重程度
→ intent:"chronic", symptom:"腹型肥胖", severity:null, sub_type:null, confidence:0.85

用户："我最近老是觉得累，有时候还头痛"
→ reasoning: "老是觉得累"是长期慢性疲劳；"有时候头痛"是伴随症状，主症应以疲劳为主
→ intent:"chronic", symptom:"慢性疲劳", severity:null, sub_type:null, confidence:0.8

## 输出格式

只返回纯JSON，不要有任何其它文字或markdown标记：
{"intent":"...","symptom":"...","severity":"...","sub_type":"...","confidence":0.0-1.0,"reasoning":"..."}`

const OPTION_MATCH_SYSTEM_PROMPT = `你是中医智能问诊系统的选项分类引擎。你的任务是从用户口语化的回答中，判断其最接近哪个系统预定义选项。

## 核心匹配原则

概念匹配优先：选项后的"(含义：...)"是概念描述，用于定义该选项的语义边界。你必须基于对选项概念的理解进行语义推理，而非仅匹配描述中列出的具体词汇。任何表达了该选项核心语义的说法都应视为匹配，即使使用了描述中未列出的表达方式。

## 识别规则

1. 先推理用户的真实意图，再输出结果——必须先输出 reasoning 思考过程
2. 只从用户原话中提取已明确表达的信息，绝不推测用户没说的内容
3. 用户说的话可能口语化、模糊，尽力理解真实意图并映射到最接近的选项
4. 如果用户的回答无法明确映射到任何选项 → matchedLabel为null、confidence为0
5. 如果用户的回答与多个选项都有部分关联 → 选最接近的那个，confidence相应降低
6. 泛化理解：用户说法不必精确匹配选项标签。例如"整体感觉有点发热""感觉偏热""身体微微热"都应理解为"单独发热"；"觉得有点冷""微微怕冷""身体有点凉"都应理解为"单独怕冷"。用语义相似度判断，而非字面匹配
7. 区分选项边界：当两个选项语义接近时，抓住用户表达中的核心区别特征。例如"看到饭就没食欲"核心是食欲缺乏（→食欲不振），而"看到食物就烦躁厌恶"核心是情绪反应（→见食而烦）

## 输出格式

只返回纯JSON，不要有任何其它文字或markdown标记：
{"matchedLabel":"...","confidence":0.0-1.0,"reasoning":"..."}`

const TCM_SYMPTOM_MATCH_SYSTEM_PROMPT = `你是中医智能问诊系统的症状分类引擎。你的任务是从用户口语化的描述中，识别其对应的中医辨证选项。

## 核心识别原则

概念匹配是第一优先级：用户说法不必精确匹配选项标签或含义描述中的具体词汇。你必须基于对选项概念的理解进行语义推理，任何表达了该选项核心语义的说法都应视为匹配。

具体规则：
1. 任何表达"冷/凉/畏寒"语义的都归入怕冷类，任何表达"热/烫/发热"语义的都归入发热类
2. 程度修饰词（有点/微微/稍微/比较/很/特别）不影响分类方向——"有点发热"和"发热"归入同一选项
3. 选项后的"(含义：...)"是概念描述，定义了该选项的语义边界，而非同义词列表。用于帮助理解该选项涵盖的概念范围，据此进行概念级泛化匹配
4. 用语义相似度判断，而非字面匹配——用户说"整体感觉有点发热"应理解为"整体怕热"
5. 综合理解：用户表达中可能包含多个信息维度，当这些信息综合起来能明确指向一个选项时，应直接精确匹配，不要触发模糊追问

## 是否类问题的识别规则

当问诊问题包含"是否""有没有""是不是"等是否类表述时：
- 用户回答"是的""有""对""嗯""确实""没错""肯定""当然""是的，有""有，是的""确实是""有啊""对啊"等肯定词 → 必须映射到肯定选项（不含"不""无""没有""否"等否定前缀的选项）
- 用户回答"不是""没有""不对""否""不""没""不是的""没有的""没感觉""不，没有""没啊""不是啊"等否定词 → 必须映射到否定选项（含"不""无""没有""否"等否定前缀的选项）
- 绝对不要将肯定词映射到含"不""无""没有"的否定选项
- 绝对不要将否定词映射到不含否定前缀的肯定选项

## 程度选项的识别规则

当可选选项为"较轻""较重"等程度选项时：
- "较轻" ≈ 用户说"不严重""轻微""一点""一点点""轻度""不太严重""还好""还行""不太厉害""不算严重""不重""轻微不舒服""不太重""轻一点""轻度不适""没那么严重""还好吧""一般""还可以"
- "较重" ≈ 用户说"比较重""挺重""有点严重""比较难受""挺难受""有点重""不是特别严重""中等""不太好""蛮严重""挺厉害""有点厉害""偏重""中度""比较明显""重一点""比较严重""蛮厉害""不算轻""还可以吧""中等程度""有点明显"

## 模糊匹配规则

### 精确匹配优先原则（最高优先级）
当用户的表达中已经包含了足够的区分信息，能够明确指向一个选项时，**必须直接精确匹配**matchedLabel，不要触发模糊追问。只有当用户仅仅提到了上位概念、完全没有提供任何区分维度的信息时，才触发追问。

精确匹配示例：
- 用户说"嘴巴干但不想灌水" → "干"+"不想喝水"同时出现 → 直接匹配"口干但不想喝水"
- 用户说"一到阴雨天就浑身没劲" → "阴雨天(湿气)"+"没劲(乏力)" → 直接匹配"神疲乏力遇湿加重"
- 用户说"口渴想喝热的" → 直接匹配"口渴喜热饮"
- 用户说"白天烦躁晚上倒还好" → 直接匹配"白天心烦夜间安静"

### 触发追问的条件
仅当用户只说了上位概念，**完全没有**提供任何区分信息时，才返回matchedLabels追问：
- 用户只说"口渴"/"老是口渴" → 没说冷热偏好，也没说不想喝 → matchedLabels=["口渴喜热饮","口渴喜凉饮","口干但不想喝水"], clarificationQuestion="请问您口渴是想喝热的还是凉的？还是口干但不想喝水？"
- 用户只说"怕冷"/"觉得冷" → 没说是整体还是局部 → matchedLabels=所有含"怕冷"的选项, clarificationQuestion="请问您怕冷是整体怕冷还是某个具体部位怕冷？"
- 用户只说"出汗"/"老出汗" → 没说是白天还是夜间 → matchedLabels=所有含"出汗/汗"的选项, clarificationQuestion="请问您出汗是白天清醒时出还是睡觉时出？"
- 用户只说"心烦"/"烦躁" → 没说是白天还是夜间 → matchedLabels=所有含"心烦"的选项, clarificationQuestion="请问您心烦是白天还是夜间？"

### 追问语格式
- **追问语必须使用选项的含义描述(semanticDesc)而非选项标签名(label)来提问**，确保用户二次回答时能从语义层面匹配到正确选项

## 识别规则

1. 先推理用户的真实意图，再输出结果——必须先输出 reasoning 思考过程
2. 口语表达可能包含缩略、比喻、情绪色彩，尽力理解真实含义
3. 严格从系统选项中选择，不允许自行创造选项。当能精确匹配一个选项时，matchedLabel设为该选项；当模糊时，matchedLabels列出所有相关候选
4. 如果用户的描述确实无法映射到任何选项 → matchedLabel为null、matchedLabels为空、confidence为0
5. **精确匹配优先**：当用户的表达综合来看能明确指向一个选项时（即使包含的信息不止一个维度），必须用matchedLabel精确匹配。只有当用户仅提到上位概念、完全没有提供区分信息时，才用matchedLabels追问
6. 用户的描述可能包含额外信息（程度、时间、触发条件等），只要核心症状能映射即可

## 输出格式

只返回纯JSON，不要有任何其它文字或markdown标记：
{"matchedLabel":"精确匹配的选项名或null","matchedLabels":["候选1","候选2"...],"clarificationQuestion":"追问语或null","confidence":0.0-1.0,"reasoning":"..."}`

// ══════════════════════════════════════════════════════════════
// 消息构建（与 src/api/llm/prompt.ts 保持一致）
// ══════════════════════════════════════════════════════════════

function buildIntentMessages(userText, stepId, currentSymptom) {
  const questionMap = {
    initial: '医生问：您好，请问您是有突发不适症状，还是想调理亚健康状态？',
    branch_b_symptom: '医生问：请问您具体是哪种突发不适？',
    branch_c_condition: '医生问：请问您亚健康有哪种具体表现？',
    severity: `医生问：请问您的【${currentSymptom || '症状'}】严重吗？`,
    branch_b_clarify: '医生问：方便告诉我您的具体不适表现吗？例如头痛、发热、怕冷、流鼻涕等？',
    branch_c_clarify: '医生问：方便描述一下您的具体状态吗？例如乏力、血压偏高、肝郁气滞等？',
  }
  const question = questionMap[stepId] || '医生正在问诊中'
  const userPrompt = `当前问诊阶段：${question}\n用户回答："${userText}"\n\n请先在 reasoning 中推理用户的真实意图，再返回JSON结果。`
  return [
    { role: 'system', content: INTENT_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]
}

function buildOptionMatchMessages(userText, stepId, options, doctorText) {
  const stepDescriptionMap = {
    analysis_review: '舌脉分析结果确认',
    analysis_abnormal: '明显异常提示后的选择',
    analysis_fail: '采集失败后的选择',
    detail_summary: '详细问诊结果汇总确认',
    self_feature_summary: '自选特征结果汇总确认',
    detail_question: '中医症状辨证问诊',
    self_feature_question: '自选特征症状描述',
  }
  const stepDescription = stepDescriptionMap[stepId] || stepId
  const optionsText = options
    .map(opt => opt.semanticDesc ? `"${opt.label}"(含义：${opt.semanticDesc})` : `"${opt.label}"`)
    .join('、')
  const isTcmStep = stepId === 'detail_question' || stepId === 'self_feature_question'
  const systemPrompt = isTcmStep ? TCM_SYMPTOM_MATCH_SYSTEM_PROMPT : OPTION_MATCH_SYSTEM_PROMPT
  const userPrompt = `当前问诊阶段：${stepDescription}\n${doctorText ? `医生问的问题：${doctorText}\n` : ''}可选选项：${optionsText}\n用户回答："${userText}"\n\n请判断用户的回答最接近哪个选项，先在 reasoning 中推理，再返回JSON结果。`
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

// ══════════════════════════════════════════════════════════════
// LLM 调用
// ══════════════════════════════════════════════════════════════

async function callLLM(messages) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelArg,
        messages,
        temperature: 0.1,
        max_tokens: 512,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) throw new Error('返回内容为空')

    return {
      raw: content.trim(),
      tokens: data.usage || {},
    }
  } finally {
    clearTimeout(timer)
  }
}

// ══════════════════════════════════════════════════════════════
// 结果解析
// ══════════════════════════════════════════════════════════════

function parseIntentResult(raw) {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const p = JSON.parse(jsonMatch[0])
    return {
      intent: p.intent ?? null,
      symptom: p.symptom ?? null,
      severity: p.severity ?? null,
      subType: p.sub_type ?? null,
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
      reasoning: p.reasoning ?? '',
    }
  } catch {
    return null
  }
}

function parseOptionMatchResult(raw) {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const p = JSON.parse(jsonMatch[0])
    return {
      matchedLabel: p.matchedLabel ?? null,
      matchedLabels: Array.isArray(p.matchedLabels) ? p.matchedLabels : [],
      clarificationQuestion: p.clarificationQuestion ?? null,
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
      reasoning: p.reasoning ?? '',
    }
  } catch {
    return null
  }
}

// ══════════════════════════════════════════════════════════════
// 症状别名映射（用于意图评测的宽松匹配）
// ══════════════════════════════════════════════════════════════

const SYMPTOM_ALIAS = {
  '伤风': '感冒', '外感': '感冒', '流鼻涕': '感冒', '鼻塞': '感冒',
  '头疼': '头痛', '脑袋疼': '头痛',
  '咳': '咳嗽',
  '恶寒': '怕冷', '畏寒': '怕冷',
  '发烧': '发热',
  '乏力': '慢性疲劳', '疲劳': '慢性疲劳',
  '睡不着': '失眠', '多梦': '失眠',
  '血压高': '血压偏高',
  '肚子大': '腹型肥胖',
  '生气': '肝郁气滞',
}

function normalizeSymptom(s) {
  if (!s) return null
  return SYMPTOM_ALIAS[s] || s
}

// ══════════════════════════════════════════════════════════════
// 单条测试执行
// ══════════════════════════════════════════════════════════════

async function runOneCase(tc) {
  if (tc.type === 'intent') {
    const messages = buildIntentMessages(tc.input, tc.stepId, tc.currentSymptom)
    const { raw, tokens } = await callLLM(messages)
    const parsed = parseIntentResult(raw)
    return { parsed, raw, tokens, type: 'intent' }
  }

  if (tc.type === 'option') {
    const options = (tc.options || []).map(o => ({
      label: o.label,
      semanticDesc: o.semanticDesc,
    }))
    const messages = buildOptionMatchMessages(tc.input, tc.stepId, options, tc.doctorText)
    const { raw, tokens } = await callLLM(messages)
    const parsed = parseOptionMatchResult(raw)
    return { parsed, raw, tokens, type: 'option' }
  }

  throw new Error(`未知类型: ${tc.type}`)
}

// ══════════════════════════════════════════════════════════════
// 结果判定
// ══════════════════════════════════════════════════════════════

function judgeIntent(tc, result) {
  const parsed = result.parsed
  if (!parsed) return { pass: false, reason: 'LLM返回无法解析为JSON', prediction: null }

  const pred = {
    intent: parsed.intent,
    symptom: parsed.symptom,
    severity: parsed.severity,
    subType: parsed.subType,
    confidence: parsed.confidence,
  }

  const exp = tc.expected
  const reasons = []
  let pass = true

  if (exp.intent !== undefined && exp.intent !== parsed.intent) {
    pass = false
    reasons.push(`intent: 期望"${exp.intent}" 实际"${parsed.intent}"`)
  }

  if (exp.symptom !== undefined) {
    const expS = normalizeSymptom(exp.symptom)
    const predS = normalizeSymptom(parsed.symptom)
    if (expS !== predS) {
      pass = false
      reasons.push(`symptom: 期望"${exp.symptom}" 实际"${parsed.symptom}"`)
    }
  }

  if (exp.severity !== undefined && exp.severity !== null && parsed.severity !== exp.severity) {
    pass = false
    reasons.push(`severity: 期望"${exp.severity}" 实际"${parsed.severity}"`)
  }

  if (exp.subType !== undefined && parsed.subType !== exp.subType) {
    pass = false
    reasons.push(`subType: 期望"${exp.subType}" 实际"${parsed.subType}"`)
  }

  const reason = pass ? '匹配正确' : reasons.join('; ')
  return { pass, reason, prediction: pred }
}

function judgeOption(tc, result) {
  const parsed = result.parsed
  if (!parsed) return { pass: false, reason: 'LLM返回无法解析为JSON', prediction: null }

  const pred = {
    matchedLabel: parsed.matchedLabel,
    matchedLabels: parsed.matchedLabels,
    clarificationQuestion: parsed.clarificationQuestion,
    confidence: parsed.confidence,
  }

  let pass = parsed.matchedLabel === tc.expectedLabel
  let reason

  if (pass) {
    reason = '匹配正确'
  } else if (parsed.matchedLabel === null && parsed.matchedLabels?.length >= 2) {
    const hasExpected = parsed.matchedLabels.includes(tc.expectedLabel)
    if (hasExpected) {
      pass = false
      reason = `模糊追问（候选含正确答案）: [${parsed.matchedLabels.join(', ')}] → ${parsed.clarificationQuestion}`
    } else {
      reason = `模糊追问但候选不含正确答案: [${parsed.matchedLabels.join(', ')}]`
    }
  } else {
    reason = `期望"${tc.expectedLabel}" 实际"${parsed.matchedLabel}"`
  }

  return { pass, reason, prediction: pred }
}

// ══════════════════════════════════════════════════════════════
// 报告生成
// ══════════════════════════════════════════════════════════════

function generateReport(results) {
  const lines = []
  const L = (s = '') => lines.push(s)

  const total = results.length
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass).length
  const errors = results.filter(r => r.error).length
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0'

  L()
  L('══════════════════════════════════════════════')
  L('              评 测 报 告')
  L('══════════════════════════════════════════════')
  L()
  L(`模型: ${modelArg}`)
  L(`总用例: ${total}  通过: ${passed}  失败: ${failed}  错误: ${errors}`)
  L(`通过率: ${passRate}%`)
  L()

  const byDifficulty = {}
  const byType = {}
  const byStep = {}

  for (const r of results) {
    const d = r.difficulty || 'unknown'
    if (!byDifficulty[d]) byDifficulty[d] = { total: 0, passed: 0 }
    byDifficulty[d].total++
    if (r.pass) byDifficulty[d].passed++

    const t = r.type || 'unknown'
    if (!byType[t]) byType[t] = { total: 0, passed: 0 }
    byType[t].total++
    if (r.pass) byType[t].passed++

    const s = r.stepId || 'unknown'
    if (!byStep[s]) byStep[s] = { total: 0, passed: 0 }
    byStep[s].total++
    if (r.pass) byStep[s].passed++
  }

  const pct = (p, t) => t > 0 ? ((p / t) * 100).toFixed(1) : '—'

  L('── 按类型 ──')
  for (const [type, d] of Object.entries(byType)) {
    L(`  ${type.padEnd(10)} ${pct(d.passed, d.total)}%  (${d.passed}/${d.total})`)
  }
  L()

  L('── 按难度 ──')
  const diffOrder = ['easy', 'medium', 'hard']
  for (const diff of diffOrder) {
    const d = byDifficulty[diff]
    if (!d) continue
    const icon = pct(d.passed, d.total) === '100.0' ? '✅' : Number(pct(d.passed, d.total)) >= 80 ? '⚠️' : '❌'
    L(`  ${diff.padEnd(10)} ${pct(d.passed, d.total)}%  (${d.passed}/${d.total})  ${icon}`)
  }
  L()

  L('── 按步骤 ──')
  for (const [step, d] of Object.entries(byStep)) {
    const icon = pct(d.passed, d.total) === '100.0' ? '✅' : Number(pct(d.passed, d.total)) >= 80 ? '⚠️' : '❌'
    L(`  ${step.padEnd(22)} ${pct(d.passed, d.total)}%  (${d.passed}/${d.total})  ${icon}`)
  }
  L()

  L('── 失败/错误详情 ──')
  const failedResults = results.filter(r => !r.pass)
  if (failedResults.length === 0) {
    L('  🎉 全部通过！')
  } else {
    for (const r of failedResults) {
      L(`  #${String(r.id).padStart(2)} [${r.difficulty}] ${r.note}`)
      L(`     输入: "${r.input}"`)
      if (r.error) {
        L(`     ❌ 错误: ${r.error}`)
      } else if (r.type === 'intent') {
        const p = r.prediction
        L(`     ❌ ${r.reason}`)
        L(`     LLM: intent=${p?.intent}, symptom=${p?.symptom}, severity=${p?.severity}, subType=${p?.subType}`)
      } else if (r.type === 'option') {
        const p = r.prediction
        L(`     ❌ ${r.reason}`)
        if (p?.matchedLabel) {
          L(`     LLM: "${p.matchedLabel}" (confidence: ${p.confidence})`)
        }
        if (p?.matchedLabels?.length > 0) {
          L(`     LLM candidates: [${p.matchedLabels.join(', ')}]`)
        }
      }
      L('')
    }
  }

  L()
  L(`总通过率: ${passRate}%  (${passed}/${total})`)
  L()

  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════
// 主流程
// ══════════════════════════════════════════════════════════════

async function main() {
  const results = []

  for (let i = 0; i < testData.cases.length; i++) {
    const tc = testData.cases[i]
    const label = `[${i + 1}/${testData.cases.length}] #${tc.id} ${tc.note}`
    process.stdout.write(`${label}... `)

    const record = {
      id: tc.id,
      type: tc.type,
      stepId: tc.stepId,
      difficulty: tc.difficulty,
      note: tc.note,
      input: tc.input,
      pass: false,
      reason: '',
      prediction: null,
      error: null,
    }

    if (dryRun) {
      record.pass = true
      record.reason = '(dry-run)'
      console.log('SKIP')
      results.push(record)
      continue
    }

    try {
      const result = await runOneCase(tc)

      if (tc.type === 'intent') {
        const judgment = judgeIntent(tc, result)
        record.pass = judgment.pass
        record.reason = judgment.reason
        record.prediction = judgment.prediction
      } else {
        const judgment = judgeOption(tc, result)
        record.pass = judgment.pass
        record.reason = judgment.reason
        record.prediction = judgment.prediction
      }

      const icon = record.pass ? '✅' : '❌'
      console.log(`${icon} ${record.reason}`)

      if (result.tokens) {
        record.tokens = result.tokens
      }
    } catch (e) {
      record.error = e.message
      console.log(`💥 ${e.message}`)
    }

    results.push(record)

    if (i < testData.cases.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  const report = generateReport(results)
  console.log(report)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = join(__dirname, `report-${timestamp}.txt`)
  writeFileSync(reportPath, report, 'utf-8')
  console.log(`报告已保存: ${reportPath}`)

  const resultsPath = join(__dirname, `results-${timestamp}.json`)
  writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`详细结果已保存: ${resultsPath}`)
}

main().catch(e => {
  console.error('评测脚本异常:', e)
  process.exit(1)
})
