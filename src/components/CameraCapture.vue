<script setup lang="ts">
// 摄像头拍照组件：实时预览 + 一键拍照
//
// 流程：
//   打开摄像头 → <video> 实时预览 → 用户点拍照 → <canvas> 截图 → 返回 File
//
// 硬件要求：
//   - 系统默认摄像头（UVC 标准，即插即用）
//   - WebView2（Tauri）和浏览器均支持 getUserMedia

import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const emit = defineEmits<{
  (e: 'captured', file: File): void
  (e: 'cancel'): void
  (e: 'error', message: string): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const errorMsg = ref('')
const isCapturing = ref(false)  // 拍照按钮禁用状态
const videoReady = ref(false)   // 视频流已就绪，可以拍照

let stream: MediaStream | null = null
let unmounted = false  // 防止组件销毁后 getUserMedia 才返回

// ── 打开摄像头 ──────────────────────────────────────────────

async function initCamera(): Promise<void> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 960 } },
    })
    // 如果组件已卸载（用户在权限弹窗期间取消），立刻关闭流
    if (unmounted) {
      stream.getTracks().forEach((t) => t.stop())
      stream = null
      return
    }
    if (videoRef.value) {
      const video = videoRef.value
      video.srcObject = stream

      // 多种方式检测视频流就绪（不同浏览器/WebView 触发的事件不同）
      let readyHandled = false
      const markReady = () => {
        if (!readyHandled) {
          readyHandled = true
          videoReady.value = true
        }
      }
      video.addEventListener('loadedmetadata', markReady)
      video.addEventListener('playing', markReady)
      video.addEventListener('canplay', markReady)

      // 兜底：2 秒后如果事件都没触发，直接检查尺寸
      setTimeout(() => {
        if (!readyHandled && video.videoWidth > 0) {
          markReady()
        }
      }, 2000)
    }
  } catch (e) {
    if (unmounted) return
    const msg = e instanceof Error ? e.message : String(e)
    errorMsg.value = '无法打开摄像头，请检查设备连接后重试'
    emit('error', msg)
  }
}

// ── 拍照：截取当前帧 → 转 File ───────────────────────────────

function capturePhoto(): void {
  if (!videoRef.value || !stream || !videoReady.value) return

  isCapturing.value = true

  const video = videoRef.value
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    isCapturing.value = false
    return
  }

  ctx.drawImage(video, 0, 0)

  canvas.toBlob(
    (blob) => {
      isCapturing.value = false
      if (blob) {
        const file = new File([blob], `tongue_${Date.now()}.jpg`, { type: 'image/jpeg' })
        emit('captured', file)
      }
    },
    'image/jpeg',
    0.92,
  )
}

// ── 关闭摄像头流（释放硬件占用） ──────────────────────────────

function stopStream(): void {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    stream = null
  }
}

function handleCancel(): void {
  stopStream()
  emit('cancel')
}

// ── 生命周期 ─────────────────────────────────────────────────

onMounted(() => {
  initCamera()
})

onBeforeUnmount(() => {
  unmounted = true
  stopStream()
})

// srcObject 不是响应式属性，需要手动同步
watch(videoRef, (el) => {
  if (el && stream) {
    el.srcObject = stream
  }
})
</script>

<template>
  <div class="camera-wrapper">
    <!-- 摄像头错误提示 -->
    <div v-if="errorMsg" class="camera-error">
      <div class="camera-error-icon">⚠️</div>
      <div class="camera-error-text">{{ errorMsg }}</div>
    </div>

    <!-- 实时预览 -->
    <video
      v-else
      ref="videoRef"
      autoplay
      playsinline
      muted
      class="camera-video"
    />

    <!-- 操作按钮 -->
    <div class="camera-actions">
      <button
        class="camera-btn camera-btn--capture"
        :disabled="!stream || !videoReady || isCapturing"
        @click="capturePhoto"
      >
        📸 拍照
      </button>
      <button class="camera-btn camera-btn--cancel" @click="handleCancel">
        取消
      </button>
    </div>
  </div>
</template>

<style scoped>
.camera-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  width: 100%;
}

.camera-video {
  width: 100%;
  max-width: 640px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 20px;
  background: #1a1a2e;
}

.camera-error {
  width: 100%;
  max-width: 640px;
  aspect-ratio: 4 / 3;
  border-radius: 20px;
  background: rgba(220, 38, 38, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.camera-error-icon {
  font-size: 48px;
}

.camera-error-text {
  font-size: 28px;
  color: #dc2626;
}

.camera-actions {
  display: flex;
  gap: 20px;
}

.camera-btn {
  padding: 16px 40px;
  border-radius: 30px;
  font-size: 30px;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s;
}

.camera-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.camera-btn--capture {
  background: linear-gradient(135deg, #10b981, #34d399);
  color: white;
}

.camera-btn--cancel {
  background: rgba(100, 100, 120, 0.15);
  color: #6b7280;
}
</style>
