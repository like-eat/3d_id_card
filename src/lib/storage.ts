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
