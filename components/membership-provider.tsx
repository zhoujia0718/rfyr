"use client"

import * as React from "react"
import {
  MemberTier,
  MembershipInfo,
  MemberContentPermission,
  MEMBER_TIERS,
  hasPermission,
  getMembershipLabel,
  isMembershipValid,
  getMembershipFromStorage,
  saveMembershipToStorage,
  clearMembershipFromStorage,
  createMembership,
  parseMemberTier,
} from "@/lib/membership"
import { refreshSessionIfNeeded } from "@/lib/session-refresh"
import { getInitData, clearInitCache } from "@/lib/init-cache"

interface MembershipContextType {
  membership: MembershipInfo | null
  membershipType: MemberTier
  isLoading: boolean
  hasAccess: (permission: MemberContentPermission) => boolean
  getLabel: () => string
  activateMembership: (tier: MemberTier, days?: number) => Promise<MembershipInfo | null>
  deactivateMembership: () => void
  /** 刷新：调用 API 获取最新状态并更新（返回新状态） */
  refreshMembership: () => Promise<MembershipInfo | null>
}

const MembershipContext = React.createContext<MembershipContextType | undefined>(undefined)

const STORAGE_KEY = "rfyr_membership_cache"

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const [membership, setMembership] = React.useState<MembershipInfo | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  // ── 初始化：缓存优先，API 刷新 ───────────────────────────────────
  React.useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      try {
        // 1. 优先从缓存恢复（立即显示）
        const cached = getMembershipFromStorage()
        if (cached && isMembershipValid(cached)) {
          setMembership(cached)
        }

        // 2. 静默调用 API 获取最新状态
        const fresh = await fetchMembershipFromAPI()
        if (fresh) {
          setMembership(fresh)
          saveMembershipToStorage(fresh)
        }
      } finally {
        setIsLoading(false)
      }
    }

    void init()
  }, [])

  // ── 监听登录成功事件（清除 init 缓存后重新拉取）──────────────────
  React.useEffect(() => {
    const handler = () => {
      clearInitCache() // 登录态变化后强制重新请求
      void (async () => {
        const fresh = await fetchMembershipFromAPI()
        if (fresh) {
          setMembership(fresh)
          saveMembershipToStorage(fresh)
        } else {
          setMembership(null)
          clearMembershipFromStorage()
        }
      })()
    }
    window.addEventListener("rfyr:auth-refresh", handler)
    return () => window.removeEventListener("rfyr:auth-refresh", handler)
  }, [])

  // ── 获取 API 状态（复用 /api/init 共享缓存，与 ReadingContext 同一次请求）──
  const fetchMembershipFromAPI = React.useCallback(async (): Promise<MembershipInfo | null> => {
    try {
      // P1 修复：发请求前刷新即将过期的 Magic Link 会话 token
      await refreshSessionIfNeeded()

      // 使用共享 /api/init（与 ReadingContext 共享同一 Promise，零额外请求）
      const initData = await getInitData()
      const m = initData.membership
      const rawTier = m?.tier ?? "none"

      if (!rawTier || rawTier === "none") {
        // 检查是否因为 token 无效（initData.readingLimit 为 null 且无会员）
        // 注意：readingLimit 为 null 有两种情况：
        //   1. 未登录（无 custom_auth）→ 应该显示登录弹窗
        //   2. 新注册用户尚无 user_profiles 记录 → 不应清空登录状态！
        //   用 customAuth 是否存在来区分这两种情况
        const customAuth = localStorage.getItem("custom_auth")
        if (customAuth) {
          try {
            const authData = JSON.parse(customAuth)
            const hasUserId = !!authData.user?.id
            const now = Math.floor(Date.now() / 1000)

            // 优先用 fakeToken 自身过期时间（7天）；
            // 若无 fakeToken 则回退到 session.expires_at（Supabase JWT，1小时）
            let isExpired = false
            const fakeToken = authData.fakeToken
            if (fakeToken && typeof fakeToken === "string" && fakeToken.startsWith("fake_")) {
              try {
                // token 格式：fake_{userId}|{expiresAt}|{64-char-sig}
                const remainder = fakeToken.slice(4, -64)
                const firstPipe = remainder.indexOf("|")
                const lastPipe = remainder.lastIndexOf("|")
                if (firstPipe !== -1 && lastPipe !== -1 && firstPipe !== lastPipe) {
                  const tokenExp = parseInt(remainder.slice(firstPipe + 1, lastPipe), 10)
                  isExpired = !isNaN(tokenExp) && now > tokenExp
                }
              } catch {
                // 解析失败时不强制登出
              }
            } else {
              // 无 fakeToken，使用 Supabase JWT 过期时间
              const expiresAt = Number(authData.session?.expires_at ?? 0)
              isExpired = expiresAt > 0 && expiresAt < now
            }

            if (isExpired || !hasUserId) {
              localStorage.removeItem("custom_auth")
              localStorage.removeItem("rfyr_membership_cache")
              setMembership(null)
              window.dispatchEvent(new CustomEvent("rfyr:show-login"))
            }
          } catch {
            // custom_auth 解析失败，清空
            localStorage.removeItem("custom_auth")
            localStorage.removeItem("rfyr_membership_cache")
            setMembership(null)
            window.dispatchEvent(new CustomEvent("rfyr:show-login"))
          }
        }
        return null
      }

      const tier = parseMemberTier(rawTier)
      if (tier === MEMBER_TIERS.NONE) return null

      const info = createMembership(tier)
      return info
    } catch {
      return null
    }
  }, [])

  // ── P9 修复：刷新后直接使用 API 返回值，不重复请求 ──────────────────
  const refreshMembership = React.useCallback(async (): Promise<MembershipInfo | null> => {
    const fresh = await fetchMembershipFromAPI()
    if (fresh) {
      setMembership(fresh)
      saveMembershipToStorage(fresh)
    } else {
      setMembership(null)
      clearMembershipFromStorage()
    }
    return fresh
  }, [fetchMembershipFromAPI])

  // ── 权限检查 ────────────────────────────────────────────────────
  const membershipType: MemberTier = React.useMemo(() => {
    if (!membership || !isMembershipValid(membership)) return MEMBER_TIERS.NONE
    return membership.type
  }, [membership])

  const hasAccess = React.useCallback(
    (permission: MemberContentPermission) => hasPermission(membershipType, permission),
    [membershipType]
  )

  const getLabel = React.useCallback(() => getMembershipLabel(membershipType), [membershipType])

  // ── 激活会员 ────────────────────────────────────────────────────
  const activateMembership = React.useCallback(
    async (tier: MemberTier, days?: number): Promise<MembershipInfo | null> => {
      try {
        const customAuth = localStorage.getItem("custom_auth")
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (customAuth) {
          try {
            const authData = JSON.parse(customAuth)
            const token = authData.session?.access_token || authData.fakeToken
            if (token) {
              headers["Authorization"] = `Bearer ${token}`
            }
            if (authData.user?.id) {
              headers["X-User-Id"] = authData.user.id
            }
          } catch { /* ignore */ }
        }

        const planType = tier === MEMBER_TIERS.YEARLY ? "yearly" : "monthly"
        const res = await fetch("/api/membership/activate", {
          method: "POST",
          headers,
          body: JSON.stringify({ planType, duration: days }),
        })

        if (res.ok) {
          // P9 修复：直接使用 API 返回值，刷新一次获取最新状态
          const fresh = await refreshMembership()
          return fresh
        }

        return null
      } catch {
        // 网络错误时，使用本地构造的数据（降级）
        const info = createMembership(tier, days)
        saveMembershipToStorage(info)
        setMembership(info)
        return info
      }
    },
    [refreshMembership]
  )

  const deactivateMembership = React.useCallback(() => {
    setMembership(null)
    clearMembershipFromStorage()
  }, [])

  return (
    <MembershipContext.Provider
      value={{
        membership,
        membershipType,
        isLoading,
        hasAccess,
        getLabel,
        activateMembership,
        deactivateMembership,
        refreshMembership,
      }}
    >
      {children}
    </MembershipContext.Provider>
  )
}

export function useMembership() {
  const ctx = React.useContext(MembershipContext)
  if (!ctx) throw new Error("useMembership must be used within MembershipProvider")
  return ctx
}
