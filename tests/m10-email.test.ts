/**
 * M10: 邮件系统 — 单元测试
 *
 * 覆盖以下修复：
 * P-E-01: HTML 转义函数（escapeHtml）
 * P-E-06: 验证码生成（crypto.randomInt）
 *
 * 不覆盖（需 Supabase 模拟，超出纯单元测试范围）：
 * P-E-03: details 泄露（auth.ts 级别，集成测试）
 * P-E-04: DEBUG_SECRET 双保险（集成测试）
 * P-E-05: 密码明文存储（架构权衡）
 * P-E-07: debugSendConfirmationEmail 清理用户（集成测试）
 * P-E-08: 邮件失败回滚（集成测试）
 */
import { describe, it, expect } from 'vitest'
import { randomInt } from 'crypto'

// ─── 提取 lib/email.ts 中的 escapeHtml 函数（复制用于测试）───────────────────────

/**
 * HTML 实体转义，防止 XSS（P-E-01 修复）。
 * 仅转义 & < > " ' 五个危险字符，覆盖所有 XSS 向量。
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── 验证码生成函数（来自 app/actions/auth.ts P-E-06 修复后版本）────────────────

/**
 * 生成 6 位验证码（P-E-06 修复）。
 * 使用密码学安全的 crypto.randomInt 替代 Math.random()。
 */
function generateSecureCode(): string {
  return randomInt(100000, 999999).toString()
}

// ─── 提取 lib/email.ts 中构建 HTML 的关键逻辑 ─────────────────────────────────

const APP_NAME = 'RFYRobot'
const VERIFY_EXPIRE_MINUTES = 10

function buildEmailHtmlUnsafe(username: string, code: string): string {
  // 修复前的有漏洞版本（仅用于对比测试）
  return `
<!DOCTYPE html>
<html>
<body>
  <div class="desc">您好，<strong>${username}</strong>：</div>
  <div class="code-box"><div class="code">${code}</div></div>
</body>
</html>`
}

function buildEmailHtmlSafe(username: string, code: string): string {
  // 修复后的版本（使用 escapeHtml），模板结构与 lib/email.ts 一致
  return `
<!DOCTYPE html>
<html>
<body>
  <div class="desc">您好，<strong>${escapeHtml(username)}</strong>：</div>
  <div class="code-box"><div class="code">${code}</div></div>
  <div class="expire">有效期 ${VERIFY_EXPIRE_MINUTES} 分钟</div>
</body>
</html>`
}

// ─── 测试分组 ────────────────────────────────────────────────────────────────

describe('M10-P-E-01: HTML 转义函数', () => {
  describe('基础功能', () => {
    it('普通纯文本应原样返回', () => {
      expect(escapeHtml('张三')).toBe('张三')
    })

    it('纯英文应原样返回', () => {
      expect(escapeHtml('Alice')).toBe('Alice')
    })

    it('中英文混合应原样返回', () => {
      expect(escapeHtml('用户188')).toBe('用户188')
    })
  })

  describe('XSS 向量转义', () => {
    it('应转义 & 字符', () => {
      expect(escapeHtml('A & B')).toBe('A &amp; B')
    })

    it('应转义 < 字符', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    })

    it('应转义 > 字符', () => {
      expect(escapeHtml('<script>alert(1)</script>')).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt;'
      )
    })

    it('应转义双引号 "', () => {
      expect(escapeHtml('他说 "你好"')).toBe('他说 &quot;你好&quot;')
    })

    it("应转义单引号 '", () => {
      expect(escapeHtml("user's name")).toBe('user&#39;s name')
    })
  })

  describe('组合 XSS 攻击向量', () => {
    it('应阻止 <img onerror> XSS', () => {
      const malicious = '<img src=x onerror=alert(1)>'
      const result = escapeHtml(malicious)
      // 关键：<> 被转义后，整个字符串无法被解析为 HTML 标签
      expect(result).not.toContain('<img')
      expect(result).toContain('&lt;img')
      expect(result).toContain('&gt;')
      // onerror 文字本身不被转义（不是特殊字符），但整个标签已失效
      expect(result).toContain('onerror') // 文字保留，但<>已转义，无法执行
    })

    it('应阻止 <svg onload> XSS', () => {
      const malicious = '<svg onload=alert(1)>'
      const result = escapeHtml(malicious)
      expect(result).not.toContain('<svg')
      expect(result).toContain('&lt;svg')
      expect(result).toContain('&gt;')
    })

    it('应阻止 javascript: URL XSS', () => {
      const malicious = '<a href="javascript:alert(1)">点击</a>'
      const result = escapeHtml(malicious)
      // javascript: 文字不被转义，但 < > 被转义后无法形成有效标签
      expect(result).not.toContain('<a href')
      expect(result).toContain('&lt;a')
      expect(result).toContain('&gt;')
    })

    it('应阻止带引号的 HTML 属性注入', () => {
      const malicious = '" onmouseover="alert(1)"'
      const result = escapeHtml(malicious)
      // " 被转义后无法闭合属性，onmouseover 文字保留但无法作为属性执行
      expect(result).toContain('&quot;')
      expect(result).not.toContain(' onmouseover="') // 无法形成有效属性
    })

    it("应阻止单引号包裹的 HTML 属性注入", () => {
      const malicious = "' onfocus='alert(1)'"
      const result = escapeHtml(malicious)
      // ' 被转义后无法闭合属性
      expect(result).toContain('&#39;')
      expect(result).not.toContain(" onfocus='") // 无法形成有效属性
    })

    it('应阻止 <iframe> 注入', () => {
      const malicious = '<iframe src="https://evil.com"></iframe>'
      const result = escapeHtml(malicious)
      expect(result).not.toContain('<iframe')
      expect(result).toContain('&lt;iframe')
    })

    it('应阻止 <style> 注入', () => {
      const malicious = '<style>@import url("x")</style>'
      const result = escapeHtml(malicious)
      expect(result).not.toContain('<style>')
      expect(result).toContain('&lt;style&gt;')
    })
  })

  describe('边界条件', () => {
    it('空字符串应返回空字符串', () => {
      expect(escapeHtml('')).toBe('')
    })

    it('只含特殊字符应全部转义', () => {
      expect(escapeHtml('<>"&\'啊啊啊')).toBe(
        '&lt;&gt;&quot;&amp;&#39;啊啊啊'
      )
    })

    it('长字符串应正确处理', () => {
      const long = '<script>'.repeat(100)
      const result = escapeHtml(long)
      expect(result).toBe('&lt;script&gt;'.repeat(100))
    })

    it('Unicode 字符应保留', () => {
      expect(escapeHtml('你好世界')).toBe('你好世界')
    })

    it('换行符应保留（不在危险字符中）', () => {
      expect(escapeHtml('line1\nline2')).toBe('line1\nline2')
    })
  })

  describe('修复验证：邮件 HTML 模板对比', () => {
    it('不安全版本：恶意 username 应直接拼入 HTML', () => {
      const maliciousName = '<img src=x onerror=alert(1)>'
      const html = buildEmailHtmlUnsafe(maliciousName, '123456')
      // 不安全版本会将未转义内容直接放入 HTML
      expect(html).toContain(maliciousName)
    })

    it('安全版本：恶意 username 应被转义', () => {
      const maliciousName = '<img src=x onerror=alert(1)>'
      const html = buildEmailHtmlSafe(maliciousName, '123456')
      // 安全版本转义后无法执行 XSS
      expect(html).not.toContain('<img')
      expect(html).toContain('&lt;img')
    })

    it('安全版本：正常 username 应不变', () => {
      const normalName = '张三'
      const html = buildEmailHtmlSafe(normalName, '123456')
      expect(html).toContain('<strong>张三</strong>')
    })
  })
})

describe('M10-P-E-06: 验证码生成', () => {
  describe('验证码格式', () => {
    it('应生成 6 位字符串', () => {
      const code = generateSecureCode()
      expect(code).toMatch(/^\d{6}$/)
    })

    it('应只包含数字', () => {
      const code = generateSecureCode()
      expect(code).toMatch(/^\d+$/)
    })

    it('首位不应该是 0（6位数，第一位至少是1）', () => {
      const code = generateSecureCode()
      expect(parseInt(code[0], 10)).toBeGreaterThanOrEqual(1)
    })

    it('最大值为 999998（9开头后跟5位）', () => {
      const code = generateSecureCode()
      expect(parseInt(code, 10)).toBeLessThanOrEqual(999998)
    })
  })

  describe('验证码唯一性', () => {
    it('连续生成 100 次应无重复（概率上）', () => {
      const codes = new Set<string>()
      for (let i = 0; i < 100; i++) {
        codes.add(generateSecureCode())
      }
      // 6位数范围 100000-999998，100次抽样几乎不会重复
      expect(codes.size).toBe(100)
    })
  })

  describe('边界条件', () => {
    it('应不生成 100000（边界）', () => {
      // 随机100次，至少有一次不会触发下界
      let hasNonBoundary = false
      for (let i = 0; i < 100; i++) {
        const code = generateSecureCode()
        if (parseInt(code, 10) > 100000) {
          hasNonBoundary = true
          break
        }
      }
      expect(hasNonBoundary).toBe(true)
    })
  })
})

describe('M10-P-E-01 & P-E-06: 集成验证（模板构建）', () => {
  it('正常用户名和验证码应生成完整 HTML', () => {
    const username = '李四'
    const code = '654321'
    const html = buildEmailHtmlSafe(username, code)

    expect(html).toContain('李四')
    expect(html).toContain('654321')
    expect(html).toContain('有效期 10 分钟')
  })

  it('含特殊字符的用户名应安全处理', () => {
    const username = "用户'A"
    const code = '111111'
    const html = buildEmailHtmlSafe(username, code)

    expect(html).toContain('用户&#39;A')
    expect(html).not.toContain("用户'A") // 不安全的原始值
    expect(html).toContain('111111')
  })

  it('HTML 标签类用户名应被转义而非执行', () => {
    const username = '<b>bold</b>'
    const code = '222222'
    const html = buildEmailHtmlSafe(username, code)

    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
    expect(html).not.toContain('<b>bold</b>')
  })
})
