<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useUserStore } from '@/stores/global/user'
import type { GenderType } from '@/types/user'
import ValidationAlert from './components/ValidationAlert.vue'
import VirtualKeyboard from '@/components/business/keyboard/VirtualKeyboard.vue'
import { useTTSStore } from '@/stores/global/tts'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import { fetchLLMCompletion } from '@/api/llm'
import { buildUserInfoParseMessages, parseUserInfoResult } from '@/data/llmPrompt'
import './styles/PersonalInfoFormView.css'

const router = useRouter()
const userStore = useUserStore()
const ttsStore = useTTSStore()
const { status: speechStatus, errorMessage: speechError, startAndWait: startSpeechAndWait, stop: stopSpeech } = useSpeechRecognition()

const fullBubbleText = '请完善个人信息，或点击语音按钮直接填写～'

const isVoiceParsing = ref(false)
const isVoiceBusy = ref(false)
const showVoiceToast = ref(false)
const showErrorToast = ref(false)
const errorToastText = ref('')

onMounted(async () => {
  // 文字直接显示完整内容，TTS 作为背景音播放
  await ttsStore.speakSync(fullBubbleText, 'nurse', () => {})
})

onUnmounted(() => {
  ttsStore.stop()
  stopSpeech()
})

/** 路由离开前确保麦克风释放（双重保障） */
onBeforeRouteLeave(() => {
  stopSpeech()
})

const form = ref({
  name: '',
  gender: '' as GenderType | '',
  age: '' as string,
  height: '' as string,
  weight: '' as string,
  phone: ''
})

const showValidationAlert = ref(false)
const showIncompleteAlert = ref(false)
const showPhoneAlert = ref(false)
const showKeyboard = ref(false)
const activeField = ref<'name' | 'age' | 'height' | 'weight' | 'phone' | null>(null)
const keyboardMode = ref<'numeric' | 'chinese'>('numeric')

const formContainerStyle = ref<Record<string, string>>({
  top: '1440px',
  height: '603px'
})

const openKeyboard = (field: 'name' | 'age' | 'height' | 'weight' | 'phone', mode: 'numeric' | 'chinese' = 'numeric', event?: MouseEvent) => {
  activeField.value = field
  keyboardMode.value = mode
  showKeyboard.value = true

  formContainerStyle.value = {
    top: '60px',
    height: '1160px'
  }

  if (event && event.currentTarget) {
    const target = event.currentTarget as HTMLElement
    nextTick(() => {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 350)
    })
  }
}

const closeKeyboard = () => {
  showKeyboard.value = false
  formContainerStyle.value = {
    top: '1440px',
    height: '603px'
  }
}

const onKeyboardInput = (key: string) => {
  if (!activeField.value) return

  const currentVal = form.value[activeField.value] || ''

  if (activeField.value === 'phone' && currentVal.length >= 11) return

  form.value[activeField.value] = currentVal + key
}

const onKeyboardDelete = () => {
  if (!activeField.value) return
  const currentVal = form.value[activeField.value] || ''
  if (currentVal.length > 0) {
    form.value[activeField.value] = currentVal.slice(0, -1)
  }
}

// ── 语音输入处理：录音 → LLM提取 → 自动填充 ──
const onVoiceMicClick = async () => {
  if (isVoiceBusy.value) return
  isVoiceBusy.value = true
  ttsStore.stop()

  if (speechStatus.value === 'listening') {
    showVoiceToast.value = false
    stopSpeech()
    isVoiceBusy.value = false
    return
  }

  if (speechStatus.value === 'error') {
    showVoiceToast.value = false
    showErrorToast.value = false
    stopSpeech()
    isVoiceBusy.value = false
    return
  }

  showVoiceToast.value = true
  showErrorToast.value = false

  const text = await startSpeechAndWait()

  showVoiceToast.value = false

  if (speechError.value) {
    showErrorToast.value = true
    errorToastText.value = speechError.value || '语音识别失败，请重试'
    setTimeout(() => { showErrorToast.value = false }, 3000)
    isVoiceBusy.value = false
    return
  }

  if (!text) {
    isVoiceBusy.value = false
    return
  }

  isVoiceParsing.value = true
  try {
    const messages = buildUserInfoParseMessages(text)
    const raw = await fetchLLMCompletion(messages)
    const result = parseUserInfoResult(raw)

    if (result) {
      if (result.name) form.value.name = result.name
      if (result.gender) form.value.gender = result.gender
      if (result.age) form.value.age = String(result.age)
      if (result.height) form.value.height = String(result.height)
      if (result.weight) form.value.weight = String(result.weight)
      if (result.phone) form.value.phone = result.phone

      isVoiceParsing.value = false
      isVoiceBusy.value = false
      await ttsStore.speakSync('好的，我已经帮您填写了识别到的信息，请检查一下是否正确，如有需要可以手动修改。', 'nurse', () => {})
    } else {
      isVoiceParsing.value = false
      isVoiceBusy.value = false
      await ttsStore.speakSync('抱歉，我没能听清楚您的信息，请手动填写或再试一次语音输入。', 'nurse', () => {})
    }
  } catch {
    isVoiceParsing.value = false
    isVoiceBusy.value = false
    await ttsStore.speakSync('语音识别服务暂时不可用，请手动填写您的信息。', 'nurse', () => {})
  }
}

const onStopRecording = () => {
  showVoiceToast.value = false
  stopSpeech()
}

const onSubmit = () => {
  closeKeyboard()

  if (!form.value.name || !form.value.gender || !form.value.age || !form.value.height || !form.value.weight || !form.value.phone) {
    showIncompleteAlert.value = true
    return
  }

  if (form.value.phone.length !== 11) {
    showPhoneAlert.value = true
    return
  }

  const height = Number(form.value.height)
  const weight = Number(form.value.weight)

  if (height < 100 || height > 250 || weight < 20 || weight > 300) {
    showValidationAlert.value = true
    return
  }

  submitData()
}

const onReEdit = () => {
  showValidationAlert.value = false
}

const submitData = () => {
  userStore.setUserInfo({
    name: form.value.name,
    gender: form.value.gender as GenderType,
    age: Number(form.value.age),
    height: Number(form.value.height),
    weight: Number(form.value.weight),
    phone: form.value.phone
  })

  userStore.checkUserStatus(form.value.phone)
  router.push('/consultation/welcome')
}
</script>

<template>
  <div class="form-view">
    <!-- 常驻上半屏：中医助理数字人（键盘弹出时隐藏以腾出空间） -->
    <div class="user-assistant-section" v-show="!showKeyboard">
      <img class="user-assistant-img" src="@/assets/assistant.webp" alt="中医助理" />
    </div>

    <!-- 数字人助理对话气泡（含内嵌语音按钮） -->
    <div class="form-assistant-bubble" v-show="!showKeyboard">
      <div class="form-bubble-text">
        请完善个人信息，或点击
        <button
          v-show="!isVoiceParsing"
          class="inline-voice-btn"
          :class="speechStatus"
          @click="onVoiceMicClick"
          :title="speechStatus === 'listening' ? '点击停止录音' : '点击语音输入个人信息'"
        >
          <span class="inline-mic-icon">🎤</span>
          <span class="inline-mic-label">{{ speechStatus === 'listening' ? '正在录音...' : '语音填写' }}</span>
        </button>
        直接填写
      </div>
    </div>

    <!-- 语音解析中提示 -->
    <div class="voice-parsing-overlay" v-if="isVoiceParsing">
      <div class="voice-parsing-box">
        <div class="voice-parsing-icon">⏳</div>
        <div class="voice-parsing-text">正在识别您的信息...</div>
      </div>
    </div>

    <!-- 语音录音提示浮层 -->
    <div class="voice-toast-overlay" v-if="showVoiceToast">
      <div class="voice-toast-box">
        <div class="voice-toast-icon">🎤</div>
        <div class="voice-toast-text">正在录音，请说出您的个人信息...</div>
        <div class="voice-toast-hint">例如：我叫小红，女性，34岁，身高一米六，体重50公斤，手机号13812345678</div>
        <button class="voice-toast-stop-btn" @click="onStopRecording">停止录音</button>
      </div>
    </div>

    <!-- 语音错误提示 -->
    <div class="voice-error-overlay" v-if="showErrorToast">
      <div class="voice-error-box">
        <div class="voice-error-text">{{ errorToastText }}</div>
      </div>
    </div>

    <!-- 下半屏可滚动表单区域 -->
    <div class="form-scroll-container" :style="formContainerStyle">
      <div class="form-list">
        <div class="form-item" @click="openKeyboard('name', 'chinese', $event)">
          <div class="form-label">姓名</div>
          <input class="form-input" :value="form.name" readonly placeholder="请输入您的姓名" />
        </div>

        <div class="form-item">
          <div class="form-label">性别</div>
          <div class="radio-group">
            <div class="radio-item" @click="form.gender = '男'">
              <div class="radio-circle" :class="{ active: form.gender === '男' }"></div>
              <div class="radio-label">男</div>
            </div>
            <div class="radio-item" @click="form.gender = '女'">
              <div class="radio-circle" :class="{ active: form.gender === '女' }"></div>
              <div class="radio-label">女</div>
            </div>
          </div>
        </div>

        <div class="form-item" @click="openKeyboard('age', 'numeric', $event)">
          <div class="form-label">年龄</div>
          <input class="form-input" :value="form.age" readonly placeholder="请输入年龄（岁）" />
        </div>

        <div class="form-item" @click="openKeyboard('height', 'numeric', $event)">
          <div class="form-label">身高</div>
          <input class="form-input" :value="form.height" readonly placeholder="请输入身高（cm）" />
        </div>

        <div class="form-item" @click="openKeyboard('weight', 'numeric', $event)">
          <div class="form-label">体重</div>
          <input class="form-input" :value="form.weight" readonly placeholder="请输入体重（kg）" />
        </div>

        <div class="form-item" @click="openKeyboard('phone', 'numeric', $event)">
          <div class="form-label">手机号</div>
          <input class="form-input" :value="form.phone" readonly placeholder="仅用于身份识别" />
        </div>

        <!-- 将按钮放入滚动容器，防止被遮挡 -->
        <button class="submit-btn" @click="onSubmit">确认提交</button>
      </div>
    </div>

    <!-- 拟数字小键盘 -->
    <VirtualKeyboard
      :show="showKeyboard"
      :mode="keyboardMode"
      @input="onKeyboardInput"
      @delete="onKeyboardDelete"
      @close="closeKeyboard"
    />

    <!-- 异常值提示弹窗（只能重新填写，无法确认通过） -->
    <ValidationAlert
      :show="showValidationAlert"
      @re-edit="onReEdit"
    />

    <!-- 手机号格式错误提示 -->
    <div class="custom-toast-overlay" v-if="showPhoneAlert">
      <div class="custom-toast-box">
        <div class="custom-toast-title">手机号格式错误</div>
        <div class="custom-toast-message">手机号码需为 11 位数字，请重新输入</div>
        <button class="custom-toast-btn" @click="showPhoneAlert = false; form.phone = ''">重新输入</button>
      </div>
    </div>

    <!-- 信息未填写完整提示 -->
    <div class="custom-toast-overlay" v-if="showIncompleteAlert">
      <div class="custom-toast-box">
        <div class="custom-toast-title">提示</div>
        <div class="custom-toast-message">请填写完整信息</div>
        <button class="custom-toast-btn" @click="showIncompleteAlert = false">确定</button>
      </div>
    </div>
  </div>
</template>
