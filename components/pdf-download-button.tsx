"use client"

import * as React from "react"
import { Download, Loader2, FileText } from "lucide-react"
import { useMembership } from "@/components/membership-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface PDFDownloadButtonProps {
  articleId: string
  articleTitle: string
  /** 已上传 PDF 的直链；未传则无法触发下载 */
  pdfUrl?: string | null
  pdfFileName?: string | null
  className?: string
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
}

export function PDFDownloadButton({
  articleId,
  articleTitle,
  pdfUrl,
  pdfFileName,
  className,
  variant = "outline",
  size = "default",
}: PDFDownloadButtonProps) {
  const { hasAccess, membershipType } = useMembership()
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [showDialog, setShowDialog] = React.useState(false)

  const canDownload = hasAccess("pdfDownload")

  const handleDownload = async () => {
    if (!canDownload) {
      setShowDialog(true)
      return
    }

    const url = pdfUrl?.trim()
    if (!url) {
      toast.error("暂无可下载的 PDF，请在后台为笔记上传 PDF 或指定链接")
      return
    }

    setIsDownloading(true)
    try {
      const fileName =
        (pdfFileName && pdfFileName.trim()) ||
        url.split("/").pop() ||
        `${articleTitle}.pdf`

      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('PDF下载失败:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn(className)}
        onClick={handleDownload}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            下载中...
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            下载PDF
          </>
        )}
      </Button>

      {/* 权限不足提示对话框 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              PDF下载会员专享
            </DialogTitle>
            <DialogDescription>
              升级年度VIP会员，下载PDF资料（含水印）
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border bg-secondary/30 p-4">
              <h4 className="font-medium">年度VIP会员权益</h4>
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  大佬合集PDF下载
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  短线笔记PDF下载
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  下载文档含专属水印
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">年度VIP会员</p>
                <p className="text-sm text-muted-foreground">365天有效期</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-primary">¥299</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowDialog(false)}
            >
              取消
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setShowDialog(false)
                window.location.href = "/membership"
              }}
            >
              升级会员
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
