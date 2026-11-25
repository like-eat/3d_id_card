import { cloud, withRetry } from './cloud'
import { unwrap } from './cloud'

/** 照片上传：仅登录用户可写自己的私有目录（users/<uid>/photos/），网络失败自动重试 */
export async function uploadPhotos(uid: string, files: File[]): Promise<string[]> {
  const keys: string[] = []
  for (const file of files) {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = cloud.storage.userPath(uid, `photos/${crypto.randomUUID()}.${ext}`)
    const result = await withRetry(`上传照片（${file.name}）`, () =>
      cloud.storage.upload(path, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      }),
    )
    if (result.error) throw result.error
    keys.push(path)
  }
  return keys
}

/** 删除项目时删除原始照片（FR-33） */
export async function deletePhotos(paths: string[]) {
  if (paths.length === 0) return
  const result = await cloud.storage.remove(paths)
  if (result.error) throw result.error
}

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_SIZE = 15 * 1024 * 1024

export function validateFiles(files: File[]): { ok: boolean; message?: string; valid: File[] } {
  if (files.length < 1 || files.length > 3) return { ok: false, message: '请选择 1–3 张照片', valid: [] }
  for (const f of files) {
    if (!ACCEPTED_TYPES.includes(f.type)) return { ok: false, message: `不支持的格式：${f.name}（仅支持 JPG / PNG / WebP）`, valid: [] }
    if (f.size > MAX_SIZE) return { ok: false, message: `照片过大：${f.name}（单张不超过 15 MB）`, valid: [] }
  }
  return { ok: true, valid: files }
}

/**
 * 客户端主色提取：缩到小尺寸后做简单的颜色量化，返回最多 4 个主色（hex）。
 * 用于本地预览与 AI 失败时的回退配色（US-003：至少 4 个主色）。
 */
export async function extractPalette(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('图片解析失败'))
      i.src = url
    })
    const size = 48
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    // 简易量化：按 32 级分桶计数
    const buckets = new Map<string, { r: number; g: number; b: number; n: number }>()
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const key = `${r >> 5}_${g >> 5}_${b >> 5}`
      const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
      cur.r += r; cur.g += g; cur.b += b; cur.n += 1
      buckets.set(key, cur)
    }
    const top = [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
      .map((c) => {
        const toHex = (v: number) => Math.round(v / c.n).toString(16).padStart(2, '0')
        return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`
      })
    while (top.length < 4) top.push('#4a6741')
    return top
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 压缩照片为 JPEG base64，用于视觉模型输入 */
export async function photoToDataUrl(file: File, maxSize = 640): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('图片解析失败'))
      i.src = url
    })
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    URL.revokeObjectURL(url)
  }
}


/** 将用户头像/照片居中裁剪并压缩为正方形 DataURL（免登录草稿与跨端海报安全导出） */
export async function cropAvatarDataUrl(file: File, size = 256): Promise<string> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('仅支持 JPG / PNG / WebP 格式图片')
  }
  if (file.size > MAX_SIZE) {
    throw new Error('单张照片大小不能超过 15 MB')
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('图片读取失败，请换一张重试'))
      i.src = url
    })
    const side = Math.min(img.width, img.height)
    const sx = Math.max(0, (img.width - side) / 2)
    const sy = Math.max(0, (img.height - side) / 2)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
    const webp = canvas.toDataURL('image/webp', 0.86)
    if (webp.startsWith('data:image/webp')) return webp
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 生成一张暖阳系微缩头像示例图，供一键试用自定义照片立牌 */
export function makeSampleAvatarDataUrl(): string {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!

  // 柔和晨曦天空与远山背景
  const bg = ctx.createLinearGradient(0, 0, 0, s)
  bg.addColorStop(0, '#ffd8c4')
  bg.addColorStop(0.55, '#ffe7cf')
  bg.addColorStop(1, '#cde4dc')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, s, s)

  // 暖阳与远山剪影
  ctx.fillStyle = '#fff5d6'
  ctx.beginPath()
  ctx.arc(s * 0.72, s * 0.28, 28, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#7ba89b'
  ctx.beginPath()
  ctx.moveTo(0, s * 0.78)
  ctx.quadraticCurveTo(s * 0.35, s * 0.58, s * 0.72, s * 0.72)
  ctx.lineTo(s, s * 0.62)
  ctx.lineTo(s, s)
  ctx.lineTo(0, s)
  ctx.fill()

  // 居中治愈系小笑脸插画人偶
  ctx.fillStyle = '#f29f7e'
  ctx.beginPath()
  ctx.arc(s / 2, s * 0.86, 56, Math.PI, 0)
  ctx.fill()

  // 头发与圆脸
  ctx.fillStyle = '#33292a'
  ctx.beginPath()
  ctx.arc(s / 2, s * 0.48, 46, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ffe5d4'
  ctx.beginPath()
  ctx.arc(s / 2, s * 0.51, 36, 0, Math.PI * 2)
  ctx.fill()

  // 刘海与笑眼腮红
  ctx.fillStyle = '#33292a'
  ctx.beginPath()
  ctx.arc(s / 2, s * 0.43, 36, Math.PI, 0)
  ctx.fill()

  ctx.strokeStyle = '#33292a'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  for (const ex of [s * 0.43, s * 0.57]) {
    ctx.beginPath()
    ctx.arc(ex, s * 0.52, 5, Math.PI, 0)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(244, 114, 182, 0.35)'
  ctx.beginPath()
  ctx.ellipse(s * 0.38, s * 0.56, 7, 4, 0, 0, Math.PI * 2)
  ctx.ellipse(s * 0.62, s * 0.56, 7, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.arc(s / 2, s * 0.57, 7, 0.15 * Math.PI, 0.85 * Math.PI)
  ctx.stroke()

  return c.toDataURL('image/png')
}
