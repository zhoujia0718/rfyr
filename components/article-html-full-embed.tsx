"use client"

import * as React from "react"
import { Maximize2, ExternalLink, ArrowLeft } from "lucide-react"
import type { Article } from "@/lib/articles"
import { Button } from "@/components/ui/button"
import { articlePageTitleClassName } from "@/lib/article-page-title"

function htmlProxyPath(htmlUrl: string): string {
  return `/api/html-proxy?url=${encodeURIComponent(htmlUrl)}`
}

export interface ArticleHtmlFullEmbedProps {
  article: Article
}

export function ArticleHtmlFullEmbed({ article }: ArticleHtmlFullEmbedProps) {
  const htmlUrl = (article.html_url || "").trim()
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  if (!htmlUrl || !htmlUrl.startsWith("http")) {
    return null
  }

  const src = htmlProxyPath(htmlUrl)

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-background">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 shadow-sm">
          <Button variant="ghost" size="sm" className="gap-2 text-foreground" onClick={() => setIsFullscreen(false)}>
            <ArrowLeft className="h-4 w-4" />
            退出全屏
          </Button>
          <h1
            className={`min-w-0 flex-1 truncate text-center ${articlePageTitleClassName}`}
          >
            {article.title}
          </h1>
          <Button variant="outline" size="sm" className="shrink-0 gap-2" asChild>
            <a href={src} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              新窗口
            </a>
          </Button>
        </header>
        <iframe
          src={src}
          title={article.title}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    )
  }

  return (
    <div className="not-prose -mx-4 w-[calc(100%+2rem)] max-w-none lg:-mx-8 lg:w-[calc(100%+4rem)]">
      {/* 标题移到工具条内、与按钮同一行（大屏左右等分列保证居中）；小屏标题在上、按钮在下 */}
      <div className="mb-3 rounded-lg border border-border bg-card px-3 py-3 shadow-sm sm:px-4">
        <div className="flex flex-col items-center gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-x-3 sm:gap-y-0">
          <div className="hidden sm:block" aria-hidden />
          <header className="flex w-full max-w-2xl flex-col items-center px-2 text-center sm:w-auto">
            <h1 className={articlePageTitleClassName}>{article.title}</h1>
            <div
              className="mx-auto mt-3 h-px w-8 rounded-full bg-[#3d4f5f]/15 sm:mt-4 dark:bg-[#93c5fd]/30"
              aria-hidden
            />
          </header>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href={src} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                新窗口
              </a>
            </Button>
            <Button variant="default" size="sm" className="gap-2" onClick={() => setIsFullscreen(true)}>
              <Maximize2 className="h-3.5 w-3.5" />
              全屏阅读
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <iframe
          src={src}
          title={article.title}
          className="block min-h-[calc(100vh-12rem)] w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  )
}
