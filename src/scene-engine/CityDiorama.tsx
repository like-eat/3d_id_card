import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import QRCode from 'qrcode'
import type { SceneSpec } from '../contracts/scene-spec'
import type { CardProfile } from './cardTexture'
import { MbtiStandee } from './MbtiStandee'
import { MicroAccessory } from './MicroAccessory'
import {
  makeCircuitBoardTextures,
  makeLightDotTexture,
  makeTechTowerTextures,
  mulberry32,
} from './proceduralTextures'

export const CITY_CARD_W = 3.2
export const CITY_CARD_H = CITY_CARD_W / 1.586
const THIN_T = 0.022

type Quality = 'low' | 'medium' | 'high'

/* ---------------- 1. 蚀刻硅晶圆 / 精密电路底板 ---------------- */

function CircuitWaferFace({
  side,
  onSculpt,
}: {
  side: 1 | -1
  onSculpt?: (x: number, y: number) => void
}) {
  const pcb = useMemo(() => makeCircuitBoardTextures(), [])
  useEffect(() => {
    return () => {
      pcb.map.dispose()
      pcb.emissiveMap.dispose()
      pcb.roughnessMap.dispose()
    }
  }, [pcb])

  return (
    <mesh
      position={[0, 0, THIN_T / 2 + 0.002]}
      receiveShadow
      onClick={
        side === 1 && onSculpt
          ? (e) => {
              e.stopPropagation()
              const nx = THREE.MathUtils.clamp(e.point.x / (CITY_CARD_W / 2), -1, 1)
              const ny = THREE.MathUtils.clamp(-e.point.z / (CITY_CARD_H / 2), -1, 1)
              onSculpt(nx, ny)
            }
          : undefined
      }
    >
      <planeGeometry args={[CITY_CARD_W, CITY_CARD_H]} />
      <meshStandardMaterial
        map={pcb.map}
        emissive={new THREE.Color('#38e8ff')}
        emissiveMap={pcb.emissiveMap}
        emissiveIntensity={1.25}
        roughnessMap={pcb.roughnessMap}
        roughness={0.62}
        metalness={0.55}
      />
    </mesh>
  )
}

/* ---------------- 2. 悬浮量子核芯 + 多重全息陀螺仪星环 ---------------- */

function QuantumCoreAssembly({
  position,
  scale = 1,
}: {
  position: [number, number, number]
  scale?: number
}) {
  const coreRef = useRef<THREE.Mesh>(null)
  const ring1Ref = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)
  const ring3Ref = useRef<THREE.Mesh>(null)
  const particlesRef = useRef<THREE.InstancedMesh>(null)

  const particles = useMemo(() => {
    const rnd = mulberry32(70701)
    return Array.from({ length: 28 }, () => ({
      ang: rnd() * Math.PI * 2,
      rad: 0.24 + rnd() * 0.22,
      z: 0.16 + rnd() * 0.48,
      speed: 0.35 + rnd() * 0.55,
      s: 0.009 + rnd() * 0.012,
    }))
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (coreRef.current) {
      coreRef.current.rotation.z = t * 0.85
      coreRef.current.rotation.x = t * 0.55
      coreRef.current.position.z = 0.42 + Math.sin(t * 2.1) * 0.025
    }
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = Math.PI * 0.36 + Math.sin(t * 0.7) * 0.15
      ring1Ref.current.rotation.y = t * 0.65
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = -Math.PI * 0.28
      ring2Ref.current.rotation.y = -t * 0.5
      ring2Ref.current.rotation.z = t * 0.3
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.z = t * 0.45
    }
    if (particlesRef.current) {
      particles.forEach((p, i) => {
        const a = p.ang + t * p.speed
        dummy.position.set(Math.cos(a) * p.rad, Math.sin(a) * p.rad, p.z + Math.sin(t * 1.8 + i) * 0.02)
        dummy.scale.setScalar(p.s)
        dummy.updateMatrix()
        particlesRef.current!.setMatrixAt(i, dummy.matrix)
      })
      particlesRef.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group position={position} scale={scale}>
      {/* 阶梯阳极氧化钛金属反应基座 */}
      <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.39, 0.05, 24]} />
        <meshStandardMaterial color="#182234" metalness={0.85} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.29, 0.04, 24]} />
        <meshStandardMaterial color="#23314a" metalness={0.88} roughness={0.22} />
      </mesh>
      {/* 底座能量槽光环 */}
      <mesh position={[0, 0, 0.082]}>
        <ringGeometry args={[0.17, 0.22, 32]} />
        <meshBasicMaterial color="#38f2ff" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.052]}>
        <ringGeometry args={[0.31, 0.335, 32]} />
        <meshBasicMaterial color="#60a5fa" side={THREE.DoubleSide} />
      </mesh>

      {/* 底座向上投射的极轻盈全息光锥 */}
      <mesh position={[0, 0, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.26, 0.14, 0.32, 24, 1, true]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.11}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 悬浮自转量子晶体核心 */}
      <mesh ref={coreRef} position={[0, 0, 0.42]}>
        <octahedronGeometry args={[0.125, 0]} />
        <meshStandardMaterial
          color="#bae6fd"
          emissive="#22d3ee"
          emissiveIntensity={1.6}
          metalness={0.35}
          roughness={0.12}
        />
      </mesh>

      {/* 三重反向旋转陀螺仪全息星环 */}
      <mesh ref={ring1Ref} position={[0, 0, 0.42]}>
        <torusGeometry args={[0.24, 0.0085, 12, 48]} />
        <meshStandardMaterial
          color="#7dd3fc"
          emissive="#22d3ee"
          emissiveIntensity={1.4}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      <mesh ref={ring2Ref} position={[0, 0, 0.42]}>
        <torusGeometry args={[0.31, 0.0065, 10, 56]} />
        <meshStandardMaterial
          color="#c4b5fd"
          emissive="#818cf8"
          emissiveIntensity={1.35}
          metalness={0.85}
          roughness={0.2}
        />
      </mesh>
      <mesh ref={ring3Ref} position={[0, 0, 0.42]}>
        <torusGeometry args={[0.38, 0.0045, 8, 64]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.65} />
      </mesh>

      {/* 环绕悬浮全息数据微粒 */}
      <instancedMesh ref={particlesRef} args={[undefined, undefined, particles.length]}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#a5f3fc" />
      </instancedMesh>

      {/* 核心散发出的冰蓝环境光，照亮周围电路与金属模块 */}
      <pointLight position={[0, 0, 0.44]} intensity={2.2} distance={2.8} color="#38e8ff" />
    </group>
  )
}

/* ---------------- 3. 量子服务器矩阵 + 光纤能量柱 + 微型贴片芯片 ---------------- */

function QuantumModules({ side, spec }: { side: 1 | -1; spec: SceneSpec }) {
  const towerTexA = useMemo(() => makeTechTowerTextures(side === 1 ? 2077 : 2088), [side])
  const towerTexB = useMemo(() => makeTechTowerTextures(side === 1 ? 3099 : 3111), [side])

  useEffect(() => {
    return () => {
      towerTexA.map.dispose()
      towerTexA.emissiveMap.dispose()
      towerTexA.roughnessMap.dispose()
      towerTexB.map.dispose()
      towerTexB.emissiveMap.dispose()
      towerTexB.roughnessMap.dispose()
    }
  }, [towerTexA, towerTexB])

  const capMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1b2638', metalness: 0.85, roughness: 0.28 }),
    [],
  )
  const sideMatA = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: towerTexA.map,
        emissive: new THREE.Color('#38e8ff'),
        emissiveMap: towerTexA.emissiveMap,
        emissiveIntensity: 1.5,
        roughnessMap: towerTexA.roughnessMap,
        roughness: 0.42,
        metalness: 0.72,
      }),
    [towerTexA],
  )
  const sideMatB = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: towerTexB.map,
        emissive: new THREE.Color('#818cf8'),
        emissiveMap: towerTexB.emissiveMap,
        emissiveIntensity: 1.4,
        roughnessMap: towerTexB.roughnessMap,
        roughness: 0.42,
        metalness: 0.75,
      }),
    [towerTexB],
  )

  const matsA = useMemo(() => [sideMatA, sideMatA, sideMatA, sideMatA, capMat, capMat], [sideMatA, capMat])
  const matsB = useMemo(() => [sideMatB, sideMatB, sideMatB, sideMatB, capMat, capMat], [sideMatB, capMat])

  const density = spec.environment.foliage.density

  const { servers, pillars, chips } = useMemo(() => {
    const rnd = mulberry32(side === 1 ? 42077 : 52077)
    const countScale = density === 'low' ? 0.65 : density === 'medium' ? 1 : 1.35

    // 精密量子计算服务器塔阵（围绕远侧与左侧，让开右上量子核心与左下名字/二维码区）
    const baseServers = [
      { x: -1.16, y: 0.56, w: 0.24, d: 0.22, h: 0.74, style: 0 as const, fin: true },
      { x: -0.84, y: 0.68, w: 0.28, d: 0.24, h: 0.96, style: 1 as const, fin: true },
      { x: -0.46, y: 0.64, w: 0.22, d: 0.2, h: 0.58, style: 0 as const, fin: false },
      { x: -0.1, y: 0.72, w: 0.26, d: 0.22, h: 0.84, style: 0 as const, fin: true },
      { x: -1.24, y: 0.16, w: 0.2, d: 0.24, h: 0.44, style: 1 as const, fin: false },
      { x: -0.88, y: 0.24, w: 0.22, d: 0.18, h: 0.52, style: 0 as const, fin: false },
      { x: 1.24, y: 0.68, w: 0.24, d: 0.22, h: 0.88, style: 1 as const, fin: true },
      { x: 1.28, y: 0.26, w: 0.2, d: 0.22, h: 0.56, style: 0 as const, fin: false },
      { x: 1.18, y: -0.34, w: 0.24, d: 0.22, h: 0.46, style: 0 as const, fin: false },
      { x: 0.84, y: -0.58, w: 0.22, d: 0.18, h: 0.34, style: 1 as const, fin: false },
      { x: -0.52, y: 0.26, w: 0.18, d: 0.18, h: 0.38, style: 1 as const, fin: false },
    ]
    const sCount = Math.max(6, Math.min(baseServers.length, Math.round(9 * countScale)))

    // 半透明玻璃光纤能量柱
    const basePillars = [
      { x: -0.22, y: 0.28, h: 0.48, color: '#22d3ee' },
      { x: -0.02, y: 0.12, h: 0.34, color: '#818cf8' },
      { x: 1.02, y: 0.48, h: 0.52, color: '#38bdf8' },
      { x: 1.06, y: -0.04, h: 0.36, color: '#22d3ee' },
      { x: -0.68, y: -0.06, h: 0.32, color: '#67e8f9' },
      { x: 0.46, y: -0.44, h: 0.3, color: '#818cf8' },
    ]
    const pCount = Math.max(3, Math.min(basePillars.length, Math.round(5 * countScale)))

    // 微型硅芯片贴片阵列
    const chipList: { x: number; y: number; w: number; d: number; h: number }[] = []
    for (let i = 0; i < 16; i++) {
      const x = (rnd() - 0.5) * (CITY_CARD_W - 0.45)
      const y = (rnd() - 0.5) * (CITY_CARD_H - 0.35)
      if (Math.hypot(x - 0.56, y - 0.16) < 0.52) continue
      if (x < 0.25 && y < -0.25) continue
      chipList.push({
        x,
        y,
        w: 0.08 + rnd() * 0.1,
        d: 0.08 + rnd() * 0.1,
        h: 0.03 + rnd() * 0.045,
      })
    }

    return {
      servers: baseServers.slice(0, sCount),
      pillars: basePillars.slice(0, pCount),
      chips: chipList,
    }
  }, [side, density])

  const zBase = THIN_T / 2 + 0.004

  return (
    <group>
      {/* 量子计算服务器塔阵 */}
      {servers.map((s, i) => (
        <group key={i} position={[s.x, s.y, zBase]}>
          <mesh position={[0, 0, s.h / 2]} material={s.style === 0 ? matsA : matsB} castShadow receiveShadow>
            <boxGeometry args={[s.w, s.d, s.h]} />
          </mesh>
          {/* 顶部精密金属散热盖板与微光环 */}
          <mesh position={[0, 0, s.h + 0.016]}>
            <boxGeometry args={[s.w * 0.72, s.d * 0.72, 0.032]} />
            <meshStandardMaterial color="#25334a" metalness={0.88} roughness={0.22} />
          </mesh>
          {s.fin && (
            <group position={[0, 0, s.h + 0.032]}>
              <mesh position={[0, 0, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.004, 0.008, 0.18, 6]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh position={[0, 0, 0.19]}>
                <sphereGeometry args={[0.014, 8, 8]} />
                <meshBasicMaterial color="#38f2ff" />
              </mesh>
            </group>
          )}
        </group>
      ))}

      {/* 光纤能量柱 */}
      {pillars.map((p, i) => (
        <group key={i} position={[p.x, p.y, zBase]}>
          {/* 金属底座 */}
          <mesh position={[0, 0, 0.015]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.068, 0.03, 12]} />
            <meshStandardMaterial color="#1f2d42" metalness={0.88} roughness={0.25} />
          </mesh>
          {/* 内部发光纤芯 */}
          <mesh position={[0, 0, p.h / 2 + 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.014, 0.014, p.h, 10]} />
            <meshBasicMaterial color={p.color} />
          </mesh>
          {/* 外部半透明石英玻璃套管 */}
          <mesh position={[0, 0, p.h / 2 + 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.038, 0.038, p.h, 14]} />
            <meshStandardMaterial
              color="#bae6fd"
              transparent
              opacity={0.26}
              metalness={0.2}
              roughness={0.08}
              depthWrite={false}
            />
          </mesh>
          {/* 顶盖 */}
          <mesh position={[0, 0, p.h + 0.025]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.044, 0.044, 0.018, 12]} />
            <meshStandardMaterial color="#2a3a54" metalness={0.9} roughness={0.2} />
          </mesh>
        </group>
      ))}

      {/* 微型硅芯片贴片 */}
      {chips.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, zBase + c.h / 2]} castShadow receiveShadow>
          <boxGeometry args={[c.w, c.d, c.h]} />
          <meshStandardMaterial color="#162033" metalness={0.82} roughness={0.32} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- 4. 沿电路总线高速穿梭的数据光脉冲 ---------------- */

function DataBusPulses({ side }: { side: 1 | -1 }) {
  const p1 = useRef<THREE.Mesh>(null)
  const p2 = useRef<THREE.Mesh>(null)
  const p3 = useRef<THREE.Mesh>(null)
  const p4 = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + (side === -1 ? 1.7 : 0)
    if (p1.current) p1.current.position.x = -1.48 + ((t * 0.95) % 2.96)
    if (p2.current) p2.current.position.x = 1.48 - ((t * 0.8 + 1.1) % 2.96)
    if (p3.current) p3.current.position.y = -0.92 + ((t * 0.72 + 0.5) % 1.84)
    if (p4.current) p4.current.position.x = -1.48 + ((t * 0.65 + 2.2) % 2.96)
  })

  const z = THIN_T / 2 + 0.014

  return (
    <group>
      <mesh ref={p1} position={[0, -0.14, z]}>
        <boxGeometry args={[0.14, 0.014, 0.008]} />
        <meshBasicMaterial color="#38f2ff" />
      </mesh>
      <mesh ref={p2} position={[0, 0.42, z]}>
        <boxGeometry args={[0.12, 0.014, 0.008]} />
        <meshBasicMaterial color="#a5f3fc" />
      </mesh>
      <mesh ref={p3} position={[-0.36, 0, z]}>
        <boxGeometry args={[0.014, 0.12, 0.008]} />
        <meshBasicMaterial color="#818cf8" />
      </mesh>
      <mesh ref={p4} position={[0, -0.24, z]}>
        <boxGeometry args={[0.1, 0.012, 0.008]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
    </group>
  )
}

/* ---------------- 5. 全息冰蓝微缩光点拼字 + 精细全息矩阵二维码 ---------------- */

function sampleTechText(text: string, maxPoints: number, seed: number): [number, number][] {
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

function HoloLightName({
  text,
  quality,
  box,
  seed,
  rotZ = 0,
}: {
  text: string
  quality: Quality
  box: { cx: number; cy: number; w: number; h: number }
  seed: number
  rotZ?: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dotTex = useMemo(() => makeLightDotTexture(), [])
  useEffect(() => () => dotTex.dispose(), [dotTex])

  const maxPts = quality === 'low' ? 680 : quality === 'medium' ? 1100 : 1550
  const pts = useMemo(() => sampleTechText(text, maxPts, seed), [text, maxPts, seed])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const rnd = mulberry32(seed + 41)
    const colors = [
      new THREE.Color('#e0faff'),
      new THREE.Color('#38e8ff'),
      new THREE.Color('#60a5fa'),
      new THREE.Color('#a78bfa'),
    ]
    const cosR = Math.cos(rotZ)
    const sinR = Math.sin(rotZ)

    pts.forEach((pt, i) => {
      const lx0 = (pt[0] - 0.5) * box.w
      const ly0 = (pt[1] - 0.5) * box.h
      const x = box.cx + lx0 * cosR - ly0 * sinR
      const y = box.cy + lx0 * sinR + ly0 * cosR
      dummy.position.set(x, y, THIN_T / 2 + 0.02 + rnd() * 0.008)
      dummy.rotation.set(0, 0, rnd() * Math.PI * 2)
      dummy.scale.setScalar(0.65 + rnd() * 0.55)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      const pick = rnd() < 0.5 ? 0 : rnd() < 0.8 ? 1 : rnd() < 0.92 ? 2 : 3
      mesh.setColorAt(i, colors[pick])
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pts, seed, box, rotZ])

  if (pts.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <planeGeometry args={[0.032, 0.032]} />
      <meshBasicMaterial map={dotTex} transparent alphaTest={0.18} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

function HoloQrMatrix({ text }: { text: string }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dotTex = useMemo(() => makeLightDotTexture(), [])
  useEffect(() => () => dotTex.dispose(), [dotTex])

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
    const rnd = mulberry32(9527)
    const cA = new THREE.Color('#cffafe')
    const cB = new THREE.Color('#38e8ff')

    pts.forEach((p, i) => {
      const x = -1.04 + (p[0] - 0.5) * 0.82
      const y = -0.48 + (p[1] - 0.5) * 0.82
      dummy.position.set(x, y, THIN_T / 2 + 0.016)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(modSize * 1.38)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, rnd() < 0.72 ? cA : cB)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pts, modSize])

  if (pts.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={dotTex} transparent alphaTest={0.2} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

/* ---------------- 未来科技双面总装 ---------------- */

export function CityDioramaCard({
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
      {/* 极薄钛黑硅晶圆底芯 */}
      <mesh>
        <boxGeometry args={[CITY_CARD_W, CITY_CARD_H, THIN_T]} />
        <meshStandardMaterial color="#0d1524" roughness={0.35} metalness={0.85} />
      </mesh>

      {/* 正面（+Z）：悬浮量子核芯 + 全息星环 + 量子服务器阵 + 光纤能量柱 + 全息冰蓝拼字 */}
      <group>
        <CircuitWaferFace side={1} onSculpt={onSculpt} />
        <QuantumCoreAssembly position={[0.56, 0.16, THIN_T / 2]} scale={1.08} />
        <QuantumModules side={1} spec={spec} />
        <DataBusPulses side={1} />
        <HoloLightName
          text={profile.name || 'Zilin'}
          quality={quality}
          box={{ cx: -0.58, cy: -0.56, w: 1.48, h: 0.44 }}
          seed={601}
        />
        <MbtiStandee
          mbti={profile.mbti}
          position={[0.28, -0.58, THIN_T / 2 + 0.005]}
          scale={1.08}
          rotZ={0.32}
        />
        <MicroAccessory
          accessory={profile.accessory}
          position={[0.92, -0.56, THIN_T / 2 + 0.006]}
          scale={1.0}
          rotZ={-0.28}
        />
      </group>

      {/* 背面（绕 X 轴翻转 180°）：镜像量子科技世界 + 精细全息矩阵二维码 + 斜排全息字 */}
      <group rotation={[Math.PI, 0, 0]}>
        <CircuitWaferFace side={-1} />
        <QuantumCoreAssembly position={[0.56, 0.16, THIN_T / 2]} scale={0.96} />
        <QuantumModules side={-1} spec={spec} />
        <DataBusPulses side={-1} />
        <HoloQrMatrix text={qrText} />
        <HoloLightName
          text={profile.title || profile.name || 'Zilin'}
          quality={quality}
          box={{ cx: 0.36, cy: -0.42, w: 1.48, h: 0.36 }}
          seed={602}
          rotZ={0.24}
        />
      </group>
    </group>
  )
}
