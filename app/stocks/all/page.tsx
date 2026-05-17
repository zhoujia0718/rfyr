"use client"

import Link from "next/link"
import * as React from "react"
import { Crown, Loader2 } from "lucide-react"
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

export default function StocksAllPage() {
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
                个股挖掘 - 全部文章
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

        {/* All Articles */}
        <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
          {/* 会员升级提示（有未解锁内容时显示） */}
          {hasLockedContent && !isLoading && (
            <div className="mb-6 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-amber-800">
                <span className="text-sm font-medium">
                  还有 {meta!.total - meta!.accessible} 篇深度内容待解锁
                </span>
              </div>
              <button
                onClick={() => setUpgradeOpen(true)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                升级解锁全部内容
              </button>
            </div>
          )}

          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="text-center py-16 text-red-500">
                {error}
              </div>
            ) : articles.length > 0 ? (
              articles.map((article) => {
                const href = article.short_id
                  ? `/stocks/${article.short_id}`
                  : `/stocks/${article.id}`
                return (
                  <Link
                    key={article.id}
                    href={href}
                    className="block border-b border-border pb-4 transition-opacity hover:opacity-70"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <span>{article.publishdate}</span>
                        {article.tags?.includes("NEW") && (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-red-600">
                            NEW
                          </span>
                        )}
                        {article.tags?.includes("优质") && (
                          <span className="rounded bg-green-100 px-2 py-0.5 text-green-600">
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
                    </div>
                  </Link>
                )
              })
            ) : (
              <div className="py-16 text-center text-muted-foreground">
                暂无文章
              </div>
            )}
          </div>
        </section>
      </main>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  )
}
