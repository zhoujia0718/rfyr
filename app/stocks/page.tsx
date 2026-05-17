"use client"

import Link from "next/link"
import * as React from "react"
import { TrendingUp, Crown, Loader2, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UpgradeDialog } from "@/components/dialogs"

interface StockArticle {
  id: string
  short_id?: string
  title: string
  category?: string
  publishdate?: string
  tags?: string[]
  access_level?: string
  created_at?: string
}

interface ApiResponse {
  articles: StockArticle[]
  meta: {
    total: number
    accessible: number
    userLevel: number
    hasLockedContent: boolean
  }
}

const category = {
  id: "stocks",
  name: "个股挖掘",
  icon: "📈",
  description: "深度研究与投资逻辑",
  href: "/stocks"
}

export default function StocksPage() {
  const [data, setData] = React.useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [upgradeOpen, setUpgradeOpen] = React.useState(false)

  React.useEffect(() => {
    const CACHE_KEY = "rfyr_stocks_articles"
    const CACHE_TTL = 5 * 60 * 1000

    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const { data: cached, cachedAt } = JSON.parse(raw)
        if (cached && Date.now() - cachedAt < CACHE_TTL) {
          setData(cached)
          setIsLoading(false)
          return
        }
      }
    } catch { /* ignore */ }

    const loadArticles = async () => {
      try {
        const res = await fetch("/api/stocks?category=个股挖掘")
        if (!res.ok) throw new Error(`请求失败: ${res.status}`)
        const json: ApiResponse = await res.json()
        setData(json)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json, cachedAt: Date.now() }))
        } catch { /* ignore */ }
      } catch (e) {
        console.error("Error loading stocks:", e)
        setError("加载失败，请稍后重试")
      } finally {
        setIsLoading(false)
      }
    }

    void loadArticles()
  }, [])

  const articles = data?.articles ?? []
  const meta = data?.meta
  const hasLockedContent = meta?.hasLockedContent ?? false

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex-1">
        {/* Header */}
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground md:text-3xl">
                个股挖掘
              </h1>
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-600">
                <Crown className="mr-1 inline h-3 w-3" />
                会员专享
              </span>
            </div>
            <p className="mt-2 text-muted-foreground">
              深度研究与投资逻辑，解锁专业投资视角
            </p>
          </div>
        </section>

        {/* Stock Categories */}
        <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
          {/* 升级提示（有未解锁内容时显示） */}
          {hasLockedContent && !isLoading && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-sm font-medium text-amber-800">
                还有 {meta!.total - meta!.accessible} 篇深度内容待解锁，升级会员后可见
              </p>
              <button
                onClick={() => setUpgradeOpen(true)}
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                升级解锁全部内容
              </button>
            </div>
          )}

          {/* M15-01/M15-04 修复：移除 CSS blur，使用服务端过滤 */}
          <div className="grid gap-6 md:grid-cols-1">
            <Card key={category.id} className="group overflow-hidden transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{category.name}</CardTitle>
                </div>
                <Link
                  href="/stocks/all"
                  className="flex items-center gap-1 text-sm text-primary transition-opacity hover:opacity-100 cursor-pointer hover:underline z-10 relative"
                  style={{ position: "relative", zIndex: 10 }}
                  onClick={(e) => {
                    if (hasLockedContent) {
                      e.preventDefault()
                      setUpgradeOpen(true)
                    }
                  }}
                >
                  更多
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2" style={{ paddingLeft: "20px" }}>
                  {isLoading ? (
                    <li className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </li>
                  ) : error ? (
                    <li className="text-sm text-red-500">{error}</li>
                  ) : articles.length > 0 ? (
                    articles.slice(0, 5).map((article) => {
                      const href = article.short_id
                        ? `/stocks/${article.short_id}`
                        : `/stocks/${article.id}`
                      return (
                        <li key={article.id} style={{ marginLeft: "20px" }}>
                          <Link
                            href={hasLockedContent ? "#" : href}
                            onClick={(e) => {
                              if (hasLockedContent) {
                                e.preventDefault()
                                setUpgradeOpen(true)
                              }
                            }}
                            className={`flex w-full items-center justify-between text-left py-2 ${
                              hasLockedContent
                                ? "opacity-50 cursor-not-allowed"
                                : "hover:text-primary"
                            }`}
                          >
                            <span className="line-clamp-1 text-sm relative">{article.title}</span>
                            {article.access_level && article.access_level !== 'free' && (
                              <span
                                className="absolute -top-3 right-0 text-[10px] font-medium leading-none"
                                style={article.access_level === 'yearly'
                                  ? { color: '#D97706', opacity: 0.6 }
                                  : { color: '#F87171', opacity: 0.6 }}
                              >
                                {article.access_level === 'yearly' ? '年卡' : '月卡'}
                              </span>
                            )}
                            <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                              {article.publishdate || article.created_at}
                            </span>
                          </Link>
                        </li>
                      )
                    })
                  ) : (
                    <li className="text-sm text-muted-foreground">暂无文章</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  )
}
