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

  // 模拟判定新老用户，默认 false
  const isNewUser = ref<boolean>(false)

  const setUserInfo = (info: Partial<IUserInfo>) => {
    userInfo.value = { ...userInfo.value, ...info }
    // 持久化到 localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userInfo.value))
  }

  const checkUserStatus = (phone: string) => {
    // 使用 localStorage 模拟后端数据库记录新老用户
    const registeredPhonesStr = localStorage.getItem('registered_phones') || '[]'
    let registeredPhones: string[] = []
    try {
      registeredPhones = JSON.parse(registeredPhonesStr)
    } catch {
      registeredPhones = []
    }

    if (registeredPhones.includes(phone)) {
      isNewUser.value = false // 手机号已存在，老用户
    } else {
      isNewUser.value = true // 手机号不存在，新用户
      // 将新手机号加入记录
      registeredPhones.push(phone)
      localStorage.setItem('registered_phones', JSON.stringify(registeredPhones))
    }
  }

  return {
    userInfo,
    isNewUser,
    setUserInfo,
    checkUserStatus
  }
})
