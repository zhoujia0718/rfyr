/** 每日复盘正文：存库用 HTML、编辑区用纯文本 */

// 服务端安全的 HTML Entity 解码（不依赖 DOM）
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** 将 textarea 中的纯文本转为段落 HTML（空行分段，段内换行用 br） */
export function plainTextToReviewHtml(text: string): string {
  const t = text.trim()
  if (!t) return ""
  const blocks = t.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  const parts = blocks.length > 0 ? blocks : [t]
  return parts
    .map((block) => {
      const withBr = escapeHtml(block).replace(/\n/g, "<br />")
      return `<p>${withBr}</p>`
    })
    .join("")
}

/** 从已保存正文中提取 data URL 图片，供编辑时回填截图区 */
export function extractReviewDataUrlImages(html: string): string[] {
  if (!html) return []
  const re = /src="(data:image[^"]+)"/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  // P-M8-07 FIX: 每次调用前重置 lastIndex，防止多文档共享正则状态导致遗漏
  re.lastIndex = 0
  while ((m = re.exec(html)) !== null) {
    out.push(m[1])
  }
  return out
}

/** 从已保存的 HTML 还原为纯文本，供编辑表单使用 */
// P-M8-06 FIX: 添加服务端安全的 HTML Entity 解码，不依赖 DOM
export function reviewStoredToPlainText(stored: string): string {
  if (!stored) return ""
  let s = stored
  s = s.replace(/<p[^>]*>\s*<img[^>]*>[\s\S]*?<\/p>/gi, "")
  s = s.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
  s = s.replace(/<br\s*\/?>/gi, "\n")
  s = s.replace(/<\/?p[^>]*>/gi, "")
  s = s.replace(/<[^>]+>/g, "")
  // 服务端安全的 HTML Entity 解码
  s = decodeHtmlEntities(s)
  return s.trim()
}
