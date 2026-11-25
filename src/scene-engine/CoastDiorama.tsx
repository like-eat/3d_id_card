import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import QRCode from 'qrcode'
import type { SceneSpec } from '../contracts/scene-spec'
import { makeHexVariants, resolveSceneTheme } from '../contracts/moods'
import type { CardProfile } from './cardTexture'
import { MbtiStandee } from './MbtiStandee'
import { MicroAccessory } from './MicroAccessory'
import { playEasterEggSfx } from '../lib/sound'
import { InteractiveHotspot, isTapEvent, setPointerCursor, SpeechBubble3D, useEasterEggGuide } from './SpeechBubble3D'
import {
  fbm,
  makeFlowerSpriteTexture,
  makeLakeReflectionSkyTexture,
  makePalmFrondTexture,
  makeSandTextures,
  makeUmbrellaCanopyTexture,
  mulberry32,
  smoothstep,
} from './proceduralTextures'

export const COAST_CARD_W = 3.2
export const COAST_CARD_H = COAST_CARD_W / 1.586
const THIN_T = 0.022
const SEA_LEVEL = 0.066

type Quality = 'low' | 'medium' | 'high'

/** 扩大的有机海岸线距离场：> 0.04 即为广阔海湾（约占卡片右半侧 45%） */
function shoreCoord(lx: number, ly: number): number {
  const curve = Math.sin(lx * 1.65 + 0.4) * 0.12 + Math.cos(ly * 2.1 - 0.5) * 0.09
  return (lx + 0.08) * 0.56 + (ly + 0.22) * 0.44 + curve
}

/** 柔和自然的双面海岛沙滩高度（平滑沉入浅海，无生硬沙崖） */
export function coastSurfaceZ(lx: number, ly: number, spec: SceneSpec, side: 1 | -1): number {
  const dx = COAST_CARD_W / 2 - Math.abs(lx)
  const dy = COAST_CARD_H / 2 - Math.abs(ly)
  const edgeFade = smoothstep(Math.min(dx, dy) / 0.18)

  const seed = side === 1 ? 6101 : 7202
  const gentleRipple = (fbm(lx * 1.3 + 3.4, ly * 1.3 + 2.7, seed, 3) - 0.5) * 0.045

  let z = 0.1
  if (side === 1) {
    const sh = shoreCoord(lx, ly)
    // 陆地柔和隆起 -> 海岸线平滑过渡 -> 浅海海底平缓下沉
    const landSlope = smoothstep((-sh + 0.26) / 0.55)
    z = 0.012 + landSlope * 0.145 + gentleRipple * landSlope
    // 左上椰林沙丘微隆
    const leftDune = Math.exp(-(((lx + 1.06) / 0.68) ** 2 + ((ly - 0.44) / 0.56) ** 2))
    z += leftDune * 0.135
    // 躺椅区微微平整
    const loungeFlat = 1 - smoothstep((Math.hypot((lx + 0.08) / 0.45, (ly + 0.3) / 0.36) - 0.5) / 0.45)
    z = THREE.MathUtils.lerp(z, 0.115, loungeFlat * 0.72)
  } else {
    // 背面：舒缓海岛沙丘，左下二维码区平整
    const duneA = Math.exp(-(((lx - 0.72) / 0.76) ** 2 + ((ly - 0.38) / 0.62) ** 2))
    const duneB = Math.exp(-(((lx + 0.92) / 0.65) ** 2 + ((ly - 0.48) / 0.52) ** 2))
    z = 0.045 + (duneA * 0.16 + duneB * 0.14 + gentleRipple * 0.7)
    const qrFlat = 1 - smoothstep((Math.hypot((lx + 1.04) / 0.58, (ly + 0.46) / 0.54) - 0.65) / 0.45)
    z = THREE.MathUtils.lerp(z, 0.018, qrFlat)
  }

  // 用户 bumps 控制点
  for (const b of spec.environment.terrain.bumps ?? []) {
    const bx = b.x * (COAST_CARD_W / 2)
    const by = b.y * (COAST_CARD_H / 2)
    const g = Math.exp(-(((lx - bx) / b.radius) ** 2 + ((ly - by) / b.radius) ** 2))
    z += b.height * g * 0.38
  }

  z *= edgeFade
  return THREE.MathUtils.clamp(z, 0.0, 0.38)
}

/* ---------------- 1. 细腻沙滩地形（干沙 -> 湿沙 -> 浅海沙床） ---------------- */

function CoastTerrain({
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
  const sandTex = useMemo(() => makeSandTextures(), [])
  useEffect(() => {
    return () => {
      sandTex.map.dispose()
      sandTex.normalMap.dispose()
    }
  }, [sandTex])

  const geo = useMemo(() => {
    const segX = quality === 'low' ? 52 : 84
    const segY = quality === 'low' ? 34 : 56
    const g = new THREE.PlaneGeometry(COAST_CARD_W, COAST_CARD_H, segX, segY)
    const pos = g.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const tmp = new THREE.Color()
    const drySand = new THREE.Color('#f5e7ce')
    const warmSand = new THREE.Color('#e8d2ad')
    const wetSand = new THREE.Color('#ad9068')
    const shallowBed = new THREE.Color('#7ca89e')

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i)
      const ly = pos.getY(i)
      const z = coastSurfaceZ(lx, ly, spec, side)
      pos.setZ(i, z)

      const patch = fbm(lx * 1.5 + 1.2, ly * 1.5 + 4.3, side === 1 ? 303 : 404, 3)
      tmp.copy(warmSand).lerp(drySand, smoothstep(patch))

      if (side === 1 && spec.environment.water.enabled) {
        const sh = shoreCoord(lx, ly)
        // 紧贴水岸的真实湿沙带
        const wet = smoothstep((sh + 0.09) / 0.16)
        tmp.lerp(wetSand, wet * 0.65)
        // 水下浅滩细沙泛出清澈浅青
        const under = smoothstep((sh - 0.05) / 0.35)
        tmp.lerp(shallowBed, under * 0.55)
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
              const nx = THREE.MathUtils.clamp(e.point.x / (COAST_CARD_W / 2), -1, 1)
              const ny = THREE.MathUtils.clamp(-e.point.z / (COAST_CARD_H / 2), -1, 1)
              onSculpt(nx, ny)
            }
          : undefined
      }
    >
      <meshStandardMaterial
        map={sandTex.map}
        normalMap={sandTex.normalMap}
        normalScale={new THREE.Vector2(0.65, 0.65)}
        roughness={0.88}
        metalness={0.02}
        vertexColors
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/* ---------------- 2. 写实微缩沙滩遮阳伞 + 双木质帆布躺椅 + 小圆边桌 ---------------- */

function BeachLounger({
  position,
  rotZ,
}: {
  position: [number, number, number]
  rotZ: number
}) {
  return (
    <group position={position} rotation={[0, 0, rotZ]}>
      {/* 四条细实木椅腿 */}
      {[
        [-0.06, -0.14],
        [0.06, -0.14],
        [-0.06, 0.12],
        [0.06, 0.12],
      ].map(([lx, ly], i) => (
        <mesh key={i} position={[lx, ly, 0.022]} castShadow>
          <boxGeometry args={[0.014, 0.014, 0.044]} />
          <meshStandardMaterial color="#8c6239" roughness={0.85} />
        </mesh>
      ))}
      {/* 柚木床架底座 */}
      <mesh position={[0, -0.01, 0.046]} castShadow receiveShadow>
        <boxGeometry args={[0.145, 0.31, 0.014]} />
        <meshStandardMaterial color="#9c6f44" roughness={0.82} />
      </mesh>
      {/* 奶油白亚麻帆布坐垫（下半段平躺） */}
      <mesh position={[0, 0.03, 0.062]} castShadow receiveShadow>
        <boxGeometry args={[0.132, 0.21, 0.022]} />
        <meshStandardMaterial color="#f7f2e8" roughness={0.92} />
      </mesh>
      {/* 仰角靠背木架 + 帆布垫 + 卷枕（沿 -Y 抬起，面向 +Y 大海） */}
      <group position={[0, -0.075, 0.056]} rotation={[0.56, 0, 0]}>
        <mesh position={[0, -0.065, 0]} castShadow>
          <boxGeometry args={[0.14, 0.14, 0.012]} />
          <meshStandardMaterial color="#9c6f44" roughness={0.82} />
        </mesh>
        <mesh position={[0, -0.065, 0.014]} castShadow receiveShadow>
          <boxGeometry args={[0.128, 0.135, 0.02]} />
          <meshStandardMaterial color="#f7f2e8" roughness={0.92} />
        </mesh>
        {/* 海盐蓝装饰靠枕 */}
        <mesh position={[0, -0.105, 0.032]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.1, 10]} />
          <meshStandardMaterial color="#467a8f" roughness={0.88} />
        </mesh>
      </group>
    </group>
  )
}

function BeachUmbrella({
  position,
  tiltX = 0.08,
  tiltY = -0.1,
  canopyTex,
}: {
  position: [number, number, number]
  tiltX?: number
  tiltY?: number
  canopyTex: THREE.CanvasTexture
}) {
  // 带优雅弧形下垂的八角写实帆布伞面几何体（沿 +Z 朝上）
  const canopyGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.28, 0.11, 16, 4, true)
    g.rotateX(Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const r = Math.hypot(x, y) / 0.28
      // 柔和的抛物线穹顶弧度，边缘微垂
      const domeZ = (1 - r * r) * 0.095
      pos.setZ(i, domeZ)
    }
    g.computeVertexNormals()
    return g
  }, [])

  return (
    <group position={position} rotation={[tiltX, tiltY, 0]}>
      {/* 实木伞杆 */}
      <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.01, 0.012, 0.4, 8]} />
        <meshStandardMaterial color="#7a5430" roughness={0.85} />
      </mesh>
      {/* 金属中节环 */}
      <mesh position={[0, 0, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.025, 10]} />
        <meshStandardMaterial color="#d4b882" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* 写实条纹帆布伞面 */}
      <mesh geometry={canopyGeo} position={[0, 0, 0.34]} castShadow receiveShadow>
        <meshStandardMaterial map={canopyTex} roughness={0.88} side={THREE.DoubleSide} />
      </mesh>
      {/* 伞顶木质装饰尖顶 */}
      <mesh position={[0, 0, 0.445]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.004, 0.014, 0.03, 8]} />
        <meshStandardMaterial color="#7a5430" roughness={0.8} />
      </mesh>
    </group>
  )
}

function BeachLoungeSet({ side, spec }: { side: 1 | -1; spec: SceneSpec }) {
  const canopyTex = useMemo(() => makeUmbrellaCanopyTexture(), [])
  useEffect(() => () => canopyTex.dispose(), [canopyTex])
  useEffect(() => () => setPointerCursor(false), [])

  const { markDiscovered } = useEasterEggGuide()
  const umbrellaSpinRef = useRef<THREE.Group>(null)
  const sparkleGroupRef = useRef<THREE.Group>(null)
  const [chillId, setChillId] = useState(0)
  const tapTimeRef = useRef(-99)
  const sparkleSeeds = useMemo(
    () => Array.from({ length: 8 }, (_, i) => ({ ang: (i / 8) * Math.PI * 2, rad: 0.14 + (i % 2) * 0.06 })),
    [],
  )

  // 正面：沙滩中前偏右，面朝广阔海湾；背面：右上偏中镜像点缀
  const cx = side === 1 ? -0.02 : 0.38
  const cy = side === 1 ? -0.32 : 0.22
  const z = THIN_T / 2 + coastSurfaceZ(cx, cy, spec, side) - 0.004
  const facing = side === 1 ? -0.58 : -2.4
  const isMoon = resolveSceneTheme(spec).mood.id === 'coast_moonbay'

  useFrame(({ clock }) => {
    if (side !== 1 || chillId === 0) {
      if (sparkleGroupRef.current) sparkleGroupRef.current.visible = false
      if (umbrellaSpinRef.current) umbrellaSpinRef.current.rotation.z = 0
      return
    }
    if (tapTimeRef.current < 0) tapTimeRef.current = clock.elapsedTime
    const age = clock.elapsedTime - tapTimeRef.current
    if (umbrellaSpinRef.current) {
      umbrellaSpinRef.current.rotation.z = age < 1.5 ? Math.sin((age / 1.5) * Math.PI) * 0.42 : 0
    }
    if (sparkleGroupRef.current) {
      if (age < 1.6) {
        const p = age / 1.6
        const fade = Math.sin(p * Math.PI)
        sparkleGroupRef.current.visible = true
        sparkleGroupRef.current.children.forEach((child, idx) => {
          const item = sparkleSeeds[idx]
          const r = item.rad + p * 0.16
          child.position.set(Math.cos(item.ang + age * 1.4) * r, Math.sin(item.ang + age * 1.4) * r, p * 0.26)
          child.scale.setScalar(0.75 + fade * 0.7)
        })
      } else {
        sparkleGroupRef.current.visible = false
      }
    }
  })

  return (
    <group
      position={[cx, cy, z]}
      rotation={[0, 0, facing]}
      onClick={
        side === 1
          ? (e) => {
              if (!isTapEvent(e)) return
              tapTimeRef.current = -1
              setChillId((n) => n + 1)
              markDiscovered('landmark')
              playEasterEggSfx('beach')
            }
          : undefined
      }
      onPointerOver={
        side === 1
          ? (e) => {
              e.stopPropagation()
              setPointerCursor(true)
            }
          : undefined
      }
      onPointerOut={
        side === 1
          ? (e) => {
              e.stopPropagation()
              setPointerCursor(false)
            }
          : undefined
      }
    >
      <group ref={umbrellaSpinRef}>
        <BeachUmbrella position={[0, -0.04, 0]} canopyTex={canopyTex} />
      </group>
      {side === 1 && (
        <group ref={sparkleGroupRef} position={[0, -0.04, 0.28]} visible={false}>
          {sparkleSeeds.map((_, i) => (
            <mesh key={i}>
              <octahedronGeometry args={[0.016, 0]} />
              <meshBasicMaterial color={i % 2 === 0 ? '#fde047' : '#bae6fd'} />
            </mesh>
          ))}
        </group>
      )}
      {side === 1 && (
        <InteractiveHotspot
          guideKey="landmark"
          accent="#38bdf8"
          position={[0, -0.04, 0.52]}
        />
      )}
      {side === 1 && (
        <SpeechBubble3D
          text="🏖️ 吹吹海风，放松一下"
          accent="#0ea5e9"
          triggerId={chillId}
          position={[0, -0.04, 0.7]}
          scale={1.08}
        />
      )}
      {isMoon && side === 1 && (
        <group position={[0, -0.04, 0.28]}>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0]}>
                <sphereGeometry args={[0.011, 8, 8]} />
                <meshBasicMaterial color="#ffe08a" />
              </mesh>
            )
          })}
          <pointLight position={[0, 0, 0]} color="#ffcb80" intensity={1.15} distance={1.35} />
        </group>
      )}
      <BeachLounger position={[-0.14, 0.06, 0]} rotZ={0.08} />
      <BeachLounger position={[0.14, 0.04, 0]} rotZ={-0.06} />
      {/* 中间小圆木边桌 + 迷你海岛冷饮 */}
      <group position={[0, 0.08, 0]}>
        <mesh position={[0, 0, 0.028]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.01, 0.056, 8]} />
          <meshStandardMaterial color="#8c6239" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0, 0.058]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.048, 0.048, 0.01, 14]} />
          <meshStandardMaterial color="#a6794b" roughness={0.8} />
        </mesh>
        <mesh position={[0.014, 0.008, 0.075]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.01, 0.008, 0.026, 8]} />
          <meshStandardMaterial color="#ff9f68" roughness={0.3} transparent opacity={0.9} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------------- 4. 超写实细羽状 3D 弯曲椰子树 ---------------- */

function FeatherPalmTree({
  position,
  scale,
  rotZ,
  frondTex,
}: {
  position: [number, number, number]
  scale: number
  rotZ: number
  frondTex: THREE.CanvasTexture
}) {
  const { trunkGeo, frondGeo } = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.05, 0.01, 0.25),
      new THREE.Vector3(0.14, 0.03, 0.52),
      new THREE.Vector3(0.26, 0.02, 0.76),
    ])
    const trunk = new THREE.TubeGeometry(curve, 14, 0.028, 7, false)
    const tPos = trunk.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < tPos.count; i++) {
      const z = tPos.getZ(i)
      const taper = 1 - (z / 0.82) * 0.52
      const pt = curve.getPoint(THREE.MathUtils.clamp(z / 0.76, 0, 1))
      tPos.setX(i, pt.x + (tPos.getX(i) - pt.x) * taper)
      tPos.setY(i, pt.y + (tPos.getY(i) - pt.y) * taper)
    }
    trunk.computeVertexNormals()

    const frond = new THREE.PlaneGeometry(0.54, 0.26, 10, 2)
    frond.translate(0.27, 0, 0)
    const fPos = frond.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < fPos.count; i++) {
      const x = fPos.getX(i)
      const y = fPos.getY(i)
      const t = x / 0.54
      const droop = -t * t * 0.26 + Math.sin(t * Math.PI) * 0.075
      const fold = -Math.abs(y) * 0.28
      fPos.setZ(i, droop + fold)
    }
    frond.computeVertexNormals()
    return { trunkGeo: trunk, frondGeo: frond }
  }, [])

  const fronds = useMemo(() => [0, 1, 2, 3, 4, 5, 6, 7, 8], [])

  return (
    <group position={position} rotation={[0, 0, rotZ]} scale={scale}>
      <mesh geometry={trunkGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#6e533c" roughness={0.94} />
      </mesh>
      <group position={[0.25, 0.02, 0.73]}>
        <mesh position={[0.024, 0.014, -0.02]} castShadow>
          <sphereGeometry args={[0.024, 8, 8]} />
          <meshStandardMaterial color="#4e3824" roughness={0.85} />
        </mesh>
        <mesh position={[-0.018, 0.018, -0.024]} castShadow>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshStandardMaterial color="#5c4228" roughness={0.85} />
        </mesh>
        {fronds.map((i) => {
          const ang = (i / fronds.length) * Math.PI * 2 + (i % 2) * 0.14
          const pitch = i % 3 === 0 ? -0.22 : i % 3 === 1 ? 0.04 : 0.22
          return (
            <mesh key={i} geometry={frondGeo} rotation={[0, pitch, ang]} castShadow>
              <meshStandardMaterial
                map={frondTex}
                alphaTest={0.28}
                roughness={0.8}
                side={THREE.DoubleSide}
              />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

function RealisticFeatherPalms({ side, spec }: { side: 1 | -1; spec: SceneSpec }) {
  const frondTex = useMemo(() => makePalmFrondTexture(), [])
  useEffect(() => () => frondTex.dispose(), [frondTex])

  const density = spec.environment.foliage.density
  const palms = useMemo(() => {
    const frontList = [
      { x: -1.16, y: 0.48, s: 1.02, rot: -0.35 },
      { x: -0.84, y: 0.64, s: 0.84, rot: 0.35 },
      { x: -1.32, y: 0.12, s: 0.8, rot: -0.9 },
      { x: -0.52, y: 0.72, s: 0.72, rot: 0.08 },
      { x: 0.62, y: -0.74, s: 0.82, rot: 2.2 },
    ]
    const backList = [
      { x: 1.12, y: 0.48, s: 0.96, rot: 2.6 },
      { x: 0.82, y: 0.64, s: 0.8, rot: 1.9 },
      { x: -1.18, y: 0.56, s: 0.86, rot: -0.5 },
      { x: 1.2, y: -0.38, s: 0.74, rot: 2.1 },
      { x: -0.86, y: 0.68, s: 0.7, rot: 0.2 },
    ]
    const src = side === 1 ? frontList : backList
    const count = density === 'low' ? 4 : density === 'medium' ? 5 : src.length
    return src.slice(0, count).map((p) => ({
      ...p,
      z: THIN_T / 2 + coastSurfaceZ(p.x, p.y, spec, side) - 0.015,
    }))
  }, [side, spec, density])

  return (
    <group>
      {palms.map((p, i) => (
        <FeatherPalmTree
          key={i}
          position={[p.x, p.y, p.z]}
          scale={p.s}
          rotZ={p.rot}
          frondTex={frondTex}
        />
      ))}
    </group>
  )
}

/* ---------------- 5. 自然风化海岸礁石群 ---------------- */

function CoastRocks({ side, spec }: { side: 1 | -1; spec: SceneSpec }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const rockGeo = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(0.11, 1)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const n = fbm(v.x * 6 + 1.8, v.y * 6 + v.z * 5 + 2.9, 519, 3)
      v.multiplyScalar(0.75 + n * 0.48)
      v.z *= 0.56
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    geo.computeVertexNormals()
    return geo
  }, [])

  const rocks = useMemo(() => {
    const rnd = mulberry32(side === 1 ? 6601 : 7702)
    const clusters =
      side === 1
        ? [
            { cx: -1.1, cy: 0.5, n: 5, scale: 0.95 },
            { cx: 0.58, cy: -0.68, n: 5, scale: 0.82 },
            { cx: 0.05, cy: 0.42, n: 4, scale: 0.68 }, // 半浸浅滩礁石
          ]
        : [
            { cx: 1.04, cy: 0.5, n: 5, scale: 0.9 },
            { cx: -1.1, cy: 0.54, n: 4, scale: 0.78 },
          ]
    const out: { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number; c: string }[] = []
    for (const cl of clusters) {
      for (let i = 0; i < cl.n; i++) {
        const x = cl.cx + (rnd() - 0.5) * 0.42
        const y = cl.cy + (rnd() - 0.5) * 0.32
        out.push({
          x,
          y,
          z: coastSurfaceZ(x, y, spec, side),
          sx: (0.48 + rnd() * 0.72) * cl.scale,
          sy: (0.45 + rnd() * 0.65) * cl.scale,
          sz: (0.38 + rnd() * 0.55) * cl.scale,
          rot: rnd() * Math.PI * 2,
          c: rnd() < 0.5 ? '#756d63' : '#5c544b',
        })
      }
    }
    return out
  }, [side, spec])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    rocks.forEach((r, i) => {
      dummy.position.set(r.x, r.y, THIN_T / 2 + r.z)
      dummy.rotation.set(0, 0, r.rot)
      dummy.scale.set(r.sx, r.sy, r.sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      col.set(r.c)
      mesh.setColorAt(i, col)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [rocks])

  return (
    <instancedMesh ref={ref} args={[rockGeo, undefined, rocks.length]} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.92} metalness={0.04} />
    </instancedMesh>
  )
}

/* ---------------- 6. 超写实广阔海湾（蓝天白云反射 + 水下焦散 + 蕾丝白浪泡沫） ---------------- */

function RealisticBayOcean({ spec }: { spec: SceneSpec }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const skyTex = useMemo(() => makeLakeReflectionSkyTexture(), [])
  useEffect(() => () => skyTex.dispose(), [skyTex])

  const moodId = resolveSceneTheme(spec).mood.id
  const isSunset = moodId === 'coast_sunset'
  const isMoon = moodId === 'coast_moonbay'

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSkyMap: { value: skyTex },
      uShallow: { value: new THREE.Color('#54cfc7') },
      uTurquoise: { value: new THREE.Color('#239bb5') },
      uDeep: { value: new THREE.Color('#145a8c') },
      uFoam: { value: new THREE.Color('#f7fbff') },
      uCaustic: { value: new THREE.Color('#adeff5') },
      uSunset: { value: 0 },
      uMoon: { value: 0 },
    }),
    [skyTex],
  )

  useEffect(() => {
    if (isSunset) {
      uniforms.uShallow.value.set('#f5a673')
      uniforms.uTurquoise.value.set('#2e6e8e')
      uniforms.uDeep.value.set('#1c355c')
      uniforms.uFoam.value.set('#ffe4c4')
      uniforms.uCaustic.value.set('#ffd2a0')
    } else if (isMoon) {
      uniforms.uShallow.value.set('#14567a')
      uniforms.uTurquoise.value.set('#0e325c')
      uniforms.uDeep.value.set('#081630')
      uniforms.uFoam.value.set('#40f5ff')
      uniforms.uCaustic.value.set('#38f2ff')
    } else {
      uniforms.uShallow.value.set('#54cfc7')
      uniforms.uTurquoise.value.set('#239bb5')
      uniforms.uDeep.value.set('#145a8c')
      uniforms.uFoam.value.set('#f7fbff')
      uniforms.uCaustic.value.set('#adeff5')
    }
    uniforms.uSunset.value = isSunset ? 1 : 0
    uniforms.uMoon.value = isMoon ? 1 : 0
  }, [uniforms, isSunset, isMoon])

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.elapsedTime
  })

  if (!spec.environment.water.enabled) return null

  return (
    <mesh position={[0, 0, THIN_T / 2 + SEA_LEVEL]}>
      <planeGeometry args={[COAST_CARD_W - 0.01, COAST_CARD_H - 0.01, 64, 44]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          uniform float uTime;
          varying vec2 vLocal;
          varying vec3 vWorldPos;
          void main() {
            vLocal = position.xy;
            vec3 pos = position;
            float swell = sin(pos.x * 4.2 + pos.y * 4.8 - uTime * 1.5) * 0.007
                        + cos(pos.x * 7.0 - pos.y * 3.5 - uTime * 1.1) * 0.004;
            pos.z += swell;
            vec4 wp = modelMatrix * vec4(pos, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform sampler2D uSkyMap;
          uniform vec3 uShallow;
          uniform vec3 uTurquoise;
          uniform vec3 uDeep;
          uniform vec3 uFoam;
          uniform vec3 uCaustic;
          uniform float uSunset;
          uniform float uMoon;
          varying vec2 vLocal;
          varying vec3 vWorldPos;

          // 程序化细腻水波与蕾丝泡沫噪声
          float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }

          float vnoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          float fbm2(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
              v += a * vnoise(p);
              p = p * 2.05 + vec2(1.7, 9.2);
              a *= 0.5;
            }
            return v;
          }

          void main() {
            float curve = sin(vLocal.x * 1.65 + 0.4) * 0.12 + cos(vLocal.y * 2.1 - 0.5) * 0.09;
            float sh = (vLocal.x + 0.08) * 0.56 + (vLocal.y + 0.22) * 0.44 + curve;
            if (sh < 0.03) discard;

            // 水深分级：近岸极透明浅滩 -> 蒂芙尼青绿 -> 远海深蓝
            float dMid = smoothstep(0.06, 0.52, sh);
            float dDeep = smoothstep(0.45, 1.15, sh);
            vec3 waterCol = mix(uShallow, uTurquoise, dMid);
            waterCol = mix(waterCol, uDeep, dDeep);

            // 1. 蓝天/霞光/夜空自然镜面反射
            float nWave = fbm2(vLocal * 5.2 + vec2(uTime * 0.18, -uTime * 0.14));
            float nWave2 = fbm2(vLocal * 11.5 + vec2(-uTime * 0.25, uTime * 0.2));
            vec2 skyUv = clamp(vec2(vLocal.x * 0.34 + 0.52, vLocal.y * 0.42 + 0.48) + (nWave - 0.5) * 0.08, 0.02, 0.98);
            vec3 skyRefl = texture2D(uSkyMap, skyUv).rgb;
            vec3 sunsetSky = mix(vec3(0.98, 0.62, 0.42), vec3(0.65, 0.42, 0.68), dDeep);
            vec3 moonSky = vec3(0.06, 0.14, 0.3);
            skyRefl = mix(skyRefl, sunsetSky, uSunset * 0.72);
            skyRefl = mix(skyRefl, moonSky, uMoon * 0.85);
            waterCol = mix(waterCol, skyRefl, 0.28 + 0.16 * dMid);

            // 2. 浅滩水下焦散光网（星月夜呈现蓝眼泪荧光）
            float c1 = abs(sin((vLocal.x * 11.0 + nWave * 4.0) + uTime * 0.9));
            float c2 = abs(cos((vLocal.y * 12.0 - nWave2 * 4.0) - uTime * 0.7));
            float caustics = pow(1.0 - min(c1, c2), 4.0) * smoothstep(0.65, 0.08, sh);
            waterCol += uCaustic * caustics * (uMoon > 0.5 ? 0.42 : 0.22);

            // 3. 自然细腻的海面微澜与日落碎金
            float glint = smoothstep(0.68, 0.92, nWave2) * smoothstep(0.55, 0.85, nWave) * 0.28;
            vec3 glintCol = mix(vec3(0.98, 0.99, 1.0), vec3(1.0, 0.78, 0.46), uSunset);
            waterCol += glintCol * glint;

            // 4. 写实蕾丝状海岸白浪泡沫前沿
            float lace = fbm2(vLocal * 16.0 - vec2(uTime * 0.22, uTime * 0.18));
            float waveAdvance = sin(sh * 22.0 - uTime * 2.1 + lace * 2.4);
            float surfBand = smoothstep(0.36, 0.06, sh) * smoothstep(0.35, 0.88, waveAdvance) * smoothstep(0.34, 0.72, lace);
            float edgeFoam = smoothstep(0.14, 0.035, sh) * smoothstep(0.28, 0.65, lace + 0.22);
            float foam = clamp(surfBand * 0.85 + edgeFoam * 0.96, 0.0, 0.96);
            waterCol = mix(waterCol, uFoam, foam);

            // 近岸清澈透明可见湿沙，深海逐渐不透明
            float alpha = smoothstep(0.03, 0.11, sh) * mix(0.54, 0.93, dMid);
            alpha = max(alpha, foam * 0.92);
            gl_FragColor = vec4(waterCol, alpha);
          }
        `}
      />
    </mesh>
  )
}

/* ---------------- 7. 沙滩贝壳/小花拼字 + 背面精细贝壳点阵二维码 ---------------- */

function sampleCoastText(text: string, maxPoints: number, seed: number): [number, number][] {
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

function CoastShellName({
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
  const spriteTex = useMemo(() => makeFlowerSpriteTexture(), [])
  useEffect(() => () => spriteTex.dispose(), [spriteTex])

  const maxPts = quality === 'low' ? 680 : quality === 'medium' ? 1100 : 1550
  const pts = useMemo(() => sampleCoastText(text, maxPts, seed), [text, maxPts, seed])

  const theme = resolveSceneTheme(spec)
  const isMoon = theme.mood.id === 'coast_moonbay'
  const useCustom = side === 1 && !!theme.customTextColor
  const useBright = useCustom ? theme.isDark : isMoon

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const rnd = mulberry32(seed + 31)
    let paletteHex = ['#285769', '#3b788a', '#d97f6c', '#6b5242', '#ffffff']
    if (useCustom && theme.customTextColor) {
      const v = makeHexVariants(theme.customTextColor)
      paletteHex = [v[1], v[0], v[2], v[3], v[1]]
    } else if (isMoon) {
      paletteHex = ['#7af5ff', '#b8fbff', '#ffffff', '#67e8f9', '#e0faff']
    }
    const colors = paletteHex.map((h) => new THREE.Color(h))
    const cosR = Math.cos(rotZ)
    const sinR = Math.sin(rotZ)

    pts.forEach((pt, i) => {
      const lx0 = (pt[0] - 0.5) * box.w
      const ly0 = (pt[1] - 0.5) * box.h
      const x = box.cx + lx0 * cosR - ly0 * sinR
      const y = box.cy + lx0 * sinR + ly0 * cosR
      const z = coastSurfaceZ(x, y, spec, side)
      dummy.position.set(x, y, THIN_T / 2 + z + 0.022 + rnd() * 0.01)
      dummy.rotation.set(0, 0, rnd() * Math.PI * 2)
      dummy.scale.setScalar(0.65 + rnd() * 0.52)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      const pick = rnd() < 0.52 ? (rnd() < 0.6 ? 0 : 1) : 2 + Math.floor(rnd() * 3)
      mesh.setColorAt(i, colors[pick])
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pts, seed, spec, side, box, rotZ, useCustom, theme.customTextColor, isMoon])

  if (pts.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <planeGeometry args={[0.03, 0.03]} />
      <meshStandardMaterial
        map={spriteTex}
        emissive={useBright ? theme.customTextColor || '#67f2ff' : '#000000'}
        emissiveMap={spriteTex}
        emissiveIntensity={useBright ? 0.45 : 0}
        alphaTest={0.3}
        roughness={0.78}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}

function CoastQrPebbles({ text, spec }: { text: string; spec: SceneSpec }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const spriteTex = useMemo(() => makeFlowerSpriteTexture(), [])
  useEffect(() => () => spriteTex.dispose(), [spriteTex])
  const isMoon = resolveSceneTheme(spec).mood.id === 'coast_moonbay'

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
    const rnd = mulberry32(4321)
    const cA = new THREE.Color(isMoon ? '#a5f3fc' : '#274d5c')
    const cB = new THREE.Color(isMoon ? '#38e8ff' : '#3a6978')

    pts.forEach((p, i) => {
      const x = -1.04 + (p[0] - 0.5) * 0.82
      const y = -0.46 + (p[1] - 0.5) * 0.82
      const z = coastSurfaceZ(x, y, spec, -1)
      dummy.position.set(x, y, THIN_T / 2 + z + 0.018)
      dummy.rotation.set(0, 0, rnd() * Math.PI * 2)
      dummy.scale.setScalar(modSize * 1.35)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, rnd() < 0.7 ? cA : cB)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pts, modSize, spec, isMoon])

  if (pts.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        map={spriteTex}
        emissive={isMoon ? '#67f2ff' : '#000000'}
        emissiveMap={spriteTex}
        emissiveIntensity={isMoon ? 0.42 : 0}
        alphaTest={0.28}
        roughness={0.82}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}

/* ---------------- 海岸双面总装 ---------------- */

export function CoastDioramaCard({
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
      {/* 极薄暖沙底芯 */}
      <mesh>
        <boxGeometry args={[COAST_CARD_W, COAST_CARD_H, THIN_T]} />
        <meshStandardMaterial color="#b89b72" roughness={0.92} />
      </mesh>

      {/* 正面（+Z）：广阔写实海湾、遮阳伞与双木质躺椅、细羽椰林、礁石、贝壳拼字 */}
      <group>
        <CoastTerrain side={1} spec={spec} quality={quality} onSculpt={onSculpt} />
        <BeachLoungeSet side={1} spec={spec} />
        <RealisticFeatherPalms side={1} spec={spec} />
        <CoastRocks side={1} spec={spec} />
        <RealisticBayOcean spec={spec} />
        <CoastShellName
          side={1}
          text={profile.name || 'Zilin'}
          spec={spec}
          quality={quality}
          box={{ cx: -0.84, cy: -0.58, w: 1.28, h: 0.4 }}
          seed={701}
        />
        <MbtiStandee
          mbti={profile.mbti}
          avatarUrl={profile.avatarUrl}
          avatarFrame={profile.avatarFrame}
          name={profile.name}
          greeting={profile.greeting}
          position={[-0.98, -0.06, THIN_T / 2 + coastSurfaceZ(-0.98, -0.06, spec, 1) + 0.01]}
          scale={1.05}
          rotZ={0.35}
        />
        <MicroAccessory
          accessory={profile.accessory}
          greeting={profile.greeting}
          position={[-0.18, -0.65, THIN_T / 2 + coastSurfaceZ(-0.18, -0.65, spec, 1) + 0.012]}
          scale={0.95}
          rotZ={0.28}
        />
      </group>

      {/* 背面（绕 X 轴翻转 180°）：镜像海岛 + 躺椅遮阳伞 + 精细贝壳二维码 */}
      <group rotation={[Math.PI, 0, 0]}>
        <CoastTerrain side={-1} spec={spec} quality={quality} />
        <BeachLoungeSet side={-1} spec={spec} />
        <RealisticFeatherPalms side={-1} spec={spec} />
        <CoastRocks side={-1} spec={spec} />
        <CoastQrPebbles text={qrText} spec={spec} />
        <CoastShellName
          side={-1}
          text={profile.title || profile.name || 'Zilin'}
          spec={spec}
          quality={quality}
          box={{ cx: 0.36, cy: -0.34, w: 1.46, h: 0.35 }}
          seed={702}
          rotZ={0.26}
        />
      </group>
    </group>
  )
}
