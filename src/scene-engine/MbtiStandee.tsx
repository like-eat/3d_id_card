import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { getMbtiInfo } from '../contracts/mbti'

/** 生成底座前方清晰精致的 4 字母 MBTI 微缩铭牌纹理 */
function makeMbtiBadgeTexture(code: string, color: string): THREE.CanvasTexture {
  const w = 256
  const h = 96
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#121822'
  ctx.beginPath()
  ctx.roundRect(6, 6, w - 12, h - 12, 22)
  ctx.fill()

  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.roundRect(8, 8, w - 16, h - 16, 20)
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.font = '800 50px "Segoe UI", "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(code, w / 2, h / 2 + 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function MbtiStandeeInner({
  code,
  color,
  avatar,
  position,
  scale,
  rotZ,
}: {
  code: string
  color: string
  avatar: string
  position: [number, number, number]
  scale: number
  rotZ: number
}) {
  const tex = useTexture(avatar)
  tex.colorSpace = THREE.SRGBColorSpace
  const badgeTex = useMemo(() => makeMbtiBadgeTexture(code, color), [code, color])
  useEffect(() => () => badgeTex.dispose(), [badgeTex])

  return (
    <group position={position} rotation={[0, 0, rotZ]} scale={scale}>
      {/* 微缩圆台底座 */}
      <mesh position={[0, 0, 0.014]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.145, 0.168, 0.028, 24]} />
        <meshStandardMaterial color="#1a222c" metalness={0.65} roughness={0.35} />
      </mesh>
      {/* 人格阵营主题色光环 */}
      <mesh position={[0, 0, 0.03]}>
        <ringGeometry args={[0.122, 0.144, 28]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
      {/* 竖立的透明底 MBTI 卡通形象立牌（微自发光保证暗色科技模板也清晰亮眼） */}
      <mesh position={[0, 0, 0.265]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <planeGeometry args={[0.45, 0.45]} />
        <meshStandardMaterial
          map={tex}
          emissive="#ffffff"
          emissiveMap={tex}
          emissiveIntensity={0.42}
          transparent
          alphaTest={0.25}
          roughness={0.65}
          metalness={0.04}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 底座前侧微倾 MBTI 字母铭牌（前移避免与底座环穿插） */}
      <mesh position={[0, -0.185, 0.068]} rotation={[Math.PI * 0.3, 0, 0]}>
        <planeGeometry args={[0.25, 0.095]} />
        <meshBasicMaterial map={badgeTex} transparent side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** 3D 名片上的 MBTI 卡通形象微缩立牌（未选择 MBTI 时不渲染） */
export function MbtiStandee({
  mbti,
  position,
  scale = 1,
  rotZ = 0,
}: {
  mbti?: string
  position: [number, number, number]
  scale?: number
  rotZ?: number
}) {
  const info = getMbtiInfo(mbti)
  if (!info) return null
  return (
    <MbtiStandeeInner
      code={info.code}
      color={info.color}
      avatar={info.avatar}
      position={position}
      scale={scale}
      rotZ={rotZ}
    />
  )
}
