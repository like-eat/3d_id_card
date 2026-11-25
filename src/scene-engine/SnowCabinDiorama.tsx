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
  makeCabinWallTexture,
  makeFlowerSpriteTexture,
  makeSnowGroundTextures,
  makeSnowPineBranchTexture,
  mulberry32,
  smoothstep,
} from './proceduralTextures'

export const SNOW_CARD_W = 3.2
export const SNOW_CARD_H = SNOW_CARD_W / 1.586
const THIN_T = 0.022

type Quality = 'low' | 'medium' | 'high'
const DENSITY_FACTOR = { low: 0.6, medium: 1, high: 1.35 } as const

/* ---------------- 冬日冰湖轮廓与双面起伏雪坡 ---------------- */

const ICE_CX = 0.72
const ICE_CY = -0.15

function iceLakeDist(lx: number, ly: number): number {
  const dx = lx - ICE_CX
  const dy = ly - ICE_CY
  const ang = Math.atan2(dy, dx)
  const wobble = 1 + 0.12 * Math.sin(ang * 2 + 0.5) + 0.07 * Math.cos(ang * 3 - 0.3)
  return Math.hypot(dx / (0.38 * wobble), dy / (0.25 * wobble))
}

export function snowSurfaceZ(lx: number, ly: number, spec: SceneSpec, side: 1 | -1): number {
  const dx = SNOW_CARD_W / 2 - Math.abs(lx)
  const dy = SNOW_CARD_H / 2 - Math.abs(ly)
  const edgeFade = smoothstep(Math.min(dx, dy) / 0.2)

  const seed = side === 1 ? 9101 : 9403
  const amp = spec.environment.terrain.amplitude * 0.45
  const n = fbm(lx * 0.92 + 4.1, ly * 0.92 + 2.3, seed, 4)
  let z = n * amp * 0.48

  const ridgeLeft = Math.exp(-(((lx + 0.82) / 0.74) ** 2 + ((ly - 0.42) / 0.56) ** 2))
  const ridgeCabin = Math.exp(-(((lx - 0.58) / 0.72) ** 2 + ((ly - 0.34) / 0.54) ** 2))
  const moundFront = Math.exp(-(((lx + 0.62) / 0.7) ** 2 + ((ly + 0.58) / 0.48) ** 2))
  z += (ridgeLeft * 0.34 + ridgeCabin * 0.24 + moundFront * 0.1) * edgeFade

  for (const b of spec.environment.terrain.bumps ?? []) {
    const bx = b.x * (SNOW_CARD_W / 2)
    const by = b.y * (SNOW_CARD_H / 2)
    const g = Math.exp(-(((lx - bx) / b.radius) ** 2 + ((ly - by) / b.radius) ** 2))
    z += b.height * g * 0.55
  }

  z *= 0.14 + 0.86 * edgeFade

  // 木屋地基轻微整平，确保屋底稳贴雪地
  const cabinPad = 1 - smoothstep((Math.hypot((lx - 0.58) / 0.34, (ly - 0.34) / 0.3) - 0.65) / 0.4)
  z = THREE.MathUtils.lerp(z, 0.21, cabinPad * 0.82)

  if (side === 1 && spec.environment.water.enabled) {
    const id = iceLakeDist(lx, ly)
    const basin = 1 - smoothstep((id - 0.78) / 0.38)
    z = THREE.MathUtils.lerp(z, 0.008, basin)
  }

  if (side === -1) {
    const qrFlat = 1 - smoothstep((Math.hypot((lx + 1.04) / 0.58, (ly + 0.46) / 0.54) - 0.65) / 0.45)
    z = THREE.MathUtils.lerp(z, 0.015, qrFlat)
  }

  return Math.max(0.004, z)
}

/* ---------------- 1. 极薄双面雪坡地形 ---------------- */

function SnowTerrain({
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
  const snowTex = useMemo(() => makeSnowGroundTextures(), [])
  useEffect(() => {
    return () => {
      snowTex.map.dispose()
      snowTex.normalMap.dispose()
    }
  }, [snowTex])

  const isAurora = resolveSceneTheme(spec).mood.id === 'snow_aurora'

  const geo = useMemo(() => {
    const segX = quality === 'low' ? 48 : 80
    const segY = quality === 'low' ? 32 : 52
    const g = new THREE.PlaneGeometry(SNOW_CARD_W, SNOW_CARD_H, segX, segY)
    const pos = g.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const tmp = new THREE.Color()
    const shadowSnow = new THREE.Color(isAurora ? '#355778' : '#d7e6f5')
    const pureSnow = new THREE.Color(isAurora ? '#6d96bd' : '#f8fbff')

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i)
      const ly = pos.getY(i)
      const z = snowSurfaceZ(lx, ly, spec, side)
      pos.setZ(i, z)

      const ht = smoothstep(z / 0.34)
      const drift = fbm(lx * 1.8 + 1.1, ly * 1.8 + 4.4, side === 1 ? 511 : 719, 3)
      tmp.copy(shadowSnow).lerp(pureSnow, 0.45 + ht * 0.45 + drift * 0.12)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [side, spec, quality, isAurora])

  return (
    <mesh
      geometry={geo}
      position={[0, 0, THIN_T / 2]}
      receiveShadow
      onClick={
        side === 1 && onSculpt
          ? (e) => {
              e.stopPropagation()
              const nx = THREE.MathUtils.clamp(e.point.x / (SNOW_CARD_W / 2), -1, 1)
              const ny = THREE.MathUtils.clamp(-e.point.z / (SNOW_CARD_H / 2), -1, 1)
              onSculpt(nx, ny)
            }
          : undefined
      }
    >
      <meshStandardMaterial
        map={snowTex.map}
        normalMap={snowTex.normalMap}
        normalScale={new THREE.Vector2(0.55, 0.55)}
        emissive={isAurora ? '#12283d' : '#dbe8f5'}
        emissiveIntensity={isAurora ? 0.18 : 0.14}
        roughness={0.62}
        metalness={0.04}
        vertexColors
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/* ---------------- 2. 阿尔卑斯微缩原木小屋（暖灯木窗 + 积雪斜屋顶 + 炊烟） ---------------- */

function AlpineWoodCabin({ side, spec }: { side: 1 | -1; spec: SceneSpec }) {
  const cx = 0.58
  const cy = 0.34
  const cz = THIN_T / 2 + snowSurfaceZ(cx, cy, spec, side) - 0.014

  const wallTex = useMemo(() => makeCabinWallTexture(), [])
  const gableGeo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-0.21, 0)
    s.lineTo(0.21, 0)
    s.lineTo(0, 0.138)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: false })
    g.rotateX(Math.PI / 2)
    g.translate(0, 0.16, 0.236)
    return g
  }, [])

  useEffect(() => {
    return () => {
      wallTex.map.dispose()
      wallTex.emissiveMap.dispose()
      gableGeo.dispose()
    }
  }, [wallTex, gableGeo])

  const smokeGroupRef = useRef<THREE.Group>(null)
  const burstSmokeRef = useRef<THREE.Group>(null)
  const lampLightRef = useRef<THREE.PointLight>(null)
  const winMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  const [warmId, setWarmId] = useState(0)
  const tapTimeRef = useRef(-99)
  const smokeItems = useMemo(() => Array.from({ length: 6 }, (_, i) => i / 6), [])
  const burstItems = useMemo(() => Array.from({ length: 12 }, (_, i) => i), [])
  useEffect(() => () => setPointerCursor(false), [])

  const { markDiscovered } = useEasterEggGuide()
  const moodId = resolveSceneTheme(spec).mood.id
  const isAurora = moodId === 'snow_aurora'
  const isDusk = moodId === 'snow_dusk'
  const winEmissive = isAurora ? 1.82 : isDusk ? 1.45 : 1.18
  const baseLightIntensity = isAurora ? 1.55 : isDusk ? 1.15 : 0.72

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    let boost = 0
    if (side === 1 && warmId > 0) {
      if (tapTimeRef.current < 0) tapTimeRef.current = t
      const age = t - tapTimeRef.current
      if (age < 2.8) boost = Math.sin((age / 2.8) * Math.PI)

      const burstGrp = burstSmokeRef.current
      if (burstGrp) {
        if (age < 2.8) {
          burstGrp.visible = true
          burstGrp.children.forEach((child, idx) => {
            const delay = idx * 0.1
            const life = age - delay
            if (life <= 0 || life > 2.0) {
              child.visible = false
              return
            }
            const p = life / 2.0
            child.visible = true
            child.position.set(
              Math.sin(t * 2.2 + idx * 1.1) * 0.045 + p * 0.09,
              Math.cos(t * 1.8 + idx) * 0.025 + p * 0.04,
              p * 0.56,
            )
            child.scale.setScalar(0.85 + p * 1.9)
            const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial
            mat.opacity = Math.sin(p * Math.PI) * 0.72
          })
        } else {
          burstGrp.visible = false
        }
      }
    } else if (burstSmokeRef.current) {
      burstSmokeRef.current.visible = false
    }

    if (lampLightRef.current) {
      lampLightRef.current.intensity = baseLightIntensity + boost * 1.5
    }
    winMatRefs.current.forEach((mat, idx) => {
      if (mat) mat.emissiveIntensity = (winEmissive + boost * 1.45) * (idx >= 2 ? 0.92 : 1)
    })

    const grp = smokeGroupRef.current
    if (!grp) return
    grp.children.forEach((child, idx) => {
      const p = (smokeItems[idx] + t * (0.24 + boost * 0.18)) % 1
      child.position.set(Math.sin(t * 1.4 + idx) * 0.02 + p * 0.04, p * 0.02, p * (0.28 + boost * 0.1))
      child.scale.setScalar((0.65 + p * 1.35) * (1 + boost * 0.35))
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial
      mat.opacity = Math.sin(p * Math.PI) * (0.42 + boost * 0.28)
    })
  })

  return (
    <group
      position={[cx, cy, cz]}
      rotation={[0, 0, -0.34]}
      scale={0.94}
      onClick={
        side === 1
          ? (e) => {
              if (!isTapEvent(e)) return
              tapTimeRef.current = -1
              setWarmId((n) => n + 1)
              markDiscovered('landmark')
              playEasterEggSfx('cabin')
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
      {/* 石砌厚实小地基（稳稳嵌入雪坡） */}
      <mesh position={[0, 0, 0.024]} castShadow receiveShadow>
        <boxGeometry args={[0.48, 0.38, 0.068]} />
        <meshStandardMaterial color="#6b7280" roughness={0.95} />
      </mesh>

      {/* 原木主体核心 + 四面正立暖光木窗贴面 + 人字山墙 */}
      <mesh position={[0, 0, 0.145]} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.32, 0.19]} />
        <meshStandardMaterial color="#754626" roughness={0.82} />
      </mesh>
      <mesh geometry={gableGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#6e4122" roughness={0.84} />
      </mesh>
      {/* 前(-Y) / 后(+Y) 原木窗墙 */}
      <mesh position={[0, -0.161, 0.145]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.42, 0.19]} />
        <meshStandardMaterial
          ref={(el) => { winMatRefs.current[0] = el }}
          map={wallTex.map}
          emissive="#ffaa44"
          emissiveMap={wallTex.emissiveMap}
          emissiveIntensity={winEmissive}
          roughness={0.78}
        />
      </mesh>
      <mesh position={[0, 0.161, 0.145]} rotation={[Math.PI / 2, Math.PI, 0]}>
        <planeGeometry args={[0.42, 0.19]} />
        <meshStandardMaterial
          ref={(el) => { winMatRefs.current[1] = el }}
          map={wallTex.map}
          emissive="#ffaa44"
          emissiveMap={wallTex.emissiveMap}
          emissiveIntensity={winEmissive}
          roughness={0.78}
        />
      </mesh>
      {/* 右(+X) / 左(-X) 侧墙 */}
      <mesh position={[0.211, 0, 0.145]} rotation={[Math.PI / 2, Math.PI / 2, 0]}>
        <planeGeometry args={[0.32, 0.19]} />
        <meshStandardMaterial
          ref={(el) => { winMatRefs.current[2] = el }}
          map={wallTex.map}
          emissive="#ffaa44"
          emissiveMap={wallTex.emissiveMap}
          emissiveIntensity={winEmissive * 0.92}
          roughness={0.78}
        />
      </mesh>
      <mesh position={[-0.211, 0, 0.145]} rotation={[Math.PI / 2, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.32, 0.19]} />
        <meshStandardMaterial
          ref={(el) => { winMatRefs.current[3] = el }}
          map={wallTex.map}
          emissive="#ffaa44"
          emissiveMap={wallTex.emissiveMap}
          emissiveIntensity={winEmissive * 0.92}
          roughness={0.78}
        />
      </mesh>

      {/* 正门深棕木门 + 石门阶 + 门前暖灯 */}
      <mesh position={[0, -0.163, 0.115]}>
        <boxGeometry args={[0.088, 0.012, 0.125]} />
        <meshStandardMaterial color="#422413" roughness={0.72} />
      </mesh>
      <mesh position={[0, -0.205, 0.03]} receiveShadow>
        <boxGeometry args={[0.13, 0.068, 0.025]} />
        <meshStandardMaterial color="#8f9aa6" roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.174, 0.196]}>
        <sphereGeometry args={[0.016, 10, 10]} />
        <meshBasicMaterial color="#ffe49e" />
      </mesh>
      {side === 1 && (
        <pointLight
          ref={lampLightRef}
          position={[0, -0.24, 0.18]}
          distance={isAurora ? 1.55 : isDusk ? 1.25 : 0.92}
          intensity={baseLightIntensity}
          color="#ffb863"
        />
      )}

      {/* 深棕人字坡木屋顶 */}
      <mesh position={[-0.125, 0, 0.285]} rotation={[0, -0.58, 0]} castShadow>
        <boxGeometry args={[0.295, 0.38, 0.026]} />
        <meshStandardMaterial color="#4a2e1b" roughness={0.85} />
      </mesh>
      <mesh position={[0.125, 0, 0.285]} rotation={[0, 0.58, 0]} castShadow>
        <boxGeometry args={[0.295, 0.38, 0.026]} />
        <meshStandardMaterial color="#4a2e1b" roughness={0.85} />
      </mesh>

      {/* 蓬松厚实的积雪屋顶覆盖层 + 屋脊雪线 */}
      <mesh position={[-0.128, 0, 0.305]} rotation={[0, -0.58, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.31, 0.395, 0.032]} />
        <meshStandardMaterial color="#f5f9ff" roughness={0.62} />
      </mesh>
      <mesh position={[0.128, 0, 0.305]} rotation={[0, 0.58, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.31, 0.395, 0.032]} />
        <meshStandardMaterial color="#f5f9ff" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0, 0.376]}>
        <cylinderGeometry args={[0.024, 0.024, 0.39, 10]} />
        <meshStandardMaterial color="#f8fbff" roughness={0.6} />
      </mesh>

      {/* 石砌烟囱与袅袅炊烟 */}
      <mesh position={[0.115, 0.08, 0.36]} castShadow>
        <boxGeometry args={[0.062, 0.062, 0.13]} />
        <meshStandardMaterial color="#6e7682" roughness={0.92} />
      </mesh>
      <group ref={smokeGroupRef} position={[0.115, 0.08, 0.43]}>
        {smokeItems.map((_, idx) => (
          <mesh key={idx}>
            <sphereGeometry args={[0.026, 8, 8]} />
            <meshBasicMaterial color="#b9cbe0" transparent opacity={0.58} depthWrite={false} />
          </mesh>
        ))}
      </group>
      {/* 点击木屋升起浓暖炊烟团 + 欢迎气泡 */}
      {side === 1 && (
        <group ref={burstSmokeRef} position={[0.115, 0.08, 0.43]} visible={false}>
          {burstItems.map((idx) => (
            <mesh key={idx}>
              <sphereGeometry args={[0.034, 10, 10]} />
              <meshBasicMaterial color="#eef5ff" transparent opacity={0} depthWrite={false} />
            </mesh>
          ))}
        </group>
      )}
      {side === 1 && (
        <InteractiveHotspot
          guideKey="landmark"
          accent="#ffb863"
          position={[0.04, -0.02, 0.5]}
        />
      )}
      {side === 1 && (
        <SpeechBubble3D
          text="🔥 炉火正暖，进来喝杯热茶"
          accent="#d97706"
          triggerId={warmId}
          position={[0, 0, 0.74]}
          scale={1.15}
        />
      )}

      {/* 屋侧堆叠的迷你原木柴垛 */}
      {[
        [-0.25, -0.05, 0.04],
        [-0.25, 0.0, 0.04],
        [-0.25, 0.05, 0.04],
        [-0.25, -0.025, 0.072],
        [-0.25, 0.025, 0.072],
      ].map(([lx, ly, lz], idx) => (
        <mesh key={idx} position={[lx, ly, lz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.085, 8]} />
          <meshStandardMaterial color="#8c542e" roughness={0.88} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- 3. 覆雪锯齿针叶冷杉林 ---------------- */

function SnowySpruceTrees({ side, spec, quality }: { side: 1 | -1; spec: SceneSpec; quality: Quality }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const branchRef = useRef<THREE.InstancedMesh>(null)
  const snowPineTex = useMemo(() => makeSnowPineBranchTexture(), [])
  useEffect(() => () => snowPineTex.dispose(), [snowPineTex])

  const trees = useMemo(() => {
    const rnd = mulberry32(side === 1 ? 6601 : 7703)
    const count = Math.round(
      (quality === 'low' ? 9 : quality === 'medium' ? 13 : 17) *
        DENSITY_FACTOR[spec.environment.foliage.density],
    )
    const out: { x: number; y: number; z: number; h: number; w: number; rot: number }[] = []
    let tries = count * 8
    while (out.length < count && tries-- > 0) {
      // 集中在左后雪山坡与木屋侧后方，避开木屋正前、左下文字与冰湖
      const inLeftHill = rnd() < 0.72
      const x = inLeftHill ? -1.38 + rnd() * 1.1 : -0.18 + rnd() * 1.48
      const y = inLeftHill ? -0.08 + rnd() * 0.94 : 0.32 + rnd() * 0.56
      if (Math.hypot(x - 0.58, y - 0.34) < 0.44) continue
      if (side === 1 && spec.environment.water.enabled && iceLakeDist(x, y) < 1.08) continue
      if (side === -1 && x < -0.45 && y < 0.02) continue
      if (out.some((o) => Math.hypot(o.x - x, o.y - y) < 0.22)) continue

      const z = snowSurfaceZ(x, y, spec, side)
      const h = 0.36 + rnd() * 0.34
      out.push({ x, y, z, h, w: 0.22 + h * 0.24, rot: rnd() * Math.PI * 2 })
    }
    return out
  }, [side, spec, quality])

  const tiersPerTree = quality === 'low' ? 10 : 13
  const trunkGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.008, 0.022, 1, 7)
    g.rotateX(Math.PI / 2)
    g.translate(0, 0, 0.5)
    return g
  }, [])
  const tierGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.5, 0.28, 12, 1, true)
    g.rotateX(Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) + 0.5, pos.getY(i) + 0.5)
    }
    uv.needsUpdate = true
    return g
  }, [])
  useEffect(() => {
    return () => {
      trunkGeo.dispose()
      tierGeo.dispose()
    }
  }, [trunkGeo, tierGeo])

  useLayoutEffect(() => {
    const tm = trunkRef.current
    const bm = branchRef.current
    if (!tm || !bm || trees.length === 0) return

    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    const rnd = mulberry32(side === 1 ? 8812 : 9912)
    const cLow = new THREE.Color('#c8dae8')
    const cHigh = new THREE.Color('#ffffff')

    let bi = 0
    trees.forEach((tr, ti) => {
      dummy.position.set(tr.x, tr.y, THIN_T / 2 + tr.z - 0.01)
      dummy.rotation.set((rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06, tr.rot)
      dummy.scale.set(1, 1, tr.h * 0.85)
      dummy.updateMatrix()
      tm.setMatrixAt(ti, dummy.matrix)

      for (let k = 0; k < tiersPerTree; k++) {
        const t = k / (tiersPerTree - 1)
        const tz = THIN_T / 2 + tr.z + tr.h * (0.2 + t * 0.8)
        const s = tr.w * (1 - t * 0.72) * (0.9 + rnd() * 0.2)
        dummy.position.set(tr.x, tr.y, tz)
        dummy.rotation.set((rnd() - 0.5) * 0.22, (rnd() - 0.5) * 0.22, tr.rot + k * 0.95)
        dummy.scale.setScalar(s)
        dummy.updateMatrix()
        bm.setMatrixAt(bi, dummy.matrix)
        col.copy(cLow).lerp(cHigh, 0.35 + t * 0.65)
        bm.setColorAt(bi, col)
        bi++
      }
    })
    tm.instanceMatrix.needsUpdate = true
    bm.instanceMatrix.needsUpdate = true
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true
  }, [trees, tiersPerTree, side])

  const isAurora = resolveSceneTheme(spec).mood.id === 'snow_aurora'

  if (trees.length === 0) return null
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeo, undefined, trees.length]} castShadow>
        <meshStandardMaterial color="#3c2a1e" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={branchRef} args={[tierGeo, undefined, trees.length * tiersPerTree]} castShadow receiveShadow>
        <meshStandardMaterial
          map={snowPineTex}
          emissive={isAurora ? '#43a4b8' : '#dce9f5'}
          emissiveMap={snowPineTex}
          emissiveIntensity={isAurora ? 0.28 : 0.22}
          alphaTest={0.28}
          roughness={0.78}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </group>
  )
}

/* ---------------- 4. 冬日光滑结冰湖面 ---------------- */

function FrozenLake({ spec }: { spec: SceneSpec }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const iceGeo = useMemo(() => {
    const shape = new THREE.Shape()
    const segs = 56
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2
      const wobble = 1 + 0.12 * Math.sin(ang * 2 + 0.5) + 0.07 * Math.cos(ang * 3 - 0.3)
      const x = Math.cos(ang) * 0.38 * wobble
      const y = Math.sin(ang) * 0.25 * wobble
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    return new THREE.ShapeGeometry(shape, 24)
  }, [])

  const { markDiscovered } = useEasterEggGuide()
  const moodId = resolveSceneTheme(spec).mood.id
  const isAurora = moodId === 'snow_aurora'
  const isDusk = moodId === 'snow_dusk'

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAurora: { value: isAurora ? 1 : 0 },
      uDusk: { value: isDusk ? 1 : 0 },
    }),
    [],
  )
  useEffect(() => {
    uniforms.uAurora.value = isAurora ? 1 : 0
    uniforms.uDusk.value = isDusk ? 1 : 0
  }, [uniforms, isAurora, isDusk])
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.elapsedTime
  })

  if (!spec.environment.water.enabled) return null

  return (
    <mesh geometry={iceGeo} position={[ICE_CX, ICE_CY, THIN_T / 2 + 0.025]}>
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
          uniform float uAurora;
          uniform float uDusk;
          varying vec2 vLocal;
          void main() {
            float r = length(vLocal / vec2(0.38, 0.25));
            vec3 iceCenter = vec3(0.56, 0.78, 0.92);
            vec3 iceEdge = vec3(0.84, 0.93, 0.99);
            vec3 dayCol = mix(iceCenter, iceEdge, smoothstep(0.35, 1.0, r));
            float sheen = smoothstep(0.02, 0.12, 0.12 - abs(vLocal.x * 0.65 + vLocal.y - sin(uTime * 0.4) * 0.06));
            dayCol += vec3(0.22, 0.28, 0.32) * sheen;
            float warm = smoothstep(0.28, 0.0, length(vLocal - vec2(-0.08, 0.15)));
            dayCol += vec3(0.18, 0.11, 0.04) * warm;

            vec3 duskCol = mix(dayCol, vec3(0.58, 0.68, 0.88), 0.35) + vec3(0.24, 0.14, 0.05) * warm;

            vec3 auroraIce = mix(vec3(0.08, 0.22, 0.34), vec3(0.24, 0.46, 0.62), smoothstep(0.4, 1.0, r));
            float wave = 0.5 + 0.5 * sin(vLocal.x * 9.0 + vLocal.y * 6.0 - uTime * 1.1);
            auroraIce += mix(vec3(0.16, 0.92, 0.62), vec3(0.45, 0.28, 0.88), wave) * 0.32 * (1.0 - r * 0.5);
            auroraIce += vec3(0.55, 0.34, 0.12) * warm;

            vec3 col = mix(dayCol, duskCol, uDusk);
            col = mix(col, auroraIce, uAurora);
            gl_FragColor = vec4(col, 0.9);
          }
        `}
      />
    </mesh>
  )
}

/* ---------------- 极光丝绸幕帘（仅在雪山极光皮肤下优雅舞动） ---------------- */

function AuroraCurtain() {
  const matARef = useRef<THREE.ShaderMaterial>(null)
  const matBRef = useRef<THREE.ShaderMaterial>(null)

  const geoA = useMemo(() => {
    const g = new THREE.PlaneGeometry(2.85, 0.78, 56, 8)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const zCurve = -0.2 * Math.cos(x * 1.1) + 0.09 * Math.sin(x * 2.5)
      pos.setZ(i, zCurve)
    }
    g.rotateX(Math.PI / 2)
    return g
  }, [])

  const geoB = useMemo(() => {
    const g = new THREE.PlaneGeometry(2.4, 0.64, 48, 8)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const zCurve = 0.14 * Math.sin(x * 1.7 + 0.5) - 0.1 * Math.cos(x * 2.8)
      pos.setZ(i, zCurve)
    }
    g.rotateX(Math.PI / 2)
    return g
  }, [])

  useEffect(() => {
    return () => {
      geoA.dispose()
      geoB.dispose()
    }
  }, [geoA, geoB])

  const uniA = useMemo(() => ({ uTime: { value: 0 }, uShift: { value: 0 } }), [])
  const uniB = useMemo(() => ({ uTime: { value: 0 }, uShift: { value: 1.8 } }), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (matARef.current) matARef.current.uniforms.uTime.value = t
    if (matBRef.current) matBRef.current.uniforms.uTime.value = t
  })

  const vertexShader = `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uShift;
    void main() {
      vUv = uv;
      vec3 p = position;
      float sway = sin(uv.x * 7.5 + uTime * 0.7 + uShift) * 0.07 * uv.y;
      p.y += sway;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `
  const fragmentShader = `
    uniform float uTime;
    uniform float uShift;
    varying vec2 vUv;
    void main() {
      float edgeX = smoothstep(0.0, 0.24, vUv.x) * smoothstep(1.0, 0.76, vUv.x);
      float edgeY = smoothstep(0.0, 0.34, vUv.y) * smoothstep(1.0, 0.32, vUv.y);
      float rays = 0.5 + 0.5 * sin(vUv.x * 24.0 + uTime * 0.9 + sin(vUv.x * 7.0 - uTime * 0.5 + uShift) * 2.1);
      float flow = 0.45 + 0.55 * sin(vUv.x * 8.0 - uTime * 0.45 + vUv.y * 2.2 + uShift);
      float alpha = edgeX * edgeY * (0.35 + 0.65 * rays) * flow * 0.62;

      vec3 green = vec3(0.18, 0.96, 0.66);
      vec3 cyan = vec3(0.22, 0.88, 1.0);
      vec3 violet = vec3(0.64, 0.28, 0.96);
      vec3 col = mix(green, cyan, smoothstep(0.18, 0.62, vUv.y));
      col = mix(col, violet, smoothstep(0.55, 0.96, vUv.y));
      gl_FragColor = vec4(col, alpha);
    }
  `

  return (
    <group position={[0.02, 0.88, THIN_T / 2 + 0.72]}>
      <mesh geometry={geoA}>
        <shaderMaterial
          ref={matARef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          uniforms={uniA}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
        />
      </mesh>
      <mesh geometry={geoB} position={[0.16, 0.14, 0.08]}>
        <shaderMaterial
          ref={matBRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          uniforms={uniB}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
        />
      </mesh>
    </group>
  )
}

/* ---------------- 5. 动态飘落雪花粒子 ---------------- */

function FallingSnowflakes({ quality }: { quality: Quality }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = quality === 'low' ? 65 : quality === 'medium' ? 105 : 145
  const particles = useMemo(() => {
    const rnd = mulberry32(31907)
    return Array.from({ length: count }, () => ({
      x: (rnd() - 0.5) * (SNOW_CARD_W - 0.16),
      y: (rnd() - 0.5) * (SNOW_CARD_H - 0.16),
      phase: rnd(),
      speed: 0.14 + rnd() * 0.12,
      sway: 0.04 + rnd() * 0.05,
      s: 0.6 + rnd() * 0.8,
    }))
  }, [count])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      const progress = (p.phase + t * p.speed) % 1
      const z = 0.68 - progress * 0.58
      const px = p.x + Math.sin(t * 1.6 + p.phase * 10) * p.sway
      const py = p.y + Math.cos(t * 1.2 + p.phase * 8) * p.sway
      dummy.position.set(px, py, z)
      dummy.scale.setScalar(p.s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.011, 6, 6]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
    </instancedMesh>
  )
}

/* ---------------- 6. 高对比度深松青雪地拼字 & 背面完整冬蓝二维码 ---------------- */

function sampleSnowText(text: string, maxPoints: number, seed: number): [number, number][] {
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

function SnowFieldName({
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
  const dotTex = useMemo(() => makeFlowerSpriteTexture(), [])
  useEffect(() => () => dotTex.dispose(), [dotTex])

  const maxPts = quality === 'low' ? 680 : quality === 'medium' ? 1150 : 1650
  const pts = useMemo(() => sampleSnowText(text, maxPts, seed), [text, maxPts, seed])

  const theme = resolveSceneTheme(spec)
  const isAurora = theme.mood.id === 'snow_aurora'
  const useCustom = side === 1 && !!theme.customTextColor
  const useBright = useCustom ? theme.isDark : isAurora

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const rnd = mulberry32(seed + 53)
    let paletteHex: [string, string, string, string] = ['#1a4354', '#255a7a', '#265947', '#38748f']
    if (useCustom && theme.customTextColor) {
      paletteHex = makeHexVariants(theme.customTextColor)
    } else if (isAurora) {
      paletteHex = ['#a8ffea', '#56f2c8', '#7dd3fc', '#e8fbff']
    }
    const colors = paletteHex.map((h) => new THREE.Color(h))
    const cosR = Math.cos(rotZ)
    const sinR = Math.sin(rotZ)

    pts.forEach((pt, i) => {
      const lx0 = (pt[0] - 0.5) * box.w
      const ly0 = (pt[1] - 0.5) * box.h
      const x = box.cx + lx0 * cosR - ly0 * sinR
      const y = box.cy + lx0 * sinR + ly0 * cosR
      const z = snowSurfaceZ(x, y, spec, side)
      dummy.position.set(x, y, THIN_T / 2 + z + 0.025 + rnd() * 0.008)
      dummy.rotation.set(0, 0, rnd() * Math.PI * 2)
      dummy.scale.setScalar(0.68 + rnd() * 0.52)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      const pick = rnd() < 0.65 ? (rnd() < 0.55 ? 0 : 1) : rnd() < 0.8 ? 2 : 3
      mesh.setColorAt(i, colors[pick])
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pts, seed, spec, side, box, rotZ, useCustom, theme.customTextColor, isAurora])

  if (pts.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <planeGeometry args={[0.03, 0.03]} />
      <meshStandardMaterial
        map={dotTex}
        emissive={useBright ? theme.customTextColor || '#64f5d2' : '#000000'}
        emissiveMap={dotTex}
        emissiveIntensity={useBright ? 0.48 : 0}
        alphaTest={0.28}
        roughness={0.75}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}

function SnowQrMatrix({ text, spec }: { text: string; spec: SceneSpec }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dotTex = useMemo(() => makeFlowerSpriteTexture(), [])
  useEffect(() => () => dotTex.dispose(), [dotTex])
  const isAurora = resolveSceneTheme(spec).mood.id === 'snow_aurora'

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
    const rnd = mulberry32(6241)
    const cA = new THREE.Color(isAurora ? '#9bfae2' : '#173f54')
    const cB = new THREE.Color(isAurora ? '#5eead4' : '#21536e')

    pts.forEach((p, i) => {
      const x = -1.04 + (p[0] - 0.5) * 0.82
      const y = -0.46 + (p[1] - 0.5) * 0.82
      const z = snowSurfaceZ(x, y, spec, -1)
      dummy.position.set(x, y, THIN_T / 2 + z + 0.02)
      dummy.rotation.set(0, 0, rnd() * Math.PI * 2)
      dummy.scale.setScalar(modSize * 1.38)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, rnd() < 0.72 ? cA : cB)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pts, modSize, spec, isAurora])

  if (pts.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        map={dotTex}
        emissive={isAurora ? '#64f5d2' : '#000000'}
        emissiveMap={dotTex}
        emissiveIntensity={isAurora ? 0.45 : 0}
        alphaTest={0.28}
        roughness={0.78}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}

/* ---------------- 雪山木屋双面总装 ---------------- */

export function SnowCabinDioramaCard({
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
  const isAurora = resolveSceneTheme(spec).mood.id === 'snow_aurora'

  return (
    <group>
      {/* 极薄冷岩灰底芯 */}
      <mesh>
        <boxGeometry args={[SNOW_CARD_W, SNOW_CARD_H, THIN_T]} />
        <meshStandardMaterial color="#465668" roughness={0.9} />
      </mesh>

      {/* 正面（+Z）：阿尔卑斯原木小屋 + 覆雪冷杉 + 冬日冰湖 + 飘落雪花 */}
      <group>
        <SnowTerrain side={1} spec={spec} quality={quality} onSculpt={onSculpt} />
        <AlpineWoodCabin side={1} spec={spec} />
        <SnowySpruceTrees side={1} spec={spec} quality={quality} />
        <FrozenLake spec={spec} />
        <FallingSnowflakes quality={quality} />
        {isAurora && <AuroraCurtain />}
        <SnowFieldName
          side={1}
          text={profile.name || 'Zilin'}
          spec={spec}
          quality={quality}
          box={{ cx: -0.62, cy: -0.58, w: 1.44, h: 0.42 }}
          seed={605}
        />
        <MbtiStandee
          mbti={profile.mbti}
          avatarUrl={profile.avatarUrl}
          avatarFrame={profile.avatarFrame}
          name={profile.name}
          greeting={profile.greeting}
          position={[-0.2, 0.04, THIN_T / 2 + snowSurfaceZ(-0.2, 0.04, spec, 1) + 0.04]}
          scale={1.06}
          rotZ={0.3}
        />
        <MicroAccessory
          accessory={profile.accessory}
          greeting={profile.greeting}
          position={[0.42, -0.56, THIN_T / 2 + snowSurfaceZ(0.42, -0.56, spec, 1) + 0.025]}
          scale={1.0}
          rotZ={-0.25}
        />
      </group>

      {/* 背面（绕 X 轴翻转 180°）：镜像雪山木屋 + 深冬青点阵二维码 + 斜排职位字 */}
      <group rotation={[Math.PI, 0, 0]}>
        <SnowTerrain side={-1} spec={spec} quality={quality} />
        <AlpineWoodCabin side={-1} spec={spec} />
        <SnowySpruceTrees side={-1} spec={spec} quality={quality} />
        <SnowQrMatrix text={qrText} spec={spec} />
        <SnowFieldName
          side={-1}
          text={profile.title || profile.name || 'Zilin'}
          spec={spec}
          quality={quality}
          box={{ cx: 0.36, cy: -0.26, w: 1.48, h: 0.36 }}
          seed={606}
          rotZ={0.26}
        />
      </group>
    </group>
  )
}
