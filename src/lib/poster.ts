import type { SceneSpec } from '../contracts/scene-spec'
import { resolveSceneTheme } from '../contracts/moods'
import { getAccessoryInfo } from '../contracts/accessories'
import { getMbtiInfo } from '../contracts/mbti'
import type { CardProfile } from '../scene-engine/cardTexture'

interface PosterOptions {
  sourceCanvas: HTMLCanvasElement | null
  profile: CardProfile
  spec: SceneSpec
  qrDataUrl?: string | null
  isPreview?: boolean
}

interface PosterTheme {
  bg: string
  bgSubtle: string
  cardBg: string
  cardBorder: string
  titleColor: string
  subColor: string
  accent: string
  tag: string
  qrBoxBg: string
  qrText: string
  frameBg: string
  isDark: boolean
}

function shiftHex(hex: string, delta: number): string {
  const c = hex.replace('#', '')
  const n = parseInt(c, 16)
  if (c.length !== 6 || Number.isNaN(n)) return hex
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)))
  const r = clamp(((n >> 16) & 255) + delta)
  const g = clamp(((n >> 8) & 255) + delta)
  const b = clamp((n & 255) + delta)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function themeForScene(spec: SceneSpec): PosterTheme {
  const { mood, bgColor, isDark, accent } = resolveSceneTheme(spec)
  if (isDark) {
    return {
      bg: bgColor,
      bgSubtle: shiftHex(bgColor, 14),
      cardBg: '#0f172a',
      cardBorder: `${accent}48`,
      titleColor: '#f1f7ff',
      subColor: '#98aec6',
      accent,
      tag: mood.posterTag,
      qrBoxBg: '#162238',
      qrText: '#d4e9fc',
      frameBg: shiftHex(bgColor, 8),
      isDark: true,
    }
  }
  return {
    bg: bgColor,
    bgSubtle: shiftHex(bgColor, -14),
    cardBg: '#ffffff',
    cardBorder: 'rgba(28, 42, 50, 0.12)',
    titleColor: '#1e2f38',
    subColor: '#5a6d77',
    accent,
    tag: mood.posterTag,
    qrBoxBg: '#f6f9fb',
    qrText: '#2c4654',
    frameBg: shiftHex(bgColor, -8),
    isDark: false,
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line)
      line = ''
      if (lines.length >= maxLines) return lines
      continue
    }
    if (ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line)
      line = ch
      if (lines.length >= maxLines) {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + '…'
        return lines
      }
    } else {
      line += ch
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  return lines
}

/** 生成 1080×1620 竖版高清「炫耀海报」并返回 PNG DataURL */
export async function generateSharePoster(opts: PosterOptions): Promise<string> {
  const W = 1080
  const H = 1620
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const theme = themeForScene(opts.spec)

  // 1. 背景渐变
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H)
  bgGrad.addColorStop(0, theme.bg)
  bgGrad.addColorStop(1, theme.bgSubtle)
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, W, H)

  // 2. 顶部主题标签与品牌字样
  ctx.fillStyle = theme.accent
  ctx.font = '700 24px "Segoe UI", "PingFang SC", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(theme.tag, 64, 72)

  ctx.fillStyle = theme.subColor
  ctx.font = '500 24px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('3D 微缩数字名片', W - 64, 72)
  ctx.textAlign = 'left'

  // 3. 中部圆角展示窗 (960 × 760)
  const frameX = 60
  const frameY = 124
  const frameW = 960
  const frameH = 760

  ctx.save()
  ctx.shadowColor = theme.isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(30, 30, 35, 0.16)'
  ctx.shadowBlur = 42
  ctx.shadowOffsetY = 16
  ctx.fillStyle = theme.bg
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 36)
  ctx.fill()
  ctx.restore()

  ctx.save()
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 36)
  ctx.clip()

  if (opts.sourceCanvas && opts.sourceCanvas.width > 0 && opts.sourceCanvas.height > 0) {
    const sw = opts.sourceCanvas.width
    const sh = opts.sourceCanvas.height
    const scale = Math.min(frameW / sw, frameH / sh)
    const dw = sw * scale
    const dh = sh * scale
    const dx = frameX + (frameW - dw) / 2
    const dy = frameY + (frameH - dh) / 2
    ctx.drawImage(opts.sourceCanvas, dx, dy, dw, dh)
  }
  ctx.restore()

  // 展示窗细边框
  ctx.strokeStyle = theme.cardBorder
  ctx.lineWidth = 3
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 36)
  ctx.stroke()

  // 4. 下半部分信息卡片
  const cardX = 60
  const cardY = 924
  const cardW = 960
  const cardH = 580

  ctx.save()
  ctx.shadowColor = theme.isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(30, 30, 35, 0.1)'
  ctx.shadowBlur = 32
  ctx.shadowOffsetY = 12
  ctx.fillStyle = theme.cardBg
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 36)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = theme.cardBorder
  ctx.lineWidth = 2
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 36)
  ctx.stroke()

  // 左侧文字区域
  const infoX = cardX + 56
  const infoMaxW = 520
  let curY = cardY + 86

  const name = (opts.profile.name || '我的 3D 名片').slice(0, 18)
  const nameSize = name.length > 8 ? 50 : 62
  ctx.fillStyle = theme.titleColor
  ctx.font = `800 ${nameSize}px "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(name, infoX, curY, infoMaxW)
  curY += 54

  const title = (opts.profile.title || '3D 数字名片创作者').slice(0, 28)
  ctx.fillStyle = theme.accent
  ctx.font = '600 32px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(title, infoX, curY, infoMaxW)
  curY += 42

  // MBTI + 微缩挂件胶囊徽章
  const mbtiInfo = getMbtiInfo(opts.profile.mbti)
  const accInfo = getAccessoryInfo(opts.profile.accessory)
  if (mbtiInfo || accInfo) {
    const pillH = 56
    const pillY = curY
    let nextX = infoX

    if (mbtiInfo) {
      const mbtiImg = await loadImage(mbtiInfo.avatar)
      const pillLabel = `${mbtiInfo.code} · ${mbtiInfo.title}`
      ctx.font = '700 24px "PingFang SC", "Microsoft YaHei", sans-serif'
      const textW = ctx.measureText(pillLabel).width
      const pillW = Math.min(infoMaxW, (mbtiImg ? 72 : 26) + textW + 24)

      ctx.fillStyle = theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)'
      drawRoundedRect(ctx, nextX, pillY, pillW, pillH, 28)
      ctx.fill()

      ctx.strokeStyle = mbtiInfo.color
      ctx.lineWidth = 2.5
      drawRoundedRect(ctx, nextX, pillY, pillW, pillH, 28)
      ctx.stroke()

      if (mbtiImg) {
        ctx.drawImage(mbtiImg, nextX + 10, pillY + 6, 44, 44)
      }

      ctx.fillStyle = theme.titleColor
      ctx.textBaseline = 'middle'
      ctx.fillText(pillLabel, nextX + (mbtiImg ? 64 : 20), pillY + pillH / 2 + 1)
      ctx.textBaseline = 'alphabetic'
      nextX += pillW + 12
    }

    if (accInfo) {
      const accLabel = `${accInfo.emoji} ${accInfo.label}`
      ctx.font = '600 23px "PingFang SC", "Microsoft YaHei", "Segoe UI Emoji", sans-serif'
      const accW = Math.min(infoMaxW, ctx.measureText(accLabel).width + 36)
      const fitsSameRow = !mbtiInfo || nextX + accW <= infoX + infoMaxW
      const accX = fitsSameRow ? nextX : infoX
      const accY = fitsSameRow ? pillY : pillY + pillH + 10

      ctx.fillStyle = theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)'
      drawRoundedRect(ctx, accX, accY, accW, pillH, 28)
      ctx.fill()

      ctx.strokeStyle = accInfo.accent
      ctx.lineWidth = 2
      drawRoundedRect(ctx, accX, accY, accW, pillH, 28)
      ctx.stroke()

      ctx.fillStyle = theme.titleColor
      ctx.textBaseline = 'middle'
      ctx.fillText(accLabel, accX + 18, accY + pillH / 2 + 1)
      ctx.textBaseline = 'alphabetic'
      curY = accY + pillH + 30
    } else {
      curY += pillH + 32
    }
  } else {
    curY += 20
  }

  // 一句话简介
  const bio = (opts.profile.bio || '翻转名片，探索属于我的 3D 微缩世界。').trim()
  ctx.fillStyle = theme.subColor
  ctx.font = '400 28px "PingFang SC", "Microsoft YaHei", sans-serif'
  const bioLines = wrapLines(ctx, bio, infoMaxW, 4)
  for (const l of bioLines) {
    ctx.fillText(l, infoX, curY)
    curY += 44
  }

  // 底部链接摘要
  const links = (opts.profile.links ?? []).filter((l) => l.url.trim()).slice(0, 3)
  if (links.length > 0) {
    const linkLabels = links.map((l) => l.label).join('  ·  ')
    ctx.fillStyle = theme.accent
    ctx.font = '600 24px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText(linkLabels, infoX, cardY + cardH - 52, infoMaxW)
  }

  // 右侧二维码区域
  const qrBoxW = 280
  const qrBoxH = 340
  const qrBoxX = cardX + cardW - 56 - qrBoxW
  const qrBoxY = cardY + Math.round((cardH - qrBoxH) / 2)

  ctx.fillStyle = theme.qrBoxBg
  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxW, qrBoxH, 26)
  ctx.fill()

  const qrImg = opts.qrDataUrl ? await loadImage(opts.qrDataUrl) : null
  if (qrImg) {
    const innerPad = 24
    const qrSize = qrBoxW - innerPad * 2
    ctx.fillStyle = '#ffffff'
    drawRoundedRect(ctx, qrBoxX + innerPad, qrBoxY + innerPad, qrSize, qrSize, 18)
    ctx.fill()
    ctx.drawImage(qrImg, qrBoxX + innerPad + 10, qrBoxY + innerPad + 10, qrSize - 20, qrSize - 20)

    ctx.fillStyle = theme.qrText
    ctx.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('扫码旋转我的 3D 名片', qrBoxX + qrBoxW / 2, qrBoxY + qrBoxH - 28)
    ctx.textAlign = 'left'
  } else {
    // 未发布预览占位框
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 2
    ctx.setLineDash([8, 8])
    drawRoundedRect(ctx, qrBoxX + 34, qrBoxY + 34, qrBoxW - 68, qrBoxW - 68, 20)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = theme.accent
    ctx.font = '700 26px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(opts.isPreview ? '预览模式' : '专属二维码', qrBoxX + qrBoxW / 2, qrBoxY + 132)

    ctx.fillStyle = theme.subColor
    ctx.font = '400 22px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText('发布后生成', qrBoxX + qrBoxW / 2, qrBoxY + 178)
    ctx.fillText('可扫描名片码', qrBoxX + qrBoxW / 2, qrBoxY + 212)

    ctx.fillStyle = theme.qrText
    ctx.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText('点击发布生成专属二维码', qrBoxX + qrBoxW / 2, qrBoxY + qrBoxH - 28)
    ctx.textAlign = 'left'
  }

  // 5. 底部轻量引流文案
  ctx.fillStyle = theme.subColor
  ctx.font = '500 24px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('扫一扫 / NFC 碰一碰 · 体验可旋转的 3D 名片', W / 2, H - 56)
  ctx.textAlign = 'left'

  return canvas.toDataURL('image/png')
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
