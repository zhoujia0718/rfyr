'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, Calendar, Edit3, Save, X, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  plainTextToReviewHtml,
  reviewStoredToPlainText,
  extractReviewDataUrlImages,
} from '@/lib/review-html'

interface ReviewRecord {
  id: string
  short_id?: string
  title: string
  content: string
  publishdate: string
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
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

export default function ReviewsManagePage() {
  const router = useRouter()
  const [records, setRecords] = React.useState<ReviewRecord[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  /** 用户点击「新增复盘」后需打开空表单；仅靠 title/content 无法区分「未打开」与「空草稿」 */
  const [isCreating, setIsCreating] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const zoneRef = React.useRef<HTMLDivElement>(null)

  const [formDate, setFormDate] = React.useState(new Date().toISOString().split('T')[0])
  const [formTitle, setFormTitle] = React.useState('')
  const [formContent, setFormContent] = React.useState('')
  const [pendingImages, setPendingImages] = React.useState<string[]>([])

  React.useEffect(() => {
    loadReviews()
  }, [])

  const loadReviews = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('id, short_id, title, content, publishdate, created_at')
        .eq('is_review', true)
        .order('publishdate', { ascending: false })

      if (error) throw error
      setRecords(
        (data || []).map((r) => ({
          id: r.id,
          short_id: r.short_id,
          title: r.title || '',
          content: r.content || '',
          publishdate: r.publishdate,
          created_at: r.created_at,
        }))
      )
    } catch (err) {
      console.error('加载复盘失败:', err)
      toast.error('加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    try {
      const dataUrl = await fileToCompressedDataUrl(file)
      if (dataUrl.length > 6 * 1024 * 1024) {
        toast.error('图片仍过大，请截取较小区域')
        return
      }
      setPendingImages((prev) => [...prev, dataUrl])
    } catch {
      toast.error('无法读取该图片')
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
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

  const removePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index))
  }

  const startNew = () => {
    setEditingId(null)
    setIsCreating(true)
    setFormDate(new Date().toISOString().split('T')[0])
    setFormTitle('')
    setFormContent('')
    setPendingImages([])
  }

  const startEdit = (record: ReviewRecord) => {
    setIsCreating(false)
    setEditingId(record.id)
    setFormDate(record.publishdate)
    setFormTitle(record.title || '')
    setFormContent(reviewStoredToPlainText(record.content || ''))
    setPendingImages(extractReviewDataUrlImages(record.content || ''))
  }

  const buildContentWithImages = (content: string, images: string[]) => {
    const bodyHtml = plainTextToReviewHtml(content)
    const imgTags = images
      .map((img) => `<p><img src="${img}" style="max-width:100%;border-radius:8px;margin:8px 0;" /></p>`)
      .join('')
    if (!bodyHtml && !imgTags) return ''
    return bodyHtml + imgTags
  }

  const handleSave = async () => {
    if (!formDate) {
      toast.error('请选择日期')
      return
    }
    if (!formTitle.trim() && !formContent.trim() && pendingImages.length === 0) {
      toast.error('标题、内容或截图至少填写一项')
      return
    }

    setSaving(true)
    try {
      const contentWithImages = buildContentWithImages(formContent.trim(), pendingImages)

      if (editingId) {
        const { error } = await supabase
          .from('articles')
          .update({
            publishdate: formDate,
            title: formTitle.trim(),
            content: contentWithImages,
          })
          .eq('id', editingId)

        if (error) throw error
        toast.success('复盘已更新')
      } else {
        const existing = records.find((r) => r.publishdate === formDate)
        if (existing) {
          const finalContent =
            existing.content + '\n' + (contentWithImages || '')

          const { error } = await supabase
            .from('articles')
            .update({
              publishdate: formDate,
              title: formTitle.trim() || existing.title,
              content: finalContent,
            })
            .eq('id', existing.id)

          if (error) throw error
          toast.success(`${formDate} 复盘已追加更新`)
        } else {
          const { generateShortId } = await import('@/lib/short-id')
          const { error } = await supabase.from('articles').insert({
            title: formTitle.trim() || `${formDate} 每日复盘`,
            content: contentWithImages,
            category: '每日复盘',
            author: '博主',
            publishdate: formDate,
            readingcount: 0,
            short_id: generateShortId(),
            is_review: true,
          })
          if (error) throw error
          toast.success('复盘已保存')
        }
      }

      setEditingId(null)
      setIsCreating(false)
      setFormDate('')
      setFormTitle('')
      setFormContent('')
      setPendingImages([])
      void loadReviews()
    } catch (err: any) {
      toast.error(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record: ReviewRecord) => {
    if (!confirm(`确定要删除 ${record.publishdate} 的复盘吗？`)) return
    try {
      await supabase.from('articles').delete().eq('id', record.id)
      toast.success('已删除')
      if (editingId === record.id) {
        setEditingId(null)
        setIsCreating(false)
      }
      void loadReviews()
    } catch {
      toast.error('删除失败')
    }
  }

  const isFormOpen =
    isCreating || editingId !== null || !!formTitle || !!formContent || pendingImages.length > 0

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <div className="flex items-center gap-1 text-sm">
            <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => router.push('/admin')}>
              返回
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium">每日复盘</span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">每日复盘管理</h1>
              <p className="text-sm text-muted-foreground mt-1">发布年卡专属复盘文章</p>
            </div>
            <Button onClick={startNew} className="gap-1.5">
              <Plus className="h-4 w-4" />
              新增复盘
            </Button>
          </div>

          {/* 编辑器表单 */}
          {isFormOpen && (
            <Card className="mb-8 border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold">
                    {editingId ? '编辑复盘' : '新增复盘'}
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingId(null)
                      setIsCreating(false)
                      setFormDate('')
                      setFormTitle('')
                      setFormContent('')
                      setPendingImages([])
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    取消
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-48 shrink-0">
                      <label className="text-xs text-muted-foreground mb-1.5 block">日期</label>
                      <Input
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1.5 block">标题（选填）</label>
                      <Input
                        placeholder={`${formDate || '2026-01-01'} 每日复盘`}
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">正文内容（选填，支持粘贴富文本）</label>
                    <Textarea
                      placeholder="写下今日复盘内容..."
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      className="min-h-[140px] w-full resize-y"
                    />
                  </div>

                  {/* 图片粘贴区 */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      截图（可选，可粘贴或拖拽多张）
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files
                        if (files) {
                          Array.from(files).forEach((f) => void processFile(f))
                        }
                        e.target.value = ''
                      }}
                    />
                    <div
                      ref={zoneRef}
                      tabIndex={0}
                      role="button"
                      aria-label="点击选择图片，或粘贴、拖入截图"
                      onPaste={onPaste}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (pendingImages.length === 0) fileInputRef.current?.click()
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setIsDragging(true)
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={onDrop}
                      onClick={() => {
                        zoneRef.current?.focus()
                        if (pendingImages.length === 0) fileInputRef.current?.click()
                      }}
                      className={cn(
                        'rounded-lg border-2 border-dashed p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        pendingImages.length === 0 && 'cursor-pointer',
                        isDragging
                          ? 'border-primary bg-primary/5'
                          : 'border-muted-foreground/25 hover:border-primary/40 bg-muted/20',
                        pendingImages.length > 0 && 'border-primary/50'
                      )}
                    >
                      {pendingImages.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-4 text-sm text-muted-foreground">
                          <Upload className="h-6 w-6 opacity-50" />
                          <span>点击选择图片，或先点此处再 Ctrl+V / ⌘V 粘贴截图（可粘贴多张）</span>
                          <span className="text-xs opacity-60">截图会压缩为 JPEG 并存入文章内容</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {pendingImages.map((img, i) => (
                              <div key={i} className="relative group">
                                <img
                                  src={img}
                                  alt={`截图 ${i + 1}`}
                                  className="h-16 w-24 rounded-md border object-cover bg-background"
                                />
                                <button
                                  type="button"
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removePendingImage(i)
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                fileInputRef.current?.click()
                              }}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              追加图片
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                setPendingImages([])
                              }}
                            >
                              <X className="h-3.5 w-3.5 mr-1" />
                              清除全部
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      保存
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 历史列表 */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">历史复盘</h2>
            <span className="text-sm text-muted-foreground">{records.length} 条</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground rounded-xl border border-dashed">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">暂无复盘</p>
              <p className="text-sm mt-1">点击右上角「新增复盘」开始</p>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <Card key={record.id} className="overflow-hidden hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/60">
                    <div className="flex shrink-0 items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">{record.publishdate}</span>
                    </div>
                    {record.title && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {record.title}
                      </Badge>
                    )}
                    <div className="ml-auto flex items-center gap-1 shrink-0">
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
                  {record.content && (
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                        {record.content.replace(/<[^>]+>/g, '').slice(0, 200)}
                        {record.content.length > 200 ? '…' : ''}
                      </p>
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
