/**
 * HTML 清理模块
 * 提供安全的内容净化功能，防止 XSS 攻击
 */

// ========================
// DOMPurify 配置
// ========================

/**
 * 允许的 HTML 标签
 */
const ALLOWED_TAGS = [
  // 文本格式
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'strong', 'em', 'b', 'i', 'u', 's', 'mark', 'del', 'ins',
  'small', 'sub', 'sup',
  // 列表
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // 链接与图片
  'a', 'img',
  // 引用与代码
  'blockquote', 'pre', 'code',
  // 表格
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  // 布局
  'div', 'span',
  // 多媒体
  'video', 'audio', 'source',
  // 折叠
  'details', 'summary',
] as const

/**
 * 允许的 HTML 属性
 */
const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'class', 'id', 'style',
  'colspan', 'rowspan', 'scope',
  'width', 'height',
  'target', 'rel', 'open',
  'loading', 'decoding',
] as const

/**
 * 禁止的 HTML 标签
 */
const FORBID_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed',
  'form', 'input', 'button', 'textarea', 'select',
  'base', 'link', 'meta', 'noscript',
  'svg', 'math',
] as const

/**
 * 禁止的 HTML 属性（事件处理器）
 */
const FORBID_ATTR = [
  'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
  'onchange', 'onsubmit', 'oninput', 'onkeydown', 'onkeyup', 'onkeypress',
  'ondblclick', 'oncontextmenu', 'oncopy', 'onpaste',
  'onabort', 'oncanplay', 'oncancel', 'oncanplaythrough',
] as const

// ========================
// 类型
// ========================

export interface SanitizeOptions {
  /** 额外的允许标签 */
  extraTags?: string[]
  /** 额外的允许属性 */
  extraAttrs?: string[]
  /** 是否移除边框样式 */
  stripBorders?: boolean
  /** 自定义标签白名单 */
  allowedTags?: readonly string[]
  /** 自定义属性白名单 */
  allowedAttributes?: readonly string[]
}

export interface SanitizeResult {
  html: string
  removedCount: number
}

// ========================
// 核心清理函数
// ========================

/**
 * 清理 HTML 内容，防止 XSS 攻击
 *
 * @param raw - 原始 HTML 字符串
 * @param options - 清理选项
 * @returns 清理后的 HTML 字符串
 */
export function sanitizeHtml(raw: string, options: SanitizeOptions = {}): string {
  const content = String(raw || '')
  if (!content) return content

  const allowedTags = options.allowedTags || [...ALLOWED_TAGS, ...(options.extraTags || [])]
  const allowedAttrs = options.allowedAttributes || [...ALLOWED_ATTR, ...(options.extraAttrs || [])]

  let cleaned = content

  // ── 服务端：使用白名单标签过滤 ──────────────────────────────────────────────
  // DOMPurify 依赖 DOM API，SSR 环境下无法使用
  // 使用正则过滤不安全标签（防御性策略，非完全解决方案）
  if (typeof window === 'undefined') {
    cleaned = sanitizeOnServer(cleaned, allowedTags, allowedAttrs)
  } else {
    // 客户端：使用 DOMPurify 清理
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config: any = {
        ALLOWED_TAGS: allowedTags,
        ALLOWED_ATTR: allowedAttrs,
        FORBID_TAGS,
        FORBID_ATTR,
        ADD_ATTR: ['rel'],
        FORCE_BODY: false,
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      }
      const DOMPurify = (globalThis as unknown as { DOMPurify?: typeof import('isomorphic-dompurify').default }).DOMPurify
      if (DOMPurify) {
        cleaned = DOMPurify.sanitize(content, config) as unknown as string
      } else {
        cleaned = sanitizeOnServer(cleaned, allowedTags, allowedAttrs)
      }
    } catch {
      cleaned = sanitizeOnServer(cleaned, allowedTags, allowedAttrs)
    }
  }

  // 额外清理边框样式
  if (options.stripBorders !== false) {
    cleaned = stripBorderStyles(cleaned)
  }

  return cleaned
}

/**
 * 服务端 HTML 清理（不依赖 DOM API）
 * 使用正则表达式移除禁止标签和属性
 */
function sanitizeOnServer(
  html: string,
  allowedTags: readonly string[],
  allowedAttrs: readonly string[]
): string {
  let result = html

  // 1. 移除禁止标签（包括自闭合标签）
  for (const tag of FORBID_TAGS) {
    const regex = new RegExp(`<${tag}[^>]*>`, 'gi')
    result = result.replace(regex, '')
  }

  // 2. 移除禁止属性（包括事件处理器）
  // 使用捕获组保留空白，避免属性之间粘连
  for (const attr of FORBID_ATTR) {
    result = result.replace(new RegExp(`(\\s)${attr}\\s*=\\s*"[^"]*"`, 'gi'), '$1')
    result = result.replace(new RegExp(`(\\s)${attr}\\s*=\\s*'[^']*'`, 'gi'), '$1')
    result = result.replace(new RegExp(`(\\s)${attr}\\s*=\\s*[^\\s>]+`, 'gi'), '$1')
  }

  // 3. 清理 href/src 中的 javascript: 协议
  result = result
    .replace(/(href|src)\s*=\s*"[^"]*javascript:[^"]*"/gi, '')
    .replace(/(href|src)\s*=\s*'[^']*javascript:[^']*'/gi, '')
    .replace(/(href|src)\s*=\s*[^\s>"']*javascript:[^\s>]+/gi, '')

  // 4. 清理 href/src 中的 data: 协议
  result = result
    .replace(/(href|src)\s*=\s*"[^"]*data:[^"]*"/gi, '')
    .replace(/(href|src)\s*=\s*'[^']*data:[^']*'/gi, '')

  // 5. 限制 URL 长度（防止超长 URL 绕过）
  result = result.replace(/(href|src)\s*=\s*"([^"]{2000,})"/gi, '')

  // 6. 移除 style 中的 expression()（IE XSS）
  result = result.replace(/style\s*=\s*"[^"]*"/gi, (m) =>
    /\bexpression\s*\(/.test(m) ? '' : m
  ).replace(/style\s*=\s*'[^']*'/gi, (m) =>
    /\bexpression\s*\(/.test(m) ? '' : m
  )

  // 7. 移除 style 中的 url() 引入外部资源
  result = result.replace(/style\s*=\s*"[^"]*"/gi, (m) =>
    /url\s*\(/.test(m) ? '' : m
  ).replace(/style\s*=\s*'[^']*'/gi, (m) =>
    /url\s*\(/.test(m) ? '' : m
  )

  // 8. 按 allowedTags 白名单过滤
  // 合并基础允许标签和自定义允许标签
  const allowedTagsSet = new Set(allowedTags)
  const allowedTagsCombined = new Set([...ALLOWED_TAGS, ...allowedTagsSet])
  // 遍历 HTML 中实际存在的标签，移除不在白名单中的
  // 使用更宽泛的 regex 来找到所有标签（包括闭合标签 </tag>）
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g
  const foundTags = new Set<string>()
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = tagRegex.exec(result)) !== null) {
    foundTags.add(tagMatch[1].toLowerCase())
  }
  for (const tag of foundTags) {
    if (!allowedTagsCombined.has(tag)) {
      // 移除开标签 <tag...> 和闭标签 </tag>
      const openRegex = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi')
      result = result.replace(openRegex, '')
      const closeRegex = new RegExp(`</${tag}>`, 'gi')
      result = result.replace(closeRegex, '')
    }
  }

  // 9. 按 allowedAttrs 白名单过滤
  // 合并基础允许属性和自定义允许属性
  const allowedAttrsSet = new Set(allowedAttrs)
  const allowedAttrsCombined = new Set([...ALLOWED_ATTR, ...allowedAttrsSet])
  // 移除不在合并白名单中的已知属性
  const ALL_SERVER_ATTRS = new Set([
    'href', 'src', 'alt', 'title', 'class', 'id', 'style',
    'colspan', 'rowspan', 'scope',
    'width', 'height',
    'target', 'rel', 'open',
    'loading', 'decoding',
  ])
  for (const attr of ALL_SERVER_ATTRS) {
    if (!allowedAttrsCombined.has(attr)) {
      result = result.replace(new RegExp(`(\\s)${attr}\\s*=\\s*"[^"]*"`, 'gi'), '$1')
      result = result.replace(new RegExp(`(\\s)${attr}\\s*=\\s*'[^']*'`, 'gi'), '$1')
      result = result.replace(new RegExp(`(\\s)${attr}\\s*=\\s*[^\\s>]+`, 'gi'), '$1')
    }
  }

  return result
}

/**
 * 服务端边框样式清理（不依赖 DOM API）
 * 使用正则表达式移除装饰性边框样式，保留表格 border-collapse
 */
function stripBorderStyles(html: string): string {
  const BORDER_KEEP_PROPS = new Set([
    'border-collapse', 'border-spacing',
  ])

  function shouldDropStyleProperty(prop: string): boolean {
    const p = prop.trim().toLowerCase()
    if (BORDER_KEEP_PROPS.has(p)) return false
    if (p.startsWith('border')) return true
    if (p === 'outline' || p.startsWith('outline-')) return true
    if (p === 'box-shadow' || p === '-webkit-box-shadow') return true
    if (p === 'border-radius' || p === '-webkit-border-radius') return true
    return false
  }

  // 匹配 style="..." 属性值并清理
  const styleAttrRegex = /style\s*=\s*["']([^"']*)["']/gi

  return html.replace(styleAttrRegex, (_match, styleContent) => {
    const declarations = styleContent
      .split(';')
      .map((s: string) => s.trim())
      .filter(Boolean)

    const kept = declarations.filter((decl: string) => {
      const prop = decl.split(':')[0]?.trim().toLowerCase() ?? ''
      return !shouldDropStyleProperty(prop)
    })

    if (kept.length === 0) return ''
    return `style="${kept.join('; ')}"`
  })
}

/**
 * 深度清理 HTML（用于用户生成内容）
 */
export function deepSanitizeHtml(raw: string): string {
  return sanitizeHtml(raw, {
    stripBorders: true,
  })
}

/**
 * 安全清理（更严格，用于评论等）
 */
export function safeSanitizeHtml(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u',
      'ul', 'ol', 'li',
      'a', 'img',
      'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: ['href', 'src', 'alt', 'class', 'id'],
    stripBorders: true,
  })
}

/**
 * DOMPurify 客户端初始化
 *
 * 注意：仅在浏览器环境调用。
 * 服务端清理使用 sanitizeOnServer() 正则方案。
 */

let dompurifyInstance: typeof import('isomorphic-dompurify').default | null = null

/**
 * 初始化 DOMPurify（在客户端调用）
 */
export async function initDOMPurify(): Promise<typeof import('isomorphic-dompurify').default> {
  if (dompurifyInstance) {
    return dompurifyInstance
  }

  if (typeof window === 'undefined') {
    throw new Error('DOMPurify 只能在浏览器环境初始化')
  }

  try {
    const module = await import('isomorphic-dompurify')
    dompurifyInstance = module.default

    // 全局注册供 sanitizeHtml 同步使用
    ;(globalThis as unknown as { DOMPurify?: typeof import('isomorphic-dompurify').default }).DOMPurify = dompurifyInstance

    // 配置
    dompurifyInstance.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    })

    return dompurifyInstance
  } catch (error) {
    console.error('[initDOMPurify] 初始化失败:', error)
    throw error
  }
}

/**
 * 获取 DOMPurify 实例
 */
export function getDOMPurify(): typeof import('isomorphic-dompurify').default | null {
  return dompurifyInstance
}

/**
 * 默认清理配置
 */
export const DEFAULT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'strong', 'em', 'b', 'i', 'u', 's', 'mark', 'del', 'ins',
    'small', 'sub', 'sup',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'a', 'img',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'div', 'span',
    'video', 'audio', 'source',
    'details', 'summary',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id', 'style',
    'colspan', 'rowspan', 'scope',
    'width', 'height',
    'target', 'rel', 'open',
    'loading', 'decoding',
  ],
  FORBID_TAGS: [
    'script', 'style', 'iframe', 'object', 'embed',
    'form', 'input', 'button', 'textarea', 'select',
    'base', 'link', 'meta', 'noscript',
  ],
  FORBID_ATTR: [
    'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
    'onchange', 'onsubmit', 'oninput', 'onkeydown', 'onkeyup', 'onkeypress',
  ],
} as const
