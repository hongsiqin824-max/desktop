import { createRouter, createWebHistory } from 'vue-router'
import SplashView from '../views/splash/SplashView.vue'

// ── 路由配置 ──────────────────────────────────────────────
// 启动页 → 首页欢迎 → 用户信息 → 问诊流程（欢迎→过渡→问诊）

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 启动页
    {
      path: '/',
      name: 'splash',
      component: SplashView,
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

export default router