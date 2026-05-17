"use client"

import Link from "next/link"
import * as React from "react"
import { BookOpen, Loader2 } from "lucide-react"

export default function MastersAllPage() {
  const [articles, setArticles] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const ARTICLES_KEY = "rfyr_masters_all_articles"
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
        const res = await fetch('/api/articles?category=' + encodeURIComponent('大佬合集'))
        if (!res.ok) throw new Error('fetch failed')
        const data = await res.json()
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex-1">
        {/* Header */}
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">
              大佬合集 - 全部文章
            </h1>
            <p className="mt-2 text-muted-foreground">
              学习投资大师的智慧和策略
            </p>
          </div>
        </section>

        {/* All Articles */}
        <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : articles.length > 0 ? (
              articles.map((article, index) => (
                <div key={article.id} className="border-b border-border pb-4">
                  <Link
                    href={`/masters/${article.short_id || article.id}`}
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
              ))
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