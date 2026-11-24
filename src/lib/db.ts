import { cloud } from './cloud'
import type { SceneSpec } from '../contracts/scene-spec'

/* eslint-disable @typescript-eslint/no-explicit-any */
// 未生成 Database 泛型类型时，from() 的行类型为 never；这里用宽松类型保持可读性
const db = cloud.database as unknown as { from: (table: string) => any; rpc: (fn: string, args?: any) => any }

/**
 * 数据模型（PRD 第 11 节）：
 * - cards：项目主表（资料草稿 + 当前场景 + 已发布快照）
 * - scene_versions：场景版本（保留最近 5 个，FR-13）
 * - publications：发布记录
 * 照片等素材保存在云存储 users/<uid>/photos/ 下（Asset 的 storageKey 存于 profile 中）。
 */

export interface ProfileData {
  name: string
  title: string
  bio: string
  mbti?: string
  accessory?: string
  website?: string
  links: { type: string; label: string; url: string }[]
  photoCount: number
}

export interface CardRow {
  id: number
  owner_id: string
  owner_name: string | null
  slug: string
  profile_json: ProfileData | null
  scene_spec: SceneSpec | null
  published_profile: ProfileData | null
  published_spec: SceneSpec | null
  status: 'draft' | 'generating' | 'ready' | 'published' | 'failed'
  published_at: string | null
  created_at: string
  updated_at: string
}

const MAX_VERSIONS = 5

export async function listMyCards(): Promise<CardRow[]> {
  const { data, error } = await db.from('cards')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as CardRow[]
}

export async function getCard(id: number): Promise<CardRow | null> {
  const { data, error } = await db.from('cards').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as CardRow) ?? null
}

export async function createCard(ownerName: string | null): Promise<CardRow> {
  const slug = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const { data, error } = await db.from('cards')
    .insert({ slug, status: 'draft', owner_name: ownerName })
    .select()
  if (error) throw error
  return (data as CardRow[])[0]
}

export async function updateCardDraft(
  id: number,
  patch: { profile_json?: ProfileData; scene_spec?: SceneSpec; status?: CardRow['status'] },
): Promise<CardRow | null> {
  const { data, error } = await db.from('cards').update(patch).eq('id', id).select()
  if (error) throw error
  const rows = (data ?? []) as CardRow[]
  if (rows.length === 0) throw new Error('保存失败：名片不存在或不属于当前账号')
  return rows[0]
}

export async function deleteCard(id: number): Promise<boolean> {
  const { data, error } = await db.from('cards').delete().eq('id', id).select()
  if (error) throw error
  return Array.isArray(data) && data.length > 0
}

/** 保存一个场景版本，并清理只保留最近 5 个版本 */
export async function saveSceneVersion(
  cardId: number,
  sceneSpec: SceneSpec,
  sourceAssetKeys: string[],
  plannerVersion: string,
): Promise<number> {
  const { data: existing, error: e1 } = await db.from('scene_versions')
    .select('version')
    .eq('card_id', cardId)
    .order('version', { ascending: false })
    .limit(1)
  if (e1) throw e1
  const nextVersion = ((existing?.[0] as { version: number } | undefined)?.version ?? 0) + 1

  const { data, error } = await db.from('scene_versions')
    .insert({ card_id: cardId, version: nextVersion, scene_spec: sceneSpec, source_asset_keys: sourceAssetKeys, planner_version: plannerVersion })
    .select()
  if (error) throw error
  const versionId = (data as { id: number }[])[0].id

  // 清理旧版本：保留最近 MAX_VERSIONS 个
  const { data: olds, error: e2 } = await db.from('scene_versions')
    .select('id')
    .eq('card_id', cardId)
    .order('version', { ascending: false })
    .range(MAX_VERSIONS, MAX_VERSIONS + 100)
  if (!e2 && olds && olds.length > 0) {
    const ids = (olds as { id: number }[]).map((r) => r.id)
    await db.from('scene_versions').delete().in('id', ids)
  }
  return versionId
}

export async function listSceneVersions(cardId: number) {
  const { data, error } = await db.from('scene_versions')
    .select('id, version, scene_spec, planner_version, created_at')
    .eq('card_id', cardId)
    .order('version', { ascending: false })
    .limit(MAX_VERSIONS)
  if (error) throw error
  return (data ?? []) as { id: number; version: number; scene_spec: SceneSpec; planner_version: string | null; created_at: string }[]
}

/** 发布：写入不可变快照并更新公开指向（FR-24） */
export async function publishCard(card: CardRow): Promise<CardRow> {
  if (!card.profile_json || !card.scene_spec) throw new Error('请先完成资料填写并生成场景')
  const { data, error } = await db.from('cards')
    .update({
      status: 'published',
      published_profile: card.profile_json,
      published_spec: card.scene_spec,
      published_at: new Date().toISOString(),
    })
    .eq('id', card.id)
    .select()
  if (error) throw error
  const rows = (data ?? []) as CardRow[]
  if (rows.length === 0) throw new Error('发布失败：名片不存在或不属于当前账号')

  await db.from('publications').insert({
    card_id: card.id,
    slug: card.slug,
    scene_version: card.scene_spec.schemaVersion,
    action: 'publish',
  })
  return rows[0]
}

/** 公开读取：只返回已发布名片（匿名可访问，RLS 保证只读 published） */
export async function getPublicCard(slug: string): Promise<CardRow | null> {
  const { data, error } = await db.from('cards')
    .select('slug, published_profile, published_spec, status, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw error
  return (data as CardRow) ?? null
}
