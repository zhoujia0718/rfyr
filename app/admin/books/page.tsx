'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ChevronRight, Plus, Trash2, Save, RefreshCw, Copy, BookOpen, Loader2, Eye, EyeOff, Upload, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { generateBookPassword, BOOK_ACCESS_LEVEL_LABELS, type BookAdmin, type BookAccessLevel } from '@/lib/books'
import { PDFDocument } from 'pdf-lib'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface UploadState {
  uploading: boolean
  progress: string
}

type BatchStatus = 'pending' | 'extracting' | 'uploading' | 'done' | 'error'

interface BatchItem {
  id: string
  file: File
  title: string
  author: string
  description: string
  access_level: BookAccessLevel
  status: BatchStatus
  progress: string
  error?: string
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function adminHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' }
}

/** 从文件名解析书名和作者（格式：书名 - 作者.pdf 或 书名.pdf） */
function parseFilename(filename: string): { title: string; author: string } {
  const name = filename.replace(/\.pdf$/i, '').replace(/_/g, ' ').trim()
  const sep = name.match(/\s*[-–—]\s*/)
  if (sep?.index) {
    return {
      title: name.slice(0, sep.index).trim(),
      author: name.slice(sep.index + sep[0].length).trim(),
    }
  }
  return { title: name, author: '' }
}

/** 从 PDF Info Dictionary 读取元数据，失败时回退到文件名 */
async function extractPdfMeta(file: File): Promise<{ title: string; author: string; description: string }> {
  try {
    const buffer = await file.arrayBuffer()
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
    const title = pdf.getTitle()?.trim() ?? ''
    const author = pdf.getAuthor()?.trim() ?? ''
    const description = (pdf.getSubject() ?? pdf.getKeywords() ?? '').trim()
    if (title) return { title, author, description }
  } catch { /* ignore */ }
  // 元数据为空时回退到文件名
  const { title, author } = parseFilename(file.name)
  return { title, author, description: '' }
}

/** 客户端加水印 → 浏览器直传七牛（绕过服务端，带进度） */
async function uploadPdf(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `books/${Date.now()}_${safeName}`

  onProgress?.(0)
  const watermarked = await addWatermarkClient(await file.arrayBuffer())
  onProgress?.(10)

  const tokenRes = await fetch('/api/admin/qiniu-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
    credentials: 'include',
  })
  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}))
    throw new Error(err.error ?? '获取上传凭证失败')
  }
  const { token, uploadUrls } = await tokenRes.json()

  const blob = new Blob([watermarked], { type: 'application/pdf' })
  await xhrUploadToQiniu(blob, key, token, uploadUrls, onProgress)

  return key
}

/** 客户端 PDF 水印（与服务端逻辑一致，用 fetch 加载字体） */
async function addWatermarkClient(pdfBytes: ArrayBuffer): Promise<Uint8Array> {
  const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib')
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })

  let font: Awaited<ReturnType<typeof pdfDoc.embedFont>>
  let watermarkText = '日富一日：rfyr.club'
  try {
    const fontkit = (await import('@pdf-lib/fontkit')).default
    pdfDoc.registerFontkit(fontkit)
    const fontRes = await fetch('/fonts/NotoSansSC-Bold.ttf')
    if (!fontRes.ok) throw new Error('font not found')
    const embedded = await pdfDoc.embedFont(new Uint8Array(await fontRes.arrayBuffer()))
    embedded.widthOfTextAtSize('日', 12) // 验证字体有效
    font = embedded
  } catch {
    font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    watermarkText = 'rfyr.club'
  }

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize()
    const fontSize = Math.max(18, Math.min(36, width / 18))
    page.drawText(watermarkText, {
      x: width / 2 - (watermarkText.length * fontSize * 0.3),
      y: height / 2,
      size: fontSize, font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.22,
      rotate: degrees(45),
    })
    page.drawText('rfyr.club', {
      x: 16, y: 16, size: 10, font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.4,
    })
  }
  return pdfDoc.save()
}

/** 浏览器 XHR 直传七牛，逐个节点尝试（不加 upload 事件监听，避免触发 CORS 预检） */
async function xhrUploadToQiniu(
  blob: Blob, key: string, token: string, uploadUrls: string[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  const tryUrl = (url: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('token', token)
      form.append('key', key)
      form.append('file', blob, key.split('/').pop() ?? 'book.pdf')
      const xhr = new XMLHttpRequest()
      xhr.onload = () => xhr.status === 200
        ? resolve()
        : reject(new Error(`上传失败 (${xhr.status}): ${xhr.responseText}`))
      xhr.onerror = () => reject(new Error(`节点不可达: ${url}`))
      xhr.ontimeout = () => reject(new Error(`节点超时: ${url}`))
      xhr.timeout = 60_000
      xhr.open('POST', url)
      xhr.send(form)
    })

  // 上传期间用定时假进度（10% → 95%），避免 UI 卡死
  let fakeTimer: ReturnType<typeof setInterval> | null = null
  if (onProgress) {
    let pct = 10
    fakeTimer = setInterval(() => {
      pct = Math.min(95, pct + 2)
      onProgress(pct)
    }, 800)
  }

  try {
    for (const url of uploadUrls) {
      try {
        await tryUrl(url)
        return
      } catch (e) {
        if (url === uploadUrls[uploadUrls.length - 1]) throw e
      }
    }
  } finally {
    if (fakeTimer) clearInterval(fakeTimer)
  }
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function AdminBooksPage() {
  const [books, setBooks] = React.useState<BookAdmin[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showPasswords, setShowPasswords] = React.useState(false)

  // 新增/编辑弹框
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editingBook, setEditingBook] = React.useState<BookAdmin | null>(null)

  // 删除确认弹框
  const [deleteId, setDeleteId] = React.useState<string | null>(null)

  // 一键换密码弹框
  const [rotateDialogOpen, setRotateDialogOpen] = React.useState(false)
  const [rotating, setRotating] = React.useState(false)

  // 表单状态
  const [form, setForm] = React.useState({
    title: '',
    author: '',
    description: '',
    cover_url: '',
    access_level: 'monthly' as BookAccessLevel,
    sort_order: 0,
    published: true,
  })
  const [pdfFile, setPdfFile] = React.useState<File | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [uploadState, setUploadState] = React.useState<UploadState>({ uploading: false, progress: '' })
  const [extractingMeta, setExtractingMeta] = React.useState(false)

  // ── 数据加载 ──────────────────────────────────────────────────────────────
  const fetchBooks = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/books', { credentials: 'include' })
      if (!res.ok) throw new Error('加载失败')
      const data = await res.json()
      setBooks(data)
    } catch (e: any) {
      toast.error(e.message ?? '加载书籍失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void fetchBooks() }, [fetchBooks])

  // ── 打开新增弹框 ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingBook(null)
    setForm({ title: '', author: '', description: '', cover_url: '', access_level: 'monthly', sort_order: 0, published: true })
    setPdfFile(null)
    setEditDialogOpen(true)
  }

  // ── 打开编辑弹框 ──────────────────────────────────────────────────────────
  const openEdit = (book: BookAdmin) => {
    setEditingBook(book)
    setForm({
      title: book.title,
      author: book.author ?? '',
      description: book.description ?? '',
      cover_url: book.cover_url ?? '',
      access_level: book.access_level as BookAccessLevel,
      sort_order: book.sort_order,
      published: book.published,
    })
    setPdfFile(null)
    setEditDialogOpen(true)
  }

  // ── 保存（新增 or 编辑）──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('书名不能为空'); return }
    if (!editingBook && !pdfFile) { toast.error('请选择 PDF 文件'); return }

    setSaving(true)
    try {
      let filePath = editingBook?.file_path ?? ''

      // 有新文件则先上传
      if (pdfFile) {
        setUploadState({ uploading: true, progress: '加水印中…' })
        filePath = await uploadPdf(pdfFile, (pct) => {
          setUploadState({
            uploading: true,
            progress: pct < 10 ? '加水印中…' : `上传至七牛 ${pct}%…`,
          })
        })
        setUploadState({ uploading: false, progress: '' })
      }

      const payload = { ...form, file_path: filePath }

      if (editingBook) {
        const res = await fetch(`/api/admin/books?id=${editingBook.id}`, {
          method: 'PATCH',
          ...adminHeaders(),
          body: JSON.stringify(payload),
          credentials: 'include',
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '更新失败')
        toast.success('书籍已更新')
      } else {
        const res = await fetch('/api/admin/books', {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify(payload),
          credentials: 'include',
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '新增失败')
        toast.success('书籍已添加')
      }

      setEditDialogOpen(false)
      void fetchBooks()
    } catch (e: any) {
      toast.error(e.message ?? '操作失败')
    } finally {
      setSaving(false)
      setUploadState({ uploading: false, progress: '' })
    }
  }

  // ── 删除 ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/admin/books?id=${deleteId}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '删除失败')
      toast.success('已删除')
      setBooks((prev) => prev.filter((b) => b.id !== deleteId))
    } catch (e: any) {
      toast.error(e.message ?? '删除失败')
    } finally {
      setDeleteId(null)
    }
  }

  // ── 单独更换密码 ──────────────────────────────────────────────────────────
  const handleRotateSingle = async (book: BookAdmin) => {
    try {
      const res = await fetch(`/api/admin/books?id=${book.id}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ download_password: generateBookPassword() }),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('更换失败')
      toast.success('密码已更换')
      void fetchBooks()
    } catch (e: any) {
      toast.error(e.message ?? '更换失败')
    }
  }

  // ── 一键更换所有密码 ──────────────────────────────────────────────────────
  const handleRotateAll = async () => {
    setRotating(true)
    try {
      const res = await fetch('/api/admin/books/rotate-passwords', { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '批量更换失败')
      const { updated } = await res.json()
      toast.success(`已为 ${updated.length} 本书更换密码`)
      setRotateDialogOpen(false)
      void fetchBooks()
    } catch (e: any) {
      toast.error(e.message ?? '批量更换失败')
    } finally {
      setRotating(false)
    }
  }

  // ── 批量上传 ─────────────────────────────────────────────────────────────
  const [batchOpen, setBatchOpen] = React.useState(false)
  const [batchItems, setBatchItems] = React.useState<BatchItem[]>([])
  const [batchRunning, setBatchRunning] = React.useState(false)
  const [batchAccessLevel, setBatchAccessLevel] = React.useState<BookAccessLevel>('monthly')

  const openBatch = () => { setBatchItems([]); setBatchOpen(true) }

  const handleBatchFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const items: BatchItem[] = Array.from(files).map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      title: '',
      author: '',
      description: '',
      access_level: batchAccessLevel,
      status: 'extracting' as BatchStatus,
      progress: '',
    }))
    setBatchItems(items)

    // 逐个解析元数据
    for (const item of items) {
      const meta = await extractPdfMeta(item.file)
      setBatchItems((prev) => prev.map((i) =>
        i.id === item.id ? { ...i, title: meta.title, author: meta.author, description: meta.description, status: 'pending' } : i
      ))
    }
  }

  const handleBatchRun = async () => {
    const pending = batchItems.filter((i) => i.status === 'pending' || i.status === 'error')
    if (pending.length === 0) return
    setBatchRunning(true)

    for (const item of pending) {
      setBatchItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: 'uploading', progress: '上传中…' } : i))
      try {
        const isDirect = item.file.size > 300 * 1024 * 1024
        const filePath = await uploadPdf(item.file, isDirect ? (pct) => {
          setBatchItems((prev) => prev.map((i) => i.id === item.id ? { ...i, progress: `${pct}%` } : i))
        } : undefined)

        const payload = {
          title: item.title || item.file.name,
          author: item.author,
          description: item.description,
          access_level: item.access_level,
          file_path: filePath,
          sort_order: 0,
          published: true,
        }
        const res = await fetch('/api/admin/books', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? '保存失败')
        setBatchItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: 'done', progress: '' } : i))
      } catch (e: any) {
        setBatchItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: 'error', progress: '', error: e.message } : i))
      }
    }

    setBatchRunning(false)
    void fetchBooks()
  }

  const updateBatchItem = (id: string, patch: Partial<BatchItem>) => {
    setBatchItems((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i))
  }

  // ── 复制密码 ─────────────────────────────────────────────────────────────
  const copyPassword = (pwd: string) => {
    navigator.clipboard.writeText(pwd).then(() => toast.success('密码已复制'))
  }

  // ─── 渲染 ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 面包屑 */}
      <nav className="mb-6 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">管理中心</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">书籍管理</span>
      </nav>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                股票书籍管理
              </CardTitle>
              <CardDescription className="mt-1">
                管理书籍 PDF 及下载密码，月卡/年卡会员可免密下载
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowPasswords((v) => !v)}>
                {showPasswords ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                {showPasswords ? '隐藏密码' : '显示密码'}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setRotateDialogOpen(true)}>
                <RefreshCw className="mr-1 h-4 w-4" />
                一键换密码
              </Button>
              <Button variant="outline" size="sm" onClick={openBatch}>
                <Upload className="mr-1 h-4 w-4" />
                批量上传
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" />
                添加书籍
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : books.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              暂无书籍，点击「添加书籍」开始
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3">书名</th>
                    <th className="px-4 py-3">作者</th>
                    <th className="px-4 py-3">权限</th>
                    <th className="px-4 py-3">下载密码</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {books.map((book) => (
                    <tr key={book.id} className="border-b hover:bg-gray-50/50">
                      <td className="max-w-[200px] truncate px-4 py-3 font-medium">{book.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{book.author ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          book.access_level === 'yearly' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {BOOK_ACCESS_LEVEL_LABELS[book.access_level as BookAccessLevel]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">
                            {showPasswords ? book.download_password : '••••••••'}
                          </code>
                          {showPasswords && (
                            <button
                              onClick={() => copyPassword(book.download_password)}
                              className="text-muted-foreground hover:text-foreground"
                              title="复制"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${book.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {book.published ? '已发布' : '草稿'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(book)}>编辑</Button>
                          <Button variant="ghost" size="sm" onClick={() => handleRotateSingle(book)} title="更换此书密码">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => setDeleteId(book.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 新增/编辑弹框 ─────────────────────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingBook ? '编辑书籍' : '添加书籍'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>书名 *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="《股票作手回忆录》" />
            </div>
            <div className="grid gap-1.5">
              <Label>作者</Label>
              <Input value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} placeholder="[美] 埃德温·勒菲弗" />
            </div>
            <div className="grid gap-1.5">
              <Label>简介</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="一两句话描述本书…" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>权限等级</Label>
                <Select value={form.access_level} onValueChange={(v) => setForm((f) => ({ ...f, access_level: v as BookAccessLevel }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">月卡</SelectItem>
                    <SelectItem value="yearly">年卡</SelectItem>
                    <SelectItem value="free">免费</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>排序权重</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-2">
                PDF 文件 {editingBook ? '（留空保留原文件）' : '*'}
                {extractingMeta && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    解析文件信息中…
                  </span>
                )}
              </Label>
              <Input
                type="file"
                accept=".pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0] ?? null
                  setPdfFile(file)
                  if (!file) return
                  setExtractingMeta(true)
                  try {
                    const meta = await extractPdfMeta(file)
                    setForm((f) => ({
                      ...f,
                      title: f.title || meta.title,
                      author: f.author || meta.author,
                      description: f.description || meta.description,
                    }))
                  } finally {
                    setExtractingMeta(false)
                  }
                }}
              />
              {editingBook && (
                <p className="text-xs text-muted-foreground">当前文件：{editingBook.file_path}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="published"
                checked={form.published}
                onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
              />
              <Label htmlFor="published">立即发布</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving || uploadState.uploading}>
              {uploadState.uploading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{uploadState.progress}</>
              ) : saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />保存中…</>
              ) : (
                <><Save className="mr-2 h-4 w-4" />保存</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 删除确认弹框 ──────────────────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>删除后不可恢复，Storage 中的 PDF 文件不会同步删除。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 一键换密码确认弹框 ────────────────────────────────────────────── */}
      <Dialog open={rotateDialogOpen} onOpenChange={setRotateDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>一键更换所有密码</DialogTitle>
            <DialogDescription>
              将为 <strong>{books.length}</strong> 本书生成全新下载密码。<br />
              旧密码立即失效，请及时通知已分发密码的用户。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleRotateAll} disabled={rotating}>
              {rotating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />更换中…</> : '确认更换'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 批量上传弹框 ─────────────────────────────────────────────────── */}
      <Dialog open={batchOpen} onOpenChange={(o) => { if (!batchRunning) setBatchOpen(o) }}>
        <DialogContent className="sm:max-w-[780px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>批量上传书籍</DialogTitle>
            <DialogDescription>选择多个 PDF，自动读取书名/作者，可编辑后统一上传。</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {/* 文件选择 + 统一权限 */}
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Label className="mb-1.5 block">选择 PDF 文件（可多选）</Label>
                <Input
                  type="file"
                  accept=".pdf"
                  multiple
                  disabled={batchRunning}
                  onChange={(e) => void handleBatchFiles(e.target.files)}
                />
              </div>
              <div className="w-36">
                <Label className="mb-1.5 block">默认权限</Label>
                <Select
                  value={batchAccessLevel}
                  onValueChange={(v) => {
                    setBatchAccessLevel(v as BookAccessLevel)
                    setBatchItems((prev) => prev.map((i) => i.status === 'pending' ? { ...i, access_level: v as BookAccessLevel } : i))
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">月卡</SelectItem>
                    <SelectItem value="yearly">年卡</SelectItem>
                    <SelectItem value="free">免费</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 文件列表 */}
            {batchItems.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">文件名</th>
                      <th className="px-3 py-2 w-[180px]">书名</th>
                      <th className="px-3 py-2 w-[120px]">作者</th>
                      <th className="px-3 py-2 w-[90px]">权限</th>
                      <th className="px-3 py-2 w-[100px]">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchItems.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-[140px] truncate" title={item.file.name}>
                          {item.file.name}
                          <span className="block text-[10px]">{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={item.title}
                            onChange={(e) => updateBatchItem(item.id, { title: e.target.value })}
                            disabled={item.status === 'uploading' || item.status === 'done'}
                            className="h-7 text-xs"
                            placeholder="书名"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={item.author}
                            onChange={(e) => updateBatchItem(item.id, { author: e.target.value })}
                            disabled={item.status === 'uploading' || item.status === 'done'}
                            className="h-7 text-xs"
                            placeholder="作者"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={item.access_level}
                            onValueChange={(v) => updateBatchItem(item.id, { access_level: v as BookAccessLevel })}
                            disabled={item.status === 'uploading' || item.status === 'done'}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monthly">月卡</SelectItem>
                              <SelectItem value="yearly">年卡</SelectItem>
                              <SelectItem value="free">免费</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          {item.status === 'extracting' && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />解析中
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <span className="text-xs text-muted-foreground">待上传</span>
                          )}
                          {item.status === 'uploading' && (
                            <span className="flex items-center gap-1 text-xs text-blue-600">
                              <Loader2 className="h-3 w-3 animate-spin" />{item.progress || '上传中'}
                            </span>
                          )}
                          {item.status === 'done' && (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle className="h-3.5 w-3.5" />完成
                            </span>
                          )}
                          {item.status === 'error' && (
                            <div className="space-y-0.5">
                              <span className="flex items-center gap-1 text-xs text-red-500">
                                <XCircle className="h-3.5 w-3.5 shrink-0" />失败
                              </span>
                              {item.error && (
                                <p className="text-[10px] text-red-400 leading-tight break-all">{item.error}</p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setBatchOpen(false)} disabled={batchRunning}>取消</Button>
            <Button
              onClick={handleBatchRun}
              disabled={batchRunning || batchItems.filter((i) => i.status === 'pending' || i.status === 'error').length === 0}
            >
              {batchRunning
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />上传中…</>
                : <><Upload className="mr-2 h-4 w-4" />开始上传全部（{batchItems.filter((i) => i.status === 'pending' || i.status === 'error').length} 个）</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
