"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Users, BookOpen, TrendingUp, Loader2 } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { getAllArticles, getAllCategories } from "@/lib/articles"

function CategorySkeleton() {
  return (
    <div className="border border-gray-200 rounded-xl p-6 bg-white animate-pulse">
      <div className="flex items-center gap-4 mb-6">
        <div className="h-12 w-12 rounded-lg bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-48 bg-gray-100 rounded" />
        </div>
        <div className="h-5 w-16 bg-gray-200 rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-4 bg-gray-100 rounded w-3/4" />
        ))}
      </div>
    </div>
  )
}

interface ArticleItem {
  id: string
  short_id?: string
  title: string
  subcategory?: string
}

interface CatItem {
  id: string; title: string; icon: React.ElementType
  href: string; locked: boolean; articles: ArticleItem[]
}

function CategorySection({ categoriesData, articles }: {
  categoriesData: any; articles: any[]
}) {
  const [categories, setCategories] = React.useState<CatItem[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const categoryNameMap: Record<string, string> = {
      "masters": "大佬合集",
      "notes": "短线笔记",
      "stocks": "个股挖掘",
    }
    const categoryMap: Record<string, { name: string; parentId?: string }> = {}
    const nameToIdMap: Record<string, string> = {}
    const buildMap = (cats: any[]) => {
      for (const c of cats) {
        categoryMap[c.id] = { name: c.name, parentId: c.parentId }
        nameToIdMap[c.name] = c.id
        if (c.children?.length) buildMap(c.children)
      }
    }
    buildMap(categoriesData)

    const isInCategory = (article: any, target: string): boolean => {
      if (article.category === target) return true
      let cur = article.category
      while (cur) {
        const id = nameToIdMap[cur]
        if (!id) break
        let pid = categoryMap[id]?.parentId
        while (pid) {
          if (categoryMap[pid]?.name === target) return true
          pid = categoryMap[pid]?.parentId
        }
        break
      }
      return false
    }

    const initials = [
      { id: "masters", title: "大佬合集", icon: Users, href: "/masters", locked: false, articles: [] as ArticleItem[] },
      { id: "notes",    title: "短线学习笔记", icon: BookOpen, href: "/notes", locked: false, articles: [] as ArticleItem[] },
      { id: "stocks",  title: "个股挖掘",     icon: TrendingUp, href: "/stocks", locked: true, articles: [] as ArticleItem[] },
    ]
    const updated = initials.map(cat => {
      const arts: ArticleItem[] = articles
        .filter((a: any) => isInCategory(a, categoryNameMap[cat.id] || cat.title))
        .slice(0, 6)
        .map((a: any) => ({ id: a.id, short_id: a.short_id, title: a.title, subcategory: a.category }))
      return { ...cat, articles: arts }
    })
    setCategories(updated)
    setIsLoading(false)
  }, [categoriesData, articles])

  return (
    <>
      {categories.map(cat => {
        const Icon = cat.icon
        return (
          <div key={cat.id} className="border border-gray-200 rounded-xl p-6 hover:border-primary hover:shadow-lg transition-all duration-300 bg-white">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground mb-1">{cat.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {cat.id === "masters" ? "汇聚投资大师智慧" : cat.id === "notes" ? "技术分析与实战复盘" : "深度研究与投资逻辑"}
                </p>
              </div>
              <Link
                href={cat.articles[0] ? `${cat.href}/${cat.articles[0].short_id || cat.articles[0].id}` : cat.href}
                className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                查看更多 <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isLoading ? (
                <div className="col-span-2 flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : cat.articles.length > 0 ? cat.articles.map(article => (
                <div key={article.id} className="py-2">
                  <Link
                    href={`${cat.href}/${article.short_id || article.id}`}
                    className="flex w-full items-center hover:text-primary transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 text-sm font-medium">{article.title}</span>
                      {article.subcategory && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">{article.subcategory}</span>
                      )}
                    </div>
                  </Link>
                </div>
              )) : (
                <div className="col-span-2 text-sm text-muted-foreground py-4">暂无文章</div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

export default function HomePage() {
  const [categoriesData, setCategoriesData] = React.useState<any>(null)
  const [articles, setArticles] = React.useState<any[]>([])

  React.useEffect(() => {
    Promise.all([getAllCategories(), getAllArticles()]).then(([cats, arts]) => {
      setCategoriesData(cats)
      setArticles(arts)
    })
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 py-12 text-center lg:px-8 lg:py-16">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl lg:text-4xl">
              <span className="text-primary">价值投机</span>，看长做短
            </h1>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-20">
          <div className="space-y-8">
            {categoriesData ? (
              <CategorySection categoriesData={categoriesData} articles={articles} />
            ) : (
              <><CategorySkeleton /><CategorySkeleton /><CategorySkeleton /></>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}