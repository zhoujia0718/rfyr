'use client'

import * as React from 'react'
import { Search, Download, Lock, Eye, ExternalLink, X, BookOpen, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useMembership } from '@/components/membership-provider'
import { canDownloadFree, BOOK_ACCESS_LEVEL_LABELS, type BookPublic, type BookAccessLevel } from '@/lib/books'
import { toast } from 'sonner'

// ─── 封面颜色（按书名哈希取色）────────────────────────────────────────────────

const COVER_PALETTES: [string, string][] = [
  ['#1e3a5f', '#1d4ed8'],
  ['#14532d', '#15803d'],
  ['#3b0764', '#7e22ce'],
  ['#7c2d12', '#c2410c'],
  ['#164e63', '#0e7490'],
  ['#431407', '#b45309'],
  ['#1c1917', '#57534e'],
  ['#4c0519', '#be123c'],
]

function getCoverPalette(title: string): [string, string] {
  let h = 0
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0
  return COVER_PALETTES[h % COVER_PALETTES.length]
}

// ─── API 调用 ─────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (typeof window === 'undefined') return headers
  try {
    const raw = localStorage.getItem('custom_auth')
    if (!raw) return headers
    const auth = JSON.parse(raw)
    const token = auth.fakeToken || auth.session?.access_token
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (auth.user?.id) headers['X-User-Id'] = auth.user.id
  } catch { /* ignore */ }
  return headers
}

async function triggerDownload(
  bookId: string,
  password?: string,
  onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; errorCode?: string; errorMsg?: string }> {
  const res = await fetch('/api/books/download', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ bookId, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, errorCode: data.code, errorMsg: data.error ?? '下载失败' }
  }
  const { url, filename } = await res.json()

  // 尝试并行分片下载（需要七牛 CDN 已开启 CORS + Range 支持）
  // 失败时自动降级为普通单连接下载
  const parallel = await parallelDownload(url, filename ?? 'book.pdf', onProgress)
  if (!parallel) {
    window.location.href = url
  }
  return { ok: true }
}

/** 并行分片下载：将文件拆成多段并行 fetch，拼合后触发浏览器保存 */
async function parallelDownload(
  url: string,
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<boolean> {
  try {
    // HEAD 探测文件大小和 Range 支持
    const head = await fetch(url, { method: 'HEAD' })
    const totalSize = parseInt(head.headers.get('content-length') ?? '0', 10)
    const acceptRanges = head.headers.get('accept-ranges')

    // 不支持 Range 或文件太小（<2MB），走普通下载
    if (!totalSize || acceptRanges !== 'bytes' || totalSize < 2 * 1024 * 1024) {
      return false
    }

    // 按文件大小动态决定线程数（最多 16 线程，HTTP/2 多路复用下有效）
    const THREAD_COUNT = Math.min(16, Math.ceil(totalSize / (5 * 1024 * 1024)))
    const chunkSize = Math.ceil(totalSize / THREAD_COUNT)
    console.log(`[download] 文件 ${(totalSize / 1024 / 1024).toFixed(1)}MB，${THREAD_COUNT} 线程，每片 ${(chunkSize / 1024 / 1024).toFixed(1)}MB`)

    // 心跳假进度：在第一批分片完成前让进度条缓慢推进（0→15%）
    let realPct = 0
    let heartbeatPct = 0
    let heartbeat: ReturnType<typeof setInterval> | null = null
    if (onProgress) {
      onProgress(1) // 立即脱离 0%
      heartbeat = setInterval(() => {
        if (heartbeatPct < 15 && heartbeatPct >= realPct) {
          heartbeatPct += 0.5
          onProgress(Math.round(heartbeatPct))
        }
      }, 300)
    }

    const fetchChunk = async (start: number, end: number, retries = 2): Promise<ArrayBuffer> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const buf = await r.arrayBuffer()
          downloaded += buf.byteLength
          realPct = Math.round((downloaded / totalSize) * 100)
          if (realPct > heartbeatPct) onProgress?.(realPct)
          return buf
        } catch (e) {
          if (attempt === retries) throw e
        }
      }
      throw new Error('unreachable')
    }

    let downloaded = 0
    let results: PromiseSettledResult<ArrayBuffer>[]
    try {
      results = await Promise.allSettled(
        Array.from({ length: THREAD_COUNT }, (_, i) => {
          const start = i * chunkSize
          const end = Math.min(start + chunkSize - 1, totalSize - 1)
          return fetchChunk(start, end)
        })
      )
    } finally {
      if (heartbeat) clearInterval(heartbeat)
    }
    // 任一分片重试后仍失败则降级
    if (results.some(r => r.status === 'rejected')) return false
    const chunks = results.map(r => (r as PromiseFulfilledResult<ArrayBuffer>).value)

    const blob = new Blob(chunks, { type: 'application/pdf' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    return true
  } catch {
    return false // 降级为普通下载
  }
}

async function fetchPreviewUrl(
  bookId: string,
  password?: string,
): Promise<{ ok: boolean; url?: string; title?: string; errorCode?: string; errorMsg?: string }> {
  const res = await fetch('/api/books/preview', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ bookId, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, errorCode: data.code, errorMsg: data.error ?? '获取预览失败' }
  }
  const { url, title } = await res.json()
  return { ok: true, url, title }
}

// ─── 全屏 PDF 预览弹框 ────────────────────────────────────────────────────────

function PdfPreviewDialog({
  open, onClose, url, title,
}: { open: boolean; onClose: () => void; url: string; title: string }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-none w-screen h-screen p-0 m-0 rounded-none flex flex-col"
        style={{ maxWidth: '100vw', maxHeight: '100vh' }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
          <span className="text-sm font-medium text-foreground truncate max-w-[70vw]">{title}</span>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              新标签页打开
            </a>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {url && (
          <iframe src={url} className="flex-1 w-full border-0" title={title} />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── 书籍卡片（封面网格风格）─────────────────────────────────────────────────

function BookCard({ book }: { book: BookPublic }) {
  const { membershipType } = useMembership()

  const [previewDialogOpen, setPreviewDialogOpen] = React.useState(false)
  const [previewUrl, setPreviewUrl] = React.useState('')
  const [pwDialogOpen, setPwDialogOpen] = React.useState(false)
  const [pwMode, setPwMode] = React.useState<'download' | 'preview'>('download')
  const [password, setPassword] = React.useState('')
  const [errMsg, setErrMsg] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [downloadPct, setDownloadPct] = React.useState<number | null>(null)

  const freeAccess = canDownloadFree(membershipType, book.access_level)
  const isYearlyOnly = book.access_level === 'yearly'
  const [dark, light] = getCoverPalette(book.title)

  const openPasswordDialog = (mode: 'download' | 'preview') => {
    setPwMode(mode)
    setPassword('')
    setErrMsg('')
    setPwDialogOpen(true)
  }

  const handleDirectDownload = async () => {
    setLoading(true)
    setDownloadPct(0)
    const result = await triggerDownload(book.id, undefined, (pct) => setDownloadPct(pct))
    setLoading(false)
    setDownloadPct(null)
    if (!result.ok) toast.error(result.errorMsg ?? '下载失败')
    else toast.success('下载已开始')
  }

  const handleDirectPreview = async () => {
    setLoading(true)
    const result = await fetchPreviewUrl(book.id)
    setLoading(false)
    if (!result.ok) {
      if (result.errorCode === 'FILE_TOO_LARGE') {
        toast.error(result.errorMsg ?? '文件较大，请使用下载功能', { duration: 5000 })
      } else {
        toast.error(result.errorMsg ?? '预览失败')
      }
    } else {
      setPreviewUrl(result.url!)
      setPreviewDialogOpen(true)
    }
  }

  const handlePasswordConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) { setErrMsg('请输入密码'); return }
    setLoading(true)
    setErrMsg('')

    if (pwMode === 'download') {
      const result = await triggerDownload(book.id, password.trim())
      setLoading(false)
      if (!result.ok) {
        setErrMsg(result.errorCode === 'WRONG_PASSWORD' ? '密码错误，请重试' : (result.errorMsg ?? '下载失败'))
      } else {
        toast.success('下载已开始')
        setPwDialogOpen(false)
      }
    } else {
      const result = await fetchPreviewUrl(book.id, password.trim())
      setLoading(false)
      if (!result.ok) {
        if (result.errorCode === 'FILE_TOO_LARGE') {
          setPwDialogOpen(false)
          toast.error(result.errorMsg ?? '文件较大，请使用下载功能', { duration: 5000 })
        } else {
          setErrMsg(result.errorCode === 'WRONG_PASSWORD' ? '密码错误，请重试' : (result.errorMsg ?? '预览失败'))
        }
      } else {
        setPreviewUrl(result.url!)
        setPwDialogOpen(false)
        setPreviewDialogOpen(true)
      }
    }
  }

  return (
    <>
      <div className="group flex flex-col rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
        {/* 封面 */}
        <div
          className="relative aspect-[3/4] flex flex-col items-center justify-center p-4 select-none overflow-hidden"
          style={{ background: `linear-gradient(150deg, ${dark} 0%, ${light} 100%)` }}
        >
          {/* 装饰性书脊线 */}
          <div className="absolute left-0 top-0 bottom-0 w-3 opacity-20" style={{ background: 'rgba(0,0,0,0.4)' }} />

          {/* 权限标签 */}
          <div className="absolute top-2.5 right-2.5 z-10">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full backdrop-blur-sm ${
              book.access_level === 'yearly'
                ? 'bg-amber-400/90 text-amber-950'
                : book.access_level === 'monthly'
                ? 'bg-sky-400/90 text-sky-950'
                : 'bg-emerald-400/90 text-emerald-950'
            }`}>
              {BOOK_ACCESS_LEVEL_LABELS[book.access_level]}
            </span>
          </div>

          {/* 书本图标 */}
          <BookOpen className="h-8 w-8 mb-3 text-white/50 shrink-0" />

          {/* 书名 */}
          <h3 className="text-white text-sm font-bold text-center leading-snug line-clamp-4 px-1">
            {book.title}
          </h3>

          {/* 作者 */}
          {book.author && (
            <p className="mt-2 text-white/60 text-[11px] text-center line-clamp-1 px-1">
              {book.author}
            </p>
          )}

          {/* 悬停时展示简介 */}
          {book.description && (
            <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <p className="text-white text-xs text-center leading-relaxed line-clamp-[8]">
                {book.description}
              </p>
            </div>
          )}
        </div>

        {/* 操作区 */}
        <div className="flex flex-col gap-1.5 p-3">
          {freeAccess ? (
            <>
              <Button size="sm" className="w-full h-8 text-xs" onClick={handleDirectPreview} disabled={loading}>
                <Eye className="mr-1 h-3 w-3" />在线阅读
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={handleDirectDownload} disabled={loading}>
                <Download className="mr-1 h-3 w-3" />
                {downloadPct !== null ? `下载中 ${downloadPct}%` : '下载'}
              </Button>
              {downloadPct !== null && (
                <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden -mt-1">
                  <div className="h-full bg-primary transition-all duration-200" style={{ width: `${downloadPct}%` }} />
                </div>
              )}
            </>
          ) : (
            <>
              <Button size="sm" className="w-full h-8 text-xs" onClick={() => openPasswordDialog('preview')} disabled={loading}>
                <Eye className="mr-1 h-3 w-3" />在线阅读
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => openPasswordDialog('download')} disabled={loading}>
                <Lock className="mr-1 h-3 w-3" />下载
              </Button>
              {isYearlyOnly && membershipType === 'monthly' && (
                <p className="text-[10px] text-center text-muted-foreground">
                  <Crown className="inline h-3 w-3 text-amber-500" /> 年卡免密
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* 密码弹框 */}
      <Dialog
        open={pwDialogOpen}
        onOpenChange={(o) => { setPwDialogOpen(o); if (!o) { setPassword(''); setErrMsg('') } }}
      >
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{pwMode === 'preview' ? '输入密码预览' : '输入下载密码'}</DialogTitle>
            <DialogDescription className="line-clamp-1">{book.title}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasswordConfirm} className="space-y-4 pt-2">
            <div>
              <Input
                autoFocus
                placeholder="例：RFYR-A2K9"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrMsg('') }}
                className={errMsg ? 'border-red-400 focus-visible:ring-red-400' : ''}
              />
              {errMsg && <p className="mt-1.5 text-sm text-red-500">{errMsg}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '验证中…' : pwMode === 'preview' ? '确认预览' : '确认下载'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 全屏 PDF 预览 */}
      <PdfPreviewDialog
        open={previewDialogOpen}
        onClose={() => { setPreviewDialogOpen(false); setPreviewUrl('') }}
        url={previewUrl}
        title={book.title}
      />
    </>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

const FILTER_OPTIONS: { value: 'all' | BookAccessLevel; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'free', label: '免费' },
  { value: 'monthly', label: '月卡' },
  { value: 'yearly', label: '年卡' },
]

export function BooksClient({ books }: { books: BookPublic[] }) {
  const [search, setSearch] = React.useState('')
  const [filter, setFilter] = React.useState<'all' | BookAccessLevel>('all')

  const filtered = React.useMemo(() => {
    return books.filter((book) => {
      if (filter !== 'all' && book.access_level !== filter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          book.title.toLowerCase().includes(q) ||
          (book.author ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [books, search, filter])

  return (
    <div className="space-y-6">
      {/* 搜索 + 筛选 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="搜索书名、作者…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                filter === value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 书籍数量提示 */}
      {books.length > 0 && (
        <p className="text-xs text-muted-foreground">
          共 {books.length} 本{filtered.length !== books.length ? `，当前显示 ${filtered.length} 本` : ''}
        </p>
      )}

      {/* 书架网格 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-muted-foreground">
          <BookOpen className="mb-4 h-12 w-12 opacity-30" />
          <p>{search || filter !== 'all' ? '没有找到匹配的书籍' : '暂无书籍，敬请期待'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </div>
  )
}
