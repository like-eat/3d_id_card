import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

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
  const w = 512
  const h = 152
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)

  const label = (text || '你好！').slice(0, 24)
  ctx.font = '700 32px "PingFang SC", "Microsoft YaHei", "Segoe UI Emoji", sans-serif'
  const measured = ctx.measureText(label).width
  const boxW = Math.min(w - 24, Math.max(190, measured + 58))
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
}: {
  text: string
  accent?: string
  triggerId: number
  position: [number, number, number]
  scale?: number
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
    const total = 2.6
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

    const fade = elapsed > 2.15 ? Math.max(0, 1 - (elapsed - 2.15) / (total - 2.15)) : 1
    mat.opacity = fade
    sp.position.set(position[0], position[1], position[2] + Math.min(0.08, elapsed * 0.05))
    sp.scale.set(1.02 * scale * pop, 0.31 * scale * pop, 1)
  })

  return (
    <sprite ref={spriteRef} visible={false} position={position} renderOrder={20}>
      <spriteMaterial ref={matRef} map={tex} transparent depthWrite={false} depthTest={false} />
    </sprite>
  )
}
