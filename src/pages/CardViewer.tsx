import { useEffect, useMemo, useRef, useState } from 'react'
import { getPublicCard } from '../lib/db'
import type { CardRow, ProfileData } from '../lib/db'
import {
  morningForestSpec,
  neonCitySpec,
  parseSceneSpec,
  sakuraGardenSpec,
  snowCabinSpec,
  sunsetCoastSpec,
  templatePresets,
} from '../contracts/scene-spec'
import { getMoodSkin, resolveSceneTheme } from '../contracts/moods'
import { getAccessoryInfo } from '../contracts/accessories'
import { getMbtiInfo } from '../contracts/mbti'
import { CardScene, hasWebGL, type ViewPreset } from '../scene-engine/CardScene'
import { SceneErrorBoundary } from '../scene-engine/SceneErrorBoundary'
import { makeFrontTexture, type CardProfile } from '../scene-engine/cardTexture'
import { errorMessage } from '../lib/cloud'
import { withShareCode } from '../lib/share'
import { useHashNavigate } from '../lib/nav'
import { downloadVCard } from '../lib/vcard'

function makeDemoCard(
  id: number,
  slug: string,
  profile: ProfileData,
  spec: ReturnType<typeof morningForestSpec>,
): CardRow {
  const now = '2026-11-24T12:00:00Z'
  return {
    id,
    owner_id: 'demo',
    owner_name: profile.name,
    slug,
    profile_json: profile,
    scene_spec: spec,
    published_profile: profile,
    published_spec: spec,
    status: 'published',
    published_at: now,
    created_at: now,
    updated_at: now,
  }
}

const DEMO_CARDS: Record<string, CardRow> = {
  'demo-forest': makeDemoCard(
    -1,
    'demo-forest',
    {
      name: '林深见鹿',
      title: '独立设计师 · 创意总监',
      bio: '用微缩森林讲述个人故事，欢迎拖动旋转并翻看背面。',
      mbti: 'ENFP',
      accessory: 'dog',
      website: 'https://studio.example.com',
      links: [
        { type: 'wechat', label: '微信', url: 'lin_studio_3d' },
        { type: 'website', label: '作品集', url: 'https://studio.example.com' },
        { type: 'github', label: 'GitHub', url: 'https://github.com/example' },
        { type: 'email', label: '邮箱', url: 'mailto:hello@example.com' },
      ],
      photoCount: 0,
    },
    morningForestSpec(),
  ),
  'demo-coast': makeDemoCard(
    -2,
    'demo-coast',
    {
      name: '海风予你',
      title: '旅行摄影师 · 视觉策展',
      bio: '把一片带海浪与遮阳伞的夏日光影放进名片。',
      mbti: 'ISFP',
      accessory: 'camera',
      website: 'https://coast.example.com',
      links: [
        { type: 'wechat', label: '微信', url: 'coast_photo_2026' },
        { type: 'xiaohongshu', label: '小红书', url: 'https://www.xiaohongshu.com' },
        { type: 'website', label: '作品集', url: 'https://coast.example.com' },
      ],
      photoCount: 0,
    },
    sunsetCoastSpec(),
  ),
  'demo-tech': makeDemoCard(
    -3,
    'demo-tech',
    {
      name: 'Alex Chen',
      title: 'AI 架构师 · 独立开发者',
      bio: 'Building spatial web & next-gen AI products.',
      mbti: 'INTJ',
      accessory: 'laptop',
      links: [
        { type: 'wechat', label: '微信', url: 'alex_quantum_dev' },
        { type: 'github', label: 'GitHub', url: 'https://github.com/example' },
        { type: 'email', label: '邮箱', url: 'mailto:alex@example.com' },
      ],
      photoCount: 0,
    },
    neonCitySpec(),
  ),
  'demo-sakura': makeDemoCard(
    -4,
    'demo-sakura',
    {
      name: '林浅樱',
      title: '独立插画师 · 绘本作者',
      bio: '把春天的樱花庭院、锦鲤青池与橘猫放进随身名片里。',
      mbti: 'INFP',
      accessory: 'cat',
      website: 'https://sakura.example.com',
      links: [
        { type: 'wechat', label: '微信', url: 'sakura_art_studio' },
        { type: 'xiaohongshu', label: '小红书', url: 'https://www.xiaohongshu.com' },
        { type: 'website', label: '插画集', url: 'https://sakura.example.com' },
      ],
      photoCount: 0,
    },
    sakuraGardenSpec(),
  ),
  'demo-snow': makeDemoCard(
    -5,
    'demo-snow',
    {
      name: '陈北木',
      title: '建筑设计师 · 空间主理人',
      bio: '冬雪初霁，木屋炉火正暖。欢迎旋转名片探索双面微缩雪境。',
      mbti: 'INFJ',
      accessory: 'coffee',
      website: 'https://snow.example.com',
      links: [
        { type: 'wechat', label: '微信', url: 'chen_atelier_3d' },
        { type: 'website', label: '建筑作品', url: 'https://snow.example.com' },
        { type: 'email', label: '邮箱', url: 'mailto:hello@snow.example.com' },
      ],
      photoCount: 0,
    },
    snowCabinSpec(),
  ),
}

function isWechatLink(link: { type: string; url: string }): boolean {
  const val = link.url.trim()
  return link.type === 'wechat' && val.length > 0 && !/^(javascript|data|vbscript|file):/i.test(val)
}

function isSafeUrlLink(link: { type: string; url: string }): boolean {
  return link.type !== 'wechat' && /^(https?:\/\/|mailto:)/i.test(link.url.trim())
}

/** WebGL 不可用或渲染崩溃时的静态降级（US-006 / FR-22） */
function StaticFallback({
  profile,
  spec,
  onCopyWechat,
}: {
  profile: CardProfile
  spec: ReturnType<typeof parseSceneSpec>['spec']
  onCopyWechat?: (wechatId: string) => void
}) {
  const dataUrl = useMemo(() => {
    try {
      const tex = makeFrontTexture(profile, spec)
      const canvas = tex.image as HTMLCanvasElement
      const url = canvas.toDataURL('image/png')
      tex.dispose()
      return url
    } catch {
      return null
    }
  }, [profile, spec])

  const allLinks = profile.links ?? []
  const urlLinks = allLinks.filter(isSafeUrlLink)
  const wechats = allLinks.filter(isWechatLink)

  return (
    <div className="static-card">
      <div className="inner">
        {dataUrl && <img src={dataUrl} alt="名片正面" />}
        <strong>{profile.name}</strong>
        <span className="muted">{profile.title}</span>
        {profile.bio && <span className="muted bio">{profile.bio}</span>}
        <div className="static-links">
          {wechats.map((w, i) => (
            <button
              key={`wx-${i}`}
              type="button"
              onClick={() => onCopyWechat?.(w.url.trim())}
            >
              微信 · {w.url.trim()}
            </button>
          ))}
          {urlLinks.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          ))}
        </div>
        <span className="hint">当前浏览器不支持 3D 展示，已为你显示名片信息。可尝试使用系统浏览器（如 Chrome）获得完整 3D 效果。</span>
      </div>
    </div>
  )
}

export function CardViewerPage({ slug }: { slug: string }) {
  const go = useHashNavigate()
  const [card, setCard] = useState<CardRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewPreset>('commercial')
  const [hintShown, setHintShown] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const demo = DEMO_CARDS[slug]
    if (demo) {
      const qIdx = location.hash.indexOf('?')
      const moodQuery = qIdx >= 0 ? new URLSearchParams(location.hash.slice(qIdx + 1)).get('mood') : null
      if (moodQuery && demo.published_spec) {
        const nextSpec = JSON.parse(JSON.stringify(demo.published_spec)) as typeof demo.published_spec
        const skin = getMoodSkin(nextSpec.template, moodQuery)
        nextSpec.mood = skin.id
        nextSpec.environment.lighting.preset = skin.lightingPreset
        setCard({ ...demo, scene_spec: nextSpec, published_spec: nextSpec })
      } else {
        setCard(demo)
      }
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getPublicCard(slug)
      .then((row) => {
        if (cancelled) return
        setCard(row)
        setError(row ? null : '没有找到这张名片，或它还未发布。')
      })
      .catch((err) => {
        if (cancelled) return
        setError(`加载失败：${errorMessage(err)}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  async function copyWechat(wechatId: string) {
    try {
      await navigator.clipboard.writeText(wechatId)
      showToast(`微信号「${wechatId}」已复制，去微信搜索添加`)
    } catch {
      showToast(`请长按复制微信号：${wechatId}`)
    }
  }

  if (loading) {
    return <div className="viewer"><div className="loading-screen">正在加载名片…</div></div>
  }

  if (error || !card) {
    return (
      <div className="viewer">
        <div className="static-card">
          <div className="inner">
            <strong>3D 名片</strong>
            <span className="muted">{error}</span>
          </div>
        </div>
      </div>
    )
  }

  const profile = (card.published_profile ?? { name: '未命名', title: '', bio: '', links: [] }) as ProfileData
  const parsed = parseSceneSpec(card.published_spec)
  const cardProfile: CardProfile = {
    name: profile.name,
    title: profile.title,
    bio: profile.bio,
    mbti: profile.mbti,
    accessory: profile.accessory,
    links: profile.links ?? [],
  }
  const mbtiInfo = getMbtiInfo(profile.mbti)
  const accInfo = getAccessoryInfo(profile.accessory)
  const sceneTheme = resolveSceneTheme(parsed.spec)
  const isDark = sceneTheme.isDark
  const tplIdx = Math.max(0, templatePresets.findIndex((t) => t.id === parsed.spec.template))
  const publicUrl = withShareCode(location.href.split('#')[0] + '#/card/' + slug)

  // 公开链接只放行安全协议（FR-5 / FR-28），微信单独做复制交互
  const allLinks = cardProfile.links ?? []
  const wechatLinks = allLinks.filter(isWechatLink)
  const safeLinks = allLinks.filter(isSafeUrlLink)
  const hasWebgl = hasWebGL()

  return (
    <div className={isDark ? 'viewer viewer-dark' : 'viewer'}>
      {toast && <div className="toast">{toast}</div>}

      <div className="intro">
        <h1>{profile.name}</h1>
        <p>{profile.title}</p>
        {(mbtiInfo || accInfo) && (
          <div className="viewer-badges">
            {mbtiInfo && (
              <div className="mbti-pill" style={{ borderColor: mbtiInfo.color }}>
                <img src={mbtiInfo.avatar} alt={mbtiInfo.code} />
                <span>{mbtiInfo.code} · {mbtiInfo.title}</span>
              </div>
            )}
            {accInfo && (
              <div className="acc-pill" style={{ borderColor: accInfo.accent }}>
                <span>{accInfo.emoji}</span>
                <span>{accInfo.label}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 裂变入口：做一张同款 */}
      <button
        type="button"
        className="viewer-remake"
        onClick={() =>
          go(`/editor?tpl=${tplIdx}${parsed.spec.mood ? `&mood=${encodeURIComponent(parsed.spec.mood)}` : ''}`)
        }
      >
        ✨ 做一张同款
      </button>

      {/* 右上角快捷交互：一键翻面 & 存通讯录 */}
      <div className="viewer-actions">
        {hasWebgl && (
          <button
            type="button"
            className="action-pill"
            onClick={() => {
              setView((v) => (v === 'back' ? 'commercial' : 'back'))
              setHintShown(false)
            }}
          >
            {view === 'back' ? '🔄 翻回正面' : '🔄 翻看背面'}
          </button>
        )}
        <button
          type="button"
          className="action-pill"
          onClick={() => {
            downloadVCard(profile, publicUrl)
            showToast('已生成通讯录名片 (.vcf)，可导入手机联系人')
          }}
        >
          📇 存通讯录
        </button>
      </div>

      <div className="canvas-host">
        {hasWebgl && parsed.spec ? (
          <SceneErrorBoundary
            fallback={<StaticFallback profile={cardProfile} spec={parsed.spec} onCopyWechat={copyWechat} />}
          >
            <CardScene
              spec={parsed.spec}
              profile={cardProfile}
              view={view}
              qrText={publicUrl}
              onCardClick={(side) => {
                setView(side === 'back' ? 'back' : 'front')
                setHintShown(false)
              }}
            />
          </SceneErrorBoundary>
        ) : (
          <StaticFallback profile={cardProfile} spec={parsed.spec} onCopyWechat={copyWechat} />
        )}
      </div>
      {hintShown && hasWebgl && (
        <div className="stage-tip">拖动查看世界 · 点右上「翻看背面」查看二维码</div>
      )}
      <div className="links">
        {wechatLinks.map((l, i) => (
          <button
            key={`wx-${i}`}
            type="button"
            className="link-chip"
            onClick={() => copyWechat(l.url.trim())}
          >
            微信 · 复制
          </button>
        ))}
        {safeLinks.map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noopener noreferrer">
            {l.label}
          </a>
        ))}
        {safeLinks.length === 0 && profile.website && /^(https?:\/\/)/i.test(profile.website) && (
          <a href={profile.website} target="_blank" rel="noopener noreferrer">个人网站</a>
        )}
      </div>
    </div>
  )
}
