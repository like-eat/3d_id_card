import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import { publicConfig } from './publicConfig'

/** 全局唯一云服务客户端：Auth / Database / Storage / LLM 共用 */
export const cloud = createWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey,
})

export function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  if (result.data === null || result.data === undefined) throw new Error('数据为空')
  return result.data
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}

/** 浏览器级网络中断（TypeError: Failed to fetch / network timeout 等） */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && /fetch|network/i.test(String(err.message))
}

/**
 * 对网络类失败自动重试（仅重试 Failed to fetch 这类连接层错误；
 * HTTP 4xx/5xx 与业务错误不重试）。label 用于生成可读错误信息。
 */
export async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isNetworkError(err) || attempt === retries) break
      await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)))
    }
  }
  if (isNetworkError(lastErr)) {
    throw new Error(`${label}：网络请求失败（Failed to fetch）。请检查网络/代理后重试；若反复出现，可改用手动场景。`)
  }
  throw lastErr
}
