<!-- 经脉3D交互组件：人体模型 + 14条经脉曲线 + 穴位标记点 + 交互高亮 -->
<!-- 科技风半透明主题，支持点击经脉、悬停高亮、视角切换 -->
<script setup lang="ts">
import { ref, computed, watch, shallowRef, onMounted, onUnmounted } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import * as THREE from 'three'
import type { MeridianCodeType, Point3D, ViewAngleType } from '@/types/meridian'
import { MERIDIAN_DATA, VIEW_ANGLES } from '@/data/meridianData'
import { useMeridianBody } from '@/composables/useMeridianBody'
import MeridianInfoPanel from './MeridianInfoPanel.vue'
import ViewAngleControls from './ViewAngleControls.vue'
import RecordedMeridians from './RecordedMeridians.vue'
import './styles/meridian.css'

// ── 组件属性 ─────────────────────────────────────────────────
const props = defineProps<{
  /** 已记录的经脉编号集合，用于在3D场景中标记已选经脉 */
  recordedMeridians?: Set<MeridianCodeType>
}>()

// ── 组件事件 ─────────────────────────────────────────────────
const emit = defineEmits<{
  /** 用户点击某条经脉时触发 */
  (e: 'meridian-select', event: { meridianCode: MeridianCodeType; point?: Point3D }): void
}>()

// ── 内部状态 ─────────────────────────────────────────────────
const recordedSet = computed(() => props.recordedMeridians ?? new Set<MeridianCodeType>())
const meridian = useMeridianBody({ recordedMeridians: recordedSet })

// 相机引用
const cameraRef = ref<THREE.PerspectiveCamera | null>(null)
const controlsRef = ref<any>(null)

// 悬停提示
const tooltipVisible = ref(false)
const tooltipText = ref('')
const tooltipX = ref(0)
const tooltipY = ref(0)

// 当前视角
const currentView = ref<ViewAngleType>('front')

// 经脉曲线的 THREE.CatmullRomCurve3 实例缓存
const meridianCurves = computed(() => {
  return MERIDIAN_DATA.map(m => ({
    code: m.code,
    color: m.color,
    curve: new THREE.CatmullRomCurve3(
      m.pathPoints.map(p => new THREE.Vector3(p[0], p[1], p[2])),
      false,
      'catmullrom',
      0.5,
    ),
  }))
})

// ── 经脉交互处理 ─────────────────────────────────────────────
// 由于 TresJS 的 @click 事件无法直接绑定到 Line 对象，
// 采用透明管道几何体（TubeGeometry）作为可点击的经脉碰撞体
const meridianTubeRadius = 0.015
const meridianTubeSegments = 64
const meridianRadialSegments = 8

// 创建经脉管道几何体（用于射线检测）
const meridianTubes = computed(() => {
  return meridianCurves.value.map(m => {
    const tubeGeo = new THREE.TubeGeometry(m.curve, meridianTubeSegments, meridianTubeRadius, meridianRadialSegments, false)
    return { code: m.code, geometry: tubeGeo }
  })
})

// ── 经脉点击处理 ─────────────────────────────────────────────
const handleMeridianMeshClick = (event: any) => {
  if (!event?.object?.userData?.meridianCode) return
  const code = event.object.userData.meridianCode as MeridianCodeType
  const point: Point3D | undefined = event.point
    ? [event.point.x, event.point.y, event.point.z]
    : undefined
  meridian.onMeridianClick(code, point)
  emit('meridian-select', { meridianCode: code, point })
}

// ── 人体模型点击处理（模式C：空白区域自动匹配最近经脉） ──────
const handleBodyClick = (event: any) => {
  if (!event?.point) return
  // 如果点击的是经脉管道（已有meridianCode），不处理
  if (event.object?.userData?.meridianCode) return
  const point: Point3D = [event.point.x, event.point.y, event.point.z]
  const nearest = meridian.findNearestMeridian(point)
  if (nearest) {
    meridian.onMeridianClick(nearest, point)
    emit('meridian-select', { meridianCode: nearest, point })
  }
}

// ── 经脉悬停处理 ─────────────────────────────────────────────
const handleMeridianHover = (event: any, code: MeridianCodeType) => {
  meridian.onMeridianHover(code)
  const def = meridian.getMeridianDef(code)
  if (def) {
    tooltipText.value = def.shortName
    tooltipVisible.value = true
  }
}

const handleMeridianHoverEnd = () => {
  meridian.onMeridianHover(null)
  tooltipVisible.value = false
}

// ── 视角切换 ─────────────────────────────────────────────────
const handleViewChange = (view: ViewAngleType) => {
  currentView.value = view
  const target = meridian.animateToView(view)
  if (cameraRef.value && controlsRef.value) {
    // 使用简单的线性插值动画
    const camera = cameraRef.value
    const controls = controlsRef.value
    const startPos = camera.position.clone()
    const startTarget = controls.target.clone()
    const duration = 800
    const startTime = performance.now()

    const animate = () => {
      const elapsed = performance.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      // 使用缓动函数 easeInOutCubic
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      camera.position.lerpVectors(startPos, target.position, ease)
      controls.target.lerpVectors(startTarget, target.lookAt, ease)
      controls.update()

      if (t < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }
}

// ── 关闭经脉信息面板 ─────────────────────────────────────────
const handlePanelClose = () => {
  meridian.clearActive()
}

// ── 当前激活经脉的定义 ───────────────────────────────────────
const activeMeridianDef = computed(() => {
  if (!meridian.activeMeridian.value) return null
  return meridian.getMeridianDef(meridian.activeMeridian.value) ?? null
})

// ── 经脉管道材质计算（根据状态返回不同颜色） ─────────────────
const getMeridianTubeColor = (code: MeridianCodeType): string => {
  if (meridian.activeMeridian.value === code) return '#FF6B35'
  if (meridian.hoveredMeridian.value === code) return '#FFD700'
  if (recordedSet.value.has(code)) return '#00E676'
  return 'rgba(100, 200, 255, 0.6)'
}

const getMeridianTubeEmissive = (code: MeridianCodeType): string => {
  if (meridian.activeMeridian.value === code) return '#FF6B35'
  if (meridian.hoveredMeridian.value === code) return '#FFD700'
  if (recordedSet.value.has(code)) return '#00E676'
  return '#1a3a5c'
}

const getMeridianTubeOpacity = (code: MeridianCodeType): number => {
  if (meridian.activeMeridian.value === code) return 1.0
  if (meridian.hoveredMeridian.value === code) return 1.0
  if (meridian.activeMeridian.value && meridian.activeMeridian.value !== code) return 0.2
  return 0.7
}
</script>

<template>
  <div class="meridian-body-view">
    <!-- 加载状态 -->
    <div v-if="!meridian.modelLoaded.value" class="meridian-loading">
      <div class="meridian-loading-spinner"></div>
      <div class="meridian-loading-text">正在加载人体模型…</div>
    </div>

    <!-- 3D画布 -->
    <TresCanvas
      v-if="meridian.modelLoaded.value"
      class="meridian-canvas"
      clear-color="#0D1117"
      :alpha="false"
      :antialias="true"
      :tone-mapping="THREE.ACESFilmicToneMapping"
      :tone-mapping-exposure="1.2"
    >
      <!-- 相机 -->
      <TresPerspectiveCamera
        ref="cameraRef"
        :position="[0, 1.0, 2.8]"
        :fov="45"
        :near="0.1"
        :far="100"
      />

      <!-- 轨道控制器（自由旋转/缩放） -->
      <OrbitControls
        ref="controlsRef"
        :enable-pan="false"
        :min-distance="1.5"
        :max-distance="5.0"
        :min-polar-angle="0.3"
        :max-polar-angle="2.8"
        :enable-damping="true"
        :damping-factor="0.08"
      />

      <!-- 灯光系统 -->
      <TresAmbientLight :intensity="0.6" color="#4488FF" />
      <TresDirectionalLight :position="[5, 8, 5]" :intensity="0.8" color="#FFFFFF" />
      <TresDirectionalLight :position="[-3, 5, -5]" :intensity="0.4" color="#4488FF" />
      <TresPointLight :position="[0, 2, 2]" :intensity="0.3" color="#FFD700" :distance="8" />

      <!-- 人体模型 -->
      <primitive
        v-if="meridian.bodyModel.value"
        :object="meridian.bodyModel.value"
        @click="handleBodyClick"
      />

      <!-- 经脉管道（可点击碰撞体） -->
      <TresMesh
        v-for="tube in meridianTubes"
        :key="tube.code"
        :geometry="tube.geometry"
        :user-data="{ meridianCode: tube.code }"
        @click="handleMeridianMeshClick"
        @pointer-enter="(e: any) => handleMeridianHover(e, tube.code)"
        @pointer-leave="handleMeridianHoverEnd"
      >
        <TresMeshPhysicalMaterial
          :color="getMeridianTubeColor(tube.code)"
          :emissive="getMeridianTubeEmissive(tube.code)"
          :emissive-intensity="0.5"
          :transparent="true"
          :opacity="getMeridianTubeOpacity(tube.code)"
          :roughness="0.2"
          :metalness="0.8"
          :clearcoat="1.0"
          :depth-write="false"
        />
      </TresMesh>

      <!-- 穴位标记点（小球体） -->
      <template v-for="m in MERIDIAN_DATA" :key="'points-' + m.code">
        <TresMesh
          v-for="(ap, ai) in m.keyAcupoints"
          :key="m.code + '-ap-' + ai"
          :position="ap.position"
          :user-data="{ meridianCode: m.code, acupointName: ap.name }"
          @click="(e: any) => { meridian.onMeridianClick(m.code, ap.position); emit('meridian-select', { meridianCode: m.code, point: ap.position }) }"
          @pointer-enter="(e: any) => handleMeridianHover(e, m.code)"
          @pointer-leave="handleMeridianHoverEnd"
        >
          <TresSphereGeometry :args="[0.012, 16, 16]" />
          <TresMeshPhysicalMaterial
            :color="meridian.activeMeridian.value === m.code ? '#FF6B35' : '#FFD700'"
            :emissive="meridian.activeMeridian.value === m.code ? '#FF6B35' : '#FFD700'"
            :emissive-intensity="0.8"
            :transparent="true"
            :opacity="0.9"
            :roughness="0.1"
            :metalness="0.9"
          />
        </TresMesh>
      </template>
    </TresCanvas>

    <!-- 悬停提示浮层 -->
    <div
      v-if="tooltipVisible"
      class="meridian-tooltip"
      :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
    >
      {{ tooltipText }}
    </div>

    <!-- 操作提示 -->
    <div v-if="meridian.modelLoaded.value" class="meridian-hint">
      点击经脉线或身体部位查看经络信息
    </div>

    <!-- 视角切换按钮 -->
    <ViewAngleControls
      v-if="meridian.modelLoaded.value"
      :current-view="currentView"
      @view-change="handleViewChange"
    />

    <!-- 已记录经脉指示器 -->
    <RecordedMeridians
      v-if="recordedSet.size > 0"
      :recorded-meridians="recordedSet"
    />

    <!-- 经络信息面板 -->
    <MeridianInfoPanel
      v-if="activeMeridianDef"
      :meridian-def="activeMeridianDef"
      @close="handlePanelClose"
    />
  </div>
</template>
