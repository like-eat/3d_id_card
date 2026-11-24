export type AccessoryCategory = 'pet' | 'prop'

export interface AccessoryInfo {
  id: string
  label: string
  emoji: string
  category: AccessoryCategory
  tag: string
  accent: string
}

export const ACCESSORY_LIST: AccessoryInfo[] = [
  { id: 'cat', label: '橘猫', emoji: '🐱', category: 'pet', tag: '暖橘陪伴', accent: '#e69145' },
  { id: 'dog', label: '柴犬', emoji: '🐶', category: 'pet', tag: '元气萌宠', accent: '#d48a46' },
  { id: 'camera', label: '复古相机', emoji: '📷', category: 'prop', tag: '光影记录', accent: '#607285' },
  { id: 'coffee', label: '拿铁咖啡', emoji: '☕', category: 'prop', tag: '灵感特调', accent: '#9c6644' },
  { id: 'laptop', label: '笔记本电脑', emoji: '💻', category: 'prop', tag: '数字创造', accent: '#38bdf8' },
  { id: 'guitar', label: '木吉他', emoji: '🎸', category: 'prop', tag: '音乐民谣', accent: '#c97b3d' },
  { id: 'easel', label: '艺术画架', emoji: '🎨', category: 'prop', tag: '色彩美学', accent: '#e06c88' },
  { id: 'rocket', label: '宇航火箭', emoji: '🚀', category: 'prop', tag: '探索未来', accent: '#ef5350' },
]

export type AccessoryId = (typeof ACCESSORY_LIST)[number]['id']

const ACCESSORY_MAP = new Map<string, AccessoryInfo>(ACCESSORY_LIST.map((a) => [a.id, a]))

export function getAccessoryInfo(id?: string | null): AccessoryInfo | null {
  if (!id) return null
  return ACCESSORY_MAP.get(id.trim().toLowerCase()) ?? null
}
