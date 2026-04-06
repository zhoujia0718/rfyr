/**
 * 语雀/飞书等导出的 HTML 常带块级容器的 border / border-radius / box-shadow；
 * 统一去掉这些装饰，避免同一站点内有的文章有框、有的没框。
 * 表格相关元素的 border 保留（border-collapse / border-spacing 及 td/th 等）。
 */

const BORDER_KEEP_PROPS = new Set(['border-collapse', 'border-spacing'])

function shouldDropStyleProperty(prop: string): boolean {
  const p = prop.trim().toLowerCase()
  if (BORDER_KEEP_PROPS.has(p)) return false
  if (p.startsWith('border')) return true
  if (p === 'outline' || p.startsWith('outline-')) return true
  if (p === 'box-shadow' || p === '-webkit-box-shadow') return true
  if (p === 'border-radius' || p === '-webkit-border-radius') return true
  return false
}

function cleanStyleAttribute(styleContent: string): string | null {
  const parts = styleContent
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  const kept = parts.filter((decl) => {
    const prop = decl.split(':')[0]?.trim().toLowerCase() ?? ''
    return !shouldDropStyleProperty(prop)
  })
  if (kept.length === 0) return null
  return kept.join('; ')
}

const TABLE_TAGS = new Set(['TABLE', 'TD', 'TH', 'TR', 'THEAD', 'TBODY', 'TFOOT', 'COL', 'COLGROUP', 'CAPTION'])

/** 在已解析的 document 上就地清理（表格单元格等保留边框） */
export function stripBorderStylesFromDocument(doc: Document) {
  doc.querySelectorAll('*').forEach((el) => {
    if (TABLE_TAGS.has(el.tagName)) return
    const style = el.getAttribute('style')
    if (!style) return
    const cleaned = cleanStyleAttribute(style)
    if (cleaned === null) el.removeAttribute('style')
    else el.setAttribute('style', cleaned)
  })
}
