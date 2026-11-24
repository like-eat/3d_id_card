import * as THREE from 'three'
import QRCode from 'qrcode'
import type { SceneSpec } from '../contracts/scene-spec'
import type { CardProfile } from './cardTexture'

/* ---------------- 确定性伪随机与噪声工具 ---------------- */

export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  const u = smoothstep(xf)
  const v = smoothstep(yf)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let val = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    val += valueNoise(x * freq, y * freq, seed + i * 97) * amp
    norm += amp
    amp *= 0.5
    freq *= 2.04
  }
  return val / norm
}

function heightToNormalTexture(heights: Float32Array, size: number, strength: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size
      const xp = (x + 1) % size
      const ym = (y - 1 + size) % size
      const yp = (y + 1) % size
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength
      const len = Math.hypot(-dx, -dy, 1)
      const idx = (y * size + x) * 4
      data[idx] = Math.round(((-dx / len) * 0.5 + 0.5) * 255)
      data[idx + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255)
      data[idx + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255)
      data[idx + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

/* ---------------- 1. 森林写实草地/苔藓 PBR 纹理 ---------------- */

export function makeForestGroundTextures(): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const heights = new Float32Array(size * size)
  const rnd = mulberry32(1013)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const n1 = fbm(u * 8, v * 8, 211, 4)
      const n2 = fbm(u * 24, v * 24, 577, 3)
      const grain = (rnd() - 0.5) * 0.12
      const h = n1 * 0.65 + n2 * 0.35
      heights[y * size + x] = h

      const r = Math.round(THREE.MathUtils.clamp(54 + n1 * 38 + n2 * 22 + grain * 40, 22, 140))
      const g = Math.round(THREE.MathUtils.clamp(78 + n1 * 56 + n2 * 28 + grain * 45, 35, 178))
      const b = Math.round(THREE.MathUtils.clamp(42 + n1 * 24 + n2 * 14 + grain * 26, 18, 100))
      const idx = (y * size + x) * 4
      img.data[idx] = r
      img.data[idx + 1] = g
      img.data[idx + 2] = b
      img.data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const map = new THREE.CanvasTexture(canvas)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(5, 3.2)
  map.colorSpace = THREE.SRGBColorSpace

  const normalMap = heightToNormalTexture(heights, size, 3.2)
  normalMap.repeat.set(5, 3.2)

  return { map, normalMap }
}

/* ---------------- 2. 海岸细腻沙滩波纹 PBR 纹理 ---------------- */

export function makeSandTextures(): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const heights = new Float32Array(size * size)
  const rnd = mulberry32(4049)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const tau = Math.PI * 2
      const warp =
        Math.sin(u * 2 * tau + Math.cos(v * 2 * tau) * 0.7) * 0.35 +
        Math.cos((u * 3 - v * 2) * tau) * 0.18
      const ripple = Math.sin((v * 10 + warp) * tau) * 0.5 + 0.5
      const micro = Math.sin(u * 16 * tau) * Math.cos(v * 16 * tau) * 0.12 + 0.5
      const sparkle = rnd() > 0.982 ? 0.14 : (rnd() - 0.5) * 0.055
      const h = ripple * 0.7 + micro * 0.3
      heights[y * size + x] = h

      const baseR = 222 + (h - 0.5) * 22 + sparkle * 120
      const baseG = 198 + (h - 0.5) * 20 + sparkle * 110
      const baseB = 158 + (h - 0.5) * 18 + sparkle * 95
      const idx = (y * size + x) * 4
      img.data[idx] = Math.round(THREE.MathUtils.clamp(baseR, 150, 252))
      img.data[idx + 1] = Math.round(THREE.MathUtils.clamp(baseG, 130, 240))
      img.data[idx + 2] = Math.round(THREE.MathUtils.clamp(baseB, 102, 212))
      img.data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const map = new THREE.CanvasTexture(canvas)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(4, 2.6)
  map.colorSpace = THREE.SRGBColorSpace

  const normalMap = heightToNormalTexture(heights, size, 2.6)
  normalMap.repeat.set(4, 2.6)

  return { map, normalMap }
}

/* ---------------- 3. 城市微湿沥青与街区网格 PBR 纹理 ---------------- */

export function makeCityRoadTextures(): {
  map: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
} {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!

  const rCanvas = document.createElement('canvas')
  rCanvas.width = rCanvas.height = size
  const rCtx = rCanvas.getContext('2d')!

  ctx.fillStyle = '#151a22'
  ctx.fillRect(0, 0, size, size)
  rCtx.fillStyle = '#7a7a7a'
  rCtx.fillRect(0, 0, size, size)

  const rnd = mulberry32(8821)
  for (let i = 0; i < 6500; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const v = 18 + Math.floor(rnd() * 24)
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 8})`
    ctx.fillRect(x, y, 2, 2)
  }
  for (let i = 0; i < 45; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const rad = 18 + rnd() * 52
    const g = rCtx.createRadialGradient(x, y, 2, x, y, rad)
    g.addColorStop(0, 'rgba(32,32,32,0.75)')
    g.addColorStop(1, 'rgba(120,120,120,0)')
    rCtx.fillStyle = g
    rCtx.beginPath()
    rCtx.arc(x, y, rad, 0, Math.PI * 2)
    rCtx.fill()
  }

  ctx.strokeStyle = 'rgba(218, 198, 148, 0.24)'
  ctx.lineWidth = 2
  ctx.setLineDash([12, 10])
  for (const y of [size * 0.28, size * 0.62, size * 0.84]) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(size, y)
    ctx.stroke()
  }
  for (const x of [size * 0.25, size * 0.52, size * 0.78]) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, size)
    ctx.stroke()
  }
  ctx.setLineDash([])

  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  const roughnessMap = new THREE.CanvasTexture(rCanvas)

  return { map, roughnessMap }
}

/* ---------------- 4. 现代摩天大楼玻璃幕墙 PBR 纹理组 ---------------- */

export function makeBuildingFacadeTextures(seed = 555): {
  map: THREE.CanvasTexture
  emissiveMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
} {
  const w = 256
  const h = 512
  const cMap = document.createElement('canvas')
  cMap.width = w
  cMap.height = h
  const ctx = cMap.getContext('2d')!

  const cEm = document.createElement('canvas')
  cEm.width = w
  cEm.height = h
  const eCtx = cEm.getContext('2d')!

  const cRough = document.createElement('canvas')
  cRough.width = w
  cRough.height = h
  const rCtx = cRough.getContext('2d')!

  ctx.fillStyle = '#141c28'
  ctx.fillRect(0, 0, w, h)
  eCtx.fillStyle = '#000000'
  eCtx.fillRect(0, 0, w, h)
  rCtx.fillStyle = '#c8c8c8'
  rCtx.fillRect(0, 0, w, h)

  const rnd = mulberry32(seed)
  const cols = 8
  const rows = 24
  const cw = w / cols
  const ch = h / rows
  const warmColors = ['#ffcf86', '#ffe4b5', '#f7b96b', '#d7e8ff', '#a8ccf0']

  for (let row = 0; row < rows; row++) {
    const floorProb = row === 0 || row === rows - 1 ? 0.12 : 0.18 + rnd() * 0.42
    const floorTint = warmColors[Math.floor(rnd() * warmColors.length)]
    for (let col = 0; col < cols; col++) {
      const px = col * cw + 3
      const py = row * ch + 3
      const pw = cw - 6
      const ph = ch - 6

      rCtx.fillStyle = '#242424'
      rCtx.fillRect(px, py, pw, ph)

      const lit = rnd() < floorProb
      if (lit) {
        const bright = 0.55 + rnd() * 0.45
        const color = rnd() < 0.72 ? floorTint : warmColors[Math.floor(rnd() * warmColors.length)]
        ctx.fillStyle = color
        ctx.globalAlpha = bright
        ctx.fillRect(px, py, pw, ph)

        const grad = eCtx.createLinearGradient(px, py, px, py + ph)
        grad.addColorStop(0, color)
        grad.addColorStop(1, '#332618')
        eCtx.fillStyle = grad
        eCtx.globalAlpha = bright
        eCtx.fillRect(px, py, pw, ph)
        if (rnd() < 0.25) {
          eCtx.fillStyle = '#000000'
          eCtx.globalAlpha = 0.55
          eCtx.fillRect(px, py, pw, ph * 0.42)
        }
      } else {
        ctx.fillStyle = rnd() < 0.5 ? '#1b2638' : '#162030'
        ctx.globalAlpha = 1
        ctx.fillRect(px, py, pw, ph)
      }
    }
  }
  ctx.globalAlpha = 1
  eCtx.globalAlpha = 1

  ctx.fillStyle = '#243044'
  for (let row = 0; row < rows; row += 4) {
    ctx.fillRect(0, row * ch, w, 2)
  }

  const map = new THREE.CanvasTexture(cMap)
  map.colorSpace = THREE.SRGBColorSpace
  const emissiveMap = new THREE.CanvasTexture(cEm)
  emissiveMap.colorSpace = THREE.SRGBColorSpace
  const roughnessMap = new THREE.CanvasTexture(cRough)

  return { map, emissiveMap, roughnessMap }
}

/* ---------------- 5. 拉丝金属边框纹理 ---------------- */

export function makeBrushedMetalTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#9a9fa8'
  ctx.fillRect(0, 0, w, h)
  const rnd = mulberry32(2026)
  for (let y = 0; y < h; y++) {
    const v = 132 + Math.floor((rnd() - 0.5) * 42)
    ctx.fillStyle = `rgb(${v},${v},${v + 2})`
    ctx.fillRect(0, y, w, 1)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 1)
  return tex
}

/* ---------------- 6. 高级自然/影棚天空球纹理 ---------------- */

const SKY_PALETTES: Record<
  SceneSpec['environment']['lighting']['preset'],
  { top: string; mid: string; horizon: string; bottom: string; sunGlow: string; stars: boolean }
> = {
  morning: {
    top: '#4e79a8',
    mid: '#8eb3d4',
    horizon: '#e8e2d8',
    bottom: '#cad3d9',
    sunGlow: 'rgba(255, 238, 206, 0.55)',
    stars: false,
  },
  noon: {
    top: '#3268a8',
    mid: '#76addc',
    horizon: '#dceaf5',
    bottom: '#c5d7e4',
    sunGlow: 'rgba(255, 252, 240, 0.5)',
    stars: false,
  },
  golden_hour: {
    top: '#2e456e',
    mid: '#8c6e78',
    horizon: '#f2b880',
    bottom: '#c99776',
    sunGlow: 'rgba(255, 198, 132, 0.72)',
    stars: false,
  },
  dusk: {
    top: '#182442',
    mid: '#4a4e75',
    horizon: '#c2887e',
    bottom: '#5e5668',
    sunGlow: 'rgba(244, 166, 130, 0.45)',
    stars: true,
  },
  overcast: {
    top: '#7d8a96',
    mid: '#aeb8c2',
    horizon: '#d8dde2',
    bottom: '#bcc4cc',
    sunGlow: 'rgba(255, 255, 255, 0.25)',
    stars: false,
  },
  night: {
    top: '#050914',
    mid: '#0c162e',
    horizon: '#18294a',
    bottom: '#0b1222',
    sunGlow: 'rgba(180, 204, 245, 0.22)',
    stars: true,
  },
}

export function makeSkyTexture(preset: SceneSpec['environment']['lighting']['preset']): THREE.CanvasTexture {
  const w = 1024
  const h = 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const p = SKY_PALETTES[preset] ?? SKY_PALETTES.morning

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, p.top)
  grad.addColorStop(0.36, p.mid)
  grad.addColorStop(0.54, p.horizon)
  grad.addColorStop(1, p.bottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  const glowX = w * 0.68
  const glowY = preset === 'night' ? h * 0.22 : h * 0.42
  const glowR = preset === 'night' ? 95 : 220
  const sunG = ctx.createRadialGradient(glowX, glowY, 4, glowX, glowY, glowR)
  sunG.addColorStop(0, p.sunGlow)
  sunG.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sunG
  ctx.fillRect(0, 0, w, h)

  if (p.stars) {
    const rnd = mulberry32(20261123)
    const count = preset === 'night' ? 520 : 140
    for (let i = 0; i < count; i++) {
      const x = rnd() * w
      const y = rnd() * h * 0.5
      const r = 0.4 + rnd() * 1.15
      ctx.fillStyle = `rgba(235, 242, 255, ${0.25 + rnd() * 0.7})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    if (preset === 'night') {
      ctx.fillStyle = '#eef2fa'
      ctx.beginPath()
      ctx.arc(glowX, glowY, 13, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    const rnd = mulberry32(4117)
    for (let i = 0; i < 28; i++) {
      const cx = rnd() * w
      const cy = h * (0.24 + rnd() * 0.25)
      const rx = 55 + rnd() * 120
      const ry = 10 + rnd() * 20
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx)
      g.addColorStop(0, 'rgba(255,255,255,0.14)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1, ry / rx)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, rx, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}



/* ---------------- 7. 正面微缩金属铭牌纹理（海岸/城市用） ---------------- */

export function makeNamePlaqueTexture(profile: CardProfile, spec: SceneSpec): THREE.CanvasTexture {
  const w = 1024
  const h = 300
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const isCity = spec.template === 'city'
  const isCoast = spec.template === 'coast'

  const bg = ctx.createLinearGradient(0, 0, w, h)
  if (isCity) {
    bg.addColorStop(0, '#0e1522')
    bg.addColorStop(1, '#1a2538')
  } else if (isCoast) {
    bg.addColorStop(0, '#2a2219')
    bg.addColorStop(1, '#3d3124')
  } else {
    bg.addColorStop(0, '#13201b')
    bg.addColorStop(1, '#1f322a')
  }
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  const rnd = mulberry32(991)
  for (let y = 0; y < h; y += 2) {
    ctx.fillStyle = `rgba(255,255,255,${0.012 + rnd() * 0.02})`
    ctx.fillRect(0, y, w, 1)
  }

  const accent = isCity ? '#e6c27a' : isCoast ? '#e8cfa0' : '#b7d6c4'
  ctx.strokeStyle = accent
  ctx.globalAlpha = 0.65
  ctx.lineWidth = 4
  ctx.strokeRect(18, 18, w - 36, h - 36)
  ctx.globalAlpha = 1

  ctx.fillStyle = accent
  ctx.fillRect(46, 54, 7, h - 108)

  const name = (profile.name || '你的名字').slice(0, 16)
  const nameSize = Math.min(92, Math.floor(680 / Math.max(3, name.length)))
  ctx.fillStyle = '#f8faf8'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${nameSize}px "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif`
  ctx.fillText(name, 82, 118)

  const title = (profile.title || '3D Digital Card').slice(0, 26)
  ctx.fillStyle = accent
  ctx.font = `500 42px "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif`
  ctx.fillText(title, 84, 212)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/* ---------------- 8. 背面高级实体金属名片纹理（海岸/城市用） ---------------- */

export function makePremiumBackTexture(
  profile: CardProfile,
  spec: SceneSpec,
  qrText: string,
): THREE.CanvasTexture {
  const W = 1280
  const H = Math.round(W / 1.586)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const isCity = spec.template === 'city'
  const isCoast = spec.template === 'coast'

  const grad = ctx.createLinearGradient(0, 0, W, H)
  if (isCity) {
    grad.addColorStop(0, '#0d131f')
    grad.addColorStop(1, '#1a2436')
  } else if (isCoast) {
    grad.addColorStop(0, '#241e17')
    grad.addColorStop(1, '#362c21')
  } else {
    grad.addColorStop(0, '#101a16')
    grad.addColorStop(1, '#1c2d26')
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  const rnd = mulberry32(773)
  for (let y = 0; y < H; y += 2) {
    ctx.fillStyle = `rgba(255,255,255,${0.01 + rnd() * 0.018})`
    ctx.fillRect(0, y, W, 1)
  }

  const accent = isCity ? '#e6c27a' : isCoast ? '#e2c591' : '#8ec7a8'

  ctx.strokeStyle = accent
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 3
  ctx.strokeRect(38, 38, W - 76, H - 76)
  ctx.globalAlpha = 1

  const themeTag = isCity ? 'METROPOLIS · NIGHT' : isCoast ? 'COASTLINE · GOLDEN' : 'FOREST · MORNING'
  ctx.fillStyle = accent
  ctx.globalAlpha = 0.7
  ctx.font = '600 22px "Segoe UI", "PingFang SC", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(themeTag, W - 72, 92)
  ctx.textAlign = 'left'
  ctx.globalAlpha = 1

  const name = (profile.name || '你的名字').slice(0, 14)
  ctx.fillStyle = '#f5f7f5'
  ctx.font = `700 ${Math.min(78, Math.floor(540 / Math.max(3, name.length)))}px "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.fillText(name, 84, 170)

  ctx.fillStyle = accent
  ctx.font = '500 34px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText((profile.title || '职位 / 身份').slice(0, 24), 86, 226)

  ctx.fillStyle = accent
  ctx.globalAlpha = 0.35
  ctx.fillRect(84, 260, 560, 2)
  ctx.globalAlpha = 1

  const bio = (profile.bio || '探索我的 3D 微缩数字名片。').slice(0, 88)
  ctx.fillStyle = 'rgba(235, 240, 238, 0.82)'
  ctx.font = '400 28px "PingFang SC", "Microsoft YaHei", sans-serif'
  let line = ''
  let cy = 316
  for (const ch of bio) {
    if (ctx.measureText(line + ch).width > 560) {
      ctx.fillText(line, 84, cy)
      line = ch
      cy += 42
      if (cy > 460) break
    } else {
      line += ch
    }
  }
  if (line && cy <= 460) ctx.fillText(line, 84, cy)

  const links = (profile.links ?? []).slice(0, 4)
  let ly = 528
  ctx.font = '500 26px "PingFang SC", "Microsoft YaHei", sans-serif'
  if (links.length === 0) {
    ctx.fillStyle = 'rgba(210, 222, 218, 0.55)'
    ctx.fillText('扫描右侧二维码查看完整联系信息', 84, ly)
  } else {
    for (const l of links) {
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(96, ly - 9, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#eef2f0'
      const shortUrl = l.url.replace(/^https?:\/\//i, '').replace(/^mailto:/i, '').slice(0, 28)
      ctx.fillText(`${l.label}  ·  ${shortUrl}`, 118, ly)
      ly += 48
    }
  }

  const qrBoxSize = 330
  const qrX = W - 84 - qrBoxSize
  const qrY = Math.round((H - qrBoxSize) / 2) + 18

  ctx.fillStyle = '#f8f9fa'
  ctx.beginPath()
  ctx.roundRect(qrX, qrY, qrBoxSize, qrBoxSize, 22)
  ctx.fill()

  try {
    const qr = QRCode.create(qrText || 'https://3d.card', { errorCorrectionLevel: 'M' })
    const modCount = qr.modules.size
    const pad = 26
    const cell = (qrBoxSize - pad * 2) / modCount
    ctx.fillStyle = '#11161c'
    for (let r = 0; r < modCount; r++) {
      for (let c = 0; c < modCount; c++) {
        if (qr.modules.data[r * modCount + c]) {
          ctx.fillRect(qrX + pad + c * cell, qrY + pad + r * cell, Math.ceil(cell), Math.ceil(cell))
        }
      }
    }
  } catch {
    /* ignore */
  }

  ctx.fillStyle = 'rgba(235, 240, 238, 0.65)'
  ctx.font = '400 22px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('扫码访问 3D 名片', qrX + qrBoxSize / 2, qrY + qrBoxSize + 40)
  ctx.textAlign = 'left'

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/* ============================================================================
 * 写实微缩生态资产纹理（对标 Zilin 双面森林名片）
 * ========================================================================== */

/** 9. 写实冷杉/云杉针叶枝簇（带透明 Alpha 通道，用于层叠出锯齿状真实松树剪影） */
export function makePineBranchTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  const rnd = mulberry32(31415)

  const mainBranches = 16
  for (let b = 0; b < mainBranches; b++) {
    const baseAngle = (b / mainBranches) * Math.PI * 2 + (rnd() - 0.5) * 0.22
    const len = size * (0.34 + rnd() * 0.14)

    const steps = 26
    for (let s = 2; s <= steps; s++) {
      const t = s / steps
      const bx = cx + Math.cos(baseAngle) * len * t
      const by = cy + Math.sin(baseAngle) * len * t
      const needleLen = (1 - t * 0.55) * 16 + rnd() * 6

      for (const side of [-1, 1]) {
        const na = baseAngle + side * (0.48 + rnd() * 0.35)
        const nx = bx + Math.cos(na) * needleLen
        const ny = by + Math.sin(na) * needleLen
        const r = Math.round(14 + t * 20 + rnd() * 10)
        const g = Math.round(28 + t * 34 + rnd() * 14)
        const bl = Math.round(14 + t * 14 + rnd() * 8)
        ctx.strokeStyle = `rgb(${r},${g},${bl})`
        ctx.lineWidth = 2.0 + (1 - t) * 1.4
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(nx, ny)
        ctx.stroke()
      }
    }
  }

  const core = ctx.createRadialGradient(cx, cy, 4, cx, cy, size * 0.24)
  core.addColorStop(0, 'rgba(12, 24, 13, 0.96)')
  core.addColorStop(1, 'rgba(18, 34, 19, 0)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}



/** 10. 写实阔叶树碎叶簇（带透明通道，嫩绿/橄榄/深绿交错透光） */
export function makeLeafClusterTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  const rnd = mulberry32(27182)
  const leafPalette = ['#253d1c', '#365424', '#4d6f2e', '#6f8e3d', '#98b058', '#b8ca76']

  for (let i = 0; i < 95; i++) {
    const ang = rnd() * Math.PI * 2
    const rad = Math.sqrt(rnd()) * (size * 0.4)
    const lx = cx + Math.cos(ang) * rad
    const ly = cy + Math.sin(ang) * rad
    const rx = 7 + rnd() * 11
    const ry = 4 + rnd() * 7
    const rot = rnd() * Math.PI * 2
    const brightBias = Math.min(1, (rad / (size * 0.4)) * 0.65 + (1 - ly / size) * 0.45)
    const idx = Math.min(leafPalette.length - 1, Math.floor((brightBias * 0.65 + rnd() * 0.45) * leafPalette.length))

    ctx.save()
    ctx.translate(lx, ly)
    ctx.rotate(rot)
    ctx.fillStyle = leafPalette[idx]
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}



/** 11. 写实五瓣微缩野花贴图（白色基底，可由实例色染色） */
export function makeFlowerSpriteTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2
    const px = cx + Math.cos(ang) * 24
    const py = cy + Math.sin(ang) * 24
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(ang)
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.75, 'rgba(246,246,244,0.96)')
    g.addColorStop(1, 'rgba(240,240,238,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(0, 0, 23, 17, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = '#f2d06b'
  ctx.beginPath()
  ctx.arc(cx, cy, 11, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}



/** 12. 仅供湖面镜面反射用的蓝天白云贴图 */
export function makeLakeReflectionSkyTexture(): THREE.CanvasTexture {
  const w = 512
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#5a9be0')
  grad.addColorStop(0.55, '#8fc4f0')
  grad.addColorStop(1, '#cde6fa')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  const rnd = mulberry32(90210)
  for (let i = 0; i < 42; i++) {
    const cx = rnd() * w
    const cy = rnd() * h * 0.85
    const rx = 28 + rnd() * 64
    const ry = 14 + rnd() * 26
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx)
    g.addColorStop(0, 'rgba(255, 255, 255, 0.88)')
    g.addColorStop(0.6, 'rgba(246, 251, 255, 0.45)')
    g.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1, ry / rx)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, rx, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 13. 写实细羽状椰子树叶 Alpha 贴图（中央叶脉 + 两侧几十根纤细羽片） */
export function makePalmFrondTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)

  const midY = h / 2
  const rnd = mulberry32(80801)

  // 中央叶柄/主脉
  ctx.strokeStyle = '#5c7a38'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(4, midY)
  ctx.lineTo(w - 8, midY)
  ctx.stroke()

  // 两侧密密麻麻排布 34 对纤细尖锐的小羽叶
  const pairs = 34
  for (let i = 2; i < pairs; i++) {
    const t = i / pairs
    const bx = 8 + t * (w - 18)
    // 中段羽片最长，根部和叶尖自然收短
    const env = Math.sin(Math.pow(t, 0.8) * Math.PI)
    const len = (14 + env * 44) * (0.88 + rnd() * 0.22)

    for (const side of [-1, 1]) {
      const sweep = 10 + t * 18 + rnd() * 5
      const tipX = Math.min(w - 2, bx + sweep)
      const tipY = midY + side * len
      const cpX = bx + sweep * 0.45
      const cpY = midY + side * len * 0.65

      const g = Math.round(92 + t * 38 + rnd() * 24)
      const r = Math.round(52 + t * 28 + rnd() * 18)
      const b = Math.round(32 + rnd() * 14)
      ctx.strokeStyle = `rgb(${r},${g},${b})`
      ctx.lineWidth = 2.2 + env * 1.4
      ctx.beginPath()
      ctx.moveTo(bx, midY)
      ctx.quadraticCurveTo(cpX, cpY, tipX, tipY)
      ctx.stroke()
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 14. 柔和发光圆点贴图（用于城市夜景微缩光点拼字与灯点二维码） */
export function makeLightDotTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  const cx = size / 2
  const g = ctx.createRadialGradient(cx, cx, 2, cx, cx, cx)
  g.addColorStop(0, 'rgba(255, 255, 255, 1)')
  g.addColorStop(0.45, 'rgba(255, 246, 224, 0.92)')
  g.addColorStop(0.8, 'rgba(255, 226, 168, 0.35)')
  g.addColorStop(1, 'rgba(255, 210, 140, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cx, cx, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}


/** 15. 未来科技蚀刻硅晶圆 / 高精电路板 PBR 纹理组（漫反射 + 青蓝自发光总线 + 金属走线粗糙度） */
export function makeCircuitBoardTextures(): {
  map: THREE.CanvasTexture
  emissiveMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
} {
  const w = 1024
  const h = 640
  const cMap = document.createElement('canvas')
  cMap.width = w
  cMap.height = h
  const ctx = cMap.getContext('2d')!

  const cEm = document.createElement('canvas')
  cEm.width = w
  cEm.height = h
  const eCtx = cEm.getContext('2d')!

  const cRough = document.createElement('canvas')
  cRough.width = w
  cRough.height = h
  const rCtx = cRough.getContext('2d')!

  // 深黑碳纤维/硅晶圆基板底
  ctx.fillStyle = '#090f1a'
  ctx.fillRect(0, 0, w, h)
  eCtx.fillStyle = '#000000'
  eCtx.fillRect(0, 0, w, h)
  rCtx.fillStyle = '#b4b4b4'
  rCtx.fillRect(0, 0, w, h)

  // 微细精密网格刻线
  ctx.strokeStyle = 'rgba(56, 128, 178, 0.14)'
  ctx.lineWidth = 1
  for (let x = 0; x < w; x += 32) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  for (let y = 0; y < h; y += 32) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  // 45° 折角精密 PCB 金属总线与发光数据回路
  const rnd = mulberry32(20771)
  for (let i = 0; i < 68; i++) {
    let x = Math.floor(rnd() * 30 + 1) * 32
    let y = Math.floor(rnd() * 18 + 1) * 32
    const glowing = rnd() < 0.34
    const segs = 3 + Math.floor(rnd() * 4)

    ctx.strokeStyle = glowing ? '#38d9ff' : '#1b314a'
    ctx.lineWidth = glowing ? 2.6 : 2.0
    ctx.beginPath()
    ctx.moveTo(x, y)

    rCtx.strokeStyle = '#2a2a2a'
    rCtx.lineWidth = 3
    rCtx.beginPath()
    rCtx.moveTo(x, y)

    if (glowing) {
      eCtx.strokeStyle = rnd() < 0.78 ? '#22d3ee' : '#818cf8'
      eCtx.lineWidth = 2.4
      eCtx.beginPath()
      eCtx.moveTo(x, y)
    }

    for (let s = 0; s < segs; s++) {
      const dir = Math.floor(rnd() * 4)
      const step = (1 + Math.floor(rnd() * 3)) * 32
      if (dir === 0) x += step
      else if (dir === 1) y += step
      else if (dir === 2) {
        x += step * 0.5
        y += step * 0.5
      } else {
        x -= step * 0.5
        y += step * 0.5
      }
      x = Math.max(16, Math.min(w - 16, x))
      y = Math.max(16, Math.min(h - 16, y))
      ctx.lineTo(x, y)
      rCtx.lineTo(x, y)
      if (glowing) eCtx.lineTo(x, y)
    }
    ctx.stroke()
    rCtx.stroke()
    if (glowing) eCtx.stroke()

    // 端点微型焊盘圆环
    ctx.fillStyle = glowing ? '#7ceeff' : '#2f4f6e'
    ctx.beginPath()
    ctx.arc(x, y, glowing ? 4.2 : 3.2, 0, Math.PI * 2)
    ctx.fill()
    if (glowing) {
      eCtx.fillStyle = '#a5f3fc'
      eCtx.beginPath()
      eCtx.arc(x, y, 4.2, 0, Math.PI * 2)
      eCtx.fill()
    }
  }

  // 右上量子核心底座周围的精密同心刻度环
  const cx = w * 0.67
  const cy = h * 0.42
  for (const rad of [74, 96, 122]) {
    ctx.strokeStyle = 'rgba(56, 217, 255, 0.42)'
    ctx.lineWidth = 2
    ctx.setLineDash(rad === 96 ? [8, 6] : [])
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, Math.PI * 2)
    ctx.stroke()

    eCtx.strokeStyle = 'rgba(34, 211, 238, 0.55)'
    eCtx.lineWidth = 2
    eCtx.setLineDash(rad === 96 ? [8, 6] : [])
    eCtx.beginPath()
    eCtx.arc(cx, cy, rad, 0, Math.PI * 2)
    eCtx.stroke()
  }
  ctx.setLineDash([])
  eCtx.setLineDash([])

  // 四周边框极细微电路刻度线
  ctx.strokeStyle = 'rgba(56, 217, 255, 0.35)'
  ctx.lineWidth = 3
  ctx.strokeRect(12, 12, w - 24, h - 24)
  eCtx.strokeStyle = 'rgba(34, 211, 238, 0.25)'
  eCtx.lineWidth = 2
  eCtx.strokeRect(12, 12, w - 24, h - 24)

  const map = new THREE.CanvasTexture(cMap)
  map.colorSpace = THREE.SRGBColorSpace
  const emissiveMap = new THREE.CanvasTexture(cEm)
  emissiveMap.colorSpace = THREE.SRGBColorSpace
  const roughnessMap = new THREE.CanvasTexture(cRough)
  return { map, emissiveMap, roughnessMap }
}

/** 16. 未来科技量子服务器机柜 / 散热塔立面 PBR 纹理 */
export function makeTechTowerTextures(seed = 2077): {
  map: THREE.CanvasTexture
  emissiveMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
} {
  const w = 128
  const h = 256
  const cMap = document.createElement('canvas')
  cMap.width = w
  cMap.height = h
  const ctx = cMap.getContext('2d')!

  const cEm = document.createElement('canvas')
  cEm.width = w
  cEm.height = h
  const eCtx = cEm.getContext('2d')!

  const cRough = document.createElement('canvas')
  cRough.width = w
  cRough.height = h
  const rCtx = cRough.getContext('2d')!

  // 哑光钛黑阳极氧化金属机身
  ctx.fillStyle = '#0f1726'
  ctx.fillRect(0, 0, w, h)
  eCtx.fillStyle = '#000000'
  eCtx.fillRect(0, 0, w, h)
  rCtx.fillStyle = '#585858'
  rCtx.fillRect(0, 0, w, h)

  // 水平精密散热鳍片缝隙
  for (let y = 8; y < h - 8; y += 10) {
    ctx.fillStyle = '#070b12'
    ctx.fillRect(6, y, w - 12, 3)
    rCtx.fillStyle = '#d0d0d0'
    rCtx.fillRect(6, y, w - 12, 3)
  }

  // 两侧青蓝/冰白/紫罗兰微缩光纤状态灯条与脉冲格
  const rnd = mulberry32(seed)
  const accent = rnd() < 0.72 ? '#22d3ee' : '#818cf8'
  ctx.fillStyle = accent
  ctx.fillRect(10, 12, 4, h - 24)
  ctx.fillRect(w - 14, 12, 4, h - 24)
  eCtx.fillStyle = accent
  eCtx.fillRect(10, 12, 4, h - 24)
  eCtx.fillRect(w - 14, 12, 4, h - 24)

  // 中央随机闪烁的微缩服务器 LED 指示灯阵列
  for (let y = 18; y < h - 18; y += 20) {
    if (rnd() < 0.55) {
      const barW = 24 + rnd() * 52
      const bx = 24 + rnd() * (w - 48 - barW)
      const col = rnd() < 0.75 ? '#38bdf8' : rnd() < 0.9 ? '#e0f2fe' : '#a78bfa'
      ctx.fillStyle = col
      ctx.fillRect(bx, y, barW, 4)
      eCtx.fillStyle = col
      eCtx.fillRect(bx, y, barW, 4)
    }
  }

  const map = new THREE.CanvasTexture(cMap)
  map.colorSpace = THREE.SRGBColorSpace
  const emissiveMap = new THREE.CanvasTexture(cEm)
  emissiveMap.colorSpace = THREE.SRGBColorSpace
  const roughnessMap = new THREE.CanvasTexture(cRough)
  return { map, emissiveMap, roughnessMap }
}

/** 17. 写实度假沙滩遮阳伞条纹帆布纹理（米白 + 海盐灰蓝，带细密织物纹理） */
export function makeUmbrellaCanopyTexture(): THREE.CanvasTexture {
  const w = 512
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const stripes = 16
  const sw = w / stripes
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#f6f1e6' : '#3d6e82'
    ctx.fillRect(i * sw, 0, Math.ceil(sw), h)
  }

  // 细腻亚麻帆布织纹噪点
  const rnd = mulberry32(31419)
  for (let i = 0; i < 4000; i++) {
    const x = rnd() * w
    const y = rnd() * h
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(25,35,40,0.05)'
    ctx.fillRect(x, y, 2, 2)
  }

  // 伞檐微暗缝线边
  ctx.fillStyle = 'rgba(30, 45, 52, 0.22)'
  ctx.fillRect(0, h - 10, w, 10)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}


/** 18. 樱花庭院青苔与枯山水微砂纹理（高明度中性底，配合顶点色过渡青苔与石径） */
export function makeSakuraGroundTextures(): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const heights = new Float32Array(size * size)
  const rnd = mulberry32(5209)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const moss = fbm(u * 9, v * 9, 313, 4)
      const rake = Math.sin((v * 20 + Math.sin(u * Math.PI * 4) * 0.4) * Math.PI * 2) * 0.14
      const grain = (rnd() - 0.5) * 0.08
      const h = moss * 0.72 + rake * 0.28
      heights[y * size + x] = h

      const vCol = THREE.MathUtils.clamp(206 + moss * 34 + grain * 45 + rake * 18, 160, 250)
      const idx = (y * size + x) * 4
      img.data[idx] = Math.round(vCol * 0.96)
      img.data[idx + 1] = Math.round(vCol)
      img.data[idx + 2] = Math.round(vCol * 0.93)
      img.data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const map = new THREE.CanvasTexture(canvas)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(5, 3.2)
  map.colorSpace = THREE.SRGBColorSpace

  const normalMap = heightToNormalTexture(heights, size, 2.6)
  normalMap.repeat.set(5, 3.2)

  return { map, normalMap }
}

/** 19. 带透明 Alpha 通道的粉白樱花团簇贴图（供立体樱花树冠层叠使用） */
export function makeSakuraClusterTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  const rnd = mulberry32(8861)
  const palette = ['#f49bb6', '#f9b7ca', '#ffd5e2', '#ffeaf0', '#fff7fa', '#f78fb0']

  // 底层少量嫩绿花萼与细枝，增加自然植物写实感
  for (let i = 0; i < 16; i++) {
    const ang = rnd() * Math.PI * 2
    const rad = rnd() * (size * 0.26)
    ctx.fillStyle = rnd() < 0.6 ? '#6a874f' : '#5e463a'
    ctx.beginPath()
    ctx.ellipse(
      cx + Math.cos(ang) * rad,
      cy + Math.sin(ang) * rad,
      7 + rnd() * 5,
      3.5 + rnd() * 2.5,
      ang,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }

  // 密集交错的五瓣樱花簇
  for (let i = 0; i < 58; i++) {
    const ang = rnd() * Math.PI * 2
    const rad = Math.sqrt(rnd()) * (size * 0.37)
    const fx = cx + Math.cos(ang) * rad
    const fy = cy + Math.sin(ang) * rad
    const flowerR = 11 + rnd() * 11
    const baseRot = rnd() * Math.PI * 2
    const col = palette[Math.floor(rnd() * palette.length)]

    ctx.save()
    ctx.translate(fx, fy)
    ctx.rotate(baseRot)
    ctx.fillStyle = col
    for (let p = 0; p < 5; p++) {
      ctx.save()
      ctx.rotate((p * Math.PI * 2) / 5)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.quadraticCurveTo(-flowerR * 0.42, -flowerR * 0.65, -flowerR * 0.14, -flowerR)
      ctx.lineTo(0, -flowerR * 0.82)
      ctx.lineTo(flowerR * 0.14, -flowerR)
      ctx.quadraticCurveTo(flowerR * 0.42, -flowerR * 0.65, 0, 0)
      ctx.fill()
      ctx.restore()
    }
    // 深粉/金黄花蕊
    ctx.fillStyle = rnd() < 0.7 ? '#d94877' : '#f7d16c'
    ctx.beginPath()
    ctx.arc(0, 0, flowerR * 0.19, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 20. 精致单瓣樱花花瓣透明贴图（纯白底色，供实例色染色用于飘落花瓣与拼字/二维码） */
export function makeSakuraPetalTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  const grad = ctx.createLinearGradient(cx, cy - 48, cx, cy + 46)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.7, '#f5f5f5')
  grad.addColorStop(1, '#d8d8d8')

  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(cx, cy + 44)
  ctx.bezierCurveTo(cx - 44, cy + 18, cx - 42, cy - 32, cx - 14, cy - 46)
  ctx.lineTo(cx, cy - 30)
  ctx.lineTo(cx + 14, cy - 46)
  ctx.bezierCurveTo(cx + 42, cy - 32, cx + 44, cy + 18, cx, cy + 44)
  ctx.closePath()
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 21. 细腻风吹雪纹与冰晶微闪雪地漫反射 + 法线贴图 */
export function makeSnowGroundTextures(): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const heights = new Float32Array(size * size)
  const rnd = mulberry32(9901)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const drift = fbm(u * 4 + Math.sin(v * Math.PI * 2) * 0.25, v * 12, 709, 4)
      const crystal = fbm(u * 26, v * 26, 941, 2)
      const sparkle = rnd() > 0.992 ? 0.16 : (rnd() - 0.5) * 0.04
      const h = drift * 0.78 + crystal * 0.22
      heights[y * size + x] = h

      const base = THREE.MathUtils.clamp(228 + drift * 22 + crystal * 12 + sparkle * 90, 204, 255)
      const idx = (y * size + x) * 4
      img.data[idx] = Math.round(THREE.MathUtils.clamp(base * 0.96, 0, 255))
      img.data[idx + 1] = Math.round(THREE.MathUtils.clamp(base * 0.985, 0, 255))
      img.data[idx + 2] = Math.round(base)
      img.data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const map = new THREE.CanvasTexture(canvas)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(5, 3.2)
  map.colorSpace = THREE.SRGBColorSpace

  const normalMap = heightToNormalTexture(heights, size, 2.2)
  normalMap.repeat.set(5, 3.2)

  return { map, normalMap }
}

/** 22. 覆雪冷杉针叶枝簇透明贴图（深墨松针打底，梢头积着蓬松自然白雪） */
export function makeSnowPineBranchTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  const rnd = mulberry32(41203)
  const mainBranches = 16

  for (let b = 0; b < mainBranches; b++) {
    const baseAngle = (b / mainBranches) * Math.PI * 2 + (rnd() - 0.5) * 0.2
    const len = size * (0.34 + rnd() * 0.13)

    const steps = 24
    for (let s = 2; s <= steps; s++) {
      const t = s / steps
      const bx = cx + Math.cos(baseAngle) * len * t
      const by = cy + Math.sin(baseAngle) * len * t
      const needleLen = (1 - t * 0.52) * 16 + rnd() * 6

      for (const side of [-1, 1]) {
        const na = baseAngle + side * (0.48 + rnd() * 0.34)
        const nx = bx + Math.cos(na) * needleLen
        const ny = by + Math.sin(na) * needleLen
        const r = Math.round(14 + t * 18 + rnd() * 8)
        const g = Math.round(32 + t * 32 + rnd() * 12)
        const bl = Math.round(28 + t * 24 + rnd() * 10)
        ctx.strokeStyle = `rgb(${r},${g},${bl})`
        ctx.lineWidth = 2.1 + (1 - t) * 1.4
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(nx, ny)
        ctx.stroke()

        // 枝梢覆雪点缀
        if (t > 0.38 && rnd() < 0.72) {
          ctx.strokeStyle = rnd() < 0.65 ? 'rgba(244, 249, 255, 0.92)' : 'rgba(216, 232, 248, 0.85)'
          ctx.lineWidth = 2.5 + rnd() * 1.6
          ctx.beginPath()
          ctx.moveTo((bx + nx) * 0.5, (by + ny) * 0.5 - 1)
          ctx.lineTo(nx, ny - 1)
          ctx.stroke()
        }
      }
    }

    // 枝尖柔软厚雪团
    const tx = cx + Math.cos(baseAngle) * len * 0.78
    const ty = cy + Math.sin(baseAngle) * len * 0.78
    ctx.fillStyle = 'rgba(242, 248, 255, 0.88)'
    ctx.beginPath()
    ctx.ellipse(tx, ty, 12, 7, baseAngle, 0, Math.PI * 2)
    ctx.fill()
  }

  const core = ctx.createRadialGradient(cx, cy, 4, cx, cy, size * 0.24)
  core.addColorStop(0, 'rgba(18, 38, 34, 0.95)')
  core.addColorStop(0.55, 'rgba(220, 235, 248, 0.5)')
  core.addColorStop(1, 'rgba(235, 244, 255, 0)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 23. 阿尔卑斯原木小屋墙体 + 暖琥珀格栅木窗纹理与自发光贴图 */
export function makeCabinWallTexture(): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const w = 256
  const h = 192
  const cMap = document.createElement('canvas')
  cMap.width = w
  cMap.height = h
  const ctx = cMap.getContext('2d')!

  const cEm = document.createElement('canvas')
  cEm.width = w
  cEm.height = h
  const eCtx = cEm.getContext('2d')!

  // 暖胡桃木横向原木层叠条纹
  const rnd = mulberry32(6022)
  const plankH = 24
  for (let y = 0; y < h; y += plankH) {
    const shade = Math.round((rnd() - 0.5) * 18)
    const grad = ctx.createLinearGradient(0, y, 0, y + plankH)
    grad.addColorStop(0, `rgb(${128 + shade},${82 + shade},${48 + shade})`)
    grad.addColorStop(0.5, `rgb(${156 + shade},${103 + shade},${62 + shade})`)
    grad.addColorStop(1, `rgb(${94 + shade},${58 + shade},${32 + shade})`)
    ctx.fillStyle = grad
    ctx.fillRect(0, y, w, plankH)

    // 原木拼接暗缝
    ctx.fillStyle = '#3a2212'
    ctx.fillRect(0, y + plankH - 3, w, 3)

    // 细微木纹丝线
    ctx.fillStyle = 'rgba(55, 30, 14, 0.16)'
    for (let k = 0; k < 5; k++) {
      ctx.fillRect(0, y + 4 + rnd() * (plankH - 9), w, 1.5)
    }
  }

  eCtx.fillStyle = '#000000'
  eCtx.fillRect(0, 0, w, h)

  // 左右两扇暖光格栅木窗
  const winBoxes = [
    { x: 34, y: 54, w: 62, h: 68 },
    { x: 160, y: 54, w: 62, h: 68 },
  ]
  for (const wb of winBoxes) {
    // 窗框外檐
    ctx.fillStyle = '#472a16'
    ctx.fillRect(wb.x - 5, wb.y - 5, wb.w + 10, wb.h + 10)

    // 暖黄室内壁炉透光渐变
    const wGrad = ctx.createRadialGradient(
      wb.x + wb.w / 2,
      wb.y + wb.h / 2,
      4,
      wb.x + wb.w / 2,
      wb.y + wb.h / 2,
      wb.w * 0.72,
    )
    wGrad.addColorStop(0, '#fff2ba')
    wGrad.addColorStop(0.55, '#ffc25c')
    wGrad.addColorStop(1, '#d97b24')

    ctx.fillStyle = wGrad
    ctx.fillRect(wb.x, wb.y, wb.w, wb.h)
    eCtx.fillStyle = wGrad
    eCtx.fillRect(wb.x, wb.y, wb.w, wb.h)

    // 十字木格栅
    ctx.fillStyle = '#4a2b16'
    ctx.fillRect(wb.x + wb.w / 2 - 3, wb.y, 6, wb.h)
    ctx.fillRect(wb.x, wb.y + wb.h / 2 - 3, wb.w, 6)
    eCtx.fillStyle = '#000000'
    eCtx.fillRect(wb.x + wb.w / 2 - 3, wb.y, 6, wb.h)
    eCtx.fillRect(wb.x, wb.y + wb.h / 2 - 3, wb.w, 6)
  }

  const map = new THREE.CanvasTexture(cMap)
  map.colorSpace = THREE.SRGBColorSpace
  const emissiveMap = new THREE.CanvasTexture(cEm)
  emissiveMap.colorSpace = THREE.SRGBColorSpace
  return { map, emissiveMap }
}
