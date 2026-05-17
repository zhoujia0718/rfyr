/**
 * Module 7 - 每日复盘正文处理：lib/review-html.ts 测试套件
 *
 * 测试覆盖：
 * 1. escapeHtml() - HTML 转义
 * 2. plainTextToReviewHtml() - 纯文本转段落 HTML
 * 3. extractReviewDataUrlImages() - 提取 data URL 图片
 * 4. reviewStoredToPlainText() - HTML 还原为纯文本
 *
 * 问题修复记录：
 * - P-M8-06: 添加服务端安全的 HTML Entity 解码，不依赖 DOM
 * - P-M8-07: 每次调用前重置 lastIndex，防止多文档共享正则状态导致遗漏
 */
import { describe, it, expect } from 'vitest'
import {
  escapeHtml,
  plainTextToReviewHtml,
  extractReviewDataUrlImages,
  reviewStoredToPlainText,
} from '../lib/review-html'

// ─── escapeHtml() 测试 ───────────────────────────────────────────────────────

describe('M7-01: escapeHtml() - HTML 转义', () => {
  describe('主要功能', () => {
    it('应转义 & 符号', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b')
      expect(escapeHtml('&')).toBe('&amp;')
    })

    it('应转义 < 符号', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
      expect(escapeHtml('a < b')).toBe('a &lt; b')
    })

    it('应转义 > 符号', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b')
      expect(escapeHtml('x > y')).toBe('x &gt; y')
    })

    it('应转义双引号 "', () => {
      expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;')
      expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;')
    })
  })

  describe('边界条件', () => {
    it('空字符串应返回空字符串', () => {
      expect(escapeHtml('')).toBe('')
    })

    it('无特殊字符的字符串应保持不变', () => {
      expect(escapeHtml('普通文本')).toBe('普通文本')
      expect(escapeHtml('ABC123')).toBe('ABC123')
      expect(escapeHtml('hello world')).toBe('hello world')
    })

    it('应转义已存在的 HTML 实体（再次编码）', () => {
      // 再次编码时 & → &amp;，所以 &amp; → &amp;amp;
      expect(escapeHtml('&amp; &lt; &gt; &quot;')).toBe('&amp;amp; &amp;lt; &amp;gt; &amp;quot;')
    })

    it('应正确处理混合特殊字符', () => {
      expect(escapeHtml('<div class="test">a & b</div>'))
        .toBe('&lt;div class=&quot;test&quot;&gt;a &amp; b&lt;/div&gt;')
    })

    it('应处理数字和中文混合内容', () => {
      expect(escapeHtml('股票代码 000001 < 收盘价 10.5')).toBe(
        '股票代码 000001 &lt; 收盘价 10.5'
      )
    })
  })

  describe('安全测试', () => {
    it('应拒绝 XSS 攻击：script 标签', () => {
      const malicious = '<script>alert(1)</script>'
      const escaped = escapeHtml(malicious)
      expect(escaped).not.toContain('<script>')
      expect(escaped).toContain('&lt;script&gt;')
    })

    it('应拒绝 XSS 攻击：img onerror 事件', () => {
      const malicious = '<img src=x onerror=alert(1)>'
      const escaped = escapeHtml(malicious)
      expect(escaped).not.toContain('<img')
      expect(escaped).toContain('&lt;img')
      expect(escaped).toContain('&gt;')
    })

    it('应拒绝 XSS 攻击：javascript: URL', () => {
      const malicious = '<a href="javascript:alert(1)">click</a>'
      const escaped = escapeHtml(malicious)
      expect(escaped).not.toContain('<a href')
      expect(escaped).toContain('&lt;a')
    })
  })
})

// ─── plainTextToReviewHtml() 测试 ────────────────────────────────────────────

describe('M7-02: plainTextToReviewHtml() - 纯文本转段落 HTML', () => {
  describe('主要功能', () => {
    it('单段落（无双换行）应生成单个 <p> 标签', () => {
      expect(plainTextToReviewHtml('这是第一段')).toBe('<p>这是第一段</p>')
      expect(plainTextToReviewHtml('Hello World')).toBe('<p>Hello World</p>')
    })

    it('多个段落（双换行）应分割为多个 <p> 标签', () => {
      const result = plainTextToReviewHtml('第一段\n\n第二段')
      expect(result).toBe('<p>第一段</p><p>第二段</p>')
    })

    it('多个双换行应生成多个段落', () => {
      const result = plainTextToReviewHtml('第一段\n\n第二段\n\n第三段')
      expect(result).toBe('<p>第一段</p><p>第二段</p><p>第三段</p>')
    })

    it('段落内单换行应转为 <br/>', () => {
      const result = plainTextToReviewHtml('第一行\n第二行')
      expect(result).toBe('<p>第一行<br />第二行</p>')
    })

    it('应正确转义 HTML 特殊字符', () => {
      const result = plainTextToReviewHtml('<script>alert(1)</script>')
      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
    })
  })

  describe('边界条件', () => {
    it('空字符串应返回空字符串', () => {
      expect(plainTextToReviewHtml('')).toBe('')
    })

    it('仅空白字符应返回空字符串', () => {
      expect(plainTextToReviewHtml('   ')).toBe('')
      expect(plainTextToReviewHtml('\t\n')).toBe('')
      expect(plainTextToReviewHtml('  \n\n  ')).toBe('')
    })

    it('应去除首尾空白', () => {
      expect(plainTextToReviewHtml('  内容  ')).toBe('<p>内容</p>')
      expect(plainTextToReviewHtml('\n\n内容\n\n')).toBe('<p>内容</p>')
    })

    it('仅单换行不应创建新段落', () => {
      const result = plainTextToReviewHtml('第一行\n第二行\n第三行')
      expect(result).toBe('<p>第一行<br />第二行<br />第三行</p>')
    })

    it('3个以上连续换行应视为段落分隔', () => {
      const result = plainTextToReviewHtml('第一段\n\n\n第二段\n\n\n\n第三段')
      expect(result).toBe('<p>第一段</p><p>第二段</p><p>第三段</p>')
    })

    it('空段落应被过滤', () => {
      const result = plainTextToReviewHtml('第一段\n\n\n第二段')
      expect(result).toBe('<p>第一段</p><p>第二段</p>')
    })
  })

  describe('内容处理', () => {
    it('应处理中英文混合内容', () => {
      const result = plainTextToReviewHtml('今天买了股票\n代码 000001')
      expect(result).toBe('<p>今天买了股票<br />代码 000001</p>')
    })

    it('应处理特殊字符', () => {
      const result = plainTextToReviewHtml('a < b & c > d')
      expect(result).toBe('<p>a &lt; b &amp; c &gt; d</p>')
    })
  })
})

// ─── extractReviewDataUrlImages() 测试 ───────────────────────────────────────

describe('M7-03: extractReviewDataUrlImages() - 提取 data URL 图片', () => {
  describe('主要功能', () => {
    it('应提取 HTML 中的 data:image URL', () => {
      const html = '<p>测试<img src="data:image/png;base64,abc123"/>内容</p>'
      const result = extractReviewDataUrlImages(html)
      expect(result).toEqual(['data:image/png;base64,abc123'])
    })

    it('应提取多个 data:image URL', () => {
      const html = `
        <p><img src="data:image/png;base64,aaa"/></p>
        <p><img src="data:image/jpeg;base64,bbb"/></p>
        <p><img src="data:image/gif;base64,ccc"/></p>
      `
      const result = extractReviewDataUrlImages(html)
      expect(result).toEqual([
        'data:image/png;base64,aaa',
        'data:image/jpeg;base64,bbb',
        'data:image/gif;base64,ccc',
      ])
    })

    it('应提取带引号的完整 data URL（包含特殊字符）', () => {
      const html = '<img src="data:image/svg+xml;utf8,<svg></svg>"/>'
      const result = extractReviewDataUrlImages(html)
      expect(result).toEqual(['data:image/svg+xml;utf8,<svg></svg>'])
    })
  })

  describe('边界条件', () => {
    it('无 data:image 时应返回空数组', () => {
      expect(extractReviewDataUrlImages('')).toEqual([])
      expect(extractReviewDataUrlImages('<p>无图片内容</p>')).toEqual([])
      expect(extractReviewDataUrlImages('<img src="https://example.com/image.png"/>')).toEqual([])
    })

    it('空字符串应返回空数组', () => {
      expect(extractReviewDataUrlImages('')).toEqual([])
    })

    it('应忽略普通 HTTP/HTTPS 图片', () => {
      const html = `
        <img src="data:image/png;base64,test"/>
        <img src="https://example.com/image.png"/>
        <img src="data:image/gif;base64,test2"/>
      `
      const result = extractReviewDataUrlImages(html)
      expect(result).toHaveLength(2)
      expect(result).not.toContain('https://example.com/image.png')
    })

    it('混合 HTML 内容应正确提取', () => {
      const html = `
        <div>
          <p>文章正文</p>
          <img src="data:image/png;base64,img1"/>
          <p>更多内容 <img src="data:image/jpeg;base64,img2"/> 这里</p>
        </div>
      `
      const result = extractReviewDataUrlImages(html)
      expect(result).toHaveLength(2)
      expect(result).toContain('data:image/png;base64,img1')
      expect(result).toContain('data:image/jpeg;base64,img2')
    })
  })

  describe('P-M8-07: 多文档共享正则状态测试', () => {
    it('多次调用应正确提取（lastIndex 重置验证）', () => {
      const html1 = '<img src="data:image/png;base64,first"/>'
      const html2 = '<img src="data:image/png;base64,second"/>'
      const html3 = '<img src="data:image/png;base64,third"/>'

      // 连续调用，每次都应完整提取
      const result1 = extractReviewDataUrlImages(html1)
      const result2 = extractReviewDataUrlImages(html2)
      const result3 = extractReviewDataUrlImages(html3)

      expect(result1).toEqual(['data:image/png;base64,first'])
      expect(result2).toEqual(['data:image/png;base64,second'])
      expect(result3).toEqual(['data:image/png;base64,third'])
    })

    it('多图片文档多次调用应全部提取', () => {
      const multiImgHtml = `
        <img src="data:image/png;base64,a"/>
        <img src="data:image/png;base64,b"/>
        <img src="data:image/png;base64,c"/>
      `

      // 多次调用同一 HTML，结果应一致
      const results = [
        extractReviewDataUrlImages(multiImgHtml),
        extractReviewDataUrlImages(multiImgHtml),
        extractReviewDataUrlImages(multiImgHtml),
      ]

      results.forEach((result) => {
        expect(result).toHaveLength(3)
        expect(result).toEqual(['data:image/png;base64,a', 'data:image/png;base64,b', 'data:image/png;base64,c'])
      })
    })

    it('跨文档调用不应遗漏图片', () => {
      // 模拟同一测试中处理多个文档的场景
      const docs = [
        '<img src="data:image/png;base64,doc1-img1"/><img src="data:image/png;base64,doc1-img2"/>',
        '<img src="data:image/png;base64,doc2-img1"/>',
        '<img src="data:image/png;base64,doc3-img1"/><img src="data:image/png;base64,doc3-img2"/><img src="data:image/png;base64,doc3-img3"/>',
      ]

      const extracted = docs.map((doc) => extractReviewDataUrlImages(doc))

      expect(extracted[0]).toHaveLength(2)
      expect(extracted[1]).toHaveLength(1)
      expect(extracted[2]).toHaveLength(3)

      expect(extracted[0]).toContain('data:image/png;base64,doc1-img1')
      expect(extracted[0]).toContain('data:image/png;base64,doc1-img2')
      expect(extracted[1]).toContain('data:image/png;base64,doc2-img1')
      expect(extracted[2]).toContain('data:image/png;base64,doc3-img1')
      expect(extracted[2]).toContain('data:image/png;base64,doc3-img2')
      expect(extracted[2]).toContain('data:image/png;base64,doc3-img3')
    })
  })
})

// ─── reviewStoredToPlainText() 测试 ─────────────────────────────────────────

describe('M7-04: reviewStoredToPlainText() - HTML 还原为纯文本', () => {
  describe('主要功能', () => {
    it('应解码 HTML 实体 &amp;', () => {
      expect(reviewStoredToPlainText('&amp;')).toBe('&')
    })

    it('应解码 HTML 实体 &lt;', () => {
      expect(reviewStoredToPlainText('&lt;')).toBe('<')
    })

    it('应解码 HTML 实体 &gt;', () => {
      expect(reviewStoredToPlainText('&gt;')).toBe('>')
    })

    it('应解码 HTML 实体 &quot;', () => {
      expect(reviewStoredToPlainText('&quot;')).toBe('"')
    })

    it('应解码 HTML 实体 &#39;', () => {
      expect(reviewStoredToPlainText('&#39;')).toBe("'")
    })

    it('应解码 HTML 实体 &apos;', () => {
      expect(reviewStoredToPlainText('&apos;')).toBe("'")
    })

    it('应解码 HTML 实体 &nbsp;', () => {
      // 注意：reviewStoredToPlainText 末尾有 trim()，单独一个 nbsp 解码后的空格会被 trim 掉
      // 测试带其他内容的场景
      expect(reviewStoredToPlainText('文字&nbsp;文字')).toBe('文字 文字')
    })

    it('<p> 标签应转为双换行', () => {
      expect(reviewStoredToPlainText('<p>第一段</p><p>第二段</p>')).toBe('第一段\n\n第二段')
    })

    it('<br/> 应转为单换行', () => {
      expect(reviewStoredToPlainText('第一行<br/>第二行')).toBe('第一行\n第二行')
      expect(reviewStoredToPlainText('第一行<br>第二行')).toBe('第一行\n第二行')
      expect(reviewStoredToPlainText('第一行<br />第二行')).toBe('第一行\n第二行')
    })
  })

  describe('边界条件', () => {
    it('空字符串应返回空字符串', () => {
      expect(reviewStoredToPlainText('')).toBe('')
    })

    it('纯 HTML 标签应被移除', () => {
      expect(reviewStoredToPlainText('<div><span>内容</span></div>')).toBe('内容')
    })

    it('应去除首尾空白', () => {
      expect(reviewStoredToPlainText('  内容  ')).toBe('内容')
      expect(reviewStoredToPlainText('\n\n内容\n\n')).toBe('内容')
    })
  })

  describe('P-M8-06: 边界情况处理', () => {
    it('应移除独立图片段落', () => {
      // 独立图片段落（图片后无其他内容）应被完全移除
      const html = '<p><img src="data:image/png;base64,test"/></p>'
      expect(reviewStoredToPlainText(html)).toBe('')
    })

    it('带属性的 <p> 标签应正确处理', () => {
      expect(reviewStoredToPlainText('<p class="test">内容</p>')).toBe('内容')
      expect(reviewStoredToPlainText('<p style="color:red">内容</p>')).toBe('内容')
      expect(reviewStoredToPlainText('<p data-id="123">内容</p>')).toBe('内容')
    })

    it('嵌套标签应正确展平', () => {
      const html = '<p><strong>粗体</strong>和<em>斜体</em>文本</p>'
      const result = reviewStoredToPlainText(html)
      expect(result).toBe('粗体和斜体文本')
    })

    it('混合内容应正确还原', () => {
      const html = `
        <p><img src="data:image/png;base64,a"/></p>
        <p>第二段<br/>有换行</p>
        <p>含 &amp; &lt; &gt; 特殊字符</p>
      `
      const result = reviewStoredToPlainText(html)
      expect(result).toContain('第二段\n有换行')
      expect(result).toContain('含 & < > 特殊字符')
      expect(result).not.toContain('data:image')
    })

    it('连续多个 <br/> 应转为多个换行', () => {
      expect(reviewStoredToPlainText('a<br/><br/><br/>b')).toBe('a\n\n\nb')
    })

    it('HTML 实体混合普通文本应正确解码', () => {
      expect(reviewStoredToPlainText('&quot;内容&quot; &amp; 更多')).toBe('"内容" & 更多')
    })

    it('复杂嵌套结构应正确处理', () => {
      const html = `
        <div>
          <p><img src="x"/></p>
          <p>段二<br/>换行</p>
          <p>段三 &gt; 5</p>
        </div>
      `
      const result = reviewStoredToPlainText(html)
      expect(result).toContain('段二\n换行')
      expect(result).toContain('段三 > 5')
    })
  })

  describe('内容还原完整性', () => {
    it('plainTextToReviewHtml + reviewStoredToPlainText 应互逆（基本内容）', () => {
      const original = '第一段\n\n第二段内容'
      const html = plainTextToReviewHtml(original)
      const restored = reviewStoredToPlainText(html)
      expect(restored).toBe(original)
    })

    it('带换行的段落应正确往返', () => {
      const original = '第一行\n第二行'
      const html = plainTextToReviewHtml(original)
      const restored = reviewStoredToPlainText(html)
      expect(restored).toBe(original)
    })

    it('HTML 实体应正确往返', () => {
      const original = '<div>内容</div>'
      const html = plainTextToReviewHtml(original)
      const restored = reviewStoredToPlainText(html)
      expect(restored).toBe(original)
    })
  })
})

// ─── 集成测试 ────────────────────────────────────────────────────────────────

describe('M7-05: 集成测试 - 复盘内容处理完整流程', () => {
  it('编辑 → 存储 → 显示 完整流程', () => {
    // 用户在 textarea 输入的内容
    const userInput = '今日复盘\n\n大盘走势良好\n成交量放大'

    // 转为 HTML 存储
    const storedHtml = plainTextToReviewHtml(userInput)
    expect(storedHtml).toBe('<p>今日复盘</p><p>大盘走势良好<br />成交量放大</p>')

    // 从存储还原为纯文本供编辑
    const restoredText = reviewStoredToPlainText(storedHtml)
    expect(restoredText).toBe(userInput)
  })

  it('包含图片的复盘内容应正确处理', () => {
    const userInput = '今日复盘\n\n大盘走势良好'

    // 转为 HTML
    let html = plainTextToReviewHtml(userInput)

    // 模拟添加图片（粘贴截图）到开头
    const imgHtml = '<p><img src="data:image/png;base64,test"/></p>'
    html = imgHtml + html

    // 提取图片用于编辑器预览
    const images = extractReviewDataUrlImages(html)
    expect(images).toEqual(['data:image/png;base64,test'])

    // 还原为纯文本（图片段落被移除）
    const plainText = reviewStoredToPlainText(html)
    expect(plainText).toBe('今日复盘\n\n大盘走势良好')
  })

  it('XSS 攻击内容应被安全处理', () => {
    const maliciousInput = '<script>alert(1)</script>'

    // 转为 HTML 时应转义（关键：显示时是安全的）
    const html = plainTextToReviewHtml(maliciousInput)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    // HTML 中显示的是转义后的内容，不会执行
    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')

    // 注意：plainTextToReviewHtml → reviewStoredToPlainText 往返不是无损的
    // 这是设计行为：escapeHtml/decodeHtmlEntities 是互逆的
  })
})
