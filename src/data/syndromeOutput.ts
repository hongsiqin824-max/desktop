// 证型输出模拟数据定义
// 按主症映射6项模拟输出，后续接入真实证型计算引擎时替换此模块

import type { ISyndromeOutput, IDetailAnswer, ISelfFeatureRecord, IAnalysisData } from '@/types/consultation'

// ── 主症→病种分类映射 ────────────────────────────────────────
const DISEASE_CATEGORY_MAP: Record<string, string> = {
  '感冒': '外感病',
  '头痛': '外感病',
  '咳嗽': '呼吸系统病',
  '慢性疲劳': '亚健康虚损',
  '失眠': '心神失调',
  '发热': '外感病',
  '怕冷': '外感病',
  '血压偏高': '肝系失调',
  '腹型肥胖': '脾胃失调',
  '脂肪肝': '肝系失调',
  '肝郁气滞': '肝系失调',
  '焦虑': '心神失调',
}

// ── 主症→模拟证型输出模板 ────────────────────────────────────
const SYNDROME_MOCK: Record<string, ISyndromeOutput> = {
  '感冒': {
    diseaseCategory: '外感病',
    mainSymptom: '感冒',
    mainSymptoms: ['怕冷发热', '流涕', '头痛', '全身酸痛'],
    syndromeResult: '风寒束表证',
    syndromeDetail: '外感风寒之邪，束于肌表，卫阳被遏，营阴郁滞。表现为恶寒重、发热轻、无汗、头痛身疼、鼻塞流清涕。辨证要点：恶寒与发热并见、无汗、脉浮紧。',
    illustration: '经络图：足太阳膀胱经（JM7）为主要受累经络，风寒外束致经气不利。上焦（S）寒邪凝滞，卫气不达。',
    conditioningPlan: [
      '疏风散寒，解表发汗',
      '日常注意保暖避风，尤须保护头颈部和背部',
      '规律作息，保证充足睡眠以助卫气恢复',
      '清淡温热饮食，忌生冷寒凉之品',
      '适度活动微微出汗，但不可大汗伤阳',
    ],
    productRecommendation: [
      '荆防感冒茶（荆芥+防风+苏叶，疏风散寒）',
      '生姜红糖暖胃饮（生姜+红糖+红枣，温中散寒）',
      '葱白豆豉汤料包（葱白+淡豆豉，通阳解表）',
    ],
  },

  '头痛': {
    diseaseCategory: '外感病',
    mainSymptom: '头痛',
    mainSymptoms: ['头痛', '怕风', '颈项强痛', '目眩'],
    syndromeResult: '外风袭上证',
    syndromeDetail: '风邪上犯头部，清阳之气被扰。表现为头痛游走或固定、怕风、颈项拘急、目眩。辨证要点：头痛为主诉、风邪特征明显、上焦受病。',
    illustration: '经络图：足太阳膀胱经（JM7）、足少阳胆经（JM11）为主要受累经络。上焦（S）风邪壅滞，清窍不利。',
    conditioningPlan: [
      '疏风止痛，清利头目',
      '日常注意头部保暖，避免直吹风',
      '保持情绪平稳，避免肝郁化风',
      '规律作息，避免熬夜耗伤阴血',
      '适度颈肩放松活动，疏通上焦气血',
    ],
    productRecommendation: [
      '川芎天麻茶（川芎+天麻+白芷，祛风止痛）',
      '菊花决明饮（菊花+决明子，清利头目）',
      '薄荷疏风茶（薄荷+荆芥+防风，疏风清上）',
    ],
  },

  '咳嗽': {
    diseaseCategory: '呼吸系统病',
    mainSymptom: '咳嗽',
    mainSymptoms: ['咳嗽', '痰多', '胸闷', '气短'],
    syndromeResult: '痰湿蕴肺证',
    syndromeDetail: '痰湿内蕴，阻滞肺气，肺失宣降。表现为咳嗽痰多、痰白粘或成块、胸闷气短、食少腹胀。辨证要点：痰湿为患、肺脾同病、中上焦失调。',
    illustration: '经络图：手太阴肺经（JM1）为主要受累经络，脾经（JM3）运化失职生痰湿。上焦（S）肺气壅塞，中焦（M）脾虚生湿。',
    conditioningPlan: [
      '燥湿化痰，宣肺止咳',
      '日常注意保暖防寒，避免冷风直吹胸背',
      '饮食忌甜腻厚味，以免助湿生痰',
      '保持室内空气流通，避免油烟刺激',
      '适度深呼吸锻炼，助肺气宣发',
    ],
    productRecommendation: [
      '橘皮半夏止咳茶（陈皮+半夏+茯苓，燥湿化痰）',
      '杏仁百合润肺饮（杏仁+百合+款冬花，宣肺止咳）',
      '薏仁化痰粥料（薏苡仁+白扁豆+山药，健脾化湿）',
    ],
  },

  '慢性疲劳': {
    diseaseCategory: '亚健康虚损',
    mainSymptom: '慢性疲劳',
    mainSymptoms: ['神疲乏力', '气短懒言', '纳差腹胀', '畏寒肢冷'],
    syndromeResult: '脾肾阳虚证',
    syndromeDetail: '脾阳不足，运化失职，气血生化乏源；肾阳亏虚，命门火衰，温煦无力。表现为神疲乏力、气短懒言、畏寒肢冷、纳差腹胀、大便稀溏。辨证要点：阳虚寒象明显、脾肾同病、中下焦虚寒。',
    illustration: '经络图：足太阴脾经（JM3）、足少阴肾经（JM8）为主要受累经络。中焦（M）脾虚寒凝，下焦（X）肾阳亏虚。',
    conditioningPlan: [
      '温补脾肾，益气助阳',
      '日常注意保暖，尤其腰腹和下肢',
      '饮食温补，多食山药、红枣、桂圆等健脾温阳之品',
      '避免过度劳累和思虑过度，以免伤脾耗气',
      '适度太极拳或八段锦，温养阳气而不耗伤',
    ],
    productRecommendation: [
      '参芪扶正茶（党参+黄芪+炙甘草，补气健脾）',
      '杜仲骨碎补肾饮（杜仲+骨碎补+肉桂，温补肾阳）',
      '山药薏仁健脾粥料（山药+薏苡仁+莲子，健脾益气）',
    ],
  },

  '失眠': {
    diseaseCategory: '心神失调',
    mainSymptom: '失眠',
    mainSymptoms: ['入睡困难', '多梦易醒', '心烦', '头晕'],
    syndromeResult: '心肝火旺证',
    syndromeDetail: '心火亢盛，肝火上炎，神魂被扰不得安宁。表现为入睡困难、多梦纷纭、心烦急躁、头晕目眩、口苦咽干。辨证要点：心肝火旺、神魂不安、上焦热扰。',
    illustration: '经络图：手少阴心经（JM5）、足厥阴肝经（JM12）为主要受累经络。上焦（S）心火扰神，中焦（M）肝火上炎。',
    conditioningPlan: [
      '清心泻火，平肝安神',
      '日常保持情绪平稳，避免恼怒焦虑助火',
      '睡前1小时避免用手机和强光刺激',
      '饮食清淡，忌辛辣燥热和浓茶咖啡',
      '睡前可用温水泡脚引火下行',
    ],
    productRecommendation: [
      '莲子酸枣仁安神茶（莲子+酸枣仁+夜交藤，养心安神）',
      '菊花夏枯草清肝饮（菊花+夏枯草+决明子，清肝泻火）',
      '百合小麦宁心粥料（百合+浮小麦+茯苓，宁心除烦）',
    ],
  },

  '发热': {
    diseaseCategory: '外感病',
    mainSymptom: '发热',
    mainSymptoms: ['发热', '口渴', '出汗', '头痛'],
    syndromeResult: '风热犯表证',
    syndromeDetail: '外感风热之邪，犯于肌表，卫气抗邪则发热。表现为发热重、微恶风、口渴欲饮、汗出、头痛。辨证要点：热象为主、口渴汗出、脉浮数。',
    illustration: '经络图：手太阴肺经（JM1）、足太阳膀胱经（JM7）受累。上焦（S）风热壅肺，卫气亢奋。',
    conditioningPlan: [
      '疏风清热，辛凉解表',
      '日常注意居室通风，避免闷热环境',
      '多饮温水，补充汗出津液损耗',
      '饮食清淡偏凉，忌辛辣燥热之品',
      '发热期间注意休息，避免体力消耗',
    ],
    productRecommendation: [
      '银翘清热茶（金银花+连翘+薄荷，疏风清热）',
      '桑菊饮料包（桑叶+菊花+杏仁，辛凉解表）',
      '竹叶石膏退热饮（竹叶+石膏+知母，清热泻火）',
    ],
  },

  '怕冷': {
    diseaseCategory: '外感病',
    mainSymptom: '怕冷',
    mainSymptoms: ['畏寒', '四肢冷', '腰膝冷痛', '面色淡白'],
    syndromeResult: '阳虚寒凝证',
    syndromeDetail: '阳气不足，温煦失职，寒邪内生或外侵。表现为畏寒肢冷、腰膝冷痛、面色淡白、精神萎靡。辨证要点：寒象突出、阳气亏虚、下焦寒凝。',
    illustration: '经络图：足少阴肾经（JM8）、足太阴脾经（JM3）受累。中焦（M）脾阳不足，下焦（X）肾阳亏虚。',
    conditioningPlan: [
      '温阳散寒，益气扶正',
      '日常注意全身保暖，尤须保护腰腹和四肢',
      '饮食温补，多食羊肉、姜汤、桂圆等温阳之品',
      '适度运动助阳生发，但不可大汗伤阳',
      '避免居处阴冷潮湿，保持居室温暖',
    ],
    productRecommendation: [
      '姜桂温阳茶（干姜+桂枝+炙甘草，温阳散寒）',
      '附子理中暖胃饮（制附子+党参+干姜，温中散寒）',
      '当归羊肉温补汤料（当归+生姜+羊肉，温补气血）',
    ],
  },

  '血压偏高': {
    diseaseCategory: '肝系失调',
    mainSymptom: '血压偏高',
    mainSymptoms: ['头晕', '头痛', '急躁易怒', '面红目赤'],
    syndromeResult: '肝阳上亢证',
    syndromeDetail: '肝肾阴虚，水不涵木，肝阳偏亢上扰清窍。表现为头晕头痛、急躁易怒、面红目赤、腰膝酸软。辨证要点：上实下虚、肝阳化风、上焦热扰下焦阴虚。',
    illustration: '经络图：足厥阴肝经（JM12）、足少阴肾经（JM8）受累。上焦（S）肝阳亢扰，下焦（X）肾阴亏虚。',
    conditioningPlan: [
      '平肝潜阳，滋水涵木',
      '日常保持情绪平和，避免恼怒焦虑',
      '规律作息，保证充足睡眠助阴血恢复',
      '饮食清淡，忌辛辣燥热和酒精',
      '适度舒缓运动如散步、太极，不宜剧烈',
    ],
    productRecommendation: [
      '天麻钩藤平肝茶（天麻+钩藤+石决明，平肝潜阳）',
      '杞菊地黄滋肾饮（枸杞+菊花+熟地，滋水涵木）',
      '决明降压茶（决明子+夏枯草+菊花，清肝降压）',
    ],
  },

  '腹型肥胖': {
    diseaseCategory: '脾胃失调',
    mainSymptom: '腹型肥胖',
    mainSymptoms: ['腹部胀大', '体倦乏力', '嗜食肥甘', '大便粘腻'],
    syndromeResult: '脾虚湿盛证',
    syndromeDetail: '脾失健运，水湿内停，聚于腹部成肥胖。表现为腹部胀大、体倦乏力、嗜食肥甘、大便粘腻不爽。辨证要点：脾虚运化失职、湿浊停聚中焦、虚实夹杂。',
    illustration: '经络图：足太阴脾经（JM3）、足阳明胃经（JM4）受累。中焦（M）脾虚湿困，运化不力。',
    conditioningPlan: [
      '健脾化湿，消脂导滞',
      '饮食控制，减少肥甘厚味摄入',
      '多食薏苡仁、山药、冬瓜等健脾利湿之品',
      '适度有氧运动，助气血运行消散湿浊',
      '避免久坐不动，餐后适当散步助运化',
    ],
    productRecommendation: [
      '荷叶山楂消脂茶（荷叶+山楂+决明子，消脂化湿）',
      '薏仁茯苓健脾饮（薏苡仁+茯苓+白术，健脾化湿）',
      '陈皮莱菔导滞茶（陈皮+莱菔子+厚朴，行气导滞）',
    ],
  },

  '脂肪肝': {
    diseaseCategory: '肝系失调',
    mainSymptom: '脂肪肝',
    mainSymptoms: ['肝区不适', '腹胀', '乏力', '嗜食肥甘'],
    syndromeResult: '肝郁痰湿证',
    syndromeDetail: '肝气郁结，疏泄失职，脾失健运，痰湿内聚于肝。表现为肝区不适、腹胀乏力、嗜食肥甘、情绪不畅。辨证要点：肝郁脾虚、痰湿互结、中焦失调。',
    illustration: '经络图：足厥阴肝经（JM12）、足太阴脾经（JM3）受累。中焦（M）肝郁气滞，脾虚湿聚。',
    conditioningPlan: [
      '疏肝解郁，健脾化湿',
      '保持情绪舒畅，避免郁怒伤肝',
      '饮食清淡低脂，减少油腻肥甘摄入',
      '适度运动助气血运行，促进脂肪代谢',
      '规律作息，避免熬夜伤肝血',
    ],
    productRecommendation: [
      '柴胡疏肝茶（柴胡+香附+郁金，疏肝解郁）',
      '茵陈泽泻化湿饮（茵陈+泽泻+茯苓，利湿化浊）',
      '杞菊养肝茶（枸杞+菊花+决明子，养肝柔肝）',
    ],
  },

  '肝郁气滞': {
    diseaseCategory: '肝系失调',
    mainSymptom: '肝郁气滞',
    mainSymptoms: ['胸胁胀满', '急躁易怒', '叹气', '月经不调'],
    syndromeResult: '肝气郁结证',
    syndromeDetail: '肝失疏泄，气机郁滞。表现为胸胁胀满、急躁易怒、善太息、情绪抑郁不畅。辨证要点：气滞为主、胁肋胀满、情绪波动明显。',
    illustration: '经络图：足厥阴肝经（JM12）为主要受累经络。中焦（M）肝气郁结，疏泄不力。',
    conditioningPlan: [
      '疏肝理气，解郁安神',
      '保持情绪舒朗，适度社交和户外活动',
      '练习深呼吸和冥想，助气机舒展',
      '饮食避免辛辣刺激和酒精，以免助热化火',
      '规律作息，保证睡眠助肝血恢复',
    ],
    productRecommendation: [
      '玫瑰佛手疏肝茶（玫瑰花+佛手+香附，疏肝理气）',
      '柴胡郁金解郁饮（柴胡+郁金+枳壳，解郁理气）',
      '合欢花安神茶（合欢花+酸枣仁+夜交藤，解郁安神）',
    ],
  },

  '焦虑': {
    diseaseCategory: '心神失调',
    mainSymptom: '焦虑',
    mainSymptoms: ['心烦不安', '紧张多虑', '失眠多梦', '心悸胸闷'],
    syndromeResult: '心胆虚怯证',
    syndromeDetail: '心气不足，胆失决断，神魂不宁。表现为心烦不安、紧张多虑、失眠多梦、心悸胸闷。辨证要点：心虚胆怯、神魂不安、上焦心神受扰。',
    illustration: '经络图：手少阴心经（JM5）、足少阳胆经（JM11）受累。上焦（S）心虚胆怯，神魂不宁。',
    conditioningPlan: [
      '养心安神，壮胆定志',
      '日常练习正念冥想或深呼吸放松',
      '规律作息，保证睡眠质量和时长',
      '适度舒缓运动如散步、瑜伽，不宜剧烈',
      '避免咖啡浓茶等刺激心神之品',
    ],
    productRecommendation: [
      '酸枣仁龙齿安神茶（酸枣仁+龙齿+茯神，养心安神）',
      '甘麦大枣宁心饮（甘草+浮小麦+大枣，养心缓急）',
      '远志石菖蒲开窍茶（远志+石菖蒲+郁金，豁痰开窍）',
    ],
  },
}

// ── 根据收集的问诊数据生成模拟证型输出 ────────────────────────
// 目前为模拟实现，后续接入真实证型计算引擎时替换此函数
export function generateMockSyndromeOutput(
  symptom: string,
  detailAnswers: IDetailAnswer[],
  selfFeatureRecords: ISelfFeatureRecord[],
  analysisData: IAnalysisData | null,
): ISyndromeOutput {
  const base = SYNDROME_MOCK[symptom] ?? SYNDROME_MOCK['感冒']!

  const diseaseCategory = DISEASE_CATEGORY_MAP[symptom] ?? '未分类'

  const mainSymptoms = detailAnswers.length > 0
    ? detailAnswers.map(a => a.label)
    : base.mainSymptoms

  const selfFeatureSymptoms = selfFeatureRecords.map(
    r => `${r.location}：${r.symptom}（${r.severity === 1 ? '较轻' : '较重'}）`
  )

  const syndromeResult = base.syndromeResult

  const syndromeDetail = base.syndromeDetail
    + (selfFeatureSymptoms.length > 0
      ? `\n\n自选特征补充：${selfFeatureSymptoms.join('；')}`
      : '')

  const tonguePulseInfo = analysisData
    ? `舌象：苔${analysisData.tongueCoating}、质${analysisData.tongueColor}、形${analysisData.tongueSize}、舌下${analysisData.tongueBottom}；脉象：${analysisData.pulseType}（${analysisData.pulseRate}次/分）`
    : ''

  const illustration = base.illustration
    + (tonguePulseInfo ? `\n舌脉合参：${tonguePulseInfo}` : '')

  return {
    diseaseCategory,
    mainSymptom: symptom,
    mainSymptoms,
    syndromeResult,
    syndromeDetail,
    illustration,
    conditioningPlan: base.conditioningPlan,
    productRecommendation: base.productRecommendation,
  }
}

// ── 格式化证型输出为展示文本 ────────────────────────────────────
export function formatSyndromeOutput(output: ISyndromeOutput): string {
  const lines: string[] = []

  lines.push('╔══════════════════════════════╗')
  lines.push('║       辨 证 分 析 报 告       ║')
  lines.push('╚══════════════════════════════╝')
  lines.push('')
  lines.push('【一、病种 + 主症】')
  lines.push(`${output.diseaseCategory} · ${output.mainSymptom}`)
  lines.push('')
  lines.push('【二、主要症状】')
  output.mainSymptoms.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${s}`)
  })
  lines.push('')
  lines.push('【三、辨证结果】')
  lines.push(`证型：${output.syndromeResult}`)
  lines.push('')
  lines.push(output.syndromeDetail)
  lines.push('')
  lines.push('【四、经络图示】')
  lines.push(output.illustration)
  lines.push('')
  lines.push('【五、调理方案】')
  output.conditioningPlan.forEach((p, i) => {
    lines.push(`  ${i + 1}. ${p}`)
  })
  lines.push('')
  lines.push('【六、产品配套】')
  output.productRecommendation.forEach((p, i) => {
    lines.push(`  ${i + 1}. ${p}`)
  })

  return lines.join('\n')
}