// 经脉相关类型定义
// 定义14条经脉的数据结构、交互事件和组件属性接口

// ── 经脉编号类型 ──────────────────────────────────────────────
export type MeridianCodeType =
  | 'JM1' | 'JM2' | 'JM3' | 'JM4' | 'JM5' | 'JM6' | 'JM7'
  | 'JM8' | 'JM9' | 'JM10' | 'JM11' | 'JM12' | 'JM13' | 'JM14'

// ── 经脉阴阳属性 ──────────────────────────────────────────────
export type MeridianYinYangType = 'yin' | 'yang'

// ── 3D坐标点（三元组） ────────────────────────────────────────
export type Point3D = [number, number, number]

// ── 经脉定义接口 ──────────────────────────────────────────────
export interface IMeridianDef {
  /** 经脉编号，如 JM1 */
  code: MeridianCodeType
  /** 经脉全称，如"手太阴肺经" */
  name: string
  /** 经脉简称，如"肺经" */
  shortName: string
  /** 阴阳属性 */
  yinYang: MeridianYinYangType
  /** 经脉颜色（十六进制），用于3D线条渲染 */
  color: string
  /** 经脉描述（基础版：名称+走向说明） */
  description: string
  /** 走向路线描述 */
  pathway: string
  /** 主要穴位名称列表（8-10个） */
  keyAcupoints: IAcupointDef[]
  /** 八维区域映射：上(S)/中(M)/下(X) */
  zone: 'upper' | 'middle' | 'lower'
  /** 3D路径坐标点数组，用于 CatmullRomCurve3 绘制经脉曲线 */
  pathPoints: Point3D[]
  /** 左右侧标识：双侧经脉(JM1-JM12)有 left/right，中线经脉(JM13/JM14)无此字段 */
  side?: 'left' | 'right'
  /** 经络信息面板的详细文案（后续补充） */
  detailInfo?: string
}

// ── 穴位定义接口 ──────────────────────────────────────────────
export interface IAcupointDef {
  /** 穴位名称，如"中府" */
  name: string
  /** 穴位3D坐标 */
  position: Point3D
  /** 穴位简要说明 */
  brief?: string
}

// ── 经脉点击事件接口 ──────────────────────────────────────────
export interface IMeridianHitEvent {
  /** 被点击的经脉编号 */
  meridianCode: MeridianCodeType
  /** 点击位置的3D坐标 */
  point?: Point3D
  /** 是否点击在穴位上（而非经脉线条） */
  isAcupoint?: boolean
  /** 如果点击穴位，穴位名称 */
  acupointName?: string
}
