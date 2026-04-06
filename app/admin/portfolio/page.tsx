"use client"

import * as React from "react"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, Trash2, Calendar, ExternalLink, Edit3, Upload, X } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface PortfolioRecord {
  id: string
  short_id?: string
  date: string
  title: string
  images: string[]
  content: string
  created_at: string
}

const MAX_EDGE = 1920
const JPEG_QUALITY = 0.85

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  let w = bitmap.width
  let h = bitmap.height
  if (w > MAX_EDGE) {
    h = Math.round((h * MAX_EDGE) / w)
    w = MAX_EDGE
  }
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("无法创建画布")
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY)
}

export default function AdminPortfolioPage() {
  const router = useRouter()
  const [records, setRecords] = React.useState<PortfolioRecord[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editDate, setEditDate] = React.useState("")
  const [editTitle, setEditTitle] = React.useState("")
  const [editContent, setEditContent] = React.useState("")
  const [pendingImage, setPendingImage] = React.useState<string | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const zoneRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    loadRecords()
  }, [])

  const loadRecords = async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/portfolio")
      const data = await res.json()
      setRecords(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("加载失败:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const startNew = () => {
    setEditingId(null)
    setEditDate(new Date().toISOString().split("T")[0])
    setEditTitle("")
    setEditContent("")
    setPendingImage(null)
  }

  const startEdit = (record: PortfolioRecord) => {
    setEditingId(record.id)
    setEditDate(record.date)
    setEditTitle(record.title || "")
    setEditContent(record.content || "")
    setPendingImage(null)
  }

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("请粘贴或选择图片文件")
      return
    }
    try {
      const dataUrl = await fileToCompressedDataUrl(file)
      if (dataUrl.length > 6 * 1024 * 1024) {
        toast.error("图片仍过大，请截较小区域或降低分辨率后重试")
        return
      }
      setPendingImage(dataUrl)
    } catch {
      toast.error("无法读取该图片，请换一张试试")
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === "file" && item.type.startsWith("image/")) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) void processFile(file)
        return
      }
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void processFile(file)
  }

  const handleSave = async () => {
    if (!editDate) {
      toast.error("请选择日期")
      return
    }

    setIsSaving(true)
    try {
      if (editingId) {
        const existing = records.find((r) => r.id === editingId)
        const mergedImages =
          pendingImage && existing ? [...(existing.images || []), pendingImage] : undefined
        const res = await fetch("/api/portfolio", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingId,
            date: editDate,
            title: editTitle.trim(),
            content: editContent.trim(),
            ...(mergedImages ? { images: mergedImages } : {}),
          }),
        })
        if (!res.ok) throw new Error("更新失败")
        toast.success(pendingImage ? "记录已更新并追加截图" : "记录已更新")
      } else {
        const existing = records.find((r) => r.date === editDate)
        if (existing) {
          const mergedImages = pendingImage ? [...(existing.images || []), pendingImage] : undefined
          const res = await fetch("/api/portfolio", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: existing.id,
              date: editDate,
              title: editTitle.trim(),
              content: editContent.trim(),
              ...(mergedImages ? { images: mergedImages } : {}),
            }),
          })
          if (!res.ok) throw new Error("更新失败")
          toast.success(pendingImage ? `${editDate} 的记录已更新并追加截图` : `${editDate} 的记录已更新`)
        } else {
          const res = await fetch("/api/portfolio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: editDate,
              title: editTitle.trim(),
              content: editContent.trim(),
              images: pendingImage ? [pendingImage] : [],
              index_change: [],
              position_distribution: [],
              operations: [],
              holdings_summary: [],
              account_summary: {
                total_value: 0,
                total_profit_loss: 0,
                profit_pct: 0,
                position_pct: 0,
              },
            }),
          })
          if (!res.ok) throw new Error("创建失败")
          toast.success(pendingImage ? "实盘记录已创建并上传截图" : "实盘记录已创建")
        }
      }

      setEditingId(null)
      setEditDate("")
      setEditTitle("")
      setEditContent("")
      setPendingImage(null)
      loadRecords()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败"
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (record: PortfolioRecord) => {
    if (!confirm(`确定要删除 ${record.date} 的记录吗？`)) return
    try {
      await fetch(`/api/portfolio?id=${record.id}`, { method: "DELETE" })
      toast.success("记录已删除")
      if (editingId === record.id) {
        setEditingId(null)
      }
      loadRecords()
    } catch {
      toast.error("删除失败")
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => router.push("/admin")}>
                  返回管理后台
                </Button>
                <span>/</span>
                <span>个人实盘</span>
              </div>
              <h1 className="text-2xl font-bold">个人实盘管理</h1>
              <p className="text-sm text-muted-foreground mt-1">记录每日复盘笔记</p>
            </div>
            <Button onClick={startNew} className="gap-1.5">
              <Plus className="h-4 w-4" />
              新增记录
            </Button>
          </div>

          {/* 新增 / 编辑表单 */}
          {(editingId !== null || editDate || editTitle || editContent) && (
            <Card className="mb-8 border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold">
                    {editingId ? "编辑记录" : "新增记录"}
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingId(null)
                      setEditDate("")
                      setEditTitle("")
                      setEditContent("")
                    }}
                  >
                    取消
                  </Button>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-40 shrink-0">
                      <label className="text-xs text-muted-foreground mb-1.5 block">日期</label>
                      <Input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1.5 block">标题（选填）</label>
                      <Input
                        placeholder="例如：今日操作 / 持仓总结"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">内容</label>
                    <Textarea
                      placeholder="写点什么..."
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[120px] w-full resize-y"
                    />
                  </div>

                  {/* 截图（可选） */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">截图（可选）</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void processFile(f)
                        e.target.value = ""
                      }}
                    />
                    <div
                      ref={zoneRef}
                      tabIndex={0}
                      role="button"
                      aria-label="粘贴或拖入截图"
                      onPaste={onPaste}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setIsDragging(true)
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={onDrop}
                      onClick={() => zoneRef.current?.focus()}
                      className={cn(
                        "rounded-lg border-2 border-dashed p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/40 bg-muted/20",
                        pendingImage && "border-primary/50"
                      )}
                    >
                      {!pendingImage ? (
                        <button
                          type="button"
                          className="w-full flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            fileInputRef.current?.click()
                          }}
                        >
                          <Upload className="h-5 w-5" />
                          点击选择图片，或先点此处再 Ctrl+V / ⌘V 粘贴截图
                        </button>
                      ) : (
                        <div className="flex items-center gap-3">
                          <img
                            src={pendingImage}
                            alt="待追加截图预览"
                            className="h-16 w-24 rounded-md border object-cover bg-background"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                              换一张
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setPendingImage(null)}>
                              <X className="h-4 w-4 mr-1" />
                              清除
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      截图会压缩为 JPEG 并存入数据库（不依赖图床/Storage）。
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 历史记录 */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">历史记录</h2>
            <span className="text-sm text-muted-foreground">{records.length} 条</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground rounded-xl border border-dashed">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">暂无实盘记录</p>
              <p className="text-sm mt-1">点击右上角「新增记录」开始</p>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <Card key={record.id} className="overflow-hidden hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-sm shrink-0">{record.date}</span>
                      {record.title && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {record.title}
                        </Badge>
                      )}
                    </div>

                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      {record.short_id && (
                        <Link href={`/portfolio/${record.short_id}`} target="_blank">
                          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
                            <ExternalLink className="h-3 w-3" />
                            查看
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1 text-xs"
                        onClick={() => startEdit(record)}
                      >
                        <Edit3 className="h-3 w-3" />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(record)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {(record.images?.length > 0 || record.content) && (
                    <CardContent className="p-4 space-y-3">
                      {record.images?.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {record.images.slice(0, 6).map((img, i) => (
                            <img
                              key={i}
                              src={img}
                              alt={`${record.date} 截图 ${i + 1}`}
                              className="h-14 w-20 rounded-md border object-cover bg-background"
                              loading="lazy"
                            />
                          ))}
                          {record.images.length > 6 && (
                            <div className="h-14 w-20 rounded-md border bg-muted/30 text-xs text-muted-foreground flex items-center justify-center">
                              +{record.images.length - 6}
                            </div>
                          )}
                        </div>
                      )}
                      {record.content && (
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {record.content.length > 200 ? record.content.slice(0, 200) + "…" : record.content}
                        </p>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
