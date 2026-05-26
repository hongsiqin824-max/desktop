// 3D经脉场景逻辑组合式函数
// 负责模型加载、经脉交互（悬停/点击/高亮）、相机动画等核心逻辑

import { ref, shallowRef, watch, type Ref } from 'vue'
import { useGLTF } from '@tresjs/cientos'
import * as THREE from 'three'
import type { MeridianCodeType, IMeridianDef, IMeridianHitEvent, ViewAngleType, Point3D } from '@/types/meridian'
import { MERIDIAN_DATA, VIEW_ANGLES } from '@/data/meridianData'

export interface IUseMeridianBodyOptions {
  /** 已记录的经脉编号集合 */
  recordedMeridians: Ref<Set<MeridianCodeType>>
}

export interface IUseMeridianBodyReturn {
  /** 3D人体模型是否加载完成 */
  modelLoaded: Ref<boolean>
  /** 3D人体模型根对象 */
  bodyModel: Ref<THREE.Group | null>
  /** 当前悬停的经脉编号 */
  hoveredMeridian: Ref<MeridianCodeType | null>
  /** 当前选中（激活）的经脉编号 */
  activeMeridian: Ref<MeridianCodeType | null>
  /** 经脉点击事件回调 */
  onMeridianClick: (code: MeridianCodeType, point?: Point3D) => void
  /** 经脉悬停事件回调 */
  onMeridianHover: (code: MeridianCodeType | null) => void
  /** 清除当前选中经脉 */
  clearActive: () => void
  /** 动画切换到预设视角 */
  animateToView: (view: ViewAngleType) => { position: THREE.Vector3; lookAt: THREE.Vector3 }
  /** 根据经脉数据获取经脉定义 */
  getMeridianDef: (code: MeridianCodeType) => IMeridianDef | undefined
  /** 查找距离给定3D坐标最近的经脉 */
  findNearestMeridian: (point: Point3D) => MeridianCodeType | null
}

export function useMeridianBody(options: IUseMeridianBodyOptions): IUseMeridianBodyReturn {
  const { recordedMeridians } = options

  // ── 响应式状态 ──────────────────────────────────────────────
  const modelLoaded = ref(false)
  const bodyModel = shallowRef<THREE.Group | null>(null)
  const hoveredMeridian = ref<MeridianCodeType | null>(null)
  const activeMeridian = ref<MeridianCodeType | null>(null)

  // ── 经脉定义查找 ────────────────────────────────────────────
  const getMeridianDef = (code: MeridianCodeType): IMeridianDef | undefined => {
    return MERIDIAN_DATA.find(m => m.code === code)
  }

  // ── 模型加载 ────────────────────────────────────────────────
  const loadModel = async () => {
    try {
      const { state, execute } = useGLTF('/models/human_body.glb')
      await execute()
      const scene = state.value?.scene
      if (!scene) throw new Error('GLTF scene is null')
      // 遍历模型，设置为半透明科技风材质
      scene.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          // 保留原始几何体，替换为半透明发光材质
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0x388BFD,
            transparent: true,
            opacity: 0.15,
            roughness: 0.3,
            metalness: 0.6,
            clearcoat: 0.3,
            clearcoatRoughness: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
          // 添加线框辅助效果
          const wireframe = new THREE.LineSegments(
            new THREE.WireframeGeometry(child.geometry),
            new THREE.LineBasicMaterial({
              color: 0x388BFD,
              transparent: true,
              opacity: 0.25,
            })
          )
          child.add(wireframe)
        }
      })
      // 归一化模型坐标：将模型缩放/平移到与经脉数据相同的坐标空间
      // 经脉数据假设：Y=0为脚底，Y≈1.8为头顶，X/Z≈0为身体中心
      const box = new THREE.Box3().setFromObject(scene)
      const size = new THREE.Vector3()
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)

      // 目标高度：经脉数据的Y范围约 0~1.8
      const TARGET_HEIGHT = 1.8
      const scaleFactor = TARGET_HEIGHT / size.y

      // 先重置模型变换，避免累积
      scene.position.set(0, 0, 0)
      scene.rotation.set(0, 0, 0)
      scene.scale.set(1, 1, 1)

      // 缩放模型使高度匹配
      scene.scale.setScalar(scaleFactor)

      // 重新计算缩放后的包围盒
      const scaledBox = new THREE.Box3().setFromObject(scene)
      const scaledCenter = scaledBox.getCenter(new THREE.Vector3())
      const scaledMin = scaledBox.min.clone()

      // 平移：脚底对齐Y=0，水平居中对齐X=0/Z=0
      scene.position.x -= scaledCenter.x
      scene.position.z -= scaledCenter.z
      scene.position.y -= scaledMin.y

      console.log('[MeridianBody] Model normalized:', { originalHeight: size.y.toFixed(3), scaleFactor: scaleFactor.toFixed(3), finalBox: new THREE.Box3().setFromObject(scene) })

      bodyModel.value = scene
      modelLoaded.value = true
    } catch (error) {
      console.error('3D人体模型加载失败:', error)
      modelLoaded.value = false
    }
  }

  // 立即开始加载模型
  loadModel()

  // ── 经脉交互回调 ────────────────────────────────────────────
  const onMeridianClick = (code: MeridianCodeType, point?: Point3D) => {
    activeMeridian.value = code
  }

  const onMeridianHover = (code: MeridianCodeType | null) => {
    hoveredMeridian.value = code
  }

  const clearActive = () => {
    activeMeridian.value = null
  }

  // ── 相机视角切换 ────────────────────────────────────────────
  const animateToView = (view: ViewAngleType) => {
    const viewDef = VIEW_ANGLES.find(v => v.key === view)
    if (!viewDef) return { position: new THREE.Vector3(0, 1, 2.8), lookAt: new THREE.Vector3(0, 0.9, 0) }
    return {
      position: new THREE.Vector3(...viewDef.cameraPosition),
      lookAt: new THREE.Vector3(...viewDef.lookAt),
    }
  }

  // ── 查找最近经脉（用于模式C的空白区域点击） ────────────────
  // 同时搜索右侧原始点和左侧镜像点（X取反），中线经脉(JM13/JM14)不镜像
  const MIDLINE_CODES = new Set<string>(['JM13', 'JM14'])

  const findNearestMeridian = (point: Point3D): MeridianCodeType | null => {
    let minDist = Infinity
    let nearest: MeridianCodeType | null = null
    const px = point[0], py = point[1], pz = point[2]

    for (const meridian of MERIDIAN_DATA) {
      const isMidline = MIDLINE_CODES.has(meridian.code)

      for (const mp of meridian.pathPoints) {
        // 右侧（原始点）
        const dxR = px - mp[0]
        const dyR = py - mp[1]
        const dzR = pz - mp[2]
        const distR = Math.sqrt(dxR * dxR + dyR * dyR + dzR * dzR)
        if (distR < minDist) {
          minDist = distR
          nearest = meridian.code
        }

        // 左侧（X取反的镜像点）
        if (!isMidline) {
          const dxL = px - (-mp[0])
          const dyL = py - mp[1]
          const dzL = pz - mp[2]
          const distL = Math.sqrt(dxL * dxL + dyL * dyL + dzL * dzL)
          if (distL < minDist) {
            minDist = distL
            nearest = meridian.code
          }
        }
      }
    }

    // 距离超过阈值则不匹配（避免远处误触）
    return minDist < 0.35 ? nearest : null
  }

  // ── 监听已记录经脉变化（调试用途） ──────────────────────────
  watch(recordedMeridians, (newVal) => {
    // 可扩展：当经脉被记录时，在3D场景中改变该经脉的颜色
  }, { deep: true })

  return {
    modelLoaded,
    bodyModel,
    hoveredMeridian,
    activeMeridian,
    onMeridianClick,
    onMeridianHover,
    clearActive,
    animateToView,
    getMeridianDef,
    findNearestMeridian,
  }
}
