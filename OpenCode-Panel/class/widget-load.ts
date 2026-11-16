import { AbortController, type AbortSignal } from "scripting"

export interface WidgetLoadResult<T> {
  data: T | null
  stale: boolean
}

interface CachedValue<T> {
  account: string
  savedAt: number
  data: T
}

const WAIT_MS: number = 4000
const MAX_CACHE_AGE_MS: number = 24 * 60 * 60 * 1000

/** Bound the entire operation, including body parsing, before submitting a view. */
export async function loadWidgetData<T>(
  key: string,
  token: string,
  load: (signal: AbortSignal) => Promise<T>,
): Promise<WidgetLoadResult<T>> {
  const tokenData: Data | null = Data.fromRawString(token)
  const account: string = tokenData ? Crypto.sha256(tokenData).toHexString() : ""
  const controller: AbortController = new AbortController()
  let timer: number | undefined

  try {
    const deadline: Promise<never> = new Promise((_, reject: (error: Error) => void) => {
      timer = setTimeout(() => {
        reject(new Error("小组件请求超时"))
        controller.abort()
      }, WAIT_MS)
    })
    const data: T = await Promise.race([
      Promise.resolve().then(() => load(controller.signal)),
      deadline,
    ])
    // A late response cannot reach this write after the deadline won the race.
    try {
      Storage.set<CachedValue<T>>(key, { account, savedAt: Date.now(), data })
    } catch {
      // Cache failures must not discard a successful response.
    }
    return { data, stale: false }
  } catch (error: unknown) {
    const status: unknown = typeof error === "object" && error !== null && "status" in error
      ? (error as { status: unknown }).status
      : null
    if (status === 401 || status === 403) {
      try { Storage.remove(key) } catch {}
      return { data: null, stale: false }
    }
    try {
      const cached: CachedValue<T> | null = Storage.get<CachedValue<T>>(key)
      const age: number = cached ? Date.now() - cached.savedAt : NaN
      if (cached?.account === account && account && age >= 0 && age <= MAX_CACHE_AGE_MS) {
        return { data: cached.data, stale: true }
      }
    } catch {
      // Missing/corrupt storage is equivalent to having no cache.
    }
    return { data: null, stale: false }
  } finally {
    clearTimeout(timer)
  }
}
