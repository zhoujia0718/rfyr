"use client"

/**
 * 短线笔记阅读次数限制 hook
 *
 * 规则：
 *   - 已登录用户：readCount 从数据库读取（notes_read_count），recordVisit 写数据库
 *   - 游客（未登录）：readCount 从 localStorage 读写（无法做到真正的账号限制）
 *   - read_bonus（邀请加成）叠加在 maxCount 上，不影响 readCount 本身
 *   - 年卡：不限制
 *
 * 数据库字段（user_profiles 表）：
 *   notes_read_count  INTEGER  — 该账号已读篇数
 *   notes_read_ids    TEXT[]   — 已读文章 ID 列表（防同一篇重复计数）
 */
import * as React from "react"
import { useMembership } from "@/components/membership-provider"

const FREE_READ_COUNT = 3
const STORAGE_KEY = "rfyr_visited_notes"

interface ReadingLimitInfo {
  readCount: number
  maxCount: number
  isOverLimit: boolean
  requiresLogin: boolean
  isLoggedIn: boolean
  isYearly: boolean
  remaining: number
  membershipType: "none" | "weekly" | "yearly"
  isLoading: boolean
}

export function useReadingLimit() {
  const { membershipType, isLoading: membershipLoading } = useMembership()

  // readCount：已登录用户由 API 提供，游客由 localStorage 提供
  const [readCount, setReadCount] = React.useState(0)
  // 标记 readCount 来源（true = 已登录，false = 游客）
  const [isLoggedIn, setIsLoggedIn] = React.useState(false)
  // 记录已登录用户的 read_bonus（从 API 单独获取或取默认值）
  const [readBonus, setReadBonus] = React.useState(0)

  // ─── 初始化 ─────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (membershipLoading) return

    const isUserLoggedIn = membershipType !== "none"
    setIsLoggedIn(isUserLoggedIn)

    if (!isUserLoggedIn) {
      // 游客：从 localStorage 恢复
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const visited: string[] = raw ? JSON.parse(raw) : []
        setReadCount(visited.length)
        setReadBonus(0)
      } catch {
        setReadCount(0)
        setReadBonus(0)
      }
      return
    }

    // 已登录：从 API 读取数据库中的已读篇数，同时拉 read_bonus
    void (async () => {
      try {
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

        const [limitRes, bonusRes] = await Promise.all([
          fetch("/api/reading-limit", { headers }),
          fetch("/api/membership/status", { headers }),
        ])

        const limitData = await limitRes.json()
        setReadCount(Number(limitData.readCount ?? 0))

        const bonusData = await bonusRes.json()
        const bonus = Number(bonusData.read_bonus ?? 0)
        setReadBonus(bonus)
      } catch (err) {
        console.error("[ReadingLimit] 初始化失败:", err)
        setReadCount(0)
        setReadBonus(0)
      }
    })()
  }, [membershipLoading, membershipType])

  // ─── 上限计算 ───────────────────────────────────────────────────────────

  const maxCount = React.useMemo(() => {
    if (membershipType === "yearly") return Infinity
    if (membershipType === "weekly") return 10
    return FREE_READ_COUNT + readBonus
  }, [membershipType, readBonus])

  const remaining = maxCount === Infinity ? Infinity : Math.max(0, maxCount - readCount)
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

  // ─── 记录已读 ───────────────────────────────────────────────────────────

  const recordVisit = React.useCallback(async (articleId: string) => {
    if (typeof window === "undefined") return
    if (!isLoggedIn) {
      // 游客：fallback localStorage
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const visited: string[] = raw ? JSON.parse(raw) : []
        const updated = Array.from(new Set([...visited, articleId]))
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        setReadCount(updated.length)
      } catch { /* ignore */ }
      return
    }

    // 已登录：调用 API 写数据库
    try {
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

      const res = await fetch("/api/reading-limit", {
        method: "POST",
        headers,
        body: JSON.stringify({ articleId }),
      })
      const data = await res.json()
      if (data.success) {
        setReadCount(Number(data.readCount ?? 0))
      }
    } catch (err) {
      console.error("[ReadingLimit] 记录已读失败:", err)
    }
  }, [isLoggedIn])

  return { ...info, recordVisit }
}

/** 清除本地已读记录（退出登录时可调用） */
export function clearVisitedNotes() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY)
  }
}
