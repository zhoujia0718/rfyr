"use client"

import * as React from "react"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Search, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Skeleton } from "@/components/ui/skeleton"

interface SearchResult {
  id: string
  title: string
  content: string
  summary?: string
  category?: string
  created_at: string
  thumbnail?: string
  short_id?: string
}

function SearchPageContent() {
  const searchParams = useSearchParams()
  const query = searchParams.get("q") || ""
  
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [totalCount, setTotalCount] = React.useState(0)

  React.useEffect(() => {
    if (!query.trim()) return
    
    const performSearch = async () => {
      setIsLoading(true)
      try {
        // 搜索文章标题和内容
        const { data, error, count } = await supabase
          .from('articles')
          .select('*', { count: 'exact' })
          .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
          .order('created_at', { ascending: false })
        
        if (error) {
          console.error('搜索失败:', error)
          return
        }
        
        setResults(data || [])
        setTotalCount(count || 0)
      } catch (error) {
        console.error('搜索出错:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    performSearch()
  }, [query])

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  // 获取摘要
  const getExcerpt = (content: string, maxLength: number = 120) => {
    // 去除HTML标签
    const plainText = content.replace(/<[^>]+>/g, '')
    if (plainText.length <= maxLength) return plainText
    return plainText.substring(0, maxLength) + '...'
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
          {/* 搜索统计 */}
          {query && (
            <div className="mb-8">
              <h1 className="text-lg text-gray-600">
                为您找到 <span style={{ color: '#1E40AF' }} className="font-bold">&ldquo;{query}&rdquo;</span> 相关结果 <span className="font-bold">{totalCount}</span> 个
              </h1>
            </div>
          )}

          {/* 加载状态 */}
          {isLoading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div 
                  key={i} 
                  className="bg-white rounded-xl p-6"
                  style={{ border: '1px solid #E2E8F0' }}
                >
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 搜索结果 */}
          {!isLoading && results.length > 0 && (
            <div className="space-y-4">
              {results.map((article) => (
                <Link 
                  key={article.id}
                  href={`/article/${article.short_id || article.id}`}
                  className="block bg-white rounded-xl transition-shadow duration-200 hover:shadow-lg"
                  style={{ border: '1px solid #E2E8F0' }}
                >
                  <div className="p-6">
                    <div>
                      {/* 文字内容 */}
                      <div className="min-w-0">
                        {/* 标题和分类 */}
                        <div className="flex items-center gap-3 mb-2">
                          <h2 
                            className="text-base line-clamp-1"
                            style={{ color: '#1F2937' }}
                          >
                            {article.title}
                          </h2>
                          <span 
                            className="text-xs font-medium px-2 py-0.5 rounded flex-shrink-0"
                            style={{ 
                              backgroundColor: '#FEF2F2', 
                              color: '#EF4444' 
                            }}
                          >
                            {article.category || '投资资讯'}
                          </span>
                        </div>
                        <p 
                          className="text-sm line-clamp-2 mb-3"
                          style={{ color: '#64748B' }}
                        >
                          {article.summary || getExcerpt(article.content)}
                        </p>
                        
                        {/* 页脚信息 - 只显示日期 */}
                        <div className="flex items-center justify-end">
                          <span 
                            className="text-xs"
                            style={{ color: '#94A3B8' }}
                          >
                            {formatDate(article.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* 空状态 */}
          {!isLoading && query && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <div 
                className="h-20 w-20 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: '#F1F5F9' }}
              >
                <Search className="h-10 w-10" style={{ color: '#94A3B8' }} />
              </div>
              <p style={{ color: '#64748B' }} className="text-base">
                暂无相关投资资讯，请尝试其他关键词
              </p>
            </div>
          )}

          {/* 无搜索词状态 */}
          {!query && (
            <div className="flex flex-col items-center justify-center py-16">
              <div 
                className="h-20 w-20 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: '#F1F5F9' }}
              >
                <Search className="h-10 w-10" style={{ color: '#94A3B8' }} />
              </div>
              <p style={{ color: '#64748B' }} className="text-base">
                请输入关键词搜索投资资讯
              </p>
            </div>
          )}
        </div>
    </main>
  )
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[50vh] flex-1 items-center justify-center px-4 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      }
    >
      <SearchPageContent />
    </Suspense>
  )
}
