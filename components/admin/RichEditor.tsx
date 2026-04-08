'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { FileUp, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@supabase/supabase-js'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import type { EditorView } from '@tiptap/pm/view'

const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA'

const supabase = createClient(supabaseUrl, supabaseKey)

/** 把 Storage / fetch 失败转成用户可操作的提示（含扩展劫持 fetch 的常见情况） */
function describeStorageUploadFailure(error: unknown): string {
  const e = error as { message?: string; name?: string }
  const raw = (e?.message || String(error || "")).trim()
  const lower = raw.toLowerCase()
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  ) {
    return (
      "无法连接 Supabase 存储（Failed to fetch）。请先：① 用无痕窗口重试，或暂时关闭会拦截网页请求的浏览器扩展；② 确认本机网络能访问 Supabase；③ 若在公司网络，检查代理/防火墙。"
    )
  }
  return raw || "上传失败，请打开开发者工具 Console 查看详情"
}

/** 语雀/飞书等剪贴板 HTML 常含这些 CDN，防盗链会导致编辑器里裂图 */
const YUQUE_LIKE_PASTE_RE =
  /nlark\.com|yuque\.com|larkoffice|alipayobjects|alicdn\.com|feishu\.cn|larksuite/i

function isLikelyYuqueOrLarkPasteHtml(html: string): boolean {
  return YUQUE_LIKE_PASTE_RE.test(html)
}

function normalizeImgSrcToAbsolute(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = raw.trim()
  if (t.startsWith('//')) return `https:${t}`
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  return null
}

function pruneInvalidImageNodes(doc: Document) {
  doc.querySelectorAll('img').forEach((img) => {
    const src = (img.getAttribute('src') || '').trim().toLowerCase()
    const fallback =
      (img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-lazy-src') ||
        img.getAttribute('data-url') ||
        '')
        .trim()
        .toLowerCase()

    const candidate = src || fallback
    const isInvalid =
      !candidate ||
      candidate.startsWith('file:') ||
      candidate.startsWith('cid:') ||
      candidate.startsWith('applewebdata:') ||
      candidate.startsWith('blob:')

    if (isInvalid) img.remove()
  })
}

async function fetchImageBlobForEditorPaste(url: string): Promise<Blob> {
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (r.ok) {
      const ct = r.headers.get('content-type') || ''
      if (ct.startsWith('image/')) return await r.blob()
    }
  } catch {
    // 常为 CORS，改走本站代理
  }
  const r = await fetch('/api/fetch-external-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!r.ok) {
    const err = await r.text()
    throw new Error(err || 'proxy failed')
  }
  return r.blob()
}

interface RichEditorProps {
  initialContent?: string
  initialPdfUrl?: string
  initialPdfOriginalName?: string
  initialHtmlUrl?: string
  initialHtmlOriginalName?: string
  onContentChange?: (content: string) => void
  onPdfChange?: (pdfUrl: string) => void
  onPdfOriginalNameChange?: (pdfOriginalName: string) => void
  onHtmlChange?: (htmlUrl: string) => void
  onHtmlOriginalNameChange?: (htmlOriginalName: string) => void
  onSave?: (content: string, pdfUrl: string, pdfOriginalName: string) => void
}

const RichEditor: React.FC<RichEditorProps> = ({
  initialContent = '',
  initialPdfUrl = '',
  initialPdfOriginalName = '',
  initialHtmlUrl = '',
  initialHtmlOriginalName = '',
  onContentChange,
  onPdfChange,
  onPdfOriginalNameChange,
  onHtmlChange,
  onHtmlOriginalNameChange,
  onSave
}) => {
  const [pdfUrl, setPdfUrl] = React.useState(initialPdfUrl)
  const [originalPdfFileName, setOriginalPdfFileName] = React.useState(initialPdfOriginalName)
  const [htmlUrl, setHtmlUrl] = React.useState(initialHtmlUrl)
  const [originalHtmlFileName, setOriginalHtmlFileName] = React.useState(initialHtmlOriginalName)
  const [isUploading, setIsUploading] = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const [isPdfUploading, setIsPdfUploading] = React.useState(false)
  const [pdfUploadProgress, setPdfUploadProgress] = React.useState(0)
  const [isHtmlUploading, setIsHtmlUploading] = React.useState(false)
  const [htmlUploadProgress, setHtmlUploadProgress] = React.useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [deleteClickCount, setDeleteClickCount] = React.useState(0)
  const [deleteClickTimer, setDeleteClickTimer] = React.useState<NodeJS.Timeout | null>(null)
  const pdfUrlRef = React.useRef(pdfUrl)
  pdfUrlRef.current = pdfUrl
  const htmlUrlRef = React.useRef(htmlUrl)
  htmlUrlRef.current = htmlUrl
  const initialContentRef = React.useRef(initialContent)
  initialContentRef.current = initialContent
  const onContentChangeRef = React.useRef(onContentChange)
  onContentChangeRef.current = onContentChange
  const onPdfChangeRef = React.useRef(onPdfChange)
  onPdfChangeRef.current = onPdfChange
  const onPdfOriginalNameChangeRef = React.useRef(onPdfOriginalNameChange)
  onPdfOriginalNameChangeRef.current = onPdfOriginalNameChange
  const onHtmlChangeRef = React.useRef(onHtmlChange)
  onHtmlChangeRef.current = onHtmlChange
  const onHtmlOriginalNameChangeRef = React.useRef(onHtmlOriginalNameChange)
  onHtmlOriginalNameChangeRef.current = onHtmlOriginalNameChange
  const pdfFileInputRef = React.useRef<HTMLInputElement>(null)
  const htmlFileInputRef = React.useRef<HTMLInputElement>(null)
  const pdfInputId = React.useId()
  const htmlInputId = React.useId()
  const editorRef = React.useRef<Editor | null>(null)

  // 监听初始PDF URL变化
  React.useEffect(() => {
    setPdfUrl(initialPdfUrl)
  }, [initialPdfUrl])

  // 监听初始HTML URL变化
  React.useEffect(() => {
    setHtmlUrl(initialHtmlUrl)
  }, [initialHtmlUrl])

  // 组件初始化时的处理
  React.useEffect(() => {
    // 优先使用initialPdfOriginalName作为原始文件名
    // 如果没有提供，则尝试从本地存储中获取
    // 最后才从URL中提取
    if (initialPdfOriginalName) {
      setOriginalPdfFileName(initialPdfOriginalName)
      // 保存到本地存储
      localStorage.setItem(`pdf_original_name_${initialPdfUrl}`, initialPdfOriginalName)
    } else if (initialPdfUrl) {
      // 尝试从本地存储中获取原始文件名
      const storedOriginalName = localStorage.getItem(`pdf_original_name_${initialPdfUrl}`)
      if (storedOriginalName) {
        setOriginalPdfFileName(storedOriginalName)
      } else {
        // 从URL中提取文件名
        const urlParts = initialPdfUrl.split('/')
        const fileName = urlParts[urlParts.length - 1]
        setOriginalPdfFileName(fileName)
      }
    } else {
      setOriginalPdfFileName('')
    }
  }, [initialPdfOriginalName, initialPdfUrl])

  // 组件初始化时的处理 - HTML原始文件名
  React.useEffect(() => {
    if (initialHtmlOriginalName) {
      setOriginalHtmlFileName(initialHtmlOriginalName)
      localStorage.setItem(`html_original_name_${initialHtmlUrl}`, initialHtmlOriginalName)
    } else if (initialHtmlUrl) {
      const storedOriginalName = localStorage.getItem(`html_original_name_${initialHtmlUrl}`)
      if (storedOriginalName) {
        setOriginalHtmlFileName(storedOriginalName)
      } else {
        const urlParts = initialHtmlUrl.split('/')
        const fileName = urlParts[urlParts.length - 1]
        setOriginalHtmlFileName(fileName)
      }
    } else {
      setOriginalHtmlFileName('')
    }
  }, [initialHtmlOriginalName, initialHtmlUrl])

  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  const normalizeInitialContent = (value: string) => {
    const v = value || ''
    const trimmed = v.trim()
    if (!trimmed) return ''
    // 如果看起来是 HTML，就直接用；否则当作纯文本处理
    if (trimmed.startsWith('<')) return trimmed
    return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br/>')}</p>`
  }

  /**
   * 从网页/文档复制「文字 + 图片」时，剪贴板里往往同时有 text/html 和 image/png 预览位图。
   * 若只要检测到图片就拦截粘贴，会 preventDefault 掉整次粘贴，正文丢失且只能插入一张预览图。
   * 在存在可交给 ProseMirror 解析的 HTML 时，应走默认粘贴（TipTap 会从 HTML 里解析出图片与段落）。
   */
  const shouldDelegateHtmlPasteToEditor = (htmlRaw: string): boolean => {
    const trimmed = htmlRaw.trim()
    if (!trimmed) return false
    // 截图粘贴常带 <p><img src=blob:...>，若交给默认粘贴 blob 会很快失效 → 灰块；必须走上方自定义分支
    if (/blob:|data:image/i.test(trimmed)) return false
    try {
      const doc = new DOMParser().parseFromString(trimmed, 'text/html')
      const body = doc.body
      const text = (body.textContent || '').replace(/\u00a0/g, ' ').trim()
      if (text.length > 0) return true
      if (
        body.querySelector(
          'p, li, table, h1, h2, h3, h4, h5, h6, article, section, blockquote, pre, ul, ol'
        )
      ) {
        return true
      }
      for (const img of Array.from(body.querySelectorAll('img'))) {
        const src = img.getAttribute('src') || ''
        if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return true
      }
      return false
    } catch {
      return true
    }
  }

  const pasteClipboardImagesSequentially = async (
    view: EditorView,
    items: DataTransferItem[],
    upload: (file: File) => Promise<string | null>
  ) => {
    const imageNodeType = view.state.schema.nodes.image
    if (!imageNodeType) return

    for (const item of items) {
      if (!item.type?.startsWith('image/')) continue
      const file = item.getAsFile()
      if (!file) continue
      const publicUrl = await upload(file)
      if (!publicUrl) continue
      const node = imageNodeType.create({ src: publicUrl, alt: file.name || 'image' })
      const { state } = view
      const tr = state.tr.replaceSelectionWith(node, false)
      view.dispatch(tr)
    }
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    setIsUploading(true)
    setUploadProgress(0)

    try {
      // 生成唯一文件名（剪贴板图片常无扩展名，避免 image_xxx.undefined）
      const timestamp = Date.now()
      const fromName = file.name.split('.').pop()
      let ext =
        fromName && !fromName.includes('/') && fromName.length <= 8
          ? fromName.replace(/jpeg/i, 'jpg')
          : ''
      if (!ext && file.type?.startsWith('image/')) {
        ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
      }
      if (!ext) ext = 'png'
      const fileName = `image_${timestamp}.${ext}`

      // 上传到 article-images 存储桶
      const { data, error } = await supabase.storage
        .from('article-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (error) {
        console.error('上传图片到 Supabase 失败:', error)
        toast.error(`图片上传失败：${(error as Error).message || '请检查 Storage 权限与桶配置'}`)
        throw error
      }

      // 先尝试生成 signed URL（兼容 bucket 不是 public 的情况）
      // 如果签名失败，则退回 publicUrl
      const bucket = supabase.storage.from('article-images')

      // 正文持久化必须用长期有效地址；优先公开 URL，避免把 60 秒临时签名写进数据库
      const { data: pub } = bucket.getPublicUrl(fileName)
      if (pub.publicUrl) return pub.publicUrl

      const { data: signedData, error: signedErr } = await bucket.createSignedUrl(
        fileName,
        60 * 60 * 24 * 365 * 10
      )
      if (signedData?.signedUrl && !signedErr) return signedData.signedUrl

      return pub.publicUrl
    } catch (error) {
      console.error('上传图片失败:', error)
      return null
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const uploadImageRef = React.useRef(uploadImage)
  uploadImageRef.current = uploadImage

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        // 无表格扩展时，粘贴的 <table> 会变成灰色块；TableKit 含 table / row / cell / header
        TableKit.configure({
          table: { resizable: false },
        }),
        Image.configure({
          // 默认块级 image 不能放在 <p> 里，浏览器粘贴多是 <p><img></p>，会被丢弃
          inline: true,
          allowBase64: true,
          HTMLAttributes: {
            class: 'max-w-full h-auto align-middle rounded-sm',
            // 语雀 CDN 等会校验 Referer，无此项时浏览器里 <img> 可能裂图
            referrerPolicy: 'no-referrer',
          },
        }),
      ],
      // 解决 TipTap 在 SSR/水合阶段触发的 hydration mismatch
      immediatelyRender: false,
      content: normalizeInitialContent(initialContent),
      onCreate: ({ editor }) => {
        editorRef.current = editor
      },
      onDestroy: () => {
        editorRef.current = null
      },
      onUpdate: ({ editor }) => {
        // 只在没有选择 PDF 时同步内容；PDF 模式下编辑器会被隐藏/清空
        if (pdfUrlRef.current) return
        onContentChangeRef.current?.(editor.getHTML())
      },
      editorProps: {
        transformPastedHTML(html) {
          try {
            const doc = new DOMParser().parseFromString(html, 'text/html')
            doc.querySelectorAll('img').forEach((img) => {
              let src = img.getAttribute('src')?.trim()
              if (!src) {
                src =
                  img.getAttribute('data-src') ||
                  img.getAttribute('data-original') ||
                  img.getAttribute('data-lazy-src') ||
                  img.getAttribute('data-url') ||
                  ''
              }
              if (src) {
                const abs = normalizeImgSrcToAbsolute(src)
                if (abs) img.setAttribute('src', abs)
              }
            })
            pruneInvalidImageNodes(doc)
            return doc.body.innerHTML
          } catch {
            return html
          }
        },
        handlePaste: (view, event) => {
          if (pdfUrlRef.current) return false
          const clipboardData = event.clipboardData
          const items = clipboardData?.items
          if (!items || items.length === 0) return false

          const htmlRaw = clipboardData.getData('text/html') || ''

          const imageItems: DataTransferItem[] = []
          for (const item of Array.from(items)) {
            if (item.type && item.type.startsWith('image/')) {
              imageItems.push(item)
            }
          }

          // 语雀等：CDN 防盗链 + 剪贴板 HTML 仍带 nlark 地址 → 拉取后转存 Supabase，读者端才能稳定显示
          if (htmlRaw && /<img/i.test(htmlRaw) && isLikelyYuqueOrLarkPasteHtml(htmlRaw)) {
            event.preventDefault()
            void (async () => {
              const ed = editorRef.current
              if (!ed) return
              const parsed = new DOMParser().parseFromString(htmlRaw, 'text/html')
              const imgs = Array.from(parsed.querySelectorAll('img'))
              let failed = 0
              for (const img of imgs) {
                let raw =
                  img.getAttribute('src')?.trim() ||
                  img.getAttribute('data-src') ||
                  img.getAttribute('data-original') ||
                  img.getAttribute('data-lazy-src') ||
                  ''
                const abs = normalizeImgSrcToAbsolute(raw)
                if (!abs || abs.startsWith('data:') || abs.startsWith('blob:')) continue
                try {
                  const blob = await fetchImageBlobForEditorPaste(abs)
                  const mime = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png'
                  const sub = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
                  const file = new File([blob], `yuque.${sub}`, { type: mime })
                  let uploaded: string | null = null
                  try {
                    uploaded = await uploadImageRef.current(file)
                  } catch {
                    uploaded = null
                  }
                  if (uploaded) img.setAttribute('src', uploaded)
                  else failed++
                } catch {
                  failed++
                }
              }
              if (failed > 0) {
                toast.warning(`有 ${failed} 张图片未能转存，可改截图粘贴或检查网络`)
              }
              pruneInvalidImageNodes(parsed)
              ed.chain().focus().insertContent(parsed.body.innerHTML).run()
            })()
            return true
          }

          // Word/部分客户端：HTML 里 img 是 file:// / cid:，但剪贴板另有 image/* 文件，按顺序替换后插入
          if (htmlRaw && /<img/i.test(htmlRaw) && imageItems.length > 0) {
            const parsed = new DOMParser().parseFromString(htmlRaw, 'text/html')
            const imgs = Array.from(parsed.querySelectorAll('img'))
            const onlyBrokenSrc =
              imgs.length > 0 &&
              imgs.every((img) => {
                const s = (img.getAttribute('src') || '').trim().toLowerCase()
                const hasLazy =
                  img.getAttribute('data-src') ||
                  img.getAttribute('data-original') ||
                  img.getAttribute('data-lazy-src')
                if (!s && hasLazy) return false
                return (
                  !s ||
                  s.startsWith('file:') ||
                  s.startsWith('cid:') ||
                  s.startsWith('applewebdata:')
                )
              })
            if (onlyBrokenSrc) {
              event.preventDefault()
              void (async () => {
                const ed = editorRef.current
                if (!ed) return
                for (let i = 0; i < Math.min(imgs.length, imageItems.length); i++) {
                  const file = imageItems[i].getAsFile()
                  if (!file) continue
                  const url = await uploadImageRef.current(file)
                  if (url) imgs[i].setAttribute('src', url)
                }
                pruneInvalidImageNodes(parsed)
                ed.chain().focus().insertContent(parsed.body.innerHTML).run()
              })()
              return true
            }
          }

          // HTML 内嵌 blob/data 图片：默认粘贴后链接会失效或无法入库，先上传再插入
          // 注意：部分浏览器写 src=blob:... 无引号，不能用 /src=["'](blob:)/ 单独匹配
          if (htmlRaw && /<img/i.test(htmlRaw) && /blob:|data:image/i.test(htmlRaw)) {
            event.preventDefault()
            void (async () => {
              const ed = editorRef.current
              if (!ed) return
              const parsed = new DOMParser().parseFromString(htmlRaw, 'text/html')
              const imgs = Array.from(parsed.querySelectorAll('img'))
              let clipIdx = 0
              for (const img of imgs) {
                const src = (img.getAttribute('src') || '').trim()
                if (!src.startsWith('blob:') && !src.startsWith('data:')) continue
                let uploaded: string | null = null
                try {
                  const res = await fetch(src)
                  const blob = await res.blob()
                  const sub = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
                  const file = new File([blob], `paste.${sub}`, { type: blob.type || 'image/png' })
                  try {
                    uploaded = await uploadImageRef.current(file)
                  } catch {
                    uploaded = null
                  }
                } catch (e) {
                  console.warn('blob 拉取失败，尝试剪贴板 image/* 文件:', e)
                }
                if (!uploaded && clipIdx < imageItems.length) {
                  const file = imageItems[clipIdx++]?.getAsFile()
                  if (file) {
                    try {
                      uploaded = await uploadImageRef.current(file)
                    } catch {
                      uploaded = null
                    }
                  }
                }
                if (uploaded) img.setAttribute('src', uploaded)
              }
              pruneInvalidImageNodes(parsed)
              ed.chain().focus().insertContent(parsed.body.innerHTML).run()
            })()
            return true
          }

          if (shouldDelegateHtmlPasteToEditor(htmlRaw)) {
            return false
          }

          if (imageItems.length === 0) return false

          event.preventDefault()
          void pasteClipboardImagesSequentially(view, imageItems, (f) => uploadImageRef.current(f))

          return true
        },
      },
    },
    // 当切换文章时，重新初始化内容
    [initialContent]
  )

  // 切换 PDF 模式：清空富文本，避免提交时 content 和 pdfUrl 冲突。
  // 必须在 editor 就绪后再调用 onContentChange；否则 editor 为 null 时会误传 ''，把父组件 formData.content 清空。
  // 回调经 ref 调用，依赖数组保持固定长度，避免 React 19 对 deps 长度校验报错。
  React.useEffect(() => {
    if (!editor) return

    const notifyContent = onContentChangeRef.current
    if (pdfUrl) {
      editor.commands.setContent('')
      notifyContent?.('')
    } else {
      editor.commands.setContent(normalizeInitialContent(initialContentRef.current))
      notifyContent?.(editor.getHTML())
    }
  }, [pdfUrl, editor])

  const handlePdfFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      void handlePdfUpload(file)
    }
    e.target.value = ''
  }

  const handlePdfUpload = async (file: File) => {
    setIsPdfUploading(true)
    setPdfUploadProgress(0)

    try {
      // 保存原始文件名
      const originalFileName = file.name
      setOriginalPdfFileName(originalFileName)
      
      // 处理文件名，确保符合Supabase Storage要求
      // 使用时间戳作为文件名，确保唯一性和兼容性
      const timestamp = Date.now()
      const extension = file.name.split('.').pop() || 'pdf'
      const safeFileName = `file_${timestamp}.${extension}`
      const filePath = safeFileName

      const { data, error } = await supabase.storage
        .from('article-pdfs')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true, // 允许覆盖同名文件
        })

      if (error) {
        console.error('上传PDF失败:', error)
        throw error
      }

      // 获取公共URL
      const { data: urlData } = supabase.storage
        .from('article-pdfs')
        .getPublicUrl(safeFileName)

      const publicUrl = urlData.publicUrl

      setPdfUrl(publicUrl)
      setOriginalPdfFileName(originalFileName)

      localStorage.setItem(`pdf_original_name_${publicUrl}`, originalFileName)

      onPdfChangeRef.current?.(publicUrl)

      // 调用onPdfOriginalNameChange更新原始文件名
      onPdfOriginalNameChangeRef.current?.(originalFileName)
      
      // 清空编辑器内容
      editor?.commands.setContent('')
      onContentChangeRef.current?.('')
    } catch (error) {
      console.error('上传PDF失败:', error)
      toast.error(describeStorageUploadFailure(error))
    } finally {
      setIsPdfUploading(false)
      setPdfUploadProgress(0)
    }
  }

  const handleRemovePdf = () => {
    // 实现双击确认删除功能
    setDeleteClickCount(prev => {
      if (prev === 0) {
        // 第一次点击，设置计时器
        setShowDeleteConfirm(true)
        const timer = setTimeout(() => {
          setDeleteClickCount(0)
          setShowDeleteConfirm(false)
        }, 2000) // 2秒内必须再次点击
        setDeleteClickTimer(timer)
        return 1
      } else {
        // 第二次点击，执行删除
        if (deleteClickTimer) {
          clearTimeout(deleteClickTimer)
        }
        setPdfUrl('')
        setOriginalPdfFileName('')
        if (pdfFileInputRef.current) pdfFileInputRef.current.value = ''
        setShowDeleteConfirm(false)
        setDeleteClickCount(0)
        return 0
      }
    })
  }

  // 监听pdfUrl变化：
  // - 避免在“初次挂载（pdfUrl 初始为空）”时就触发父组件 setState
  // - 仅当 pdfUrl 从“有值 -> 被清空”时才同步给父组件
  const prevPdfUrlRef = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    const prevPdfUrl = prevPdfUrlRef.current
    prevPdfUrlRef.current = pdfUrl

    if (prevPdfUrl && pdfUrl === '') {
      onPdfChangeRef.current?.('')
      onPdfOriginalNameChangeRef.current?.('')
    }
  }, [pdfUrl])

  // 监听htmlUrl变化：同上
  const prevHtmlUrlRef = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    const prevHtmlUrl = prevHtmlUrlRef.current
    prevHtmlUrlRef.current = htmlUrl

    if (prevHtmlUrl && htmlUrl === '') {
      onHtmlChangeRef.current?.('')
      onHtmlOriginalNameChangeRef.current?.('')
    }
  }, [htmlUrl])

  const handleHtmlFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'html' || ext === 'htm') {
        void handleHtmlUpload(file)
      } else {
        toast.error('请选择 .html 或 .htm 文件')
      }
    }
    e.target.value = ''
  }

  const handleHtmlUpload = async (file: File) => {
    setIsHtmlUploading(true)
    setHtmlUploadProgress(0)

    try {
      const originalFileName = file.name
      const timestamp = Date.now()
      const ext = file.name.split('.').pop()?.toLowerCase() || 'html'
      const safeFileName = `file_${timestamp}.${ext}`

      // 必须指定 text/html，否则 Storage 可能按 text/plain 返回，浏览器只显示源码不渲染页面
      const { error } = await supabase.storage
        .from('article-pdfs')
        .upload(safeFileName, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'text/html; charset=utf-8',
        })

      if (error) {
        console.error('上传HTML失败:', error)
        throw error
      }

      const { data: urlData } = supabase.storage
        .from('article-pdfs')
        .getPublicUrl(safeFileName)

      const publicUrl = urlData.publicUrl

      setHtmlUrl(publicUrl)
      setOriginalHtmlFileName(originalFileName)

      localStorage.setItem(`html_original_name_${publicUrl}`, originalFileName)

      onHtmlChangeRef.current?.(publicUrl)
      onHtmlOriginalNameChangeRef.current?.(originalFileName)

      editor?.commands.setContent('')
      onContentChangeRef.current?.('')
    } catch (error) {
      console.error('上传HTML失败:', error)
      toast.error(describeStorageUploadFailure(error))
    } finally {
      setIsHtmlUploading(false)
      setHtmlUploadProgress(0)
    }
  }

  const handleRemoveHtml = () => {
    setDeleteClickCount(prev => {
      if (prev === 0) {
        setShowDeleteConfirm(true)
        const timer = setTimeout(() => {
          setDeleteClickCount(0)
          setShowDeleteConfirm(false)
        }, 2000)
        setDeleteClickTimer(timer)
        return 1
      } else {
        if (deleteClickTimer) clearTimeout(deleteClickTimer)
        setHtmlUrl('')
        setOriginalHtmlFileName('')
        if (htmlFileInputRef.current) htmlFileInputRef.current.value = ''
        setShowDeleteConfirm(false)
        setDeleteClickCount(0)
        return 0
      }
    })
  }

  return (
    <div className="w-full">
      {/* PDF：单行按钮，与上方表单项风格一致 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium text-gray-700 shrink-0">PDF</span>
        <input
          ref={pdfFileInputRef}
          id={pdfInputId}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handlePdfFileSelect}
          className="hidden"
          tabIndex={-1}
        />
        {!pdfUrl ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={isPdfUploading}
              onClick={() => pdfFileInputRef.current?.click()}
            >
              {isPdfUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  上传中…
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  上传 PDF
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">可选；上传后以 PDF 展示正文</span>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm">
            {isPdfUploading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                上传中…
              </span>
            ) : (
              <>
                <span className="font-medium text-green-700 shrink-0">已上传</span>
                <span
                  className="min-w-0 max-w-[min(100%,280px)] truncate text-muted-foreground"
                  title={originalPdfFileName || pdfUrl}
                >
                  {originalPdfFileName || pdfUrl.split('/').pop()}
                </span>
                <Button variant="link" size="sm" className="h-auto shrink-0 px-1 py-0" asChild>
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                    打开
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-destructive hover:text-destructive"
                  onClick={handleRemovePdf}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  {showDeleteConfirm ? '再次点击确认删除' : '删除'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* HTML：单行按钮，与 PDF 平级 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium text-gray-700 shrink-0">HTML</span>
        <input
          ref={htmlFileInputRef}
          id={htmlInputId}
          type="file"
          accept=".html,.htm,text/html"
          onChange={handleHtmlFileSelect}
          className="hidden"
          tabIndex={-1}
        />
        {!htmlUrl ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={isHtmlUploading}
              onClick={() => htmlFileInputRef.current?.click()}
            >
              {isHtmlUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  上传中…
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  上传 HTML
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">可选；上传后以 iframe 展示正文</span>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm">
            {isHtmlUploading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                上传中…
              </span>
            ) : (
              <>
                <span className="font-medium text-green-700 shrink-0">已上传</span>
                <span
                  className="min-w-0 max-w-[min(100%,280px)] truncate text-muted-foreground"
                  title={originalHtmlFileName || htmlUrl}
                >
                  {originalHtmlFileName || htmlUrl.split('/').pop()}
                </span>
                <Button variant="link" size="sm" className="h-auto shrink-0 px-1 py-0" asChild>
                  <a href={htmlUrl} target="_blank" rel="noopener noreferrer">
                    打开
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-destructive hover:text-destructive"
                  onClick={handleRemoveHtml}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  {showDeleteConfirm ? '再次点击确认删除' : '删除'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 富文本编辑器 */}
      {!pdfUrl && !htmlUrl && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-4">内容编辑</h3>
          <div className="border border-gray-200 rounded-md bg-white">
            {editor ? (
              <EditorContent
                editor={editor}
                className="min-h-[300px] p-4 [&_img]:max-w-full [&_img]:h-auto [&_img]:align-middle [&_table]:border-collapse [&_table]:border [&_table]:border-gray-300 [&_td]:border [&_td]:border-gray-300 [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_th]:bg-gray-100 [&_.ProseMirror-selectednode]:outline [&_.ProseMirror-selectednode]:outline-2 [&_.ProseMirror-selectednode]:outline-blue-400"
              />
            ) : (
              <div className="min-h-[300px] p-4 text-gray-500">加载编辑器中...</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default RichEditor
