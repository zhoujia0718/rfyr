"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Users, Calendar, BookOpen, TrendingUp, Loader2 } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { PaymentDialog } from "@/components/payment-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAllArticles, getAllCategories } from "@/lib/articles"

interface Category {
  id: string
  title: string
  description: string
  icon: React.ElementType
  href: string
  locked?: boolean
  articles: Array<{ title: string; date: string; id: string; short_id?: string; subcategory?: string }>
}

const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

const initialCategories: Category[] = [
  {
    id: "masters",
    title: "大佬合集",
    description: "汇聚投资大师智慧",
    icon: Users,
    href: "/masters",
    articles: []
  },
  {
    id: "notes",
    title: "短线学习笔记",
    description: "技术分析与实战复盘",
    icon: BookOpen,
    href: "/notes",
    articles: []
  },
  {
    id: "stocks",
    title: "个股挖掘",
    description: "深度研究与投资逻辑",
    icon: TrendingUp,
    href: "/stocks",
    locked: true,
    articles: []
  }
]

export default function HomePage() {
  const [paymentOpen, setPaymentOpen] = React.useState(false)
  const [categories, setCategories] = React.useState<Category[]>(initialCategories)
  const [isLoading, setIsLoading] = React.useState(true)
  const [lastLoadTime, setLastLoadTime] = React.useState<number>(0)

  // 从数据库获取文章数据
  React.useEffect(() => {
    const loadArticles = async (forceRefresh = false) => {
      const now = Date.now()
      const shouldLoad = forceRefresh || !lastLoadTime || (now - lastLoadTime > CACHE_DURATION)

      if (!shouldLoad) return

      try {
        // 并行获取分类和文章数据
        const [categoriesData, articles] = await Promise.all([
          getAllCategories(),
          getAllArticles()
        ])
        
        // 构建分类名称映射，包括子分类
        const categoryNameMap: Record<string, string> = {
          "masters": "大佬合集",
          "notes": "短线笔记",
          "stocks": "个股挖掘"
        }
        
        // 构建分类映射，用于查找分类信息
        const categoryMap: Record<string, { name: string; parentId?: string }> = {}
        const nameToIdMap: Record<string, string> = {}
        
        // 递归构建分类映射
        const buildCategoryMap = (categories: any[]) => {
          for (const category of categories) {
            categoryMap[category.id] = { name: category.name, parentId: category.parentId }
            nameToIdMap[category.name] = category.id
            if (category.children && category.children.length > 0) {
              buildCategoryMap(category.children)
            }
          }
        }
        
        buildCategoryMap(categoriesData)
        
        // 检查文章是否属于某个分类或其子分类
        const isArticleInCategory = (article: any, targetCategoryName: string): boolean => {
          // 检查文章的分类是否与目标分类匹配
          if (article.category === targetCategoryName) {
            return true
          }
          
          // 检查文章的分类是否是目标分类的子分类
          let currentCategoryName = article.category
          while (currentCategoryName) {
            const categoryId = nameToIdMap[currentCategoryName]
            if (!categoryId) break
            
            const categoryInfo = categoryMap[categoryId]
            if (!categoryInfo) break
            
            // 检查当前分类的父分类是否是目标分类
            let parentId = categoryInfo.parentId
            while (parentId) {
              const parentInfo = categoryMap[parentId]
              if (!parentInfo) break
              
              if (parentInfo.name === targetCategoryName) {
                return true
              }
              
              parentId = parentInfo.parentId
            }
            
            break
          }
          
          return false
        }
        
        // 根据分类组织文章
        const updatedCategories = initialCategories.map(category => {
          const categoryName = categoryNameMap[category.id] || category.title
          
          const categoryArticles = articles
            .filter(article => isArticleInCategory(article, categoryName))
            .map(article => ({
              title: article.title,
              date: article.publishDate,
              id: article.id,
              subcategory: article.category !== categoryName ? article.category : article.subcategory
            }))
            .sort((a, b) => {
              // 没有子类的放在最前列
              if (!a.subcategory && b.subcategory) return -1
              if (a.subcategory && !b.subcategory) return 1
              // 同一子类的放在一起
              if (a.subcategory && b.subcategory) {
                // 先按子类名称排序
                if (a.subcategory !== b.subcategory) {
                  return a.subcategory.localeCompare(b.subcategory)
                }
              }
              // 按日期排序，最新的在前面
              return new Date(b.date).getTime() - new Date(a.date).getTime()
            })
            .slice(0, 6) // 只显示前6篇
          
          return {
            ...category,
            articles: categoryArticles
          }
        })
        
        setCategories(updatedCategories)
        setLastLoadTime(now)
      } catch (error) {
        console.error('Error loading articles:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadArticles()
    
    // 暴露刷新函数到全局
    ;(window as any).refreshHomePageData = () => loadArticles(true)
  }, [lastLoadTime, CACHE_DURATION])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-12 text-center lg:px-8 lg:py-16">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl lg:text-4xl">
              <span className="text-primary">价值投机</span>，看长做短
            </h1>
          </div>
        </section>

        {/* Categories Grid */}
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-20">
          <div className="space-y-8">
            {categories.map((category, index) => {
              const Icon = category.icon
              return (
                <div key={category.id} className="border border-gray-200 rounded-xl p-6 hover:border-primary hover:shadow-lg transition-all duration-300 bg-white">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-foreground mb-1">{category.title}</h2>
                      <p className="text-sm text-muted-foreground">{category.description}</p>
                    </div>
                    <Link
                      href={category.articles.length > 0 ? `${category.href}/${category.articles[0].short_id || category.articles[0].id}` : category.href}
                      className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      查看更多
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isLoading ? (
                      <div className="col-span-2 flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : category.articles.length > 0 ? (
                      category.articles.map((article, articleIndex) => (
                        <div key={article.id} className="py-2">
                          {category.locked ? (
                            <button
                              onClick={() => setPaymentOpen(true)}
                              className="flex w-full items-center text-left hover:text-primary transition-colors"
                            >
                              <span className="line-clamp-1 text-sm font-medium">{article.title}</span>
                            </button>
                          ) : (
                            <Link
                              href={`${category.href}/${article.short_id || article.id}`}
                              className="flex w-full items-center hover:text-primary transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="line-clamp-1 text-sm font-medium">{article.title}</span>
                                {article.subcategory && (
                                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                                    {article.subcategory}
                                  </span>
                                )}
                              </div>
                            </Link>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="col-span-2 text-sm text-muted-foreground py-4">暂无文章</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>

      <SiteFooter />

      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} />
    </div>
  )
}
