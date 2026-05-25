/** 性别类型 */
export type GenderType = '男' | '女'

/** 用户信息 */
export interface IUserInfo {
  /** 姓名 */
  name: string
  /** 性别 */
  gender: GenderType | ''
  /** 年龄 */
  age: number | null
  /** 身高(cm) */
  height: number | null
  /** 体重(kg) */
  weight: number | null
  /** 手机号 */
  phone: string
}