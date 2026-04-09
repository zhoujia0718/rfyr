"use client"

import Link from "next/link"
import * as React from "react"
import { TrendingUp, Crown, Loader2 } from "lucide-react"
import { Paywall } from "@/components/paywall"
import { getArticlesByCategory } from "@/lib/articles"

export default function StocksAllPage() {
  const [articles, setArticles] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const loadArticles = async () => {
      try {
        const data = await getArticlesByCategory("个股挖掘")
        setArticles(data)
      } catch (error) {
        console.error('Error loading articles:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadArticles()
  }, [])

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
        <Paywall 
          requiredPermission="stocks"
          title="个股挖掘年度VIP专享"
          description="升级年度VIP会员，解锁深度个股研究报告和投资机会挖掘"
        >
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
                      href={`/stocks/${article.short_id || article.id}`}
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
                ))
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  暂无文章
                </div>
              )}
            </div>
          </section>
        </Paywall>
      </main>
    </div>
  )
}