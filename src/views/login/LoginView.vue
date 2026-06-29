<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/global/session'
import { fetchVerifyCode, doLogin, fetchQuestionModels } from '@/api/auth'
import { isTauri } from '@/config/proxy'
import VirtualKeyboard from '@/components/business/keyboard/VirtualKeyboard.vue'

import './styles/LoginView.css'

const router = useRouter()
const sessionStore = useSessionStore()

// ── 表单状态 ────────────────────────────────────────────
const username = ref('admin')
const password = ref('wxjk2024')
const captchaCode = ref('')

// ── 验证码图片 ──────────────────────────────────────────
const captchaImageUrl = ref('')
const isCaptchaLoading = ref(false)

// ── 登录状态 ────────────────────────────────────────────
const isLoggingIn = ref(false)
const errorMessage = ref('')

// ── 虚拟键盘状态 ──────────────────────────────────────────
const showKeyboard = ref(false)
const activeField = ref<'username' | 'password' | 'captcha'>('username')

const openKeyboard = (field: 'username' | 'password' | 'captcha') => {
  activeField.value = field
  showKeyboard.value = true
}

const closeKeyboard = () => {
  showKeyboard.value = false
}

const onKeyboardInput = (key: string) => {
  if (activeField.value === 'username') {
    username.value += key
  } else if (activeField.value === 'password') {
    password.value += key
  } else if (activeField.value === 'captcha') {
    captchaCode.value += key
  }
}

const onKeyboardDelete = () => {
  if (activeField.value === 'username') {
    username.value = username.value.slice(0, -1)
  } else if (activeField.value === 'password') {
    password.value = password.value.slice(0, -1)
  } else if (activeField.value === 'captcha') {
    captchaCode.value = captchaCode.value.slice(0, -1)
  }
}

// ── 加载验证码图片 ──────────────────────────────────────
const loadCaptcha = async () => {
  isCaptchaLoading.value = true
  captchaCode.value = '' // 清空已输入的验证码
  errorMessage.value = ''

  // 释放旧的 Blob URL
  if (captchaImageUrl.value) {
    URL.revokeObjectURL(captchaImageUrl.value)
    captchaImageUrl.value = ''
  }

  try {
    const blobUrl = await fetchVerifyCode()
    captchaImageUrl.value = blobUrl
  } catch (e) {
    errorMessage.value = '验证码加载失败，请点击重试'
    if (import.meta.env.DEV) {
      console.error('[登录] 验证码加载失败:', e)
    }
  } finally {
    isCaptchaLoading.value = false
  }
}

// ── 登录提交 ────────────────────────────────────────────
const onLogin = async () => {
  if (isLoggingIn.value) return

  // 表单校验
  if (!username.value.trim()) {
    errorMessage.value = '请输入用户名'
    return
  }
  if (!password.value.trim()) {
    errorMessage.value = '请输入密码'
    return
  }
  if (!captchaCode.value.trim()) {
    errorMessage.value = '请输入验证码'
    return
  }

  isLoggingIn.value = true
  errorMessage.value = ''

  try {
    // 1. 调用登录接口
    const loginResult = await doLogin(
      username.value.trim(),
      password.value,
      captchaCode.value.trim(),
    )

    // 2. Tauri 模式下存储 JSESSIONID（Rust 代理注入在响应体中）
    if (isTauri && loginResult.jsessionId) {
      sessionStore.setSession(loginResult.jsessionId)
    } else if (!isTauri) {
      // 浏览器模式下浏览器自动管理 Cookie，但我们也存一个标记表示已登录
      sessionStore.setSession('browser-managed')
    }

    // 3. 静默拉取数字人模型列表（失败不阻塞登录）
    try {
      const modelsResult = await fetchQuestionModels('数字人', 1, 100)
      sessionStore.setDigitalHumanModels(modelsResult.data)
      if (import.meta.env.DEV) {
        console.log('[登录] 数字人模型列表:', modelsResult.data)
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[登录] 数字人模型拉取失败（不影响登录）:', e)
      }
    }

    // 4. 跳转到首页欢迎
    router.push('/welcome')
  } catch (e) {
    const msg = e instanceof Error ? e.message : '登录失败，请重试'
    errorMessage.value = msg
    if (import.meta.env.DEV) {
      console.error('[登录] 登录失败:', e)
    }
    // 登录失败后刷新验证码
    await loadCaptcha()
  } finally {
    isLoggingIn.value = false
  }
}

// ── 生命周期 ────────────────────────────────────────────
onMounted(() => {
  loadCaptcha()
})

onUnmounted(() => {
  // 释放 Blob URL
  if (captchaImageUrl.value) {
    URL.revokeObjectURL(captchaImageUrl.value)
  }
})
</script>

<template>
  <div class="login-view">
    <!-- 品牌区域 -->
    <div class="login-brand">
      <div class="login-brand-icon">🌿</div>
      <div class="login-brand-title">中医智能问诊系统</div>
      <div class="login-brand-subtitle">操作员登录</div>
    </div>

    <!-- 助理形象 -->
    <div class="login-assistant">
      <img class="login-assistant-img" src="@/assets/assistant.webp" alt="中医助理" />
    </div>

    <!-- 登录表单 -->
    <div class="login-form" :class="{ 'keyboard-open': showKeyboard }">
      <!-- 用户名 -->
      <div
        class="login-field"
        :class="{ active: activeField === 'username' && showKeyboard }"
        @click="openKeyboard('username')"
      >
        <div class="login-field-icon">👤</div>
        <input
          class="login-input"
          type="text"
          :value="username"
          placeholder="请输入用户名"
          autocomplete="off"
          readonly
        />
      </div>

      <!-- 密码 -->
      <div
        class="login-field"
        :class="{ active: activeField === 'password' && showKeyboard }"
        @click="openKeyboard('password')"
      >
        <div class="login-field-icon">🔒</div>
        <input
          class="login-input"
          type="password"
          :value="password"
          placeholder="请输入密码"
          autocomplete="off"
          readonly
        />
      </div>

      <!-- 验证码 -->
      <div
        class="login-field login-field-captcha"
        :class="{ active: activeField === 'captcha' && showKeyboard }"
        @click="openKeyboard('captcha')"
      >
        <div class="login-field-icon">🔢</div>
        <input
          class="login-input login-input-captcha"
          type="text"
          :value="captchaCode"
          placeholder="请输入验证码"
          autocomplete="off"
          inputmode="none"
          maxlength="6"
          readonly
        />
        <div
          class="captcha-image-wrapper"
          :class="{ 'is-loading': isCaptchaLoading }"
          @click.stop="loadCaptcha"
          title="点击刷新验证码"
        >
          <img
            v-if="captchaImageUrl"
            :src="captchaImageUrl"
            alt="验证码"
            class="captcha-image"
          />
          <span v-else class="captcha-placeholder">
            {{ isCaptchaLoading ? '...' : '加载中' }}
          </span>
        </div>
      </div>

      <!-- 错误提示 -->
      <div v-if="errorMessage" class="login-error">
        ⚠️ {{ errorMessage }}
      </div>

      <!-- 登录按钮 -->
      <button
        class="login-btn"
        :disabled="isLoggingIn"
        @click="onLogin"
      >
        {{ isLoggingIn ? '登录中...' : '登 录' }}
      </button>
    </div>

    <!-- 虚拟键盘 -->
    <VirtualKeyboard
      :show="showKeyboard"
      mode="alphanumeric"
      @input="onKeyboardInput"
      @delete="onKeyboardDelete"
      @close="closeKeyboard"
    />
  </div>
</template>
