import { useEffect, useState } from 'react'
import { AuthProvider } from './lib/auth'
import { captureShareCode } from './lib/share'
import { LandingPage } from './pages/Landing'
import { EditorPage } from './pages/Editor'
import { CardViewerPage } from './pages/CardViewer'

/** 极简 hash 路由（发布环境为静态托管，无 history fallback，故使用 hash） */
function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash || '#/')
  useEffect(() => {
    const onChange = () => setHash(location.hash || '#/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export function App() {
  // 捕获并记住平台分享码，供生成名片链接/二维码时使用
  useEffect(() => captureShareCode(), [])
  const hash = useHashRoute()
  const path = hash.replace(/^#/, '')

  let page: JSX.Element
  if (path.startsWith('/card/')) {
    const slug = path.slice('/card/'.length).replace(/\/+$/, '')
    page = <CardViewerPage slug={slug} />
  } else if (path.startsWith('/editor')) {
    page = <EditorPage />
  } else {
    page = <LandingPage />
  }

  return (
    <AuthProvider>
      {page}
    </AuthProvider>
  )
}
