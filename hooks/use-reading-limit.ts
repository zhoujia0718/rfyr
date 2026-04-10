"use client"

/**
 * 短线笔记阅读次数限制 hook
 *
 * 规则：
 *   - 游客：须先登录才可阅读（不享受免登录试读）
 *   - 已登录普通用户：默认 3 + read_bonus 篇（localStorage + 数据库）
 *   - 周卡：同上额度；年卡：不限制
 */

import * as React from "react"
import { resolveAuthenticatedUserId } from "@/lib/app-user-id"
import { supabase } from "@/lib/supabase"

const FREE_READ_COUNT = 3
const STORAGE_KEY = "rfyr_visited_notes"

interface ReadingLimitInfo {
  /** 已读篇数（仅登录后计入） */
  readCount: number
  /** 允许阅读篇数上限 */
  maxCount: number
  /** 是否超限（已登录且已读 >= 上限） */
  isOverLimit: boolean
  /** 未登录：须先完成登录才能阅读笔记正文 */
  requiresLogin: boolean
  /** 是否是已登录用户 */
  isLoggedIn: boolean
  /** 是否年卡（不限制） */
  isYearly: boolean
  /** 剩余可读篇数 */
  remaining: number
  /** 当前会员类型 */
  membershipType: "none" | "weekly" | "yearly"
  /** 是否正在加载 */
  isLoading: boolean
}

export function useReadingLimit() {
  const [info, setInfo] = React.useState<ReadingLimitInfo>({
    readCount: 0,
    maxCount: FREE_READ_COUNT,
    isOverLimit: false,
    requiresLogin: true,
    isLoggedIn: false,
    isYearly: false,
    remaining: FREE_READ_COUNT,
    membershipType: "none",
    isLoading: true,
  })

  // 从 localStorage 获取游客已读列表
  const getVisitedNotes = (): string[] => {
    if (typeof window === "undefined") return []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  // 记录已读文章（勿在组件 render 中直接调用，会 setState 导致无限重渲染）
  const recordVisit = React.useCallback((articleId: string) => {
    const visited = new Set(getVisitedNotes())
    visited.add(articleId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]))
    setInfo((prev) => {
      const newCount = visited.size
      const newRemaining = Math.max(0, prev.maxCount - newCount)
      return {
        ...prev,
        readCount: newCount,
        isOverLimit: newCount >= prev.maxCount,
        remaining: newRemaining,
      }
    })
  }, [])

  // 获取登录用户的阅读信息
  const fetchLoginUserLimit = React.useCallback(async () => {
    const userId = await resolveAuthenticatedUserId()
    if (!userId) {
      // 游客：不开放免登录阅读，仅提示登录（不在此累计篇数）
      setInfo({
        readCount: 0,
        maxCount: FREE_READ_COUNT,
        isOverLimit: false,
        requiresLogin: true,
        isLoggedIn: false,
        isYearly: false,
        remaining: FREE_READ_COUNT,
        membershipType: "none",
        isLoading: false,
      })
      return
    }

    // 已登录用户
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("read_bonus, free_read_count")
      .eq("id", userId)
      .single()

    const { data: user } = await supabase
      .from("users")
      .select("vip_tier")
      .eq("id", userId)
      .single()

    const vipTier = user?.vip_tier || "none"
    const isYearly = vipTier === "yearly" || String(vipTier).includes("yearly")
    const isWeekly = vipTier === "weekly" || String(vipTier).includes("weekly")

    if (isYearly) {
      setInfo({
        readCount: 0,
        maxCount: Infinity,
        isOverLimit: false,
        requiresLogin: false,
        isLoggedIn: true,
        isYearly: true,
        remaining: Infinity,
        membershipType: "yearly",
        isLoading: false,
      })
      return
    }

    const freeCount = profile?.free_read_count ?? FREE_READ_COUNT
    const readBonus = profile?.read_bonus ?? 0
    const maxCount = freeCount + readBonus
    const readCount = getVisitedNotes().length

    setInfo({
      readCount,
      maxCount,
      isOverLimit: readCount >= maxCount,
      requiresLogin: false,
      isLoggedIn: true,
      isYearly: false,
      remaining: Math.max(0, maxCount - readCount),
      membershipType: isWeekly ? "weekly" : "none",
      isLoading: false,
    })
  }, [])

  React.useEffect(() => {
    void fetchLoginUserLimit()
  }, [fetchLoginUserLimit])

  return { ...info, recordVisit }
}

/** 清除已读记录（退出登录时调用） */
export function clearVisitedNotes() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY)
  }
}
