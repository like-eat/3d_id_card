import { useEffect, useMemo, useState } from 'react'
import { CardScene, hasWebGL, type ViewPreset } from '../scene-engine/CardScene'
import { cloneSpec, templatePresets } from '../contracts/scene-spec'
import { getMoodSkin, getMoodsForTemplate, resolveSceneTheme } from '../contracts/moods'
import { makeSampleAvatarDataUrl } from '../lib/storage'
import { useSceneSound } from '../lib/sound'
import { useHashNavigate } from '../lib/nav'
import {
  IconAutoMood,
  IconEye,
  IconEyeOff,
  IconFlip,
  IconSoundOff,
  IconSoundOn,
  IconSparkles,
} from '../components/Icons'

// 演示模板：?tpl=0..4 可切换（默认晨雾森林），?mood=<id> 可切皮肤，?autoMood=1 自动昼夜，?bg=hex / ?tc=hex 可自定义配色
const params = new URLSearchParams(location.search)
const tplParam = Number(params.get('tpl') ?? '-1')
const initialIdx = Number.isInteger(tplParam) && tplParam >= 0 && tplParam < templatePresets.length ? tplParam : 0
const viewParam = params.get('view')
const initialView: ViewPreset =
  viewParam === 'back' || viewParam === 'front' || viewParam === 'free' || viewParam === 'side' ? viewParam : 'commercial'
const cleanParam = params.get('clean') === '1'
const guideParam = params.get('guide') === '1'
const autoMoodParam = params.get('autoMood') === '1'
const mbtiParam = params.get('mbti') ?? 'ENFP'
const accParam = params.get('acc')
const demoAvatarParam = params.get('demoAvatar')
const bgParamRaw = params.get('bg')
const tcParamRaw = params.get('tc')
const initialBg = bgParamRaw && /^[0-9a-fA-F]{6}$/.test(bgParamRaw) ? `#${bgParamRaw}` : undefined
const initialTc = tcParamRaw && /^[0-9a-fA-F]{6}$/.test(tcParamRaw) ? `#${tcParamRaw}` : undefined

const initialMood = getMoodSkin(templatePresets[initialIdx].id, params.get('mood') ?? undefined).id

const DEFAULT_TPL_ACCESSORIES = ['dog', 'camera', 'laptop', 'cat', 'coffee'] as const
const DEMO_SLUGS = ['demo-forest', 'demo-coast', 'demo-tech', 'demo-sakura', 'demo-snow'] as const

const BASE_DEMO_LINKS = [
  { type: 'website', label: '作品集', url: 'https://studio.example.com' },
  { type: 'github', label: 'GitHub', url: 'https://github.com/example' },
  { type: 'email', label: '邮箱', url: 'mailto:hello@example.com' },
]

export function LandingPage() {
  const go = useHashNavigate()
  const [tplIdx, setTplIdx] = useState(initialIdx)
  const [moodId, setMoodId] = useState(initialMood)
  const [autoMood, setAutoMood] = useState(autoMoodParam)
  const [heroHidden, setHeroHidden] = useState(false)
  const [view, setView] = useState<ViewPreset>(initialView)
  const { enabled: soundOn, toggleSound, syncAmbient, stopAmbient } = useSceneSound()

  const currentTpl = templatePresets[tplIdx]
  const moodOptions = useMemo(() => getMoodsForTemplate(currentTpl.id), [currentTpl.id])
  const activeMood = useMemo(() => getMoodSkin(currentTpl.id, moodId), [currentTpl.id, moodId])

  const demoSpec = useMemo(() => {
    const s = cloneSpec(currentTpl.make())
    s.autoMood = autoMood
    s.mood = activeMood.id
    s.environment.lighting = { ...s.environment.lighting, preset: activeMood.lightingPreset }
    if (tplIdx === initialIdx) {
      if (initialBg) s.customBg = initialBg
      if (initialTc) s.customTextColor = initialTc
    }
    return s
  }, [currentTpl, activeMood, autoMood, tplIdx])

  const resolvedTheme = useMemo(() => resolveSceneTheme(demoSpec), [demoSpec])

  useEffect(() => {
    syncAmbient(demoSpec.template, resolvedTheme.isDark)
  }, [demoSpec.template, resolvedTheme.isDark, soundOn, syncAmbient])

  useEffect(() => () => stopAmbient(), [stopAmbient])

  const editorQuery = autoMood ? `/editor?tpl=${tplIdx}&autoMood=1` : `/editor?tpl=${tplIdx}&mood=${activeMood.id}`
  const demoCardQuery = `/card/${DEMO_SLUGS[tplIdx] ?? 'demo-forest'}${autoMood ? '?autoMood=1' : `?mood=${activeMood.id}`}`

  const demoAvatarUrl = useMemo(
    () => (demoAvatarParam === 'circle' || demoAvatarParam === 'polaroid' ? makeSampleAvatarDataUrl() : undefined),
    [],
  )

  const demoProfile = useMemo(
    () => ({
      name: 'Zilin',
      title: 'Creative Director',
      bio: '用微缩世界讲述个人故事，探索数字名片的质感边界。',
      mbti: mbtiParam || undefined,
      avatarUrl: demoAvatarUrl,
      avatarFrame: (demoAvatarParam === 'polaroid' ? 'polaroid' : 'circle') as 'circle' | 'polaroid',
      accessory: accParam === '' ? undefined : accParam || DEFAULT_TPL_ACCESSORIES[tplIdx] || 'cat',
      links: BASE_DEMO_LINKS,
    }),
    [tplIdx, demoAvatarUrl],
  )

  return (
    <div className={`page landing-page ${resolvedTheme.isDark ? 'theme-dark' : 'theme-light'}`}>
      <header className="topbar">
        <div className="brand" onClick={() => go('/')}>
          <span className="dot" />
          3D 名片
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className={soundOn ? 'sound-btn btn-inline active' : 'sound-btn btn-inline'}
            onClick={() => toggleSound(demoSpec.template, resolvedTheme.isDark)}
          >
            {soundOn ? <IconSoundOn size={14} /> : <IconSoundOff size={14} />}
            <span>氛围音</span>
          </button>
          <button className="primary btn-inline" onClick={() => go(editorQuery)}>
            <IconSparkles size={14} />
            <span>创建我的名片</span>
          </button>
        </div>
      </header>
      <main className="landing">
        <div className="demo-canvas">
          {hasWebGL() ? (
            <CardScene
              spec={demoSpec}
              profile={demoProfile}
              view={view}
              showGuide={!cleanParam || guideParam}
            />
          ) : null}
        </div>
        {!cleanParam && !heroHidden && (
          <div className="hero">
            <div className="hero-card">
              <div className="hero-head">
                <h1>
                  拍同款，定制你的
                  <br />
                  <em>微缩 3D 数字名片</em>
                </h1>
                <button
                  type="button"
                  className="hero-collapse-btn"
                  title="收起介绍卡片，纯净赏玩 3D 沙盘"
                  onClick={() => setHeroHidden(true)}
                >
                  <IconEyeOff size={13} />
                  <span>收起</span>
                </button>
              </div>
              <p className="sub">
                挑一套写实微缩沙盘，自由切换日夜氛围与专属配色，放上照片立牌与社交链接，正面赏微缩世界、背面扫码直达。
              </p>
              <div className="actions">
                <button className="primary" onClick={() => go(editorQuery)}>
                  <IconSparkles size={15} />
                  <span>开始创建</span>
                </button>
                <button onClick={() => setView((v) => (v === 'back' ? 'commercial' : 'back'))}>
                  <IconFlip size={14} />
                  <span>{view === 'back' ? '翻回正面' : '翻看背面'}</span>
                </button>
                <button onClick={() => go(demoCardQuery)}>
                  <IconEye size={14} />
                  <span>看成品页</span>
                </button>
              </div>
            </div>
          </div>
        )}
        {!cleanParam && heroHidden && (
          <button
            type="button"
            className="hero-restore-btn"
            onClick={() => setHeroHidden(false)}
          >
            <IconEye size={14} />
            <span>展开介绍</span>
          </button>
        )}
        <div className="landing-dock">
          <div className="mood-pills" aria-label="氛围皮肤快速切换">
            {moodOptions.map((m) => (
              <button
                key={m.id}
                className={!autoMood && activeMood.id === m.id ? 'mood-pill active' : 'mood-pill'}
                onClick={() => {
                  setAutoMood(false)
                  setMoodId(m.id)
                }}
              >
                <span
                  className="mood-dot"
                  style={{ background: `linear-gradient(135deg, ${m.swatch[0]}, ${m.swatch[1]})` }}
                />
                <span>{m.emoji} {m.label}</span>
              </button>
            ))}
            <button
              className={autoMood ? 'mood-pill active' : 'mood-pill'}
              onClick={() => setAutoMood((v) => !v)}
              title="按当前时刻自动切换白天 / 黄昏 / 夜晚皮肤"
            >
              <IconAutoMood size={13} />
              <span>自动昼夜</span>
            </button>
          </div>
          <div className="dock-pills">
            {templatePresets.map((t, i) => (
              <button
                key={t.id}
                className={tplIdx === i ? 'dock-pill active' : 'dock-pill'}
                onClick={() => {
                  setTplIdx(i)
                  setMoodId(getMoodsForTemplate(t.id)[0]?.id ?? '')
                  setView('commercial')
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="dock-hint">拖动画面可 360° 旋转 · 点击立牌/宠物/场景有互动彩蛋 · 滚轮缩放预览</div>
        </div>
      </main>
    </div>
  )
}
