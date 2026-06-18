import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/global/session'
import { fetchQuestionModels } from '@/api/auth'

// ── 路由配置 ──────────────────────────────────────────────
// 启动页 → 登录页 → 首页欢迎 → 用户信息 → 问诊流程（欢迎→过渡→问诊）

// 无需登录即可访问的路由
const PUBLIC_ROUTES = new Set(['/', '/login'])

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 启动页
    {
      path: '/',
      name: 'splash',
      component: () => import('../views/splash/SplashView.vue'),
    },
    // 登录页（操作员验证码登录）
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/login/LoginView.vue'),
    },
    // 首页欢迎（助理欢迎）
    {
      path: '/welcome',
      name: 'welcome',
      component: () => import('../views/welcome/AssistantWelcomeView.vue'),
    },
    // 用户信息填写
    {
      path: '/user/form',
      name: 'user-form',
      component: () => import('../views/user/PersonalInfoFormView.vue'),
    },
    // 问诊欢迎页（新老朋友识别）
    {
      path: '/consultation/welcome',
      name: 'consultation-welcome',
      component: () => import('../views/consultation/ConsultationWelcomeView.vue'),
    },
    // 问诊过渡页（连线动画）
    {
      path: '/consultation/transition',
      name: 'consultation-transition',
      component: () => import('../views/transition/TransitionView.vue'),
    },
    // 问诊主页（对话式问诊）
    {
      path: '/consultation',
      name: 'consultation',
      component: () => import('../views/consultation/ConsultationView.vue'),
    }
  ],
})

// ── 路由守卫：检查登录状态 + 恢复模型列表 ─────────────────
router.beforeEach(async (to) => {
  // 公开路由（启动页、登录页）直接放行
  if (PUBLIC_ROUTES.has(to.path)) return true

  // 检查登录状态（beforeEach 在 Pinia 安装后才执行，可安全调用 store）
  const sessionStore = useSessionStore()

  if (!sessionStore.isLoggedIn) {
    // 未登录 → 重定向到登录页
    return { path: '/login' }
  }

  // 已登录但模型列表为空（页面刷新导致内存丢失）→ 重新拉取
  if (sessionStore.digitalHumanModels.length === 0) {
    try {
      const modelsResult = await fetchQuestionModels('数字人', 1, 100)
      sessionStore.setDigitalHumanModels(modelsResult.data)
      if (import.meta.env.DEV) {
        console.log('[路由守卫] 已恢复数字人模型列表:', modelsResult.data.length, '条')
      }
    } catch (e) {
      // 拉取失败不阻塞导航（后端不可用时整个问诊流程本身也无法继续）
      if (import.meta.env.DEV) {
        console.warn('[路由守卫] 数字人模型列表拉取失败:', e)
      }
    }
  }

  // 已登录 → 放行
  return true
})

export default router