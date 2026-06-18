// 全局用户状态管理：用户基本信息持久化存储
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { IUserInfo } from '@/types/user'

const STORAGE_KEY = 'user_info'

export const useUserStore = defineStore('globalUser', () => {
  // 初始化时从 localStorage 读取
  const storedInfo = localStorage.getItem(STORAGE_KEY)
  const initialInfo: IUserInfo = storedInfo
    ? JSON.parse(storedInfo)
    : {
        name: '',
        gender: '',
        age: null,
        height: null,
        weight: null,
        phone: ''
      }

  const userInfo = ref<IUserInfo>(initialInfo)

  // 新老用户标识（由 createSession 接口返回的 isNewCustomer 设置）
  const isNewUser = ref<boolean>(false)

  const setUserInfo = (info: Partial<IUserInfo>) => {
    userInfo.value = { ...userInfo.value, ...info }
    // 持久化到 localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userInfo.value))
  }

  /** 设置新老用户标识（来自 createSession 接口返回值） */
  const setIsNewUser = (val: boolean) => {
    isNewUser.value = val
  }

  return {
    userInfo,
    isNewUser,
    setUserInfo,
    setIsNewUser
  }
})
