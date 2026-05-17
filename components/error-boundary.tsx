"use client"

import React, { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw } from "lucide-react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
  /** 发生错误时回调，可用于上报错误日志 */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 客户端错误上报（可扩展为 Sentry 等）
    if (typeof console !== "undefined") {
      console.error("[ErrorBoundary]", error, errorInfo)
    }
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">页面加载失败</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              抱歉，页面在加载过程中遇到了问题。请尝试刷新页面。
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <pre className="mt-2 p-3 text-left text-xs bg-muted rounded-md overflow-auto max-w-lg text-destructive">
                {this.state.error.message}
                {this.state.error.stack && (
                  <>\n\n{this.state.error.stack}</>
                )}
              </pre>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={this.handleReset}>
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

    return this.props.children
  }
}
