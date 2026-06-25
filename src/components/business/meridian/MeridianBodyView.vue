<!-- 经脉3D交互组件：人体模型 + 14条经脉曲线 + 穴位标记点 + 交互高亮 -->
<!-- 科技风半透明主题，支持点击经脉、悬停高亮、自由旋转 -->
<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import * as THREE from 'three'
import type { MeridianCodeType, Point3D, IMeridianDef } from '@/types/meridian'
import { MERIDIAN_DATA } from '@/data/meridianData'
import {
  MERIDIAN_DEFAULT_COLOR, MERIDIAN_ACTIVE_COLOR, MERIDIAN_HOVER_COLOR,
  MERIDIAN_RECORDED_COLOR, ACUPOINT_DEFAULT_COLOR,
  SCENE_CLEAR_COLOR, SCENE_AMBIENT_LIGHT_COLOR, SCENE_DIRECTIONAL_LIGHT_COLOR,
  SCENE_POINT_LIGHT_COLOR,
} from '@/data/meridianColors'
import { useMeridianBody } from '@/composables/useMeridianBody'
import MeridianInfoPanel from './MeridianInfoPanel.vue'
import RecordedMeridians from './RecordedMeridians.vue'
import './meridian.css'

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
const canvasContainerRef = ref<HTMLElement | null>(null)

// 悬停提示
const tooltipVisible = ref(false)
const tooltipText = ref('')
const tooltipX = ref(0)
const tooltipY = ref(0)

// 更新 tooltip 位置（跟随鼠标，相对于 .meridian-body-view 容器）
const updateTooltipPosition = (e: MouseEvent) => {
  const container = canvasContainerRef.value?.parentElement
  if (!container) return
  const rect = container.getBoundingClientRect()
  tooltipX.value = e.clientX - rect.left + 15
  tooltipY.value = e.clientY - rect.top + 15
}

// ── 中线经脉（不需要左右镜像）─────────────────────────────────
const MIDLINE_MERIDIANS = new Set<MeridianCodeType>(['JM13', 'JM14'])

// 展开后的全部经脉数据：原始14条 + 12条左侧镜像 = 26条
// MERIDIAN_DATA 是静态数据，不会变化，无需 computed 响应式
const allMeridianData: IMeridianDef[] = (() => {
  const result: IMeridianDef[] = MERIDIAN_DATA.map(m => ({
    ...m,
    side: MIDLINE_MERIDIANS.has(m.code) ? undefined : 'right' as const,
  }))
  for (const m of MERIDIAN_DATA) {
    if (MIDLINE_MERIDIANS.has(m.code)) continue
    result.push({
      ...m,
      side: 'left' as const,
      pathPoints: m.pathPoints.map(([x, y, z]) => [-x, y, z] as Point3D),
      keyAcupoints: m.keyAcupoints.map(ap => ({
        ...ap,
        position: [-ap.position[0], ap.position[1], ap.position[2]] as Point3D,
      })),
    })
  }
  return result
})()

// ── 经脉交互处理 ─────────────────────────────────────────────
const meridianTubeRadius = 0.015
const meridianTubeSegments = 64
const meridianRadialSegments = 8

// 创建经脉管道几何体（静态数据，一次性计算，后续仅通过 updateMaterials 修改颜色）
const meridianTubes = allMeridianData.map(m => {
  const curve = new THREE.CatmullRomCurve3(
    m.pathPoints.map(p => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    'catmullrom',
    0.5,
  )
  const def = MERIDIAN_DATA.find(d => d.code === m.code)
  const tubeGeo = new THREE.TubeGeometry(curve, meridianTubeSegments, meridianTubeRadius, meridianRadialSegments, false)
  return { code: m.code, side: m.side, geometry: tubeGeo, color: def?.color ?? MERIDIAN_DEFAULT_COLOR }
})

// 碰撞检测管道：半径 0.008（比视觉管道 0.015 更细），不可见材质
// 避免相邻经脉碰撞区域重叠（如 JM8/JM12 间距仅 0.022），用于射线检测悬停
const meridianCollisionRadius = 0.008
const collisionTubes = allMeridianData.map(m => {
  const curve = new THREE.CatmullRomCurve3(
    m.pathPoints.map(p => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    'catmullrom',
    0.5,
  )
  const collisionGeo = new THREE.TubeGeometry(curve, meridianTubeSegments, meridianCollisionRadius, meridianRadialSegments, false)
  return { code: m.code, side: m.side, geometry: collisionGeo }
})

// ── 收集 Three.js 对象引用（用于命令式更新材质）──────────────
// 键格式：经脉code + 侧别后缀，如 'JM1-right'、'JM1-left'、'JM13'（中线无后缀）
const tubeMeshes = new Map<string, THREE.Mesh>()
const acupointMeshes = new Map<string, THREE.Mesh>()
const collisionMeshes = new Map<string, THREE.Mesh>()

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
const handleMeridianHover = (code: MeridianCodeType) => {
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

// ── 射线检测悬停（直接对碰撞管道做射线检测，替代不可靠的 pointer-enter）──
const hoverRaycaster = new THREE.Raycaster()
const hoverMouseNDC = new THREE.Vector2()

const onPointerMove = (e: PointerEvent) => {
  updateTooltipPosition(e)

  // [DEBUG] 临时调试日志：检查三个 Map 是否收集到 Three.js 对象
  if (import.meta.env.DEV && Math.random() < 0.02) {
    console.log('[debug] tubeMeshes:', tubeMeshes.size, 'collisionMeshes:', collisionMeshes.size, 'acupointMeshes:', acupointMeshes.size)
  }

  const camera = cameraRef.value
  const container = canvasContainerRef.value
  if (!camera || !container) return

  const rect = container.getBoundingClientRect()
  hoverMouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  hoverMouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  hoverRaycaster.setFromCamera(hoverMouseNDC, camera)

  // 对所有碰撞管道做射线检测（Three.js 自动按距离排序，hits[0] 为最近）
  const allCollisionMeshes = Array.from(collisionMeshes.values())
  const hits = hoverRaycaster.intersectObjects(allCollisionMeshes, false)

  if (hits.length > 0) {
    const firstHit = hits[0]!
    const code = firstHit.object.userData?.meridianCode as MeridianCodeType
    if (code) {
      handleMeridianHover(code)
      return
    }
  }
  handleMeridianHoverEnd()
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
  tubeMeshes.forEach((mesh, meshKey) => {
    const material = mesh.material as THREE.MeshPhysicalMaterial
    if (!material) return

    // meshKey 格式: 'JM1-right' | 'JM1-left' | 'JM13'，提取经脉 code
    const code = meshKey.split('-')[0] as MeridianCodeType

    const def = MERIDIAN_DATA.find(d => d.code === code)
    const baseColor = def?.color ?? MERIDIAN_DEFAULT_COLOR
    let color = baseColor
    let emissive = baseColor
    let opacity = 0.7

    if (active === code) {
      color = MERIDIAN_ACTIVE_COLOR
      emissive = MERIDIAN_ACTIVE_COLOR
      opacity = 1.0
    } else if (hovered === code) {
      color = MERIDIAN_HOVER_COLOR
      emissive = MERIDIAN_HOVER_COLOR
      opacity = 1.0
    } else if (recorded.has(code)) {
      color = MERIDIAN_RECORDED_COLOR
      emissive = MERIDIAN_RECORDED_COLOR
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

    material.color.set(isActive ? MERIDIAN_ACTIVE_COLOR : ACUPOINT_DEFAULT_COLOR)
    material.emissive.set(isActive ? MERIDIAN_ACTIVE_COLOR : ACUPOINT_DEFAULT_COLOR)
    material.needsUpdate = true
  })
}

// 使用 requestAnimationFrame 合并同一帧内的多次状态变化，避免高频交互时重复遍历 mesh
let materialUpdatePending = false
const scheduleMaterialUpdate = () => {
  if (materialUpdatePending) return
  materialUpdatePending = true
  requestAnimationFrame(() => {
    materialUpdatePending = false
    updateMaterials()
  })
}

// 监听状态变化，命令式更新材质
watch(
  [() => meridian.activeMeridian.value, () => meridian.hoveredMeridian.value, recordedSet],
  scheduleMaterialUpdate,
  { deep: true }
)

// 场景加载完成后初始化材质
watch(() => meridian.modelLoaded.value, (loaded) => {
  if (loaded) {
    nextTick(updateMaterials)
  }
})

// ── 组件卸载时清理 Three.js 资源（防止 GPU 内存泄漏）────────
onUnmounted(() => {
  // 清理经脉管道几何体和材质
  tubeMeshes.forEach((mesh) => {
    mesh.geometry?.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) {
      mat.forEach(m => m.dispose())
    } else {
      mat?.dispose()
    }
  })
  tubeMeshes.clear()

  // 清理穴位球体几何体和材质
  acupointMeshes.forEach((mesh) => {
    mesh.geometry?.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) {
      mat.forEach(m => m.dispose())
    } else {
      mat?.dispose()
    }
  })
  acupointMeshes.clear()

  // 清理人体模型 GLB 场景树
  const body = meridian.bodyModel.value
  if (body) {
    body.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        const mat = child.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) {
          mat.forEach(m => m.dispose())
        } else {
          mat?.dispose()
        }
      } else if (child instanceof THREE.LineSegments) {
        child.geometry?.dispose()
        const mat = child.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) {
          mat.forEach(m => m.dispose())
        } else {
          mat?.dispose()
        }
      }
    })
  }

  // 清理 meridianTubes 中缓存的 TubeGeometry
  meridianTubes.forEach(tube => {
    tube.geometry?.dispose()
  })

  // 清理碰撞检测管道的 TubeGeometry
  collisionTubes.forEach(tube => {
    tube.geometry?.dispose()
  })

  collisionMeshes.clear()
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
    <div ref="canvasContainerRef" class="meridian-canvas-wrapper" @pointermove="onPointerMove" @pointerleave="handleMeridianHoverEnd">
    <TresCanvas
      v-if="meridian.modelLoaded.value"
      class="meridian-canvas"
      :clear-color="SCENE_CLEAR_COLOR"
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
        :target="[0, 0.9, 0]"
        :enable-pan="false"
        :min-distance="1.5"
        :max-distance="5.0"
        :min-polar-angle="0.3"
        :max-polar-angle="2.8"
        :enable-damping="true"
        :damping-factor="0.08"
      />

      <!-- 灯光系统 -->
      <TresAmbientLight :intensity="0.6" :color="SCENE_AMBIENT_LIGHT_COLOR" />
      <TresDirectionalLight :position="[5, 8, 5]" :intensity="0.8" :color="SCENE_DIRECTIONAL_LIGHT_COLOR" />
      <TresDirectionalLight :position="[-3, 5, -5]" :intensity="0.4" :color="SCENE_AMBIENT_LIGHT_COLOR" />
      <TresPointLight :position="[0, 2, 2]" :intensity="0.3" :color="SCENE_POINT_LIGHT_COLOR" :distance="8" />

      <!-- 人体模型 -->
      <primitive
        v-if="meridian.bodyModel.value"
        :object="meridian.bodyModel.value"
        @click="handleBodyClick"
      />

      <!-- 经脉管道（可点击碰撞体，使用静态初始颜色，状态变化通过命令式更新） -->
      <TresMesh
        v-for="tube in meridianTubes"
        :key="tube.code + (tube.side ? '-' + tube.side : '')"
        :geometry="tube.geometry"
        :user-data="{ meridianCode: tube.code }"
        @click="handleMeridianMeshClick"
        :ref="(el: any) => { const key = tube.code + (tube.side ? '-' + tube.side : ''); if (el?.$__tresObject) tubeMeshes.set(key, el.$__tresObject); else tubeMeshes.delete(key) }"
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
      <template v-for="m in allMeridianData" :key="'points-' + m.code + (m.side ? '-' + m.side : '')">
        <TresMesh
          v-for="(ap, ai) in m.keyAcupoints"
          :key="m.code + (m.side ? '-' + m.side : '') + '-ap-' + ai"
          :position="ap.position"
          :user-data="{ meridianCode: m.code, acupointName: ap.name }"
          @click="(e: any) => { meridian.onMeridianClick(m.code, ap.position); emit('meridian-select', { meridianCode: m.code, point: ap.position }) }"
          :ref="(el: any) => { const key = m.code + (m.side ? '-' + m.side : '') + '-ap-' + ai; if (el?.$__tresObject) acupointMeshes.set(key, el.$__tresObject); else acupointMeshes.delete(key) }"
        >
          <TresSphereGeometry :args="[0.012, 16, 16]" />
          <TresMeshPhysicalMaterial
            :color="ACUPOINT_DEFAULT_COLOR"
            :emissive="ACUPOINT_DEFAULT_COLOR"
            :emissive-intensity="0.8"
            :transparent="true"
            :opacity="0.9"
            :roughness="0.1"
            :metalness="0.9"
          />
        </TresMesh>
      </template>

      <!-- 碰撞检测管道（不可见，仅用于射线检测悬停） -->
      <TresMesh
        v-for="tube in collisionTubes"
        :key="'col-' + tube.code + (tube.side ? '-' + tube.side : '')"
        :geometry="tube.geometry"
        :user-data="{ meridianCode: tube.code }"
        :ref="(el: any) => {
          const key = tube.code + (tube.side ? '-' + tube.side : '')
          if (el?.$__tresObject) collisionMeshes.set(key, el.$__tresObject)
          else collisionMeshes.delete(key)
        }"
      >
        <TresMeshBasicMaterial :visible="false" />
      </TresMesh>
    </TresCanvas>
    </div>

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
