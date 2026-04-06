"use client"

import * as React from "react"
import { FileDown, AlertCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { useMembership } from "@/components/membership-provider"
import { supabase } from "@/lib/supabase"
import { resolveAppUserId } from "@/lib/app-user-id"

type MembershipType = "none" | "weekly" | "yearly"

interface PdfDownloadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  membershipType: MembershipType
  articleTitle?: string
  pdfUrl?: string | null
  pdfFileName?: string
}

export function PdfDownloadDialog({
  open,
  onOpenChange,
  membershipType,
  articleTitle = "文章",
  pdfUrl,
  pdfFileName,
}: PdfDownloadDialogProps) {
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const { hasAccess, isLoading, membershipType: ctxMembershipType } = useMembership()
  const canDownload = hasAccess("pdfDownload")

  const [serverCanDownload, setServerCanDownload] = React.useState<boolean | null>(null)
  const [isCheckingServer, setIsCheckingServer] = React.useState(false)

  const effectiveCanDownload = canDownload || serverCanDownload === true

  const checkPdfDownloadPermissionFromDb = React.useCallback(async () => {
    try {
      if (typeof window === 'undefined') return false

      const userId = await resolveAppUserId()
      if (!userId) return false

      let customAuthVipTier: string | null = null
      try {
        const customAuthRaw = window.localStorage.getItem('custom_auth')
        if (customAuthRaw) {
          const parsed = JSON.parse(customAuthRaw)
          customAuthVipTier = parsed?.user?.vip_tier ?? null
        }
      } catch {
        // ignore
      }

      const fallbackFromUsersTable = async () => {
        const vipTierRawFromCustom = String(customAuthVipTier || '').toLowerCase()
        if (vipTierRawFromCustom.includes('yearly') || vipTierRawFromCustom.includes('annual')) return true
        if (vipTierRawFromCustom.includes('weekly')) return false

        const { data: userRow } = await supabase
          .from('users')
          .select('vip_tier')
          .eq('id', userId)
          .maybeSingle()

        const vipTierRaw = String(userRow?.vip_tier || '').toLowerCase()
        // 你的系统里“年卡/年度VIP”通常会落在 vip_tier = 'yearly'
        return vipTierRaw.includes('yearly') || vipTierRaw.includes('annual')
      }

      const { data, error } = await supabase
        .from('memberships')
        .select('membership_type,end_date')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(10)

      if (error) return await fallbackFromUsersTable()

      const now = new Date()
      const active = (data || []).filter((m: any) => {
        if (!m?.end_date) return false
        const end = new Date(m.end_date)
        return now <= end
      })

      const allowedFromMemberships = active.some((m: any) => {
        const raw = String(m?.membership_type || '').toLowerCase()
        return raw.includes('annual') || raw.includes('yearly')
      })

      // 如果 memberships 表拿不到/为空，用 users.vip_tier 再兜底一次
      if (!allowedFromMemberships && (!data || (data as any[]).length === 0)) {
        return await fallbackFromUsersTable()
      }

      return allowedFromMemberships
    } catch {
      return false
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!open) return
      // 如果本地判定已通过，不需要再查库
      if (canDownload) {
        setServerCanDownload(true)
        return
      }
      // 否则需要从 DB 再校验一次，避免本地会员缓存错导致误拦截
      setIsCheckingServer(true)
      setServerCanDownload(null)
      const allowed = await checkPdfDownloadPermissionFromDb()
      if (!cancelled) {
        setServerCanDownload(allowed)
      }
      setIsCheckingServer(false)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [open, canDownload, checkPdfDownloadPermissionFromDb])

  // 会员权限还没加载完成时，不要直接把用户判定为无权限
  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>正在校验会员权限...</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">请稍候</div>
        </DialogContent>
      </Dialog>
    )
  }

  React.useEffect(() => {
    if (isDownloading) {
      const timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(timer)
            setIsDownloading(false)
            return 100
          }
          return prev + Math.random() * 15
        })
      }, 300)
      return () => clearInterval(timer)
    }
  }, [isDownloading])

  const handleDownload = async () => {
    if (!effectiveCanDownload) return

    setProgress(0)
    setIsDownloading(true)

    try {
      // 检查是否在浏览器环境中
      if (typeof window === 'undefined') {
        throw new Error('PDF下载只能在浏览器环境中执行')
      }

      // 如果当前文章是“已上传 PDF”，直接下载原文件
      if (pdfUrl && pdfUrl.trim() !== '') {
        const fileName =
          (pdfFileName && pdfFileName.trim()) ||
          pdfUrl.split('/').pop() ||
          'document.pdf'

        const link = document.createElement('a')
        link.href = pdfUrl
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        onOpenChange(false)
        return
      }

      // 动态导入 jspdf 和 html2canvas
      const { jsPDF } = await import('jspdf')
      const html2canvas = (await import('html2canvas-pro')).default

      // 找到文章内容区域
      const articleContent = document.querySelector('.prose')
      if (!articleContent) {
        throw new Error('文章内容区域未找到')
      }

      // 1. 强制克隆并预处理（隔离逻辑）
      const clonedContent = articleContent.cloneNode(true) as HTMLElement
      
      // 为克隆的根容器添加标准边距和背景
      clonedContent.style.padding = '40px'
      clonedContent.style.boxSizing = 'border-box'
      clonedContent.style.backgroundColor = '#ffffff'
      clonedContent.style.width = '100%'
      clonedContent.style.maxWidth = '100%'
      clonedContent.style.margin = '0'
      clonedContent.style.overflow = 'hidden'
      
      // 为每个 img 标签包裹一个 div 容器
      const images = clonedContent.querySelectorAll('img')
      images.forEach(img => {
        const imgContainer = document.createElement('div')
        imgContainer.style.display = 'block'
        imgContainer.style.clear = 'both'
        imgContainer.style.margin = '20px 0 24px 0' // 图片下方与下一段文字之间有 24px 的垂直间距
        imgContainer.style.width = '100%'
        imgContainer.style.maxWidth = '100%'
        imgContainer.style.overflow = 'hidden'
        imgContainer.style.backgroundColor = '#ffffff'
        
        // 移动图片到容器中
        img.parentNode?.insertBefore(imgContainer, img)
        imgContainer.appendChild(img)
        
        // 确保图片自适应容器宽度
        img.style.maxWidth = '100%'
        img.style.height = 'auto'
        img.style.display = 'block'
        img.style.margin = '0'
      })

      // 2. 移除冲突的现代布局
      const allElements = clonedContent.querySelectorAll('*')
      allElements.forEach(el => {
        const htmlEl = el as HTMLElement
        const computedStyle = window.getComputedStyle(el)
        
        if (computedStyle.display.includes('flex') || 
            computedStyle.display.includes('grid') ||
            computedStyle.position === 'absolute' ||
            computedStyle.position === 'fixed') {
          htmlEl.style.display = 'block'
          htmlEl.style.position = 'relative'
        }
        htmlEl.style.maxWidth = '100%'
      })
      images.forEach(img => {
        // 检查并修改 loading="lazy" 为 eager
        if (img.hasAttribute('loading') && img.getAttribute('loading') === 'lazy') {
          img.setAttribute('loading', 'eager')
        }
      })

      // 预加载所有图片
      const imagePromises = Array.from(images).map(img => {
        return new Promise<void>((resolve, reject) => {
          const src = img.getAttribute('src')
          if (src) {
            const preloadImg = new Image()
            preloadImg.onload = () => resolve()
            preloadImg.onerror = () => resolve() // 即使图片加载失败也继续
            preloadImg.src = src
          } else {
            resolve()
          }
        })
      })

      // 等待所有图片预加载完成
      await Promise.all(imagePromises)

      // 临时在克隆内容顶部添加标题元素
      const titleElement = document.createElement('h1')
      titleElement.textContent = articleTitle
      titleElement.style.textAlign = 'center' // 标题居中
      titleElement.style.fontSize = '24px'
      titleElement.style.fontWeight = 'bold'
      titleElement.style.marginBottom = '20px' // 与下方内容留出 20px 的间距
      titleElement.style.color = '#000'
      titleElement.style.maxWidth = '100%' // 确保标题不会溢出
      clonedContent.insertBefore(titleElement, clonedContent.firstChild)

      // 临时将克隆内容添加到页面中，以便 html2canvas 能够捕捉它
      const tempContainer = document.createElement('div')
      tempContainer.style.position = 'absolute'
      tempContainer.style.top = '-9999px'
      tempContainer.style.left = '-9999px'
      tempContainer.style.width = '100%'
      tempContainer.style.maxWidth = '800px' // 设置一个合理的最大宽度
      tempContainer.appendChild(clonedContent)
      document.body.appendChild(tempContainer)

      // 生成当前日期
      const currentDate = new Date()
      const dateStr = currentDate.toISOString().split('T')[0]

      // 生成PDF文件名
      const fileName = `${articleTitle}_${dateStr}.pdf`

      // 4. 渲染配置加固
      // 使用html2canvas捕捉克隆的文章内容
      const canvas = await html2canvas(clonedContent, {
        useCORS: true, // 解决图片跨域问题
        scale: 2, // 提高清晰度
        logging: false,
        backgroundColor: '#ffffff',
        removeContainer: true,
        scrollX: 0,
        scrollY: 0,
        windowWidth: clonedContent.scrollWidth,
        windowHeight: clonedContent.scrollHeight,
        allowTaint: true
      })

      // 移除临时容器
      if (tempContainer.parentNode === document.body) {
        document.body.removeChild(tempContainer)
      }

      // 创建PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      // 计算页面尺寸
      const imgWidth = 210
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      const pageHeight = 297 // A4页面高度
      let heightLeft = imgHeight
      let position = 0

      // 直接添加内容页面，不添加标题页，避免中文乱码问题
      // 但首先确保我们没有空白页
      pdf.deletePage(1) // 删除默认创建的空白页

      if (imgHeight <= pageHeight) {
        // 内容可以放在一页中
        pdf.addPage()
        pdf.addImage(canvas, 'PNG', 0, 0, imgWidth, imgHeight)
      } else {
        // 内容需要分页
        while (heightLeft > 0) {
          pdf.addPage()
          pdf.addImage(canvas, 'PNG', 0, position, imgWidth, imgHeight)
          heightLeft -= pageHeight
          position -= pageHeight
        }
      }

      // 下载PDF
      pdf.save(fileName)
    } catch (error) {
      console.error('PDF生成失败:', error)
      // alert() 已在 handleDownload 最后分支兜底
    } finally {
      setIsDownloading(false)
      setProgress(100)
    }
  }

  React.useEffect(() => {
    if (!open) {
      setIsDownloading(false)
      setProgress(0)
    }
  }, [open])

  // 权限不足：不允许任何下载行为（但允许 server 校验结果纠正误判）
  if (!effectiveCanDownload && (isCheckingServer || serverCanDownload === null)) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>正在校验会员权限...</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">请稍候</div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!effectiveCanDownload) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary shrink-0" />
              <DialogTitle>下载受限</DialogTitle>
            </div>
            <DialogDescription>
              只有年度 VIP 才能下载 PDF
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                onOpenChange(false)
                window.location.href = "/membership"
              }}
            >
              升级年度 VIP
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Yearly VIP download
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary shrink-0" />
            <DialogTitle>下载 PDF</DialogTitle>
          </div>
          <DialogDescription>{articleTitle}</DialogDescription>
        </DialogHeader>

        {isDownloading ? (
          <div className="space-y-4 py-4">
            <Progress value={Math.min(progress, 100)} className="h-2" />
            <p className="text-center text-sm text-muted-foreground">
              {progress < 100 ? "正在生成 PDF 文档..." : "生成完成！"}
            </p>
            {progress >= 100 && (
              <div className="text-center">
                <p className="mb-3 text-sm text-primary">PDF 已开始下载</p>
                <Button onClick={() => onOpenChange(false)}>
                  完成
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              即将下载 PDF 文档，包含完整的文章内容。
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button className="flex-1" onClick={handleDownload}>
                下载 PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
