import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import QRCode from 'qrcode'
import type { SceneSpec } from '../contracts/scene-spec'
import type { CardProfile } from './cardTexture'
import { MbtiStandee } from './MbtiStandee'
import { MicroAccessory } from './MicroAccessory'
import {
  fbm,
  makeLakeReflectionSkyTexture,
  makeSakuraClusterTexture,
  makeSakuraGroundTextures,
  makeSakuraPetalTexture,
  mulberry32,
  smoothstep,
} from './proceduralTextures'

export const SAKURA_CARD_W = 3.2
export const SAKURA_CARD_H = SAKURA_CARD_W / 1.586
const THIN_T = 0.022

type Quality = 'low' | 'medium' | 'high'
const DENSITY_FACTOR = { low: 0.6, medium: 1, high: 1.35 } as const

/* ---------------- 锦鲤青池轮廓与双面日式庭院地形 ---------------- */

const POND_CX = 0.54
const POND_CY = 0.08

function pondDist(lx: number, ly: number): number {
  const dx = lx - POND_CX
  const dy = ly - POND_CY
  const ang = Math.atan2(dy, dx)
  const wobble = 1 + 0.13 * Math.sin(ang * 2 + 0.4) + 0.08 * Math.cos(ang * 3 - 0.5) + 0.05 * Math.sin(ang * 5)
  return Math.hypot(dx / (0.48 * wobble), dy / (0.35 * wobble))
}

/** 庭院砂石路径距离（用于柔和过渡左下暖色细砂碎石径） */
function gravelPathFactor(lx: number, ly: number): number {
  const dName = Math.hypot((lx + 0.62) / 0.85, (ly + 0.56) / 0.34)
  return 1 - smoothstep((dName - 0.62) / 0.45)
}

export function sakuraSurfaceZ(lx: number, ly: number, spec: SceneSpec, side: 1 | -1): number {
  const dx = SAKURA_CARD_W / 2 - Math.abs(lx)
  const dy = SAKURA_CARD_H / 2 - Math.abs(ly)
  const edgeFade = smoothstep(Math.min(dx, dy) / 0.2)

  const seed = side === 1 ? 5211 : 8329
  const amp = spec.environment.terrain.amplitude * 0.42
  const n = fbm(lx * 0.9 + 3.2, ly * 0.9 + 4.1, seed, 4)
  let z = n * amp * 0.48

  const moundLeft = Math.exp(-(((lx + 0.88) / 0.72) ** 2 + ((ly - 0.36) / 0.58) ** 2))
  const moundNorth = Math.exp(-(((lx + 0.06) / 0.65) ** 2 + ((ly - 0.58) / 0.46) ** 2))
  const moundEast = Math.exp(-(((lx - 1.06) / 0.55) ** 2 + ((ly - 0.44) / 0.48) ** 2))
  z += (moundLeft * 0.28 + moundNorth * 0.22 + moundEast * 0.22) * edgeFade

  for (const b of spec.environment.terrain.bumps ?? []) {
    const bx = b.x * (SAKURA_CARD_W / 2)
    const by = b.y * (SAKURA_CARD_H / 2)
    const g = Math.exp(-(((lx - bx) / b.radius) ** 2 + ((ly - by) / b.radius) ** 2))
    z += b.height * g * 0.55
  }

  z *= 0.14 + 0.86 * edgeFade

  if (side === 1 && spec.environment.water.enabled) {
    const pd = pondDist(lx, ly)
    const basin = 1 - smoothstep((pd - 0.76) / 0.42)
    z = THREE.MathUtils.lerp(z, 0.008, basin)
  }

  if (side === -1) {
    const qrFlat = 1 - smoothstep((Math.hypot((lx + 1.04) / 0.58, (ly + 0.46) / 0.54) - 0.65) / 0.45)
    z = THREE.MathUtils.lerp(z, 0.015, qrFlat)
  }

  return Math.max(0.004, z)
}

/* ---------------- 1. 极薄双面青苔枯山水庭院地皮 ---------------- */

function SakuraTerrain({
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
  const groundTex = useMemo(() => makeSakuraGroundTextures(), [])
  useEffect(() => {
    return () => {
      groundTex.map.dispose()
      groundTex.normalMap.dispose()
    }
  }, [groundTex])

  const geo = useMemo(() => {
    const segX = quality === 'low' ? 48 : 80
    const segY = quality === 'low' ? 32 : 52
    const g = new THREE.PlaneGeometry(SAKURA_CARD_W, SAKURA_CARD_H, segX, segY)
    const pos = g.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const tmp = new THREE.Color()
    const deepMoss = new THREE.Color('#3a572c')
    const softMoss = new THREE.Color('#668743')
    const gravel = new THREE.Color('#e6dcd1')
    const pondBed = new THREE.Color('#3b5a5f')

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i)
      const ly = pos.getY(i)
      const z = sakuraSurfaceZ(lx, ly, spec, side)
      pos.setZ(i, z)

      const patch = fbm(lx * 1.9 + 2.4, ly * 1.9 + 5.1, side === 1 ? 307 : 613, 3)
      tmp.copy(deepMoss).lerp(softMoss, 0.35 + patch * 0.55)

      if (side === 1) {
        const gf = gravelPathFactor(lx, ly)
        tmp.lerp(gravel, gf * 0.85)
        if (spec.environment.water.enabled) {
          const pd = pondDist(lx, ly)
          const inPond = 1 - smoothstep((pd - 0.82) / 0.32)
          tmp.lerp(pondBed, inPond * 0.78)
        }
      } else {
        const qrPad = 1 - smoothstep((Math.hypot((lx + 1.04) / 0.56, (ly + 0.46) / 0.52) - 0.65) / 0.4)
        tmp.lerp(gravel, qrPad * 0.88)
      }

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
              const nx = THREE.MathUtils.clamp(e.point.x / (SAKURA_CARD_W / 2), -1, 1)
              const ny = THREE.MathUtils.clamp(-e.point.z / (SAKURA_CARD_H / 2), -1, 1)
              onSculpt(nx, ny)
            }
          : undefined
      }
    >
      <meshStandardMaterial
        map={groundTex.map}
        normalMap={groundTex.normalMap}
        normalScale={new THREE.Vector2(0.6, 0.6)}
        roughness={0.94}
        metalness={0.0}
        vertexColors
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/* ---------------- 2. 柔绒日式青苔细草丝 ---------------- */

function MossCarpet({ side, spec, quality }: { side: 1 | -1; spec: SceneSpec; quality: Quality }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = useMemo(() => {
    const base = quality === 'low' ? 3200 : quality === 'medium' ? 6200 : 9500
    return Math.round(base * DENSITY_FACTOR[spec.environment.foliage.density])
  }, [quality, spec.environment.foliage.density])

  const bladeGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const verts = new Float32Array([
      -0.005, 0, 0,
       0.005, 0, 0,
       0.0035, 0.008, 0.036,
      -0.0035, 0.008, 0.036,
       0.0, 0.022, 0.072,
    ])
    const indices = [0, 1, 2, 0, 2, 3, 3, 2, 4]
    const colors = new Float32Array([
      0.26, 0.34, 0.2,
      0.26, 0.34, 0.2,
      0.66, 0.82, 0.48,
      0.66, 0.82, 0.48,
      1.02, 1.12, 0.72,
    ])
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [])

  const places = useMemo(() => {
    const rnd = mulberry32(side === 1 ? 21011 : 31022)
    const out: { x: number; y: number; z: number; sx: number; sz: number; rot: number; lean: number; tone: number }[] = []
    let tries = count * 3
    while (out.length < count && tries-- > 0) {
      const x = (rnd() - 0.5) * (SAKURA_CARD_W - 0.04)
      const y = (rnd() - 0.5) * (SAKURA_CARD_H - 0.04)
      if (side === 1 && spec.environment.water.enabled && pondDist(x, y) < 0.98) continue
      if (side === 1 && gravelPathFactor(x, y) > 0.45 && rnd() < 0.88) continue
      if (side === -1 && x < -0.52 && y < -0.02 && rnd() < 0.9) continue
      const z = sakuraSurfaceZ(x, y, spec, side)
      out.push({
        x,
        y,
        z,
        sx: 0.75 + rnd() * 0.5,
        sz: 0.72 + rnd() * 0.65,
        rot: rnd() * Math.PI * 2,
        lean: 0.16 + rnd() * 0.42,
        tone: rnd(),
      })
    }
    return out
  }, [count, side, spec])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    const cDeep = new THREE.Color('#345227')
    const cBright = new THREE.Color('#6b8f43')

    places.forEach((p, i) => {
      dummy.position.set(p.x, p.y, THIN_T / 2 + p.z - 0.005)
      dummy.rotation.set(p.lean * 0.4, p.lean * 0.3, p.rot)
      dummy.scale.set(p.sx, p.sx, p.sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      col.copy(cDeep).lerp(cBright, p.tone)
      mesh.setColorAt(i, col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [places])

  if (places.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[bladeGeo, undefined, places.length]} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.92} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

/* ---------------- 3. 盘曲苍劲的 3D 立体樱花树冠 ---------------- */

interface SakuraTreeDef {
  bx: number
  by: number
  scale: number
  leanX: number
  leanY: number
  seed: number
}

function RealisticSakuraTrees({ side, spec, quality }: { side: 1 | -1; spec: SceneSpec; quality: Quality }) {
  const clusterRef = useRef<THREE.InstancedMesh>(null)
  const clusterTex = useMemo(() => makeSakuraClusterTexture(), [])
  useEffect(() => () => clusterTex.dispose(), [clusterTex])

  const treeDefs: SakuraTreeDef[] = useMemo(() => {
    const all: SakuraTreeDef[] =
      side === 1
        ? [
            { bx: -0.92, by: 0.46, scale: 1.05, leanX: 0.24, leanY: -0.1, seed: 101 },
            { bx: 1.08, by: 0.52, scale: 0.92, leanX: -0.2, leanY: -0.14, seed: 202 },
            { bx: -1.26, by: 0.04, scale: 0.78, leanX: 0.14, leanY: 0.08, seed: 303 },
          ]
        : [
            // 背面（-Z）：避免遮挡左下二维码四角，略上移左侧樱树
            { bx: -0.82, by: 0.56, scale: 1.02, leanX: 0.24, leanY: -0.06, seed: 101 },
            { bx: 1.08, by: 0.52, scale: 0.92, leanX: -0.2, leanY: -0.14, seed: 202 },
            { bx: -1.24, by: 0.44, scale: 0.72, leanX: 0.18, leanY: 0.12, seed: 303 },
          ]
    if (spec.environment.foliage.density === 'high') {
      all.push({ bx: 1.18, by: -0.46, scale: 0.74, leanX: -0.12, leanY: 0.12, seed: 404 })
    } else if (spec.environment.foliage.density === 'low') {
      return all.slice(0, 2)
    }
    return all
  }, [spec.environment.foliage.density, side])

  const trunks = useMemo(() => {
    return treeDefs.map((t) => {
      const bz = THIN_T / 2 + sakuraSurfaceZ(t.bx, t.by, spec, side) - 0.01
      const mainCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(t.bx, t.by, bz),
        new THREE.Vector3(t.bx + t.leanX * 0.28, t.by + t.leanY * 0.28, bz + 0.16 * t.scale),
        new THREE.Vector3(t.bx + t.leanX * 0.75, t.by + t.leanY * 0.62, bz + 0.34 * t.scale),
        new THREE.Vector3(t.bx + t.leanX * 1.1, t.by + t.leanY * 0.9, bz + 0.44 * t.scale),
      ])
      const subCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(t.bx + t.leanX * 0.35, t.by + t.leanY * 0.3, bz + 0.2 * t.scale),
        new THREE.Vector3(t.bx - t.leanX * 0.35, t.by + t.leanY * 0.7 + 0.12, bz + 0.34 * t.scale),
        new THREE.Vector3(t.bx - t.leanX * 0.55, t.by + t.leanY * 0.9 + 0.18, bz + 0.42 * t.scale),
      ])
      return {
        key: t.seed,
        mainGeo: new THREE.TubeGeometry(mainCurve, 14, 0.032 * t.scale, 8, false),
        subGeo: new THREE.TubeGeometry(subCurve, 10, 0.018 * t.scale, 7, false),
        tip: [
          new THREE.Vector3(t.bx + t.leanX * 0.95, t.by + t.leanY * 0.78, bz + 0.44 * t.scale),
          new THREE.Vector3(t.bx - t.leanX * 0.45, t.by + t.leanY * 0.8 + 0.14, bz + 0.41 * t.scale),
          new THREE.Vector3(t.bx + t.leanX * 0.48, t.by + t.leanY * 0.45 - 0.1, bz + 0.36 * t.scale),
        ],
        scale: t.scale,
        seed: t.seed,
      }
    })
  }, [treeDefs, spec, side])

  useEffect(() => {
    return () => {
      trunks.forEach((tr) => {
        tr.mainGeo.dispose()
        tr.subGeo.dispose()
      })
    }
  }, [trunks])

  const cardsPerTree = quality === 'low' ? 22 : quality === 'medium' ? 32 : 42
  const cardGeo = useMemo(() => new THREE.PlaneGeometry(0.28, 0.28), [])
  useEffect(() => () => cardGeo.dispose(), [cardGeo])

  useLayoutEffect(() => {
    const mesh = clusterRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    const palette = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#ffdbe6'),
      new THREE.Color('#ffb8ce'),
      new THREE.Color('#ffe8ef'),
    ]

    let idx = 0
    trunks.forEach((tr) => {
      const rnd = mulberry32(tr.seed + (side === 1 ? 11 : 97))
      for (let k = 0; k < cardsPerTree; k++) {
        const anchor = tr.tip[k % tr.tip.length]
        const rad = 0.04 + rnd() * 0.17 * tr.scale
        const ang = rnd() * Math.PI * 2
        const dz = (rnd() - 0.35) * 0.13 * tr.scale
        dummy.position.set(
          anchor.x + Math.cos(ang) * rad,
          anchor.y + Math.sin(ang) * rad,
          anchor.z + dz,
        )
        dummy.rotation.set(
          (rnd() - 0.5) * 1.1,
          (rnd() - 0.5) * 1.1,
          rnd() * Math.PI * 2,
        )
        dummy.scale.setScalar((0.75 + rnd() * 0.65) * tr.scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(idx, dummy.matrix)
        col.copy(palette[Math.floor(rnd() * palette.length)])
        mesh.setColorAt(idx, col)
        idx++
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [trunks, cardsPerTree, side])

  return (
    <group>
      {trunks.map((tr) => (
        <group key={tr.key}>
          <mesh geometry={tr.mainGeo} castShadow receiveShadow>
            <meshStandardMaterial color="#4b352d" roughness={0.9} />
          </mesh>
          <mesh geometry={tr.subGeo} castShadow receiveShadow>
            <meshStandardMaterial color="#573e34" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <instancedMesh
        ref={clusterRef}
        args={[cardGeo, undefined, trunks.length * cardsPerTree]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          map={clusterTex}
          emissive="#ffd6e5"
          emissiveMap={clusterTex}
          emissiveIntensity={0.24}
          alphaTest={0.28}
          roughness={0.76}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </group>
  )
}

/* ---------------- 4. 朱红迷你和风鸟居 & 石灯笼 & 踏脚石 ---------------- */

function MiniTorii({ side, spec }: { side: 1 | -1; spec: SceneSpec }) {
  const x = -0.1
  const y = 0.54
  const z = THIN_T / 2 + sakuraSurfaceZ(x, y, spec, side) - 0.01

  return (
    <group position={[x, y, z]} rotation={[0, 0, -0.18]} scale={0.96}>
      {[-0.125, 0.125].map((px, idx) => (
        <group key={idx} position={[px, 0, 0]}>
          {/* 黑色石柱础 */}
          <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.028, 0.032, 0.04, 14]} />
            <meshStandardMaterial color="#27272e" roughness={0.82} />
          </mesh>
          {/* 朱红立柱 */}
          <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.024, 0.28, 14]} />
            <meshStandardMaterial color="#c9382e" roughness={0.55} />
          </mesh>
        </group>
      ))}
      {/* 下横梁贯木 */}
      <mesh position={[0, 0, 0.22]} castShadow>
        <boxGeometry args={[0.36, 0.024, 0.026]} />
        <meshStandardMaterial color="#c9382e" roughness={0.55} />
      </mesh>
      {/* 额束中牌 */}
      <mesh position={[0, -0.008, 0.265]}>
        <boxGeometry args={[0.048, 0.018, 0.068]} />
        <meshStandardMaterial color="#232227" roughness={0.65} />
      </mesh>
      {/* 上横梁岛木与深墨顶瓦笠木 */}
      <mesh position={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[0.42, 0.034, 0.028]} />
        <meshStandardMaterial color="#c9382e" roughness={0.52} />
      </mesh>
      <mesh position={[0, 0, 0.324]} castShadow>
        <boxGeometry args={[0.45, 0.044, 0.022]} />
        <meshStandardMaterial color="#242329" roughness={0.72} />
      </mesh>
    </group>
  )
}

function StoneLantern({ side, spec }: { side: 1 | -1; spec: SceneSpec }) {
  const x = 0.04
  const y = 0.26
  const z = THIN_T / 2 + sakuraSurfaceZ(x, y, spec, side) - 0.006

  return (
    <group position={[x, y, z]} scale={0.95}>
      {/* 基石底座 */}
      <mesh position={[0, 0, 0.018]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.052, 0.064, 0.036, 6]} />
        <meshStandardMaterial color="#7d848a" roughness={0.92} />
      </mesh>
      {/* 石柱 */}
      <mesh position={[0, 0, 0.075]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.024, 0.03, 0.088, 8]} />
        <meshStandardMaterial color="#8d9499" roughness={0.9} />
      </mesh>
      {/* 中台 */}
      <mesh position={[0, 0, 0.125]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.034, 0.024, 6]} />
        <meshStandardMaterial color="#7f878d" roughness={0.9} />
      </mesh>
      {/* 暖光火袋 */}
      <mesh position={[0, 0, 0.158]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.034, 0.034, 0.046, 6]} />
        <meshStandardMaterial color="#ffe4a3" emissive="#ffb347" emissiveIntensity={1.1} roughness={0.4} />
      </mesh>
      {side === 1 && <pointLight position={[0, 0, 0.16]} distance={0.75} intensity={0.42} color="#ffc978" />}
      {/* 四坡石笠檐 + 宝珠 */}
      <mesh position={[0, 0, 0.198]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.074, 0.046, 6]} />
        <meshStandardMaterial color="#737b80" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.226]}>
        <sphereGeometry args={[0.015, 10, 10]} />
        <meshStandardMaterial color="#8f979c" roughness={0.85} />
      </mesh>
    </group>
  )
}

function SteppingStones({ side, spec }: { side: 1 | -1; spec: SceneSpec }) {
  const stones = useMemo(() => {
    const pts: [number, number, number][] = [
      [-0.58, -0.24, 0.078],
      [-0.4, -0.1, 0.068],
      [-0.24, 0.08, 0.072],
      [-0.14, 0.24, 0.064],
      [-0.1, 0.39, 0.068],
    ]
    return pts.map(([x, y, r], i) => ({
      x,
      y,
      z: THIN_T / 2 + sakuraSurfaceZ(x, y, spec, side) + 0.004,
      r,
      rot: i * 0.7,
    }))
  }, [side, spec])

  return (
    <group>
      {stones.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, s.z]} rotation={[Math.PI / 2, s.rot, 0]} scale={[1.2, 1, 0.85]} receiveShadow>
          <cylinderGeometry args={[s.r, s.r * 1.08, 0.014, 10]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#91979b' : '#7f868b'} roughness={0.92} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- 5. 锦鲤青池（蓝天落樱水面倒影 + 游动红白锦鲤） ---------------- */

function KoiPond({ spec }: { spec: SceneSpec }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const koiGroupRef = useRef<THREE.Group>(null)
  const skyTex = useMemo(() => makeLakeReflectionSkyTexture(), [])
  useEffect(() => () => skyTex.dispose(), [skyTex])

  const pondGeo = useMemo(() => {
    const shape = new THREE.Shape()
    const segs = 64
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2
      const wobble = 1 + 0.13 * Math.sin(ang * 2 + 0.4) + 0.08 * Math.cos(ang * 3 - 0.5) + 0.05 * Math.sin(ang * 5)
      const x = Math.cos(ang) * 0.48 * wobble
      const y = Math.sin(ang) * 0.35 * wobble
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    return new THREE.ShapeGeometry(shape, 32)
  }, [])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSkyMap: { value: skyTex },
    }),
    [skyTex],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (matRef.current) matRef.current.uniforms.uTime.value = t
    if (koiGroupRef.current) {
      koiGroupRef.current.children.forEach((child, idx) => {
        const spd = 0.45 + idx * 0.14
        const phase = t * spd + idx * 2.1
        const rx = 0.22 - idx * 0.03
        const ry = 0.14 - idx * 0.02
        const kx = Math.cos(phase) * rx
        const ky = Math.sin(phase) * ry
        const dx = -Math.sin(phase) * rx
        const dy = Math.cos(phase) * ry
        child.position.set(kx, ky, 0.008)
        child.rotation.z = Math.atan2(dy, dx)
      })
    }
  })

  if (!spec.environment.water.enabled) return null

  return (
    <group position={[POND_CX, POND_CY, THIN_T / 2 + 0.026]}>
      {/* 半透明清澈青池水面 */}
      <mesh geometry={pondGeo}>
        <shaderMaterial
          ref={matRef}
          transparent
          uniforms={uniforms}
          vertexShader={`
            varying vec2 vLocal;
            void main() {
              vLocal = position.xy;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform float uTime;
            uniform sampler2D uSkyMap;
            varying vec2 vLocal;
            void main() {
              float w1 = sin(vLocal.x * 24.0 + uTime * 1.2) * 0.01;
              float w2 = cos(vLocal.y * 28.0 - uTime * 1.0) * 0.01;
              vec2 uv = vec2(vLocal.x * 0.95 + 0.5 + w1, vLocal.y * 1.2 + 0.52 + w2);
              vec3 skyCol = texture2D(uSkyMap, clamp(uv, 0.02, 0.98)).rgb;
              vec3 pondTint = vec3(0.32, 0.62, 0.66);
              vec3 sakuraBlush = vec3(0.95, 0.72, 0.8);
              float treeReflect = smoothstep(0.05, 0.4, vLocal.y + w1 * 2.0);
              vec3 col = mix(pondTint, skyCol * 1.02, 0.48);
              col = mix(col, sakuraBlush, treeReflect * 0.26);
              float shimmer = sin(vLocal.x * 18.0 + vLocal.y * 16.0 + uTime * 1.5) * cos(vLocal.x * 12.0 - vLocal.y * 13.0 - uTime * 1.1);
              col += vec3(0.96, 0.98, 1.0) * max(0.0, shimmer) * 0.12;
              gl_FragColor = vec4(col, 0.86);
            }
          `}
        />
      </mesh>

      {/* 3 条红白/金橙锦鲤游动 */}
      <group ref={koiGroupRef}>
        {['#ea5834', '#f4f1ea', '#f59e0b'].map((col, idx) => (
          <group key={idx}>
            <mesh scale={[1.8, 0.62, 0.55]}>
              <sphereGeometry args={[0.024, 10, 8]} />
              <meshStandardMaterial color={col} roughness={0.35} />
            </mesh>
            <mesh position={[-0.044, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.016, 0.026, 4]} />
              <meshStandardMaterial color={idx === 1 ? '#e24c2b' : '#ffffff'} roughness={0.4} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

/* ---------------- 6. 飘落樱花花瓣粒子 ---------------- */

function FallingSakuraPetals({ spec, quality }: { spec: SceneSpec; quality: Quality }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const petalTex = useMemo(() => makeSakuraPetalTexture(), [])
  useEffect(() => () => petalTex.dispose(), [petalTex])

  const count = quality === 'low' ? 55 : quality === 'medium' ? 88 : 125
  const particles = useMemo(() => {
    const rnd = mulberry32(7717)
    return Array.from({ length: count }, () => ({
      x: (rnd() - 0.5) * (SAKURA_CARD_W - 0.18),
      y: (rnd() - 0.5) * (SAKURA_CARD_H - 0.18),
      phase: rnd(),
      speed: 0.12 + rnd() * 0.12,
      sway: 0.05 + rnd() * 0.06,
      rotSpeed: (rnd() - 0.5) * 2.5,
      s: 0.75 + rnd() * 0.6,
      ci: Math.floor(rnd() * 3),
    }))
  }, [count, spec.template])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const palette = [new THREE.Color('#ffd6e4'), new THREE.Color('#ffb3ca'), new THREE.Color('#fff0f5')]
    particles.forEach((p, i) => mesh.setColorAt(i, palette[p.ci]))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [particles])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      const progress = (p.phase + t * p.speed) % 1
      const z = 0.65 - progress * 0.56
      const px = p.x + Math.sin(t * 1.4 + p.phase * 12) * p.sway
      const py = p.y + Math.cos(t * 1.1 + p.phase * 9) * p.sway
      dummy.position.set(px, py, z)
      dummy.rotation.set(t * p.rotSpeed, t * 0.7, p.phase * 6 + t)
      dummy.scale.setScalar(p.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <planeGeometry args={[0.028, 0.028]} />
      <meshStandardMaterial map={petalTex} alphaTest={0.25} roughness={0.65} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

/* ---------------- 7. 高对比度深樱花瓣拼字 & 背面完整花瓣二维码 ---------------- */

function sampleSakuraText(text: string, maxPoints: number, seed: number): [number, number][] {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 240
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 768, 240)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = (text || 'Zilin').slice(0, 12)
  let size = 162
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

function SakuraPetalName({
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
  const petalTex = useMemo(() => makeSakuraPetalTexture(), [])
  useEffect(() => () => petalTex.dispose(), [petalTex])

  const maxPts = quality === 'low' ? 680 : quality === 'medium' ? 1150 : 1650
  const pts = useMemo(() => sampleSakuraText(text, maxPts, seed), [text, maxPts, seed])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const rnd = mulberry32(seed + 41)
    const colors = [
      new THREE.Color('#801e42'),
      new THREE.Color('#a62d59'),
      new THREE.Color('#c74372'),
      new THREE.Color('#e26992'),
    ]
    const cosR = Math.cos(rotZ)
    const sinR = Math.sin(rotZ)

    pts.forEach((pt, i) => {
      const lx0 = (pt[0] - 0.5) * box.w
      const ly0 = (pt[1] - 0.5) * box.h
      const x = box.cx + lx0 * cosR - ly0 * sinR
      const y = box.cy + lx0 * sinR + ly0 * cosR
      const z = sakuraSurfaceZ(x, y, spec, side)
      dummy.position.set(x, y, THIN_T / 2 + z + 0.036 + rnd() * 0.012)
      dummy.rotation.set((rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35, rnd() * Math.PI * 2)
      dummy.scale.setScalar(0.68 + rnd() * 0.55)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      const pick = rnd() < 0.65 ? (rnd() < 0.5 ? 0 : 1) : rnd() < 0.8 ? 2 : 3
      mesh.setColorAt(i, colors[pick])
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pts, seed, spec, side, box, rotZ])

  if (pts.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <planeGeometry args={[0.03, 0.03]} />
      <meshStandardMaterial map={petalTex} alphaTest={0.28} roughness={0.75} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

function SakuraQrPetals({ text, spec }: { text: string; spec: SceneSpec }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const petalTex = useMemo(() => makeSakuraPetalTexture(), [])
  useEffect(() => () => petalTex.dispose(), [petalTex])

  const { pts, modSize } = useMemo(() => {
    try {
      const qr = QRCode.create(text || 'https://3d.card', { errorCorrectionLevel: 'M' })
      const size = qr.modules.size
      const out: [number, number][] = []
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (qr.modules.data[r * size + c]) out.push([(c + 0.5) / size, 1 - (r + 0.5) / size])
        }
      }
      return { pts: out, modSize: 0.82 / size }
    } catch {
      return { pts: [] as [number, number][], modSize: 0.03 }
    }
  }, [text])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || pts.length === 0) return
    const dummy = new THREE.Object3D()
    const rnd = mulberry32(8421)
    const cA = new THREE.Color('#691738')
    const cB = new THREE.Color('#8a244c')

    pts.forEach((p, i) => {
      const x = -1.04 + (p[0] - 0.5) * 0.82
      const y = -0.46 + (p[1] - 0.5) * 0.82
      const z = sakuraSurfaceZ(x, y, spec, -1)
      dummy.position.set(x, y, THIN_T / 2 + z + 0.022)
      dummy.rotation.set(0, 0, rnd() * Math.PI * 2)
      dummy.scale.setScalar(modSize * 1.38)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, rnd() < 0.7 ? cA : cB)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pts, modSize, spec])

  if (pts.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial map={petalTex} alphaTest={0.28} roughness={0.78} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

/* ---------------- 樱花庭院双面总装 ---------------- */

export function SakuraDioramaCard({
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
  return (
    <group>
      {/* 极薄暖苔木底芯 */}
      <mesh>
        <boxGeometry args={[SAKURA_CARD_W, SAKURA_CARD_H, THIN_T]} />
        <meshStandardMaterial color="#353028" roughness={0.94} />
      </mesh>

      {/* 正面（+Z）：立体樱花树冠 + 朱红鸟居 + 石灯笼 + 锦鲤青池 + 落樱 */}
      <group>
        <SakuraTerrain side={1} spec={spec} quality={quality} onSculpt={onSculpt} />
        <MossCarpet side={1} spec={spec} quality={quality} />
        <RealisticSakuraTrees side={1} spec={spec} quality={quality} />
        <MiniTorii side={1} spec={spec} />
        <StoneLantern side={1} spec={spec} />
        <SteppingStones side={1} spec={spec} />
        <KoiPond spec={spec} />
        <FallingSakuraPetals spec={spec} quality={quality} />
        <SakuraPetalName
          side={1}
          text={profile.name || 'Zilin'}
          spec={spec}
          quality={quality}
          box={{ cx: -0.62, cy: -0.58, w: 1.44, h: 0.42 }}
          seed={505}
        />
        <MbtiStandee
          mbti={profile.mbti}
          position={[-0.22, -0.02, THIN_T / 2 + sakuraSurfaceZ(-0.22, -0.02, spec, 1) + 0.04]}
          scale={1.06}
          rotZ={0.3}
        />
        <MicroAccessory
          accessory={profile.accessory}
          position={[0.52, -0.56, THIN_T / 2 + sakuraSurfaceZ(0.52, -0.56, spec, 1) + 0.025]}
          scale={1.0}
          rotZ={-0.22}
        />
      </group>

      {/* 背面（绕 X 轴翻转 180°）：镜像樱花庭院 + 深梅红花瓣二维码 + 斜排花字 */}
      <group rotation={[Math.PI, 0, 0]}>
        <SakuraTerrain side={-1} spec={spec} quality={quality} />
        <MossCarpet side={-1} spec={spec} quality={quality} />
        <RealisticSakuraTrees side={-1} spec={spec} quality={quality} />
        <MiniTorii side={-1} spec={spec} />
        <StoneLantern side={-1} spec={spec} />
        <SakuraQrPetals text={qrText} spec={spec} />
        <SakuraPetalName
          side={-1}
          text={profile.title || profile.name || 'Zilin'}
          spec={spec}
          quality={quality}
          box={{ cx: 0.36, cy: -0.26, w: 1.48, h: 0.36 }}
          seed={506}
          rotZ={0.26}
        />
      </group>
    </group>
  )
}
