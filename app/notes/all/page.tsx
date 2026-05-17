"use client"

import Link from "next/link"
import * as React from "react"
import { BookOpen, Loader2, Lock, AlertCircle } from "lucide-react"
import { Article } from "@/lib/articles"
import { useMembership } from "@/components/membership-provider"
import { useReadingSettings } from "@/hooks/use-reading-settings"
import { useReadingLimit } from "@/hooks/use-reading-limit"
import { WechatGuideOverlay } from "@/components/wechat-guide-overlay"
import { fetchReferrerCodeByUserId } from "@/lib/referral-client"
import { resolveAuthenticatedUserId } from "@/lib/app-user-id"

function filterArticlesByMembership(
  articles: Article[],
  membershipType: string
): { accessible: Article[]; inaccessible: Article[] } {
  if (membershipType === "yearly") {
    return { accessible: articles, inaccessible: [] }
  }

  const accessible = articles.filter((a) => {
    const level = a.access_level || "monthly"
    if (level === "free") return true
    if (level === "monthly") return membershipType === "monthly"
    return false
  })

  const inaccessible = articles.filter((a) => {
    const level = a.access_level || "monthly"
    return level === "yearly"
  })

  return { accessible, inaccessible }
}

export default function NotesAllPage() {
  const { membershipType } = useMembership()
  const { guest_read_limit, monthly_daily_limit } = useReadingSettings()
  const { bonusCount, dailyBonusCount, dailyReadCount } = useReadingLimit()
  const [articles, setArticles] = React.useState<Article[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [upgradeOpen, setUpgradeOpen] = React.useState(false)
  const [referralCode, setReferralCode] = React.useState<string | null>(null)
  const [referralLoading, setReferralLoading] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    let cancelled = false
    setReferralLoading(true)
    void (async () => {
      const userId = await resolveAuthenticatedUserId()
      if (!userId) {
        if (!cancelled) {
          setReferralCode(null)
          setReferralLoading(false)
        }
        return
      }
      const code = await fetchReferrerCodeByUserId(userId)
      if (!cancelled) {
        setReferralCode(code)
        setReferralLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    const ARTICLES_KEY = "rfyr_notes_all_articles"
    const CACHE_TTL = 5 * 60 * 1000 // 5 分钟缓存

    const cachedRaw = localStorage.getItem(ARTICLES_KEY)
    if (cachedRaw) {
      try {
        const { data, cachedAt } = JSON.parse(cachedRaw)
        if (data && Date.now() - cachedAt < CACHE_TTL) {
          setArticles(data)
          setIsLoading(false)
          return
        }
      } catch { /* ignore */ }
    }

    const loadArticles = async () => {
      try {
        const res = await fetch('/api/articles?section=notes')
        if (!res.ok) throw new Error('fetch failed')
        const data: Article[] = await res.json()
        setArticles(data)
        localStorage.setItem(ARTICLES_KEY, JSON.stringify({ data, cachedAt: Date.now() }))
      } catch (error) {
        console.error('Error loading articles:', error)
      } finally {
        setIsLoading(false)
      }
    }

    void loadArticles()
  }, [])

  // 根据会员类型过滤文章
  const { accessible: accessibleArticles, inaccessible: yearlyOnlyArticles } =
    filterArticlesByMembership(articles, membershipType)

  // 计算各档可见上限（年卡不限，非会员叠加邀请奖励）
  const effectiveLimit =
    membershipType === "yearly"
      ? accessibleArticles.length
      : membershipType === "monthly"
        ? Math.min(monthly_daily_limit, accessibleArticles.length)
        : Math.min(guest_read_limit + bonusCount, accessibleArticles.length)

  const visibleArticles = accessibleArticles.slice(0, effectiveLimit)
  const lockedArticles = accessibleArticles.slice(effectiveLimit)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex-1">
        {/* Header */}
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">
              短线笔记 - 全部文章
            </h1>
            <p className="mt-2 text-muted-foreground">
              技术分析与实战复盘，提升交易能力
            </p>
          </div>
        </section>

        {/* Articles */}
        <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : articles.length > 0 ? (
              <>
                {visibleArticles.map((article) => (
                  <div key={article.id} className="border-b border-border pb-4">
                    <Link
                      href={`/notes/${article.short_id || article.id}`}
                      className="flex flex-col hover:text-primary"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <span>{article.publishDate}</span>
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                          {article.category}
                        </span>
                        {article.tags && article.tags.includes('NEW') && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded">
                            NEW
                          </span>
                        )}
                        {article.tags && article.tags.includes('优质') && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded">
                            优质
                          </span>
                        )}
                        {article.access_level === 'yearly' && (
                          <span style={{ color: '#D97706', fontWeight: 500, opacity: 0.6 }}>年卡</span>
                        )}
                        {article.access_level === 'monthly' && (
                          <span style={{ color: '#F87171', fontWeight: 500, opacity: 0.6 }}>月卡</span>
                        )}
                      </div>
                      <h3 className="text-base font-medium relative">{article.title}
                        {article.access_level === 'yearly' && (
                          <span className="absolute -top-4 right-0 text-[10px]" style={{ color: '#D97706', opacity: 0.6 }}>年卡</span>
                        )}
                        {article.access_level === 'monthly' && (
                          <span className="absolute -top-4 right-0 text-[10px]" style={{ color: '#F87171', opacity: 0.6 }}>月卡</span>
                        )}
                      </h3>
                    </Link>
                  </div>
                ))}
                {lockedArticles.length > 0 && (
                  <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                    <button
                      onClick={() => setUpgradeOpen(true)}
                      className="w-full flex items-center gap-2 text-amber-800 hover:text-amber-900 transition-colors text-left mb-3"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">
                        {membershipType === "none"
                          ? `免费阅读已达上限（${guest_read_limit + bonusCount}篇），开通月卡解锁更多`
                          : `月卡今日阅读已满（${monthly_daily_limit}篇），升级年卡不受限制`}
                      </span>
                    </button>
                    <div className="space-y-4 opacity-70">
                      {lockedArticles.map((article) => (
                        <div key={article.id} className="border-b border-amber-200/50 pb-3 last:border-0 last:pb-0">
                          <button
                            onClick={() => setUpgradeOpen(true)}
                            className="w-full flex flex-col text-left cursor-pointer opacity-70 hover:opacity-90 transition-opacity"
                          >
                            <div className="flex items-center gap-2 text-xs text-amber-700 mb-1">
                              <span>{article.publishDate}</span>
                              <span className="px-2 py-0.5 bg-amber-100 rounded text-amber-700">
                                {article.category}
                              </span>
                            </div>
                            <h3 className="text-base font-medium text-amber-900">{article.title}</h3>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {yearlyOnlyArticles.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-600 mb-3">
                      <Lock className="h-4 w-4" />
                      <span>年卡专属内容</span>
                    </div>
                    {yearlyOnlyArticles.map((article) => (
                      <div key={article.id} className="border-b border-border pb-4 mb-4 opacity-70">
                        <div className="flex flex-col cursor-not-allowed">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <span>{article.publishDate}</span>
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                              年卡专属
                            </span>
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                              {article.category}
                            </span>
                          </div>
                          <h3 className="text-base font-medium">{article.title}</h3>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                暂无文章
              </div>
            )}
          </div>
        </section>
      </main>

      <WechatGuideOverlay
        open={upgradeOpen}
        mode={membershipType !== "none" ? (membershipType === "monthly" ? "daily_limit_exceeded" : "quota_exhausted") : "require_login"}
        readCount={membershipType === "monthly" ? dailyReadCount : guest_read_limit + bonusCount}
        maxCount={membershipType === "monthly" ? monthly_daily_limit + dailyBonusCount : guest_read_limit + bonusCount}
        baseDailyLimit={membershipType === "monthly" ? monthly_daily_limit : undefined}
        bonusCount={bonusCount}
        dailyBonusCount={dailyBonusCount}
        referralCode={referralCode}
        referralShareLoading={referralLoading}
        forceLogin={false}
        onOpenLogin={() => window.dispatchEvent(new Event("rfyr:show-login"))}
        onClose={() => setUpgradeOpen(false)}
      />
    </div>
  )
}
