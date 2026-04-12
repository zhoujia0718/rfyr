"use client"

import Link from "next/link"
import * as React from "react"
import { BookOpen, Loader2, ArrowRight } from "lucide-react"
import { Paywall } from "@/components/paywall"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getArticlesForNotesSection } from "@/lib/articles"
import { useMembership } from "@/components/membership-provider"

// 短线笔记分类信息
const category = {
  id: "notes",
  name: "短线笔记",
  icon: "📝",
  description: "技术分析与实战复盘",
  href: "/notes"
}

export default function NotesPage() {
  const { membershipType } = useMembership()
  const [articles, setArticles] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    const loadArticles = async () => {
      try {
        const data = await getArticlesForNotesSection()
        if (!cancelled) setArticles(data)
      } catch (error) {
        console.error("Error loading articles:", error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void loadArticles()
    return () => {
      cancelled = true
    }
  }, [])

  const FREE_LIMIT = 3
  const WEEKLY_LIMIT = 10

  // 计算各档可见上限（年卡不限）
  const effectiveLimit =
    membershipType === "yearly"
      ? articles.length
      : membershipType === "weekly"
        ? Math.min(WEEKLY_LIMIT, articles.length)
        : Math.min(FREE_LIMIT, articles.length)

  // visibleArticles: 当前身份能看到的篇目
  const visibleArticles = articles.slice(0, effectiveLimit)

  // lockedArticles: paywall 应遮盖的篇目（仅超出当前身份上限的那些）
  const lockedArticles = articles.slice(effectiveLimit)

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
                              className="flex items-center justify-between hover:text-primary py-2"
                            >
                              <span className="line-clamp-1 text-sm">{article.title}</span>
                              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{article.publishDate}</span>
                            </Link>
                          </li>
                        ))}
                        {lockedArticles.length > 0 && (
                          <Paywall
                            requiredPermission="notes"
                            count={effectiveLimit}
                            freeLimit={FREE_LIMIT}
                            weeklyLimit={WEEKLY_LIMIT}
                          >
                            {lockedArticles.map((article) => (
                              <li key={article.id} style={{ marginLeft: '20px' }}>
                                <span className="flex items-center justify-between py-2 cursor-pointer">
                                  <span className="line-clamp-1 text-sm">{article.title}</span>
                                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{article.publishDate}</span>
                                </span>
                              </li>
                            ))}
                          </Paywall>
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
    </div>
  )
}
