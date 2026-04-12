"use client"

/**
 * 短线笔记阅读次数限制 hook
 *
 * 规则：
 *   - 游客：须先登录才可阅读（不享受免登录试读）
 *   - 已登录普通用户：默认 3 + read_bonus 篇（localStorage 记录）
 *   - 周卡：10 篇（localStorage 记录）
 *   - 年卡：不限制
 *
 * 会员类型统一由 MembershipProvider（走服务端 API，绕过 RLS）提供，
 * 本 hook 只负责 localStorage 层面的阅读篇数记录。
 */

import * as React from "react"
import { useMembership } from "@/components/membership-provider"

const FREE_READ_COUNT = 3
const STORAGE_KEY = "rfyr_visited_notes"

interface ReadingLimitInfo {
  /** 已读篇数（localStorage 记录） */
  readCount: number
  /** 允许阅读篇数上限 */
  maxCount: number
  /** 是否超限（已读 >= 上限） */
  isOverLimit: boolean
  /** 未登录：须先完成登录才能阅读笔记正文 */
  requiresLogin: boolean
  /** 是否已登录用户 */
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
  const { membershipType, isLoading: membershipLoading } = useMembership()

  const [readCount, setReadCount] = React.useState(0)

  // 初始化：从 localStorage 恢复已读篇数
  React.useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const visited: string[] = raw ? JSON.parse(raw) : []
      setReadCount(visited.length)
    } catch {
      setReadCount(0)
    }
  }, [])

  // 计算各档上限
  const maxCount = React.useMemo(() => {
    if (membershipType === "yearly") return Infinity
    if (membershipType === "weekly") return 10
    return FREE_READ_COUNT
  }, [membershipType])

  const remaining = maxCount === Infinity ? Infinity : Math.max(0, maxCount - readCount)

  const isLoggedIn = membershipType !== "none" || !membershipLoading

  // 游客须先登录
  const requiresLogin = membershipLoading || membershipType === "none"

  const isOverLimit = membershipType !== "yearly" && readCount >= maxCount

  const info: ReadingLimitInfo = {
    readCount,
    maxCount,
    isOverLimit,
    requiresLogin,
    isLoggedIn,
    isYearly: membershipType === "yearly",
    remaining,
    membershipType: membershipType === "none" ? "none" : membershipType,
    isLoading: membershipLoading,
  }

  // 记录已读文章（勿在组件 render 中直接调用）
  const recordVisit = React.useCallback((articleId: string) => {
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const visited: string[] = raw ? JSON.parse(raw) : []
      const updated = Array.from(new Set([...visited, articleId]))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      setReadCount(updated.length)
    } catch { /* ignore */ }
  }, [])

  return { ...info, recordVisit }
}

/** 清除已读记录（退出登录时调用） */
export function clearVisitedNotes() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY)
  }
}
