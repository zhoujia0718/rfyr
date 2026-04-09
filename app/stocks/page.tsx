"use client"

import Link from "next/link"
import * as React from "react"
import { TrendingUp, Crown, Loader2, ArrowRight, ArrowDown } from "lucide-react"
import { Paywall } from "@/components/paywall"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getArticlesByCategory, initArticlesTable } from "@/lib/articles"

// 个股挖掘分类信息
const category = {
  id: "stocks",
  name: "个股挖掘",
  icon: "📈",
  description: "深度研究与投资逻辑",
  href: "/stocks"
}

export default function StocksPage() {
  const [articles, setArticles] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const loadArticles = async () => {
      try {
        // 直接获取文章数据，不需要每次都初始化表
        const data = await getArticlesByCategory("个股挖掘")
        setArticles(data)
        // 缓存数据到localStorage，减少重复请求
        localStorage.setItem('stocksArticles', JSON.stringify(data))
      } catch (error) {
        console.error('Error loading articles:', error)
        // 加载失败时尝试从缓存获取
        const cachedData = localStorage.getItem('stocksArticles')
        if (cachedData) {
          setArticles(JSON.parse(cachedData))
        }
      } finally {
        setIsLoading(false)
      }
    }
    
    // 先尝试从缓存获取数据
    const cachedData = localStorage.getItem('stocksArticles')
    if (cachedData) {
      setArticles(JSON.parse(cachedData))
      setIsLoading(false)
    } else {
      // 缓存不存在时从API获取
      loadArticles()
    }
  }, [])



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

        {/* Stock Categories with Paywall */}
        <Paywall 
          requiredPermission="stocks"
          title="个股挖掘年度VIP专享"
          description="升级年度VIP会员，解锁深度个股研究报告和投资机会挖掘"
        >
          <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <div className="grid gap-6 md:grid-cols-1">
              {category && (
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
                        articles.map((article, index) => (
                          <li key={article.id} style={{ marginLeft: '20px' }}>
                            <Link
                              href={`${category.href}/${article.short_id || article.id}`}
                              className="flex w-full items-center justify-between text-left hover:text-primary py-2"
                            >
                              <span className="line-clamp-1 text-sm">{article.title}</span>
                              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{article.publishDate}</span>
                            </Link>
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-muted-foreground">暂无文章</li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
        </Paywall>
      </main>
    </div>
  )
}
