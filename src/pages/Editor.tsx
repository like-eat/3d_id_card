import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '../lib/auth'
import { useHashNavigate } from '../lib/nav'
import { createCard, getCard, listMyCards, publishCard, saveSceneVersion, updateCardDraft } from '../lib/db'
import type { CardRow, ProfileData } from '../lib/db'
import { generateSceneSpec, PLANNER_VERSION } from '../lib/generate'
import { cloneSpec, templatePresets, type SceneSpec } from '../contracts/scene-spec'
import {
  CUSTOM_BG_SWATCHES,
  CUSTOM_TEXT_SWATCHES,
  getMoodSkin,
  getMoodsForTemplate,
  resolveSceneTheme,
} from '../contracts/moods'
import { ACCESSORY_LIST } from '../contracts/accessories'
import { MBTI_LIST } from '../contracts/mbti'
import { CardScene, hasWebGL, type ViewPreset } from '../scene-engine/CardScene'
import { SceneErrorBoundary } from '../scene-engine/SceneErrorBoundary'
import { errorMessage, withRetry } from '../lib/cloud'
import { withShareCode } from '../lib/share'
import { downloadDataUrl, generateSharePoster } from '../lib/poster'
import { cropAvatarDataUrl, makeSampleAvatarDataUrl } from '../lib/storage'
import { useSceneSound } from '../lib/sound'

const DRAFT_KEY = 'card-draft-v1'

interface LinkItem {
  type: string
  label: string
  url: string
}

const LINK_TYPES = [
  { type: 'website', label: '网站' },
  { type: 'email', label: '邮箱' },
  { type: 'wechat', label: '微信' },
  { type: 'linkedin', label: 'LinkedIn' },
  { type: 'github', label: 'GitHub' },
  { type: 'xiaohongshu', label: '小红书' },
]

/** 链接协议校验（FR-5）：禁止 javascript: / data: 等可执行内容；微信号允许纯文本 */
function validateLink(item: LinkItem): string | null {
  const url = item.url.trim()
  if (!url) return null
  if (/^(javascript|data|vbscript|file):/i.test(url)) return '不允许的链接协议，请使用 http(s)://'
  if (item.type === 'wechat') {
    if (url.length > 60) return '微信号长度不能超过 60 个字符'
    return null
  }
  if (item.type === 'email') {
    if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(url)) return null
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return null
    return '邮箱请填写邮箱地址或 mailto: 链接'
  }
  if (/^(https?:\/\/)/i.test(url)) return null
  return '链接必须以 http:// 或 https:// 开头'
}

function normalizeLink(item: LinkItem): LinkItem {
  const url = item.url.trim()
  if (item.type === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) {
    return { ...item, url: `mailto:${url}` }
  }
  return { ...item, url }
}

interface DraftForm {
  name: string
  title: string
  bio: string
  mbti: string
  avatarUrl: string
  avatarFrame: 'circle' | 'polaroid'
  greeting: string
  accessory: string
  website: string
  links: LinkItem[]
}

function loadDraft(): DraftForm | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as DraftForm) : null
  } catch {
    return null
  }
}

/** 从 hash（如 #/editor?tpl=2&mood=snow_aurora）或 search 中读取初始模板与皮肤 */
function readInitParams(): { tplIdx: number; moodId: string | null; autoMood: boolean } {
  const qIdx = location.hash.indexOf('?')
  const hashParams = new URLSearchParams(qIdx >= 0 ? location.hash.slice(qIdx + 1) : '')
  const searchParams = new URLSearchParams(location.search)
  const rawTpl = hashParams.get('tpl') ?? searchParams.get('tpl')
  const n = rawTpl == null ? 0 : Number(rawTpl)
  const tplIdx = Number.isInteger(n) && n >= 0 && n < templatePresets.length ? n : 0
  const moodId = hashParams.get('mood') ?? searchParams.get('mood')
  const autoMood = (hashParams.get('autoMood') ?? searchParams.get('autoMood')) === '1'
  return { tplIdx, moodId, autoMood }
}

function makeInitialSpec(): { tplIdx: number; spec: SceneSpec } {
  const { tplIdx, moodId, autoMood } = readInitParams()
  const base = cloneSpec(templatePresets[tplIdx].make())
  if (autoMood) {
    base.autoMood = true
  } else if (moodId) {
    const skin = getMoodSkin(base.template, moodId)
    base.mood = skin.id
    base.environment.lighting = { ...base.environment.lighting, preset: skin.lightingPreset }
  }
  return { tplIdx, spec: base }
}

/* ---------------- 延迟登录弹窗 ---------------- */

function LoginModal({
  open,
  reason,
  onClose,
  onSuccess,
}: {
  open: boolean
  reason: string
  onClose: () => void
  onSuccess: () => void
}) {
  const { sendEmailCode, verifyEmailCode } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  if (!open) return null

  async function onSend() {
    setBusy(true)
    setMsg('')
    const r = await sendEmailCode(email)
    setBusy(false)
    if (r.ok) {
      setSent(true)
      setCountdown(60)
      setMsg('验证码已发送，请查收邮件')
    } else {
      setMsg(r.message ?? '发送失败')
    }
  }

  async function onVerify() {
    setBusy(true)
    setMsg('')
    const r = await verifyEmailCode(code)
    setBusy(false)
    if (r.ok) {
      onSuccess()
    } else {
      setMsg(r.message ?? '验证失败')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card login-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>登录后继续</h2>
          <button
            type="button"
            aria-label="关闭登录弹窗"
            style={{ padding: '4px 10px', borderRadius: 8 }}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="desc">{reason || '使用邮箱验证码登录，名片与草稿将保存在你的账号下。'}</p>
        <div className="field">
          <label>邮箱</label>
          <input
            type="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>
        {sent && (
          <div className="field">
            <label>验证码</label>
            <input
              inputMode="numeric"
              value={code}
              placeholder="6 位验证码"
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
          </div>
        )}
        {msg && <div className="notice warn">{msg}</div>}
        {!sent ? (
          <button className="primary" onClick={onSend} disabled={busy || !email}>
            {busy ? '发送中…' : '获取验证码'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="primary" style={{ flex: 1 }} onClick={onVerify} disabled={busy || !code}>
              登录并继续
            </button>
            <button onClick={onSend} disabled={busy || countdown > 0}>
              {countdown > 0 ? `${countdown}s` : '重新发送'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- 发布成果分享弹窗 ---------------- */

function PublishModal({
  open,
  publish,
  cardId,
  posterBusy,
  onClose,
  onDownloadPoster,
  onCopied,
}: {
  open: boolean
  publish: { url: string; qr: string } | null
  cardId: number | null
  posterBusy: boolean
  onClose: () => void
  onDownloadPoster: () => void
  onCopied: (ok: boolean) => void
}) {
  if (!open || !publish) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card login-card publish-modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>🎉 3D 名片已发布</h2>
          <button
            type="button"
            aria-label="关闭分享弹窗"
            style={{ padding: '4px 10px', borderRadius: 8 }}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="publish-result">
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <img className="qr" src={publish.qr} alt="名片二维码" style={{ width: 120, height: 120 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="url">{publish.url}</div>
              <button
                className="primary"
                disabled={posterBusy}
                onClick={onDownloadPoster}
              >
                {posterBusy ? '生成中…' : '🖼️ 下载炫耀海报'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              style={{ flex: 1 }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publish.url)
                  onCopied(true)
                } catch {
                  onCopied(false)
                }
              }}
            >
              复制链接
            </button>
            <a href={publish.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
              <button style={{ width: '100%' }}>打开名片</button>
            </a>
            <a href={publish.qr} download={`3d-card-qr-${cardId ?? ''}.png`} style={{ flex: 1 }}>
              <button style={{ width: '100%' }}>下载二维码</button>
            </a>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
            分享方式：① 下载炫耀海报发小红书/朋友圈 ② 复制链接发给微信好友 ③ 对方扫二维码打开 ④
            NFC 碰一碰：使用快捷指令（iPhone）或 NFC Tools（安卓）把上方网址写入空白 NFC 标签贴纸。
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 编辑器主体 ---------------- */

type EditorTab = 'template' | 'profile' | 'style'
type PendingAction = 'save' | 'generate' | 'publish' | null

function Editor() {
  const { session, signOut } = useAuth()
  const go = useHashNavigate()
  const stageHostRef = useRef<HTMLDivElement>(null)
  const pendingActionRef = useRef<PendingAction>(null)

  const [form, setForm] = useState<DraftForm>(() => {
    const saved = loadDraft()
    return saved
      ? {
          ...saved,
          mbti: saved.mbti ?? '',
          avatarUrl: saved.avatarUrl ?? '',
          avatarFrame: saved.avatarFrame === 'polaroid' ? 'polaroid' : 'circle',
          greeting: saved.greeting ?? '',
          accessory: saved.accessory ?? '',
        }
      : {
          name: '',
          title: '',
          bio: '',
          mbti: '',
          avatarUrl: '',
          avatarFrame: 'circle',
          greeting: '',
          accessory: '',
          website: '',
          links: [],
        }
  })
  const [initialSetup] = useState(() => makeInitialSpec())
  const [activeTab, setActiveTab] = useState<EditorTab>('template')
  const [activeTemplate, setActiveTemplate] = useState(initialSetup.tplIdx)
  const [spec, setSpec] = useState<SceneSpec | null>(initialSetup.spec)
  const [view, setView] = useState<ViewPreset>('commercial')
  const [previewHour, setPreviewHour] = useState<number | undefined>(undefined)
  const { enabled: soundOn, toggleSound, syncAmbient, stopAmbient } = useSceneSound()
  const [progress, setProgress] = useState<string | null>(null)
  const [posterBusy, setPosterBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null)
  const [cardId, setCardId] = useState<number | null>(null)
  const [publish, setPublish] = useState<{ url: string; qr: string } | null>(null)
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [ideaText, setIdeaText] = useState('')
  const [loginModal, setLoginModal] = useState<{ open: boolean; reason: string }>({
    open: false,
    reason: '',
  })

  // 表单草稿恢复（US-002）
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
    } catch {
      // ignore storage quota errors on large cropped avatars
    }
  }, [form])

  const resolvedTheme = useMemo(
    () => (spec ? resolveSceneTheme(spec, previewHour) : null),
    [spec, previewHour],
  )

  useEffect(() => {
    if (!spec || !resolvedTheme) return
    syncAmbient(spec.template, resolvedTheme.isDark)
  }, [spec, resolvedTheme, soundOn, syncAmbient])

  useEffect(() => () => stopAmbient(), [stopAmbient])

  // 仅在已登录时拉取账号下的名片草稿
  const [recentCards, setRecentCards] = useState<CardRow[]>([])
  const [loadingCards, setLoadingCards] = useState(false)
  useEffect(() => {
    if (!session) {
      setRecentCards([])
      setLoadingCards(false)
      return
    }
    let cancelled = false
    setLoadingCards(true)
    listMyCards()
      .then((rows) => {
        if (!cancelled) setRecentCards(rows.slice(0, 3))
      })
      .catch(() => {
        if (!cancelled) setRecentCards([])
      })
      .finally(() => {
        if (!cancelled) setLoadingCards(false)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  async function loadCard(row: CardRow) {
    setCardId(row.id)
    const p = row.profile_json
    if (p) {
      setForm({
        name: p.name ?? '',
        title: p.title ?? '',
        bio: p.bio ?? '',
        mbti: p.mbti ?? '',
        avatarUrl: p.avatarUrl ?? '',
        avatarFrame: p.avatarFrame === 'polaroid' ? 'polaroid' : 'circle',
        greeting: p.greeting ?? '',
        accessory: p.accessory ?? '',
        website: p.website ?? '',
        links: p.links ?? [],
      })
    }
    setSpec(row.scene_spec ?? null)
    setPublish(null)
    setPublishModalOpen(false)
    setNotice({
      kind: 'info',
      text: `已载入名片「${p?.name || row.slug}」，可继续微调后发布。`,
    })
  }

  const linkErrors = useMemo(() => form.links.map(validateLink), [form.links])
  const formValid = form.name.trim().length > 0 && form.title.trim().length > 0 && linkErrors.every((e) => e === null)

  function buildProfileData(): ProfileData {
    return {
      name: form.name.trim(),
      title: form.title.trim(),
      bio: form.bio.trim(),
      mbti: form.mbti || undefined,
      avatarUrl: form.avatarUrl || undefined,
      avatarFrame: form.avatarUrl ? form.avatarFrame : undefined,
      greeting: form.greeting.trim() || undefined,
      accessory: form.accessory || undefined,
      website: form.website.trim() || undefined,
      links: form.links.filter((l) => l.url.trim()).map(normalizeLink),
      photoCount: form.avatarUrl ? 1 : 0,
    }
  }

  async function ensureCard(): Promise<CardRow> {
    if (cardId != null) {
      const row = await getCard(cardId)
      if (row) return row
    }
    const row = await createCard(session?.user?.name ?? null)
    setCardId(row.id)
    return row
  }

  function requireLogin(action: PendingAction, reason: string): boolean {
    if (session) return true
    pendingActionRef.current = action
    setLoginModal({ open: true, reason })
    return false
  }

  /** AI 灵感生成（可选）：依据想法描述重新规划整个场景 */
  async function onGenerate() {
    if (!formValid) {
      setActiveTab('profile')
      setNotice({ kind: 'error', text: '请先填写姓名和职位（带 * 为必填），并检查链接格式' })
      return
    }
    if (!requireLogin('generate', '登录后即可调用 AI 灵感生成场景，并自动保存到你的账号。')) return

    setNotice(null)
    setProgress('AI 规划场景中…（约 10–30 秒，请保持网络畅通）')
    try {
      const card = await withRetry('创建/获取名片项目', () => ensureCard())
      const result = await withRetry('AI 场景规划', () =>
        generateSceneSpec([], { idea: ideaText }, (step) => setProgress(step)),
      )
      setSpec(result.spec)
      setProgress('保存场景版本…')
      await withRetry('保存场景版本', async () => {
        const v = await saveSceneVersion(card.id, result.spec, [], PLANNER_VERSION)
        return v
      })
      const profile = buildProfileData()
      await withRetry('保存资料与场景', () =>
        updateCardDraft(card.id, { profile_json: profile, scene_spec: result.spec, status: 'ready' }),
      )
      setProgress(null)
      setSavedAt(new Date().toLocaleTimeString())
      if (result.usedFallback) {
        setNotice({ kind: 'warn', text: 'AI 输出未通过校验，已使用安全预设。可继续手动微调后发布。' })
      } else {
        setNotice({ kind: 'info', text: 'AI 灵感场景生成完成！可在右侧拖动旋转预览。' })
      }
    } catch (err) {
      setProgress(null)
      setNotice({ kind: 'error', text: `生成失败：${errorMessage(err)}。资料已保留，可重试。` })
    }
  }

  async function onSaveDraft() {
    if (!requireLogin('save', '登录后即可将当前草稿同步到云端，多端随时继续编辑。')) return
    try {
      const card = await ensureCard()
      const profile = buildProfileData()
      await updateCardDraft(card.id, {
        profile_json: profile,
        scene_spec: spec ?? undefined,
      })
      setSavedAt(new Date().toLocaleTimeString())
      setNotice({ kind: 'info', text: '草稿已保存' })
    } catch (err) {
      setNotice({ kind: 'error', text: `保存失败：${errorMessage(err)}` })
    }
  }

  async function onPublish() {
    if (!spec || !formValid) {
      setActiveTab('profile')
      setNotice({ kind: 'error', text: '请先填写姓名和职位（带 * 为必填），再发布名片' })
      return
    }
    if (!requireLogin('publish', '登录后即可发布名片，生成专属公开网址、二维码和海报！')) return
    try {
      setProgress('发布中…')
      const card = await ensureCard()
      const profile = buildProfileData()
      await updateCardDraft(card.id, { profile_json: profile, scene_spec: spec, status: 'ready' })
      const latest = await getCard(card.id)
      const published = await publishCard(latest!)
      const url = withShareCode(`${location.origin}${location.pathname}#/card/${published.slug}`)
      const qr = await QRCode.toDataURL(url, { width: 220, margin: 1 })
      setPublish({ url, qr })
      setPublishModalOpen(true)
      setProgress(null)
      setNotice({ kind: 'info', text: '发布成功！' })
    } catch (err) {
      setProgress(null)
      setNotice({ kind: 'error', text: `发布失败：${errorMessage(err)}` })
    }
  }

  // 登录成功后自动继续之前未完成的云端动作
  useEffect(() => {
    if (!session || !pendingActionRef.current) return
    const action = pendingActionRef.current
    pendingActionRef.current = null
    if (action === 'save') void onSaveDraft()
    else if (action === 'generate') void onGenerate()
    else if (action === 'publish') void onPublish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function onDownloadPoster(usePublishedQr: boolean) {
    if (!spec) return
    setPosterBusy(true)
    try {
      const canvas = stageHostRef.current?.querySelector('canvas') ?? null
      const dataUrl = await generateSharePoster({
        sourceCanvas: canvas,
        profile: profileForPreview,
        spec,
        qrDataUrl: usePublishedQr ? publish?.qr : null,
        isPreview: !usePublishedQr || !publish?.qr,
      })
      const safeName = (form.name.trim() || 'my-3d-card').replace(/[\\/:*?"<>|]/g, '_')
      downloadDataUrl(dataUrl, `3d-card-poster-${safeName}.png`)
      setNotice({
        kind: 'info',
        text: usePublishedQr && publish?.qr ? '炫耀海报已导出（含专属二维码）！' : '预览海报已导出！发布后可导出带专属二维码的海报。',
      })
    } catch (err) {
      setNotice({ kind: 'error', text: `海报生成失败：${errorMessage(err)}` })
    } finally {
      setPosterBusy(false)
    }
  }

  function patchEnv(patch: Partial<SceneSpec['environment']>) {
    setSpec((s) => (s ? { ...s, environment: { ...s.environment, ...patch } } : s))
  }

  /** 换模板：深拷贝预设，轮廓锁死（拍同款） */
  function selectTemplate(idx: number) {
    setActiveTemplate(idx)
    setSpec(cloneSpec(templatePresets[idx].make()))
    setNotice({ kind: 'info', text: `已切换到模板「${templatePresets[idx].label}」，可继续填写资料与微调氛围。` })
  }

  const profileForPreview = useMemo(
    () => ({
      name: form.name.trim(),
      title: form.title.trim(),
      bio: form.bio.trim(),
      mbti: form.mbti || undefined,
      avatarUrl: form.avatarUrl || undefined,
      avatarFrame: form.avatarUrl ? form.avatarFrame : undefined,
      greeting: form.greeting.trim() || undefined,
      accessory: form.accessory || undefined,
      links: form.links.filter((l) => l.url.trim()).map(normalizeLink),
    }),
    [form],
  )

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand" onClick={() => go('/')}>
          <span className="dot" />
          3D 名片
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {savedAt && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>已保存 {savedAt}</span>}
          {session ? (
            <button onClick={() => signOut()}>退出</button>
          ) : (
            <button
              onClick={() => {
                pendingActionRef.current = null
                setLoginModal({ open: true, reason: '登录账号后即可保存云端草稿、同步历史名片并发布分享。' })
              }}
            >
              登录 / 同步云端
            </button>
          )}
        </div>
      </header>

      <div className="editor">
        <aside className="side">
          <div className="side-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'template'}
              className={activeTab === 'template' ? 'side-tab active' : 'side-tab'}
              onClick={() => setActiveTab('template')}
            >
              ① 选模板
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'profile'}
              className={activeTab === 'profile' ? 'side-tab active' : 'side-tab'}
              onClick={() => setActiveTab('profile')}
            >
              ② 填资料
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'style'}
              className={activeTab === 'style' ? 'side-tab active' : 'side-tab'}
              onClick={() => setActiveTab('style')}
            >
              ③ 调氛围
            </button>
          </div>

          <div className="side-body">
            {progress && (
              <div className="progress">
                <span className="spin" />
                {progress}
              </div>
            )}
            {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}

            {activeTab === 'template' && (
              <>
                {!session && (
                  <div className="notice">
                    免登录试玩中：可直接选模板、填资料、挑 MBTI 小人并 360° 预览效果；点击下方「发布名片」时再登录即可。
                  </div>
                )}
                {loadingCards ? (
                  <div className="notice">正在获取你的名片…</div>
                ) : recentCards.length > 0 ? (
                  <div className="notice">
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>我的名片</div>
                    {recentCards.map((row) => (
                      <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ flex: 1, fontSize: 13 }}>
                          {row.profile_json?.name || row.slug}
                          <span style={{ color: 'var(--text-dim)', marginLeft: 6, fontSize: 12 }}>
                            {row.status === 'published' ? '已发布' : row.status}
                          </span>
                        </span>
                        <button style={{ padding: '5px 12px' }} onClick={() => loadCard(row)}>载入</button>
                        {row.status === 'published' && (
                          <button
                            style={{ padding: '5px 12px' }}
                            onClick={() => go(`/card/${row.slug}`)}
                          >
                            查看
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="section-title">选择场景模板（拍同款，轮廓固定）</div>
                <div className="tpl-grid">
                  {templatePresets.map((t, i) => (
                    <button
                      key={i}
                      className={activeTemplate === i ? 'tpl-card active' : 'tpl-card'}
                      onClick={() => selectTemplate(i)}
                    >
                      <span className="tpl-name">{t.label}</span>
                      <span className="tpl-desc">{t.desc}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  style={{ alignSelf: 'stretch' }}
                  onClick={() => setActiveTab('profile')}
                >
                  下一步：填写资料与 MBTI →
                </button>
              </>
            )}

            {activeTab === 'profile' && (
              <>
                <div className="section-title">个人名片资料</div>
                <div className="field">
                  <label>姓名 *</label>
                  <input value={form.name} maxLength={20} placeholder="你的名字" onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>职位 *</label>
                  <input value={form.title} maxLength={30} placeholder="如：产品设计师" onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="field">
                  <label>一句话简介（≤160 字符）</label>
                  <textarea value={form.bio} maxLength={160} rows={2} placeholder="介绍你自己" onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                </div>
                <div className="field">
                  <label>自定义头像 / 照片立牌（可选，上传后优先替掉 MBTI 立牌）</label>
                  <div className="avatar-panel">
                    {form.avatarUrl ? (
                      <img
                        className={form.avatarFrame === 'polaroid' ? 'avatar-preview polaroid' : 'avatar-preview'}
                        src={form.avatarUrl}
                        alt="自定义头像"
                      />
                    ) : (
                      <div className={form.avatarFrame === 'polaroid' ? 'avatar-preview polaroid' : 'avatar-preview'}>
                        🖼️
                      </div>
                    )}
                    <div className="avatar-controls">
                      <div className="avatar-actions">
                        <label className="avatar-upload-btn">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              e.target.value = ''
                              if (!file) return
                              try {
                                const cropped = await cropAvatarDataUrl(file)
                                setForm((f) => ({ ...f, avatarUrl: cropped }))
                                setNotice({ kind: 'info', text: '已裁剪并生成 3D 照片立牌！可在右侧点击立牌触发气泡。' })
                              } catch (err) {
                                setNotice({ kind: 'error', text: err instanceof Error ? err.message : '头像处理失败' })
                              }
                            }}
                          />
                          📤 上传照片
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, avatarUrl: makeSampleAvatarDataUrl() }))
                            setNotice({ kind: 'info', text: '已加载示例头像立牌，可切换圆框 / 拍立得相框。' })
                          }}
                        >
                          ✨ 试示例照片
                        </button>
                        {form.avatarUrl && (
                          <button type="button" onClick={() => setForm((f) => ({ ...f, avatarUrl: '' }))}>
                            清除
                          </button>
                        )}
                      </div>
                      <div className="avatar-frames">
                        <button
                          type="button"
                          className={form.avatarFrame === 'circle' ? 'frame-chip active' : 'frame-chip'}
                          onClick={() => setForm((f) => ({ ...f, avatarFrame: 'circle' }))}
                        >
                          ⭕ 金属圆框
                        </button>
                        <button
                          type="button"
                          className={form.avatarFrame === 'polaroid' ? 'frame-chip active' : 'frame-chip'}
                          onClick={() => setForm((f) => ({ ...f, avatarFrame: 'polaroid' }))}
                        >
                          📸 拍立得相框
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>彩蛋打招呼语（可选，≤24 字，点击 3D 立牌/宠物时弹出）</label>
                  <input
                    value={form.greeting}
                    maxLength={24}
                    placeholder="如：嗨，很高兴认识你！☕"
                    onChange={(e) => setForm({ ...form, greeting: e.target.value })}
                  />
                </div>
                <div className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label>MBTI 卡通形象（可选，将立在 3D 名片上）</label>
                    {form.mbti && (
                      <button
                        type="button"
                        style={{ padding: '2px 8px', fontSize: 12 }}
                        onClick={() => setForm({ ...form, mbti: '' })}
                      >
                        取消选择
                      </button>
                    )}
                  </div>
                  <div className="mbti-grid">
                    {MBTI_LIST.map((m) => {
                      const selected = form.mbti === m.code
                      return (
                        <button
                          key={m.code}
                          type="button"
                          className={selected ? 'mbti-item active' : 'mbti-item'}
                          style={selected ? { borderColor: m.color, boxShadow: `0 0 0 1px ${m.color}` } : undefined}
                          onClick={() => setForm({ ...form, mbti: selected ? '' : m.code })}
                        >
                          <img src={m.avatar} alt={m.code} loading="lazy" />
                          <span className="mbti-code" style={{ color: selected ? m.color : undefined }}>{m.code}</span>
                          <span className="mbti-title">{m.title}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label>职业 / 宠物微缩挂件（可选，放在 3D 名片上）</label>
                    {form.accessory && (
                      <button
                        type="button"
                        style={{ padding: '2px 8px', fontSize: 12 }}
                        onClick={() => setForm({ ...form, accessory: '' })}
                      >
                        取消选择
                      </button>
                    )}
                  </div>
                  <div className="acc-grid">
                    {ACCESSORY_LIST.map((a) => {
                      const selected = form.accessory === a.id
                      return (
                        <button
                          key={a.id}
                          type="button"
                          className={selected ? 'acc-item active' : 'acc-item'}
                          style={selected ? { borderColor: a.accent, boxShadow: `0 0 0 1px ${a.accent}` } : undefined}
                          onClick={() => setForm({ ...form, accessory: selected ? '' : a.id })}
                        >
                          <span className="acc-emoji">{a.emoji}</span>
                          <span className="acc-name" style={{ color: selected ? a.accent : undefined }}>{a.label}</span>
                          <span className="acc-tag">{a.tag}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="field">
                  <label>个人网站</label>
                  <input value={form.website} placeholder="https://…" onChange={(e) => setForm({ ...form, website: e.target.value })} />
                </div>

                <div className="field">
                  <label>社交链接</label>
                  {form.links.map((l, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div className="link-row">
                        <select
                          value={l.type}
                          onChange={(e) => {
                            const links = [...form.links]
                            const t = LINK_TYPES.find((x) => x.type === e.target.value)!
                            links[i] = { ...links[i], type: t.type, label: t.label }
                            setForm({ ...form, links })
                          }}
                        >
                          {LINK_TYPES.map((t) => (
                            <option key={t.type} value={t.type}>{t.label}</option>
                          ))}
                        </select>
                        <input
                          value={l.url}
                          placeholder={
                            l.type === 'wechat'
                              ? '请输入微信号'
                              : l.type === 'email'
                                ? 'name@example.com'
                                : 'https://…'
                          }
                          onChange={(e) => {
                            const links = [...form.links]
                            links[i] = { ...links[i], url: e.target.value }
                            setForm({ ...form, links })
                          }}
                        />
                        <button
                          style={{ flex: 'none', width: 34 }}
                          onClick={() => setForm({ ...form, links: form.links.filter((_, j) => j !== i) })}
                          aria-label="删除链接"
                        >
                          ×
                        </button>
                      </div>
                      {linkErrors[i] && <span className="err">{linkErrors[i]}</span>}
                    </div>
                  ))}
                  {form.links.length < 4 && (
                    <button
                      style={{ alignSelf: 'flex-start' }}
                      onClick={() => {
                        const t = LINK_TYPES[form.links.length % LINK_TYPES.length]
                        setForm({ ...form, links: [...form.links, { type: t.type, label: t.label, url: '' }] })
                      }}
                    >
                      + 添加链接
                    </button>
                  )}
                </div>
              </>
            )}

            {activeTab === 'style' && spec && (
              <>
                <div className={spec.autoMood ? 'auto-mood-card active' : 'auto-mood-card'}>
                  <div className="auto-mood-head">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!spec.autoMood}
                        onChange={(e) => {
                          const checked = e.target.checked
                          if (!checked) setPreviewHour(undefined)
                          setSpec((s) => (s ? { ...s, autoMood: checked } : s))
                        }}
                      />
                      <span>🌗 跟随现实时间自动昼夜切换</span>
                    </label>
                  </div>
                  <div className="auto-mood-sub">
                    {spec.autoMood && resolvedTheme
                      ? `当前（${resolvedTheme.timeBandLabel}）自动匹配：${resolvedTheme.mood.emoji} ${resolvedTheme.mood.label}`
                      : '开启后将根据访客打开时间，自动匹配白天 / 黄昏 / 夜晚皮肤'}
                  </div>
                  <div className="auto-mood-sim">
                    <button
                      type="button"
                      className={spec.autoMood && previewHour === 10 ? 'active' : ''}
                      onClick={() => {
                        setSpec((s) => (s ? { ...s, autoMood: true } : s))
                        setPreviewHour(10)
                      }}
                    >
                      ☀️ 白天
                    </button>
                    <button
                      type="button"
                      className={spec.autoMood && previewHour === 18 ? 'active' : ''}
                      onClick={() => {
                        setSpec((s) => (s ? { ...s, autoMood: true } : s))
                        setPreviewHour(18)
                      }}
                    >
                      🌇 黄昏
                    </button>
                    <button
                      type="button"
                      className={spec.autoMood && previewHour === 22 ? 'active' : ''}
                      onClick={() => {
                        setSpec((s) => (s ? { ...s, autoMood: true } : s))
                        setPreviewHour(22)
                      }}
                    >
                      🌙 夜晚
                    </button>
                    {spec.autoMood && previewHour !== undefined && (
                      <button type="button" onClick={() => setPreviewHour(undefined)}>
                        回到真实时间
                      </button>
                    )}
                  </div>
                </div>

                <div className="section-title">✨ 氛围皮肤（手动固定一套）</div>
                <div className="mood-grid">
                  {getMoodsForTemplate(spec.template).map((m) => {
                    const active = !spec.autoMood && resolveSceneTheme(spec).mood.id === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={active ? 'mood-card active' : 'mood-card'}
                        onClick={() => {
                          setPreviewHour(undefined)
                          setSpec((s) =>
                            s
                              ? {
                                  ...s,
                                  autoMood: false,
                                  mood: m.id,
                                  customBg: undefined,
                                  environment: {
                                    ...s.environment,
                                    lighting: { ...s.environment.lighting, preset: m.lightingPreset },
                                  },
                                }
                              : s,
                          )
                        }}
                      >
                        <span
                          className="mood-swatch"
                          style={{ background: `linear-gradient(90deg, ${m.swatch[0]}, ${m.swatch[1]})` }}
                        />
                        <span className="mood-title">{m.emoji} {m.label}</span>
                        <span className="mood-desc">{m.desc}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="section-title" style={{ marginTop: 4 }}>🎨 自定义配色（可选）</div>
                <div className="field">
                  <label>影棚背景色</label>
                  <div className="swatch-row">
                    {CUSTOM_BG_SWATCHES.map((sw) => (
                      <button
                        key={sw.color}
                        type="button"
                        title={sw.label}
                        className={spec.customBg === sw.color ? 'swatch-btn active' : 'swatch-btn'}
                        style={{ backgroundColor: sw.color }}
                        onClick={() => setSpec((s) => (s ? { ...s, customBg: sw.color } : s))}
                      />
                    ))}
                    <input
                      type="color"
                      className="swatch-picker"
                      aria-label="自定义影棚背景色"
                      value={spec.customBg || resolveSceneTheme(spec).bgColor}
                      onChange={(e) => setSpec((s) => (s ? { ...s, customBg: e.target.value } : s))}
                    />
                    {spec.customBg && (
                      <button
                        type="button"
                        className="swatch-reset"
                        onClick={() => setSpec((s) => (s ? { ...s, customBg: undefined } : s))}
                      >
                        默认
                      </button>
                    )}
                  </div>
                </div>

                <div className="field">
                  <label>正面名字主色</label>
                  <div className="swatch-row">
                    {CUSTOM_TEXT_SWATCHES.map((sw) => (
                      <button
                        key={sw.color}
                        type="button"
                        title={sw.label}
                        className={spec.customTextColor === sw.color ? 'swatch-btn active' : 'swatch-btn'}
                        style={{ backgroundColor: sw.color }}
                        onClick={() => setSpec((s) => (s ? { ...s, customTextColor: sw.color } : s))}
                      />
                    ))}
                    <input
                      type="color"
                      className="swatch-picker"
                      aria-label="自定义正面名字主色"
                      value={spec.customTextColor || resolveSceneTheme(spec).accent}
                      onChange={(e) => setSpec((s) => (s ? { ...s, customTextColor: e.target.value } : s))}
                    />
                    {spec.customTextColor && (
                      <button
                        type="button"
                        className="swatch-reset"
                        onClick={() => setSpec((s) => (s ? { ...s, customTextColor: undefined } : s))}
                      >
                        默认
                      </button>
                    )}
                  </div>
                </div>

                <div className="section-title" style={{ marginTop: 4 }}>微调场景（实时生效）</div>
                <div className="field">
                  <label>光照氛围</label>
                  <select
                    value={spec.environment.lighting.preset}
                    onChange={(e) => patchEnv({ lighting: { ...spec.environment.lighting, preset: e.target.value as SceneSpec['environment']['lighting']['preset'] } })}
                  >
                    <option value="morning">清晨</option>
                    <option value="noon">正午</option>
                    <option value="golden_hour">黄金时刻</option>
                    <option value="dusk">黄昏</option>
                    <option value="overcast">阴天</option>
                    <option value="night">夜晚 / 极夜</option>
                  </select>
                </div>
                <div className="field">
                  <label>雾气浓度：{spec.environment.lighting.fog.toFixed(2)}</label>
                  <input
                    type="range" min={0} max={0.6} step={0.02}
                    value={spec.environment.lighting.fog}
                    onChange={(e) => patchEnv({ lighting: { ...spec.environment.lighting, fog: Number(e.target.value) } })}
                  />
                </div>
                <div className="field">
                  <label>
                    {spec.template === 'city'
                      ? '模块密度'
                      : spec.template === 'coast'
                        ? '椰林密度'
                        : spec.template === 'sakura_garden'
                          ? '樱花密度'
                          : spec.template === 'snow_cabin'
                            ? '雪松密度'
                            : '植被密度'}
                  </label>
                  <select
                    value={spec.environment.foliage.density}
                    onChange={(e) => patchEnv({ foliage: { ...spec.environment.foliage, density: e.target.value as SceneSpec['environment']['foliage']['density'] } })}
                  >
                    <option value="low">稀疏</option>
                    <option value="medium">适中</option>
                    <option value="high">茂密</option>
                  </select>
                </div>
                {spec.template !== 'city' && (
                  <div className="field">
                    <label>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={spec.environment.water.enabled}
                        onChange={(e) => patchEnv({ water: { ...spec.environment.water, enabled: e.target.checked } })}
                      />{' '}
                      {spec.template === 'coast'
                        ? '显示大海'
                        : spec.template === 'sakura_garden'
                          ? '显示锦鲤池'
                          : spec.template === 'snow_cabin'
                            ? '显示冰湖'
                            : '显示水面'}
                    </label>
                  </div>
                )}

                <div className="section-title" style={{ marginTop: 8 }}>AI 灵感定制（可选）</div>
                <div className="field">
                  <label>描述你的想法，由 AI 重新规划地形与氛围</label>
                  <textarea
                    value={ideaText}
                    maxLength={200}
                    rows={2}
                    placeholder='如："左边要一座小山，中间凹一片洼地，黄昏的感觉"'
                    onChange={(e) => setIdeaText(e.target.value)}
                  />
                </div>
                <button onClick={onGenerate} disabled={!!progress}>
                  {progress ? 'AI 生成中…' : 'AI 灵感生成场景'}
                </button>
              </>
            )}
          </div>

          <div className="side-footer">
            <button onClick={onSaveDraft} disabled={!!progress}>
              保存草稿
            </button>
            {publish && (
              <button onClick={() => setPublishModalOpen(true)} title="查看分享链接与二维码">
                分享
              </button>
            )}
            <button
              className="primary"
              style={{ flex: 1 }}
              onClick={onPublish}
              disabled={!!progress || !spec}
            >
              {session ? '发布名片' : '登录后发布名片'}
            </button>
          </div>
        </aside>

        <main className="stage">
          {spec ? (
            <>
              <div className="view-tabs">
                <button className={view === 'front' ? 'active' : ''} onClick={() => setView('front')}>正面</button>
                <button className={view === 'back' ? 'active' : ''} onClick={() => setView('back')}>背面</button>
                <button className={view === 'commercial' ? 'active' : ''} onClick={() => setView('commercial')}>自由视角</button>
                <button
                  type="button"
                  className={soundOn ? 'active' : ''}
                  title="开启/关闭当前微缩世界的环境氛围音与彩蛋音效"
                  onClick={() => resolvedTheme && toggleSound(spec.template, resolvedTheme.isDark)}
                >
                  {soundOn ? '🔊 氛围音' : '🔇 氛围音'}
                </button>
                <button
                  disabled={posterBusy}
                  title="将当前视角画面合成为竖版炫耀海报"
                  onClick={() => onDownloadPoster(!!publish)}
                >
                  {posterBusy ? '生成中…' : '🖼️ 存海报'}
                </button>
              </div>
              <div className="canvas-host" ref={stageHostRef}>
                {hasWebGL() ? (
                  <SceneErrorBoundary
                    fallback={
                      <div className="static-card">
                        <div className="inner">
                          <strong>{form.name || '姓名'}</strong>
                          <span className="muted">{form.title}</span>
                          <span className="hint">当前浏览器不支持 WebGL，已切换为静态预览。</span>
                        </div>
                      </div>
                    }
                  >
                    <CardScene
                      spec={spec}
                      profile={profileForPreview}
                      view={view}
                      hourOverride={previewHour}
                      showGuide={view !== 'back'}
                      qrText={publish?.url || 'https://3d.card'}
                    />
                  </SceneErrorBoundary>
                ) : (
                  <div className="static-card">
                    <div className="inner">
                      <strong>{form.name || '姓名'}</strong>
                      <span className="muted">{form.title}</span>
                      <span className="hint">当前浏览器不支持 WebGL，已切换为静态预览。</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="stage-tip">拖动旋转 · 点击角色/动物/主景触发互动彩蛋 · 翻看背面二维码</div>
            </>
          ) : (
            <div className="loading-screen">
              选一个模板，换上你的信息，微调后发布
            </div>
          )}
        </main>
      </div>

      <LoginModal
        open={loginModal.open}
        reason={loginModal.reason}
        onClose={() => {
          pendingActionRef.current = null
          setLoginModal({ open: false, reason: '' })
        }}
        onSuccess={() => {
          setLoginModal({ open: false, reason: '' })
          setNotice({ kind: 'info', text: '登录成功！' })
        }}
      />

      <PublishModal
        open={publishModalOpen}
        publish={publish}
        cardId={cardId}
        posterBusy={posterBusy}
        onClose={() => setPublishModalOpen(false)}
        onDownloadPoster={() => onDownloadPoster(true)}
        onCopied={(ok) =>
          setNotice(
            ok
              ? { kind: 'info', text: '链接已复制，可直接粘贴发给对方' }
              : { kind: 'warn', text: '复制失败，请手动长按链接复制' },
          )
        }
      />
    </div>
  )
}

export function EditorPage() {
  return <Editor />
}
