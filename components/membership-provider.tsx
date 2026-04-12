"use client"

import * as React from "react"
import { supabase } from "@/lib/supabase"
import { resolveAppUserId } from "@/lib/app-user-id"
import {
  MembershipType,
  MembershipInfo,
  MemberContentPermission,
  hasPermission,
  getMembershipLabel,
  isMembershipValid,
  getMembershipFromStorage,
  saveMembershipToStorage,
  clearMembershipFromStorage,
  createMembership,
} from "@/lib/membership"

interface MembershipContextType {
  membership: MembershipInfo | null
  membershipType: MembershipType
  isLoading: boolean
  hasAccess: (permission: MemberContentPermission) => boolean
  getLabel: () => string
  activateMembership: (type: MembershipType, durationDays: number) => void
  deactivateMembership: () => void
  refreshMembership: () => void
}

const MembershipContext = React.createContext<MembershipContextType | undefined>(undefined)

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const [membership, setMembership] = React.useState<MembershipInfo | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  /** 以 users.vip_tier 为权威数据，用服务端 API（service role）绕过 RLS */
  const fetchMembershipFromBackend = React.useCallback(async () => {
    // 防止 SSR 阶段访问 localStorage / 执行外部 API 调用导致页面崩溃
    if (typeof window === 'undefined') return null

    try {
      const uid = await resolveAppUserId()
      if (!uid) {
        clearMembershipFromStorage()
        return null
      }

      // 通过服务端 API 获取会员状态（绕过 RLS）
      const customAuth = localStorage.getItem("custom_auth")
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (customAuth) {
        try {
          const authData = JSON.parse(customAuth)
          if (authData.session?.access_token) {
            headers.Authorization = `Bearer ${authData.session.access_token}`
          }
          if (authData.user?.id) {
            headers["X-User-Id"] = authData.user.id
          }
        } catch { /* ignore */ }
      }

      const res = await fetch("/api/membership/status", { headers })
      const data = await res.json()

      const rawTier = String(data.vip_tier || "none").toLowerCase()
      const tierIsYearly = rawTier.includes("yearly") || rawTier.includes("annual") || rawTier === "yearly"
      const tierIsWeekly = rawTier.includes("weekly") || rawTier === "weekly"

      if (tierIsYearly) {
        const info = makeInfo("yearly")
        saveMembershipToStorage(info)
        return info
      }

      if (tierIsWeekly) {
        const info = makeInfo("weekly")
        saveMembershipToStorage(info)
        return info
      }

      clearMembershipFromStorage()
      return null
    } catch (err) {
      console.error("获取会员状态失败:", err)
      return null
    }
  }, [])

  React.useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      try {
        const stored = getMembershipFromStorage()
        if (stored && isMembershipValid(stored)) setMembership(stored)
        // 始终以后端数据为准，防止管理员变更后本地缓存不过期
        const info = await fetchMembershipFromBackend()
        setMembership(info)
      } finally {
        setIsLoading(false)
      }
    }
    void init()
  }, [fetchMembershipFromBackend])

  const membershipType: MembershipType = React.useMemo(() => {
    if (!membership || !isMembershipValid(membership)) return "none"
    return membership.type
  }, [membership])

  const hasAccess = React.useCallback(
    (permission: MemberContentPermission) => hasPermission(membershipType, permission),
    [membershipType]
  )

  const getLabel = React.useCallback(() => getMembershipLabel(membershipType), [membershipType])

  const activateMembership = React.useCallback(
    (type: MembershipType, days: number) => {
      const m = createMembership(type, days)
      setMembership(m)
      saveMembershipToStorage(m)
    },
    []
  )

  const deactivateMembership = React.useCallback(() => {
    setMembership(null)
    clearMembershipFromStorage()
  }, [])

  const refreshMembership = React.useCallback(async () => {
    const info = await fetchMembershipFromBackend()
    setMembership(info)
  }, [fetchMembershipFromBackend])

  return (
    <MembershipContext.Provider
      value={{ membership, membershipType, isLoading, hasAccess, getLabel, activateMembership, deactivateMembership, refreshMembership }}
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

// ── helpers ──────────────────────────────────────────────────────────────────

function isYearly(raw?: string): boolean {
  const r = String(raw || "").toLowerCase()
  return r.includes("annual") || r.includes("yearly")
}

function makeInfo(type: MembershipType): MembershipInfo {
  return {
    type,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 5).toISOString(),
    isActive: true,
  }
}
