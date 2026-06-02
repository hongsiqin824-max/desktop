// 自选特征（纯自选症状）数据定义
// 修改此文件即可调整自选症状的部位、性质选项、解释文案和编码映射

import type { ISelfFeatureSymptom, ISelfFeatureLocation, ISelfFeatureCategoryOption } from '@/types/consultation'

// ── 身体部位选项 ──────────────────────────────────────────────
export const SELF_FEATURE_LOCATIONS: ISelfFeatureLocation[] = [
  { label: '头部', zone: 'upper', primaryMeridians: ['JM3', 'JM11', 'JM12', 'JM14'], semanticDesc: '头部区域，包括头顶、前额、太阳穴、后脑等位置' },
  { label: '颈肩', zone: 'upper', primaryMeridians: ['JM2', 'JM10'], semanticDesc: '颈部和肩部区域，包括脖子、后颈、肩膀等位置' },
  { label: '胸背', zone: 'upper', primaryMeridians: ['JM1', 'JM9', 'JM7'], semanticDesc: '胸背部区域，包括前胸、胸口、后背、肩胛等位置' },
  { label: '上腹部', zone: 'middle', primaryMeridians: ['JM3', 'JM4'], semanticDesc: '肚脐以上的腹部区域，包括胃脘、心口窝等位置' },
  { label: '下腹部', zone: 'lower', primaryMeridians: ['JM8', 'JM12'], semanticDesc: '肚脐以下的腹部区域，包括小腹、丹田等位置' },
  { label: '腰背', zone: 'middle', primaryMeridians: ['JM7', 'JM8'], semanticDesc: '腰部区域，包括腰椎、腰杆、后腰等位置' },
  { label: '上肢', zone: 'upper', primaryMeridians: ['JM2', 'JM6', 'JM10'], semanticDesc: '上肢区域，包括手臂、手肘、手腕、手掌、手指等位置' },
  { label: '下肢', zone: 'lower', primaryMeridians: ['JM3', 'JM11', 'JM8'], semanticDesc: '下肢区域，包括大腿、膝盖、小腿、脚踝、脚底等位置' },
  { label: '男性生殖', zone: 'lower', primaryMeridians: ['JM8'], genderCondition: 'male', ageRange: [16, 65], semanticDesc: '男性生殖系统区域' },
  { label: '女性生殖', zone: 'lower', primaryMeridians: ['JM8'], genderCondition: 'female', ageRange: [15, 50], semanticDesc: '女性生殖系统区域，包括外阴、子宫等' },
  { label: '乳房', zone: 'upper', primaryMeridians: ['JM1'], genderCondition: 'female', ageRange: [15, 50], semanticDesc: '乳房乳腺区域' },
]

// ── 症状性质选项 ──────────────────────────────────────────────
// 按类别分组，便于分步展示
export const SELF_FEATURE_SYMPTOMS: Record<string, ISelfFeatureSymptom[]> = {
  // 常见症状（首屏展示）
  common: [
    { label: '热痛', brief: '痛处发热发烫', detail: '这是局部组织被热毒或瘀火堵住烧出来的', category: 'K', baseCode: 'RT', semanticDesc: '疼痛伴随局部灼热感、发烫感，核心是"痛+热"的组合' },
    { label: '冷痛', brief: '遇冷就痛，得热敷舒服', detail: '是阳气没到或寒气扎根，把局部血脉给冻僵了', category: 'X', baseCode: 'LT', semanticDesc: '疼痛在遇冷或受寒时加重、热敷后缓解，核心是"痛+冷触发+热敷缓解"的寒性特征' },
    { label: '胀痛', brief: '痛处发胀，像要裂开', detail: '这是局部气机被死死堵在里面出不来', category: 'K', baseCode: 'ZT', semanticDesc: '疼痛伴随明显的胀满感、撑胀感，核心是"痛+胀"的组合' },
    { label: '刺痛', brief: '像被针扎，痛点固定', detail: '这是瘀血死卡在局部经络里最典型的标志', category: 'K', baseCode: 'CT', semanticDesc: '疼痛呈针刺样、刀割样，痛点固定不移动，核心是"尖锐固定点的扎刺样痛"' },
    { label: '酸痛', brief: '软绵绵带酸无力', detail: '局部气血不足或有湿气泡着肌肉', category: 'P', baseCode: 'ST', semanticDesc: '疼痛伴随酸软感、酸胀感，常伴无力，核心是"痛+酸软"的组合' },
    { label: '隐隐痛', brief: '时有时无的轻微闷痛', detail: '多属于局部阴血或阳气太虚了，是"空转"的疼', category: 'X', baseCode: 'YY', semanticDesc: '疼痛程度较轻、隐隐约约、时有时无，核心是"轻微断续的闷痛"' },
    { label: '剧痛', brief: '疼痛剧烈难忍', detail: '这是气机在体内逆行乱冲，带有极强的攻击性', category: 'K', baseCode: 'GT', semanticDesc: '疼痛程度剧烈难以忍受，核心是"疼痛强度极高的剧烈痛"' },
    { label: '麻木', brief: '像隔着层厚布感觉减退', detail: '气过不去则麻，血过不去则木，多是气滞血瘀或风痰', category: 'X', baseCode: 'MM', semanticDesc: '局部感觉减退或异常，如隔着厚物触摸，核心是"感觉迟钝或丧失的麻感"' },
    { label: '痒', brief: '皮肤发痒想抓', detail: '是风邪外袭或血虚生风燥扰，热盛也会兼痒', category: 'P', baseCode: 'YA', semanticDesc: '皮肤或局部有痒感、想抓挠，核心是"瘙痒感"' },
    { label: '无力', brief: '使不上劲', detail: '中气或局部筋脉失养，缺少能量撑腰', category: 'X', baseCode: 'WL', semanticDesc: '局部或整体感觉力量不足、使不上劲，核心是"力量减弱、功能减退"' },
  ],
  // 更多疼痛类
  painMore: [
    { label: '窜痛', brief: '痛在几处之间来回乱窜', detail: '这是气被堵得发疯，在局部经络里乱钻', category: 'K', baseCode: 'MT', semanticDesc: '痛来回窜几处之间窜乱窜窜着疼一会这儿一会那儿' },
    { label: '痒痛', brief: '又痒又痛，想抓又不敢碰', detail: '这是局部既有风邪外扰，又有内热或瘀血阻滞', category: 'P', baseCode: 'YT', semanticDesc: '又痒又痛痒着疼想抓又不敢痒痛交加' },
    { label: '游走痛', brief: '疼痛位置一直转换不固定', detail: '这是纯属风邪在经脉里劫掠，专挑缝隙钻', category: 'K', baseCode: 'UT', semanticDesc: '痛位置不固定一会这里一会那里到处走游走跑着疼' },
    { label: '重痛', brief: '往下坠的沉重感痛', detail: '这是湿气把局部组织给泡发过载了', category: 'P', baseCode: 'ZZ', semanticDesc: '沉重往下坠绑了石头坠痛沉重感' },
    { label: '掣痛', brief: '一动就扯着筋抽痛', detail: '这是局部津血不足，筋脉失养，一拉伸就如痉挛', category: 'P', baseCode: 'QT', semanticDesc: '扯着筋抽痛牵扯痛一动就扯着疼痉挛' },
    { label: '空痛', brief: '像被掏空了，发虚的疼', detail: '这是精血极度亏耗，局部组织没有了物质填充', category: 'X', baseCode: 'KT', semanticDesc: '空虚被掏空发虚的疼空疼虚痛' },
    { label: '绞痛', brief: '像管子被拧紧猛转，剧烈难忍', detail: '通常是寒气或实积完全堵死了通路', category: 'K', baseCode: 'KK', semanticDesc: '拧紧拧着疼绞着疼像拧毛巾剧烈拧痛' },
  ],
  // 更多感觉类
  sensationMore: [
    { label: '酸', brief: '发酸别扭挥之不去', detail: '这是局部肌肉过劳或湿气堆积，气转不动', category: 'P', baseCode: 'SU', semanticDesc: '发酸别扭酸溜溜酸酸的酸感' },
    { label: '胀', brief: '撑得难受却没剧痛', detail: '纯属气机或组织液卡在局部，压力增高', category: 'P', baseCode: 'ZH', semanticDesc: '撑胀胀满鼓撑得难受胀胀的' },
    { label: '闷', brief: '像被套住透不过气', detail: '局部气机不畅或有湿浊蒙蔽', category: 'P', baseCode: 'ME', semanticDesc: '憋闷闷着透不过气被套住闷胀' },
    { label: '重坠感', brief: '像受重力拉着往下掉', detail: '这是中气无力升举或湿浊太重带着肉体下坠', category: 'X', baseCode: 'ZU', semanticDesc: '往下坠往下掉坠感重坠坠着沉重感' },
    { label: '蚁走感', brief: '表皮像有蚂蚁在爬', detail: '多是微细脉络气血虚或风邪在试探攻击', category: 'P', baseCode: 'YE', semanticDesc: '蚂蚁爬虫子在爬蚁行蚁走小虫爬表皮感觉' },
    { label: '出汗', brief: '只限局部的多汗', detail: '对应经络气虚或湿郁不通，导致局部阀门失灵', category: 'X', baseCode: 'CH', semanticDesc: '局部出汗冒汗多汗汗' },
  ],
  // 外观变化类
  appearance: [
    { label: '浮肿', brief: '按之轻微凹陷的肿胀', detail: '水湿代谢不走，溜进皮下组织', category: 'P', baseCode: 'FZ', semanticDesc: '肿水肿浮肿按下去有坑肿胀肿起来' },
    { label: '红肿', brief: '高热赤红隆起', detail: '是湿热或热毒把局部血肉蒸熟了的炎性反应', category: 'K', baseCode: 'HO', semanticDesc: '又红又肿热肿红肿隆起红肿热' },
    { label: '发红', brief: '血络充斥胀得发红', detail: '热在局部发散或相火窜皮', category: 'K', baseCode: 'FO', semanticDesc: '红红红的局部变红充血发红血络充斥' },
    { label: '发热', brief: '局部温度高摸之烫手', detail: '血热或经脉有把闷火集中熏灼', category: 'K', baseCode: 'FR', semanticDesc: '发热烫灼热局部温度高摸之烫手局部发烫灼热感' },
    { label: '怕冷', brief: '独该处摸起来凉飕飕', detail: '阳气的末梢到不了，或者被瘀血挡住了', category: 'X', baseCode: 'PL', semanticDesc: '怕冷凉冰凉凉飕飕畏寒冷局部怕冷那个地方冷' },
    { label: '发白', brief: '局部无血色苍白', detail: '气血断了刚需供养，或寒凝收缩血管', category: 'P', baseCode: 'FB', semanticDesc: '苍白没血色发白白白的' },
    { label: '发黄', brief: '局部枯黄或黄疸', detail: '湿热熏蒸染黄，或脾虚血亏失华', category: 'K', baseCode: 'HH', semanticDesc: '黄发黄枯黄黄疸偏黄' },
    { label: '发黑', brief: '局部肤色变深黑糊', detail: '肾色外露、瘀血坚凝最难消', category: 'P', baseCode: 'FH', semanticDesc: '黑发黑变黑黑糊色深' },
    { label: '紫黑', brief: '淤血青紫近黑', detail: '比普通瘀斑更重，血停久败坏了', category: 'K', baseCode: 'ZI', semanticDesc: '紫青紫紫黑淤血紫发紫近黑' },
    { label: '红疹', brief: '鲜红点状突起', detail: '血分有风热或血热，透出表皮的求救信号', category: 'K', baseCode: 'HZ', semanticDesc: '红疹红色疹子红点鲜红突起小红点' },
    { label: '白疹', brief: '不红的米状丘疹', detail: '多为湿气或汗出不彻，憋在表皮', category: 'K', baseCode: 'BZ', semanticDesc: '白疹白色疹子不红的小点白丘疹' },
    { label: '瘀斑', brief: '局部青紫斑块', detail: '是微细血管破了，死血堆积在皮下', category: 'P', baseCode: 'YB', semanticDesc: '青紫瘀斑淤青青一块紫一块斑淤血斑' },
    { label: '结节', brief: '摸得到推得动的硬块', detail: '是痰浊抱团，或者瘀血凝结', category: 'P', baseCode: 'JJ', semanticDesc: '硬块结节疙瘩包推得动的硬块' },
    { label: '干燥', brief: '局部无汗脱屑干裂', detail: '津液输布的洒水车开不过来了', category: 'P', baseCode: 'GZ', semanticDesc: '干干燥脱屑干裂无汗干干的' },
    { label: '脱屑', brief: '反复掉干皮', detail: '血虚风燥，局部没有滋润角质脱落', category: 'P', baseCode: 'TX', semanticDesc: '掉皮脱皮皮屑头皮屑掉干皮脱屑' },
    { label: '水疱', brief: '透明小泡里有澄清水液', detail: '纯粹是水湿聚在皮里', category: 'P', baseCode: 'SB', semanticDesc: '水泡水疱透明小泡起泡水泡子' },
    { label: '脓疱', brief: '浑浊黄白色包有毒点', detail: '湿毒热毒腐烂血肉成脓', category: 'K', baseCode: 'NP', semanticDesc: '脓包脓疱黄白色包有脓化脓脓点' },
    { label: '风团', brief: '突然起的鼓包剧烈瘙痒来得快去得快', detail: '是典型的风邪与湿热交搏', category: 'K', baseCode: 'FT', semanticDesc: '风团荨麻疹起包鼓包来得快去得快风疙瘩' },
    { label: '皲裂', brief: '皮肤裂开深口子见血丝', detail: '血虚到极致生风化燥，皮肤直接干崩', category: 'P', baseCode: 'QL', semanticDesc: '裂口裂开皲裂裂了见血丝皮肤裂' },
    { label: '出血有热', brief: '鲜红出血感觉有热', detail: '热逼血乱行', category: 'K', baseCode: 'CX', semanticDesc: '鲜红出血出血发烫红血鲜红有热感' },
    { label: '出血无热', brief: '淡红出血不热', detail: '气虚摄不住血', category: 'X', baseCode: 'CXD', semanticDesc: '淡红出血出血不热淡血色不烫的出血' },
  ],
  // 功能受限类
  function: [
    { label: '僵硬', brief: '紧绷如铁板弯不了', detail: '瘀血死水或湿寒让筋和肉失去了弹性', category: 'P', baseCode: 'JY', semanticDesc: '紧绷铁板弯不了活动不利僵硬的硬' },
    { label: '震颤', brief: '不自主的轻微抽搐抖动', detail: '血不养筋，虚风在体内吹荡', category: 'P', baseCode: 'ZC', semanticDesc: '抖颤抖抖动不自主抖哆嗦' },
    { label: '萎缩', brief: '局部肌肉塌陷干瘪', detail: '这是元气大亏或精血枯竭，滋养断流了', category: 'X', baseCode: 'WS', semanticDesc: '塌陷干瘪变小塌了肌肉萎缩' },
    { label: '增生', brief: '固定硬结多余肉长出来', detail: '气滞血瘀或痰浊结聚成形成积', category: 'P', baseCode: 'ZE', semanticDesc: '多余肉硬结长多了增厚增生' },
    { label: '囊肿', brief: '皮下滑溜溜的无痛包块', detail: '多属痰湿抱团在皮下某个袋口', category: 'P', baseCode: 'NZ', semanticDesc: '滑溜溜的包水包皮下包块囊肿包块' },
  ],
}

// ── 部位→八维前缀映射 ──────────────────────────────────────────
export const ZONE_PREFIX_MAP: Record<string, string> = {
  upper: 'S',   // 胸膈以上（含手臂）
  middle: 'M',  // 胸膈到肚脐之间
  lower: 'X',   // 肚脐以下
}

// ── 症状性质类别按钮（引导"更多"展开） ─────────────────────────
export const SELF_FEATURE_CATEGORY_OPTIONS: ISelfFeatureCategoryOption[] = [
  { label: '更多疼痛类', expandKey: 'painMore', semanticDesc: '用户想查看更多与疼痛性质相关的症状类型' },
  { label: '更多感觉类', expandKey: 'sensationMore', semanticDesc: '用户想查看更多非疼痛类感觉异常的症状类型' },
  { label: '外观变化类', expandKey: 'appearance', semanticDesc: '用户想查看皮肤或局部外观发生变化类的症状' },
  { label: '功能受限类', expandKey: 'function', semanticDesc: '用户想查看功能活动受限类的症状' },
]

export const SELF_FEATURE_SEVERITY_OPTIONS = [
  { label: '较轻', value: 1, semanticDesc: '用户表达该症状程度轻微、不严重、影响不大，核心是"程度轻"' },
  { label: '较重', value: 2, semanticDesc: '用户表达该症状程度偏重、比较明显、影响较大，核心是"程度重"' },
]

// ── 最大自选症状数量 ──────────────────────────────────────────
export const SELF_FEATURE_MAX_COUNT = 5
