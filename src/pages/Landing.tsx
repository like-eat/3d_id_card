import { useMemo, useState } from 'react'
import { CardScene, hasWebGL, type ViewPreset } from '../scene-engine/CardScene'
import { cloneSpec, templatePresets } from '../contracts/scene-spec'
import { useHashNavigate } from '../lib/nav'

// 演示模板：?tpl=0..4 可切换（默认晨雾森林），?view=back 可直接看背面
const params = new URLSearchParams(location.search)
const tplParam = Number(params.get('tpl') ?? '-1')
const initialIdx = Number.isInteger(tplParam) && tplParam >= 0 && tplParam < templatePresets.length ? tplParam : 0
const viewParam = params.get('view')
const initialView: ViewPreset =
  viewParam === 'back' || viewParam === 'front' || viewParam === 'free' || viewParam === 'side' ? viewParam : 'commercial'
const cleanParam = params.get('clean') === '1'
const mbtiParam = params.get('mbti') ?? 'ENFP'
const accParam = params.get('acc')

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
  const [view, setView] = useState<ViewPreset>(initialView)
  const demoSpec = useMemo(() => cloneSpec(templatePresets[tplIdx].make()), [tplIdx])
  const demoProfile = useMemo(
    () => ({
      name: 'Zilin',
      title: 'Creative Director',
      bio: '用微缩世界讲述个人故事，探索数字名片的质感边界。',
      mbti: mbtiParam || undefined,
      accessory: accParam === '' ? undefined : accParam || DEFAULT_TPL_ACCESSORIES[tplIdx] || 'cat',
      links: BASE_DEMO_LINKS,
    }),
    [tplIdx],
  )

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand" onClick={() => go('/')}>
          <span className="dot" />
          3D 名片
        </div>
        <button className="primary" onClick={() => go(`/editor?tpl=${tplIdx}`)}>创建我的名片</button>
      </header>
      <main className="landing">
        <div className="demo-canvas">
          {hasWebGL() ? (
            <CardScene spec={demoSpec} profile={demoProfile} view={view} />
          ) : null}
        </div>
        {!cleanParam && (
          <div className="hero">
            <div className="hero-card">
              <h1>
                拍同款，
                <br />
                生成<em>写实微缩 3D 数字名片</em>
              </h1>
              <p className="sub">
                从精调写实微缩沙盘模板中选择一款，换上你的姓名与链接，微调光影与氛围。
                正面是立体微缩世界，翻转背面呈现另一面世界与可扫码二维码。
              </p>
              <div className="actions">
                <button className="primary" onClick={() => go(`/editor?tpl=${tplIdx}`)}>开始创建</button>
                <button onClick={() => setView((v) => (v === 'back' ? 'commercial' : 'back'))}>
                  {view === 'back' ? '翻回正面沙盘' : '翻看背面名片'}
                </button>
                <button onClick={() => go(`/card/${DEMO_SLUGS[tplIdx] ?? 'demo-forest'}`)}>
                  👀 看成品名片
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="landing-dock">
          <div className="dock-pills">
            {templatePresets.map((t, i) => (
              <button
                key={t.id}
                className={tplIdx === i ? 'dock-pill active' : 'dock-pill'}
                onClick={() => {
                  setTplIdx(i)
                  setView('commercial')
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="dock-hint">拖动画面可 360° 旋转 · 滚轮缩放预览</div>
        </div>
      </main>
    </div>
  )
}
