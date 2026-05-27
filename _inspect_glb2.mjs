// GLB 模型朝向精确分析：确定模型的"正面"朝哪个轴
import { readFileSync } from 'fs'

const data = readFileSync('public/models/human_body.glb')
const chunk0Length = data.readUInt32LE(12)
const jsonData = data.subarray(20, 20 + chunk0Length)
const json = JSON.parse(jsonData.toString('utf8'))
const binOffset = 20 + chunk0Length + 8

const mesh = json.meshes[0]
const primitive = mesh.primitives[0]
const posAccessorIdx = primitive.attributes.POSITION
const posAccessor = json.accessors[posAccessorIdx]
const bv = json.bufferViews[posAccessor.bufferView]
const stride = bv.byteStride || (3 * 4)
const offset = binOffset + (bv.byteOffset || 0) + (posAccessor.byteOffset || 0)
const vertexCount = posAccessor.count

// 读取所有顶点
const vertices = []
for (let i = 0; i < vertexCount; i++) {
  const vOffset = offset + i * stride
  vertices.push([
    data.readFloatLE(vOffset),
    data.readFloatLE(vOffset + 4),
    data.readFloatLE(vOffset + 8),
  ])
}

console.log(`总顶点数: ${vertexCount}`)
console.log(`\n=== 各轴跨度 ===`)
let minX = Infinity, maxX = -Infinity
let minY = Infinity, maxY = -Infinity
let minZ = Infinity, maxZ = -Infinity
for (const [x, y, z] of vertices) {
  if (x < minX) minX = x; if (x > maxX) maxX = x
  if (y < minY) minY = y; if (y > maxY) maxY = y
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
}
console.log(`  X: [${minX.toFixed(4)}, ${maxX.toFixed(4)}] span=${(maxX - minX).toFixed(4)}  ← 最窄`)
console.log(`  Y: [${minY.toFixed(4)}, ${maxY.toFixed(4)}] span=${(maxY - minY).toFixed(4)}  ← 最高`)
console.log(`  Z: [${minZ.toFixed(4)}, ${maxZ.toFixed(4)}] span=${(maxZ - minZ).toFixed(4)}  ← 中间`)

// ── 关键分析：头部区域（Y > 0.4）的顶点分布 ──
// 头部是身体最窄的部分，头部的"宽度方向"就是模型的左右方向
console.log(`\n=== 头部区域 (Y > 0.4) 顶点分布 ===`)
const headVertices = vertices.filter(([, y]) => y > 0.4)
console.log(`  头部顶点数: ${headVertices.length}`)
let headMinX = Infinity, headMaxX = -Infinity
let headMinZ = Infinity, headMaxZ = -Infinity
for (const [x, , z] of headVertices) {
  if (x < headMinX) headMinX = x; if (x > headMaxX) headMaxX = x
  if (z < headMinZ) headMinZ = z; if (z > headMaxZ) headMaxZ = z
}
console.log(`  头部 X: [${headMinX.toFixed(4)}, ${headMaxX.toFixed(4)}] span=${(headMaxX - headMinX).toFixed(4)}`)
console.log(`  头部 Z: [${headMinZ.toFixed(4)}, ${headMaxZ.toFixed(4)}] span=${(headMaxZ - headMinZ).toFixed(4)}`)

// ── 肩膀区域（Y ≈ 0.25~0.40）顶点分布 ──
// 肩膀是身体最宽的部分
console.log(`\n=== 肩膀区域 (Y 0.25~0.40) 顶点分布 ===`)
const shoulderVertices = vertices.filter(([, y]) => y > 0.25 && y < 0.40)
console.log(`  肩膀顶点数: ${shoulderVertices.length}`)
let shoulderMinX = Infinity, shoulderMaxX = -Infinity
let shoulderMinZ = Infinity, shoulderMaxZ = -Infinity
for (const [x, , z] of shoulderVertices) {
  if (x < shoulderMinX) shoulderMinX = x; if (x > shoulderMaxX) shoulderMaxX = x
  if (z < shoulderMinZ) shoulderMinZ = z; if (z > shoulderMaxZ) shoulderMaxZ = z
}
console.log(`  肩膀 X: [${shoulderMinX.toFixed(4)}, ${shoulderMaxX.toFixed(4)}] span=${(shoulderMaxX - shoulderMinX).toFixed(4)}`)
console.log(`  肩膀 Z: [${shoulderMinZ.toFixed(4)}, ${shoulderMaxZ.toFixed(4)}] span=${(shoulderMaxZ - shoulderMinZ).toFixed(4)}`)

// ── 胸部区域（Y ≈ 0.10~0.25）──
// 胸部前后深度大，左右宽度也大
console.log(`\n=== 胸部区域 (Y 0.10~0.25) 顶点分布 ===`)
const chestVertices = vertices.filter(([, y]) => y > 0.10 && y < 0.25)
console.log(`  胸部顶点数: ${chestVertices.length}`)
let chestMinX = Infinity, chestMaxX = -Infinity
let chestMinZ = Infinity, chestMaxZ = -Infinity
for (const [x, , z] of chestVertices) {
  if (x < chestMinX) chestMinX = x; if (x > chestMaxX) chestMaxX = x
  if (z < chestMinZ) chestMinZ = z; if (z > chestMaxZ) chestMaxZ = z
}
console.log(`  胸部 X: [${chestMinX.toFixed(4)}, ${chestMaxX.toFixed(4)}] span=${(chestMaxX - chestMinX).toFixed(4)}`)
console.log(`  胸部 Z: [${chestMinZ.toFixed(4)}, ${chestMaxZ.toFixed(4)}] span=${(chestMaxZ - chestMinZ).toFixed(4)}`)

// ── 判断模型的"左右"和"前后"方向 ──
console.log(`\n=== 方向判定 ===`)
const xSpan = maxX - minX
const zSpan = maxZ - minZ
if (xSpan < zSpan) {
  console.log(`  X 轴 (${xSpan.toFixed(4)}) < Z 轴 (${zSpan.toFixed(4)})`)
  console.log(`  → X 是身体的左右方向（窄），Z 是身体的前后方向（宽）`)
  console.log(`  → 如果模型正面朝 +Z，则无需旋转`)
  console.log(`  → 如果模型正面朝 +X，则需要绕 Y 旋转 90° 使正面朝 +Z`)
} else {
  console.log(`  X 轴 (${xSpan.toFixed(4)}) > Z 轴 (${zSpan.toFixed(4)})`)
  console.log(`  → X 是身体的前后方向（宽），Z 是身体的左右方向（窄）`)
}

// ── 判断正面朝向：分析身体非对称区域的顶点密度 ──
// 人体前后不完全对称，可以通过胸部（Z>0 和 Z<0 的顶点数差异）来推断
// 或者通过头部：面部（眼睛、鼻子）通常在正面突出
console.log(`\n=== 头部前后不对称分析 ===`)
const headFront = headVertices.filter(([x, , z]) => x > 0).length
const headBack = headVertices.filter(([x, , z]) => x < 0).length
console.log(`  头部 X>0 (一侧): ${headFront}`)
console.log(`  头部 X<0 (另一侧): ${headBack}`)

const headZfront = headVertices.filter(([, , z]) => z > 0).length
const headZback = headVertices.filter(([, , z]) => z < 0).length
console.log(`  头部 Z>0 (一侧): ${headZfront}`)
console.log(`  头部 Z<0 (另一侧): ${headZback}`)

// ── 身体最突出的顶点（可能是鼻尖、手指等） ──
console.log(`\n=== 极端顶点 ===`)
let maxZv = null, minZv = null, maxXv = null, minXv = null
for (const v of vertices) {
  if (!maxZv || v[2] > maxZv[2]) maxZv = v
  if (!minZv || v[2] < minZv[2]) minZv = v
  if (!maxXv || v[0] > maxXv[0]) maxXv = v
  if (!minXv || v[0] < minXv[0]) minXv = v
}
console.log(`  最大 X: (${maxXv[0].toFixed(4)}, ${maxXv[1].toFixed(4)}, ${maxXv[2].toFixed(4)})`)
console.log(`  最小 X: (${minXv[0].toFixed(4)}, ${minXv[1].toFixed(4)}, ${minXv[2].toFixed(4)})`)
console.log(`  最大 Z: (${maxZv[0].toFixed(4)}, ${maxZv[1].toFixed(4)}, ${maxZv[2].toFixed(4)})`)
console.log(`  最小 Z: (${minZv[0].toFixed(4)}, ${minZv[1].toFixed(4)}, ${minZv[2].toFixed(4)})`)

// ── 与经脉数据对比 ──
console.log(`\n=== 经脉数据坐标约定 ===`)
console.log(`  经脉 X 方向: [-0.46, 0.46] (左右，跨度 0.92)`)
console.log(`  经脉 Y 方向: [0.02, 1.72] (上下，跨度 1.70)`)
console.log(`  经脉 Z 方向: [-0.12, 0.18] (前后，跨度 0.30)`)
console.log(`  经脉 X/Z 比值: ${(0.92 / 0.30).toFixed(2)} (X 比 Z 宽约 3 倍)`)

// 缩放后的模型比例
const sf = 1.8 / (maxY - minY)
const scaledXSpan = xSpan * sf
const scaledZSpan = zSpan * sf
console.log(`\n  模型缩放后 X: ${scaledXSpan.toFixed(4)}`)
console.log(`  模型缩放后 Z: ${scaledZSpan.toFixed(4)}`)
console.log(`  模型 X/Z 比值: ${(Math.max(scaledXSpan, scaledZSpan) / Math.min(scaledXSpan, scaledZSpan)).toFixed(2)}`)

console.log(`\n=== 结论 ===`)
console.log(`  模型最窄轴 = X (${xSpan.toFixed(4)})，这是身体的左右宽度（肩膀）`)
console.log(`  经脉最窄轴 = Z (${0.30})，...等等不对`)
console.log(`  经脉 X 跨度 0.92 > Z 跨度 0.30`)
console.log(`  → 经脉数据里 X 是宽的（左右肩膀方向），Z 是窄的（前后深度）`)
console.log(`  → 模型里 X 是窄的，Z 是宽的`)
console.log(`  → 模型和经脉的 X/Z 轴方向互换了！存在 90° 偏差！`)
