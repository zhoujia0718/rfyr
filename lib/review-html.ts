/** 每日复盘正文：存库用 HTML、编辑区用纯文本 */

function escapeHtml(s: string): string {
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
  while ((m = re.exec(html)) !== null) {
    out.push(m[1])
  }
  return out
}

/** 从已保存的 HTML 还原为纯文本，供编辑表单使用 */
export function reviewStoredToPlainText(stored: string): string {
  if (!stored) return ""
  let s = stored
  s = s.replace(/<p[^>]*>\s*<img[^>]*>[\s\S]*?<\/p>/gi, "")
  s = s.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
  s = s.replace(/<br\s*\/?>/gi, "\n")
  s = s.replace(/<\/?p[^>]*>/gi, "")
  s = s.replace(/<[^>]+>/g, "")
  if (typeof document !== "undefined") {
    const ta = document.createElement("textarea")
    ta.innerHTML = s
    s = ta.value
  }
  return s.trim()
}
