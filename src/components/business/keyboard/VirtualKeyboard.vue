<script setup lang="ts">
import { ref, computed } from 'vue'
import { pinyinDict } from './pinyinDict'
import './VirtualKeyboard.css'

const props = defineProps<{
  show: boolean
  mode?: 'numeric' | 'chinese' | 'alphanumeric'
}>()

const emit = defineEmits<{
  (e: 'input', key: string): void
  (e: 'delete'): void
  (e: 'close'): void
}>()

const pinyinInput = ref('')
const isShiftActive = ref(false)

const onKeyPress = (key: string) => {
  if (props.mode === 'alphanumeric') {
    // alphanumeric 模式：直接输出字母或数字
    const output = isShiftActive.value ? key.toUpperCase() : key
    emit('input', output)
    // 按一次字母后自动关闭大写
    if (isShiftActive.value && /[a-z]/.test(key)) {
      isShiftActive.value = false
    }
  } else if (props.mode === 'chinese') {
    if (key === ' ') {
      // 空格键可以清空或什么都不做，这里做简单处理
      return
    }
    pinyinInput.value += key
  } else {
    emit('input', key)
  }
}

const onDelete = () => {
  if (props.mode === 'chinese' && pinyinInput.value.length > 0) {
    pinyinInput.value = pinyinInput.value.slice(0, -1)
  } else {
    emit('delete')
  }
}

const onClose = () => {
  pinyinInput.value = ''
  isShiftActive.value = false
  emit('close')
}

const toggleShift = () => {
  isShiftActive.value = !isShiftActive.value
}

// 默认常用姓氏/汉字，当没有输入拼音时显示
const defaultCandidates = ['张', '王', '李', '赵', '陈', '刘', '杨', '黄', '吴', '周']

const candidates = computed(() => {
  if (!pinyinInput.value) return defaultCandidates
  
  const input = pinyinInput.value.toLowerCase()
  
  // 1. 完全匹配
  if (pinyinDict[input]) {
    return pinyinDict[input]
  }
  
  // 2. 前缀匹配：如果用户输入了 'zha'，我们可以找到以 'zha' 开头的所有拼音的汉字
  const matchedKeys = Object.keys(pinyinDict).filter(key => key.startsWith(input))
  if (matchedKeys.length > 0) {
    // 收集所有匹配前缀的汉字，并去重
    const resultSet = new Set<string>()
    // 优先添加较短的拼音匹配结果
    matchedKeys.sort((a, b) => a.length - b.length).forEach(key => {
      pinyinDict[key]!.forEach(char => resultSet.add(char))
    })
    return Array.from(resultSet).slice(0, 20) // 最多显示20个候选字
  }
  
  return [] // 没有匹配项
})

const onSelectCandidate = (char: string) => {
  emit('input', char)
  pinyinInput.value = ''
}

const row1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']
const row2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l']
const row3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm']
const numRow = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
</script>

<template>
  <div class="virtual-keyboard-wrapper" :class="{ show: show }">
    <div class="keyboard-header">
      <div class="keyboard-title">
        {{ mode === 'chinese' ? '全键盘 (中文)' : mode === 'alphanumeric' ? '字母数字键盘' : '数字键盘' }}
      </div>
      <button class="keyboard-close-btn" @click="onClose">完成</button>
    </div>

    <!-- 数字键盘模式 -->
    <div class="keyboard-grid" v-if="mode === 'numeric' || mode === undefined">
      <button class="key-btn" @click="onKeyPress('1')">1</button>
      <button class="key-btn" @click="onKeyPress('2')">2</button>
      <button class="key-btn" @click="onKeyPress('3')">3</button>

      <button class="key-btn" @click="onKeyPress('4')">4</button>
      <button class="key-btn" @click="onKeyPress('5')">5</button>
      <button class="key-btn" @click="onKeyPress('6')">6</button>

      <button class="key-btn" @click="onKeyPress('7')">7</button>
      <button class="key-btn" @click="onKeyPress('8')">8</button>
      <button class="key-btn" @click="onKeyPress('9')">9</button>

      <button class="key-btn key-action" @click="onClose">收起</button>
      <button class="key-btn" @click="onKeyPress('0')">0</button>
      <button class="key-btn key-action" @click="onDelete">删除</button>
    </div>

    <!-- alphanumeric 模式：字母 + 数字 -->
    <div class="keyboard-qwerty" v-else-if="mode === 'alphanumeric'">
      <!-- 数字行 -->
      <div class="qwerty-row">
        <button class="key-btn qwerty-btn num-btn" v-for="key in numRow" :key="key" @click="onKeyPress(key)">{{ key }}</button>
      </div>
      <!-- 字母行 -->
      <div class="qwerty-row">
        <button class="key-btn qwerty-btn" v-for="key in row1" :key="key" @click="onKeyPress(key)">
          {{ isShiftActive ? key.toUpperCase() : key }}
        </button>
      </div>
      <div class="qwerty-row">
        <button class="key-btn qwerty-btn" v-for="key in row2" :key="key" @click="onKeyPress(key)">
          {{ isShiftActive ? key.toUpperCase() : key }}
        </button>
      </div>
      <div class="qwerty-row">
        <button class="key-btn qwerty-btn" v-for="key in row3" :key="key" @click="onKeyPress(key)">
          {{ isShiftActive ? key.toUpperCase() : key }}
        </button>
      </div>
      <!-- 底部功能行 -->
      <div class="qwerty-row">
        <button class="key-btn key-action qwerty-btn key-shift" :class="{ active: isShiftActive }" @click="toggleShift">
          ⇧
        </button>
        <button class="key-btn key-action qwerty-btn key-flex-side" @click="onClose">收起</button>
        <button class="key-btn qwerty-btn key-flex-space" @click="onKeyPress(' ')">空格</button>
        <button class="key-btn key-action qwerty-btn key-flex-side" @click="onDelete">删除</button>
      </div>
    </div>

    <!-- chinese 模式：拼音输入 -->
    <div class="keyboard-qwerty" v-else>
      <div class="chinese-candidate-bar">
        <div class="pinyin-display" v-if="pinyinInput">{{ pinyinInput }}</div>
        <div class="candidate-list">
          <div class="candidate-item" v-for="char in candidates" :key="char" @click="onSelectCandidate(char)">
            {{ char }}
          </div>
        </div>
      </div>

      <div class="qwerty-row">
        <button class="key-btn qwerty-btn" v-for="key in row1" :key="key" @click="onKeyPress(key)">{{ key }}</button>
      </div>
      <div class="qwerty-row">
        <button class="key-btn qwerty-btn" v-for="key in row2" :key="key" @click="onKeyPress(key)">{{ key }}</button>
      </div>
      <div class="qwerty-row">
        <button class="key-btn qwerty-btn" v-for="key in row3" :key="key" @click="onKeyPress(key)">{{ key }}</button>
      </div>
      <div class="qwerty-row">
        <button class="key-btn key-action qwerty-btn key-flex-side" @click="onClose">收起</button>
        <button class="key-btn qwerty-btn key-flex-space" @click="onKeyPress(' ')">空格</button>
        <button class="key-btn key-action qwerty-btn key-flex-side" @click="onDelete">删除</button>
      </div>
    </div>
  </div>
</template>
