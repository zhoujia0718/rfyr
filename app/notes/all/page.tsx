"use client"

import Link from "next/link"
import * as React from "react"
import { BookOpen, Loader2 } from "lucide-react"
import { Paywall } from "@/components/paywall"
import { getArticlesForNotesSection } from "@/lib/articles"
import { useMembership } from "@/components/membership-provider"

export default function NotesAllPage() {
  const { membershipType } = useMembership()
  const [articles, setArticles] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const loadArticles = async () => {
      try {
        const data = await getArticlesForNotesSection()
        setArticles(data)
      } catch (error) {
        console.error('Error loading articles:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadArticles()
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

  const visibleArticles = articles.slice(0, effectiveLimit)
  const lockedArticles = articles.slice(effectiveLimit)

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
                      </div>
                      <h3 className="text-base font-medium">{article.title}</h3>
                    </Link>
                  </div>
                ))}
                {lockedArticles.length > 0 && (
                  <Paywall
                    requiredPermission="notes"
                    count={effectiveLimit}
                    freeLimit={FREE_LIMIT}
                    weeklyLimit={WEEKLY_LIMIT}
                  >
                    {lockedArticles.map((article) => (
                      <div key={article.id} className="border-b border-border pb-4">
                        <div className="flex flex-col cursor-pointer">
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
                          </div>
                          <h3 className="text-base font-medium">{article.title}</h3>
                        </div>
                      </div>
                    ))}
                  </Paywall>
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
    </div>
  )
}