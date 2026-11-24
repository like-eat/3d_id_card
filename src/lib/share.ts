/**
 * WorkBuddy 托管平台访问门禁：所有访问地址必须携带 ?sharecode=xxx。
 * 应用启动时从地址栏捕获并持久化；生成对外链接（名片/二维码/NFC）时自动附加。
 */
const KEY = 'wb-share-code'

export function captureShareCode() {
  try {
    const sc = new URLSearchParams(location.search).get('sharecode')
    if (sc) localStorage.setItem(KEY, sc)
  } catch {
    /* 隐私模式下忽略 */
  }
}

export function getShareCode(): string {
  try {
    const fromUrl = new URLSearchParams(location.search).get('sharecode')
    if (fromUrl) return fromUrl
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** 给对外链接补上分享码（查询参数插在 hash 之前，重复添加时跳过） */
export function withShareCode(url: string): string {
  const sc = getShareCode()
  if (!sc || url.includes('sharecode=')) return url
  const hashIndex = url.indexOf('#')
  const [base, hash] = hashIndex >= 0 ? [url.slice(0, hashIndex), url.slice(hashIndex)] : [url, '']
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}sharecode=${sc}${hash}`
}
