import { cloud, withRetry } from './cloud'
import type { ChatCompletionContentPart } from '@tencent-ai/workbuddy-cloud-sdk'
import { SCHEMA_VERSION, TEMPLATES, FOLIAGE_PRESETS, LIGHTING_PRESETS, parseSceneSpec, type SceneSpec } from '../contracts/scene-spec'
import { photoToDataUrl, extractPalette } from './storage'

export const PLANNER_VERSION = 'planner-v0.1-singleagent'

interface AnalyzeResult {
  spec: SceneSpec
  ok: boolean
  usedFallback: boolean
  plannerVersion: string
}

/** 生成 SceneSpec 的系统提示词（照片 + 主色 → 结构化 JSON） */
function systemPrompt(): string {
  return [
    '你是 3D 名片场景规划器。根据用户照片输出一个 JSON 的 SceneSpec，用于驱动固定的 Three.js 渲染引擎。',
    `严格输出 JSON 对象，不包含任何解释文字。schemaVersion 固定为 "${SCHEMA_VERSION}"。`,
    `template 只能是已注册模板之一：${TEMPLATES.join(', ')}。`,
    '场景选择：提到海边/沙滩/大海用 "coast"；提到科技/城市/夜景/霓虹用 "city"；提到樱花/庭院/和风/粉色用 "sakura_garden"；提到雪山/木屋/冬日/下雪用 "snow_cabin"；森林/山地/草原用 "mountain_forest"。',
    'palette 包含 primary/secondary/surface/accent 四个 #RRGGBB 颜色，来自照片主色。',
    'environment.terrain: kind 固定 "heightfield"，amplitude 0.1–1.2，roughness 0.2–0.9。',
    'environment.terrain.bumps: 地形雕塑控制点数组（最多 8 个，可为空数组 []），每项 {x, y, radius, height}：x∈[-1,1]（-1 最左 1 最右）、y∈[-1,1]（-1 最下 1 最上）、radius 0.15–1.4、height -0.6–0.8（正=隆起，负=凹陷）。',
    'environment.water: enabled 布尔，level -0.3–0.45，reflectionQuality 为 off/low/medium。',
    `environment.foliage: preset 为 ${FOLIAGE_PRESETS.join(', ')} 之一；density 为 low/medium/high。`,
    `environment.lighting: preset 为 ${LIGHTING_PRESETS.join(', ')} 之一；direction 为 [x,y,z] 三个 -1..1 的小数（y≥0.1）；fog 0–0.6。`,
    'camera: default 固定 "commercial"，allowOrbit true，minPolarAngle 0–1.57，maxPolarAngle 1.57–3.14。',
    'quality: target 固定 "auto"，maxDrawCalls 固定 120。',
    '如果用户提供了想法描述：把其中的空间/地形意图（如“左边要高一点”“中间凹一片洼地”）转成 terrain.bumps 控制点，把氛围/元素意图转成 lighting / foliage / palette 的对应调整；没有明确空间意图时 bumps 输出 []。',
    '根据照片的主题（森林/山地、海岸、城市或抽象）与色调，选择最接近的参数组合。不要输出 JSON 之外的任何内容。',
  ].join('\n')
}

function userContent(photoDataUrls: string[], palette: string[], idea?: string): ChatCompletionContentPart[] {
  const ideaText = idea && idea.trim()
    ? `用户的想法描述：「${idea.trim().slice(0, 200)}」。请把这段描述中的地形空间意图转成 terrain.bumps 控制点，氛围意图转成 lighting/foliage 调整。`
    : '用户没有提供想法描述，bumps 输出 []。'
  const hasPhotos = photoDataUrls.length > 0
  const lead = hasPhotos
    ? `这是用户上传的照片。本地预提取的主色板为 ${palette.join(', ')}。${ideaText}`
    : `用户未上传照片，请完全依据想法描述规划场景。${ideaText}`
  const parts: ChatCompletionContentPart[] = [
    {
      type: 'text',
      text:
        `${lead}` +
        '请输出对应的 SceneSpec JSON：主题类型、颜色应与描述相符，光照氛围应接近描述的光线感觉。',
    } as ChatCompletionContentPart,
    ...photoDataUrls.map((url) => ({
      type: 'image_url',
      image_url: { url },
    } as ChatCompletionContentPart)),
  ]
  return parts
}

async function pickVisionModel(): Promise<{ id: string; name: string } | null> {
  const models = await cloud.llm.models.list()
  const usable = models.filter((m) => m.disabled !== true)
  const vision = usable.find((m) => m.supportsImages === true)
  return vision ? { id: vision.id, name: vision.name ?? vision.id } : usable.length > 0 ? { id: usable[0].id, name: usable[0].name ?? usable[0].id } : null
}

/**
 * 照片分析与场景规划管线（PRD 9.2）：
 * 选择照片(客户端校验) → 视觉分析(云端视觉模型) → 场景规划(同一调用内) → 校验(Zod) → 失败回退预设。
 * idea 为用户自由文字描述（v0.2），会被拼入规划提示词。
 */
export async function generateSceneSpec(
  files: File[],
  opts: { idea?: string } | undefined,
  onProgress?: (step: string) => void,
): Promise<AnalyzeResult> {
  onProgress?.('提取照片主色…')
  const palettes: string[][] = []
  for (const f of files.slice(0, 3)) {
    try {
      palettes.push(await extractPalette(f))
    } catch {
      /* 主色提取失败不阻断 */
    }
  }
  const palette = palettes.flat().slice(0, 4)
  while (palette.length < 4) palette.push(['#3f7a3a', '#8fbf5e', '#c9b48e', '#8fb4c5'][palette.length])

  onProgress?.('准备参考图…')
  const dataUrls: string[] = []
  for (const f of files.slice(0, 2)) {
    dataUrls.push(await photoToDataUrl(f, 640))
  }

  onProgress?.('分析照片并规划场景…')
  const model = await withRetry('获取模型列表', () => pickVisionModel())
  if (!model) throw new Error('当前环境没有可用的大模型')

  onProgress?.('分析照片并规划场景…（约 10–30 秒，请保持网络畅通）')
  const answer = await withRetry(
    '视觉模型调用',
    async () => {
      let collected = ''
      const controller = new AbortController()
      for await (const chunk of cloud.llm.chat.completions.create({
        model: model.id,
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: userContent(dataUrls, palette, opts?.idea) },
        ],
        stream: true,
        response_format: { type: 'json_object' },
        temperature: 0.4,
        signal: controller.signal,
      })) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) collected += delta
      }
      return collected
    },
    1,
  )

  onProgress?.('校验场景配置…')
  let parsed: unknown = null
  try {
    parsed = JSON.parse(answer)
  } catch {
    /* 解析失败走回退 */
  }
  if (parsed) {
    const { spec, ok } = parseSceneSpec(parsed)
    if (ok) return { spec, ok: true, usedFallback: false, plannerVersion: `${PLANNER_VERSION}+${model.id}` }
  }
  // FR-11：AI 输出缺失或非法时回退到安全预设，并用照片主色覆盖调色板
  const fallback = parseSceneSpec(null).spec
  fallback.palette = {
    primary: palette[0],
    secondary: palette[1],
    surface: palette[2],
    accent: palette[3],
  }
  return { spec: fallback, ok: false, usedFallback: true, plannerVersion: `${PLANNER_VERSION}+fallback` }
}
