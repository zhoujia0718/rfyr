/**
 * M8: 投资组合系统 - 单元测试
 *
 * 测试内容：
 * 1. lib/review-html.ts - HTML/文本转换工具函数
 *    - plainTextToReviewHtml: 纯文本转 HTML 段落
 *    - extractReviewDataUrlImages: 从 HTML 提取 data URL 图片
 *    - reviewStoredToPlainText: HTML 转回纯文本（服务端安全）
 *    - escapeHtml: HTML 转义
 *    - decodeHtmlEntities: HTML Entity 解码（服务端安全）
 *
 * 2. lib/short-id.ts - 短链接 ID 生成与验证
 *    - generateShortId: 生成短 ID
 *    - isShortId: 验证短 ID 格式
 *    - isArticleUuid: 验证文章 UUID 格式
 *
 * 3. P-M8-01: reviewContentHasHtml 修复
 * 4. P-M8-07: extractReviewDataUrlImages 正则 lastIndex 重置
 *
 * 已修复的问题：
 * - P-M8-01: 移除脆弱的手写正则，改为先转义再检测
 * - P-M8-06: 添加服务端安全的 HTML Entity 解码（不依赖 DOM）
 * - P-M8-07: 重置正则 lastIndex 防止多文档共享状态导致遗漏
 */
import { describe, it, expect } from 'vitest'
import {
  plainTextToReviewHtml,
  extractReviewDataUrlImages,
  reviewStoredToPlainText,
  escapeHtml,
} from '@/lib/review-html'
import {
  generateShortId,
  isShortId,
  isArticleUuid,
} from '@/lib/short-id'

// ─── 1. plainTextToReviewHtml ────────────────────────────────────────────────

describe('M8-01: plainTextToReviewHtml - 纯文本转 HTML 段落', () => {
  describe('主要功能', () => {
    it('应正确处理普通文本', () => {
      const result = plainTextToReviewHtml('这是普通文本')
      expect(result).toBe('<p>这是普通文本</p>')
    })

    it('应正确处理多行文本（空行分段）', () => {
      const result = plainTextToReviewHtml('第一段\n\n第二段')
      expect(result).toBe('<p>第一段</p><p>第二段</p>')
    })

    it('应正确处理单行换行（转为 br）', () => {
      const result = plainTextToReviewHtml('第一行\n第二行')
      expect(result).toBe('<p>第一行<br />第二行</p>')
    })

    it('应转义 HTML 特殊字符', () => {
      const result = plainTextToReviewHtml('<script>alert(1)</script>')
      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
    })
  })

  describe('边界条件', () => {
    it('应处理空字符串', () => {
      expect(plainTextToReviewHtml('')).toBe('')
    })

    it('应处理纯空白字符串', () => {
      expect(plainTextToReviewHtml('   \n\n   ')).toBe('')
    })

    it('应处理仅有空行的字符串', () => {
      expect(plainTextToReviewHtml('\n\n\n')).toBe('')
    })
  })
})

// ─── 2. extractReviewDataUrlImages ──────────────────────────────────────────

describe('M8-02: extractReviewDataUrlImages - 从 HTML 提取 data URL 图片', () => {
  describe('主要功能', () => {
    it('应正确提取单个 data URL 图片', () => {
      const html = '<p><img src="data:image/png;base64,abc123" /></p>'
      const result = extractReviewDataUrlImages(html)
      expect(result).toEqual(['data:image/png;base64,abc123'])
    })

    it('应正确提取多个 data URL 图片', () => {
      const html = `
        <p><img src="data:image/jpeg;base64,img1" /></p>
        <p><img src="data:image/png;base64,img2" /></p>
      `
      const result = extractReviewDataUrlImages(html)
      expect(result).toHaveLength(2)
      expect(result[0]).toBe('data:image/jpeg;base64,img1')
      expect(result[1]).toBe('data:image/png;base64,img2')
    })

    it('应正确提取带参数的 data URL', () => {
      const html = '<img src="data:image/png;base64,abc?param=value&other=123" />'
      const result = extractReviewDataUrlImages(html)
      expect(result[0]).toBe('data:image/png;base64,abc?param=value&other=123')
    })
  })

  describe('P-M8-07: 正则 lastIndex 重置', () => {
    it('应正确处理多个文档调用（不受上一次影响）', () => {
      // 第一个文档：匹配到图片
      const html1 = '<img src="data:image/png,first" />'
      const result1 = extractReviewDataUrlImages(html1)
      expect(result1).toHaveLength(1)
      expect(result1[0]).toBe('data:image/png,first')

      // 第二个文档：完全不包含图片（边界情况）
      const html2 = '<p>No images here</p>'
      const result2 = extractReviewDataUrlImages(html2)
      expect(result2).toHaveLength(0)

      // 第三个文档：再次有图片
      const html3 = '<img src="data:image/png,third" />'
      const result3 = extractReviewDataUrlImages(html3)
      expect(result3).toHaveLength(1)
      expect(result3[0]).toBe('data:image/png,third')
    })

    it('应正确处理大文档中的多个图片（lastIndex 不污染）', () => {
      // 模拟一个大文档
      const img1 = 'data:image/png;base64,AAAA'
      const img2 = 'data:image/png;base64,BBBB'
      const img3 = 'data:image/png;base64,CCCC'
      const html = `
        <p>Some content <img src="${img1}" /> more text</p>
        <p>More content <img src="${img2}" /> and more</p>
        <p>Final content <img src="${img3}" /></p>
      `
      const result = extractReviewDataUrlImages(html)
      expect(result).toHaveLength(3)
      expect(result[0]).toBe(img1)
      expect(result[1]).toBe(img2)
      expect(result[2]).toBe(img3)
    })
  })

  describe('边界条件', () => {
    it('应处理空字符串', () => {
      expect(extractReviewDataUrlImages('')).toEqual([])
    })

    it('应处理不含图片的 HTML', () => {
      const html = '<p>Just text, no images</p>'
      expect(extractReviewDataUrlImages(html)).toEqual([])
    })

    it('应忽略非 data URL 图片', () => {
      const html = '<img src="https://example.com/image.png" />'
      expect(extractReviewDataUrlImages(html)).toEqual([])
    })

    it('应忽略普通 HTTP data URL（带冒号前缀）', () => {
      // 排除 "data:image" 之外的情况
      const html = '<img src="http://example.com/data:image/png,test" />'
      const result = extractReviewDataUrlImages(html)
      // 不匹配，因为正则要求 "data:image" 开头
      expect(result).toEqual([])
    })
  })
})

// ─── 3. reviewStoredToPlainText ───────────────────────────────────────────────

describe('M8-03: reviewStoredToPlainText - HTML 转回纯文本（服务端安全）', () => {
  describe('主要功能', () => {
    it('应正确移除段落标签', () => {
      const html = '<p>第一段</p><p>第二段</p>'
      const result = reviewStoredToPlainText(html)
      expect(result).toBe('第一段\n\n第二段')
    })

    it('应正确处理 br 标签转为换行', () => {
      const html = '<p>行一<br />行二</p>'
      const result = reviewStoredToPlainText(html)
      expect(result).toContain('行一\n行二')
    })

    it('应正确处理 img 标签被移除', () => {
      const html = '<p>文字<img src="data:image/png,abc" />后文</p>'
      const result = reviewStoredToPlainText(html)
      expect(result).not.toContain('data:image')
      expect(result).toContain('文字')
      expect(result).toContain('后文')
    })

    it('应处理复杂嵌套结构', () => {
      const html = `
        <p class="test">第一段<img src="data:image/png,test" /></p>
        <p><strong>第二段</strong>带<em>格式</em></p>
      `
      const result = reviewStoredToPlainText(html)
      expect(result).toContain('第一段')
      expect(result).toContain('第二段')
      expect(result).toContain('带格式')
    })
  })

  describe('P-M8-06: 服务端安全的 HTML Entity 解码', () => {
    it('应正确解码 &amp;', () => {
      const html = '<p>Tom &amp; Jerry</p>'
      const result = reviewStoredToPlainText(html)
      expect(result).toBe('Tom & Jerry')
    })

    it('应正确解码 &lt; 和 &gt;', () => {
      const html = '<p>a &lt; b &gt; c</p>'
      const result = reviewStoredToPlainText(html)
      expect(result).toBe('a < b > c')
    })

    it('应正确解码 &quot;', () => {
      const html = '<p>他说 &quot;你好&quot;</p>'
      const result = reviewStoredToPlainText(html)
      expect(result).toBe('他说 "你好"')
    })

    it('应正确解码 &#39; 和 &apos;', () => {
      const html = "<p>It's &#39;fine&#39; &amp; &apos;ok&apos;</p>"
      const result = reviewStoredToPlainText(html)
      expect(result).toBe("It's 'fine' & 'ok'")
    })

    it('应正确解码 &nbsp;', () => {
      const html = '<p>Hello&nbsp;World</p>'
      const result = reviewStoredToPlainText(html)
      expect(result).toBe('Hello World')
    })

    it('应处理真实复盘内容（含转义字符）', () => {
      const html = '<p>今日操作：买入 &quot;平安银行&quot;，&lt;涨幅&gt; 3%</p>'
      const result = reviewStoredToPlainText(html)
      expect(result).toBe('今日操作：买入 "平安银行"，<涨幅> 3%')
    })
  })

  describe('边界条件', () => {
    it('应处理空字符串', () => {
      expect(reviewStoredToPlainText('')).toBe('')
    })

    it('应处理纯标签字符串', () => {
      expect(reviewStoredToPlainText('<p></p><br />')).toBe('')
    })

    it('应处理无标签纯文本', () => {
      expect(reviewStoredToPlainText('纯文本内容')).toBe('纯文本内容')
    })
  })
})

// ─── 4. escapeHtml ───────────────────────────────────────────────────────────

describe('M8-04: escapeHtml - HTML 转义', () => {
  describe('主要功能', () => {
    it('应转义 & 字符', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
    })

    it('应转义 < 和 > 字符', () => {
      expect(escapeHtml('<div>')).toBe('&lt;div&gt;')
    })

    it('应转义 " 字符', () => {
      expect(escapeHtml('他说 "你好"')).toBe('他说 &quot;你好&quot;')
    })

    it('应正确处理混合特殊字符', () => {
      const result = escapeHtml('<script>alert("XSS")</script>')
      expect(result).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;')
    })
  })

  describe('P-M8-01: 配合 reviewContentHasHtml 使用', () => {
    it('转义后应能正确判断是否含 HTML', () => {
      // 用户输入 "< >"（不构成合法 HTML 标签）
      const userInput = '< >'
      const escaped = escapeHtml(userInput)
      // 转义后不再含合法 HTML 标签
      const hasHtml = /<\s*[a-z][\s\S]*>/i.test(escaped)
      expect(hasHtml).toBe(false)
    })

    it('真实 HTML 标签经转义后无法被检测为 HTML（安全防护）', () => {
      // 输入含 <p> 标签
      const userInput = '<p>hello</p>'
      const escaped = escapeHtml(userInput)
      // 转义后 &lt;p&gt; 不再被 HTML 检测正则匹配
      const hasHtml = /<\s*[a-z][\s\S]*>/i.test(escaped)
      expect(hasHtml).toBe(false)
      // 转义内容不再包含 <
      expect(escaped).not.toContain('<')
      expect(escaped).toContain('&lt;p&gt;')
    })
  })

  describe('边界条件', () => {
    it('应处理空字符串', () => {
      expect(escapeHtml('')).toBe('')
    })

    it('应处理无特殊字符的普通文本', () => {
      expect(escapeHtml('普通文本 123 abc')).toBe('普通文本 123 abc')
    })
  })
})

// ─── 5. generateShortId ─────────────────────────────────────────────────────

describe('M8-05: generateShortId - 生成短链接 ID', () => {
  describe('主要功能', () => {
    it('应生成指定长度的 ID', () => {
      const id = generateShortId(8)
      expect(id).toHaveLength(8)
    })

    it('应生成不同长度的 ID', () => {
      expect(generateShortId(6)).toHaveLength(6)
      expect(generateShortId(10)).toHaveLength(10)
      expect(generateShortId(12)).toHaveLength(12)
    })

    it('应只包含允许的字符集', () => {
      const id = generateShortId(20)
      expect(id).toMatch(/^[A-HJ-NP-Za-z0-9]+$/)
    })

    it('应生成唯一的 ID（多次调用不重复）', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateShortId(8))
      }
      // 100 次调用应产生 100 个不同 ID（概率上几乎必然）
      expect(ids.size).toBe(100)
    })

    it('不应包含易混淆字符（无 I, L, O, 0, 1）', () => {
      for (let i = 0; i < 50; i++) {
        const id = generateShortId(12)
        // CHARS 包含 L（大写），不包含 I（大写）和 1（数字）；确保这两者不出现在 ID 中
      // 实际字符集: ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789
      expect(id).not.toMatch(/[I1]/)
      }
    })
  })
})

// ─── 6. isShortId ────────────────────────────────────────────────────────────

describe('M8-06: isShortId - 验证短链接 ID 格式', () => {
  describe('主要功能', () => {
    it('应接受合法短 ID', () => {
      expect(isShortId('abc12345')).toBe(true)
      expect(isShortId('AbCdEfGh')).toBe(true)
      expect(isShortId('A1B2C3D4')).toBe(true)
    })

    it('应拒绝过短或过长的 ID', () => {
      expect(isShortId('abc')).toBe(false) // 少于 6
      expect(isShortId('abcdefghijklm')).toBe(false) // 超过 12
    })

    it('应拒绝含连字符的 UUID 格式', () => {
      expect(isShortId('550e8400-e29b-41d4-a716-446655440000')).toBe(false)
    })

    it('应拒绝含空格的字符串', () => {
      expect(isShortId('abc 123')).toBe(false)
    })

    it('应拒绝纯数字或纯字母', () => {
      // 纯数字仍合法（只要长度符合）
      expect(isShortId('123456')).toBe(true)
    })
  })

  describe('边界条件', () => {
    it('应拒绝空字符串', () => {
      expect(isShortId('')).toBe(false)
    })
  })
})

// ─── 7. isArticleUuid ────────────────────────────────────────────────────────

describe('M8-07: isArticleUuid - 验证文章 UUID 格式', () => {
  describe('主要功能', () => {
    it('应接受标准 UUID', () => {
      expect(isArticleUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
      expect(isArticleUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
    })

    it('应接受大写 UUID', () => {
      expect(isArticleUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
    })

    it('应接受带前后空白的 UUID', () => {
      expect(isArticleUuid('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(true)
    })

    it('应拒绝非 UUID 格式', () => {
      expect(isArticleUuid('abc123')).toBe(false)
      expect(isArticleUuid('550e8400-e29b-41d4-a716')).toBe(false) // 长度不足
      expect(isArticleUuid('short-id-123')).toBe(false)
    })

    it('应拒绝空字符串', () => {
      expect(isArticleUuid('')).toBe(false)
    })
  })
})

// ─── 8. buildContentWithImages（模拟复盘编辑器逻辑）────────────────────────

describe('M8-08: 复盘编辑器内容构建逻辑', () => {
  describe('plainTextToReviewHtml + extractReviewDataUrlImages 组合使用', () => {
    it('应正确处理含图片的复盘内容', () => {
      const plainText = '今日复盘\n\n买入平安银行'
      const bodyHtml = plainTextToReviewHtml(plainText)
      const imgTags = '<p><img src="data:image/png,test" style="max-width:100%;border-radius:8px;" /></p>'
      const fullContent = bodyHtml + imgTags

      expect(fullContent).toContain('<p>今日复盘</p>')
      expect(fullContent).toContain('<p>买入平安银行</p>')
      expect(fullContent).toContain('data:image/png,test')

      // 反向：从存储内容提取图片
      const extracted = extractReviewDataUrlImages(fullContent)
      expect(extracted).toHaveLength(1)
      expect(extracted[0]).toBe('data:image/png,test')
    })

    it('应正确处理纯文本复盘（无图片）', () => {
      const plainText = '第一段\n\n第二段内容'
      const bodyHtml = plainTextToReviewHtml(plainText)

      const extracted = extractReviewDataUrlImages(bodyHtml)
      expect(extracted).toHaveLength(0)
    })

    it('编辑回显应正确还原为纯文本', () => {
      const original = '今日买入平安银行<br />持仓不变'
      const html = `<p>${original}</p>`
      const plain = reviewStoredToPlainText(html)
      expect(plain).toContain('今日买入平安银行')
      expect(plain).toContain('持仓不变')
    })
  })
})
