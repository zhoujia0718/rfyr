"use client"

import * as React from "react"
import { MemberTier, MEMBER_TIERS } from "@/lib/member-tiers"
import { calculateQuota, DEFAULT_QUOTA } from "@/lib/quota-calculator"
import { useMembership } from "@/components/membership-provider"
import { useReadingSettings } from "@/hooks/use-reading-settings"
import { getInitData, clearInitCache } from "@/lib/init-cache"

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "rfyr_visited_notes"
const QUOTA_SYNC_KEY = "rfyr_quota_sync"

function readQuotaFromCache(): QuotaSnapshot | null {
  try {
    const raw = localStorage.getItem(QUOTA_SYNC_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return {
      totalReadCount: Number(data.readCount ?? 0),
      dailyReadCount: Number(data.dailyReadCount ?? 0),
      bonusCount: Number(data.bonusCount ?? 0),
      dailyBonusCount: Number(data.dailyBonusCount ?? 0),
      effectiveDailyLimit: data.effectiveDailyLimit,
      readIds: data.readIds ?? [],
      todayReadIds: data.todayReadIds ?? [],
    }
  } catch { return null }
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  try {
    const raw = localStorage.getItem("custom_auth")
    if (!raw) return headers
    const authData = JSON.parse(raw)
    // fakeToken 有效期 7 天，优先使用；session.access_token 仅 1 小时
    const token = authData.fakeToken || authData.session?.access_token
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
    if (authData.user?.id) {
      headers["X-User-Id"] = authData.user.id
    }
  } catch { /* ignore */ }
  return headers
}

function hasValidSession(): boolean {
  try {
    const raw = localStorage.getItem("custom_auth")
    if (!raw) return false
    const authData = JSON.parse(raw)
    if (!authData.user?.id) return false
    const now = Math.floor(Date.now() / 1000)
    // 优先检查 fakeToken 过期时间（7 天）
    const fakeToken = authData.fakeToken
    if (fakeToken && typeof fakeToken === "string" && fakeToken.startsWith("fake_")) {
      try {
        const remainder = fakeToken.slice(4, -64)
        const firstPipe = remainder.indexOf("|")
        const lastPipe = remainder.lastIndexOf("|")
        if (firstPipe !== -1 && lastPipe !== -1 && firstPipe !== lastPipe) {
          const tokenExp = parseInt(remainder.slice(firstPipe + 1, lastPipe), 10)
          return isNaN(tokenExp) || now <= tokenExp
        }
      } catch { /* fall through */ }
    }
    // 无 fakeToken 时回退到 session.expires_at（Supabase JWT，1 小时）
    if (authData.session?.expires_at) {
      const expiresAt = Number(authData.session.expires_at)
      if (expiresAt > 0 && expiresAt < now) return false
    }
    return true
  } catch {
    return false
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface QuotaSnapshot {
  totalReadCount: number
  dailyReadCount: number
  bonusCount?: number
  dailyBonusCount?: number
  effectiveDailyLimit?: number
  readIds?: string[]
  todayReadIds?: string[]
}

interface ReadingContextValue {
  readCount: number
  readIds: string[]
  todayReadIds: string[]
  dailyReadCount: number
  bonusCount: number
  dailyBonusCount: number
  effectiveDailyLimit: number
  isLoading: boolean
  isLoggedIn: boolean
  refresh: () => Promise<void>
  updateQuota: (next: QuotaSnapshot) => void
}

const ReadingContext = React.createContext<ReadingContextValue | null>(null)

// 从 QUOTA_SYNC_KEY 读取缓存，避免 reload 时从 0 开始闪烁
const initialQuota = readQuotaFromCache()

export function ReadingProvider({ children }: { children: React.ReactNode }) {
  const [readCount, setReadCount] = React.useState(() => initialQuota?.totalReadCount ?? 0)
  const [readIds, setReadIds] = React.useState<string[]>(() => initialQuota?.readIds ?? [])
  const [todayReadIds, setTodayReadIds] = React.useState<string[]>(() => initialQuota?.todayReadIds ?? [])
  const [dailyReadCount, setDailyReadCount] = React.useState(() => initialQuota?.dailyReadCount ?? 0)
  const [bonusCount, setBonusCount] = React.useState(() => initialQuota?.bonusCount ?? 0)
  const [dailyBonusCount, setDailyBonusCount] = React.useState(() => initialQuota?.dailyBonusCount ?? 0)
  const [effectiveDailyLimit, setEffectiveDailyLimit] = React.useState(() => initialQuota?.effectiveDailyLimit ?? DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isLoggedIn, setIsLoggedIn] = React.useState(false)
  const fetchRef = React.useRef<Promise<void> | null>(null)
  // Tracks the last time updateQuota was called by a live article event.
  // fetchData uses this to avoid overwriting fresher event data with stale DB reads.
  const lastQuotaUpdateTimeRef = React.useRef(0)

  const fetchData = React.useCallback(async () => {
    if (typeof window === "undefined") return

    const customAuth = localStorage.getItem("custom_auth")
    const headers: Record<string, string> = {}

    if (customAuth) {
      try {
        const authData = JSON.parse(customAuth)
        const token = authData.fakeToken || authData.session?.access_token
        if (token) {
          headers["Authorization"] = `Bearer ${token}`
        }
        if (authData.user?.id) {
          headers["X-User-Id"] = authData.user.id
        }
      } catch { /* ignore */ }
    }

    const token = headers["Authorization"]?.replace("Bearer ", "")
    if (!token) {
      setIsLoggedIn(false)
      setIsLoading(false)
      return
    }

    const fetchStartTime = Date.now()

    // 使用共享的 /api/init 缓存（与 MembershipProvider 共享同一请求）
    const initData = await getInitData()

    const limitData = initData.readingLimit
    const settingsData = initData.settings

    if (!limitData) {
      // authenticated === false：服务端明确拒绝了 token（过期/无效），清除本地残留登录态
      if (initData.authenticated === false) {
        try { localStorage.removeItem("custom_auth") } catch {}
        setIsLoggedIn(false)
      }
      setIsLoading(false)
      return
    }

    setIsLoggedIn(true)

    const fetchedTotal = Number(limitData.readCount ?? 0)
    if (lastQuotaUpdateTimeRef.current > fetchStartTime) {
      setReadCount(prev => Math.max(prev, fetchedTotal))
    } else {
      setReadCount(fetchedTotal)
    }
    setReadIds(limitData.readIds ?? [])
    setTodayReadIds(limitData.todayReadIds ?? [])
    // If a live article event arrived during the fetch it has fresher data —
    // use Math.max so this stale DB read never regresses the displayed count.
    const fetchedDaily = Number(limitData.dailyReadCount ?? 0)
    if (lastQuotaUpdateTimeRef.current > fetchStartTime) {
      setDailyReadCount(prev => Math.max(prev, fetchedDaily))
    } else {
      setDailyReadCount(fetchedDaily)
    }
    setBonusCount(Number(limitData.bonusCount ?? 0))
    setDailyBonusCount(Number(limitData.dailyBonusCount ?? 0))
    setEffectiveDailyLimit(
      Number(settingsData.monthly_daily_limit ?? 8) +
      Number(limitData.dailyBonusCount ?? 0)
    )
    setIsLoading(false)
  }, [])

  const refresh = React.useCallback(async () => {
    if (!fetchRef.current) {
      fetchRef.current = fetchData().finally(() => {
        fetchRef.current = null
      })
    }
    return fetchRef.current
  }, [fetchData])

  const updateQuota = React.useCallback((next: QuotaSnapshot) => {
    lastQuotaUpdateTimeRef.current = Date.now()
    setReadCount(next.totalReadCount)
    setDailyReadCount(next.dailyReadCount)
    if (next.bonusCount !== undefined) setBonusCount(next.bonusCount)
    if (next.dailyBonusCount !== undefined) setDailyBonusCount(next.dailyBonusCount)
    if (next.effectiveDailyLimit !== undefined && Number.isFinite(next.effectiveDailyLimit)) {
      setEffectiveDailyLimit(next.effectiveDailyLimit)
    }
    if (next.todayReadIds !== undefined) setTodayReadIds(next.todayReadIds)
    if (next.readIds !== undefined) setReadIds(next.readIds)
    // 写入 localStorage，触发其他 Tab 的 storage 事件，实现跨 Tab 同步
    try {
      localStorage.setItem(QUOTA_SYNC_KEY, JSON.stringify({
        readCount: next.totalReadCount,
        dailyReadCount: next.dailyReadCount,
        bonusCount: next.bonusCount ?? 0,
        dailyBonusCount: next.dailyBonusCount ?? 0,
        effectiveDailyLimit: next.effectiveDailyLimit,
        readIds: next.readIds,
        todayReadIds: next.todayReadIds,
      }))
    } catch { /* ignore */ }
  }, [])

  React.useEffect(() => {
    setIsLoggedIn(hasValidSession())
    void fetchData()
  }, [fetchData])

  // 登录成功后重新拉取阅读数据，更新 isLoggedIn
  React.useEffect(() => {
    const handler = () => {
      clearInitCache()
      void fetchData()
    }
    window.addEventListener("rfyr:auth-refresh", handler)
    return () => window.removeEventListener("rfyr:auth-refresh", handler)
  }, [fetchData])

  // 设置更新后重新拉取（清除 init 缓存，下次 fetchData 会重新请求 /api/init）
  React.useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "rfyr_settings_updated") {
        clearInitCache()
        void fetchData()
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [fetchData])

  // 同 Tab 设置更新事件（storage 事件不在同 Tab 触发）
  React.useEffect(() => {
    const handler = () => {
      clearInitCache()
      void fetchData()
    }
    window.addEventListener("rfyr:settings-updated", handler)
    return () => window.removeEventListener("rfyr:settings-updated", handler)
  }, [fetchData])

  // ── 监听 useArticleReader 事件：文章 API 返回最新配额后立即同步到 Context ──
  // 解决：article API 记录阅读 → reading-limit API 再次调用时 alreadyRead=true → dailyReadCount 不更新
  React.useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ readCount: number; dailyReadCount: number; effectiveDailyLimit?: number; bonusCount?: number; dailyBonusCount?: number; readIds?: string[]; todayReadIds?: string[] }>
      const data = custom.detail
      if (!data) return
      updateQuota({
        totalReadCount: data.readCount,
        dailyReadCount: data.dailyReadCount,
        bonusCount: data.bonusCount,
        dailyBonusCount: data.dailyBonusCount,
        effectiveDailyLimit: data.effectiveDailyLimit,
        readIds: data.readIds,
        todayReadIds: data.todayReadIds,
      })
    }
    window.addEventListener("rfyr:quota-update", handler)
    return () => window.removeEventListener("rfyr:quota-update", handler)
  }, [updateQuota])

  // ── 跨 Tab 同步：其他 Tab 记录阅读后，通过 storage 事件同步到当前 Tab ──
  React.useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== QUOTA_SYNC_KEY || !e.newValue) return
      try {
        const data = JSON.parse(e.newValue)
        updateQuota({
          totalReadCount: data.readCount ?? 0,
          dailyReadCount: data.dailyReadCount ?? 0,
          bonusCount: data.bonusCount ?? 0,
          dailyBonusCount: data.dailyBonusCount ?? 0,
          effectiveDailyLimit: data.effectiveDailyLimit,
          readIds: data.readIds,
          todayReadIds: data.todayReadIds,
        })
      } catch { /* ignore */ }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [updateQuota])

  return (
    <ReadingContext.Provider value={{
      readCount, readIds, todayReadIds, dailyReadCount,
      bonusCount, dailyBonusCount, effectiveDailyLimit,
      isLoading, isLoggedIn, refresh, updateQuota,
    }}>
      {children}
    </ReadingContext.Provider>
  )
}

export function useReadingContext(): ReadingContextValue {
  const ctx = React.useContext(ReadingContext)
  if (!ctx) {
    throw new Error("useReadingContext must be used within ReadingProvider")
  }
  return ctx
}

// ─── useReadingLimit ──────────────────────────────────────────────────────────

interface UseReadingLimitReturn {
  canRead: boolean
  remaining: number
  totalReadCount: number
  dailyReadCount: number
  maxCount: number
  effectiveDailyLimit: number
  isOverLimit: boolean
  isUnlimited: boolean
  bonusCount: number
  dailyBonusCount: number
  tier: MemberTier
  isLoggedIn: boolean
  isLoading: boolean
  requiresLogin: boolean
  isMonthly: boolean
  isYearly: boolean
  readCount: number
  readIds: string[]
  todayReadIds: string[]
  recordVisit: (articleId: string) => Promise<{ exceeded?: boolean; alreadyRead?: boolean } | void>
  refreshCount: () => Promise<void>
}

export function useReadingLimit(): UseReadingLimitReturn {
  const ctx = useReadingContext()
  const { membershipType, isLoading: membershipLoading } = useMembership()
  const { guest_read_limit, monthly_daily_limit, loading: settingsLoading } = useReadingSettings()

  const result = React.useMemo(() => {
    return calculateQuota({
      tier: membershipType,
      quota: {
        totalReadCount: ctx.readCount,
        readIds: ctx.readIds,
        dailyReadCount: ctx.dailyReadCount,
        lastReadDate: null,
        bonusCount: ctx.bonusCount,
        dailyBonusCount: ctx.dailyBonusCount,
        bonusResetDate: null,
      },
      guestReadLimit: guest_read_limit ?? DEFAULT_QUOTA.GUEST_READ_LIMIT,
      monthlyDailyLimit: monthly_daily_limit ?? DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT,
      referralBonusCount: DEFAULT_QUOTA.REFERRAL_BONUS_COUNT,
      referralDailyBonus: DEFAULT_QUOTA.REFERRAL_DAILY_BONUS,
      articleRequires: "notes",
    })
  }, [membershipType, ctx.readCount, ctx.dailyReadCount, ctx.bonusCount, ctx.dailyBonusCount, ctx.effectiveDailyLimit, guest_read_limit, monthly_daily_limit])

  const recordVisit = React.useCallback(async (articleId: string) => {
    if (typeof window === "undefined") return

    if (!ctx.isLoggedIn) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const visited: string[] = raw ? JSON.parse(raw) : []
        if (visited.includes(articleId)) return
        const updated = Array.from(new Set([...visited, articleId]))
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        ctx.updateQuota({
          totalReadCount: updated.length,
          dailyReadCount: ctx.dailyReadCount,
          bonusCount: ctx.bonusCount,
          dailyBonusCount: ctx.dailyBonusCount,
        })
      } catch { /* ignore */ }
      return
    }

    // 月卡传 dailyLimit；年卡/永久卡无限制
    const dailyLimit = membershipType === MEMBER_TIERS.MONTHLY
      ? (result.dailyLimit > 0 ? result.dailyLimit : monthly_daily_limit ?? DEFAULT_QUOTA.MONTHLY_DAILY_LIMIT)
      : null

    try {
      const headers = buildAuthHeaders()
      headers["Content-Type"] = "application/json"
      const res = await fetch("/api/reading-limit", {
        method: "POST",
        headers,
        body: JSON.stringify({ articleId, dailyLimit }),
      })
      if (!res.ok) return

      const data = await res.json()
      if (!data.success) return

      ctx.updateQuota({
        totalReadCount: Number(data.readCount ?? ctx.readCount),
        dailyReadCount: Number(data.dailyReadCount ?? ctx.dailyReadCount),
        bonusCount: Number(data.bonusCount ?? ctx.bonusCount),
        dailyBonusCount: Number(data.dailyBonusCount ?? ctx.dailyBonusCount),
        todayReadIds: data.todayReadIds ?? ctx.todayReadIds,
      })

      return { exceeded: data.exceeded, alreadyRead: data.alreadyRead }
    } catch { /* ignore */ }
  }, [ctx, membershipType, result])

  return {
    canRead: result.canRead,
    remaining: result.totalRemaining,
    totalReadCount: ctx.readCount,
    dailyReadCount: ctx.dailyReadCount,
    maxCount: result.totalLimit,
    effectiveDailyLimit: result.dailyLimit,
    isOverLimit: result.isOverLimit,
    isUnlimited: result.isUnlimited,
    bonusCount: ctx.bonusCount,
    dailyBonusCount: ctx.dailyBonusCount,
    tier: membershipType,
    isLoggedIn: ctx.isLoggedIn,
    isLoading: membershipLoading || settingsLoading || ctx.isLoading,
    requiresLogin: !ctx.isLoggedIn,
    isMonthly: membershipType === MEMBER_TIERS.MONTHLY,
    isYearly: membershipType === MEMBER_TIERS.YEARLY,
    readCount: ctx.readCount,
    readIds: ctx.readIds,
    todayReadIds: ctx.todayReadIds,
    recordVisit,
    refreshCount: ctx.refresh,
  }
}

/** 清除游客已读记录 */
export function clearVisitedNotes() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY)
  }
}
