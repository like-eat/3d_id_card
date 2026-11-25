import type { SceneSpec, TemplateId } from './scene-spec'

export interface MoodLightingCfg {
  sun: string
  sunI: number
  hemiSky: string
  hemiGround: string
  hemiI: number
  rimColor: string
  rimI: number
  envIntensity: number
}

export interface MoodSkin {
  id: string
  template: TemplateId
  label: string
  emoji: string
  desc: string
  studioBg: string
  isDark: boolean
  lightingPreset: SceneSpec['environment']['lighting']['preset']
  lightingCfg: MoodLightingCfg
  accent: string
  secondaryAccent: string
  swatch: [string, string]
  posterTag: string
}

export const MOOD_LIST: MoodSkin[] = [
  /* -------- 1. 晨雾森林 -------- */
  {
    id: 'forest_morning',
    template: 'mountain_forest',
    label: '晨雾森系',
    emoji: '🌅',
    desc: '晨光柔粉 · 翠绿苔坡',
    studioBg: '#f0e2e7',
    isDark: false,
    lightingPreset: 'morning',
    lightingCfg: {
      sun: '#fff3df',
      sunI: 2.15,
      hemiSky: '#d4e6f8',
      hemiGround: '#3d4f3c',
      hemiI: 1.15,
      rimColor: '#b7d2f2',
      rimI: 0.55,
      envIntensity: 1.45,
    },
    accent: '#3b7a57',
    secondaryAccent: '#8fb4c5',
    swatch: ['#f0e2e7', '#3b7a57'],
    posterTag: 'MORNING FOREST · 3D CARD',
  },
  {
    id: 'forest_autumn',
    template: 'mountain_forest',
    label: '金秋枫林',
    emoji: '🍁',
    desc: '琥珀金叶 · 暖阳斜照',
    studioBg: '#f3e5d7',
    isDark: false,
    lightingPreset: 'golden_hour',
    lightingCfg: {
      sun: '#ffc37d',
      sunI: 2.4,
      hemiSky: '#fce3c2',
      hemiGround: '#6b472d',
      hemiI: 1.1,
      rimColor: '#f5b884',
      rimI: 0.65,
      envIntensity: 1.38,
    },
    accent: '#c96f2d',
    secondaryAccent: '#e8a848',
    swatch: ['#f3e5d7', '#d97736'],
    posterTag: 'AUTUMN FOREST · 3D CARD',
  },
  {
    id: 'forest_firefly',
    template: 'mountain_forest',
    label: '仲夏萤火夜',
    emoji: '✨',
    desc: '静谧森林夜 · 萤火点点',
    studioBg: '#0b161b',
    isDark: true,
    lightingPreset: 'night',
    lightingCfg: {
      sun: '#9cc2f0',
      sunI: 1.15,
      hemiSky: '#3b648f',
      hemiGround: '#1a2e25',
      hemiI: 0.95,
      rimColor: '#8ae8c8',
      rimI: 0.72,
      envIntensity: 1.1,
    },
    accent: '#7ef2c4',
    secondaryAccent: '#fde68a',
    swatch: ['#0b161b', '#7ef2c4'],
    posterTag: 'FIREFLY NIGHT · 3D CARD',
  },

  /* -------- 2. 海岸沙滩 -------- */
  {
    id: 'coast_day',
    template: 'coast',
    label: '晴空果冻海',
    emoji: '☀️',
    desc: '奶油白沙 · 翡翠海浪',
    studioBg: '#f2eae2',
    isDark: false,
    lightingPreset: 'golden_hour',
    lightingCfg: {
      sun: '#ffe3ba',
      sunI: 2.35,
      hemiSky: '#e8f4fc',
      hemiGround: '#7a6349',
      hemiI: 1.18,
      rimColor: '#b7d2f2',
      rimI: 0.55,
      envIntensity: 1.5,
    },
    accent: '#2185b8',
    secondaryAccent: '#54cfc7',
    swatch: ['#f2eae2', '#239bb5'],
    posterTag: 'GOLDEN COAST · 3D CARD',
  },
  {
    id: 'coast_sunset',
    template: 'coast',
    label: '橘子海日落',
    emoji: '🌅',
    desc: '熔金夕阳 · 玫瑰粉浪',
    studioBg: '#f6ded2',
    isDark: false,
    lightingPreset: 'dusk',
    lightingCfg: {
      sun: '#ff9b6a',
      sunI: 2.25,
      hemiSky: '#ffc4b0',
      hemiGround: '#6e493e',
      hemiI: 1.12,
      rimColor: '#ffa89c',
      rimI: 0.75,
      envIntensity: 1.35,
    },
    accent: '#e06346',
    secondaryAccent: '#f5a673',
    swatch: ['#f6ded2', '#e86f4c'],
    posterTag: 'SUNSET BAY · 3D CARD',
  },
  {
    id: 'coast_moonbay',
    template: 'coast',
    label: '星月荧光海',
    emoji: '🌙',
    desc: '蓝眼泪荧光浪 · 伞下暖灯',
    studioBg: '#091324',
    isDark: true,
    lightingPreset: 'night',
    lightingCfg: {
      sun: '#8cb6f2',
      sunI: 1.15,
      hemiSky: '#2f4e85',
      hemiGround: '#24293a',
      hemiI: 0.92,
      rimColor: '#40f5ff',
      rimI: 0.78,
      envIntensity: 1.15,
    },
    accent: '#40f5ff',
    secondaryAccent: '#ffcb80',
    swatch: ['#091324', '#40f5ff'],
    posterTag: 'MOONLIGHT BAY · 3D CARD',
  },

  /* -------- 3. 未来科技 -------- */
  {
    id: 'tech_cyan',
    template: 'city',
    label: '量子冰蓝',
    emoji: '⚡',
    desc: '钛黑晶圆 · 冰蓝全息',
    studioBg: '#070c17',
    isDark: true,
    lightingPreset: 'night',
    lightingCfg: {
      sun: '#93c5fd',
      sunI: 1.1,
      hemiSky: '#2c487d',
      hemiGround: '#0e1420',
      hemiI: 0.75,
      rimColor: '#38e8ff',
      rimI: 0.72,
      envIntensity: 1.15,
    },
    accent: '#38e8ff',
    secondaryAccent: '#60a5fa',
    swatch: ['#070c17', '#38e8ff'],
    posterTag: 'QUANTUM TECH · 3D CARD',
  },
  {
    id: 'tech_cyber',
    template: 'city',
    label: '赛博洋红',
    emoji: '🔮',
    desc: '霓虹紫粉 · 未来夜城',
    studioBg: '#11081c',
    isDark: true,
    lightingPreset: 'night',
    lightingCfg: {
      sun: '#e879f9',
      sunI: 1.15,
      hemiSky: '#4a2075',
      hemiGround: '#1a0c26',
      hemiI: 0.8,
      rimColor: '#ff3b9a',
      rimI: 0.85,
      envIntensity: 1.15,
    },
    accent: '#ff3b9a',
    secondaryAccent: '#a855f7',
    swatch: ['#11081c', '#ff3b9a'],
    posterTag: 'CYBER NEON · 3D CARD',
  },
  {
    id: 'tech_gold',
    template: 'city',
    label: '黑金算力',
    emoji: '👑',
    desc: '曜石黑金 · 鎏金核心',
    studioBg: '#0f0d0a',
    isDark: true,
    lightingPreset: 'night',
    lightingCfg: {
      sun: '#fde68a',
      sunI: 1.25,
      hemiSky: '#544324',
      hemiGround: '#1c160d',
      hemiI: 0.78,
      rimColor: '#fbbf24',
      rimI: 0.82,
      envIntensity: 1.25,
    },
    accent: '#fbbf24',
    secondaryAccent: '#f59e0b',
    swatch: ['#0f0d0a', '#fbbf24'],
    posterTag: 'OBSIDIAN GOLD · 3D CARD',
  },

  /* -------- 4. 樱花庭院 -------- */
  {
    id: 'sakura_day',
    template: 'sakura_garden',
    label: '晴日落樱',
    emoji: '🌸',
    desc: '淡樱雾白 · 春日锦鲤池',
    studioBg: '#f7edf0',
    isDark: false,
    lightingPreset: 'morning',
    lightingCfg: {
      sun: '#fff5eb',
      sunI: 2.2,
      hemiSky: '#e8effa',
      hemiGround: '#4a5443',
      hemiI: 1.2,
      rimColor: '#ffd4e4',
      rimI: 0.55,
      envIntensity: 1.48,
    },
    accent: '#c94c76',
    secondaryAccent: '#f5a8c0',
    swatch: ['#f7edf0', '#c94c76'],
    posterTag: 'SAKURA GARDEN · 3D CARD',
  },
  {
    id: 'sakura_night',
    template: 'sakura_garden',
    label: '夜樱灯火',
    emoji: '🏮',
    desc: '夜光粉樱 · 石灯暖光',
    studioBg: '#120e1c',
    isDark: true,
    lightingPreset: 'night',
    lightingCfg: {
      sun: '#c5b8f0',
      sunI: 1.1,
      hemiSky: '#43386b',
      hemiGround: '#241b2c',
      hemiI: 0.92,
      rimColor: '#ff9ec6',
      rimI: 0.75,
      envIntensity: 1.1,
    },
    accent: '#ff8fb8',
    secondaryAccent: '#ffd166',
    swatch: ['#120e1c', '#ff8fb8'],
    posterTag: 'NIGHT SAKURA · 3D CARD',
  },
  {
    id: 'sakura_sunset',
    template: 'sakura_garden',
    label: '暮色绯樱',
    emoji: '🌇',
    desc: '晚霞琥珀 · 暖绯樱庭',
    studioBg: '#f5ded8',
    isDark: false,
    lightingPreset: 'dusk',
    lightingCfg: {
      sun: '#ffb38a',
      sunI: 2.1,
      hemiSky: '#f5c7cb',
      hemiGround: '#593e3c',
      hemiI: 1.12,
      rimColor: '#ff9db2',
      rimI: 0.65,
      envIntensity: 1.38,
    },
    accent: '#b8325f',
    secondaryAccent: '#ff9a85',
    swatch: ['#f5ded8', '#cf4e74'],
    posterTag: 'DUSK SAKURA · 3D CARD',
  },

  /* -------- 5. 雪山木屋 -------- */
  {
    id: 'snow_day',
    template: 'snow_cabin',
    label: '初霁暖阳',
    emoji: '☀️',
    desc: '清透白雪 · 阿尔卑斯午后',
    studioBg: '#dce7f3',
    isDark: false,
    lightingPreset: 'noon',
    lightingCfg: {
      sun: '#fffdf7',
      sunI: 2.45,
      hemiSky: '#e2effc',
      hemiGround: '#728599',
      hemiI: 1.25,
      rimColor: '#c7ddf5',
      rimI: 0.55,
      envIntensity: 1.5,
    },
    accent: '#2c72a3',
    secondaryAccent: '#f5a65b',
    swatch: ['#dce7f3', '#2c72a3'],
    posterTag: 'SNOWY CABIN · 3D CARD',
  },
  {
    id: 'snow_aurora',
    template: 'snow_cabin',
    label: '雪山极光',
    emoji: '🌌',
    desc: '翡翠极光幕 · 暖窗炉火',
    studioBg: '#071321',
    isDark: true,
    lightingPreset: 'night',
    lightingCfg: {
      sun: '#7dd3fc',
      sunI: 1.1,
      hemiSky: '#286475',
      hemiGround: '#1a2d42',
      hemiI: 0.96,
      rimColor: '#34f5b5',
      rimI: 0.85,
      envIntensity: 1.12,
    },
    accent: '#4bf2c0',
    secondaryAccent: '#ffae52',
    swatch: ['#071321', '#38f0b8'],
    posterTag: 'AURORA CABIN · 3D CARD',
  },
  {
    id: 'snow_dusk',
    template: 'snow_cabin',
    label: '蓝调暮雪',
    emoji: '🌆',
    desc: '北欧蓝调 · 木屋微光',
    studioBg: '#c8d6ea',
    isDark: false,
    lightingPreset: 'dusk',
    lightingCfg: {
      sun: '#f5b89a',
      sunI: 1.75,
      hemiSky: '#9eb8de',
      hemiGround: '#54667d',
      hemiI: 1.12,
      rimColor: '#ffb870',
      rimI: 0.72,
      envIntensity: 1.3,
    },
    accent: '#25527d',
    secondaryAccent: '#ffae5c',
    swatch: ['#c8d6ea', '#ffae5c'],
    posterTag: 'BLUE HOUR CABIN · 3D CARD',
  },
]

export const CUSTOM_BG_SWATCHES = [
  { label: '柔雾粉', color: '#f0e2e7' },
  { label: '奶油白', color: '#f2eae2' },
  { label: '淡樱粉', color: '#f7edf0' },
  { label: '冬雾蓝', color: '#dce7f3' },
  { label: '森系绿', color: '#dde9e1' },
  { label: '极光夜', color: '#071321' },
  { label: '赛博黑', color: '#11081c' },
]

export const CUSTOM_TEXT_SWATCHES = [
  { label: '奶霜白', color: '#fff8f0' },
  { label: '冰川青', color: '#38e8ff' },
  { label: '绯樱粉', color: '#f472b6' },
  { label: '琥珀金', color: '#fbbf24' },
  { label: '森松绿', color: '#2a6646' },
  { label: '海渊蓝', color: '#1d4f6e' },
  { label: '深梅红', color: '#91244d' },
]

export function getMoodsForTemplate(tpl: TemplateId): MoodSkin[] {
  return MOOD_LIST.filter((m) => m.template === tpl)
}

export function getMoodSkin(tpl: TemplateId, moodId?: string): MoodSkin {
  const list = getMoodsForTemplate(tpl)
  if (moodId) {
    const found = list.find((m) => m.id === moodId)
    if (found) return found
  }
  return list[0] ?? MOOD_LIST[0]
}

export function isDarkHex(hex: string): boolean {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return false
  const n = parseInt(clean, 16)
  if (Number.isNaN(n)) return false
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b < 135
}

export interface ResolvedSceneTheme {
  mood: MoodSkin
  bgColor: string
  isDark: boolean
  customTextColor?: string
  accent: string
  secondaryAccent: string
}

export function resolveSceneTheme(spec: SceneSpec): ResolvedSceneTheme {
  const mood = getMoodSkin(spec.template, spec.mood)
  const bgColor = spec.customBg || mood.studioBg
  const isDark = isDarkHex(bgColor)
  return {
    mood,
    bgColor,
    isDark,
    customTextColor: spec.customTextColor || undefined,
    accent: mood.accent,
    secondaryAccent: mood.secondaryAccent,
  }
}

export function makeHexVariants(hex: string): [string, string, string, string] {
  const clean = hex.replace('#', '')
  const n = parseInt(clean, 16)
  if (clean.length !== 6 || Number.isNaN(n)) return ['#ffffff', '#e2e8f0', '#cbd5e1', '#94a3b8']
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const shift = (d: number) => {
    const nr = Math.min(255, Math.max(0, Math.round(r + d)))
    const ng = Math.min(255, Math.max(0, Math.round(g + d)))
    const nb = Math.min(255, Math.max(0, Math.round(b + d)))
    return `#${((nr << 16) | (ng << 8) | nb).toString(16).padStart(6, '0')}`
  }
  return [shift(28), hex, shift(-24), shift(48)]
}
