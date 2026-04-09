"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, Users, BookOpen, TrendingUp } from "lucide-react"

interface ArticleItem {
  id: string
  short_id?: string
  title: string
  subcategory?: string
}

export interface CategoryItem {
  id: string
  title: string
  icon: "masters" | "notes" | "stocks"
  href: string
  locked: boolean
  articles: ArticleItem[]
}

const ICON_MAP: Record<string, React.ElementType> = {
  masters: Users,
  notes: BookOpen,
  stocks: TrendingUp,
}

const DESC_MAP: Record<string, string> = {
  masters: "汇聚投资大师智慧",
  notes: "技术分析与实战复盘",
  stocks: "深度研究与投资逻辑",
}

export function CategorySection({ categories }: { categories: CategoryItem[] }) {
  return (
    <>
      {categories.map((cat) => {
        const Icon = ICON_MAP[cat.id] ?? Users
        return (
          <div
            key={cat.id}
            className="border border-gray-200 rounded-xl p-6 hover:border-primary hover:shadow-lg transition-all duration-300 bg-white"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground mb-1">{cat.title}</h2>
                <p className="text-sm text-muted-foreground">{DESC_MAP[cat.id]}</p>
              </div>
              <Link
                href={
                  cat.articles[0]
                    ? `${cat.href}/${cat.articles[0].short_id || cat.articles[0].id}`
                    : cat.href
                }
                className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                查看更多 <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cat.articles.length > 0 ? (
                cat.articles.map((article) => (
                  <div key={article.id} className="py-2">
                    <Link
                      href={`${cat.href}/${article.short_id || article.id}`}
                      className="flex w-full items-center hover:text-primary transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="line-clamp-1 text-sm font-medium">
                          {article.title}
                        </span>
                        {article.subcategory && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                            {article.subcategory}
                          </span>
                        )}
                      </div>
                    </Link>
                  </div>
                ))
              ) : (
                <div className="col-span-2 text-sm text-muted-foreground py-4">
                  暂无文章
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
