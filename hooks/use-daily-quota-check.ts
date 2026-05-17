"use client"

/**
 * 每日阅读配额检查（侧边栏导航守卫）
 *
 * P11 修复：复用 ReadingContext 已有数据，避免重复调用 /api/reading-limit，
 * 游客场景仍独立拉取 /api/guest-reading（ReadingContext 不处理游客）
 */

import * as React from "react"
import { useReadingContext } from "@/contexts/reading-context"
import { useReadingSettings } from "@/hooks/use-reading-settings"

export function useDailyQuotaCheck() {
  const ctx = useReadingContext()
  const { guest_read_limit } = useReadingSettings()

  // 游客状态（仅在未登录时拉取一次）
  const [guestData, setGuestData] = React.useState<{
    count: number
    readIds: string[]
  } | null>(null)
  const guestFetchedRef = React.useRef(false)

  React.useEffect(() => {
    if (!ctx.isLoggedIn && !ctx.isLoading && !guestFetchedRef.current) {
      guestFetchedRef.current = true
      fetch("/api/guest-reading")
        .then(r => r.json())
        .then(data => {
          setGuestData({
            count: Number(data.notesReadCount ?? 0),
            readIds: (data.readByCategory?.notes as string[]) ?? [],
          })
        })
        .catch(() => setGuestData({ count: 0, readIds: [] }))
    }
  }, [ctx.isLoggedIn, ctx.isLoading])

  // 已登录：直接使用 ReadingContext 数据
  if (ctx.isLoggedIn) {
    return {
      dailyReadCount: ctx.dailyReadCount,
      effectiveDailyLimit: ctx.effectiveDailyLimit,
      dailyBonusCount: ctx.dailyBonusCount,
      readIds: ctx.readIds,
      quotaLoaded: !ctx.isLoading,
      canRead: ctx.dailyReadCount < ctx.effectiveDailyLimit,
      refreshQuota: ctx.refresh,
      loading: ctx.isLoading,
    }
  }

  // 游客：使用独立拉取的数据
  const limit = guest_read_limit ?? 3
  const count = guestData?.count ?? 0
  return {
    dailyReadCount: count,
    effectiveDailyLimit: limit,
    dailyBonusCount: 0,
    readIds: guestData?.readIds ?? [],
    quotaLoaded: guestData !== null,
    canRead: count < limit,
    refreshQuota: ctx.refresh,
    loading: guestData === null && !ctx.isLoading,
  }
}
