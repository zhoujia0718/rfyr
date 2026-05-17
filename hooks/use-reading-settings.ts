"use client"

/**
 * 阅读设置客户端 hook
 * 提供客户端组件获取阅读限制配置的方法
 *
 * 缓存策略（已优化）：
 * - 优先从 init-cache 读取（来自 /api/init，零额外请求）
 * - 其次检查 localStorage 缓存（5 分钟）
 * - 最后才请求 /api/reading-settings
 */

import * as React from "react"
import { DEFAULT_READING_SETTINGS, type ReadingSettings } from "@/lib/reading-settings"
import { getSettingsFromCache, clearInitCache } from "@/lib/init-cache"

const SETTINGS_KEY = "rfyr_reading_settings"
const SETTINGS_CACHE_DURATION = 5 * 60 * 1000 // 5 分钟 localStorage 缓存

interface UseReadingSettingsReturn extends ReadingSettings {
  loading: boolean
  updateSettings: (newSettings: Partial<ReadingSettings>) => Promise<void>
}

export function useReadingSettings(): UseReadingSettingsReturn {
  const [settings, setSettings] = React.useState<ReadingSettings>(() => {
    // 初始化时优先从 init-cache 读取（同步，零开销）
    const cached = getSettingsFromCache()
    if (cached) return cached
    // 回退 localStorage
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as ReadingSettings & { _cachedAt?: number }
        if (parsed._cachedAt) return parsed
      }
    } catch { /* ignore */ }
    return DEFAULT_READING_SETTINGS
  })

  const [loading, setLoading] = React.useState(() => {
    // 如果 init-cache 已有数据，标记为不加载
    return !getSettingsFromCache()
  })

  const fetchSettings = React.useCallback(async (forceRefresh = false) => {
    // 优先从 init-cache 读取（同步，零网络请求）
    const fromInitCache = getSettingsFromCache()
    if (fromInitCache && !forceRefresh) {
      setSettings(fromInitCache)
      setLoading(false)
      return
    }

    const now = Date.now()

    // 检查 localStorage 缓存
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(SETTINGS_KEY)
        if (cached) {
          const cachedSettings = JSON.parse(cached) as ReadingSettings & { _cachedAt?: number }
          const cachedTime = Number(cachedSettings._cachedAt ?? 0)
          if (cachedTime > 0 && now - cachedTime < SETTINGS_CACHE_DURATION) {
            setSettings(cachedSettings)
            setLoading(false)
            return
          }
        }
      } catch { /* ignore */ }
    }

    setLoading(true)
    try {
      const res = await fetch("/api/reading-settings")
      const data = await res.json()
      const newSettings: ReadingSettings & { _cachedAt?: number } = {
        guest_read_limit: data.guest_read_limit ?? DEFAULT_READING_SETTINGS.guest_read_limit,
        monthly_daily_limit: data.monthly_daily_limit ?? DEFAULT_READING_SETTINGS.monthly_daily_limit,
        referral_bonus_count: data.referral_bonus_count ?? DEFAULT_READING_SETTINGS.referral_bonus_count,
        show_read_progress: data.show_read_progress ?? DEFAULT_READING_SETTINGS.show_read_progress,
        _cachedAt: now,
      }

      setSettings(newSettings)
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
    } catch (error) {
      console.error("获取阅读设置失败:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始加载（仅当 init-cache 和 localStorage 都没有时触发）
  React.useEffect(() => {
    if (loading) {
      void fetchSettings()
    }
  }, [fetchSettings, loading])

  const updateSettings = React.useCallback(async (newSettings: Partial<ReadingSettings>) => {
    try {
      const res = await fetch("/api/reading-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      })

      if (res.ok) {
        setSettings(prev => ({ ...prev, ...newSettings }))
        const cached = localStorage.getItem(SETTINGS_KEY)
        if (cached) {
          try {
            const current = JSON.parse(cached) as ReadingSettings
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...newSettings }))
          } catch { /* ignore */ }
        }
        try {
          localStorage.setItem("rfyr_settings_updated", Date.now().toString())
          window.dispatchEvent(new Event("rfyr:settings-updated"))
        } catch { /* ignore */ }
      }
    } catch (error) {
      console.error("更新阅读设置失败:", error)
    }
  }, [])

  // 同 Tab + 跨 Tab 同步：其他 Tab 更新设置后，通过 storage 事件强制刷新
  React.useEffect(() => {
    // 跨 Tab：storage 事件
    const storageHandler = (e: StorageEvent) => {
      if (e.key === "rfyr_settings_updated") {
        localStorage.removeItem(SETTINGS_KEY)
        clearInitCache() // 清除 init-cache，确保 fetchSettings(true) 跳过 init-cache 走 API
        void fetchSettings(true)
      }
    }
    // 同 Tab：rfyr:settings-updated 事件（storage 事件不在同 Tab 触发）
    const eventHandler = () => {
      localStorage.removeItem(SETTINGS_KEY)
      clearInitCache()
      void fetchSettings(true)
    }
    window.addEventListener("storage", storageHandler)
    window.addEventListener("rfyr:settings-updated", eventHandler)
    return () => {
      window.removeEventListener("storage", storageHandler)
      window.removeEventListener("rfyr:settings-updated", eventHandler)
    }
  }, [fetchSettings])

  return {
    ...settings,
    loading,
    updateSettings,
  }
}
