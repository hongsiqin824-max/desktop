// LLM 意图识别提示词模板
// 修改此文件即可调整意图识别的精度和规则

import type { IIntentResult, IOptionMatchResult, IUserInfoParseResult, ILlmRequestMessage } from '@/types/llm'

export type { IIntentResult, IOptionMatchResult, IUserInfoParseResult }

const SYSTEM_PROMPT = `你是中医智能问诊系统的意图识别引擎。你的任务是从用户说的话中，识别就诊意图和主症，并映射到系统预定义分支。

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
- "severe"：用户明确说"很严重""特别严重""受不了""很厉害""特别难受""疼死了""痛死了"等
- "moderate"：用户说"较重""比较重""难受""不舒服""有点难受""挺难受""不太好"等
- "mild"：用户说"较轻""轻微""一点点""不太严重""不严重""还好""还行""一般""一般般""没什么""没啥""没事""还可以""差不多""不厉害""不重"等
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

用户："不严重"（医生问：请问您的咳嗽严重吗？）
→ reasoning: "不严重"是否定表达，表示程度轻微，对应 mild
→ intent:"acute", symptom:"咳嗽", severity:"mild", sub_type:null, confidence:0.95

## 输出格式

只返回纯JSON，不要有任何其它文字或markdown标记：
{"intent":"...","symptom":"...","severity":"...","sub_type":"...","confidence":0.0-1.0,"reasoning":"..."}`

export function buildIntentMessages(
  userText: string,
  stepId: string,
  currentSymptom?: string,
): ILlmRequestMessage[] {
  const questionMap: Record<string, string> = {
    initial: '医生问：您好，请问您是有突发不适症状，还是想调理亚健康状态？',
    branch_b_symptom: '医生问：请问您具体是哪种突发不适？',
    branch_c_condition: '医生问：请问您亚健康有哪种具体表现？',
    severity: `医生问：请问您的【${currentSymptom || '症状'}】严重吗？`,
    branch_b_clarify: '医生问：方便告诉我您的具体不适表现吗？例如头痛、发热、怕冷、流鼻涕等？',
    branch_c_clarify: '医生问：方便描述一下您的具体状态吗？例如乏力、血压偏高、肝郁气滞等？',
  }

  const question = questionMap[stepId] || '医生正在问诊中'

  const userPrompt = `当前问诊阶段：${question}
用户回答："${userText}"

请先在 reasoning 中推理用户的真实意图，再返回JSON结果。`

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]
}

export function parseIntentResult(raw: string): IIntentResult | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    const result: IIntentResult = {
      intent: parsed.intent ?? null,
      symptom: parsed.symptom ?? null,
      severity: parsed.severity ?? null,
      subType: parsed.sub_type ?? null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning ?? '',
    }

    return result
  } catch {
    return null
  }
}

// ── 选项分类提示词：将用户口语化回答映射到当前步骤的选项 ────────────

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
- 用户只说"口渴"/"老是口渴"/"经常口渴" → 没说冷热偏好，也没说不想喝 → matchedLabels=所有含"口渴"的选项, clarificationQuestion="请问您口渴是想喝热的还是凉的？还是口干但不想喝水？"
- 用户只说"怕冷"/"觉得冷"/"经常怕冷" → 没说是整体还是局部 → matchedLabels=所有含"怕冷"的选项, clarificationQuestion="请问您怕冷是整体都怕冷，还是某个具体部位怕冷？"
- 用户只说"怕热"/"觉得热"/"经常怕热" → 没说是整体还是局部 → matchedLabels=所有含"怕热"的选项, clarificationQuestion="请问您怕热是整体都怕热，还是某个具体部位怕热？"
- 用户只说"出汗"/"老出汗"/"经常出汗"/"容易出汗" → 没说是白天还是夜间 → matchedLabels=所有含"出汗/汗"的选项, clarificationQuestion="请问您出汗是白天清醒时出还是睡觉时出？汗液是清爽的还是粘腻的？"
- 用户只说"心烦"/"烦躁"/"经常心烦" → 没说是白天还是夜间 → matchedLabels=所有含"心烦"的选项, clarificationQuestion="请问您心烦是白天还是夜间？"

**关键判断原则**：程度副词（经常/老是/总是/很/比较/有点/容易/动不动）不提供区分信息，不改变分类方向。"经常怕冷"和"怕冷"一样是上位概念，"老是口渴"和"口渴"一样是上位概念。只有提供了具体区分维度（部位、时间、冷热偏好等）的信息才算有效区分。

### 追问语格式
- **追问语必须使用选项的含义描述(semanticDesc)而非选项标签名(label)来提问**，确保用户二次回答时能从语义层面匹配到正确选项

### 多部位批量匹配规则
当用户在一次回答中**明确提到了多个具体部位或症状**时（如"头部和脚部""手和腰""胃和腹部"），应将其全部匹配到对应选项，通过 matchedLabels 返回所有匹配结果，而非只选一个。
- 批量匹配条件：用户明确提到了2个或以上不同的具体部位/症状，且每个都能明确对应到一个选项
- 批量匹配时：matchedLabel 设为 null（因为不是单一匹配），matchedLabels 列出所有精确匹配的选项名，clarificationQuestion 设为 null（不需要追问，直接全部记录）
- 示例：用户说"头部和脚部"（上下文：局部怕冷）→ matchedLabel:null, matchedLabels:["头怕冷","脚怕冷"], clarificationQuestion:null
- 示例：用户说"手和腰都怕冷" → matchedLabel:null, matchedLabels:["手怕冷","腰怕冷"], clarificationQuestion:null
- 示例：用户说"头和肚子"（上下文：局部怕冷）→ matchedLabel:null, matchedLabels:["头怕冷","腹部怕冷"], clarificationQuestion:null

## 识别规则

1. 先推理用户的真实意图，再输出结果——必须先输出 reasoning 思考过程
2. 口语表达可能包含缩略、比喻、情绪色彩，尽力理解真实含义
3. 严格从系统选项中选择，不允许自行创造选项。当能精确匹配一个选项时，matchedLabel设为该选项；当模糊时，matchedLabels列出所有相关候选
4. 如果用户的描述确实无法映射到任何选项 → matchedLabel为null、matchedLabels为空、confidence为0
5. **精确匹配优先**：当用户的表达综合来看能明确指向一个选项时（即使包含的信息不止一个维度），必须用matchedLabel精确匹配。只有当用户仅提到上位概念、完全没有提供区分信息时，才用matchedLabels追问
6. **多部位批量匹配**：当用户一次提到多个具体部位时，所有部位都匹配到对应选项后放入matchedLabels，matchedLabel设为null，clarificationQuestion设为null
7. 用户的描述可能包含额外信息（程度、时间、触发条件等），只要核心症状能映射即可
8. 上下文推理：医生问题中提到的"冷热感觉"等关键词，以及已记录的上下文信息（如"用户已记录：局部怕冷"），决定了匹配方向。用户说"头部"在"局部怕冷"上下文中应匹配"头怕冷"而非"头发热"

## 输出格式

只返回纯JSON，不要有任何其它文字或markdown标记：
{"matchedLabel":"精确匹配的选项名或null","matchedLabels":["候选1","候选2"...],"clarificationQuestion":"追问语或null","confidence":0.0-1.0,"reasoning":"..."}`

export function buildOptionMatchMessages(
  userText: string,
  stepId: string,
  options: { label: string; semanticDesc?: string }[],
  doctorText?: string,
  contextHint?: string,
): ILlmRequestMessage[] {
  const stepDescriptionMap: Record<string, string> = {
    analysis_review: '舌脉分析结果确认',
    analysis_abnormal: '明显异常提示后的选择',
    analysis_fail: '采集失败后的选择',
    detail_summary: '详细问诊结果汇总确认',
    self_feature_summary: '自选特征结果汇总确认',
    detail_question: '中医症状辨证问诊',
    self_feature_question: '自选特征症状描述',
  }

  const stepDescription = stepDescriptionMap[stepId] || stepId
  const optionsText = options.map(opt => {
    if (opt.semanticDesc) return `"${opt.label}"(含义：${opt.semanticDesc})`
    return `"${opt.label}"`
  }).join('、')

  const isTcmStep = stepId === 'detail_question' || stepId === 'self_feature_question'
  const systemPrompt = isTcmStep ? TCM_SYMPTOM_MATCH_SYSTEM_PROMPT : OPTION_MATCH_SYSTEM_PROMPT

  const userPrompt = `当前问诊阶段：${stepDescription}
${doctorText ? `医生问的问题：${doctorText}` : ''}
${contextHint ? `上下文信息：${contextHint}` : ''}
可选选项：${optionsText}
用户回答："${userText}"

请判断用户的回答最接近哪个选项，先在 reasoning 中推理，再返回JSON结果。`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

export function parseOptionMatchResult(raw: string): IOptionMatchResult | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    const result: IOptionMatchResult = {
      matchedLabel: parsed.matchedLabel ?? null,
      matchedLabels: Array.isArray(parsed.matchedLabels) ? parsed.matchedLabels : [],
      clarificationQuestion: parsed.clarificationQuestion ?? null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning ?? '',
    }

    return result
  } catch {
    return null
  }
}

// ── 中文数字转阿拉伯数字（用于手机号等纯数字字符串容错） ──
const CHINESE_DIGIT_MAP: Record<string, string> = {
  '零': '0', '〇': '0', '○': '0',
  '一': '1', '壹': '1', '１': '1',
  '二': '2', '贰': '2', '两': '2', '２': '2',
  '三': '3', '叁': '3', '３': '3',
  '四': '4', '肆': '4', '４': '4',
  '五': '5', '伍': '5', '５': '5',
  '六': '6', '陆': '6', '６': '6',
  '七': '7', '柒': '7', '７': '7',
  '八': '8', '捌': '8', '８': '8',
  '九': '9', '玖': '9', '９': '9',
}

const convertChineseDigitsToArabic = (str: string): string => {
  return str.replace(/[零〇○一壹１二贰两２三叁３四肆４五伍５六陆６七柒７八捌８九玖９]/g, ch => CHINESE_DIGIT_MAP[ch] || ch)
}

// ── 用户信息提取提示词：从口语化语音文本中提取姓名/性别/年龄/身高/体重/手机号 ──

const USER_INFO_PARSE_SYSTEM_PROMPT = `你是中医智能问诊系统的用户信息提取引擎。你的任务是从用户口语化的语音输入中，准确提取个人基本信息并输出结构化 JSON。

## 提取规则

1. 忠实提取：只从用户原话中提取已明确表达的信息，绝不推测用户没说的内容
2. 未提及的字段返回 null，不要编造
3. 性别只允许 "男" 或 "女"，其他表达一律映射为 "男" 或 "女"
4. 年龄统一为整数（岁），范围描述取近似值：
   - "三十多岁"→30, "四十出头"→40, "快三十了"→29, "快五十了"→49
5. 身高统一为厘米(cm)整数：
   - "一米六"→160, "一米七五"→175, "一米五八"→158, "一米六五"→165
   - "一百六十厘米"→160, "160公分"→160, "一米八"→180
   - 如用户说"1米6"→160, "1.6米"→160, "1.75米"→175
6. 体重统一为公斤(kg)整数：
   - "五十公斤"→50, "一百二十斤"→60, "一百斤"→50, "一百五十斤"→75
   - 斤→公斤：斤÷2
   - "五十千克"→50, "50kg"→50
7. 手机号统一为11位纯数字字符串，去除空格/横杠/括号等分隔符
   - 中文数字如"一三八"需转为"138"，"五八"需转为"58"
   - 用户可能分段读手机号："138 1234 5678""138一二三四5678""一三八 一二三四 五六七八"
   - 无论用户怎么读，你必须把所有片段拼接成完整的11位阿拉伯数字字符串
   - 绝不能遗漏任何一位数字，11位必须完整
8. 姓名保持原文，不要修改或翻译
9. 容错：用户可能口语混乱、顺序颠倒、重复说、夹杂无关内容——尽力理解真实含义

## 典型示例

用户："我是小红，性别是女，今年34岁，身高一米六，体重50公斤，手机号是13812345678"
→ {"name":"小红","gender":"女","age":34,"height":160,"weight":50,"phone":"13812345678"}

用户："我叫张伟，男的，三十多岁吧，大概一米七左右，体重一百四十斤，电话138-1234-5678"
→ {"name":"张伟","gender":"男","age":30,"height":170,"weight":70,"phone":"13812345678"}

用户："我叫李明，今年28，身高175厘米，体重65公斤，手机1三8一二三四五六七八"
→ {"name":"李明","gender":null,"age":28,"height":175,"weight":65,"phone":"13812345678"}

用户："姓名王芳 女性 快三十了 一米五八 体重一百斤 手机号是1五8一二345六七8"
→ {"name":"王芳","gender":"女","age":29,"height":158,"weight":50,"phone":"15812345678"}

用户："我姓刘，男，今年52，身高1米72，140斤左右吧，联系方式15900001234"
→ {"name":"刘","gender":"男","age":52,"height":172,"weight":70,"phone":"15900001234"}

用户："我叫陈静，女的，35岁，身高一米六二，体重108斤，电话一三八零零一二三四五六"
→ {"name":"陈静","gender":"女","age":35,"height":162,"weight":54,"phone":"13800123456"}

用户："赵明 男 40岁 一米七五 150斤 手机138 空格 1234 空格 5678"
→ {"name":"赵明","gender":"男","age":40,"height":175,"weight":75,"phone":"13812345678"}

用户："孙丽丽 女 28 一米六 100斤 联系方式一三八-壹二三四-五六七八"
→ {"name":"孙丽丽","gender":"女","age":28,"height":160,"weight":50,"phone":"13812345678"}

## 输出格式

只返回纯JSON，不要有任何其它文字或markdown标记：
{"name":"...","gender":"男"或"女"或null,"age":数字或null,"height":数字或null,"weight":数字或null,"phone":"11位数字"或null}`

export function buildUserInfoParseMessages(userText: string): ILlmRequestMessage[] {
  return [
    { role: 'system', content: USER_INFO_PARSE_SYSTEM_PROMPT },
    { role: 'user', content: `请从以下用户语音输入中提取个人信息：\n"${userText}"\n\n请返回纯JSON结果。` },
  ]
}

export function parseUserInfoResult(raw: string): IUserInfoParseResult | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    // 用正则预提取手机号字符串，防止 JSON.parse 大数字丢精度
    let prePhone: string | null = null
    const phoneFieldMatch = jsonMatch[0].match(/"phone"\s*:\s*(\d+)/)
    if (phoneFieldMatch) {
      prePhone = phoneFieldMatch[1]!
    }

    const parsed = JSON.parse(jsonMatch[0])

    // phone 字段容错：LLM 可能返回 number 或 string
    let phoneRaw: string | null = null
    if (typeof parsed.phone === 'string') {
      phoneRaw = parsed.phone
    } else if (typeof parsed.phone === 'number') {
      phoneRaw = prePhone || String(parsed.phone)
    }

    const result: IUserInfoParseResult = {
      name: typeof parsed.name === 'string' ? parsed.name : null,
      gender: parsed.gender === '男' || parsed.gender === '女' ? parsed.gender : null,
      age: typeof parsed.age === 'number' && parsed.age > 0 && parsed.age < 150 ? Math.round(parsed.age) : null,
      height: typeof parsed.height === 'number' && parsed.height > 50 && parsed.height < 300 ? Math.round(parsed.height) : null,
      weight: typeof parsed.weight === 'number' && parsed.weight > 10 && parsed.weight < 500 ? Math.round(parsed.weight) : null,
      phone: phoneRaw ? convertChineseDigitsToArabic(phoneRaw.replace(/[\s\-()（）]/g, '')) : null,
    }

    // 手机号校验：必须是11位纯数字
    if (result.phone && !/^\d{11}$/.test(result.phone)) {
      result.phone = null
    }

    return result
  } catch {
    return null
  }
}

// ── 本地手机号提取兜底：从原始语音文本中用正则提取手机号 ──
export function extractPhoneLocally(text: string): string | null {
  // 先找"手机号/电话/联系方式"后面的数字串
  const keywordMatch = text.match(/(?:手机号|电话|联系方式|号码)[：:是]?\s*([\d零〇○一壹１二贰两２三叁３四肆４五伍５六陆６七柒７八捌８九玖９\s-]+?)(?:[，,。.！!？?\s]|$)/)
  if (keywordMatch) {
    const digits = convertChineseDigitsToArabic(keywordMatch[1]!.replace(/[\s-]/g, ''))
    if (/^\d{11}$/.test(digits)) return digits
  }

  // 全文搜索连续11位数字
  const arabicMatch = text.match(/1\d{10}/)
  if (arabicMatch) return arabicMatch[0]!

  // 全文搜索中文数字序列（连续11个中文数字）
  const chinesePattern = /([零〇○一壹１二贰两２三叁３四肆４五伍５六陆６七柒７八捌８九玖９]{11,})/
  const cnMatch = text.match(chinesePattern)
  if (cnMatch) {
    const digits = convertChineseDigitsToArabic(cnMatch[1]!)
    // 取前11位
    if (digits.length >= 11 && /^1\d{10}/.test(digits.slice(0, 11))) {
      return digits.slice(0, 11)
    }
  }

  return null
}
