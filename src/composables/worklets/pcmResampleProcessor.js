// FIR 低通滤波 + 降采样 + AGC PCM 处理器（AudioWorklet 渲染线程）
// 避免主线程阻塞，每 128 样本产出稳定节奏的 16kHz 16位整型 PCM

class PCMResampleProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._active = false
    this._firCoeffs = null
    this._firOverlap = null
    this._agcPeak = 0
    this._filterTaps = 65
    this._filterCutoffHz = 6500
    this._targetRate = 16000
    this._agcTargetLevel = 0.6
    this._agcMaxGain = 10
    this._agcDecayFactor = 0.97

    this.port.onmessage = (e) => {
      if (e.data.type === 'start') {
        this._firCoeffs = this._designLowpassFIR(this._filterCutoffHz, sampleRate)
        this._firOverlap = new Float32Array(this._filterTaps - 1)
        this._agcPeak = 0
        this._active = true
      } else if (e.data.type === 'stop') {
        this._active = false
        // 主动通知主线程：worklet 已停止，可以安全断开
        this.port.postMessage({ type: 'flushed' })
      }
    }
  }

  _designLowpassFIR(cutoffHz, sampleRate) {
    const N = this._filterTaps
    const coeffs = new Float32Array(N)
    const mid = (N - 1) / 2
    const fc = cutoffHz / sampleRate

    for (let i = 0; i < N; i++) {
      const n = i - mid
      if (n === 0) {
        coeffs[i] = 2 * fc
      } else {
        coeffs[i] = Math.sin(2 * Math.PI * fc * n) / (Math.PI * n)
        coeffs[i] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (N - 1))
      }
    }

    let sum = 0
    for (let i = 0; i < N; i++) sum += coeffs[i]
    for (let i = 0; i < N; i++) coeffs[i] /= sum

    return coeffs
  }

  _measurePeak(data) {
    let peak = 0
    for (let i = 0; i < data.length; i++) {
      const v = data[i] || 0
      const abs = v > 0 ? v : -v
      if (abs > peak) peak = abs
    }
    return peak
  }

  _resample(chunk) {
    const srcRate = sampleRate
    const dstRate = this._targetRate

    if (srcRate === dstRate) {
      const peak = this._measurePeak(chunk)
      this._agcPeak = Math.max(peak, this._agcPeak * this._agcDecayFactor)
      const gain = Math.min(this._agcMaxGain, this._agcTargetLevel / Math.max(this._agcPeak, 0.01))
      const out = new Int16Array(chunk.length)
      for (let i = 0; i < chunk.length; i++) {
        out[i] = Math.max(-32768, Math.min(32767, Math.round((chunk[i] || 0) * gain * 32767)))
      }
      return out
    }

    if (!this._firCoeffs) return null

    const N = this._filterTaps
    const overlapLen = N - 1
    const L = chunk.length

    const extended = new Float32Array(overlapLen + L)
    extended.set(this._firOverlap)
    extended.set(chunk, overlapLen)
    this._firOverlap = chunk.slice(-overlapLen)

    const filtered = new Float32Array(L)
    for (let i = 0; i < L; i++) {
      let sum = 0
      for (let j = 0; j < N; j++) {
        sum += this._firCoeffs[j] * extended[overlapLen + i - j]
      }
      filtered[i] = sum
    }

    const chunkPeak = this._measurePeak(filtered)
    this._agcPeak = Math.max(chunkPeak, this._agcPeak * this._agcDecayFactor)
    const gain = Math.min(this._agcMaxGain, this._agcTargetLevel / Math.max(this._agcPeak, 0.01))

    const ratio = srcRate / dstRate
    const outputLen = Math.floor(L / ratio)
    const out = new Int16Array(outputLen)
    for (let i = 0; i < outputLen; i++) {
      const srcIdx = Math.floor(i * ratio)
      out[i] = Math.max(-32768, Math.min(32767, Math.round((filtered[srcIdx] || 0) * gain * 32767)))
    }

    return out
  }

  process(inputs) {
    if (!this._active) return true

    const input = inputs[0] && inputs[0][0]
    if (!input) return true

    const pcm = this._resample(input)
    if (pcm && pcm.length > 0) {
      this.port.postMessage({ type: 'pcm', data: pcm }, [pcm.buffer])
    }

    return true
  }
}

registerProcessor('pcm-resample-processor', PCMResampleProcessor)