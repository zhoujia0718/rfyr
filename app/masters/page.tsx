"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, ArrowDown, Users, Loader2 } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getArticlesByCategory, initArticlesTable } from "@/lib/articles"

// 大佬合集分类信息
const category = {
  id: "masters",
  name: "大佬合集",
  icon: "👤",
  description: "汇聚投资大师智慧，学习经典投资哲学",
  href: "/masters"
}

export default function MastersPage() {
  const [articles, setArticles] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const loadArticles = async () => {
      try {
        // 直接获取文章数据，不需要每次都初始化表
        const data = await getArticlesByCategory("大佬合集")
        setArticles(data)
        // 缓存数据到localStorage，减少重复请求
        localStorage.setItem('mastersArticles', JSON.stringify(data))
      } catch (error) {
        console.error('Error loading articles:', error)
        // 加载失败时尝试从缓存获取
        const cachedData = localStorage.getItem('mastersArticles')
        if (cachedData) {
          setArticles(JSON.parse(cachedData))
        }
      } finally {
        setIsLoading(false)
      }
    }
    
    // 先尝试从缓存获取数据
    const cachedData = localStorage.getItem('mastersArticles')
    if (cachedData) {
      setArticles(JSON.parse(cachedData))
      setIsLoading(false)
    } else {
      // 缓存不存在时从API获取
      loadArticles()
    }
  }, [])



  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      
      <main className="flex-1">
        {/* Header */}
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">
              大佬合集
            </h1>
            <p className="mt-2 text-muted-foreground">
              汇聚投资大师智慧，学习经典投资哲学
            </p>
          </div>
        </section>

        {/* Articles Grid */}
        <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
          <div className="grid gap-6 md:grid-cols-1">
            {category && (
              <Card key={category.id} className="group overflow-hidden transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{category.description}</p>
                    </div>
                  </div>
                  <Link
                      href="/masters/all"
                      className="flex items-center gap-1 text-sm text-primary transition-opacity hover:opacity-100 cursor-pointer hover:underline z-10 relative"
                      style={{ position: 'relative', zIndex: 10 }}
                    >
                      更多
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {isLoading ? (
                      <li className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </li>
                    ) : articles.length > 0 ? (
                      articles.map((article, index) => (
                        <li key={article.id}>
                          <Link
                            href={`${category.href}/${article.short_id || article.id}`}
                            className="flex items-center justify-between hover:text-primary py-2"
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
      </main>

      <SiteFooter />
    </div>
  )
}
