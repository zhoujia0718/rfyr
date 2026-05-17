"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw } from "lucide-react"

function isDialogOpen() {
  if (typeof document === "undefined") return false
  return !!document.querySelector('[data-state="open"][data-slot="dialog-content"]')
}


export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [hideError, setHideError] = useState(false)

  useEffect(() => {
    const handler = () => setHideError(true)
    document.addEventListener("rfyr:hide-error", handler)
    return () => document.removeEventListener("rfyr:hide-error", handler)
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[App Error]", error)
    }
  }, [error])

  if (hideError || isDialogOpen()) {
    return (
      <div className="hidden" aria-hidden="true" />
    )
  }

  // React 18 dev 模式会把渲染期间的 console.error 自动提升为真实错误。
  // "Unknown event handler property 'onOpenChange'" 是无害的 React 警告（来自 Dialog 组件），
  // 对话框打开期间不需要显示错误页。
  if (error.message.includes("onOpenChange") || error.message.includes("Unknown event handler")) {
    return (
      <div className="hidden" aria-hidden="true" />
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">页面发生错误</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          {error.digest ? (
            <>错误码：<code className="text-xs bg-muted px-1 rounded">{error.digest}</code>。请截图联系管理员。</>
          ) : (
            "抱歉，页面遇到了意外错误。"
          )}
        </p>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-3 text-left">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              错误详情（仅开发环境可见）
            </summary>
            <pre className="mt-2 p-3 text-left text-xs bg-muted rounded-md overflow-auto max-w-lg text-destructive">
              {error.message}
              {error.stack && <>\n\n{error.stack}</>}
            </pre>
          </details>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          重试
        </Button>
        <Button onClick={() => (window.location.href = "/")}>
          返回首页
        </Button>
      </div>
    </div>
  )
}
