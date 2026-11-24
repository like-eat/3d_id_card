import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { cloud } from './cloud'

export type Session = NonNullable<Awaited<ReturnType<typeof cloud.auth.getSession>>['data']>

interface AuthState {
  session: Session | null
  loading: boolean
  /** 邮箱验证码登录：发送验证码 */
  sendEmailCode: (email: string) => Promise<{ ok: boolean; message?: string; isNew?: boolean }>
  /** 邮箱验证码登录：提交验证码 */
  verifyEmailCode: (code: string) => Promise<{ ok: boolean; message?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

let pendingEmailOtp: { email: string; verificationId: string; isExistingUser: boolean } | null = null

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function restore() {
      const url = new URL(location.href)
      // OAuth 回调分发（provider=workbuddy）优先于路由守卫
      if (url.searchParams.has('code') || url.searchParams.has('error')) {
        const provider = url.searchParams.get('provider')
        if (provider === 'workbuddy' && typeof cloud.auth.handleWorkBuddyCallback === 'function') {
          const { data, error } = await cloud.auth.handleWorkBuddyCallback.call(cloud.auth)
          if (error && !cancelled) {
            setLoading(false)
            return
          }
          if (data) {
            for (const key of ['code', 'state', 'provider']) url.searchParams.delete(key)
            history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
          }
        }
      }
      const { data: s } = await cloud.auth.getSession()
      if (!cancelled) {
        setSession((s as Session) ?? null)
        setLoading(false)
      }
    }
    restore()
    const unsub = cloud.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') setSession(null)
      else if (s) setSession(s as Session)
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  async function sendEmailCode(email: string): Promise<{ ok: boolean; message?: string; isNew?: boolean }> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: '请输入有效的邮箱地址' }
    const sent = await cloud.auth.sendOtp({ email })
    if (sent.error) return { ok: false, message: sent.error.message }
    pendingEmailOtp = {
      email,
      verificationId: sent.data.verificationId,
      isExistingUser: sent.data.isExistingUser,
    }
    return { ok: true, isNew: sent.data.isExistingUser }
  }

  async function verifyEmailCode(code: string): Promise<{ ok: boolean; message?: string }> {
    const pending = pendingEmailOtp
    if (!pending) return { ok: false, message: '请先获取验证码' }
    const completed = await cloud.auth.verifyOtp({
      email: pending.email,
      verificationId: pending.verificationId,
      isExistingUser: pending.isExistingUser,
      token: code,
    })
    if (completed.error) return { ok: false, message: completed.error.message }
    pendingEmailOtp = null
    setSession(completed.data ? ({ user: completed.data.user } as Session) : null)
    // 重新拉取一次会话，确保会话对象完整
    const { data: s } = await cloud.auth.getSession()
    if (s) setSession(s as Session)
    return { ok: true }
  }

  async function signOut() {
    await cloud.auth.signOut()
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, loading, sendEmailCode, verifyEmailCode, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
