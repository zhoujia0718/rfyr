"use client"

import Link from "next/link"
import * as React from "react"
import { BookOpen, Loader2, ArrowRight, Lock, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WechatGuideOverlay } from "@/components/wechat-guide-overlay"
import { useMembership } from "@/components/membership-provider"
import { useReadingSettings } from "@/hooks/use-reading-settings"
import { useReadingLimit } from "@/hooks/use-reading-limit"
import { fetchReferrerCodeByUserId } from "@/lib/referral-client"
import { resolveAuthenticatedUserId } from "@/lib/app-user-id"
import { Article } from "@/lib/articles"

// 短线笔记分类信息
const category = {
  id: "notes",
  name: "短线笔记",
  icon: "📝",
  description: "技术分析与实战复盘",
  href: "/notes"
}

/** 根据用户会员类型过滤可访问的文章 */
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
    // yearly 文章
    return false
  })

  const inaccessible = articles.filter((a) => {
    const level = a.access_level || "monthly"
    return level === "yearly"
  })

  return { accessible, inaccessible }
}

export default function NotesPage() {
  const { membershipType } = useMembership()
  const isLoggedIn = membershipType !== "none"
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
    if (typeof window === "undefined") return
    let cancelled = false

    const ARTICLES_KEY = "rfyr_notes_articles"
    const CACHE_TTL = 5 * 60 * 1000 // 5 分钟缓存

    const cachedRaw = localStorage.getItem(ARTICLES_KEY)
    if (cachedRaw) {
      try {
        const { data, cachedAt } = JSON.parse(cachedRaw)
        if (data && Date.now() - cachedAt < CACHE_TTL) {
          if (!cancelled) {
            setArticles(data)
            setIsLoading(false)
          }
          return
        }
      } catch { /* ignore */ }
    }

    const loadArticles = async () => {
      try {
        const res = await fetch('/api/articles?section=notes')
        if (!res.ok) throw new Error('fetch failed')
        const data: Article[] = await res.json()
        if (!cancelled) {
          setArticles(data)
          localStorage.setItem(ARTICLES_KEY, JSON.stringify({ data, cachedAt: Date.now() }))
        }
      } catch (error) {
        console.error("Error loading articles:", error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadArticles()
    return () => { cancelled = true }
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

  // visibleArticles: 当前身份能看到的篇目
  const visibleArticles = accessibleArticles.slice(0, effectiveLimit)

  // lockedArticles: paywall 应遮盖的篇目（仅超出当前身份上限的那些）
  const lockedArticles = accessibleArticles.slice(effectiveLimit)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex-1">
        {/* Header */}
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <div>
              <h1 className="text-2xl font-bold text-foreground md:text-3xl">
                短线学习笔记
              </h1>
              <p className="mt-2 text-muted-foreground">
                技术分析与实战复盘，提升交易能力
              </p>
            </div>
          </div>
        </section>

        {/* Notes Categories */}
        <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
          <div className="grid gap-6 md:grid-cols-1">
            {category && (
              <Card key={category.id} className="group overflow-hidden transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{category.name}</CardTitle>
                  </div>
                  <Link
                    href="/notes/all"
                    className="flex items-center gap-1 text-sm text-primary transition-opacity hover:opacity-100 cursor-pointer hover:underline z-10 relative"
                    style={{ position: 'relative', zIndex: 10 }}
                  >
                    更多
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2" style={{ paddingLeft: '20px' }}>
                    {isLoading ? (
                      <li className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </li>
                    ) : articles.length > 0 ? (
                      <>
                        {visibleArticles.map((article) => (
                          <li key={article.id} style={{ marginLeft: '20px' }}>
                            <Link
                              href={`${category.href}/${article.short_id || article.id}`}
                              className="flex items-center justify-between hover:text-primary py-2 relative"
                            >
                              <span className="line-clamp-1 text-sm">{article.title}</span>
                              {article.access_level === 'yearly' && (
                                <span
                                  className="absolute -top-3 right-0 text-[10px] font-medium leading-none"
                                  style={{ color: '#D97706', opacity: 0.6 }}
                                >
                                  年卡
                                </span>
                              )}
                              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{article.publishDate}</span>
                            </Link>
                          </li>
                        ))}
                        {lockedArticles.length > 0 && (
                          <li>
                            <button
                              onClick={() => setUpgradeOpen(true)}
                              className="w-full flex items-center gap-2 px-3 py-2 mt-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors text-left"
                            >
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              <span className="text-xs font-medium line-clamp-1">
                                {membershipType === "none"
                                  ? `免费阅读已达上限（${guest_read_limit + bonusCount}篇），开通月卡解锁更多`
                                  : `月卡今日阅读已满（${monthly_daily_limit}篇），升级年卡不受限制`}
                              </span>
                            </button>
                            <ul className="space-y-1 mt-1">
                              {lockedArticles.map((article) => (
                                <li key={article.id} style={{ marginLeft: '20px' }}>
                                  <button
                                    onClick={() => setUpgradeOpen(true)}
                                    className="w-full flex items-center justify-between py-2 cursor-pointer opacity-50 hover:opacity-70 transition-opacity text-left"
                                  >
                                    <span className="line-clamp-1 text-sm">{article.title}</span>
                                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{article.publishDate}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </li>
                        )}
                        {yearlyOnlyArticles.length > 0 && (
                          <div className="mt-2">
                            <div className="flex items-center gap-1 text-xs text-amber-600 mb-1" style={{ marginLeft: '20px' }}>
                              <Lock className="h-3 w-3" />
                              <span>年卡专属内容</span>
                            </div>
                            {yearlyOnlyArticles.map((article) => (
                              <li key={article.id} style={{ marginLeft: '20px' }}>
                                <span className="flex items-center justify-between py-2 cursor-not-allowed opacity-60">
                                  <span className="line-clamp-1 text-sm">{article.title}</span>
                                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{article.publishDate}</span>
                                </span>
                              </li>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <li className="text-sm text-muted-foreground">暂无文章</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </main>

      <WechatGuideOverlay
        open={upgradeOpen}
        mode={isLoggedIn ? (membershipType === "monthly" ? "daily_limit_exceeded" : "quota_exhausted") : "require_login"}
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
