/**
 * DOMPurify SSR 安全封装
 * 提供服务端和客户端统一的清理接口
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// DOMPurify 实例
let dompurify: typeof import('isomorphic-dompurify').default | null = null
let initPromise: Promise<typeof import('isomorphic-dompurify').default> | null = null

// ========================
// 初始化
// ========================

/**
 * 初始化 DOMPurify（客户端一次性调用）
 */
export async function initDOMPurify(): Promise<typeof import('isomorphic-dompurify').default> {
  // 已有实例
  if (dompurify) {
    return dompurify
  }

  // 正在初始化，等待它
  if (initPromise) {
    return initPromise
  }

  // 开始初始化
  initPromise = (async () => {
    if (typeof window === 'undefined') {
      throw new Error('DOMPurify 只能在浏览器环境初始化')
    }

    const module = await import('isomorphic-dompurify')
    dompurify = module.default

    // 添加 hook：确保链接安全
    dompurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    })

    return dompurify
  })()

  return initPromise
}

/**
 * 检查 DOMPurify 是否已初始化
 */
export function isDOMPurifyReady(): boolean {
  return dompurify !== null
}

// ========================
// React Hook
// ========================

/**
 * DOMPurify 清理配置
 */
export interface DOMPurifyConfig {
  /** 允许的标签 */
  ALLOWED_TAGS?: string[]
  /** 允许的属性 */
  ALLOWED_ATTR?: string[]
  /** 禁止的标签 */
  FORBID_TAGS?: string[]
  /** 禁止的属性 */
  FORBID_ATTR?: string[]
}

/**
 * React Hook：使用 DOMPurify 清理 HTML
 */
export function useDOMPurify() {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    initDOMPurify()
      .then(() => setIsReady(true))
      .catch((err) => {
        setError(err)
      })
  }, [])

  /**
   * 清理 HTML
   */
  const sanitize = useCallback(
    (html: string, config?: DOMPurifyConfig): string => {
      if (!dompurify) {
        return html
      }

      if (config) {
        return dompurify.sanitize(html, config as Parameters<typeof dompurify.sanitize>[1])
      }

      return dompurify.sanitize(html)
    },
    []
  )

  /**
   * 深度清理（更严格）
   */
  const deepSanitize = useCallback((html: string): string => {
    if (!dompurify) {
      return html
    }

    return dompurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'b', 'i', 'u',
        'ul', 'ol', 'li',
        'a', 'img',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'div', 'span',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'id', 'style', 'target', 'rel'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    })
  }, [])

  return {
    isReady,
    error,
    sanitize,
    deepSanitize,
  }
}

// ========================
// 工具函数
// ========================

/**
 * 同步清理（仅客户端使用）
 */
export function sanitizeHtmlSync(html: string, config?: DOMPurifyConfig): string {
  if (!dompurify) {
    return html
  }

  if (config) {
    return dompurify.sanitize(html, config as Parameters<typeof dompurify.sanitize>[1])
  }

  return dompurify.sanitize(html)
}

/**
 * 异步清理（可在服务端调用）
 */
export async function sanitizeHtmlAsync(
  html: string,
  config?: DOMPurifyConfig
): Promise<string> {
  if (dompurify) {
    return sanitizeHtmlSync(html, config)
  }

  // 等待初始化
  await initDOMPurify()
  return sanitizeHtmlSync(html, config)
}

// ========================
// 默认配置
// ========================

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
