import * as THREE from 'three'
import type { SceneSpec } from '../contracts/scene-spec'

export interface CardProfile {
  name: string
  title: string
  bio?: string
  mbti?: string
  accessory?: string
  links?: { type: string; label: string; url: string }[]
}

export const CARD_ASPECT = 1.586 // 接近实体名片长宽比（FR-1）

function fontStack(size: number, weight = 400) {
  return `${weight} ${size}px "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif`
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amt))
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt))
  const b = Math.min(255, Math.max(0, (n & 255) + amt))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** 名片正面：姓名、职位、主题标识（FR-3） */
export function makeFrontTexture(profile: CardProfile, spec: SceneSpec): THREE.CanvasTexture {
  const W = 1024
  const H = Math.round(W / CARD_ASPECT)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, spec.palette.primary)
  grad.addColorStop(1, shade(spec.palette.primary, 28))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // 主题色装饰条
  ctx.fillStyle = spec.palette.accent
  ctx.fillRect(0, H - 14, W, 14)
  ctx.globalAlpha = 0.25
  ctx.fillStyle = spec.palette.secondary
  ctx.fillRect(W * 0.62, 0, W * 0.38, H)
  ctx.globalAlpha = 1

  // 简约“山形”主题标识（由调色板生成的抽象图形）
  ctx.strokeStyle = spec.palette.accent
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(W * 0.66, H * 0.62)
  ctx.lineTo(W * 0.74, H * 0.34)
  ctx.lineTo(W * 0.8, H * 0.5)
  ctx.lineTo(W * 0.87, H * 0.26)
  ctx.lineTo(W * 0.95, H * 0.62)
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'alphabetic'
  const name = profile.name || '姓名'
  ctx.font = fontStack(Math.min(120, 520 / Math.max(3, name.length)), 700)
  ctx.fillText(name, 64, H * 0.52)

  ctx.fillStyle = shade(spec.palette.accent, 40)
  ctx.font = fontStack(44, 400)
  ctx.fillText(profile.title || '职位', 66, H * 0.52 + 74)

  return new THREE.CanvasTexture(canvas)
}

/** 名片背面：简介与社交链接入口（FR-4） */
export function makeBackTexture(profile: CardProfile, spec: SceneSpec): THREE.CanvasTexture {
  const W = 1024
  const H = Math.round(W / CARD_ASPECT)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, shade(spec.palette.surface, 14))
  grad.addColorStop(1, shade(spec.palette.surface, -26))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = spec.palette.primary
  ctx.fillRect(0, 0, W, 10)
  ctx.fillRect(0, H - 10, W, 10)

  ctx.fillStyle = shade(spec.palette.primary, -40)
  ctx.font = fontStack(40, 700)
  ctx.fillText('关于我', 64, 110)

  const bio = (profile.bio || '').slice(0, 90)
  ctx.font = fontStack(34)
  ctx.fillStyle = shade(spec.palette.primary, -20)
  wrapText(ctx, bio || '这个人很懒，还没有写简介。', 64, 170, W - 128, 52)

  ctx.font = fontStack(36, 700)
  ctx.fillStyle = shade(spec.palette.primary, -40)
  ctx.fillText('联系我', 64, H * 0.55)

  const links = (profile.links ?? []).slice(0, 4)
  ctx.font = fontStack(34)
  let y = H * 0.55 + 60
  if (links.length === 0) {
    ctx.fillStyle = shade(spec.palette.primary, -10)
    ctx.fillText('拖动名片，探索我的世界', 64, y)
  } else {
    for (const link of links) {
      ctx.fillStyle = spec.palette.primary
      ctx.beginPath()
      ctx.arc(78, y - 11, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = shade(spec.palette.primary, -20)
      ctx.fillText(`${link.label}`, 104, y)
      y += 64
    }
  }
  ctx.font = fontStack(28)
  ctx.fillStyle = shade(spec.palette.primary, -60)
  ctx.fillText('拖动查看世界 · 轻点链接复制', 64, H - 52)

  return new THREE.CanvasTexture(canvas)
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  let line = ''
  let cy = y
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, x, cy)
      line = ch
      cy += lineH
    } else {
      line += ch
    }
  }
  if (line) ctx.fillText(line, x, cy)
}
