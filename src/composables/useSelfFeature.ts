// 自选特征逻辑组合式函数：部位选择→症状性质→程度→继续添加 子步骤流转
import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { StepIdType, IChatOption, ISelfFeatureRecord, SelfFeatureSubStepType } from '@/types/consultation'
import { SELF_FEATURE_LOCATIONS, SELF_FEATURE_SYMPTOMS, SELF_FEATURE_CATEGORY_OPTIONS, SELF_FEATURE_SEVERITY_OPTIONS, SELF_FEATURE_MAX_COUNT } from '@/data/selfFeature'
import { FLOW_STEPS } from '@/data/consultationFlow'
import { generateResponse } from '@/data/consultationResponse'
import type { IUserInfo } from '@/types/user'

export interface ISelfFeatureContext {
  userInfo: ComputedRef<IUserInfo>
  messages: Ref<import('@/types/consultation').IChatMessage[]>
  goToStep: (stepId: StepIdType, symptom?: string) => Promise<void>
  doctorSay: (text: string, delay?: number) => Promise<void>
  scrollToBottom: () => Promise<void>
}

export function useSelfFeature(ctx: ISelfFeatureContext) {
  const { userInfo, messages, goToStep, doctorSay, scrollToBottom } = ctx

  const selfFeatureSubStep = ref<SelfFeatureSubStepType>('location')
  const selfFeatureRecords = ref<ISelfFeatureRecord[]>([])
  const selfFeatureCurrentLocation = ref<string>('')
  const selfFeatureCurrentLocationZone = ref<'upper' | 'middle' | 'lower'>('upper')
  const selfFeatureCurrentSymptom = ref<string>('')
  const selfFeatureCurrentSymptomCategory = ref<'K' | 'X' | 'P'>('P')
  const selfFeatureCurrentSymptomBaseCode = ref<string>('')
  const selfFeatureCurrentSymptomFixedTaCode = ref<string | undefined>(undefined)
  const selfFeatureExpandKey = ref<string>('')

  const filteredLocations = computed(() => {
    const { gender, age } = userInfo.value
    return SELF_FEATURE_LOCATIONS.filter(l => {
      if (!l.genderCondition) return true
      if (l.genderCondition === 'male' && gender !== '男') return false
      if (l.genderCondition === 'female' && gender !== '女') return false
      if (l.ageRange) {
        const [min, max] = l.ageRange
        if (age === null || age < min || age > max) return false
      }
      return true
    })
  })

  const filteredCategoryOptions = computed(() => {
    const { gender, age } = userInfo.value
    return SELF_FEATURE_CATEGORY_OPTIONS.filter(c => {
      if (!c.genderCondition) return true
      if (c.genderCondition === 'male' && gender !== '男') return false
      if (c.genderCondition === 'female' && gender !== '女') return false
      if (c.ageRange) {
        const [min, max] = c.ageRange
        if (age === null || age < min || age > max) return false
      }
      return true
    })
  })

  // 构建自选特征动态步骤
  const buildSelfFeatureStep = () => {
    const count = selfFeatureRecords.value.length
    const stepId = 'self_feature_question' as StepIdType

    if (selfFeatureSubStep.value === 'location') {
      const doneOption: IChatOption = { label: '没有其他不适了', nextStep: 'self_feature_summary' as StepIdType, payload: undefined }
      if (count > 0) doneOption.label = '没有了，就这些'
      return {
        id: stepId,
        doctorText: count > 0 ? `好的，已记录。接下来请问第${count + 1}个不适在什么位置？` : '请问您身体其他部位是否有不适的感觉？如果有的话，请先告诉我在什么位置。',
        options: [...filteredLocations.value.map(l => ({ label: l.label, nextStep: stepId, payload: undefined, semanticDesc: l.semanticDesc })), doneOption],
        isFreeInput: true,
        isEnd: false,
      }
    }

    if (selfFeatureSubStep.value === 'nature') {
      const commonOptions = (SELF_FEATURE_SYMPTOMS.common ?? []).map(s => ({ label: s.label, nextStep: stepId, payload: undefined, semanticDesc: s.semanticDesc }))
      const categoryOptions = filteredCategoryOptions.value.map(c => ({ label: c.label, nextStep: stepId, payload: undefined, semanticDesc: c.semanticDesc }))
      return {
        id: stepId,
        doctorText: `了解了，${selfFeatureCurrentLocation.value}需要注意。请问这种不适具体是什么感觉？如果您不太理解这些术语，可以让我解释。`,
        options: [...commonOptions, ...categoryOptions],
        isFreeInput: true,
        isEnd: false,
      }
    }

    if (selfFeatureSubStep.value === 'nature_expand') {
      const expandedSymptoms = SELF_FEATURE_SYMPTOMS[selfFeatureExpandKey.value] || []
      const symptomOptions = expandedSymptoms.map(s => ({ label: s.label, nextStep: stepId, payload: undefined, semanticDesc: s.semanticDesc }))
      const backOption: IChatOption = { label: '返回上一页', nextStep: stepId, payload: undefined }
      return {
        id: stepId,
        doctorText: '以下是该类别的所有症状，请选择最接近的一项：',
        options: [...symptomOptions, backOption],
        isFreeInput: true,
        isEnd: false,
      }
    }

    if (selfFeatureSubStep.value === 'severity') {
      return {
        id: stepId,
        doctorText: `请问${selfFeatureCurrentSymptom.value}的程度如何？`,
        options: SELF_FEATURE_SEVERITY_OPTIONS.map(s => ({ label: s.label, nextStep: stepId, payload: undefined, semanticDesc: s.semanticDesc })),
        isFreeInput: true,
        isEnd: false,
      }
    }

    if (selfFeatureSubStep.value === 'continue') {
      const maxReached = count >= SELF_FEATURE_MAX_COUNT
      return {
        id: stepId,
        doctorText: maxReached ? `您已经描述了${count}个部位的不适，已达到上限。接下来我们确认一下这些信息。` : `好的，已记录${selfFeatureCurrentLocation.value}的${selfFeatureCurrentSymptom.value}。您还有其他部位的不适吗？（已记录${count}/${SELF_FEATURE_MAX_COUNT}个）`,
        options: maxReached ? [{ label: '确认提交', nextStep: 'self_feature_summary' as StepIdType, payload: undefined }] : [{ label: '继续添加', nextStep: stepId, payload: undefined }, { label: '没有了，就这些', nextStep: 'self_feature_summary' as StepIdType, payload: undefined }],
        isFreeInput: true,
        isEnd: false,
      }
    }

    return FLOW_STEPS['self_feature_question']
  }

  // 查找自选症状数据
  const findSelfFeatureSymptom = (label: string) => {
    for (const group of Object.values(SELF_FEATURE_SYMPTOMS)) {
      const found = group.find(s => s.label === label)
      if (found) return found
    }
    return null
  }

  // 记录症状信息到当前特征
  const applySymptomData = (label: string) => {
    const symptom = findSelfFeatureSymptom(label)
    if (symptom) {
      selfFeatureCurrentSymptom.value = symptom.label
      selfFeatureCurrentSymptomCategory.value = symptom.category
      selfFeatureCurrentSymptomBaseCode.value = symptom.baseCode
      selfFeatureCurrentSymptomFixedTaCode.value = symptom.fixedTaCode
    }
  }

  // 记录完整的自选特征
  const pushRecord = (severity: 1 | 2) => {
    selfFeatureRecords.value.push({
      location: selfFeatureCurrentLocation.value,
      locationZone: selfFeatureCurrentLocationZone.value,
      symptom: selfFeatureCurrentSymptom.value,
      symptomCategory: selfFeatureCurrentSymptomCategory.value,
      symptomBaseCode: selfFeatureCurrentSymptomBaseCode.value,
      severity,
      fixedTaCode: selfFeatureCurrentSymptomFixedTaCode.value,
    })
  }

  // 处理自选特征选项点击，返回 true 表示已处理
  const handleSelfFeatureOptionClick = async (label: string): Promise<boolean> => {
    messages.value.push({ role: 'user', text: label })
    await scrollToBottom()

    if (selfFeatureSubStep.value === 'location') {
      if (label === '没有其他不适了' || label === '没有了，就这些') {
        await goToStep('self_feature_summary')
        return true
      }
      const location = filteredLocations.value.find(l => l.label === label)
      if (location) {
        selfFeatureCurrentLocation.value = location.label
        selfFeatureCurrentLocationZone.value = location.zone
      }
      selfFeatureSubStep.value = 'nature'
      selfFeatureExpandKey.value = ''
      await doctorSay(generateResponse('O_VALID'), 300)
      await doctorSay(buildSelfFeatureStep().doctorText)
      return true
    }

    if (selfFeatureSubStep.value === 'nature') {
      const categoryOption = filteredCategoryOptions.value.find(c => c.label === label)
      if (categoryOption) {
        selfFeatureSubStep.value = 'nature_expand'
        selfFeatureExpandKey.value = categoryOption.expandKey
        await doctorSay(buildSelfFeatureStep().doctorText)
        return true
      }
      applySymptomData(label)
      selfFeatureSubStep.value = 'severity'
      await doctorSay(generateResponse('O_VALID'), 300)
      await doctorSay(buildSelfFeatureStep().doctorText)
      return true
    }

    if (selfFeatureSubStep.value === 'nature_expand') {
      if (label === '返回上一页') {
        selfFeatureSubStep.value = 'nature'
        selfFeatureExpandKey.value = ''
        await doctorSay('好的，请从以下选项中选择：')
        await doctorSay(buildSelfFeatureStep().doctorText)
        return true
      }
      applySymptomData(label)
      selfFeatureSubStep.value = 'severity'
      await doctorSay(generateResponse('O_VALID'), 300)
      await doctorSay(buildSelfFeatureStep().doctorText)
      return true
    }

    if (selfFeatureSubStep.value === 'severity') {
      const severityOption = SELF_FEATURE_SEVERITY_OPTIONS.find(s => s.label === label)
      pushRecord((severityOption?.value ?? 1) as 1 | 2)
      selfFeatureSubStep.value = 'continue'
      await doctorSay(generateResponse('O_VALID'), 300)
      await doctorSay(buildSelfFeatureStep().doctorText)
      return true
    }

    if (selfFeatureSubStep.value === 'continue') {
      if (label === '继续添加') {
        selfFeatureSubStep.value = 'location'
        selfFeatureCurrentLocation.value = ''
        await doctorSay(buildSelfFeatureStep().doctorText)
        return true
      }
      if (label === '没有了，就这些' || label === '确认提交') {
        await goToStep('self_feature_summary')
        return true
      }
    }
    return true
  }

  // 处理自选特征自由文本输入，返回 true 表示已处理
  const handleSelfFeatureSubmitText = async (text: string): Promise<boolean> => {
    // 解释请求
    if (text.includes('解释') || text.includes('什么意思') || text.includes('不懂') || text.includes('不理解') || text.includes('不清楚')) {
      const currentSymptomLabel = selfFeatureSubStep.value === 'nature' || selfFeatureSubStep.value === 'nature_expand'
        ? findSelfFeatureSymptom(text) ?? findSelfFeatureSymptom(selfFeatureCurrentSymptom.value)
        : null
      if (currentSymptomLabel) {
        await doctorSay(`${currentSymptomLabel.label}：${currentSymptomLabel.brief}\n\n深度解释：${currentSymptomLabel.detail}`)
        return true
      }
      if (selfFeatureSubStep.value === 'nature' || selfFeatureSubStep.value === 'nature_expand') {
        const explanations = (SELF_FEATURE_SYMPTOMS.common ?? []).map(s => `${s.label}：${s.brief}`).join('\n')
        await doctorSay('我为您简单解释一下这些症状含义：\n\n' + explanations)
        return true
      }
    }

    if (selfFeatureSubStep.value === 'location') {
      const locationKeywords: Record<string, string> = {
        '头': '头部', '脑袋': '头部', '脑子': '头部', '额头': '头部',
        '脖子': '颈肩', '肩': '颈肩', '肩膀': '颈肩', '颈椎': '颈肩',
        '胸': '胸背', '胸口': '胸背', '胸闷': '胸背', '后背': '胸背', '背': '胸背',
        '肚子': '上腹部', '胃': '上腹部', '上腹': '上腹部',
        '下腹': '下腹部', '小腹': '下腹部', '小肚子': '下腹部',
        '腰': '腰背', '腰背': '腰背', '腰椎': '腰背',
        '手': '上肢', '胳膊': '上肢', '手臂': '上肢', '肘': '上肢',
        '腿': '下肢', '脚': '下肢', '膝': '下肢', '小腿': '下肢', '大腿': '下肢',
        ...buildGenderLocationKeywords(),
      }
      const matched = Object.keys(locationKeywords).find(kw => text.includes(kw))
      if (matched) {
        const targetLabel = locationKeywords[matched]
        if (!targetLabel) return true
        const target = filteredLocations.value.find(l => l.label === targetLabel)
        if (target) {
          selfFeatureCurrentLocation.value = target.label
          selfFeatureCurrentLocationZone.value = target.zone
          selfFeatureSubStep.value = 'nature'
          await doctorSay(`好的，${target.label}需要注意。请问这种不适具体是什么感觉？`, 300)
          return true
        }
      }
      if (text.includes('没有') || text.includes('没有不适') || text.includes('没了') || text.includes('都不')) {
        await goToStep('self_feature_summary')
        return true
      }
      await doctorSay('请您从给出的选项中选择不适的部位，或者直接说出部位名称，比如"腰部""肩膀"等。')
      return true
    }

    if (selfFeatureSubStep.value === 'nature') {
      const symptom = findSelfFeatureSymptom(text)
      if (symptom) {
        selfFeatureCurrentSymptom.value = symptom.label
        selfFeatureCurrentSymptomCategory.value = symptom.category
        selfFeatureCurrentSymptomBaseCode.value = symptom.baseCode
        selfFeatureCurrentSymptomFixedTaCode.value = symptom.fixedTaCode
        selfFeatureSubStep.value = 'severity'
        await doctorSay(generateResponse('O_VALID'), 300)
        await doctorSay(buildSelfFeatureStep().doctorText)
        return true
      }
      await doctorSay('请您从给出的选项中选择最接近的感觉，或选择类别查看更多症状类型。')
      return true
    }

    if (selfFeatureSubStep.value === 'severity') {
      if (text.includes('轻') || text.includes('一点') || text.includes('轻微')) {
        pushRecord(1)
        selfFeatureSubStep.value = 'continue'
        await doctorSay(generateResponse('O_VALID'), 300)
        await doctorSay(buildSelfFeatureStep().doctorText)
        return true
      }
      if (text.includes('重') || text.includes('严重') || text.includes('厉害')) {
        pushRecord(2)
        selfFeatureSubStep.value = 'continue'
        await doctorSay(generateResponse('O_VALID'), 300)
        await doctorSay(buildSelfFeatureStep().doctorText)
        return true
      }
      await doctorSay('请问这种不适的程度如何？您可以选择"较轻"或"较重"，或者用文字描述。')
      return true
    }

    if (selfFeatureSubStep.value === 'continue') {
      if (text.includes('继续') || text.includes('还有') || text.includes('添加')) {
        selfFeatureSubStep.value = 'location'
        await doctorSay(buildSelfFeatureStep().doctorText)
        return true
      }
      if (text.includes('没有') || text.includes('没了') || text.includes('就这些') || text.includes('算了')) {
        await goToStep('self_feature_summary')
        return true
      }
      await doctorSay('请问您还有其他部位不适吗？可以选择"继续添加"或"没有了，就这些"。')
      return true
    }

    await doctorSay('请您从给出的选项中选择，或直接输入您的感受。')
    return true
  }

  // 根据用户性别构建部位关键词映射
  const buildGenderLocationKeywords = (): Record<string, string> => {
    const genderKw: Record<string, string> = {}
    const fLocs = filteredLocations.value
    if (fLocs.some(l => l.label === '男性生殖')) {
      genderKw['生殖'] = '男性生殖'; genderKw['阴茎'] = '男性生殖'; genderKw['睾丸'] = '男性生殖'; genderKw['勃起'] = '男性生殖'; genderKw['阳痿'] = '男性生殖'
    }
    if (fLocs.some(l => l.label === '女性生殖')) {
      genderKw['生殖'] = '女性生殖'; genderKw['月经'] = '女性生殖'; genderKw['带下'] = '女性生殖'; genderKw['白带'] = '女性生殖'; genderKw['经期'] = '女性生殖'
    }
    if (fLocs.some(l => l.label === '乳房')) {
      genderKw['乳房'] = '乳房'; genderKw['乳腺'] = '乳房'
    }
    return genderKw
  }

  // 重置自选特征状态
  const resetSelfFeature = () => {
    selfFeatureRecords.value = []
    selfFeatureSubStep.value = 'location'
  }

  // 生成自选特征汇总文本
  const getSummaryText = (): string => {
    if (selfFeatureRecords.value.length === 0) {
      return '好的，您没有其他部位的不适。所有信息已确认完成，接下来系统将根据您的整体情况进行辨证分析。'
    }
    const lines = selfFeatureRecords.value.map((r, i) => `${i + 1}. ${r.location}：${r.symptom}（${r.severity === 1 ? '较轻' : '较重'}）`)
    return `以下是您提到的所有额外身体不适，请确认是否准确：\n\n${lines.join('\n')}`
  }

  return {
    selfFeatureSubStep,
    selfFeatureRecords,
    selfFeatureCurrentLocation,
    selfFeatureCurrentLocationZone,
    selfFeatureCurrentSymptom,
    selfFeatureCurrentSymptomCategory,
    selfFeatureCurrentSymptomBaseCode,
    selfFeatureCurrentSymptomFixedTaCode,
    selfFeatureExpandKey,
    filteredLocations,
    filteredCategoryOptions,
    buildSelfFeatureStep,
    findSelfFeatureSymptom,
    handleSelfFeatureOptionClick,
    handleSelfFeatureSubmitText,
    resetSelfFeature,
    getSummaryText,
  }
}
