import { useFrame } from '@react-three/fiber'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'

interface GuideContextValue {
  showGuide: boolean
  discovered: ReadonlySet<string>
  markDiscovered: (key: string) => void
}

const EasterEggGuideContext = createContext<GuideContextValue>({
  showGuide: false,
  discovered: new Set<string>(),
  markDiscovered: () => {},
})

export function EasterEggGuideProvider({
  showGuide,
  children,
}: {
  showGuide: boolean
  children: ReactNode
}) {
  const [discovered, setDiscovered] = useState<Set<string>>(() => new Set())
  const markDiscovered = useCallback((key: string) => {
    setDiscovered((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

  const value = useMemo(() => ({ showGuide, discovered, markDiscovered }), [showGuide, discovered, markDiscovered])
  return <EasterEggGuideContext.Provider value={value}>{children}</EasterEggGuideContext.Provider>
}

export function useEasterEggGuide() {
  return useContext(EasterEggGuideContext)
}

function makeHotspotTexture(accent: string): THREE.CanvasTexture {
  const s = 128
  const canvas = document.createElement('canvas')
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2 - 4)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.28, accent)
  grad.addColorStop(0.65, `${accent}66`)
  grad.addColorStop(1, `${accent}00`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 可点击彩蛋呼吸引导光点（首次访问显示，点击对应物体后自动消失） */
export function InteractiveHotspot({
  position,
  accent = '#ffffff',
  guideKey,
}: {
  position: [number, number, number]
  accent?: string
  guideKey: string
}) {
  const { showGuide, discovered } = useEasterEggGuide()
  const spriteRef = useRef<THREE.Sprite>(null)
  const matRef = useRef<THREE.SpriteMaterial>(null)
  const tex = useMemo(() => makeHotspotTexture(accent), [accent])
  useEffect(() => () => tex.dispose(), [tex])

  const visible = showGuide && !discovered.has(guideKey)

  useFrame(({ clock }) => {
    if (!visible || !spriteRef.current || !matRef.current) return
    const pulse = (Math.sin(clock.elapsedTime * 3.4) + 1) * 0.5
    const s = 0.14 + pulse * 0.08
    spriteRef.current.scale.set(s, s, 1)
    matRef.current.opacity = 0.55 + pulse * 0.38
  })

  if (!visible) return null

  return (
    <sprite
      ref={spriteRef}
      position={position}
      renderOrder={15}
      raycast={() => null}
    >
      <spriteMaterial ref={matRef} map={tex} transparent depthWrite={false} depthTest={false} />
    </sprite>
  )
}

/** 过滤拖拽旋转时的误触，仅短按点击才算有效彩蛋点击 */
export function isTapEvent(e: { delta?: number; stopPropagation: () => void }): boolean {
  if ((e.delta ?? 0) > 6) return false
  e.stopPropagation()
  return true
}

export function setPointerCursor(on: boolean) {
  if (typeof document !== 'undefined') {
    document.body.style.cursor = on ? 'pointer' : 'auto'
  }
}

function makeBubbleTexture(text: string, accent: string): THREE.CanvasTexture {
  const w = 620
  const h = 152
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)

  const label = (text || '你好！').slice(0, 26)
  ctx.font = '700 30px "PingFang SC", "Microsoft YaHei", "Segoe UI Emoji", sans-serif'
  const measured = ctx.measureText(label).width
  const boxW = Math.min(w - 24, Math.max(200, measured + 60))
  const boxX = (w - boxW) / 2
  const boxY = 12
  const boxH = 104
  const r = 30

  // 柔和外投影
  ctx.save()
  ctx.shadowColor = 'rgba(10, 18, 28, 0.28)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 5
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.beginPath()
  ctx.roundRect(boxX, boxY, boxW, boxH, r)
  ctx.fill()
  ctx.restore()

  // 底部气泡小尖角
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.beginPath()
  ctx.moveTo(w / 2 - 14, boxY + boxH - 2)
  ctx.lineTo(w / 2, boxY + boxH + 18)
  ctx.lineTo(w / 2 + 14, boxY + boxH - 2)
  ctx.closePath()
  ctx.fill()

  // 主题色细描边
  ctx.strokeStyle = accent
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(boxX, boxY, boxW, boxH, r)
  ctx.stroke()

  // 气泡文字
  ctx.fillStyle = '#18222d'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, w / 2, boxY + boxH / 2 + 1, boxW - 36)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 3D 场景中的弹性悬浮中文对话气泡（永远正对镜头） */
export function SpeechBubble3D({
  text,
  accent = '#3b7a57',
  triggerId,
  position,
  scale = 1,
  duration = 2.6,
}: {
  text: string
  accent?: string
  triggerId: number
  position: [number, number, number]
  scale?: number
  duration?: number
}) {
  const spriteRef = useRef<THREE.Sprite>(null)
  const matRef = useRef<THREE.SpriteMaterial>(null)
  const startClockRef = useRef<number | null>(null)
  const lastTriggerRef = useRef(0)
  const tex = useMemo(() => makeBubbleTexture(text, accent), [text, accent])

  useEffect(() => () => tex.dispose(), [tex])

  useFrame(({ clock }) => {
    const sp = spriteRef.current
    const mat = matRef.current
    if (!sp || !mat) return

    if (triggerId > lastTriggerRef.current) {
      lastTriggerRef.current = triggerId
      startClockRef.current = clock.elapsedTime
    }

    if (startClockRef.current === null || triggerId === 0) {
      sp.visible = false
      return
    }

    const elapsed = clock.elapsedTime - startClockRef.current
    const total = duration
    if (elapsed > total) {
      sp.visible = false
      return
    }

    sp.visible = true
    let pop = 1
    if (elapsed < 0.2) {
      const p = elapsed / 0.2
      pop = 0.2 + 0.92 * Math.sin(p * Math.PI * 0.65)
    } else if (elapsed < 0.34) {
      pop = 1.0 + Math.sin(((elapsed - 0.2) / 0.14) * Math.PI) * 0.08
    }

    const fadeStart = Math.max(0.5, total - 0.45)
    const fade = elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / (total - fadeStart)) : 1
    mat.opacity = fade
    sp.position.set(position[0], position[1], position[2] + Math.min(0.08, elapsed * 0.05))
    sp.scale.set(1.22 * scale * pop, 0.31 * scale * pop, 1)
  })

  return (
    <sprite ref={spriteRef} visible={false} position={position} renderOrder={20}>
      <spriteMaterial ref={matRef} map={tex} transparent depthWrite={false} depthTest={false} />
    </sprite>
  )
}
