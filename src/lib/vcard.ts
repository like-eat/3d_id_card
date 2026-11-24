import type { ProfileData } from './db'
import { getMbtiInfo } from '../contracts/mbti'

function escapeVCardValue(val: string): string {
  return val
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

/** 生成标准 UTF-8 vCard 3.0 (.vcf) 文件并触发浏览器下载 */
export function downloadVCard(profile: ProfileData, cardUrl: string) {
  const name = (profile.name || '未命名').trim()
  const title = (profile.title || '').trim()
  const bio = (profile.bio || '').trim()
  const links = profile.links ?? []

  const notes: string[] = []
  if (bio) notes.push(bio)
  const mbti = getMbtiInfo(profile.mbti)
  if (mbti) notes.push(`MBTI: ${mbti.code} (${mbti.title})`)

  const wechats = links.filter((l) => l.type === 'wechat' && l.url.trim())
  for (const w of wechats) {
    notes.push(`微信: ${w.url.trim()}`)
  }

  const emails = links
    .filter((l) => l.type === 'email' && l.url.trim())
    .map((l) => l.url.trim().replace(/^mailto:/i, ''))

  const otherUrls: string[] = []
  if (/^https?:\/\//i.test(cardUrl)) otherUrls.push(cardUrl)
  if (profile.website && /^https?:\/\//i.test(profile.website.trim())) {
    otherUrls.push(profile.website.trim())
  }
  for (const l of links) {
    if (l.type !== 'email' && l.type !== 'wechat' && /^https?:\/\//i.test(l.url.trim())) {
      otherUrls.push(l.url.trim())
    }
  }

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${escapeVCardValue(name)};;;`,
    `FN:${escapeVCardValue(name)}`,
  ]
  if (title) lines.push(`TITLE:${escapeVCardValue(title)}`)
  for (const email of emails) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(email)}`)
  }
  for (const url of otherUrls) {
    lines.push(`URL:${escapeVCardValue(url)}`)
  }
  if (notes.length > 0) {
    lines.push(`NOTE:${escapeVCardValue(notes.join(' | '))}`)
  }
  lines.push('END:VCARD')

  const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = `${name.replace(/[\\/:*?"<>|]/g, '_') || 'contact'}.vcf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
