import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import QRCode from 'qrcode'
import type { SceneSpec } from '../contracts/scene-spec'
import { makeHexVariants, resolveSceneTheme } from '../contracts/moods'
import type { CardProfile } from './cardTexture'
import { MbtiStandee } from './MbtiStandee'
import { MicroAccessory } from './MicroAccessory'
import { isTapEvent, setPointerCursor, SpeechBubble3D } from './SpeechBubble3D'
import {
  fbm,
  makeFlowerSpriteTexture,
  makeForestGroundTextures,
  makeLakeReflectionSkyTexture,
  makeLeafClusterTexture,
  makePineBranchTexture,
  mulberry32,
  smoothstep,
} from './proceduralTextures'

export const FOREST_CARD_W = 3.2
export const FOREST_CARD_H = FOREST_CARD_W / 1.586 // ~2.018
const THIN_T = 0.022 // 纸张般极薄的名片基底

type Quality = 'low' | 'medium' | 'high'
const DENSITY_FACTOR = { low: 0.6, medium: 1, high: 1.35 } as const

/* ---------------- 湖泊有机轮廓与地形高度 ---------------- */

const LAKE_CX = 0.52
const LAKE_CY = 0.12

/** 有机不规则湖泊距离场（< 1 表示在湖内） */
function lakeDist(lx: number, ly: number): number {
  const dx = lx - LAKE_CX
  const dy = ly - LAKE_CY
  const ang = Math.atan2(dy, dx)
  const wobble = 1 + 0.14 * Math.sin(ang * 2 + 0.6) + 0.09 * Math.cos(ang * 3 - 0.4) + 0.06 * Math.sin(ang * 5)
  const rx = 0.48 * wobble
  const ry = 0.36 * wobble
  return Math.hypot(dx / rx, dy / ry)
}

/** 双面森林起伏草坡高度（沿各自面法线向外隆起，正反两面皆有饱满草丘） */
export function forestSurfaceZ(lx: number, ly: number, spec: SceneSpec, side: 1 | -1): number {
  const dx = FOREST_CARD_W / 2 - Math.abs(lx)
  const dy = FOREST_CARD_H / 2 - Math.abs(ly)
  const edgeFade = smoothstep(Math.min(dx, dy) / 0.22)

  const seed = side === 1 ? 4242 : 7373
  const amp = spec.environment.terrain.amplitude * 0.52
  const n = fbm(lx * 0.95 + 5.1, ly * 0.95 + 2.8, seed, 4)
  let z = n * amp * 0.55

  // 对标图 2 侧面剪影：中左和中右两个饱满柔和的草丘
  const moundLeft = Math.exp(-(((lx + 0.32) / 0.72) ** 2 + ((ly - 0.05) / 0.58) ** 2))
  const moundRight = Math.exp(-(((lx - 0.95) / 0.62) ** 2 + ((ly + 0.22) / 0.55) ** 2))
  const moundBack = Math.exp(-(((lx - 0.55) / 0.78) ** 2 + ((ly - 0.68) / 0.52) ** 2))
  z += (moundLeft * 0.34 + moundRight * 0.26 + moundBack * 0.22) * edgeFade

  // 用户雕塑控制点（bumps）
  for (const b of spec.environment.terrain.bumps ?? []) {
    const bx = b.x * (FOREST_CARD_W / 2)
    const by = b.y * (FOREST_CARD_H / 2)
    const g = Math.exp(-(((lx - bx) / b.radius) ** 2 + ((ly - by) / b.radius) ** 2))
    z += b.height * g * 0.62
  }

  z *= 0.12 + 0.88 * edgeFade

  // 正面湖泊洼地凹陷
  if (side === 1 && spec.environment.water.enabled) {
    const ld = lakeDist(lx, ly)
    const basin = 1 - smoothstep((ld - 0.75) / 0.45)
    z = THREE.MathUtils.lerp(z, 0.008, basin)
  }

  // 背面左下二维码区域保持平整，确保清晰可扫
  if (side === -1) {
    const qrFlat = 1 - smoothstep((Math.hypot((lx + 1.05) / 0.58, (ly + 0.48) / 0.55) - 0.65) / 0.45)
    z = THREE.MathUtils.lerp(z, 0.015, qrFlat)
  }

  return Math.max(0.004, z)
}

/* ---------------- 1. 极薄名片基底 + 双面地形草皮 ---------------- */

function ThinBaseAndTerrain({
  side,
  spec,
  quality,
  onSculpt,
}: {
  side: 1 | -1
  spec: SceneSpec
  quality: Quality
  onSculpt?: (x: number, y: number) => void
}) {
  const groundTex = useMemo(() => makeForestGroundTextures(), [])
  useEffect(() => {
    return () => {
      groundTex.map.dispose()
      groundTex.normalMap.dispose()
    }
  }, [groundTex])

  const geo = useMemo(() => {
    const segX = quality === 'low' ? 48 : 80
    const segY = quality === 'low' ? 32 : 52
    const g = new THREE.PlaneGeometry(FOREST_CARD_W, FOREST_CARD_H, segX, segY)
    const pos = g.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const tmp = new THREE.Color()
    const darkMoss = new THREE.Color('#1d2e17')
    const midGrass = new THREE.Color('#2f4722')
    const oliveTop = new THREE.Color('#47622c')

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i)
      const ly = pos.getY(i)
      const z = forestSurfaceZ(lx, ly, spec, side)
      pos.setZ(i, z)

      const patch = fbm(lx * 1.8 + 4.1, ly * 1.8 + 1.9, side === 1 ? 113 : 227, 3)
      const ht = smoothstep(z / 0.36)
      tmp.copy(darkMoss).lerp(midGrass, 0.4 + patch * 0.45)
      tmp.lerp(oliveTop, ht * 0.42)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [side, spec, quality])

  return (
    <mesh
      geometry={geo}
      position={[0, 0, THIN_T / 2]}
      receiveShadow
      onClick={
        side === 1 && onSculpt
          ? (e) => {
              e.stopPropagation()
              const nx = THREE.MathUtils.clamp(e.point.x / (FOREST_CARD_W / 2), -1, 1)
              const ny = THREE.MathUtils.clamp(-e.point.z / (FOREST_CARD_H / 2), -1, 1)
              onSculpt(nx, ny)
            }
          : undefined
      }
    >
      <meshStandardMaterial
        map={groundTex.map}
        normalMap={groundTex.normalMap}
        normalScale={new THREE.Vector2(0.7, 0.7)}
        roughness={0.95}
        metalness={0.0}
        vertexColors
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/* ---------------- 2. 超高密度极细柔软草绒地毯（模拟毛绒微缩草坡） ---------------- */

function FineGrassCarpet({ side, spec, quality }: { side: 1 | -1; spec: SceneSpec; quality: Quality }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = useMemo(() => {
    const base = quality === 'low' ? 5200 : quality === 'medium' ? 11000 : 17500
    return Math.round(base * DENSITY_FACTOR[spec.environment.foliage.density])
  }, [quality, spec.environment.foliage.density])

  const bladeGeo = useMemo(() => {
    // 极细、自然弯曲、尖顶草丝（根部深暗 AO -> 梢部柔和橄榄绿）
    const g = new THREE.BufferGeometry()
    const verts = new Float32Array([
      -0.0055, 0, 0,
       0.0055, 0, 0,
       0.0042, 0.012, 0.055,
      -0.0042, 0.012, 0.055,
       0.0,    0.042, 0.125,
    ])
    const indices = [0, 1, 2, 0, 2, 3, 3, 2, 4]
    const colors = new Float32Array([
      0.24, 0.28, 0.2,
      0.24, 0.28, 0.2,
      0.66, 0.76, 0.56,
      0.66, 0.76, 0.56,
      1.05, 1.12, 0.85,
    ])
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [])

  const places = useMemo(() => {
    const rnd = mulberry32(side === 1 ? 19001 : 29001)
    const out: { x: number; y: number; z: number; sx: number; sz: number; rot: number; lean: number; tone: number }[] = []
    let tries = count * 3
    while (out.length < count && tries-- > 0) {
      // 允许少量草丝微微探出名片边缘（对标图 2/3 毛绒边缘）
      const x = (rnd() - 0.5) * (FOREST_CARD_W - 0.02)
      const y = (rnd() - 0.5) * (FOREST_CARD_H - 0.02)
      if (side === 1 && spec.environment.water.enabled && lakeDist(x, y) < 0.96) continue
      // 背面左下二维码区草略矮稀疏，不遮挡二维码花阵
      if (side === -1 && x < -0.52 && y < -0.02 && rnd() < 0.78) continue
      const z = forestSurfaceZ(x, y, spec, side)
      // 坡顶草更丰满柔软
      const heightBoost = 0.72 + smoothstep(z / 0.34) * 0.72 + rnd() * 0.45
      out.push({
        x,
        y,
        z,
        sx: 0.75 + rnd() * 0.55,
        sz: heightBoost,
        rot: rnd() * Math.PI * 2,
        lean: 0.18 + rnd() * 0.52,
        tone: rnd(),
      })
    }
    return out
  }, [count, side, spec])

  const isAutumn = resolveSceneTheme(spec).mood.id === 'forest_autumn'

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    const deep = new THREE.Color(isAutumn ? '#3d3618' : '#243b1a')
    const mid = new THREE.Color(isAutumn ? '#8a6d28' : '#47662c')
    const warm = new THREE.Color(isAutumn ? '#c97b32' : '#6f853c')

    places.forEach((p, i) => {
      dummy.position.set(p.x, p.y, THIN_T / 2 + p.z - 0.008)
      dummy.rotation.set(p.lean * 0.45, p.lean * 0.35, p.rot)
      dummy.scale.set(p.sx, p.sx, p.sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      col.copy(deep).lerp(mid, p.tone)
      if (p.tone > 0.7) col.lerp(warm, (p.tone - 0.7) * 2.2)
      mesh.setColorAt(i, col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [places, isAutumn])

  if (places.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[bladeGeo, undefined, places.length]} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.92} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

/* ---------------- 3. 修长锯齿剪影冷杉林（12层针叶枝簇叠放） ---------------- */

function RealisticSpruceTrees({ side, spec, quality }: { side: 1 | -1; spec: SceneSpec; quality: Quality }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const branchRef = useRef<THREE.InstancedMesh>(null)
  const pineTex = useMemo(() => makePineBranchTexture(), [])
  useEffect(() => () => pineTex.dispose(), [pineTex])

  // 微微下垂的圆盘/星形针叶枝层几何体（让侧视剪影呈现出极度真实的针叶层次）
  const branchGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.5, 0.18, 8, 1, true)
    g.rotateX(Math.PI / 2)
    return g
  }, [])

  const trunkGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.006, 0.018, 1, 6)
    g.rotateX(Math.PI / 2)
    g.translate(0, 0, 0.5)
    return g
  }, [])

  const { trees, layersPerTree } = useMemo(() => {
    const rnd = mulberry32(side === 1 ? 55101 : 66202)
    const dFactor = DENSITY_FACTOR[spec.environment.foliage.density]
    const baseMain = Math.round((quality === 'low' ? 14 : 22) * dFactor)
    const out: { x: number; y: number; z: number; h: number; r: number; rot: number }[] = []

    // 右上角茂密修长冷杉林（严格对标图 1 / 图 2 / 图 3 右上松树群）
    let tries = baseMain * 10
    while (out.length < baseMain && tries-- > 0) {
      const x = 0.25 + rnd() * 1.26
      const y = 0.34 + rnd() * 0.62
      if (side === 1 && spec.environment.water.enabled && lakeDist(x, y) < 1.05) continue
      if (out.some((t) => Math.hypot(t.x - x, t.y - y) < 0.14)) continue
      const h = 0.52 + rnd() * 0.54
      out.push({
        x,
        y,
        z: forestSurfaceZ(x, y, spec, side),
        h,
        r: h * (0.21 + rnd() * 0.06), // 修长比例 ~4:1
        rot: rnd() * Math.PI * 2,
      })
    }

    // 左侧边缘点缀几棵高低错落的针叶树（对标图 2 左侧与阔叶树混生）
    const leftPts = [
      { x: -1.22, y: 0.72, h: 0.64 },
      { x: -1.36, y: 0.58, h: 0.48 },
      { x: -0.96, y: 0.68, h: 0.52 },
      { x: -0.78, y: 0.54, h: 0.44 },
      { x: -0.62, y: 0.72, h: 0.56 },
    ]
    for (const lp of leftPts) {
      out.push({
        x: lp.x + (rnd() - 0.5) * 0.08,
        y: lp.y + (rnd() - 0.5) * 0.08,
        z: forestSurfaceZ(lp.x, lp.y, spec, side),
        h: lp.h,
        r: lp.h * 0.22,
        rot: rnd() * Math.PI * 2,
      })
    }

    return { trees: out, layersPerTree: quality === 'low' ? 9 : 13 }
  }, [side, spec, quality])

  const totalBranches = trees.length * layersPerTree

  useLayoutEffect(() => {
    const tMesh = trunkRef.current
    const bMesh = branchRef.current
    if (!tMesh || !bMesh) return

    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    const rnd = mulberry32(side === 1 ? 811 : 922)
    const darkSpruce = new THREE.Color('#4a6e44')
    const midSpruce = new THREE.Color('#6f9960')
    const tipSpruce = new THREE.Color('#95bd7e')

    let bi = 0
    trees.forEach((t, ti) => {
      const zBase = THIN_T / 2 + t.z - 0.015

      // 树干
      dummy.position.set(t.x, t.y, zBase)
      dummy.rotation.set(0, 0, t.rot)
      dummy.scale.set(1, 1, t.h * 0.92)
      dummy.updateMatrix()
      tMesh.setMatrixAt(ti, dummy.matrix)

      // 13 层自下而上收窄的锯齿针叶枝簇
      for (let l = 0; l < layersPerTree; l++) {
        const u = l / (layersPerTree - 1) // 0=底部 -> 1=树尖
        const layerZ = zBase + t.h * (0.12 + u * 0.86)
        const radius = t.r * Math.pow(1 - u * 0.88, 0.85) * (0.9 + rnd() * 0.22)
        dummy.position.set(t.x, t.y, layerZ)
        dummy.rotation.set((rnd() - 0.5) * 0.14, (rnd() - 0.5) * 0.14, t.rot + l * 2.39996)
        dummy.scale.set(radius * 2, radius * 2, 0.65 + (1 - u) * 0.7)
        dummy.updateMatrix()
        bMesh.setMatrixAt(bi, dummy.matrix)

        col.copy(darkSpruce).lerp(midSpruce, u * 0.65 + rnd() * 0.2)
        if (u > 0.75) col.lerp(tipSpruce, (u - 0.75) * 2.2)
        bMesh.setColorAt(bi, col)
        bi++
      }
    })

    tMesh.instanceMatrix.needsUpdate = true
    bMesh.instanceMatrix.needsUpdate = true
    if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true
  }, [trees, layersPerTree, side])

  if (trees.length === 0) return null
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeo, undefined, trees.length]} castShadow>
        <meshStandardMaterial color="#2b2118" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={branchRef} args={[branchGeo, undefined, totalBranches]} castShadow receiveShadow>
        <meshStandardMaterial
          map={pineTex}
          alphaTest={0.32}
          roughness={0.88}
          metalness={0.0}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </group>
  )
}

/* ---------------- 4. 碎叶簇写实阔叶树（左侧嫩绿圆冠树） ---------------- */

function RealisticBroadleafTrees({ side, spec, quality }: { side: 1 | -1; spec: SceneSpec; quality: Quality }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const leafRef = useRef<THREE.InstancedMesh>(null)
  const leafTex = useMemo(() => makeLeafClusterTexture(), [])
  useEffect(() => () => leafTex.dispose(), [leafTex])

  const trunkGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.008, 0.02, 1, 6)
    g.rotateX(Math.PI / 2)
    g.translate(0, 0, 0.5)
    return g
  }, [])

  const cardGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])

  const { trees, cardsPerTree } = useMemo(() => {
    const pts = [
      { x: -1.36, y: 0.78, h: 0.34, r: 0.16 },
      { x: -1.16, y: 0.62, h: 0.28, r: 0.14 },
      { x: -1.12, y: 0.38, h: 0.32, r: 0.16 },
      { x: -0.94, y: 0.28, h: 0.22, r: 0.11 },
      { x: 0.68, y: 0.82, h: 0.3, r: 0.14 },
      { x: 0.86, y: 0.58, h: 0.24, r: 0.12 },
    ]
    return {
      trees: pts.map((p) => ({ ...p, z: forestSurfaceZ(p.x, p.y, spec, side) })),
      cardsPerTree: quality === 'low' ? 12 : 20,
    }
  }, [side, spec, quality])

  const isAutumn = resolveSceneTheme(spec).mood.id === 'forest_autumn'

  useLayoutEffect(() => {
    const tMesh = trunkRef.current
    const lMesh = leafRef.current
    if (!tMesh || !lMesh) return

    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    const rnd = mulberry32(side === 1 ? 7711 : 8822)
    const cDark = new THREE.Color(isAutumn ? '#9c4324' : '#476632')
    const cLight = new THREE.Color(isAutumn ? '#f2a644' : '#a4bf6d')

    let ci = 0
    trees.forEach((t, ti) => {
      const zBase = THIN_T / 2 + t.z - 0.01

      dummy.position.set(t.x, t.y, zBase)
      dummy.rotation.set((rnd() - 0.5) * 0.16, (rnd() - 0.5) * 0.16, 0)
      dummy.scale.set(1, 1, t.h)
      dummy.updateMatrix()
      tMesh.setMatrixAt(ti, dummy.matrix)

      // 树冠顶部由 20 片朝向各异的碎叶簇面片聚合成透光蓬松球冠
      const crownZ = zBase + t.h * 0.96
      for (let k = 0; k < cardsPerTree; k++) {
        const theta = rnd() * Math.PI * 2
        const phi = Math.acos(2 * rnd() - 1)
        const rad = t.r * (0.28 + rnd() * 0.68)
        const ox = Math.sin(phi) * Math.cos(theta) * rad
        const oy = Math.sin(phi) * Math.sin(theta) * rad
        const oz = Math.cos(phi) * rad * 0.92
        const s = t.r * (0.95 + rnd() * 0.65)

        dummy.position.set(t.x + ox, t.y + oy, crownZ + oz)
        dummy.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI)
        dummy.scale.setScalar(s)
        dummy.updateMatrix()
        lMesh.setMatrixAt(ci, dummy.matrix)

        const topBias = smoothstep((oz / t.r + 1) * 0.5)
        col.copy(cDark).lerp(cLight, topBias * 0.72 + rnd() * 0.25)
        lMesh.setColorAt(ci, col)
        ci++
      }
    })

    tMesh.instanceMatrix.needsUpdate = true
    lMesh.instanceMatrix.needsUpdate = true
    if (lMesh.instanceColor) lMesh.instanceColor.needsUpdate = true
  }, [trees, cardsPerTree, side, isAutumn])

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeo, undefined, trees.length]} castShadow>
        <meshStandardMaterial color="#4a3828" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[cardGeo, undefined, trees.length * cardsPerTree]} castShadow receiveShadow>
        <meshStandardMaterial
          map={leafTex}
          alphaTest={0.35}
          roughness={0.82}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </group>
  )
}

/* ---------------- 5. 有机镜面湖泊（映照清澈蓝天白云 + 右上松林锯齿倒影） ---------------- */

function MirrorLake({ spec }: { spec: SceneSpec }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const rippleRef = useRef<THREE.Mesh>(null)
  const dustRef = useRef<THREE.Group>(null)
  const [rippleId, setRippleId] = useState(0)
  const tapTimeRef = useRef(-99)
  const skyTex = useMemo(() => makeLakeReflectionSkyTexture(), [])
  useEffect(() => () => skyTex.dispose(), [skyTex])
  useEffect(() => () => setPointerCursor(false), [])
  const dustSeeds = useMemo(
    () => Array.from({ length: 8 }, (_, i) => ({ ang: (i / 8) * Math.PI * 2, rad: 0.1 + (i % 3) * 0.06 })),
    [],
  )

  // 有机水洼形状（ShapeGeometry）
  const lakeGeo = useMemo(() => {
    const shape = new THREE.Shape()
    const segs = 64
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2
      const wobble = 1 + 0.14 * Math.sin(ang * 2 + 0.6) + 0.09 * Math.cos(ang * 3 - 0.4) + 0.06 * Math.sin(ang * 5)
      const x = Math.cos(ang) * 0.48 * wobble
      const y = Math.sin(ang) * 0.36 * wobble
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    return new THREE.ShapeGeometry(shape, 32)
  }, [])

  const moodId = resolveSceneTheme(spec).mood.id
  const isNight = moodId === 'forest_firefly'
  const isAutumn = moodId === 'forest_autumn'

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSkyMap: { value: skyTex },
      uNight: { value: isNight ? 1 : 0 },
      uAutumn: { value: isAutumn ? 1 : 0 },
    }),
    [skyTex],
  )
  useEffect(() => {
    uniforms.uNight.value = isNight ? 1 : 0
    uniforms.uAutumn.value = isAutumn ? 1 : 0
  }, [uniforms, isNight, isAutumn])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = t
    }
    if (rippleId > 0) {
      if (tapTimeRef.current < 0) tapTimeRef.current = t
      const age = t - tapTimeRef.current
      if (rippleRef.current) {
        if (age < 1.4) {
          const rp = age / 1.4
          rippleRef.current.visible = true
          rippleRef.current.scale.setScalar(0.5 + rp * 4.5)
          ;(rippleRef.current.material as THREE.MeshBasicMaterial).opacity = (1 - rp) * 0.72
        } else {
          rippleRef.current.visible = false
        }
      }
      if (dustRef.current) {
        if (age < 1.9) {
          const dp = age / 1.9
          const fade = Math.sin(dp * Math.PI)
          dustRef.current.visible = true
          dustRef.current.children.forEach((child, idx) => {
            const d = dustSeeds[idx]
            const r = d.rad + dp * 0.14
            child.position.set(Math.cos(d.ang + age) * r, Math.sin(d.ang + age) * r * 0.8, 0.04 + dp * 0.34)
            child.scale.setScalar(0.7 + fade * 0.7)
          })
        } else {
          dustRef.current.visible = false
        }
      }
    } else {
      if (rippleRef.current) rippleRef.current.visible = false
      if (dustRef.current) dustRef.current.visible = false
    }
  })

  if (!spec.environment.water.enabled) return null

  return (
    <group
      position={[LAKE_CX, LAKE_CY, THIN_T / 2 + 0.032]}
      onClick={(e) => {
        if (!isTapEvent(e)) return
        tapTimeRef.current = -1
        setRippleId((n) => n + 1)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setPointerCursor(true)
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        setPointerCursor(false)
      }}
    >
      <mesh geometry={lakeGeo}>
      <shaderMaterial
        ref={matRef}
        transparent
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vLocal;
          varying vec3 vWorldPos;
          void main() {
            vLocal = position.xy;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform sampler2D uSkyMap;
          uniform float uNight;
          uniform float uAutumn;
          varying vec2 vLocal;
          varying vec3 vWorldPos;

          void main() {
            // 柔和细腻的水波折射扰动
            float w1 = sin(vLocal.x * 22.0 + uTime * 1.1) * 0.012;
            float w2 = cos(vLocal.y * 26.0 - uTime * 0.9) * 0.012;

            vec2 uv = vec2(vLocal.x * 0.95 + 0.5 + w1, vLocal.y * 1.2 + 0.52 + w2);
            vec3 skyCol = texture2D(uSkyMap, clamp(uv, 0.02, 0.98)).rgb;

            // 模拟右上侧茂密冷杉林在镜面湖水里的锯齿状倒影剪影
            float treeCoord = vLocal.y * 18.0 + vLocal.x * 7.0;
            float jagged = abs(fract(treeCoord * 0.45) - 0.5) * 0.24 + sin(treeCoord * 3.1) * 0.04;
            float reflectEdge = (vLocal.x * 0.85 + vLocal.y * 0.62) + w1 * 2.5;
            float treeShadow = smoothstep(0.16 - jagged, 0.24 - jagged, reflectEdge);
            vec3 spruceRefl = vec3(0.09, 0.17, 0.12);

            vec3 dayCol = mix(skyCol * 1.08, spruceRefl, treeShadow * 0.78);
            vec3 autumnCol = mix(mix(skyCol, vec3(0.95, 0.72, 0.46), 0.42), vec3(0.24, 0.15, 0.08), treeShadow * 0.72);
            vec3 nightSky = vec3(0.08, 0.18, 0.34);
            vec3 nightCol = mix(nightSky, vec3(0.04, 0.09, 0.12), treeShadow * 0.82);

            vec3 col = mix(dayCol, autumnCol, uAutumn);
            col = mix(col, nightCol, uNight);

            // 边缘微暗水岸衔接 + 阳光/月光微澜
            float r = length(vLocal / vec2(0.48, 0.36));
            float rimShade = smoothstep(0.75, 1.05, r);
            col = mix(col, vec3(0.14, 0.24, 0.22), rimShade * 0.48);

            float shimmer = sin(vLocal.x * 16.0 + vLocal.y * 19.0 + uTime * 1.4) * cos(vLocal.x * 11.0 - vLocal.y * 14.0 - uTime * 1.1);
            vec3 shimmerCol = mix(vec3(0.92, 0.97, 1.0), vec3(0.68, 0.94, 0.88), uNight);
            col += shimmerCol * max(0.0, shimmer) * (uNight > 0.5 ? 0.18 : 0.1) * (1.0 - treeShadow);

            gl_FragColor = vec4(col, 0.96);
          }
        `}
      />
    </mesh>
      <mesh ref={rippleRef} position={[0, 0, 0.014]} visible={false}>
        <ringGeometry args={[0.06, 0.085, 32]} />
        <meshBasicMaterial color="#d9f99d" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group ref={dustRef} visible={false}>
        {dustSeeds.map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.013, 8, 8]} />
            <meshBasicMaterial color="#bbf7d0" />
          </mesh>
        ))}
      </group>
      <SpeechBubble3D
        text="🌲 听见晨雾与风的声音"
        accent="#3b825e"
        triggerId={rippleId}
        position={[0, 0, 0.46]}
        scale={1.08}
      />
    </group>
  )
}

function ForestFireflies() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = 42
  const flies = useMemo(() => {
    const rnd = mulberry32(6619)
    return Array.from({ length: count }, () => ({
      bx: (rnd() - 0.5) * (FOREST_CARD_W - 0.35),
      by: (rnd() - 0.5) * (FOREST_CARD_H - 0.3),
      bz: 0.18 + rnd() * 0.52,
      ph: rnd() * 12,
      spd: 0.75 + rnd() * 0.95,
      s: 0.0085 + rnd() * 0.009,
    }))
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i]
      dummy.position.set(
        f.bx + Math.sin(t * f.spd + f.ph) * 0.14,
        f.by + Math.cos(t * f.spd * 0.85 + f.ph) * 0.12,
        f.bz + Math.sin(t * 1.5 + f.ph) * 0.06,
      )
      const pulse = 0.5 + 0.65 * Math.sin(t * 3.4 + f.ph * 2.1)
      dummy.scale.setScalar(f.s * Math.max(0.25, pulse))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#d8ff7a" />
    </instancedMesh>
  )
}

/* ---------------- 6. 精致五彩微缩花字 + 散落野花（对标图 1 "Zilin"） ---------------- */

function sampleTextMask(text: string, maxPoints: number, seed: number): [number, number][] {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 240
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 768, 240)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = (text || 'Zilin').slice(0, 12)
  let size = 165
  const family = '"Segoe Script", "Brush Script MT", "Georgia", "PingFang SC", cursive'
  ctx.font = `700 ${size}px ${family}`
  while (ctx.measureText(label).width > 690 && size > 44) {
    size -= 6
    ctx.font = `700 ${size}px ${family}`
  }
  ctx.fillText(label, 384, 126)
  const img = ctx.getImageData(0, 0, 768, 240).data
  const pts: [number, number][] = []
  const rnd = mulberry32(seed)
  let tries = 0
  while (pts.length < maxPoints && tries < maxPoints * 45) {
    tries++
    const x = Math.floor(rnd() * 768)
    const y = Math.floor(rnd() * 240)
    if (img[(y * 768 + x) * 4 + 3] > 130) {
      pts.push([x / 768, 1 - y / 240])
    }
  }
  return pts
}

function WildflowerName({
  side,
  text,
  spec,
  quality,
  box,
  seed,
  rotZ = 0,
}: {
  side: 1 | -1
  text: string
  spec: SceneSpec
  quality: Quality
  box: { cx: number; cy: number; w: number; h: number }
  seed: number
  rotZ?: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const flowerTex = useMemo(() => makeFlowerSpriteTexture(), [])
  useEffect(() => () => flowerTex.dispose(), [flowerTex])

  const maxPts = quality === 'low' ? 680 : quality === 'medium' ? 1150 : 1650
  const pts = useMemo(() => sampleTextMask(text, maxPts, seed), [text, maxPts, seed])

  const theme = resolveSceneTheme(spec)
  const isFirefly = theme.mood.id === 'forest_firefly'
  const useCustom = side === 1 && !!theme.customTextColor
  const useBright = useCustom ? theme.isDark : isFirefly

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const rnd = mulberry32(seed + 19)
    let paletteHex = ['#ffffff', '#faf6ec', '#f7e8a4', '#e6c2d6', '#c2c7f2', '#b6dcf0']
    if (useCustom && theme.customTextColor) {
      const v = makeHexVariants(theme.customTextColor)
      paletteHex = [v[0], v[1], v[2], v[3], v[1], v[0]]
    } else if (isFirefly) {
      paletteHex = ['#e6fff5', '#a7f3d0', '#fef08a', '#6ee7b7', '#ffffff', '#bbf7d0']
    }
    const colors = paletteHex.map((h) => new THREE.Color(h))
    const cosR = Math.cos(rotZ)
    const sinR = Math.sin(rotZ)

    pts.forEach((pt, i) => {
      const lx0 = (pt[0] - 0.5) * box.w
      const ly0 = (pt[1] - 0.5) * box.h
      const x = box.cx + lx0 * cosR - ly0 * sinR
      const y = box.cy + lx0 * sinR + ly0 * cosR
      const z = forestSurfaceZ(x, y, spec, side)
      dummy.position.set(x, y, THIN_T / 2 + z + 0.085 + rnd() * 0.025)
      dummy.rotation.set((rnd() - 0.5) * 0.45, (rnd() - 0.5) * 0.45, rnd() * Math.PI * 2)
      dummy.scale.setScalar(0.65 + rnd() * 0.65)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      const pick = rnd() < 0.55 ? (rnd() < 0.6 ? 0 : 1) : 2 + Math.floor(rnd() * 4)
      mesh.setColorAt(i, colors[pick])
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pts, seed, spec, side, box, rotZ, useCustom, theme.customTextColor, isFirefly])

  if (pts.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <planeGeometry args={[0.032, 0.032]} />
      <meshStandardMaterial
        map={flowerTex}
        emissive={useBright ? theme.customTextColor || '#9bf5c8' : '#000000'}
        emissiveMap={flowerTex}
        emissiveIntensity={useBright ? 0.42 : 0}
        alphaTest={0.3}
        roughness={0.78}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}

/** 散落全坡的极微小自然野花（白、黄、微粉） */
function ScatteredWildflowers({ side, spec, quality }: { side: 1 | -1; spec: SceneSpec; quality: Quality }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const flowerTex = useMemo(() => makeFlowerSpriteTexture(), [])
  useEffect(() => () => flowerTex.dispose(), [flowerTex])

  const count = quality === 'low' ? 220 : quality === 'medium' ? 380 : 540

  const places = useMemo(() => {
    const rnd = mulberry32(side === 1 ? 4411 : 5522)
    const out: { x: number; y: number; z: number; s: number; rot: number; ci: number }[] = []
    let tries = count * 4
    while (out.length < count && tries-- > 0) {
      const x = (rnd() - 0.5) * (FOREST_CARD_W - 0.1)
      const y = (rnd() - 0.5) * (FOREST_CARD_H - 0.1)
      if (side === 1 && spec.environment.water.enabled && lakeDist(x, y) < 1.02) continue
      if (side === -1 && x < -0.52 && y < -0.02) continue
      const z = forestSurfaceZ(x, y, spec, side)
      out.push({ x, y, z, s: 0.55 + rnd() * 0.65, rot: rnd() * Math.PI * 2, ci: rnd() < 0.65 ? 0 : rnd() < 0.85 ? 1 : 2 })
    }
    return out
  }, [count, side, spec])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const palette = [new THREE.Color('#f7f5ed'), new THREE.Color('#f2de83'), new THREE.Color('#e8bfd0')]
    places.forEach((p, i) => {
      dummy.position.set(p.x, p.y, THIN_T / 2 + p.z + 0.08)
      dummy.rotation.set(0.15, -0.15, p.rot)
      dummy.scale.setScalar(p.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, palette[p.ci])
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [places])

  if (places.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, places.length]}>
      <planeGeometry args={[0.024, 0.024]} />
      <meshStandardMaterial map={flowerTex} alphaTest={0.3} roughness={0.8} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

/* ---------------- 7. 背面精细小花二维码（完整模块，不截断） ---------------- */

function FineQrMeadow({ text, spec }: { text: string; spec: SceneSpec }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const flowerTex = useMemo(() => makeFlowerSpriteTexture(), [])
  useEffect(() => () => flowerTex.dispose(), [flowerTex])

  const { pts, modSize } = useMemo(() => {
    try {
      const qr = QRCode.create(text || 'https://3d.card', { errorCorrectionLevel: 'M' })
      const size = qr.modules.size
      const data = qr.modules.data
      const out: [number, number][] = []
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (data[r * size + c]) {
            out.push([(c + 0.5) / size, 1 - (r + 0.5) / size])
          }
        }
      }
      return { pts: out, modSize: 0.82 / size }
    } catch {
      return { pts: [] as [number, number][], modSize: 0.03 }
    }
  }, [text])

  const isFirefly = resolveSceneTheme(spec).mood.id === 'forest_firefly'

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || pts.length === 0) return
    const dummy = new THREE.Object3D()
    const rnd = mulberry32(9909)
    const cA = new THREE.Color(isFirefly ? '#d1fae5' : '#eef3e4')
    const cB = new THREE.Color(isFirefly ? '#6ee7b7' : '#d4e3c5')

    pts.forEach((p, i) => {
      const x = -1.04 + (p[0] - 0.5) * 0.82
      const y = -0.46 + (p[1] - 0.5) * 0.82
      const z = forestSurfaceZ(x, y, spec, -1)
      dummy.position.set(x, y, THIN_T / 2 + z + 0.045)
      dummy.rotation.set(0, 0, rnd() * Math.PI * 2)
      dummy.scale.setScalar(modSize * 1.38)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, rnd() < 0.7 ? cA : cB)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pts, modSize, spec, isFirefly])

  if (pts.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        map={flowerTex}
        emissive={isFirefly ? '#7ef2c4' : '#000000'}
        emissiveMap={flowerTex}
        emissiveIntensity={isFirefly ? 0.35 : 0}
        alphaTest={0.28}
        roughness={0.82}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}

/* ---------------- 森林双面总装 ---------------- */

export function ForestDioramaCard({
  spec,
  profile,
  quality,
  qrText,
  onSculpt,
}: {
  spec: SceneSpec
  profile: CardProfile
  quality: Quality
  qrText: string
  onSculpt?: (x: number, y: number) => void
}) {
  const isFirefly = resolveSceneTheme(spec).mood.id === 'forest_firefly'

  return (
    <group>
      {/* 极薄深墨绿基底核心 */}
      <mesh>
        <boxGeometry args={[FOREST_CARD_W, FOREST_CARD_H, THIN_T]} />
        <meshStandardMaterial color="#182614" roughness={0.95} />
      </mesh>

      {/* 正面（+Z）：完整森林、镜面湖泊、五彩花字 */}
      <group>
        <ThinBaseAndTerrain side={1} spec={spec} quality={quality} onSculpt={onSculpt} />
        <FineGrassCarpet side={1} spec={spec} quality={quality} />
        <RealisticSpruceTrees side={1} spec={spec} quality={quality} />
        <RealisticBroadleafTrees side={1} spec={spec} quality={quality} />
        <MirrorLake spec={spec} />
        <ScatteredWildflowers side={1} spec={spec} quality={quality} />
        {isFirefly && <ForestFireflies />}
        <WildflowerName
          side={1}
          text={profile.name || 'Zilin'}
          spec={spec}
          quality={quality}
          box={{ cx: -0.58, cy: -0.56, w: 1.48, h: 0.44 }}
          seed={808}
        />
        <MbtiStandee
          mbti={profile.mbti}
          avatarUrl={profile.avatarUrl}
          avatarFrame={profile.avatarFrame}
          name={profile.name}
          greeting={profile.greeting}
          position={[-0.22, 0.08, THIN_T / 2 + forestSurfaceZ(-0.22, 0.08, spec, 1) + 0.055]}
          scale={1.08}
          rotZ={0.32}
        />
        <MicroAccessory
          accessory={profile.accessory}
          greeting={profile.greeting}
          position={[0.48, -0.56, THIN_T / 2 + forestSurfaceZ(0.48, -0.56, spec, 1) + 0.035]}
          scale={1.0}
          rotZ={-0.24}
        />
      </group>

      {/* 背面（绕 X 轴旋转 180° 朝向 -Z，翻面后正立）：镜像森林 + 精细花阵二维码 + 斜排花字 */}
      <group rotation={[Math.PI, 0, 0]}>
        <ThinBaseAndTerrain side={-1} spec={spec} quality={quality} />
        <FineGrassCarpet side={-1} spec={spec} quality={quality} />
        <RealisticSpruceTrees side={-1} spec={spec} quality={quality} />
        <RealisticBroadleafTrees side={-1} spec={spec} quality={quality} />
        <ScatteredWildflowers side={-1} spec={spec} quality={quality} />
        <FineQrMeadow text={qrText} spec={spec} />
        <WildflowerName
          side={-1}
          text={profile.title || profile.name || 'Zilin'}
          spec={spec}
          quality={quality}
          box={{ cx: 0.36, cy: -0.22, w: 1.5, h: 0.36 }}
          seed={909}
          rotZ={0.28}
        />
      </group>
    </group>
  )
}
