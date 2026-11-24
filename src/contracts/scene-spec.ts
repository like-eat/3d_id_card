import { z } from 'zod'

/**
 * SceneSpec —— AI、编辑器、存储和渲染引擎之间的核心数据契约（PRD 第 8 节）。
 * 所有数值必须有上下限；枚举字段只能使用已注册模板；
 * 不允许携带任意 JavaScript / HTML / 着色器源码。
 */

export const SCHEMA_VERSION = '1.1'

/** 已注册的场景模板（模板名不映射为文件路径） */
export const TEMPLATES = ['mountain_forest', 'coast', 'city', 'sakura_garden', 'snow_cabin'] as const
export type TemplateId = (typeof TEMPLATES)[number]

export const FOLIAGE_PRESETS = ['pine_grass', 'pine_flower', 'birch_grass'] as const
export const LIGHTING_PRESETS = ['morning', 'noon', 'golden_hour', 'dusk', 'overcast', 'night'] as const
export const DENSITY = ['low', 'medium', 'high'] as const
export const QUALITY_TARGET = ['auto', 'low', 'medium', 'high'] as const
export const CAMERA_PRESET = ['commercial', 'front', 'back', 'free'] as const

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, '必须是 #RRGGBB 格式颜色')

/** 地形雕塑控制点：x/y 为归一化坐标（-1..1），height 正=隆起 负=凹陷 */
export const bumpSchema = z.object({
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
  radius: z.number().min(0.15).max(1.4),
  height: z.number().min(-0.6).max(0.8),
})
export type TerrainBump = z.infer<typeof bumpSchema>

export const paletteSchema = z.object({
  primary: hexColor,
  secondary: hexColor,
  surface: hexColor,
  accent: hexColor,
})

export const terrainSchema = z.object({
  kind: z.literal('heightfield'),
  amplitude: z.number().min(0.1).max(1.2),
  roughness: z.number().min(0.2).max(0.9),
  bumps: z.array(bumpSchema).max(8).default([]),
})

export const waterSchema = z.object({
  enabled: z.boolean(),
  level: z.number().min(-0.3).max(0.45),
  reflectionQuality: z.enum(['off', 'low', 'medium']).default('low'),
})

export const foliageSchema = z.object({
  preset: z.enum(FOLIAGE_PRESETS),
  density: z.enum(DENSITY),
})

export const lightingSchema = z.object({
  preset: z.enum(LIGHTING_PRESETS),
  direction: z.tuple([z.number().min(-1).max(1), z.number().min(0.1).max(1), z.number().min(-1).max(1)]),
  fog: z.number().min(0).max(0.6),
})

export const cameraSchema = z.object({
  default: z.enum(CAMERA_PRESET),
  allowOrbit: z.boolean(),
  minPolarAngle: z.number().min(0).max(Math.PI / 2),
  maxPolarAngle: z.number().min(1.0).max(Math.PI),
})

export const qualitySchema = z.object({
  target: z.enum(QUALITY_TARGET),
  maxDrawCalls: z.number().int().min(30).max(300),
})

export const sceneSpecSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  template: z.enum(TEMPLATES),
  palette: paletteSchema,
  environment: z.object({
    terrain: terrainSchema,
    water: waterSchema,
    foliage: foliageSchema,
    lighting: lightingSchema,
  }),
  camera: cameraSchema,
  quality: qualitySchema,
})

export type SceneSpec = z.infer<typeof sceneSpecSchema>
export type Palette = z.infer<typeof paletteSchema>

/** 安全预设：Schema 校验失败或 AI 输出缺失字段时的回退（FR-11） */
export function defaultForestSpec(): SceneSpec {
  return {
    schemaVersion: SCHEMA_VERSION,
    template: 'mountain_forest',
    palette: {
      primary: '#20372f',
      secondary: '#708b67',
      surface: '#d5c5a3',
      accent: '#8fb4c5',
    },
    environment: {
      terrain: { kind: 'heightfield', amplitude: 0.42, roughness: 0.55, bumps: [] },
      water: { enabled: true, level: 0.18, reflectionQuality: 'low' },
      foliage: { preset: 'pine_grass', density: 'medium' },
      lighting: { preset: 'morning', direction: [0.5, 1, 0.4], fog: 0.18 },
    },
    camera: {
      default: 'commercial',
      allowOrbit: true,
      minPolarAngle: 0.55,
      maxPolarAngle: 1.6,
    },
    quality: { target: 'auto', maxDrawCalls: 120 },
  }
}

/** 手动模板选择时的预设列表（键为展示名） */
/** 固定模板（拍同款模式）：地形轮廓锁死，用户只换信息与配色（可微调光照/密度） */

export function morningForestSpec(): SceneSpec {
  const s = defaultForestSpec()
  s.environment.lighting = { preset: 'morning', direction: [0.5, 1, 0.4], fog: 0.18 }
  s.environment.terrain.bumps = [{ x: -0.45, y: 0.05, radius: 0.6, height: 0.4 }]
  return s
}

export function sunsetCoastSpec(): SceneSpec {
  const s = defaultForestSpec()
  s.template = 'coast'
  s.palette = {
    primary: '#b99a6d',
    secondary: '#dcc494',
    surface: '#e8d9b0',
    accent: '#4d9fd0',
  }
  s.environment.lighting = { preset: 'golden_hour', direction: [-0.5, 0.9, 0.6], fog: 0.2 }
  s.environment.terrain = {
    kind: 'heightfield',
    amplitude: 0.22,
    roughness: 0.45,
    bumps: [{ x: -0.5, y: -0.3, radius: 0.5, height: 0.22 }],
  }
  s.environment.water = { enabled: true, level: 0.2, reflectionQuality: 'medium' }
  s.environment.foliage = { preset: 'pine_grass', density: 'low' }
  return s
}

export function neonCitySpec(): SceneSpec {
  const s = defaultForestSpec()
  s.template = 'city'
  s.palette = {
    primary: '#1d2430',
    secondary: '#2a3442',
    surface: '#39465a',
    accent: '#ffd27d',
  }
  s.environment.lighting = { preset: 'night', direction: [0.3, 1, 0.2], fog: 0.08 }
  s.environment.terrain = {
    kind: 'heightfield',
    amplitude: 0.12,
    roughness: 0.4,
    bumps: [],
  }
  s.environment.water = { enabled: false, level: 0, reflectionQuality: 'off' }
  s.environment.foliage = { preset: 'pine_grass', density: 'low' }
  return s
}

export function sakuraGardenSpec(): SceneSpec {
  const s = defaultForestSpec()
  s.template = 'sakura_garden'
  s.palette = {
    primary: '#4e6c3f',
    secondary: '#f5a8c0',
    surface: '#e8ddd3',
    accent: '#c94c76',
  }
  s.environment.lighting = { preset: 'morning', direction: [0.45, 1, 0.45], fog: 0.12 }
  s.environment.terrain = {
    kind: 'heightfield',
    amplitude: 0.36,
    roughness: 0.48,
    bumps: [{ x: -0.5, y: 0.25, radius: 0.55, height: 0.3 }],
  }
  s.environment.water = { enabled: true, level: 0.16, reflectionQuality: 'medium' }
  s.environment.foliage = { preset: 'birch_grass', density: 'medium' }
  return s
}

export function snowCabinSpec(): SceneSpec {
  const s = defaultForestSpec()
  s.template = 'snow_cabin'
  s.palette = {
    primary: '#264f68',
    secondary: '#9fd0ee',
    surface: '#f2f7fc',
    accent: '#f5a65b',
  }
  s.environment.lighting = { preset: 'noon', direction: [0.4, 0.95, 0.5], fog: 0.15 }
  s.environment.terrain = {
    kind: 'heightfield',
    amplitude: 0.42,
    roughness: 0.5,
    bumps: [{ x: -0.55, y: 0.28, radius: 0.6, height: 0.36 }],
  }
  s.environment.water = { enabled: true, level: 0.15, reflectionQuality: 'low' }
  s.environment.foliage = { preset: 'pine_grass', density: 'medium' }
  return s
}

/** 手动模板选择列表（拍同款） */
export const templatePresets: { id: TemplateId; label: string; desc: string; make: () => SceneSpec }[] = [
  { id: 'mountain_forest', label: '晨雾森林', desc: '晨光薄雾 · 左丘右湖', make: morningForestSpec },
  { id: 'coast', label: '海岸沙滩', desc: '金色沙滩 · 远处海浪', make: sunsetCoastSpec },
  { id: 'city', label: '未来科技', desc: '量子核芯 · 全息电路', make: neonCitySpec },
  { id: 'sakura_garden', label: '樱花庭院', desc: '漫天樱雨 · 锦鲤青池', make: sakuraGardenSpec },
  { id: 'snow_cabin', label: '雪山木屋', desc: '冬日雪松 · 暖灯原木', make: snowCabinSpec },
]

/** 深拷贝一份模板场景（避免共享引用） */
export function cloneSpec(s: SceneSpec): SceneSpec {
  return JSON.parse(JSON.stringify(s)) as SceneSpec
}

/** 清洗任意来源的雕塑控制点：越界钳制、丢弃非法项（FR-11 安全回退的一部分） */
export function sanitizeBumps(raw: unknown): TerrainBump[] {
  if (!Array.isArray(raw)) return []
  const out: TerrainBump[] = []
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const x = Number(o.x)
    const y = Number(o.y)
    const radius = Number(o.radius)
    const height = Number(o.height)
    if (![x, y, radius, height].every((v) => Number.isFinite(v))) continue
    out.push({
      x: Math.min(1, Math.max(-1, x)),
      y: Math.min(1, Math.max(-1, y)),
      radius: Math.min(1.4, Math.max(0.15, radius)),
      height: Math.min(0.8, Math.max(-0.6, height)),
    })
  }
  return out
}

/** 校验并修复任意来源的 SceneSpec；不合法时回退安全预设（FR-10 / FR-11） */
export function parseSceneSpec(raw: unknown): { spec: SceneSpec; ok: boolean } {
  const parsed = sceneSpecSchema.safeParse(raw)
  if (parsed.success) return { spec: parsed.data, ok: true }
  // 尝试宽松修复：只保留能通过的字段，缺省字段用预设补齐
  const fallback = defaultForestSpec()
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    const merged = {
      ...fallback,
      ...r,
      schemaVersion: SCHEMA_VERSION,
      template: TEMPLATES.includes(r.template as TemplateId) ? r.template : fallback.template,
      palette: { ...fallback.palette, ...((r.palette as object) ?? {}) },
      environment: {
        terrain: {
          ...fallback.environment.terrain,
          ...(((r.environment as Record<string, object>)?.terrain as object) ?? {}),
          bumps: sanitizeBumps(((r.environment as Record<string, unknown>)?.terrain as Record<string, unknown> | undefined)?.bumps),
        },
        water: { ...fallback.environment.water, ...(((r.environment as Record<string, object>)?.water as object) ?? {}) },
        foliage: { ...fallback.environment.foliage, ...(((r.environment as Record<string, object>)?.foliage as object) ?? {}) },
        lighting: { ...fallback.environment.lighting, ...(((r.environment as Record<string, object>)?.lighting as object) ?? {}) },
      },
      camera: { ...fallback.camera, ...((r.camera as object) ?? {}) },
      quality: { ...fallback.quality, ...((r.quality as object) ?? {}) },
    }
    const repair = sceneSpecSchema.safeParse(merged)
    if (repair.success) return { spec: repair.data, ok: true }
  }
  return { spec: fallback, ok: false }
}

/** 生成不可猜测的 slug（FR-23） */
export function makeSlug(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  for (const b of bytes) s += chars[b % chars.length]
  return s
}
