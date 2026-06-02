// 详细问诊题库数据定义（感冒 + 头痛 + 咳嗽 + 失眠 + 慢性疲劳）
// 修改此文件即可调整问诊问题、选项和分支逻辑

import type { IDetailQuestion } from '@/types/consultation'

// ── 感冒问诊问题库 ────────────────────────────────────────────
export const COLD_QUESTIONS: Record<string, IDetailQuestion> = {
  // 第1题：寒热表现（所有分支共用）
  chillHeat: {
    category: 'chillHeat',
    doctorText: '目前您的寒热表现是怎样的？如果不太理解这些术语，我可以逐一为您解释。',
    options: [
      { label: '单独怕冷', taCode: 'TA1A', semanticDesc: '只觉得怕冷畏寒/只冷不热/光觉得冷/一身冷/怕冷不怕热/畏寒不发热/冷丝丝的/冷飕飕的/怕吹风/穿得多' },
      { label: '单独发热', taCode: 'TA1B', semanticDesc: '只觉得发热偏热/只热不冷/光觉得热/一身热/怕热不怕冷/发热不怕冷/偏热/热得难受/喜凉/穿得少' },
      { label: '怕冷同时发热', taCode: 'TA1C', semanticDesc: '同一时间既怕冷又发热/既怕冷又发热/又冷又热/冷热同在/同时怕冷和发热/冷着又觉得热/感觉冷但体温高/怕冷又怕热/一身冷一身热/寒热同作' },
      { label: '寒热往来', taCode: 'TA1D', semanticDesc: '忽冷忽热/一阵冷一阵热/时冷时热/冷热交替/一会儿冷一会儿热/冷了又热热了又冷/冷热来回/寒热往来' },
      { label: '夜热早凉', taCode: 'TA1E', semanticDesc: '白天不热晚上发热/晚上热白天不热/夜里发热白天凉/夜间体温高白天正常/白天凉夜间热/早凉夜热/夜热早凉' },
      { label: '寒热不明显', taCode: 'TA1F', semanticDesc: '没有特别怕冷怕热的感觉/不冷不热/没什么冷热感觉/既不怕冷也不怕热/冷热感觉不明显/体温正常/没有怕冷怕热/寒热无感' },
    ],
    isFreeInput: true,
  },

  // 第2题：流涕（怕冷类分支）
  nasal: {
    category: 'nasal',
    doctorText: '请问您是否流涕？',
    options: [
      { label: '流清涕', taCode: 'TA2A', semanticDesc: '流清鼻涕/流清水鼻涕/鼻涕清的/鼻涕稀清/流透明鼻涕/鼻涕像水一样/流鼻水/清水鼻涕/清涕' },
      { label: '流浊涕', taCode: 'TA2B', semanticDesc: '流浊鼻涕/流浓鼻涕/鼻涕稠的/鼻涕黄稠/流黄浓鼻涕/鼻涕浑浊/鼻涕粘稠/浓鼻涕/鼻涕黄黄的/浊涕' },
      { label: '没有流涕', taCode: 'TA2C', semanticDesc: '没有流鼻涕/不流鼻涕/鼻子没流/没鼻涕/鼻子干干的/没有鼻涕/不流涕' },
    ],
  },

  // 出汗-怕冷类分支
  sweatChill: {
    category: 'sweat',
    doctorText: '请问您的出汗情况？',
    options: [
      { label: '不出汗', taCode: 'TA6A', semanticDesc: '完全不出汗/一点汗都不出/没汗/不出汗/干干的没汗/汗不出/无汗/不出一点汗' },
      { label: '自汗', taCode: 'TA6B', semanticDesc: '白天清醒时出汗/白天出汗/白天动就出汗/醒着就出汗/不运动也出汗/白天老出汗/白天汗多/醒时出汗/自汗' },
      { label: '盗汗', taCode: 'TA6C', semanticDesc: '睡觉时出汗醒了就停/夜间出汗/睡着出汗醒就干/晚上睡觉出汗/睡中出汗醒后即止/睡着冒汗/夜间盗汗/睡觉一身汗醒了就没了/睡中出汗' },
    ],
  },

  // 出汗-怕热类分支（更细粒度）
  sweatHeat: {
    category: 'sweat',
    doctorText: '请问您的出汗情况？',
    options: [
      { label: '不出汗', taCode: 'TA6A', semanticDesc: '完全不出汗/一点汗都不出/没汗/不出汗/干干的没汗/汗不出/无汗' },
      { label: '出汗粘腻', taCode: 'TA6B1', semanticDesc: '白天出汗且汗液粘腻不清爽/出汗粘手/汗油腻腻的/汗粘糊糊/出汗不清爽/汗黏黏的/汗黏腻/汗粘/出汗黏/汗出不爽' },
      { label: '出汗不粘腻', taCode: 'TA6B2', semanticDesc: '白天出汗但汗液清爽不粘腻/出汗清爽/汗不粘/汗液清/出汗干净/汗不腻/出汗滑爽/汗清' },
      { label: '盗汗粘腻', taCode: 'TA6C1', semanticDesc: '睡觉出汗且汗液粘腻/夜间出汗粘腻/睡觉出汗粘/睡中出汗粘手/盗汗黏腻/夜里出汗粘/睡汗黏' },
      { label: '盗汗不粘腻', taCode: 'TA6C2', semanticDesc: '睡觉出汗但汗液不粘腻/夜间出汗不粘/盗汗清爽/睡中出汗不黏/夜里出汗不粘/睡汗清爽' },
    ],
  },

  // 口渴/喝水
  thirst: {
    category: 'thirst',
    doctorText: '请问您的口渴和喝水情况？',
    options: [
      { label: '口不渴', taCode: 'TA3A', semanticDesc: '不渴/不觉得渴/没有口渴/不口干/嘴巴不干/没有口干的感觉/嘴巴不渴/不想喝水/嘴巴润/不干不渴' },
      { label: '口渴喜热饮', taCode: 'TA3B', semanticDesc: '口渴想喝热水温水/口干想喝热水/渴了想喝热的/嘴巴干想喝温水/想喝热饮/喜热饮/口渴爱喝热水/口渴喝热水才舒服/渴喜热饮' },
      { label: '口渴喜凉饮', taCode: 'TA3C', semanticDesc: '口渴想喝冷水凉水冰水/口干想喝凉的/渴了想喝冷的/嘴巴干想喝冰水/想喝凉饮/喜凉饮/口渴爱喝凉水/口渴喝凉水才舒服/渴喜凉饮/渴喜冷饮' },
      { label: '口干但不想喝水', taCode: 'TA3D', semanticDesc: '嘴巴干但不想喝水/口干不欲饮/嘴巴干不想喝/口干不渴/嘴巴干喝不下去/口干不想饮水/口干涩不想喝水/口干但喝不下去' },
      { label: '口中水多', taCode: 'TA3E', semanticDesc: '嘴里口水多不觉得干/嘴里水多/口多涎/口水多/嘴巴里水汪汪/嘴里湿润/口水淌/嘴巴老是水/口多唾/唾液多' },
    ],
  },

  // 口味
  taste: {
    category: 'taste',
    doctorText: '请问您的口味情况？',
    options: [
      { label: '口苦', taCode: 'TA4A', semanticDesc: '嘴巴苦/口里苦/嘴巴苦涩/口苦涩/口苦味/嘴里发苦/苦嘴/嘴巴苦巴巴的/口苦味重/嘴里苦味' },
      { label: '口臭', taCode: 'TA4B', semanticDesc: '嘴巴臭/口里有臭味/嘴里发臭/口气臭/嘴巴有异味/口臭味/嘴臭/口气重/嘴巴气味难闻/嘴里臭' },
      { label: '口酸', taCode: 'TA4C', semanticDesc: '嘴巴酸/口里酸/嘴里发酸/口酸味/嘴巴酸酸的/嘴里酸涩/酸嘴/嘴巴酸溜溜' },
      { label: '口涩', taCode: 'TA4D', semanticDesc: '嘴巴涩/口里涩/嘴里发涩/口涩味/嘴巴涩巴巴/嘴涩/口中涩/嘴巴涩涩的' },
      { label: '口咸', taCode: 'TA4E', semanticDesc: '嘴巴咸/口里咸/嘴里发咸/口咸味/嘴巴咸咸的/嘴里咸味' },
      { label: '口淡无味', taCode: 'TA4F', semanticDesc: '嘴巴没味道/口里没味/嘴里淡/口淡/嘴巴无味/吃东西没味/嘴巴淡淡的/嘴里啥味没有/口中无味/口淡无味觉' },
      { label: '口甜', taCode: 'TA4G', semanticDesc: '嘴巴甜/口里甜/嘴里发甜/口甜味/嘴巴甜腻/嘴里甜甜的/口中甜腻' },
    ],
  },

  // 饮食/食欲
  appetite: {
    category: 'appetite',
    doctorText: '请问您最近的吃饭情况如何？',
    options: [
      { label: '食欲不振', taCode: 'TA5A', semanticDesc: '不想吃饭/食欲不振/没胃口/不想吃/吃得少/食欲差/胃口差/不想吃东西/饭量小/吃不下/没食欲/胃口不好' },
      { label: '能吃', taCode: 'TA5B', semanticDesc: '能吃饭/食欲正常/吃得正常/胃口好/食欲还行/正常吃/饭量正常/能吃能喝/胃口不差' },
      { label: '见食而烦', taCode: 'TA5C', semanticDesc: '看到食物就烦/见食而烦/看到饭就不想吃/见食厌烦/看到吃的东西烦/看饭烦/看到饭菜心烦/不想看到吃的' },
    ],
  },

  // 大便
  stool: {
    category: 'stool',
    doctorText: '请问您的大便情况？',
    options: [
      { label: '大便稀溏不热', taCode: 'TA7A', semanticDesc: '大便稀不成形但不觉得热/大便稀/拉稀不热/大便溏/大便软烂/大便不成形/拉稀便/肚子不热/便溏不热/稀便不热' },
      { label: '大便稀溏发热', taCode: 'TA7B', semanticDesc: '大便稀不成形且肛门有灼热感/大便稀且热/拉稀肛门热/大便溏热/稀便发热/肛门灼热/拉稀屁股热/便溏灼热' },
      { label: '大便干结', taCode: 'TA7C', semanticDesc: '大便干结/大便干/便秘/拉干/大便硬/大便干硬/拉不出来/大便干燥/便干/排便困难/干便/羊屎便/大便像羊屎' },
      { label: '先干后稀', taCode: 'TA7D', semanticDesc: '大便开头干硬后面变稀/先干后稀/大便开头干后面稀/前面干后面稀/先硬后软/开始干后来稀' },
      { label: '时干时稀', taCode: 'TA7E', semanticDesc: '大便有时干有时稀交替出现/时干时稀/大便有时干有时软/有时候干有时候稀/大便干稀交替/有时便秘有时拉稀/便干便稀交替' },
      { label: '大便带血', taCode: 'TA7F', semanticDesc: '大便带血/便血/拉屎带血/大便有血/便中有血/出血/大便血/大便见血/拉血便/血便' },
    ],
  },

  // 小便
  urine: {
    category: 'urine',
    doctorText: '请问您的小便情况？',
    options: [
      { label: '小便发热发黄', taCode: 'TA8A', semanticDesc: '小便发热发黄/尿黄热/尿热/小便黄赤/尿发黄/小便烧灼/尿灼热/小便黄热/尿急热/小便黄烫' },
      { label: '小便清长', taCode: 'TA8B', semanticDesc: '小便清长/尿清/小便清/尿量多清/小便透明/尿清长/小便颜色浅/尿淡/小便清稀/尿多清亮' },
      { label: '小便不利', taCode: 'TA8C', semanticDesc: '小便不利/尿不出来/小便不畅/排尿困难/尿少/小便解不出/尿不顺畅/小便费力/尿不利/小便难解' },
      { label: '小便带血发热', taCode: 'TA8D', semanticDesc: '小便带血发热/尿血热/小便出血且热/尿中有血且灼热/血尿热痛/小便红热/血尿发烧感' },
      { label: '小便带血不热', taCode: 'TA8E', semanticDesc: '小便带血不热/尿血不热/小便出血不热/尿中有血不热/血尿无痛/小便红不热/血尿不烫' },
    ],
  },

  // 睡眠
  sleep: {
    category: 'sleep',
    doctorText: '请问您的睡眠情况？',
    options: [
      { label: '入睡困难', taCode: 'TA9A', semanticDesc: '入睡困难/睡不着/难入睡/翻来覆去睡不着/入眠困难/躺半天睡不着/睡不着觉/入睡慢/难入眠/失眠' },
      { label: '睡后易醒', taCode: 'TA9B', semanticDesc: '睡后易醒/容易醒/醒了就睡不着/半夜醒/老醒/睡不踏实/容易醒过来/醒后难再睡/睡眠浅/睡不稳' },
      { label: '嗜睡', taCode: 'TA9C', semanticDesc: '嗜睡/老想睡/睡不够/整天困/犯困/老犯困/总想睡觉/睡很多/昏昏欲睡/困倦/爱睡/老是困' },
    ],
  },

  // 体力
  energy: {
    category: 'energy',
    doctorText: '请问您的体力情况？',
    options: [
      { label: '神疲乏力劳累加重', taCode: 'TA10A', semanticDesc: '累没精神劳累后更明显/乏力劳累加重/神疲乏力/疲惫/没力气/累/一干活就累/累得不想动/干活更累/劳则乏力加重/疲劳劳累加重' },
      { label: '神疲乏力遇湿加重', taCode: 'TA10B', semanticDesc: '累没精神阴雨天潮湿环境更明显/乏力遇湿加重/阴雨天更累/潮湿天累/湿气重更乏力/下雨天更没劲/湿天更疲惫/遇湿乏力/阴湿天疲劳加重' },
      { label: '神疲乏力遇热加重', taCode: 'TA10C', semanticDesc: '累没精神天热环境热更明显/乏力遇热加重/天热更累/热天更没劲/遇热疲惫/热天乏力加重/夏天更累/高温更疲劳' },
    ],
  },

  // 心烦
  mood: {
    category: 'mood',
    doctorText: '请问您的心烦情况？',
    options: [
      { label: '白天心烦', taCode: 'TA11A', semanticDesc: '白天心烦/白天烦躁/白天烦/白天心烦意乱/白天闹心/白天心里烦/白天烦躁不安/日间心烦' },
      { label: '夜间心烦', taCode: 'TA11B', semanticDesc: '夜间心烦/晚上烦躁/夜里烦/夜间心烦意乱/晚上闹心/夜里心里烦/夜间烦躁不安/夜烦' },
      { label: '白天心烦夜间安静', taCode: 'TA11C', semanticDesc: '白天心烦但晚上安静/白天烦晚上不烦/白天闹心夜里平静/白天烦躁夜间不烦/白天烦夜间安/日间烦夜间静' },
    ],
  },
}

// ── 寒热分支对应的问题序列 ────────────────────────────────────
// 根据第1题（寒热）的回答，决定后续问诊顺序
// 怕冷类分支多一道「流涕」，怕热类分支多一道「出汗粘腻细分」
export const COLD_QUESTION_SEQUENCE: Record<string, string[]> = {
  '单独怕冷': ['nasal', 'thirst', 'taste', 'appetite', 'sweatChill', 'stool', 'urine', 'sleep', 'energy', 'mood'],
  '单独发热': ['sweatHeat', 'thirst', 'taste', 'appetite', 'stool', 'urine', 'sleep', 'energy', 'mood'],
  '怕冷同时发热': ['nasal', 'thirst', 'taste', 'appetite', 'sweatChill', 'stool', 'urine', 'sleep', 'energy', 'mood'],
  '寒热往来': ['nasal', 'thirst', 'taste', 'appetite', 'sweatChill', 'stool', 'urine', 'sleep', 'energy', 'mood'],
  '夜热早凉': ['nasal', 'thirst', 'taste', 'appetite', 'sweatChill', 'stool', 'urine', 'sleep', 'energy', 'mood'],
  '寒热不明显': ['nasal', 'thirst', 'taste', 'appetite', 'sweatChill', 'stool', 'urine', 'sleep', 'energy', 'mood'],
}

// ── 咳嗽问诊问题库 ────────────────────────────────────────────
export const COUGH_QUESTIONS: Record<string, IDetailQuestion> = {
  // 第1题：咳嗽类型
  coughType: {
    category: 'coughType',
    doctorText: '请问您的咳嗽是干咳还是有痰？如果是有痰，痰是什么颜色？',
    options: [
      { label: '干咳', taCode: 'KSG' },
      { label: '咳痰发白色', taCode: 'KSB' },
      { label: '咳痰发黄色', taCode: 'KSH' },
      { label: '咳痰发青绿色', taCode: 'KSL' },
    ],
    isFreeInput: true,
  },

  // 干咳分支：有无血丝
  dryCoughBlood: {
    category: 'dryCoughBlood',
    doctorText: '请问干咳时有没有血丝？',
    options: [
      { label: '有血丝', taCode: 'KSGA' },
      { label: '无血丝', taCode: 'KSGB', semanticDesc: '痰里没有血丝' },
    ],
  },

  // 干咳分支：夜间加重
  dryCoughNight: {
    category: 'dryCoughNight',
    doctorText: '请问夜间咳嗽是否加重？',
    options: [
      { label: '夜间加重', taCode: 'KSGC' },
      { label: '夜间不加重', semanticDesc: '咳嗽夜间不会加重' },
    ],
  },

  // 干咳分支：阵发性呛咳
  dryCoughSpasm: {
    category: 'dryCoughSpasm',
    doctorText: '请问是否是阵发性、刺激性呛咳？',
    options: [
      { label: '阵发性呛咳', taCode: 'KSGD' },
      { label: '不是阵发性', semanticDesc: '咳嗽不是一阵一阵的' },
    ],
  },

  // 干咳分支：生气加重
  dryCoughAnger: {
    category: 'dryCoughAnger',
    doctorText: '请问生气时干咳是否加重？',
    options: [
      { label: '生气加重', taCode: 'KSGE' },
      { label: '与生气无关', semanticDesc: '咳嗽和生气情绪没关系' },
    ],
  },

  // 白痰分支：痰的性质
  whiteSputumNature: {
    category: 'whiteSputumNature',
    doctorText: '请问白痰的性质？',
    options: [
      { label: '痰清稀', taCode: 'KSBA' },
      { label: '痰成块', taCode: 'KSBB' },
      { label: '痰粘不易咳出', taCode: 'KSBC' },
    ],
  },

  // 黄痰分支：有无臭味
  yellowSputumSmell: {
    category: 'yellowSputumSmell',
    doctorText: '请问黄痰是否有臭味？',
    options: [
      { label: '有臭味', taCode: 'KSHA' },
      { label: '无臭味', semanticDesc: '痰没有臭味' },
    ],
  },

  // 绿痰分支：有无臭味
  greenSputumSmell: {
    category: 'greenSputumSmell',
    doctorText: '请问青绿色痰是否有臭味？',
    options: [
      { label: '有臭味', taCode: 'KSLA' },
      { label: '无臭味', semanticDesc: '痰没有臭味' },
    ],
  },

  // 咳嗽声音是否沉闷
  coughVoiceDull: {
    category: 'coughVoiceDull',
    doctorText: '请问咳嗽声音是否沉闷？',
    options: [
      { label: '声音沉闷', taCode: 'KSBF' },
      { label: '声音不沉闷' },
    ],
  },

  // 咳嗽声音是否响亮
  coughVoiceLoud: {
    category: 'coughVoiceLoud',
    doctorText: '请问咳嗽声音是否响亮？',
    options: [
      { label: '声音响亮', taCode: 'KSHB' },
      { label: '声音不响亮' },
    ],
  },

  // 咽痒而咳
  throatItch: {
    category: 'throatItch',
    doctorText: '请问是否咽痒而咳？',
    options: [
      { label: '咽痒而咳', taCode: 'KSY' },
      { label: '没有咽痒', semanticDesc: '嗓子不痒' },
    ],
  },

  // 咽部红肿
  throatRedness: {
    category: 'throatRedness',
    doctorText: '请问咽部是否红肿？',
    options: [
      { label: '咽部红肿', taCode: 'KSZ' },
      { label: '咽部不红肿' },
    ],
  },

  // 寒热细节（选了局部怕热/局部怕冷时展开具体部位）
  chillHeatDetail: {
    category: 'chillHeatDetail',
    doctorText: '请问您的冷热感觉具体表现在哪些部位？可以逐个告诉我。',
    options: [
      { label: '心胸烦热', taCode: 'BHR3', semanticDesc: '胸口心里觉得发热烦躁、心口烦热、胸闷发热', excludeAfter: ['BHR2'] },
      { label: '头发热', taCode: 'BHR4', semanticDesc: '头部觉得发热、头热、头烫、头部发烫', excludeAfter: ['BHR2'] },
      { label: '胃脘热', taCode: 'BHR5', semanticDesc: '胃部区域觉得发热、胃热、胃脘灼热、胃部发烫', excludeAfter: ['BHR2'] },
      { label: '腹部热', taCode: 'BHR6', semanticDesc: '腹部区域觉得发热、肚子热、腹部灼热、腹部发烫', excludeAfter: ['BHR2'] },
      { label: '手心发热', taCode: 'BHR7', semanticDesc: '手掌心发热、手心烫、手热', excludeAfter: ['BHR2'] },
      { label: '脚心发热', taCode: 'BHR8', semanticDesc: '脚掌心发热、脚心烫、脚热、足心发热', excludeAfter: ['BHR2'] },
      { label: '头怕冷', taCode: 'BHR10', semanticDesc: '头部怕冷、头冷、头凉、头部怕风、头部发冷', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '胃脘怕冷', taCode: 'BHR11', semanticDesc: '胃部怕冷、胃脘冷、胃凉、胃部发凉、胃部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '腹部怕冷', taCode: 'BHR12', semanticDesc: '腹部怕冷、肚子冷、肚子凉、腹部发凉、腹部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '手怕冷', taCode: 'BHR13', semanticDesc: '手怕冷、手冷、手凉、手发冷、手部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '脚怕冷', taCode: 'BHR14', semanticDesc: '脚怕冷、脚冷、脚凉、脚发冷、脚部畏寒、足冷', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '腰怕冷', taCode: 'BHR15', semanticDesc: '腰部怕冷、腰冷、腰凉、腰部发冷、腰部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '背怕冷', taCode: 'BHR16', semanticDesc: '背部怕冷、背冷、背凉、后背发冷、背部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '膝盖怕冷', taCode: 'BHR17', semanticDesc: '膝盖怕冷、膝冷、膝凉、膝盖发冷、膝部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '牙齿怕冷', taCode: 'BHR18', semanticDesc: '牙齿怕冷、牙冷、牙齿发凉、牙齿畏寒、遇冷牙疼', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '已说明，没有其他', semanticDesc: '已经说完所有冷热部位，没有其他了' },
    ],
    isFreeInput: true,
  },

  // ── 咳嗽追加问诊（逐一询问，每个症状独立是否题） ──────────────

  coughUrineNight_pyx1: {
    category: 'coughUrineNight_pyx1',
    doctorText: '请问您是否有夜尿多的情况？',
    options: [
      { label: '有', taCode: 'PYX1', severityQuestion: { subjectText: '夜尿多', lighterCode: 'PYX1A', heavierCode: 'PYX1B' } },
      { label: '没有' },
    ],
  },

  coughUrineNight_pyx2: {
    category: 'coughUrineNight_pyx2',
    doctorText: '请问您是否有小便清长的情况？',
    options: [
      { label: '有', taCode: 'PYX2', severityQuestion: { subjectText: '小便清长', lighterCode: 'PYX2A', heavierCode: 'PYX2B' } },
      { label: '没有' },
    ],
  },

  coughChillHeatFluctuation_pqz1: {
    category: 'coughChillHeatFluctuation_pqz1',
    doctorText: '请问您是否有协肋胀满的情况？',
    options: [
      { label: '有', taCode: 'PQZ1', severityQuestion: { subjectText: '协肋胀满', lighterCode: 'PQZ1A', heavierCode: 'PQZ1B' } },
      { label: '没有' },
    ],
  },

  coughChillHeatFluctuation_pqz2: {
    category: 'coughChillHeatFluctuation_pqz2',
    doctorText: '请问您是否有胸闷的情况？',
    options: [
      { label: '有', taCode: 'PQZ2', severityQuestion: { subjectText: '胸闷', lighterCode: 'PQZ2A', heavierCode: 'PQZ2B' } },
      { label: '没有' },
    ],
  },

  coughFatigueQiStagnation_pharynx: {
    category: 'coughFatigueQiStagnation_pharynx',
    doctorText: '请问您是否有咽部异物感的情况？',
    options: [
      { label: '有', taCode: 'PQZ4', severityQuestion: { subjectText: '咽部异物感', lighterCode: 'PQZ4A', heavierCode: 'PQZ4B' } },
      { label: '没有' },
    ],
  },

  coughSkinItchAndPain_pfe1: {
    category: 'coughSkinItchAndPain_pfe1',
    doctorText: '请问您是否有皮肤瘙痒的情况？',
    options: [
      { label: '有', taCode: 'PFE1', severityQuestion: { subjectText: '皮肤瘙痒', lighterCode: 'PFE1A', heavierCode: 'PFE1B' } },
      { label: '没有' },
    ],
  },

  coughSkinItchAndPain_pfe2: {
    category: 'coughSkinItchAndPain_pfe2',
    doctorText: '请问您是否有肢体麻木如有蚁行的情况？',
    options: [
      { label: '有', taCode: 'PFE2', severityQuestion: { subjectText: '肢体麻木如有蚁行', lighterCode: 'PFE2A', heavierCode: 'PFE2B' } },
      { label: '没有' },
    ],
  },

  coughSkinItchAndPain_pfe3: {
    category: 'coughSkinItchAndPain_pfe3',
    doctorText: '请问您是否有游走性疼痛的情况？',
    options: [
      { label: '有', taCode: 'PFE3', severityQuestion: { subjectText: '游走性疼痛', lighterCode: 'PFE3A', heavierCode: 'PFE3B' } },
      { label: '没有' },
    ],
  },

  coughUrineHeatAndBreath_psr1: {
    category: 'coughUrineHeatAndBreath_psr1',
    doctorText: '请问您是否有小便黄赤有热的情况？',
    options: [
      { label: '有', taCode: 'PSR1', severityQuestion: { subjectText: '小便黄赤有热', lighterCode: 'PSR1A', heavierCode: 'PSR1B' } },
      { label: '没有' },
    ],
  },

  coughUrineHeatAndBreath_psr2: {
    category: 'coughUrineHeatAndBreath_psr2',
    doctorText: '请问您是否有气喘粗有热的情况？',
    options: [
      { label: '有', taCode: 'PSR2', severityQuestion: { subjectText: '气喘粗有热', lighterCode: 'PSR2A', heavierCode: 'PSR2B' } },
      { label: '没有' },
    ],
  },

  coughDampHeat_eczema: {
    category: 'coughDampHeat_eczema',
    doctorText: '请问您是否有湿疹的情况？',
    options: [
      { label: '有', taCode: 'PSD1', severityQuestion: { subjectText: '湿疹', lighterCode: 'PSD1A', heavierCode: 'PSD1B' } },
      { label: '没有' },
    ],
  },

  coughDampHeat_footOdor: {
    category: 'coughDampHeat_footOdor',
    doctorText: '请问您是否有脚臭的情况？',
    options: [
      { label: '有', taCode: 'PSD2', severityQuestion: { subjectText: '脚臭', lighterCode: 'PSD2A', heavierCode: 'PSD2B' } },
      { label: '没有' },
    ],
  },

  coughDampHeat_urineTurbid: {
    category: 'coughDampHeat_urineTurbid',
    doctorText: '请问您是否有小便混浊有热的情况？',
    options: [
      { label: '有', taCode: 'PSD3', severityQuestion: { subjectText: '小便混浊有热', lighterCode: 'PSD3A', heavierCode: 'PSD3B' } },
      { label: '没有' },
    ],
  },

  coughDampHeat_urinePain: {
    category: 'coughDampHeat_urinePain',
    doctorText: '请问您是否有小便热痛的情况？',
    options: [
      { label: '有', taCode: 'PXR5', severityQuestion: { subjectText: '小便热痛', lighterCode: 'PXR5A', heavierCode: 'PXR5B' } },
      { label: '没有' },
    ],
  },

  coughTasteABC1_migraine: {
    category: 'coughTasteABC1_migraine',
    doctorText: '请问您是否有偏头痛的情况？',
    options: [
      { label: '有', taCode: 'PQZ3', severityQuestion: { subjectText: '偏头痛', lighterCode: 'PQZ3A', heavierCode: 'PQZ3B' } },
      { label: '没有' },
    ],
  },

  coughTasteABC1_bloating: {
    category: 'coughTasteABC1_bloating',
    doctorText: '请问您是否有腹胀想放屁放不出来的情况？',
    options: [
      { label: '有', taCode: 'PQZ5', severityQuestion: { subjectText: '腹胀想放屁放不出来', lighterCode: 'PQZ5A', heavierCode: 'PQZ5B' } },
      { label: '没有' },
    ],
  },

  coughTasteABC1_burping: {
    category: 'coughTasteABC1_burping',
    doctorText: '请问您是否有呃逆嗳气的情况？',
    options: [
      { label: '有', taCode: 'PQN1', severityQuestion: { subjectText: '呃逆嗳气', lighterCode: 'PQN1A', heavierCode: 'PQN1B' } },
      { label: '没有' },
    ],
  },

  coughTasteABC1_hypochondrium: {
    category: 'coughTasteABC1_hypochondrium',
    doctorText: '请问您是否有协肋胀满的情况？',
    options: [
      { label: '有', taCode: 'PQZ1', severityQuestion: { subjectText: '协肋胀满', lighterCode: 'PQZ1A', heavierCode: 'PQZ1B' } },
      { label: '没有' },
    ],
  },

  coughTasteABC2_gastricPain: {
    category: 'coughTasteABC2_gastricPain',
    doctorText: '请问您是否有胃脘胀满疼痛拒按的情况？',
    options: [
      { label: '有', taCode: 'PSJ1', severityQuestion: { subjectText: '胃脘胀满疼痛拒按', lighterCode: 'PSJ1A', heavierCode: 'PSJ1B' } },
      { label: '没有' },
    ],
  },

  coughTasteABC2_burping: {
    category: 'coughTasteABC2_burping',
    doctorText: '请问您是否有呃逆嗳气的情况？',
    options: [
      { label: '有', taCode: 'PQN1', severityQuestion: { subjectText: '呃逆嗳气', lighterCode: 'PQN1A', heavierCode: 'PQN1B' } },
      { label: '没有' },
    ],
  },

  coughTasteABC2_upperAbdomen: {
    category: 'coughTasteABC2_upperAbdomen',
    doctorText: '请问您是否有上腹部顶得慌的情况？',
    options: [
      { label: '有', taCode: 'PSJ2', severityQuestion: { subjectText: '上腹部顶得慌', lighterCode: 'PSJ2A', heavierCode: 'PSJ2B' } },
      { label: '没有' },
    ],
  },

  coughTasteABC2_foulGas: {
    category: 'coughTasteABC2_foulGas',
    doctorText: '请问您是否有矢气奇臭的情况？',
    options: [
      { label: '有', taCode: 'PSJ3', severityQuestion: { subjectText: '矢气奇臭', lighterCode: 'PSJ3A', heavierCode: 'PSJ3B' } },
      { label: '没有' },
    ],
  },

  coughTasteDryness_drySkin: {
    category: 'coughTasteDryness_drySkin',
    doctorText: '请问您是否有皮肤干燥的情况？',
    options: [
      { label: '有', taCode: 'PYW1', severityQuestion: { subjectText: '皮肤干燥', lighterCode: 'PYW1A', heavierCode: 'PYW1B' } },
      { label: '没有' },
    ],
  },

  coughTasteDryness_chestHeat: {
    category: 'coughTasteDryness_chestHeat',
    doctorText: '请问您是否有心胸烦热的情况？',
    options: [
      { label: '有', taCode: 'PYW2', severityQuestion: { subjectText: '心胸烦热', lighterCode: 'PYW2A', heavierCode: 'PYW2B' } },
      { label: '没有' },
    ],
  },

  coughTasteDryness_tinnitus: {
    category: 'coughTasteDryness_tinnitus',
    doctorText: '请问您是否有耳鸣如蝉的情况？',
    options: [
      { label: '有', taCode: 'PYW3', severityQuestion: { subjectText: '耳鸣如蝉', lighterCode: 'PYW3A', heavierCode: 'PYW3B' } },
      { label: '没有' },
    ],
  },

  coughTasteDryness_dreams: {
    category: 'coughTasteDryness_dreams',
    doctorText: '请问您是否有多梦的情况？',
    options: [
      { label: '有', taCode: 'PYW4', severityQuestion: { subjectText: '多梦', lighterCode: 'PYW4A', heavierCode: 'PYW4B' } },
      { label: '没有' },
    ],
  },

  coughTasteWaterSwelling_bigBelly: {
    category: 'coughTasteWaterSwelling_bigBelly',
    doctorText: '请问您是否有肚子大的情况？',
    options: [
      { label: '有', taCode: 'PSQ1', severityQuestion: { subjectText: '肚子大', lighterCode: 'PSQ1A', heavierCode: 'PSQ1B' } },
      { label: '没有' },
    ],
  },

  coughTasteWaterSwelling_heavy: {
    category: 'coughTasteWaterSwelling_heavy',
    doctorText: '请问您是否有沉重的情况？',
    options: [
      { label: '有', taCode: 'PSQ2', severityQuestion: { subjectText: '沉重', lighterCode: 'PSQ2A', heavierCode: 'PSQ2B' } },
      { label: '没有' },
    ],
  },

  coughTasteWaterSwelling_swelling: {
    category: 'coughTasteWaterSwelling_swelling',
    doctorText: '请问您是否有局部肿胀的情况？',
    options: [
      { label: '有', taCode: 'PSQ3', severityQuestion: { subjectText: '局部肿胀', lighterCode: 'PSQ3A', heavierCode: 'PSQ3B' } },
      { label: '没有' },
    ],
  },

  coughTasteWaterSwelling_morningStiff: {
    category: 'coughTasteWaterSwelling_morningStiff',
    doctorText: '请问您是否有晨僵的情况？',
    options: [
      { label: '有', taCode: 'PSQ4', severityQuestion: { subjectText: '晨僵', lighterCode: 'PSQ4A', heavierCode: 'PSQ4B' } },
      { label: '没有' },
    ],
  },

  coughStoolDryPain: {
    category: 'coughStoolDryPain',
    doctorText: '请问您是否有脐周或腹部疼痛拒按的情况？',
    options: [
      { label: '有', taCode: 'PCJ1', severityQuestion: { subjectText: '脐周或腹部疼痛拒按', lighterCode: 'PCJ1A', heavierCode: 'PCJ1B' } },
      { label: '没有' },
    ],
  },

  coughStoolCoughAndBreath_cough: {
    category: 'coughStoolCoughAndBreath_cough',
    doctorText: '请问您是否有咳嗽的情况？',
    options: [
      { label: '有', taCode: 'PQN2', severityQuestion: { subjectText: '咳嗽', lighterCode: 'PQN2A', heavierCode: 'PQN2B', followUpQuestions: ['coughPQN2_phlegmColor'] } },
      { label: '没有' },
    ],
  },

  // PQN2 追问：咳嗽痰色（程度追问完成后触发）
  coughPQN2_phlegmColor: {
    category: 'coughPQN2_phlegmColor',
    doctorText: '请问咳嗽时痰是什么颜色？',
    options: [
      { label: '痰白', taCode: 'PQN2C' },
      { label: '痰黄', taCode: 'PQN2D' },
      { label: '说不清楚', taCode: 'PQN2E' },
    ],
    isFreeInput: true,
  },

  coughStoolCoughAndBreath_breath: {
    category: 'coughStoolCoughAndBreath_breath',
    doctorText: '请问您是否有气喘的情况？',
    options: [
      { label: '有', taCode: 'PQN3', severityQuestion: { subjectText: '气喘', lighterCode: 'PQN3A', heavierCode: 'PQN3B' } },
      { label: '没有' },
    ],
  },

  coughStoolAnusDrop_drop: {
    category: 'coughStoolAnusDrop_drop',
    doctorText: '请问您是否有肛门下坠感的情况？',
    options: [
      { label: '有', taCode: 'PQX2', severityQuestion: { subjectText: '肛门下坠感', lighterCode: 'PQX2A', heavierCode: 'PQX2B' } },
      { label: '没有' },
    ],
  },

  coughStoolAnusDrop_prolapse: {
    category: 'coughStoolAnusDrop_prolapse',
    doctorText: '请问您是否有肛门脱垂的情况？',
    options: [
      { label: '有', taCode: 'PQX3', severityQuestion: { subjectText: '肛门脱垂', lighterCode: 'PQX3A', heavierCode: 'PQX3B' } },
      { label: '没有' },
    ],
  },
}

// ── 咳嗽问诊序列 ──────────────────────────────────────────────
export const COUGH_QUESTION_SEQUENCE: Record<string, string[]> = {
  '干咳': ['dryCoughBlood', 'dryCoughNight', 'dryCoughSpasm', 'dryCoughAnger', 'throatItch', 'throatRedness', 'chillHeat', 'chillHeatSpecial', 'thirst', 'tastePungentIntro', 'tasteDryWet', 'tasteSticky', 'stoolConstipation'],
  '咳痰发白色': ['whiteSputumNature', 'coughVoiceDull', 'throatItch', 'throatRedness', 'chillHeat', 'chillHeatSpecial', 'thirst', 'tastePungentIntro', 'tasteDryWet', 'tasteSticky', 'stoolConstipation'],
  '咳痰发黄色': ['yellowSputumSmell', 'coughVoiceLoud', 'throatItch', 'throatRedness', 'chillHeat', 'chillHeatSpecial', 'thirst', 'tastePungentIntro', 'tasteDryWet', 'tasteSticky', 'stoolConstipation'],
  '咳痰发青绿色': ['greenSputumSmell', 'throatItch', 'throatRedness', 'chillHeat', 'chillHeatSpecial', 'thirst', 'tastePungentIntro', 'tasteDryWet', 'tasteSticky', 'stoolConstipation'],
}

// ── 失眠问诊问题库 ────────────────────────────────────────────
export const INSOMNIA_QUESTIONS: Record<string, IDetailQuestion> = {
  // 第1题：入睡困难类型
  sleepDifficulty: {
    category: 'sleepDifficulty',
    doctorText: '请问您入睡困难的情况是怎样的？',
    options: [
      { label: '有困意入睡困难', taCode: 'BSM1', severityQuestion: { subjectText: '有困意入睡困难', lighterCode: 'BSM1A', heavierCode: 'BSM1B' }, followUpQuestions: ['insomniaBloodHeat_rash', 'insomniaBloodHeat_acne', 'insomniaBloodHeat_irritability', 'insomniaBloodHeat_bleeding', 'insomniaBloodHeat_urinePain'] },
      { label: '无困意入睡困难', taCode: 'BSM2', severityQuestion: { subjectText: '无困意入睡困难', lighterCode: 'BSM2A', heavierCode: 'BSM2B' }, followUpQuestions: ['insomniaBloodHeat_rash', 'insomniaBloodHeat_acne', 'insomniaBloodHeat_irritability', 'insomniaBloodHeat_bleeding', 'insomniaBloodHeat_urinePain'] },
      { label: '入睡没有困难', taCode: 'BSM' },
    ],
    isFreeInput: true,
  },

  // 第2题：睡后易醒
  wakePattern: {
    category: 'wakePattern',
    doctorText: '请问您睡后容易醒吗？醒的时间大概在哪个时段？',
    options: [
      { label: '11-1点易醒', taCode: 'BSM3', semanticDesc: '半夜11点到凌晨1点之间容易醒来', followUpQuestions: ['insomniaBloodHeat_rash', 'insomniaBloodHeat_acne', 'insomniaBloodHeat_irritability', 'insomniaBloodHeat_bleeding', 'insomniaBloodHeat_urinePain'] },
      { label: '1-3点易醒', taCode: 'BSM4', semanticDesc: '凌晨1点到3点之间容易醒来', followUpQuestions: ['insomniaBloodHeat_rash', 'insomniaBloodHeat_acne', 'insomniaBloodHeat_irritability', 'insomniaBloodHeat_bleeding', 'insomniaBloodHeat_urinePain'] },
      { label: '3-5点易醒', taCode: 'BSM5', semanticDesc: '凌晨3点到5点之间容易醒来' },
      { label: '不定时易醒', taCode: 'BSM6', semanticDesc: '醒的时间不固定随时可能醒' },
      { label: '不容易醒', taCode: 'BSM', semanticDesc: '睡着后不容易醒睡眠稳定' },
    ],
    isFreeInput: true,
  },

  // 心脏相关：心悸
  heartPalpitation: {
    category: 'heartPalpitation',
    doctorText: '请问您是否有心悸？',
    options: [
      { label: '心悸较轻', taCode: 'PXZ1A' },
      { label: '心悸较重', taCode: 'PXZ1B' },
      { label: '没有心悸', taCode: 'PXZ1' },
    ],
  },

  // 心脏相关：心中疼痛类型
  heartPainType: {
    category: 'heartPainType',
    doctorText: '请问您心中疼痛的性质？',
    options: [
      { label: '闷痛', taCode: 'PXZ2', severityQuestion: { subjectText: '心中闷痛', lighterCode: 'PXZ2A', heavierCode: 'PXZ2B' } },
      { label: '刺痛', taCode: 'PXZ3', severityQuestion: { subjectText: '心中刺痛', lighterCode: 'PXZ3A', heavierCode: 'PXZ3B' } },
      { label: '冷痛', taCode: 'PXZ4', severityQuestion: { subjectText: '心中冷痛', lighterCode: 'PXZ4A', heavierCode: 'PXZ4B' } },
      { label: '胀痛', taCode: 'PXZ5', severityQuestion: { subjectText: '心中胀痛', lighterCode: 'PXZ5A', heavierCode: 'PXZ5B' } },
      { label: '没有心中疼痛', taCode: 'PXZ' },
    ],
  },

  // 心脏相关：胸闷
  chestTightness: {
    category: 'chestTightness',
    doctorText: '请问您是否有胸闷？',
    options: [
      { label: '胸闷较轻', taCode: 'PQZ2A' },
      { label: '胸闷较重', taCode: 'PQZ2B' },
      { label: '没有胸闷', taCode: 'PQZ2' },
    ],
  },

  // 局部怕热：具体发热部位（选了局部怕热时展开）
  chillHeatLocalHeat: {
    category: 'chillHeatLocalHeat',
    doctorText: '请问您局部怕热具体表现在哪些部位？',
    options: [
      { label: '心胸烦热', taCode: 'BHR3', semanticDesc: '胸口心里觉得发热烦躁、心口烦热、胸闷发热' },
      { label: '头发热', taCode: 'BHR4', semanticDesc: '头部觉得发热、头热、头烫、头部发烫' },
      { label: '胃脘热', taCode: 'BHR5', semanticDesc: '胃部区域觉得发热、胃热、胃脘灼热、胃部发烫' },
      { label: '腹部热', taCode: 'BHR6', semanticDesc: '腹部区域觉得发热、肚子热、腹部灼热、腹部发烫' },
      { label: '手心发热', taCode: 'BHR7', semanticDesc: '手掌心发热、手心烫、手热' },
      { label: '脚心发热', taCode: 'BHR8', semanticDesc: '脚掌心发热、脚心烫、脚热、足心发热' },
      { label: '已说明，没有其他', semanticDesc: '已经说完所有冷热部位，没有其他了' },
    ],
    isFreeInput: true,
  },

  // 局部怕冷：具体怕冷部位（选了局部怕冷时展开）
  chillHeatLocalCold: {
    category: 'chillHeatLocalCold',
    doctorText: '请问您局部怕冷具体表现在哪些部位？',
    options: [
      { label: '头怕冷', taCode: 'BHR10', semanticDesc: '头部怕冷、头冷、头凉、头部怕风、头部发冷', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '胃脘怕冷', taCode: 'BHR11', semanticDesc: '胃部怕冷、胃脘冷、胃凉、胃部发凉、胃部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '腹部怕冷', taCode: 'BHR12', semanticDesc: '腹部怕冷、肚子冷、肚子凉、腹部发凉、腹部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '手怕冷', taCode: 'BHR13', semanticDesc: '手怕冷、手冷、手凉、手发冷、手部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '脚怕冷', taCode: 'BHR14', semanticDesc: '脚怕冷、脚冷、脚凉、脚发冷、脚部畏寒、足冷', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '腰怕冷', taCode: 'BHR15', semanticDesc: '腰部怕冷、腰冷、腰凉、腰部发冷、腰部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '背怕冷', taCode: 'BHR16', semanticDesc: '背部怕冷、背冷、背凉、后背发冷、背部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '膝盖怕冷', taCode: 'BHR17', semanticDesc: '膝盖怕冷、膝冷、膝凉、膝盖发冷、膝部畏寒', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '牙齿怕冷', taCode: 'BHR18', semanticDesc: '牙齿怕冷、牙冷、牙齿发凉、牙齿畏寒、遇冷牙疼', followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '已说明，没有其他', semanticDesc: '已经说完所有冷热部位，没有其他了' },
    ],
    isFreeInput: true,
  },

  // ── 失眠追加问诊（逐一询问，每个症状独立是否题） ──────────

  insomniaBloodHeat_rash: {
    category: 'insomniaBloodHeat_rash',
    doctorText: '请问您是否有皮肤红疹的情况？',
    options: [
      { label: '有', taCode: 'PXR1', severityQuestion: { subjectText: '皮肤红疹', lighterCode: 'PXR1A', heavierCode: 'PXR1B' } },
      { label: '没有', taCode: 'PXR1' },
    ],
  },

  insomniaBloodHeat_acne: {
    category: 'insomniaBloodHeat_acne',
    doctorText: '请问您是否有皮肤痤疮红肿的情况？',
    options: [
      { label: '有', taCode: 'PXR2', severityQuestion: { subjectText: '皮肤痤疮红肿', lighterCode: 'PXR2A', heavierCode: 'PXR2B' } },
      { label: '没有', taCode: 'PXR2' },
    ],
  },

  insomniaBloodHeat_irritability: {
    category: 'insomniaBloodHeat_irritability',
    doctorText: '请问您是否有心烦夜间加重的情况？',
    options: [
      { label: '有', taCode: 'PXR3', severityQuestion: { subjectText: '心烦夜间加重', lighterCode: 'PXR3A', heavierCode: 'PXR3B' } },
      { label: '没有', taCode: 'PXR3' },
    ],
  },

  insomniaBloodHeat_bleeding: {
    category: 'insomniaBloodHeat_bleeding',
    doctorText: '请问您是否有各种出血鲜红发热的情况？',
    options: [
      { label: '有', taCode: 'PXR4', severityQuestion: { subjectText: '各种出血鲜红发热', lighterCode: 'PXR4A', heavierCode: 'PXR4B' } },
      { label: '没有', taCode: 'PXR4' },
    ],
  },

  insomniaBloodHeat_urinePain: {
    category: 'insomniaBloodHeat_urinePain',
    doctorText: '请问您是否有小便热痛的情况？',
    options: [
      { label: '有', taCode: 'PXR5', severityQuestion: { subjectText: '小便热痛', lighterCode: 'PXR5A', heavierCode: 'PXR5B' } },
      { label: '没有', taCode: 'PXR5' },
    ],
  },

  insomniaUrineNight_pyx1: {
    category: 'insomniaUrineNight_pyx1',
    doctorText: '请问您是否有夜尿多的情况？',
    options: [
      { label: '有', taCode: 'PYX1', severityQuestion: { subjectText: '夜尿多', lighterCode: 'PYX1A', heavierCode: 'PYX1B' } },
      { label: '没有', taCode: 'PYX1' },
    ],
  },

  insomniaUrineNight_pyx2: {
    category: 'insomniaUrineNight_pyx2',
    doctorText: '请问您是否有小便清长的情况？',
    options: [
      { label: '有', taCode: 'PYX2', severityQuestion: { subjectText: '小便清长', lighterCode: 'PYX2A', heavierCode: 'PYX2B' } },
      { label: '没有', taCode: 'PYX2' },
    ],
  },

  insomniaChillHeatFluctuation_pqz1: {
    category: 'insomniaChillHeatFluctuation_pqz1',
    doctorText: '请问您是否有协肋胀满的情况？',
    options: [
      { label: '有', taCode: 'PQZ1', severityQuestion: { subjectText: '协肋胀满', lighterCode: 'PQZ1A', heavierCode: 'PQZ1B' } },
      { label: '没有', taCode: 'PQZ1' },
    ],
  },

  insomniaChillHeatFluctuation_pqz2: {
    category: 'insomniaChillHeatFluctuation_pqz2',
    doctorText: '请问您是否有胸闷的情况？',
    options: [
      { label: '有', taCode: 'PQZ2', severityQuestion: { subjectText: '胸闷', lighterCode: 'PQZ2A', heavierCode: 'PQZ2B' } },
      { label: '没有', taCode: 'PQZ2' },
    ],
  },

  insomniaSkinItchAndPain_pfe1: {
    category: 'insomniaSkinItchAndPain_pfe1',
    doctorText: '请问您是否有皮肤瘙痒的情况？',
    options: [
      { label: '有', taCode: 'PFE1', severityQuestion: { subjectText: '皮肤瘙痒', lighterCode: 'PFE1A', heavierCode: 'PFE1B' } },
      { label: '没有', taCode: 'PFE1' },
    ],
  },

  insomniaSkinItchAndPain_pfe2: {
    category: 'insomniaSkinItchAndPain_pfe2',
    doctorText: '请问您是否有肢体麻木如有蚁行的情况？',
    options: [
      { label: '有', taCode: 'PFE2', severityQuestion: { subjectText: '肢体麻木如有蚁行', lighterCode: 'PFE2A', heavierCode: 'PFE2B' } },
      { label: '没有', taCode: 'PFE2' },
    ],
  },

  insomniaSkinItchAndPain_pfe3: {
    category: 'insomniaSkinItchAndPain_pfe3',
    doctorText: '请问您是否有游走性疼痛的情况？',
    options: [
      { label: '有', taCode: 'PFE3', severityQuestion: { subjectText: '游走性疼痛', lighterCode: 'PFE3A', heavierCode: 'PFE3B' } },
      { label: '没有', taCode: 'PFE3' },
    ],
  },

  insomniaUrineHeatAndBreath_psr1: {
    category: 'insomniaUrineHeatAndBreath_psr1',
    doctorText: '请问您是否有小便黄赤有热的情况？',
    options: [
      { label: '有', taCode: 'PSR1', severityQuestion: { subjectText: '小便黄赤有热', lighterCode: 'PSR1A', heavierCode: 'PSR1B' } },
      { label: '没有', taCode: 'PSR1' },
    ],
  },

  insomniaUrineHeatAndBreath_psr2: {
    category: 'insomniaUrineHeatAndBreath_psr2',
    doctorText: '请问您是否有气喘粗有热的情况？',
    options: [
      { label: '有', taCode: 'PSR2', severityQuestion: { subjectText: '气喘粗有热', lighterCode: 'PSR2A', heavierCode: 'PSR2B' } },
      { label: '没有', taCode: 'PSR2' },
    ],
  },

  insomniaDampHeat_eczema: {
    category: 'insomniaDampHeat_eczema',
    doctorText: '请问您是否有湿疹的情况？',
    options: [
      { label: '有', taCode: 'PSD1', severityQuestion: { subjectText: '湿疹', lighterCode: 'PSD1A', heavierCode: 'PSD1B' } },
      { label: '没有', taCode: 'PSD1' },
    ],
  },

  insomniaDampHeat_footOdor: {
    category: 'insomniaDampHeat_footOdor',
    doctorText: '请问您是否有脚臭的情况？',
    options: [
      { label: '有', taCode: 'PSD2', severityQuestion: { subjectText: '脚臭', lighterCode: 'PSD2A', heavierCode: 'PSD2B' } },
      { label: '没有', taCode: 'PSD2' },
    ],
  },

  insomniaDampHeat_urineTurbid: {
    category: 'insomniaDampHeat_urineTurbid',
    doctorText: '请问您是否有小便混浊有热的情况？',
    options: [
      { label: '有', taCode: 'PSD3', severityQuestion: { subjectText: '小便混浊有热', lighterCode: 'PSD3A', heavierCode: 'PSD3B' } },
      { label: '没有', taCode: 'PSD3' },
    ],
  },

  insomniaDampHeat_urineYellowHeat: {
    category: 'insomniaDampHeat_urineYellowHeat',
    doctorText: '请问您是否有小便黄赤有热的情况？',
    options: [
      { label: '有', taCode: 'PSR1', severityQuestion: { subjectText: '小便黄赤有热', lighterCode: 'PSR1A', heavierCode: 'PSR1B' } },
      { label: '没有', taCode: 'PSR1' },
    ],
  },

  insomniaDampHeat_urinePain: {
    category: 'insomniaDampHeat_urinePain',
    doctorText: '请问您是否有小便热痛的情况？',
    options: [
      { label: '有', taCode: 'PXR5', severityQuestion: { subjectText: '小便热痛', lighterCode: 'PXR5A', heavierCode: 'PXR5B' } },
      { label: '没有', taCode: 'PXR5' },
    ],
  },

  insomniaTasteABC1_migraine: {
    category: 'insomniaTasteABC1_migraine',
    doctorText: '请问您是否有偏头痛的情况？',
    options: [
      { label: '有', taCode: 'PQZ3', severityQuestion: { subjectText: '偏头痛', lighterCode: 'PQZ3A', heavierCode: 'PQZ3B' } },
      { label: '没有', taCode: 'PQZ3' },
    ],
  },

  insomniaTasteABC1_bloating: {
    category: 'insomniaTasteABC1_bloating',
    doctorText: '请问您是否有腹胀想放屁放不出来的情况？',
    options: [
      { label: '有', taCode: 'PQZ5', severityQuestion: { subjectText: '腹胀想放屁放不出来', lighterCode: 'PQZ5A', heavierCode: 'PQZ5B' } },
      { label: '没有', taCode: 'PQZ5' },
    ],
  },

  insomniaTasteABC1_burping: {
    category: 'insomniaTasteABC1_burping',
    doctorText: '请问您是否有呃逆嗳气的情况？',
    options: [
      { label: '有', taCode: 'PQN1', severityQuestion: { subjectText: '呃逆嗳气', lighterCode: 'PQN1A', heavierCode: 'PQN1B' } },
      { label: '没有', taCode: 'PQN1' },
    ],
  },

  insomniaTasteABC1_hypochondrium: {
    category: 'insomniaTasteABC1_hypochondrium',
    doctorText: '请问您是否有协肋胀满的情况？',
    options: [
      { label: '有', taCode: 'PQZ1', severityQuestion: { subjectText: '协肋胀满', lighterCode: 'PQZ1A', heavierCode: 'PQZ1B' } },
      { label: '没有', taCode: 'PQZ1' },
    ],
  },

  insomniaTasteABC2_gastricPain: {
    category: 'insomniaTasteABC2_gastricPain',
    doctorText: '请问您是否有胃脘胀满疼痛拒按的情况？',
    options: [
      { label: '有', taCode: 'PSJ1', severityQuestion: { subjectText: '胃脘胀满疼痛拒按', lighterCode: 'PSJ1A', heavierCode: 'PSJ1B' } },
      { label: '没有', taCode: 'PSJ1' },
    ],
  },

  insomniaTasteABC2_burping: {
    category: 'insomniaTasteABC2_burping',
    doctorText: '请问您是否有呃逆嗳气的情况？',
    options: [
      { label: '有', taCode: 'PQN1', severityQuestion: { subjectText: '呃逆嗳气', lighterCode: 'PQN1A', heavierCode: 'PQN1B' } },
      { label: '没有', taCode: 'PQN1' },
    ],
  },

  insomniaTasteABC2_upperAbdomen: {
    category: 'insomniaTasteABC2_upperAbdomen',
    doctorText: '请问您是否有上腹部顶得慌的情况？',
    options: [
      { label: '有', taCode: 'PSJ2', severityQuestion: { subjectText: '上腹部顶得慌', lighterCode: 'PSJ2A', heavierCode: 'PSJ2B' } },
      { label: '没有', taCode: 'PSJ2' },
    ],
  },

  insomniaTasteABC2_foulGas: {
    category: 'insomniaTasteABC2_foulGas',
    doctorText: '请问您是否有矢气奇臭的情况？',
    options: [
      { label: '有', taCode: 'PSJ3', severityQuestion: { subjectText: '矢气奇臭', lighterCode: 'PSJ3A', heavierCode: 'PSJ3B' } },
      { label: '没有', taCode: 'PSJ3' },
    ],
  },

  insomniaTasteDryness_drySkin: {
    category: 'insomniaTasteDryness_drySkin',
    doctorText: '请问您是否有皮肤干燥的情况？',
    options: [
      { label: '有', taCode: 'PYW1', severityQuestion: { subjectText: '皮肤干燥', lighterCode: 'PYW1A', heavierCode: 'PYW1B' } },
      { label: '没有', taCode: 'PYW1' },
    ],
  },

  insomniaTasteDryness_chestHeat: {
    category: 'insomniaTasteDryness_chestHeat',
    doctorText: '请问您是否有心胸烦热的情况？',
    options: [
      { label: '有', taCode: 'PYW2', severityQuestion: { subjectText: '心胸烦热', lighterCode: 'PYW2A', heavierCode: 'PYW2B' } },
      { label: '没有', taCode: 'PYW2' },
    ],
  },

  insomniaTasteDryness_tinnitus: {
    category: 'insomniaTasteDryness_tinnitus',
    doctorText: '请问您是否有耳鸣如蝉的情况？',
    options: [
      { label: '有', taCode: 'PYW3', severityQuestion: { subjectText: '耳鸣如蝉', lighterCode: 'PYW3A', heavierCode: 'PYW3B' } },
      { label: '没有', taCode: 'PYW3' },
    ],
  },

  insomniaTasteDryness_dreams: {
    category: 'insomniaTasteDryness_dreams',
    doctorText: '请问您是否有多梦的情况？',
    options: [
      { label: '有', taCode: 'PYW4', severityQuestion: { subjectText: '多梦', lighterCode: 'PYW4A', heavierCode: 'PYW4B' } },
      { label: '没有', taCode: 'PYW4' },
    ],
  },

  insomniaSwelling_bigBelly: {
    category: 'insomniaSwelling_bigBelly',
    doctorText: '请问您是否有肚子大的情况？',
    options: [
      { label: '有', taCode: 'PSQ1', severityQuestion: { subjectText: '肚子大', lighterCode: 'PSQ1A', heavierCode: 'PSQ1B' } },
      { label: '没有', taCode: 'PSQ1' },
    ],
  },

  insomniaSwelling_heavy: {
    category: 'insomniaSwelling_heavy',
    doctorText: '请问您是否有沉重的情况？',
    options: [
      { label: '有', taCode: 'PSQ2', severityQuestion: { subjectText: '沉重', lighterCode: 'PSQ2A', heavierCode: 'PSQ2B' } },
      { label: '没有', taCode: 'PSQ2' },
    ],
  },

  insomniaSwelling_swelling: {
    category: 'insomniaSwelling_swelling',
    doctorText: '请问您是否有局部肿胀的情况？',
    options: [
      { label: '有', taCode: 'PSQ3', severityQuestion: { subjectText: '局部肿胀', lighterCode: 'PSQ3A', heavierCode: 'PSQ3B' } },
      { label: '没有', taCode: 'PSQ3' },
    ],
  },

  insomniaSwelling_morningStiff: {
    category: 'insomniaSwelling_morningStiff',
    doctorText: '请问您是否有晨僵的情况？',
    options: [
      { label: '有', taCode: 'PSQ4', severityQuestion: { subjectText: '晨僵', lighterCode: 'PSQ4A', heavierCode: 'PSQ4B' } },
      { label: '没有', taCode: 'PSQ4' },
    ],
  },

  insomniaStoolCoughAndBreath_cough: {
    category: 'insomniaStoolCoughAndBreath_cough',
    doctorText: '请问您是否有咳嗽的情况？',
    options: [
      { label: '有', taCode: 'PQN2', severityQuestion: { subjectText: '咳嗽', lighterCode: 'PQN2A', heavierCode: 'PQN2B' } },
      { label: '没有', taCode: 'PQN2' },
    ],
  },

  insomniaStoolCoughAndBreath_breath: {
    category: 'insomniaStoolCoughAndBreath_breath',
    doctorText: '请问您是否有气喘的情况？',
    options: [
      { label: '有', taCode: 'PQN3', severityQuestion: { subjectText: '气喘', lighterCode: 'PQN3A', heavierCode: 'PQN3B' } },
      { label: '没有', taCode: 'PQN3' },
    ],
  },

  insomniaStoolDryPain: {
    category: 'insomniaStoolDryPain',
    doctorText: '请问您是否有脐周或腹部疼痛拒按的情况？',
    options: [
      { label: '有', taCode: 'PCJ1', severityQuestion: { subjectText: '脐周或腹部疼痛拒按', lighterCode: 'PCJ1A', heavierCode: 'PCJ1B' } },
      { label: '没有', taCode: 'PCJ1' },
    ],
  },

  insomniaStoolAnusDrop_drop: {
    category: 'insomniaStoolAnusDrop_drop',
    doctorText: '请问您是否有肛门下坠感的情况？',
    options: [
      { label: '有', taCode: 'PQX2', severityQuestion: { subjectText: '肛门下坠感', lighterCode: 'PQX2A', heavierCode: 'PQX2B' } },
      { label: '没有', taCode: 'PQX2' },
    ],
  },

  insomniaStoolAnusDrop_prolapse: {
    category: 'insomniaStoolAnusDrop_prolapse',
    doctorText: '请问您是否有肛门脱垂的情况？',
    options: [
      { label: '有', taCode: 'PQX3', severityQuestion: { subjectText: '肛门脱垂', lighterCode: 'PQX3A', heavierCode: 'PQX3B' } },
      { label: '没有', taCode: 'PQX3' },
    ],
  },

}

// ── 失眠问诊序列 ──────────────────────────────────────────────
// 文档顺序：一入睡困难 → 二睡后易醒 → 三心脏/血热(追问) → 大便 → 四寒热 → 口渴 → 口味 → 出汗 → 乏力
export const INSOMNIA_QUESTION_SEQUENCE: Record<string, string[]> = {
  '有困意入睡困难': ['wakePattern', 'stoolConstipation', 'chillHeat', 'chillHeatSpecial', 'thirst', 'tastePungentIntro', 'tasteDryWet', 'tasteSticky', 'sweat', 'fatigue', 'fatigueShortBreath', 'fatigueEasyCold'],
  '无困意入睡困难': ['wakePattern', 'stoolConstipation', 'chillHeat', 'chillHeatSpecial', 'thirst', 'tastePungentIntro', 'tasteDryWet', 'tasteSticky', 'sweat', 'fatigue', 'fatigueShortBreath', 'fatigueEasyCold'],
  '入睡没有困难': ['wakePattern', 'stoolConstipation', 'chillHeat', 'chillHeatSpecial', 'thirst', 'tastePungentIntro', 'tasteDryWet', 'tasteSticky', 'sweat', 'fatigue', 'fatigueShortBreath', 'fatigueEasyCold'],
}

// ── 慢性疲劳问诊问题库 ────────────────────────────────────────
export const FATIGUE_QUESTIONS: Record<string, IDetailQuestion> = {
  // 第1题：寒热感觉
  chillHeat: {
    category: 'chillHeat',
    doctorText: '请问您的寒热感觉是怎样的？',
    options: [
      { label: '整体怕冷', taCode: 'TB3A' },
      { label: '整体怕热', taCode: 'TB3B' },
      { label: '脘腹喜温喜按', taCode: 'TB3C', semanticDesc: '胃腹部觉得冷暖和按压后舒服' },
      { label: '头部怕冷', taCode: 'TB3E' },
      { label: '手脚怕冷', taCode: 'TB3F' },
      { label: '局部肌肉怕冷', taCode: 'TB3G' },
    ],
    isFreeInput: true,
  },

  // 口渴与喝水
  thirst: {
    category: 'thirst',
    doctorText: '请问您的口渴和喝水情况？',
    options: [
      { label: '口不渴', taCode: 'TA3A' },
      { label: '口渴喜热饮', taCode: 'TA3B' },
      { label: '口渴喜凉饮', taCode: 'TA3C' },
      { label: '口干但不想喝水', taCode: 'TA3D' },
      { label: '口中水多', taCode: 'TA3E' },
    ],
  },

  // 口味
  taste: {
    category: 'taste',
    doctorText: '请问您的口味情况？',
    options: [
      { label: '口苦', taCode: 'TA4A' },
      { label: '口臭', taCode: 'TA4B' },
      { label: '口酸', taCode: 'TA4C' },
      { label: '口涩', taCode: 'TA4D' },
      { label: '口咸', taCode: 'TA4E' },
      { label: '口淡无味', taCode: 'TA4F' },
      { label: '口甜', taCode: 'TA4G' },
    ],
  },

  // 饮食情况
  appetite: {
    category: 'appetite',
    doctorText: '请问您最近的吃饭情况如何？',
    options: [
      { label: '食欲不振', taCode: 'TA5A' },
      { label: '能吃', taCode: 'TA5B' },
      { label: '见食而烦', taCode: 'TA5C' },
    ],
  },

  // 出汗情况
  sweat: {
    category: 'sweat',
    doctorText: '请问您的出汗情况？',
    options: [
      { label: '不出汗', taCode: 'TA6A' },
      { label: '自汗', taCode: 'TA6B' },
      { label: '盗汗', taCode: 'TA6C' },
    ],
  },

  // 大便情况
  stool: {
    category: 'stool',
    doctorText: '请问您的大便情况？',
    options: [
      { label: '大便稀溏不热', taCode: 'TA7A' },
      { label: '大便稀溏发热', taCode: 'TA7B' },
      { label: '大便干结', taCode: 'TA7C' },
      { label: '先干后稀', taCode: 'TA7D' },
      { label: '时干时稀', taCode: 'TA7E' },
      { label: '大便带血', taCode: 'TA7F' },
    ],
  },

  // 小便情况
  urine: {
    category: 'urine',
    doctorText: '请问您的小便情况？',
    options: [
      { label: '小便发热发黄', taCode: 'TA8A' },
      { label: '小便清长', taCode: 'TA8B' },
      { label: '小便不利', taCode: 'TA8C' },
      { label: '小便带血发热', taCode: 'TA8D' },
      { label: '小便带血不热', taCode: 'TA8E' },
    ],
  },

  // 睡眠状况
  sleep: {
    category: 'sleep',
    doctorText: '请问您的睡眠情况？',
    options: [
      { label: '入睡困难', taCode: 'TA9A' },
      { label: '睡后易醒', taCode: 'TA9B' },
      { label: '嗜睡', taCode: 'TA9C' },
    ],
  },

  // 心烦情况
  mood: {
    category: 'mood',
    doctorText: '请问您的心烦情况？',
    options: [
      { label: '白天心烦', taCode: 'TA11A' },
      { label: '夜间心烦', taCode: 'TA11B' },
      { label: '白天心烦夜间安静', taCode: 'TA11C' },
    ],
  },
}

// ── 慢性疲劳问诊序列（线性，不分分支） ──────────────────────────
export const FATIGUE_QUESTION_SEQUENCE = {
  '整体怕冷': ['thirst', 'taste', 'appetite', 'sweat', 'stool', 'urine', 'sleep', 'mood'],
  '整体怕热': ['thirst', 'taste', 'appetite', 'sweat', 'stool', 'urine', 'sleep', 'mood'],
  '脘腹喜温喜按': ['thirst', 'taste', 'appetite', 'sweat', 'stool', 'urine', 'sleep', 'mood'],
  '头部怕冷': ['thirst', 'taste', 'appetite', 'sweat', 'stool', 'urine', 'sleep', 'mood'],
  '手脚怕冷': ['thirst', 'taste', 'appetite', 'sweat', 'stool', 'urine', 'sleep', 'mood'],
  '局部肌肉怕冷': ['thirst', 'taste', 'appetite', 'sweat', 'stool', 'urine', 'sleep', 'mood'],
}

// ── 寒热术语解释 ──────────────────────────────────────────────
export const CHILL_HEAT_EXPLANATIONS: Record<string, string> = {
  '单独怕冷': '就是只觉得冷、不怕热，穿衣服比别人多、怕吹风。',
  '单独发热': '就是只觉得热、不怕冷，穿衣服比别人少、喜欢凉的东西。',
  '怕冷同时发热': '同时感觉既怕冷又发热，比如觉得冷但是体温偏高。',
  '寒热往来': '一阵冷一阵热，交替出现，时冷时热。',
  '夜热早凉': '白天体温正常或偏低，到了晚上开始发热。',
  '寒热不明显': '没有特别怕冷或怕热的感觉，体温基本正常。',
}

// ── 头痛问诊问题库 ────────────────────────────────────────────
export const HEADACHE_QUESTIONS: Record<string, IDetailQuestion> = {
  // 第1题：头痛位置（所有分支首题）
  headacheLocation: {
    category: 'headacheLocation',
    doctorText: '请问您的头痛主要在哪个位置？如果不太理解这些术语，我可以逐一为您解释。',
    options: [
      { label: '前额痛', taCode: 'TB1', semanticDesc: '前额痛/额头痛/额头疼/眉骨痛/前头疼/眉毛上方痛/前额疼/额头部位痛' },
      { label: '偏头痛', taCode: 'TB2', semanticDesc: '偏头痛/头一边痛/头痛在一侧/左边头痛/右边头痛/头侧痛/单侧头痛/偏头疼/半边头痛/头一边疼' },
      { label: '后头痛', taCode: 'TB3', semanticDesc: '后头痛/后脑勺痛/后脑疼/头后部痛/后头疼/脖子上面痛/枕部痛/后脑勺疼' },
      { label: '颠顶痛', taCode: 'TB4', semanticDesc: '头顶最高处痛/颠顶痛/头顶痛/头顶疼/百会痛/头顶中心痛/头顶最高处疼/头顶部位痛' },
      { label: '全头痛', taCode: 'TB5', semanticDesc: '全头痛/整个头都痛/全头疼/满头痛/整个头疼/头痛范围大/头痛到处都痛/脑袋全痛' },
    ],
    isFreeInput: true,
  },

  // 第2题：疼痛性质（所有分支共用）
  painNature: {
    category: 'painNature',
    doctorText: '请问这种头痛的性质是怎样的？比如是冷痛遇冷加重、胀痛还是隐隐作痛？如果不太理解，我也可以为您解释。',
    options: [
      { label: '冷痛遇冷加重', taCode: 'TB1', semanticDesc: '痛的感觉偏冷遇冷风冷环境加重/冷痛/遇冷加重/冷痛遇冷更痛/受凉痛加重/怕冷风吹痛加重/冷痛畏寒加重/遇寒加重/遇冷风更痛' },
      { label: '热痛遇热加重', taCode: 'TB2A', semanticDesc: '热痛遇热加重/痛偏热遇热更痛/遇热加重/热了更痛/遇热环境痛加重/热痛/热痛遇热更厉害/热痛感' },
      { label: '遇风加重', taCode: 'TB2B', semanticDesc: '遇风加重/风吹头痛加重/怕风吹/遇风痛/被风吹了更痛/风一吹就痛/头痛遇风加重/风吹加重/见风加重' },
      { label: '胀痛', taCode: 'TB2C', semanticDesc: '胀痛/胀着痛/胀满痛/撑胀痛/胀胀的痛/头胀/撑胀感/胀疼/胀着疼/脑胀/脑袋胀' },
      { label: '剧痛', taCode: 'TB2D', semanticDesc: '剧痛/痛得厉害/特别痛/剧烈痛/痛得受不了/剧疼/痛极/很痛/非常痛/痛得很重/剧烈难忍/剧烈疼痛' },
      { label: '隐隐痛', taCode: 'TB2E', semanticDesc: '痛感轻微隐隐约约不剧烈/隐隐痛/隐隐作痛/轻微痛/不太痛/隐隐约约痛/闷闷痛/微痛/痛得不明显/轻痛/隐痛/隐隐的痛' },
    ],
    isFreeInput: true,
  },

  // 第3题：寒热感觉（头痛专用）
  headacheChillHeat: {
    category: 'headacheChillHeat',
    doctorText: '请问您的寒热感觉是怎样的？比如整体怕冷还是怕热？如果不太理解这些术语，我可以逐一为您解释。',
    options: [
      { label: '整体怕冷', taCode: 'TB3A' },
      { label: '整体怕热', taCode: 'TB3B' },
      { label: '胃脘喜温喜按', taCode: 'TB3C', semanticDesc: '胃部觉得冷暖和按压后舒服' },
      { label: '胃脘胀满拒按', taCode: 'TB3D', semanticDesc: '胃部胀满按压后更不舒服' },
      { label: '头部怕冷', taCode: 'TB3E' },
    ],
    isFreeInput: true,
  },

  // 第4题：口渴/喝水（共用TA系列）
  thirst: {
    category: 'thirst',
    doctorText: '请问您的口渴和喝水情况？',
    options: [
      { label: '口不渴', taCode: 'TA3A' },
      { label: '口渴喜热饮', taCode: 'TA3B' },
      { label: '口渴喜凉饮', taCode: 'TA3C' },
      { label: '口干但不想喝水', taCode: 'TA3D' },
      { label: '口中水多', taCode: 'TA3E' },
    ],
  },

  // 第5题：口味
  taste: {
    category: 'taste',
    doctorText: '请问您的口味情况？',
    options: [
      { label: '口苦', taCode: 'TA4A' },
      { label: '口臭', taCode: 'TA4B' },
      { label: '口酸', taCode: 'TA4C' },
      { label: '口涩', taCode: 'TA4D' },
      { label: '口咸', taCode: 'TA4E' },
      { label: '口淡无味', taCode: 'TA4F' },
      { label: '口甜', taCode: 'TA4G' },
    ],
  },

  // 第6题：食欲
  appetite: {
    category: 'appetite',
    doctorText: '请问您最近的吃饭情况如何？',
    options: [
      { label: '食欲不振', taCode: 'TA5A' },
      { label: '能吃', taCode: 'TA5B' },
      { label: '见食而烦', taCode: 'TA5C' },
    ],
  },

  // 第7题：出汗（头痛统一使用简单3选项版本）
  sweat: {
    category: 'sweat',
    doctorText: '请问您的出汗情况？',
    options: [
      { label: '不出汗', taCode: 'TA6A' },
      { label: '自汗', taCode: 'TA6B' },
      { label: '盗汗', taCode: 'TA6C' },
    ],
  },

  // 第8题：大便
  stool: {
    category: 'stool',
    doctorText: '请问您的大便情况？',
    options: [
      { label: '大便稀溏不热', taCode: 'TA7A' },
      { label: '大便稀溏发热', taCode: 'TA7B' },
      { label: '大便干结', taCode: 'TA7C' },
      { label: '先干后稀', taCode: 'TA7D' },
      { label: '时干时稀', taCode: 'TA7E' },
      { label: '大便带血', taCode: 'TA7F' },
    ],
  },

  // 第9题：小便
  urine: {
    category: 'urine',
    doctorText: '请问您的小便情况？',
    options: [
      { label: '小便发热发黄', taCode: 'TA8A' },
      { label: '小便清长', taCode: 'TA8B' },
      { label: '小便不利', taCode: 'TA8C' },
      { label: '小便带血发热', taCode: 'TA8D' },
      { label: '小便带血不热', taCode: 'TA8E' },
    ],
  },

  // 第10题：睡眠
  sleep: {
    category: 'sleep',
    doctorText: '请问您的睡眠情况？',
    options: [
      { label: '入睡困难', taCode: 'TA9A' },
      { label: '睡后易醒', taCode: 'TA9B' },
      { label: '嗜睡', taCode: 'TA9C' },
    ],
  },

  // 第11题：体力
  energy: {
    category: 'energy',
    doctorText: '请问您的体力情况？',
    options: [
      { label: '神疲乏力劳累加重', taCode: 'TA10A', semanticDesc: '累没精神劳累后更明显' },
      { label: '神疲乏力遇湿加重', taCode: 'TA10B', semanticDesc: '累没精神阴雨天潮湿环境更明显' },
      { label: '神疲乏力遇热加重', taCode: 'TA10C', semanticDesc: '累没精神天热环境热更明显' },
    ],
  },

  // 第12题：心烦
  mood: {
    category: 'mood',
    doctorText: '请问您的心烦情况？',
    options: [
      { label: '白天心烦', taCode: 'TA11A' },
      { label: '夜间心烦', taCode: 'TA11B' },
      { label: '白天心烦夜间安静', taCode: 'TA11C' },
    ],
  },
}

// ── 头痛问题序列（按头痛位置分支） ────────────────────────────
// 所有头痛位置分支后续问题序列相同
const HEADACHE_COMMON_SEQUENCE = ['painNature', 'headacheChillHeat', 'thirst', 'taste', 'appetite', 'sweat', 'stool', 'urine', 'sleep', 'energy', 'mood']

export const HEADACHE_QUESTION_SEQUENCE: Record<string, string[]> = {
  '前额痛': HEADACHE_COMMON_SEQUENCE,
  '偏头痛': HEADACHE_COMMON_SEQUENCE,
  '后头痛': HEADACHE_COMMON_SEQUENCE,
  '颠顶痛': HEADACHE_COMMON_SEQUENCE,
  '全头痛': HEADACHE_COMMON_SEQUENCE,
}

// ── 头痛术语解释 ──────────────────────────────────────────────
export const HEADACHE_LOCATION_EXPLANATIONS: Record<string, string> = {
  '前额痛': '痛在额头部位，眉毛上方区域。',
  '偏头痛': '痛在头部一侧，左侧或右侧。',
  '后头痛': '痛在头后部，后脑勺区域。',
  '颠顶痛': '痛在头顶最高处。',
  '全头痛': '整个头部都痛，范围较广。',
}

export const HEADACHE_PAIN_NATURE_EXPLANATIONS: Record<string, string> = {
  '冷痛遇冷加重': '头痛感觉偏冷，遇到冷风或冷环境时疼痛加重。',
  '热痛遇热加重': '头痛感觉偏热，遇热时疼痛加重。',
  '遇风加重': '遇到风吹时头痛加重。',
  '胀痛': '头部胀满疼痛，有撑胀感。',
  '剧痛': '痛感非常强烈。',
  '隐隐痛': '痛感轻微，隐隐作痛，不是很剧烈。',
}

export const HEADACHE_CHILL_HEAT_EXPLANATIONS: Record<string, string> = {
  '整体怕冷': '全身怕冷，穿衣服比别人多。',
  '整体怕热': '全身怕热，喜欢凉的东西。',
  '胃脘喜温喜按': '胃部觉得暖和、按压会舒服些。',
  '胃脘胀满拒按': '胃部胀满，按压反而不舒服。',
  '头部怕冷': '头部特别怕冷、怕风吹。',
}

// ── 寒热共享问题（咳嗽 + 失眠共用，追问通过 SHARED_FOLLOWUP_MAP 按症状解析） ──
export const SHARED_CHILL_HEAT_QUESTIONS: Record<string, IDetailQuestion> = {
  // 第1步：主分类
  chillHeat: {
    category: 'chillHeat',
    doctorText: '请问您平时怕冷发热的情况是怎样的？',
    options: [
      { label: '整体怕冷', taCode: 'BHR1', semanticDesc: '全身都怕冷畏寒，不是某个部位怕冷', severityQuestion: { subjectText: '怕冷', lighterCode: 'BHR1A', heavierCode: 'BHR1B' }, followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '整体怕热', taCode: 'BHR2', semanticDesc: '全身都怕热偏热，不是某个部位怕热', severityQuestion: { subjectText: '怕热', lighterCode: 'BHR2A', heavierCode: 'BHR2B' } },
      { label: '局部怕热', taCode: 'BHR_LOCAL_HEAT', semanticDesc: '只有某些部位觉得热如手心脚心心胸', followUpQuestions: ['localHeatDetail'] },
      { label: '局部怕冷', taCode: 'BHR_LOCAL_COLD', semanticDesc: '只有某些部位怕冷如手脚腰背胃部', followUpQuestions: ['localColdDetail', 'nightUrine1', 'nightUrine2'] },
      { label: '寒热不明显', semanticDesc: '没有特别怕冷怕热的感觉' },
    ],
    isFreeInput: true,
  },

  // 第2步：特别情况（忽冷忽热/潮热/怕冷同时发热）
  chillHeatSpecial: {
    category: 'chillHeatSpecial',
    doctorText: '请问您是否有以下特别冷热情况？',
    options: [
      { label: '忽冷忽热', taCode: 'BHR21', semanticDesc: '一会儿冷一会儿热交替出现，不是同时既冷又热', severityQuestion: { subjectText: '忽冷忽热', lighterCode: 'BHR21A', heavierCode: 'BHR21B' }, followUpQuestions: ['gasStag1', 'gasStag2'] },
      { label: '潮热', taCode: 'BHR22', semanticDesc: '像潮水一样按时发热，到了某个时段就发热，中医术语', followUpQuestions: ['tideTime'] },
      { label: '怕冷同时发热', taCode: 'BHR26', semanticDesc: '同一时间既怕冷又发热，不是忽冷忽热', excludeAfter: ['BHR2', 'BHR1'], followUpQuestions: ['skinItch1', 'skinItch2', 'skinItch3'] },
      { label: '没有特别冷热情况', semanticDesc: '没有忽冷忽热潮热等特别情况' },
    ],
    isFreeInput: true,
  },

  // 潮热时段（选了潮热后展开）
  chillHeatTideTime: {
    category: 'chillHeatTideTime',
    doctorText: '请问您的潮热出现在什么时段？',
    options: [
      { label: '午后潮热', taCode: 'BHR23', semanticDesc: '下午时段按时发热，中医术语' },
      { label: '傍晚潮热', taCode: 'BHR24', semanticDesc: '傍晚时分按时发热，中医术语' },
      { label: '夜间潮热', taCode: 'BHR25', semanticDesc: '夜间按时发热，中医术语' },
    ],
  },
}

// ── 共享追问映射（通用 key → 各症状的实际追问 key） ──────────────────
export const SHARED_FOLLOWUP_MAP: Record<string, Record<string, string>> = {
  '咳嗽': {
    // 寒热
    nightUrine1: 'coughUrineNight_pyx1',
    nightUrine2: 'coughUrineNight_pyx2',
    localHeatDetail: 'chillHeatDetail',
    localColdDetail: 'chillHeatDetail',
    gasStag1: 'coughChillHeatFluctuation_pqz1',
    gasStag2: 'coughChillHeatFluctuation_pqz2',
    tideTime: 'chillHeatTideTime',
    skinItch1: 'coughSkinItchAndPain_pfe1',
    skinItch2: 'coughSkinItchAndPain_pfe2',
    skinItch3: 'coughSkinItchAndPain_pfe3',
    // 口渴
    urineHeatBreath1: 'coughUrineHeatAndBreath_psr1',
    urineHeatBreath2: 'coughUrineHeatAndBreath_psr2',
    dampHeat1: 'coughDampHeat_eczema',
    dampHeat2: 'coughDampHeat_footOdor',
    dampHeat3: 'coughDampHeat_urineTurbid',
    dampHeat_urineYellowHeat: 'coughUrineHeatAndBreath_psr1',
    dampHeat_urinePain: 'coughDampHeat_urinePain',
    // 口味
    tasteABC1_1: 'coughTasteABC1_migraine',
    tasteABC1_2: 'coughTasteABC1_bloating',
    tasteABC1_3: 'coughTasteABC1_burping',
    tasteABC1_4: 'coughTasteABC1_hypochondrium',
    tasteABC2_1: 'coughTasteABC2_gastricPain',
    tasteABC2_2: 'coughTasteABC2_burping',
    tasteABC2_3: 'coughTasteABC2_upperAbdomen',
    tasteABC2_4: 'coughTasteABC2_foulGas',
    tasteDrySkin: 'coughTasteDryness_drySkin',
    tasteChestHeat: 'coughTasteDryness_chestHeat',
    tasteTinnitus: 'coughTasteDryness_tinnitus',
    tasteDreams: 'coughTasteDryness_dreams',
    swelling1: 'coughTasteWaterSwelling_bigBelly',
    swelling2: 'coughTasteWaterSwelling_heavy',
    swelling3: 'coughTasteWaterSwelling_swelling',
    swelling4: 'coughTasteWaterSwelling_morningStiff',
    // 性别追问（与主问诊共用 category 实现去重）
    hypochondrium: 'coughTasteABC1_hypochondrium',
    chestTight: 'coughChillHeatFluctuation_pqz2',
    migraine: 'coughTasteABC1_migraine',
    throatLump: 'coughFatigueQiStagnation_pharynx',
    // 大便
    stoolDryPain: 'coughStoolDryPain',
    stoolCough: 'coughStoolCoughAndBreath_cough',
    stoolBreath: 'coughStoolCoughAndBreath_breath',
    stoolAnusDrop1: 'coughStoolAnusDrop_drop',
    stoolAnusDrop2: 'coughStoolAnusDrop_prolapse',
  },
  '失眠': {
    // 寒热
    nightUrine1: 'insomniaUrineNight_pyx1',
    nightUrine2: 'insomniaUrineNight_pyx2',
    localHeatDetail: 'chillHeatLocalHeat',
    localColdDetail: 'chillHeatLocalCold',
    gasStag1: 'insomniaChillHeatFluctuation_pqz1',
    gasStag2: 'insomniaChillHeatFluctuation_pqz2',
    tideTime: 'chillHeatTideTime',
    skinItch1: 'insomniaSkinItchAndPain_pfe1',
    skinItch2: 'insomniaSkinItchAndPain_pfe2',
    skinItch3: 'insomniaSkinItchAndPain_pfe3',
    // 口渴
    urineHeatBreath1: 'insomniaUrineHeatAndBreath_psr1',
    urineHeatBreath2: 'insomniaUrineHeatAndBreath_psr2',
    dampHeat1: 'insomniaDampHeat_eczema',
    dampHeat2: 'insomniaDampHeat_footOdor',
    dampHeat3: 'insomniaDampHeat_urineTurbid',
    dampHeat_urineYellowHeat: 'insomniaDampHeat_urineYellowHeat',
    dampHeat_urinePain: 'insomniaDampHeat_urinePain',
    // 口味
    tasteABC1_1: 'insomniaTasteABC1_migraine',
    tasteABC1_2: 'insomniaTasteABC1_bloating',
    tasteABC1_3: 'insomniaTasteABC1_burping',
    tasteABC1_4: 'insomniaTasteABC1_hypochondrium',
    tasteABC2_1: 'insomniaTasteABC2_gastricPain',
    tasteABC2_2: 'insomniaTasteABC2_burping',
    tasteABC2_3: 'insomniaTasteABC2_upperAbdomen',
    tasteABC2_4: 'insomniaTasteABC2_foulGas',
    tasteDrySkin: 'insomniaTasteDryness_drySkin',
    tasteChestHeat: 'insomniaTasteDryness_chestHeat',
    tasteTinnitus: 'insomniaTasteDryness_tinnitus',
    tasteDreams: 'insomniaTasteDryness_dreams',
    swelling1: 'insomniaSwelling_bigBelly',
    swelling2: 'insomniaSwelling_heavy',
    swelling3: 'insomniaSwelling_swelling',
    swelling4: 'insomniaSwelling_morningStiff',
    // 性别追问（与主问诊共用 category 实现去重）
    hypochondrium: 'insomniaTasteABC1_hypochondrium',
    chestTight: 'insomniaChillHeatFluctuation_pqz2',
    migraine: 'insomniaTasteABC1_migraine',
    throatLump: 'fatigue_pharynx',
    // 出汗
    sweat_palpitations: 'sweat_palpitations',
    sweat_enuresis: 'sweat_enuresis',
    sweat_bleeding: 'sweat_bleeding',
    bloodHeat_rash: 'insomniaBloodHeat_rash',
    bloodHeat_acne: 'insomniaBloodHeat_acne',
    bloodHeat_irritability: 'insomniaBloodHeat_irritability',
    bloodHeat_bleeding: 'insomniaBloodHeat_bleeding',
    bloodHeat_urinePain: 'insomniaBloodHeat_urinePain',
    // 乏力
    fatigue_hypochondrium: 'fatigue_hypochondrium',
    fatigue_chest: 'fatigue_chest',
    fatigue_migraine: 'fatigue_migraine',
    fatigue_pharynx: 'fatigue_pharynx',
    fatigue_bleeding: 'fatigue_bleeding',
    // 大便
    stoolDryPain: 'insomniaStoolDryPain',
    stoolCough: 'insomniaStoolCoughAndBreath_cough',
    stoolBreath: 'insomniaStoolCoughAndBreath_breath',
    stoolAnusDrop1: 'insomniaStoolAnusDrop_drop',
    stoolAnusDrop2: 'insomniaStoolAnusDrop_prolapse',
  },
}

// ── 共享追问链常量 ──────────────────────────────────────────────
const _TASTE_ABC1_FU = ['tasteABC1_1', 'tasteABC1_2', 'tasteABC1_3', 'tasteABC1_4']
const _TASTE_ABC2_FU = ['tasteABC2_1', 'tasteABC2_2', 'tasteABC2_3', 'tasteABC2_4']
const _TASTE_ABC12_FU = [..._TASTE_ABC1_FU, ..._TASTE_ABC2_FU]
const _TASTE_DRY_FU = ['tasteDrySkin', 'tasteChestHeat', 'tasteTinnitus', 'tasteDreams']
const _SWELLING_FU = ['swelling1', 'swelling2', 'swelling3', 'swelling4']
const _STOOL_COUGH_BREATH = ['stoolCough', 'stoolBreath']
const _STOOL_ANUS_DROP = ['stoolAnusDrop1', 'stoolAnusDrop2']

// ── 口渴共享问题（咳嗽 + 失眠共用） ──────────────────────────────
export const SHARED_THIRST_QUESTIONS: Record<string, IDetailQuestion> = {
  thirst: {
    category: 'thirst',
    doctorText: '请问您的口渴和喝水情况？',
    options: [
      { label: '口不渴', taCode: 'BKH1', severityQuestion: { subjectText: '口不渴', lighterCode: 'BKH1A', heavierCode: 'BKH1B' }, followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '口渴喜喝热水', taCode: 'BKH2', severityQuestion: { subjectText: '口渴喜喝热水', lighterCode: 'BKH2A', heavierCode: 'BKH2B' }, excludeAfter: ['BKH3'], followUpQuestions: ['nightUrine1', 'nightUrine2'] },
      { label: '口渴喜喝凉水', taCode: 'BKH3', severityQuestion: { subjectText: '口渴喜喝凉水', lighterCode: 'BKH3A', heavierCode: 'BKH3B' }, excludeAfter: ['BKH2'], followUpQuestions: ['urineHeatBreath1', 'urineHeatBreath2'] },
      { label: '口渴不欲饮', taCode: 'BKH4', followUpQuestions: ['dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain'] },
    ],
  },
}

// ── 口中状况共享问题（咳嗽 + 失眠共用） ──────────────────────────
export const SHARED_TASTE_QUESTIONS: Record<string, IDetailQuestion> = {
  tastePungentIntro: {
    category: 'tastePungentIntro',
    doctorText: '请问您口中有没有异味？',
    options: [
      { label: '有', taCode: 'BKZ', followUpQuestions: ['tastePungent'] },
      { label: '没有' },
    ],
    isFreeInput: true,
  },

  tastePungent: {
    category: 'tastePungent',
    doctorText: '请问您口中有哪种异味？',
    options: [
      { label: '口苦', taCode: 'BKZ1', severityQuestion: { subjectText: '口苦', lighterCode: 'BKZ1A', heavierCode: 'BKZ1B' }, followUpQuestions: _TASTE_ABC12_FU },
      { label: '口臭', taCode: 'BKZ2', severityQuestion: { subjectText: '口臭', lighterCode: 'BKZ2A', heavierCode: 'BKZ2B' }, followUpQuestions: _TASTE_ABC12_FU },
      { label: '口酸', taCode: 'BKZ3', severityQuestion: { subjectText: '口酸', lighterCode: 'BKZ3A', heavierCode: 'BKZ3B' }, followUpQuestions: _TASTE_ABC12_FU },
      { label: '口咸', taCode: 'BKZ4', severityQuestion: { subjectText: '口咸', lighterCode: 'BKZ4A', heavierCode: 'BKZ4B' }, followUpQuestions: _TASTE_DRY_FU },
      { label: '口甜', taCode: 'BKZ5', severityQuestion: { subjectText: '口甜', lighterCode: 'BKZ5A', heavierCode: 'BKZ5B' } },
      { label: '口涩', taCode: 'BKZ6', severityQuestion: { subjectText: '口涩', lighterCode: 'BKZ6A', heavierCode: 'BKZ6B' } },
      { label: '口淡无味', taCode: 'BKZ7', severityQuestion: { subjectText: '口淡无味', lighterCode: 'BKZ7A', heavierCode: 'BKZ7B' } },
    ],
    isFreeInput: true,
  },

  tasteDryWet: {
    category: 'tasteDryWet',
    doctorText: '请问您口中是水多还是干燥？',
    options: [
      { label: '口中水多', taCode: 'BKZ8', severityQuestion: { subjectText: '口中水多', lighterCode: 'BKZ8A', heavierCode: 'BKZ8B' }, followUpQuestions: _SWELLING_FU },
      { label: '口咽干燥', taCode: 'BKZ9', severityQuestion: { subjectText: '口咽干燥', lighterCode: 'BKZ9A', heavierCode: 'BKZ9B' }, followUpQuestions: ['urineHeatBreath1', 'urineHeatBreath2'] },
      { label: '都没有' },
    ],
    isFreeInput: true,
  },

  tasteSticky: {
    category: 'tasteSticky',
    doctorText: '请问您是否有口中粘腻的感觉？',
    options: [
      { label: '有', taCode: 'BKZ10', severityQuestion: { subjectText: '口中粘腻', lighterCode: 'BKZ10A', heavierCode: 'BKZ10B' }, followUpQuestions: ['dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain'] },
      { label: '没有' },
    ],
  },
}

// ── 大便共享问题（咳嗽 + 失眠共用） ──────────────────────────────
export const SHARED_STOOL_QUESTIONS: Record<string, IDetailQuestion> = {
  stoolConstipation: {
    category: 'stoolConstipation',
    doctorText: '请问您是否有便秘的情况？',
    options: [
      { label: '大便干结', taCode: 'BDB1', severityQuestion: { subjectText: '大便干结', lighterCode: 'BDB1A', heavierCode: 'BDB1B' }, followUpQuestions: ['stoolDryPain', ..._STOOL_COUGH_BREATH, 'stoolDiscomfort'] },
      { label: '大便稀溏肛门不热', taCode: 'BDB2A', followUpQuestions: [..._STOOL_COUGH_BREATH, 'stoolDiscomfort'] },
      { label: '大便稀溏肛门灼热', taCode: 'BDB2B', followUpQuestions: [..._STOOL_COUGH_BREATH, 'dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain', 'stoolDiscomfort'] },
      { label: '先干后稀肛门不热', taCode: 'BDB3A', followUpQuestions: [..._STOOL_COUGH_BREATH, 'stoolDiscomfort'] },
      { label: '先干后稀肛门灼热', taCode: 'BDB3B', followUpQuestions: [..._STOOL_COUGH_BREATH, 'dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain', 'stoolDiscomfort'] },
      { label: '时干时稀肛门不热', taCode: 'BDB4A', followUpQuestions: [..._STOOL_COUGH_BREATH, 'stoolDiscomfort'] },
      { label: '时干时稀肛门灼热', taCode: 'BDB4B', followUpQuestions: [..._STOOL_COUGH_BREATH, 'dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain', 'stoolDiscomfort'] },
      { label: '不是便秘', followUpQuestions: ['stoolDiarrhea'] },
    ],
    isFreeInput: true,
  },

  stoolDiarrhea: {
    category: 'stoolDiarrhea',
    doctorText: '请问您是否有腹泻的情况？',
    options: [
      { label: '五更泻', taCode: 'BDB5', severityQuestion: { subjectText: '五更泻', lighterCode: 'BDB5A', heavierCode: 'BDB5B' }, followUpQuestions: ['nightUrine1', 'nightUrine2', 'stoolDiscomfort'] },
      { label: '完谷不化', taCode: 'BDB6', severityQuestion: { subjectText: '完谷不化', lighterCode: 'BDB6A', heavierCode: 'BDB6B' }, followUpQuestions: ['nightUrine1', 'nightUrine2', 'stoolDiscomfort'] },
      { label: '稀溏粘腻', taCode: 'BDB7', severityQuestion: { subjectText: '稀溏粘腻', lighterCode: 'BDB7A', heavierCode: 'BDB7B' }, followUpQuestions: ['nightUrine1', 'nightUrine2', 'stoolDiscomfort'] },
      { label: '不是腹泻', followUpQuestions: ['stoolUnformed'] },
    ],
    isFreeInput: true,
  },

  stoolUnformed: {
    category: 'stoolUnformed',
    doctorText: '请问您的大便不成形情况是怎样的？',
    options: [
      { label: '不粘腻', taCode: 'BDB8', followUpQuestions: ['stoolDiscomfort'] },
      { label: '粘腻不发热', taCode: 'BDB9', followUpQuestions: ['stoolDiscomfort'] },
      { label: '粘腻发热', taCode: 'BDB10', followUpQuestions: ['dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain', 'stoolDiscomfort'] },
    ],
    isFreeInput: true,
  },

  stoolDiscomfort: {
    category: 'stoolDiscomfort',
    doctorText: '请问您是否有排便不适的情况？',
    options: [
      { label: '便意频频', taCode: 'BDB11', severityQuestion: { subjectText: '便意频频', lighterCode: 'BDB11A', heavierCode: 'BDB11B' }, followUpQuestions: _STOOL_ANUS_DROP },
      { label: '排便不净', taCode: 'BDB12', severityQuestion: { subjectText: '排便不净', lighterCode: 'BDB12A', heavierCode: 'BDB12B' }, followUpQuestions: _STOOL_ANUS_DROP },
      { label: '没有排便不适' },
    ],
    isFreeInput: true,
  },
}

// ── 血瘀共享问题（所有症状的性别追问共用，仅由月经颜色→紫暗触发） ──
export const SHARED_BLOOD_STASIS_QUESTIONS: Record<string, IDetailQuestion> = {
  bloodStasis_subBruise: {
    category: 'bloodStasis_subBruise',
    doctorText: '请问您是否有皮下瘀斑（按之疼痛）的情况？',
    options: [
      { label: '有', taCode: 'PXY1', severityQuestion: { subjectText: '皮下瘀斑', lighterCode: 'PXY1A', heavierCode: 'PXY1B' } },
      { label: '没有', taCode: 'PXY1' },
    ],
  },

  bloodStasis_skinRough: {
    category: 'bloodStasis_skinRough',
    doctorText: '请问您是否有皮肤甲错的情况？',
    options: [
      { label: '有', taCode: 'PXY2', severityQuestion: { subjectText: '皮肤甲错', lighterCode: 'PXY2A', heavierCode: 'PXY2B' } },
      { label: '没有', taCode: 'PXY2' },
    ],
  },

  bloodStasis_lipPurple: {
    category: 'bloodStasis_lipPurple',
    doctorText: '请问您是否有口唇紫暗的情况？',
    options: [
      { label: '有', taCode: 'PXY3', severityQuestion: { subjectText: '口唇紫暗', lighterCode: 'PXY3A', heavierCode: 'PXY3B' } },
      { label: '没有', taCode: 'PXY3' },
    ],
  },
}

// ── 出汗共享问题（失眠共用，追问通过 SHARED_FOLLOWUP_MAP 按症状解析） ──
export const SHARED_SWEAT_QUESTIONS: Record<string, IDetailQuestion> = {
  sweat: {
    category: 'sweat',
    doctorText: '请问您的出汗情况？',
    options: [
      { label: '从不出汗', taCode: 'BCH1', semanticDesc: '完全不出汗', severityQuestion: { subjectText: '从不出汗', lighterCode: 'BCH1A', heavierCode: 'BCH1B' }, followUpQuestions: ['skinItch1', 'skinItch2', 'skinItch3'] },
      { label: '自汗不粘腻', taCode: 'BCH2A', semanticDesc: '白天清醒时出汗但汗液清爽不粘腻', followUpQuestions: ['sweat_palpitations', 'sweat_enuresis', 'sweat_bleeding', 'bloodHeat_rash', 'bloodHeat_acne', 'bloodHeat_irritability', 'bloodHeat_bleeding', 'bloodHeat_urinePain'] },
      { label: '自汗粘腻', taCode: 'BCH2B', semanticDesc: '白天清醒时出汗且汗液粘腻不清爽', followUpQuestions: ['sweat_palpitations', 'sweat_enuresis', 'sweat_bleeding', 'bloodHeat_rash', 'bloodHeat_acne', 'bloodHeat_irritability', 'bloodHeat_bleeding', 'bloodHeat_urinePain'] },
      { label: '盗汗不粘腻', taCode: 'BCH3A', semanticDesc: '睡觉时出汗但汗液清爽不粘腻', followUpQuestions: ['sweat_palpitations', 'sweat_enuresis', 'sweat_bleeding', 'bloodHeat_rash', 'bloodHeat_acne', 'bloodHeat_irritability', 'bloodHeat_bleeding', 'bloodHeat_urinePain'] },
      { label: '盗汗粘腻', taCode: 'BCH3B', semanticDesc: '睡觉时出汗且汗液粘腻', followUpQuestions: ['sweat_palpitations', 'sweat_enuresis', 'sweat_bleeding', 'bloodHeat_rash', 'bloodHeat_acne', 'bloodHeat_irritability', 'bloodHeat_bleeding', 'bloodHeat_urinePain'] },
      { label: '腋下汗多不粘腻', taCode: 'BCH4A', followUpQuestions: ['dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain'] },
      { label: '腋下汗多粘腻', taCode: 'BCH4B', followUpQuestions: ['dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain'] },
      { label: '阴部有汗不粘腻', taCode: 'BCH5A', followUpQuestions: ['dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain'] },
      { label: '阴部有汗粘腻', taCode: 'BCH5B', followUpQuestions: ['dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain'] },
      { label: '头汗多出不粘腻', taCode: 'BCH6A', followUpQuestions: ['sweat_palpitations', 'sweat_enuresis', 'sweat_bleeding'] },
      { label: '头汗多出粘腻', taCode: 'BCH6B', followUpQuestions: ['sweat_palpitations', 'sweat_enuresis', 'sweat_bleeding'] },
      { label: '半身出汗不粘腻', taCode: 'BCH7A', followUpQuestions: ['fatigue_hypochondrium', 'fatigue_chest', 'fatigue_migraine', 'fatigue_pharynx'] },
      { label: '半身出汗粘腻', taCode: 'BCH7B', followUpQuestions: ['fatigue_hypochondrium', 'fatigue_chest', 'fatigue_migraine', 'fatigue_pharynx'] },
    ],
  },

  sweat_palpitations: {
    category: 'sweat_palpitations',
    doctorText: '请问您是否有汗后心慌的情况？',
    options: [
      { label: '有', taCode: 'PHS1', severityQuestion: { subjectText: '汗后心慌', lighterCode: 'PHS1A', heavierCode: 'PHS1B' } },
      { label: '没有', taCode: 'PHS1' },
    ],
  },

  sweat_enuresis: {
    category: 'sweat_enuresis',
    doctorText: '请问您是否有遗尿的情况？',
    options: [
      { label: '有', taCode: 'PHS2', severityQuestion: { subjectText: '遗尿', lighterCode: 'PHS2A', heavierCode: 'PHS2B' } },
      { label: '没有', taCode: 'PHS2' },
    ],
  },

  sweat_bleeding: {
    category: 'sweat_bleeding',
    doctorText: '请问您是否有出血不热的情况？',
    options: [
      { label: '有', taCode: 'PQX6', severityQuestion: { subjectText: '出血不热', lighterCode: 'PQX6A', heavierCode: 'PQX6B' } },
      { label: '没有', taCode: 'PQX6' },
    ],
  },
}

// ── 乏力共享问题（失眠共用，追问通过 SHARED_FOLLOWUP_MAP 按症状解析） ──
export const SHARED_FATIGUE_QUESTIONS: Record<string, IDetailQuestion> = {
  fatigue: {
    category: 'fatigue',
    doctorText: '请问您的乏力情况？',
    options: [
      { label: '劳累加重', taCode: 'BFL1', semanticDesc: '累没精神劳累后更明显', severityQuestion: { subjectText: '劳累加重', lighterCode: 'BFL1A', heavierCode: 'BFL1B' } },
      { label: '遇湿加重', taCode: 'BFL2', semanticDesc: '累没精神阴雨天潮湿环境更明显', severityQuestion: { subjectText: '遇湿加重', lighterCode: 'BFL2A', heavierCode: 'BFL2B' }, followUpQuestions: ['swelling1', 'swelling2', 'swelling3', 'swelling4'] },
      { label: '遇热加重', taCode: 'BFL3', semanticDesc: '累没精神天热环境热更明显', severityQuestion: { subjectText: '遇热加重', lighterCode: 'BFL3A', heavierCode: 'BFL3B' } },
      { label: '生气发生', taCode: 'BFL4', severityQuestion: { subjectText: '生气发生', lighterCode: 'BFL4A', heavierCode: 'BFL4B' }, followUpQuestions: ['fatigue_hypochondrium', 'fatigue_chest', 'fatigue_migraine', 'fatigue_pharynx'] },
      { label: '没有明显乏力', taCode: 'BFL', semanticDesc: '没有明显的疲劳乏力感' },
    ],
    isFreeInput: true,
  },

  fatigueShortBreath: {
    category: 'fatigueShortBreath',
    doctorText: '请问您是否有少气懒言的情况？',
    options: [
      { label: '有', taCode: 'BFL5', semanticDesc: '说话声音低不愿多说气息短', severityQuestion: { subjectText: '少气懒言', lighterCode: 'BFL5A', heavierCode: 'BFL5B' }, followUpQuestions: ['fatigue_bleeding'] },
      { label: '没有', semanticDesc: '没有这种情况' },
    ],
    isFreeInput: true,
  },

  fatigueEasyCold: {
    category: 'fatigueEasyCold',
    doctorText: '请问您是否容易感冒？',
    options: [
      { label: '有', taCode: 'BFL6', semanticDesc: '容易感冒抵抗力差', severityQuestion: { subjectText: '易感冒', lighterCode: 'BFL6A', heavierCode: 'BFL6B' }, followUpQuestions: ['fatigue_bleeding'] },
      { label: '没有', semanticDesc: '没有这种情况' },
    ],
    isFreeInput: true,
  },

  fatigue_hypochondrium: {
    category: 'fatigue_hypochondrium',
    doctorText: '请问您是否有协肋胀满的情况？',
    options: [
      { label: '有', taCode: 'PQZ1', severityQuestion: { subjectText: '协肋胀满', lighterCode: 'PQZ1A', heavierCode: 'PQZ1B' } },
      { label: '没有', taCode: 'PQZ1' },
    ],
  },

  fatigue_chest: {
    category: 'fatigue_chest',
    doctorText: '请问您是否有胸闷的情况？',
    options: [
      { label: '有', taCode: 'PQZ2', severityQuestion: { subjectText: '胸闷', lighterCode: 'PQZ2A', heavierCode: 'PQZ2B' } },
      { label: '没有', taCode: 'PQZ2' },
    ],
  },

  fatigue_migraine: {
    category: 'fatigue_migraine',
    doctorText: '请问您是否有偏头痛的情况？',
    options: [
      { label: '有', taCode: 'PQZ3', severityQuestion: { subjectText: '偏头痛', lighterCode: 'PQZ3A', heavierCode: 'PQZ3B' } },
      { label: '没有', taCode: 'PQZ3' },
    ],
  },

  fatigue_pharynx: {
    category: 'fatigue_pharynx',
    doctorText: '请问您是否有咽部异物感的情况？',
    options: [
      { label: '有', taCode: 'PQZ4', severityQuestion: { subjectText: '咽部异物感', lighterCode: 'PQZ4A', heavierCode: 'PQZ4B' } },
      { label: '没有' },
    ],
  },

  fatigue_bleeding: {
    category: 'fatigue_bleeding',
    doctorText: '请问您是否有出血不热的情况？',
    options: [
      { label: '有', taCode: 'PQX4', severityQuestion: { subjectText: '出血不热', lighterCode: 'PQX4A', heavierCode: 'PQX4B' } },
      { label: '没有' },
    ],
  },
}

// ── 性别追问共享题库（13个通用追问，供无 SHARED_FOLLOWUP_MAP 的症状使用）──
// 这些追问被 GENDER_QUESTIONS 中的选项通过 GENDER_DAMP_HEAT_FU / GENDER_DRYNESS_FU / GENDER_QI_STAGNATION_FU 引用
// 咳嗽/失眠通过 SHARED_FOLLOWUP_MAP 映射到症状专属追问，其他症状直接查找此共享题库
export const SHARED_GENDER_FOLLOWUP_QUESTIONS: Record<string, IDetailQuestion> = {
  // ── 湿热组（5个）──
  dampHeat1: {
    category: 'dampHeat1',
    doctorText: '请问您是否有湿疹或皮肤瘙痒的情况？',
    options: [
      { label: '有', taCode: 'PFE1', severityQuestion: { subjectText: '湿疹瘙痒', lighterCode: 'PFE1A', heavierCode: 'PFE1B' } },
      { label: '没有', taCode: 'PFE1' },
    ],
  },
  dampHeat2: {
    category: 'dampHeat2',
    doctorText: '请问您是否有脚气或足部异味？',
    options: [
      { label: '有', taCode: 'PFE2', severityQuestion: { subjectText: '脚气足癣', lighterCode: 'PFE2A', heavierCode: 'PFE2B' } },
      { label: '没有', taCode: 'PFE2' },
    ],
  },
  dampHeat3: {
    category: 'dampHeat3',
    doctorText: '请问您的小便是否浑浊？',
    options: [
      { label: '浑浊', taCode: 'PFE3', severityQuestion: { subjectText: '小便浑浊', lighterCode: 'PFE3A', heavierCode: 'PFE3B' } },
      { label: '清澈', taCode: 'PFE3' },
    ],
  },
  dampHeat_urineYellowHeat: {
    category: 'dampHeat_urineYellowHeat',
    doctorText: '请问您的小便是否发黄且有热感？',
    options: [
      { label: '发黄发热', taCode: 'PSR1', severityQuestion: { subjectText: '小便黄赤有热', lighterCode: 'PSR1A', heavierCode: 'PSR1B' } },
      { label: '正常', taCode: 'PSR1' },
    ],
  },
  dampHeat_urinePain: {
    category: 'dampHeat_urinePain',
    doctorText: '请问您小便时是否有疼痛或灼热感？',
    options: [
      { label: '有疼痛灼热', taCode: 'PSR2', severityQuestion: { subjectText: '小便疼痛灼热', lighterCode: 'PSR2A', heavierCode: 'PSR2B' } },
      { label: '没有', taCode: 'PSR2' },
    ],
  },

  // ── 干燥组（4个）──
  tasteDrySkin: {
    category: 'tasteDrySkin',
    doctorText: '请问您是否有皮肤干燥的情况？',
    options: [
      { label: '皮肤干燥', taCode: 'PKZ1', severityQuestion: { subjectText: '皮肤干燥', lighterCode: 'PKZ1A', heavierCode: 'PKZ1B' } },
      { label: '正常' },
    ],
  },
  tasteChestHeat: {
    category: 'tasteChestHeat',
    doctorText: '请问您是否有心胸烦热的感觉？',
    options: [
      { label: '心胸烦热', taCode: 'PKZ2', severityQuestion: { subjectText: '心胸烦热', lighterCode: 'PKZ2A', heavierCode: 'PKZ2B' } },
      { label: '没有' },
    ],
  },
  tasteTinnitus: {
    category: 'tasteTinnitus',
    doctorText: '请问您是否有耳鸣的情况？',
    options: [
      { label: '有耳鸣', taCode: 'PKZ3', severityQuestion: { subjectText: '耳鸣', lighterCode: 'PKZ3A', heavierCode: 'PKZ3B' } },
      { label: '没有' },
    ],
  },
  tasteDreams: {
    category: 'tasteDreams',
    doctorText: '请问您是否多梦？',
    options: [
      { label: '多梦', taCode: 'PKZ4', severityQuestion: { subjectText: '多梦', lighterCode: 'PKZ4A', heavierCode: 'PKZ4B' } },
      { label: '不多梦' },
    ],
  },

  // ── 气滞组（4个）──
  hypochondrium: {
    category: 'hypochondrium',
    doctorText: '请问您是否有胁肋部不适或胀满的感觉？',
    options: [
      { label: '有', taCode: 'PQZ1', severityQuestion: { subjectText: '胁肋胀满', lighterCode: 'PQZ1A', heavierCode: 'PQZ1B' } },
      { label: '没有', taCode: 'PQZ1' },
    ],
  },
  chestTight: {
    category: 'chestTight',
    doctorText: '请问您是否有胸闷的感觉？',
    options: [
      { label: '有', taCode: 'PQZ2', severityQuestion: { subjectText: '胸闷', lighterCode: 'PQZ2A', heavierCode: 'PQZ2B' } },
      { label: '没有', taCode: 'PQZ2' },
    ],
  },
  migraine: {
    category: 'migraine',
    doctorText: '请问您是否有偏头痛的情况？',
    options: [
      { label: '有', taCode: 'PQZ3', severityQuestion: { subjectText: '偏头痛', lighterCode: 'PQZ3A', heavierCode: 'PQZ3B' } },
      { label: '没有', taCode: 'PQZ3' },
    ],
  },
  throatLump: {
    category: 'throatLump',
    doctorText: '请问您是否有咽部异物感（感觉有东西堵着）？',
    options: [
      { label: '有', taCode: 'PQZ4', severityQuestion: { subjectText: '咽部异物感', lighterCode: 'PQZ4A', heavierCode: 'PQZ4B' } },
      { label: '没有' },
    ],
  },
}

// ── 性别特异性问题（所有症状共享） ──────────────────────────────

// 追问链常量（避免重复定义）——使用共享 key，由 SHARED_FOLLOWUP_MAP 解析为各症状的实际 key，与主问诊共用 category 实现去重
const GENDER_DAMP_HEAT_FU = ['dampHeat1', 'dampHeat2', 'dampHeat3', 'dampHeat_urineYellowHeat', 'dampHeat_urinePain']
const GENDER_DRYNESS_FU = ['tasteDrySkin', 'tasteChestHeat', 'tasteTinnitus', 'tasteDreams']
const GENDER_QI_STAGNATION_FU = ['hypochondrium', 'chestTight', 'migraine', 'throatLump']
const GENDER_BLOOD_STASIS_FU = ['bloodStasis_subBruise', 'bloodStasis_skinRough', 'bloodStasis_lipPurple']

export const GENDER_QUESTIONS: Record<string, IDetailQuestion> = {
  // ── 男性特异性问题 ──────────────────────────────────────

  // 阳痿
  gender_impotence: {
    category: 'gender_impotence',
    doctorText: '请问您有阳痿的情况吗？',
    options: [
      { label: '遇热阳痿', taCode: 'BNZ1', severityQuestion: { subjectText: '遇热阳痿', lighterCode: 'BNZ1A', heavierCode: 'BNZ1B', followUpQuestions: GENDER_DAMP_HEAT_FU } },
      { label: '与热无关', taCode: 'BNZ2', severityQuestion: { subjectText: '与热无关阳痿', lighterCode: 'BNZ2A', heavierCode: 'BNZ2B', followUpQuestions: ['gfu_penisCold'] } },
    ],
  },

  // 早泄
  gender_premature: {
    category: 'gender_premature',
    doctorText: '请问您有早泄的情况吗？',
    options: [
      { label: '遇热早泄', taCode: 'BNZ3', severityQuestion: { subjectText: '遇热早泄', lighterCode: 'BNZ3A', heavierCode: 'BNZ3B', followUpQuestions: GENDER_DAMP_HEAT_FU } },
      { label: '与热无关', taCode: 'BNZ4', severityQuestion: { subjectText: '与热无关早泄', lighterCode: 'BNZ4A', heavierCode: 'BNZ4B' } },
    ],
  },

  // 遗精
  gender_ejaculation: {
    category: 'gender_ejaculation',
    doctorText: '请问您有遗精的情况吗？',
    options: [
      { label: '遇热遗精', taCode: 'BNZ5', severityQuestion: { subjectText: '遇热遗精', lighterCode: 'BNZ5A', heavierCode: 'BNZ5B', followUpQuestions: GENDER_DAMP_HEAT_FU } },
      { label: '与热无关', taCode: 'BNZ6', severityQuestion: { subjectText: '与热无关遗精', lighterCode: 'BNZ6A', heavierCode: 'BNZ6B' } },
    ],
  },

  // 精少
  gender_semen: {
    category: 'gender_semen',
    doctorText: '请问您有精少的情况吗？',
    options: [
      { label: '精少', taCode: 'BNZ7', severityQuestion: { subjectText: '精少', lighterCode: 'BNZ7A', heavierCode: 'BNZ7B', followUpQuestions: GENDER_DRYNESS_FU } },
    ],
  },

  // 睾丸不适
  gender_testicle: {
    category: 'gender_testicle',
    doctorText: '请问您有睾丸不适的情况吗？',
    options: [
      { label: '睾丸胀', taCode: 'BNZ8', severityQuestion: { subjectText: '睾丸胀', lighterCode: 'BNZ8A', heavierCode: 'BNZ8B', followUpQuestions: GENDER_QI_STAGNATION_FU } },
      { label: '睾丸胀痛', taCode: 'BNZ9', severityQuestion: { subjectText: '睾丸胀痛', lighterCode: 'BNZ9A', heavierCode: 'BNZ9B', followUpQuestions: GENDER_QI_STAGNATION_FU } },
      { label: '睾丸热痛', taCode: 'BNZ10', severityQuestion: { subjectText: '睾丸热痛', lighterCode: 'BNZ10A', heavierCode: 'BNZ10B', followUpQuestions: GENDER_DAMP_HEAT_FU } },
    ],
  },

  // ── 女性特异性问题 ──────────────────────────────────────

  // 月经周期
  gender_menstrual_cycle: {
    category: 'gender_menstrual_cycle',
    doctorText: '请问您的月经周期情况是怎样的？',
    options: [
      { label: '月经先期', taCode: 'BNV1' },
      { label: '月经后期', taCode: 'BNV2' },
      { label: '先后不定期', taCode: 'BNV3' },
    ],
    isFreeInput: true,
  },

  // 月经多少
  gender_menstrual_volume: {
    category: 'gender_menstrual_volume',
    doctorText: '请问您的月经量和时间情况？',
    options: [
      { label: '量多时间长', taCode: 'BNV4' },
      { label: '量少时间短', taCode: 'BNV5', followUpQuestions: GENDER_DRYNESS_FU },
    ],
    isFreeInput: true,
  },

  // 月经颜色
  gender_menstrual_color: {
    category: 'gender_menstrual_color',
    doctorText: '请问您的月经颜色是怎样的？',
    options: [
      { label: '淡红', taCode: 'BNV6' },
      { label: '深红', taCode: 'BNV7' },
      { label: '紫暗', taCode: 'BNV8', followUpQuestions: GENDER_BLOOD_STASIS_FU },
    ],
    isFreeInput: true,
  },

  // 带下
  gender_leukorrhea: {
    category: 'gender_leukorrhea',
    doctorText: '请问您的带下情况是怎样的？',
    options: [
      { label: '带下清量多', taCode: 'BNV9' },
      { label: '带下黄稠', taCode: 'BNV10', followUpQuestions: GENDER_DAMP_HEAT_FU },
      { label: '带下红白相间', taCode: 'BNV11', followUpQuestions: GENDER_DAMP_HEAT_FU },
    ],
    isFreeInput: true,
  },

  // 乳房不适
  gender_breast: {
    category: 'gender_breast',
    doctorText: '请问您有乳房不适的情况吗？',
    options: [
      { label: '乳房胀', taCode: 'BNV12', followUpQuestions: GENDER_QI_STAGNATION_FU },
      { label: '乳房胀痛', taCode: 'BNV13', followUpQuestions: GENDER_QI_STAGNATION_FU },
      { label: '乳房增生', taCode: 'BNV14', followUpQuestions: GENDER_QI_STAGNATION_FU },
    ],
    isFreeInput: true,
  },

  // 男性专项追问：男子阴头寒(PYX4)
  gfu_penisCold: {
    category: 'gfu_penisCold',
    doctorText: '请问您是否有男子阴头寒的情况？',
    options: [
      { label: '有', taCode: 'PYX4', severityQuestion: { subjectText: '男子阴头寒', lighterCode: 'PYX4A', heavierCode: 'PYX4B' } },
      { label: '没有' },
    ],
  },
}

// ── 性别问题序列与条件 ──────────────────────────────────────────

export const GENDER_QUESTION_SEQUENCE: Record<'male' | 'female', string[]> = {
  male: ['gender_impotence', 'gender_premature', 'gender_ejaculation', 'gender_semen', 'gender_testicle'],
  female: ['gender_menstrual_cycle', 'gender_menstrual_volume', 'gender_menstrual_color', 'gender_leukorrhea', 'gender_breast'],
}

export const GENDER_CONDITIONS: Record<'male' | 'female', { gender: string; ageRange: [number, number] }> = {
  male: { gender: '男', ageRange: [16, 65] },
  female: { gender: '女', ageRange: [15, 50] },
}

// ── 主症→问诊题库映射 ──────────────────────────────────────────
export const DETAIL_QUESTION_MAP: Record<string, Record<string, IDetailQuestion>> = {
  '感冒': COLD_QUESTIONS,
  '头痛': HEADACHE_QUESTIONS,
  '咳嗽': COUGH_QUESTIONS,
  '失眠': INSOMNIA_QUESTIONS,
  '慢性疲劳': FATIGUE_QUESTIONS,
}

// ── 主症→问题序列映射 ──────────────────────────────────────────
export const DETAIL_SEQUENCE_MAP: Record<string, Record<string, string[]>> = {
  '感冒': COLD_QUESTION_SEQUENCE,
  '头痛': HEADACHE_QUESTION_SEQUENCE,
  '咳嗽': COUGH_QUESTION_SEQUENCE,
  '失眠': INSOMNIA_QUESTION_SEQUENCE,
  '慢性疲劳': FATIGUE_QUESTION_SEQUENCE,
}

// ── 主症→首题类别映射 ──────────────────────────────────────────
export const DETAIL_FIRST_QUESTION: Record<string, string> = {
  '感冒': 'chillHeat',
  '头痛': 'headacheLocation',
  '咳嗽': 'coughType',
  '失眠': 'sleepDifficulty',
  '慢性疲劳': 'chillHeat',
}

// ── 主症→问题类别→术语解释映射 ──────────────────────────────────
export const DETAIL_EXPLANATION_MAP: Record<string, Record<string, Record<string, string>>> = {
  '感冒': {
    'chillHeat': CHILL_HEAT_EXPLANATIONS,
  },
  '头痛': {
    'headacheLocation': HEADACHE_LOCATION_EXPLANATIONS,
    'painNature': HEADACHE_PAIN_NATURE_EXPLANATIONS,
    'headacheChillHeat': HEADACHE_CHILL_HEAT_EXPLANATIONS,
  },
}