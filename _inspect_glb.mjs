// GLB 模型精确检查：只分析 POSITION 类型 accessor
import { readFileSync } from 'fs'

const data = readFileSync('public/models/human_body.glb')
const chunk0Length = data.readUInt32LE(12)
const jsonData = data.subarray(20, 20 + chunk0Length)
const json = JSON.parse(jsonData.toString('utf8'))

// 二进制 chunk 起始位置
const binOffset = 20 + chunk0Length + 8 // header(12) + json_chunk_header(8) + json_data

// 找到 POSITION accessor
const mesh = json.meshes[0]
const primitive = mesh.primitives[0]
const posAccessorIdx = primitive.attributes.POSITION
const posAccessor = json.accessors[posAccessorIdx]

console.log(`POSITION accessor #${posAccessorIdx}:`)
console.log(`  type: ${posAccessor.type}`)
console.log(`  componentType: ${posAccessor.componentType}`)
console.log(`  count: ${posAccessor.count}`)
console.log(`  min: [${posAccessor.min}]`)
console.log(`  max: [${posAccessor.max}]`)
console.log(`  bufferView: ${posAccessor.bufferView}`)

// 读取实际顶点数据
const bv = json.bufferViews[posAccessor.bufferView]
const stride = bv.byteStride || (3 * 4) // float32 = 4 bytes × 3
const offset = binOffset + (bv.byteOffset || 0) + (posAccessor.byteOffset || 0)

const vertexCount = posAccessor.count
let minX = Infinity, minY = Infinity, minZ = Infinity
let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

// 采样检查顶点
const sampleSize = Math.min(vertexCount, 1000)
const step = Math.max(1, Math.floor(vertexCount / sampleSize))

for (let i = 0; i < vertexCount; i += step) {
  const vOffset = offset + i * stride
  const x = data.readFloatLE(vOffset)
  const y = data.readFloatLE(vOffset + 4)
  const z = data.readFloatLE(vOffset + 8)
  minX = Math.min(minX, x); maxX = Math.max(maxX, x)
  minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
}

console.log(`\n=== POSITION 顶点实际范围 (采样 ${sampleSize}/${vertexCount} 个顶点) ===`)
console.log(`  X: [${minX.toFixed(4)}, ${maxX.toFixed(4)}] span=${(maxX - minX).toFixed(4)}`)
console.log(`  Y: [${minY.toFixed(4)}, ${maxY.toFixed(4)}] span=${(maxY - minY).toFixed(4)}`)
console.log(`  Z: [${minZ.toFixed(4)}, ${maxZ.toFixed(4)}] span=${(maxZ - minZ).toFixed(4)}`)
console.log(`  Center: (${((minX + maxX) / 2).toFixed(4)}, ${((minY + maxY) / 2).toFixed(4)}, ${((minZ + maxZ) / 2).toFixed(4)})`)

// 分析模型朝向：检查 Z 方向的顶点分布
let frontCount = 0, backCount = 0
const zMid = (minZ + maxZ) / 2
for (let i = 0; i < vertexCount; i += step) {
  const vOffset = offset + i * stride
  const z = data.readFloatLE(vOffset + 8)
  if (z > zMid) frontCount++
  else backCount++
}
console.log(`\n=== Z 方向顶点分布 ===`)
console.log(`  Z > ${zMid.toFixed(4)} (前): ${frontCount} 个顶点`)
console.log(`  Z < ${zMid.toFixed(4)} (后): ${backCount} 个顶点`)

// 检查 Y 方向分布（确认上下方向）
const ySamples = []
for (let i = 0; i < vertexCount; i += Math.max(1, Math.floor(vertexCount / 10))) {
  const vOffset = offset + i * stride
  ySamples.push(data.readFloatLE(vOffset + 4))
}
console.log(`\n=== Y 方向采样 (前10个) ===`)
console.log(`  ${ySamples.slice(0, 10).map(v => v.toFixed(4)).join(', ')}`)

// 经脉数据对比
console.log(`\n=== 经脉数据坐标范围 ===`)
console.log(`  X: [0.00, 0.46]  (仅右侧)`)
console.log(`  Y: [0.02, 1.72]  (脚底到头顶)`)
console.log(`  Z: [-0.12, 0.18] (后到前)`)
console.log(`  模型缩放因子 = 1.8 / ${(maxY - minY).toFixed(4)} = ${(1.8 / (maxY - minY)).toFixed(4)}`)

// 缩放后的模型范围
const sf = 1.8 / (maxY - minY)
console.log(`\n=== 缩放后模型范围 ===`)
console.log(`  X: [${(minX * sf).toFixed(4)}, ${(maxX * sf).toFixed(4)}]`)
console.log(`  Y: [${(minY * sf).toFixed(4)}, ${(maxY * sf).toFixed(4)}]`)
console.log(`  Z: [${(minZ * sf).toFixed(4)}, ${(maxZ * sf).toFixed(4)}]`)
