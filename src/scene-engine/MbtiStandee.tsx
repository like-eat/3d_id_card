import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { getMbtiInfo, getMbtiQuote } from '../contracts/mbti'
import { playEasterEggSfx } from '../lib/sound'
import { isTapEvent, setPointerCursor, SpeechBubble3D, useEasterEggGuide } from './SpeechBubble3D'

function isSafeAvatarSrc(src?: string): src is string {
  if (!src) return false
  const s = src.trim()
  return (
    s.startsWith('data:image/png;base64,') ||
    s.startsWith('data:image/jpeg;base64,') ||
    s.startsWith('data:image/webp;base64,') ||
    s.startsWith('/') ||
    /^https:\/\//i.test(s)
  )
}

/** 安全加载自定义头像/照片 DataURL 为 CanvasTexture（避免 Suspense 重挂闪烁） */
function useAvatarTexture(src?: string): THREE.CanvasTexture | null {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    if (!isSafeAvatarSrc(src)) {
      setTex(null)
      return
    }
    let disposed = false
    let created: THREE.CanvasTexture | null = null
    const img = new Image()
    if (/^https:\/\//i.test(src)) img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (disposed) return
      const s = 256
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = s
      const ctx = canvas.getContext('2d')!
      const side = Math.min(img.width, img.height)
      const sx = Math.max(0, (img.width - side) / 2)
      const sy = Math.max(0, (img.height - side) / 2)
      ctx.drawImage(img, sx, sy, side, side, 0, 0, s, s)
      created = new THREE.CanvasTexture(canvas)
      created.colorSpace = THREE.SRGBColorSpace
      setTex(created)
    }
    img.onerror = () => {
      if (!disposed) setTex(null)
    }
    img.src = src

    return () => {
      disposed = true
      if (created) created.dispose()
    }
  }, [src])

  return tex
}

/** 生成底座前方清晰精致的微缩铭牌纹理（支持 MBTI 字母或中文姓名） */
function makeStandeeBadgeTexture(label: string, color: string): THREE.CanvasTexture {
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

  const txt = (label || '3D').slice(0, 8)
  let fontSize = 48
  ctx.font = `800 ${fontSize}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
  while (ctx.measureText(txt).width > w - 38 && fontSize > 24) {
    fontSize -= 3
    ctx.font = `800 ${fontSize}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
  }
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(txt, w / 2, h / 2 + 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 拍立得下白边手写小签名纹理 */
function makePolaroidCaptionTexture(label: string): THREE.CanvasTexture {
  const w = 256
  const h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#faf7f2'
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#362f2d'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const txt = (label || 'Memory').slice(0, 12)
  let size = 32
  const fontFamily = '"Segoe Script", "PingFang SC", "Microsoft YaHei", cursive'
  ctx.font = `700 ${size}px ${fontFamily}`
  while (ctx.measureText(txt).width > w - 24 && size > 18) {
    size -= 2
    ctx.font = `700 ${size}px ${fontFamily}`
  }
  ctx.fillText(txt, w / 2, h / 2 + 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function AvatarStandeeBody({
  avatarTex,
  frame,
  badgeColor,
  caption,
}: {
  avatarTex: THREE.CanvasTexture
  frame: 'circle' | 'polaroid'
  badgeColor: string
  caption: string
}) {
  const captionTex = useMemo(() => makePolaroidCaptionTexture(caption), [caption])
  useEffect(() => () => captionTex.dispose(), [captionTex])

  if (frame === 'polaroid') {
    return (
      <group position={[0, 0, 0.255]} rotation={[-0.14, 0, 0]}>
        {/* 复古白色厚拍立得卡片背板 */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.37, 0.022, 0.43]} />
          <meshStandardMaterial color="#faf7f2" roughness={0.62} />
        </mesh>
        {/* 彩色细金属边框装饰 */}
        <mesh position={[0, -0.0115, 0.028]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.326, 0.326]} />
          <meshBasicMaterial color={badgeColor} />
        </mesh>
        {/* 正面高清方形照片 */}
        <mesh position={[0, -0.0125, 0.028]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.312, 0.312]} />
          <meshStandardMaterial
            map={avatarTex}
            emissive="#ffffff"
            emissiveMap={avatarTex}
            emissiveIntensity={0.34}
            roughness={0.45}
          />
        </mesh>
        {/* 拍立得下白边手写签名 */}
        <mesh position={[0, -0.0122, -0.162]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.31, 0.072]} />
          <meshBasicMaterial map={captionTex} />
        </mesh>
      </group>
    )
  }

  // 默认：圆形金属徽章框
  return (
    <group>
      {/* 精致金属立柱 */}
      <mesh position={[0, 0, 0.052]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.03, 0.068, 14]} />
        <meshStandardMaterial color="#d8b97e" metalness={0.85} roughness={0.22} />
      </mesh>
      <group position={[0, 0, 0.258]}>
        {/* 香槟金立体圆环框（竖立朝向正面 -Y） */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.175, 0.017, 12, 36]} />
          <meshStandardMaterial color="#ebd094" metalness={0.86} roughness={0.22} />
        </mesh>
        {/* 金属内衬圆片（圆柱底面本身沿 +-Y 朝向正背面） */}
        <mesh>
          <cylinderGeometry args={[0.17, 0.17, 0.016, 32]} />
          <meshStandardMaterial color="#1e2733" metalness={0.6} roughness={0.35} />
        </mesh>
        {/* 正面圆形头像 */}
        <mesh position={[0, -0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.165, 32]} />
          <meshStandardMaterial
            map={avatarTex}
            emissive="#ffffff"
            emissiveMap={avatarTex}
            emissiveIntensity={0.38}
            roughness={0.42}
          />
        </mesh>
        {/* 背面圆形头像 */}
        <group position={[0, 0.01, 0]} rotation={[0, 0, Math.PI]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.165, 32]} />
            <meshStandardMaterial
              map={avatarTex}
              emissive="#ffffff"
              emissiveMap={avatarTex}
              emissiveIntensity={0.3}
              roughness={0.45}
            />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function MbtiCartoonBody({ avatar }: { avatar: string }) {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    let disposed = false
    let created: THREE.CanvasTexture | null = null
    const img = new Image()
    img.onload = () => {
      if (disposed) return
      const canvas = document.createElement('canvas')
      canvas.width = img.width || 256
      canvas.height = img.height || 256
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      created = new THREE.CanvasTexture(canvas)
      created.colorSpace = THREE.SRGBColorSpace
      setTex(created)
    }
    img.src = avatar
    return () => {
      disposed = true
      if (created) created.dispose()
    }
  }, [avatar])

  if (!tex) return null

  return (
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
  )
}

function StandeeInner({
  mbtiCode,
  mbtiAvatar,
  avatarTex,
  avatarFrame,
  badgeLabel,
  badgeColor,
  caption,
  bubbleText,
  introBubbleText,
  position,
  scale,
  rotZ,
}: {
  mbtiCode?: string
  mbtiAvatar?: string
  avatarTex: THREE.CanvasTexture | null
  avatarFrame: 'circle' | 'polaroid'
  badgeLabel: string
  badgeColor: string
  caption: string
  bubbleText: string
  introBubbleText: string
  position: [number, number, number]
  scale: number
  rotZ: number
}) {
  const badgeTex = useMemo(() => makeStandeeBadgeTexture(badgeLabel, badgeColor), [badgeLabel, badgeColor])
  useEffect(() => () => badgeTex.dispose(), [badgeTex])

  const { showGuide, markDiscovered } = useEasterEggGuide()
  const bodyRef = useRef<THREE.Group>(null)
  const tapClockRef = useRef<number | null>(null)
  const [tapTrigger, setTapTrigger] = useState(0)
  const [introTrigger, setIntroTrigger] = useState(0)

  useEffect(() => {
    if (!showGuide || tapTrigger > 0) return
    const timer = window.setTimeout(() => {
      setIntroTrigger((n) => (n === 0 ? 1 : n))
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [showGuide, tapTrigger])

  useFrame(({ clock }) => {
    const grp = bodyRef.current
    if (!grp) return
    if (tapClockRef.current === null && tapTrigger > 0) {
      tapClockRef.current = clock.elapsedTime
    }
    if (tapClockRef.current !== null) {
      const elapsed = clock.elapsedTime - tapClockRef.current
      if (elapsed < 0.85) {
        const p = elapsed / 0.85
        grp.position.z = Math.sin(p * Math.PI) * 0.14
        grp.rotation.z = Math.sin(p * Math.PI * 2) * 0.28 + p * Math.PI * 2
      } else {
        grp.position.z = 0
        grp.rotation.z = 0
        tapClockRef.current = null
      }
    }
  })

  return (
    <group position={position} rotation={[0, 0, rotZ]} scale={scale}>
      <group
        ref={bodyRef}
        onPointerOver={(e) => {
          e.stopPropagation()
          setPointerCursor(true)
        }}
        onPointerOut={() => setPointerCursor(false)}
        onClick={(e) => {
          if (!isTapEvent(e)) return
          tapClockRef.current = null
          setTapTrigger((n) => n + 1)
          markDiscovered('standee')
          playEasterEggSfx('standee')
        }}
      >
        {/* 微缩圆台底座 */}
        <mesh position={[0, 0, 0.014]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.145, 0.168, 0.028, 24]} />
          <meshStandardMaterial color="#1a222c" metalness={0.65} roughness={0.35} />
        </mesh>
        {/* 主题色光环 */}
        <mesh position={[0, 0, 0.03]}>
          <ringGeometry args={[0.122, 0.144, 28]} />
          <meshBasicMaterial color={badgeColor} side={THREE.DoubleSide} />
        </mesh>

        {/* 优先显示自定义照片立牌；未上传时回退到 MBTI 卡通立牌 */}
        {avatarTex ? (
          <AvatarStandeeBody
            avatarTex={avatarTex}
            frame={avatarFrame}
            badgeColor={badgeColor}
            caption={caption}
          />
        ) : mbtiAvatar ? (
          <MbtiCartoonBody avatar={mbtiAvatar} />
        ) : null}

        {/* 底座前侧微倾铭牌 */}
        <mesh position={[0, -0.185, 0.068]} rotation={[Math.PI * 0.3, 0, 0]}>
          <planeGeometry args={[0.25, 0.095]} />
          <meshBasicMaterial map={badgeTex} transparent side={THREE.DoubleSide} />
        </mesh>
      </group>

      <SpeechBubble3D
        text={tapTrigger > 0 ? bubbleText : introBubbleText}
        accent={badgeColor}
        triggerId={tapTrigger > 0 ? tapTrigger : introTrigger}
        duration={tapTrigger > 0 ? 2.6 : 4.2}
        position={[0, 0, 0.68]}
        scale={0.95}
      />
    </group>
  )
}

/** 3D 名片上的自定义照片立牌 / MBTI 卡通形象微缩立牌（均无设置时不渲染） */
export function MbtiStandee({
  mbti,
  avatarUrl,
  avatarFrame = 'circle',
  name,
  greeting,
  position,
  scale = 1,
  rotZ = 0,
}: {
  mbti?: string
  avatarUrl?: string
  avatarFrame?: 'circle' | 'polaroid'
  name?: string
  greeting?: string
  position: [number, number, number]
  scale?: number
  rotZ?: number
}) {
  const info = getMbtiInfo(mbti)
  const avatarTex = useAvatarTexture(avatarUrl)
  const hasAvatar = isSafeAvatarSrc(avatarUrl) && !!avatarTex

  if (!info && !hasAvatar) return null

  const badgeLabel = info ? info.code : (name || 'HELLO').trim().slice(0, 6)
  const badgeColor = info ? info.color : '#e2a856'
  const caption = (name || info?.code || 'Memory').trim()
  const bubbleText = greeting?.trim()
    ? greeting.trim()
    : info
      ? getMbtiQuote(info.code)
      : `👋 你好，我是 ${name || '创作者'}`

  const introBubbleText = greeting?.trim() || '👋 嗨！点点场景里的风景或小宠物看看 ✨'

  return (
    <StandeeInner
      mbtiCode={info?.code}
      mbtiAvatar={info?.avatar}
      avatarTex={avatarTex}
      avatarFrame={avatarFrame}
      badgeLabel={badgeLabel}
      badgeColor={badgeColor}
      caption={caption}
      bubbleText={bubbleText}
      introBubbleText={introBubbleText}
      position={position}
      scale={scale}
      rotZ={rotZ}
    />
  )
}
