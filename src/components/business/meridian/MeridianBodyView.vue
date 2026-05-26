<!-- 经脉3D交互组件：人体模型 + 14条经脉曲线 + 穴位标记点 + 交互高亮 -->
<!-- 科技风半透明主题，支持点击经脉、悬停高亮、自由旋转 -->
<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import * as THREE from 'three'
import type { MeridianCodeType, Point3D } from '@/types/meridian'
import { MERIDIAN_DATA } from '@/data/meridianData'
import { useMeridianBody } from '@/composables/useMeridianBody'
import MeridianInfoPanel from './MeridianInfoPanel.vue'
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

// 经脉曲线的 THREE.CatmullRomCurve3 实例缓存
const meridianCurves = computed(() => {
  return MERIDIAN_DATA.map(m => ({
    code: m.code,
    curve: new THREE.CatmullRomCurve3(
      m.pathPoints.map(p => new THREE.Vector3(p[0], p[1], p[2])),
      false,
      'catmullrom',
      0.5,
    ),
  }))
})

// ── 经脉交互处理 ─────────────────────────────────────────────
const meridianTubeRadius = 0.015
const meridianTubeSegments = 64
const meridianRadialSegments = 8

// 创建经脉管道几何体（用于射线检测）
const meridianTubes = computed(() => {
  return meridianCurves.value.map(m => {
    const def = MERIDIAN_DATA.find(d => d.code === m.code)
    const tubeGeo = new THREE.TubeGeometry(m.curve, meridianTubeSegments, meridianTubeRadius, meridianRadialSegments, false)
    return { code: m.code, geometry: tubeGeo, color: def?.color ?? '#64C8FF' }
  })
})

// ── 收集 Three.js 对象引用（用于命令式更新材质）──────────────
const tubeMeshes = new Map<MeridianCodeType, THREE.Mesh>()
const acupointMeshes = new Map<string, THREE.Mesh>()

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

// ── 人体模型点击处理（模式C：空白区域自动匹配最近经脉）─────
const handleBodyClick = (event: any) => {
  if (!event?.point) return
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

// ── 关闭经脉信息面板 ─────────────────────────────────────────
const handlePanelClose = () => {
  meridian.clearActive()
}

// ── 当前激活经脉的定义 ───────────────────────────────────────
const activeMeridianDef = computed(() => {
  if (!meridian.activeMeridian.value) return null
  return meridian.getMeridianDef(meridian.activeMeridian.value) ?? null
})

// ── 命令式更新材质（避免响应式模板绑定导致的循环更新）────────
const updateMaterials = () => {
  const active = meridian.activeMeridian.value
  const hovered = meridian.hoveredMeridian.value
  const recorded = recordedSet.value

  // 更新经脉管道材质
  tubeMeshes.forEach((mesh, code) => {
    const material = mesh.material as THREE.MeshPhysicalMaterial
    if (!material) return

    const def = MERIDIAN_DATA.find(d => d.code === code)
    const baseColor = def?.color ?? '#64C8FF'
    let color = baseColor
    let emissive = baseColor
    let opacity = 0.7

    if (active === code) {
      color = '#FF6B35'
      emissive = '#FF6B35'
      opacity = 1.0
    } else if (hovered === code) {
      color = '#FFD700'
      emissive = '#FFD700'
      opacity = 1.0
    } else if (recorded.has(code)) {
      color = '#00E676'
      emissive = '#00E676'
      opacity = 1.0
    } else if (active && active !== code) {
      opacity = 0.2
    }

    material.color.set(color)
    material.emissive.set(emissive)
    material.opacity = opacity
    material.needsUpdate = true
  })

  // 更新穴位材质
  acupointMeshes.forEach((mesh, key) => {
    const material = mesh.material as THREE.MeshPhysicalMaterial
    if (!material) return

    const code = mesh.userData?.meridianCode as MeridianCodeType
    const isActive = active === code

    material.color.set(isActive ? '#FF6B35' : '#FFD700')
    material.emissive.set(isActive ? '#FF6B35' : '#FFD700')
    material.needsUpdate = true
  })
}

// 监听状态变化，命令式更新材质
watch(
  [() => meridian.activeMeridian.value, () => meridian.hoveredMeridian.value, recordedSet],
  () => {
    nextTick(updateMaterials)
  },
  { deep: true }
)

// 场景加载完成后初始化材质
watch(() => meridian.modelLoaded.value, (loaded) => {
  if (loaded) {
    nextTick(updateMaterials)
  }
})
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

      <!-- 经脉管道（可点击碰撞体，使用静态初始颜色，状态变化通过命令式更新） -->
      <TresMesh
        v-for="tube in meridianTubes"
        :key="tube.code"
        :geometry="tube.geometry"
        :user-data="{ meridianCode: tube.code }"
        @click="handleMeridianMeshClick"
        @pointer-enter="(e: any) => handleMeridianHover(e, tube.code)"
        @pointer-leave="handleMeridianHoverEnd"
        @vue:mounted="(el: any) => { if (el?.$__tresObject) tubeMeshes.set(tube.code, el.$__tresObject) }"
      >
        <TresMeshPhysicalMaterial
          :color="tube.color"
          :emissive="tube.color"
          :emissive-intensity="0.5"
          :transparent="true"
          :opacity="0.7"
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
          @vue:mounted="(el: any) => { if (el?.$__tresObject) acupointMeshes.set(m.code + '-ap-' + ai, el.$__tresObject) }"
        >
          <TresSphereGeometry :args="[0.012, 16, 16]" />
          <TresMeshPhysicalMaterial
            :color="'#FFD700'"
            :emissive="'#FFD700'"
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
      拖拽旋转 · 滚轮缩放 · 点击查看经络详情
    </div>

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
