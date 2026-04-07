"use client"

import * as React from "react"
import { supabase } from "@/lib/supabase"
import { resolveAppUserId } from "@/lib/app-user-id"
import {
  MembershipType,
  MembershipInfo,
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
  hasAccess: (permission: 'calendar' | 'masters' | 'notes' | 'stocks' | 'pdfDownload') => boolean
  getLabel: () => string
  activateMembership: (type: MembershipType, durationDays: number) => void
  deactivateMembership: () => void
  refreshMembership: () => void
}

const MembershipContext = React.createContext<MembershipContextType | undefined>(undefined)

export function MembershipProvider({ children }: { children: React.ReactNode }) {
  const [membership, setMembership] = React.useState<MembershipInfo | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  /** 始终以 users.vip_tier 为权威数据，memberships 表仅用于取起止日期。 */
  const fetchMembershipFromBackend = React.useCallback(async () => {
    // 防止 SSR 阶段访问 localStorage / 执行外部 API 调用导致页面崩溃
    if (typeof window === 'undefined') return null

    try {
      const uid = await resolveAppUserId()
      if (!uid) {
        clearMembershipFromStorage()
        return null
      }

      // 并行拉 memberships（取日期）+ users（取 vip_tier）
      const [membershipsResult, userRow] = await Promise.all([
        supabase
          .from("memberships")
          .select("*")
          .eq("user_id", uid)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase.from("users").select("vip_tier").eq("id", uid).single(),
      ])

      const rawTier = String(userRow?.data?.vip_tier || "").toLowerCase()
      const tierIsYearly =
        rawTier.includes("yearly") || rawTier.includes("annual") || rawTier === "yearly"
      const tierIsWeekly = rawTier.includes("weekly") || rawTier === "weekly"

      const memberships = membershipsResult.data ?? []
      const now = new Date()
      const active = memberships.filter((m) => now <= new Date(m.end_date))

      // memberships 表无/过期时，以 users.vip_tier 为准
      if (active.length === 0) {
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
      }

      // 有 active memberships 时：优先年卡，同级取 end_date 最晚
      const chosen = active.reduce((best, cur) => {
        const b = isYearly(best.membership_type)
        const c = isYearly(cur.membership_type)
        if (c && !b) return cur
        if (b && !c) return best
        return new Date(cur.end_date) > new Date(best.end_date) ? cur : best
      })

      // 用 users.vip_tier 修正类型，防止 memberships 与 users 表不一致
      const finalType: MembershipType = tierIsYearly
        ? "yearly"
        : tierIsWeekly
        ? "weekly"
        : isYearly(chosen.membership_type)
        ? "yearly"
        : "weekly"

      const info: MembershipInfo = {
        type: finalType,
        startDate: chosen.start_date,
        endDate: chosen.end_date,
        isActive: true,
      }
      saveMembershipToStorage(info)
      return info
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
    (permission: "calendar" | "masters" | "notes" | "stocks" | "pdfDownload") =>
      hasPermission(membershipType, permission),
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
