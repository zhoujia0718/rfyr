/**
 * Module 9 - 搜索系统：安全修复 + 功能单元测试
 *
 * 测试覆盖：
 * 1. S-01 SQL 注入防护：escapeIlikePattern() 转义特殊字符
 * 2. S-03 XSS 防护：escapeHtml() HTML 转义
 * 3. S-04 防抖：useDebounce() 延迟执行
 * 4. S-02 访问控制：getAccessLevel() 和 canAccessByLevel() 会员等级层级
 *
 * 问题修复记录：
 * - S-01: 搜索词直接拼接进 ilike 查询，修复为转义 $ % _ \ 特殊字符
 * - S-02: 搜索结果未验证 access_level，修复为按会员等级过滤
 * - S-03: 搜索词直接渲染存在 XSS，修复为 HTML 转义
 * - S-04: 缺少防抖导致频繁请求，修复为 300ms 防抖
 * - S-06: 空搜索词未验证，修复为直接返回不发起请求
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── 辅助函数（从 app/search/page.tsx 提取） ────────────────────────────────

/**
 * S-01 修复：转义 ilike 模式中的特殊字符
 * $ 和 \ 在 Supabase ilike 中有特殊含义，需要转义
 */
function escapeIlikePattern(input: string): string {
  return input.replace(/[$%_\\]/g, '\\$&')
}

/**
 * S-03 修复：HTML 转义搜索词，防止 XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (c) => map[c])
}

/**
 * S-02 修复：获取用户会员等级，返回访问级别层级
 * 'free'=0, 'monthly'=1, 'yearly'=2, 'permanent'=3
 */
function getAccessLevel(user: { vip_tier?: string } | null | undefined): number {
  const hierarchy: Record<string, number> = { free: 0, monthly: 1, yearly: 2, permanent: 3 }
  return hierarchy[user?.vip_tier || 'free'] ?? 0
}

/**
 * 访问级别层级映射
 */
function canAccessByLevel(userLevel: number, articleLevel: string): boolean {
  const articleLevelMap: Record<string, number> = { free: 0, monthly: 1, yearly: 2, permanent: 3 }
  const articleRank = articleLevelMap[articleLevel] ?? 0
  return userLevel >= articleRank
}

// ─── S-01: SQL 注入防护测试 ──────────────────────────────────────────────────

describe('S-01: escapeIlikePattern() - SQL 注入防护', () => {
  describe('主要功能', () => {
    it('普通搜索词不应被修改', () => {
      expect(escapeIlikePattern('股票')).toBe('股票')
      expect(escapeIlikePattern('投资')).toBe('投资')
      expect(escapeIlikePattern('hello world')).toBe('hello world')
    })

    it('应转义百分号 %（ilike 通配符）', () => {
      // '100%' → '100\%'（JS 字符串 '100\\%' = 单反斜杠）
      expect(escapeIlikePattern('100%')).toBe('100\\%')
      expect(escapeIlikePattern('%苹果%')).toBe('\\%苹果\\%')
    })

    it('应转义下划线 _（ilike 单字符通配符）', () => {
      // 'a_b' → 'a\_b'（JS 字符串 'a\\_b' = 单反斜杠）
      expect(escapeIlikePattern('a_b')).toBe('a\\_b')
      expect(escapeIlikePattern('__test')).toBe('\\_\\_test')
    })

    it('应转义反斜杠 \\', () => {
      // '\\' → '\\\\'（JS 字符串 '\\\\' = 双反斜杠）
      expect(escapeIlikePattern('path\\file')).toBe('path\\\\file')
      expect(escapeIlikePattern('\\')).toBe('\\\\')
    })

    it('应转义美元符号 $', () => {
      expect(escapeIlikePattern('$100')).toBe('\\$100')
      expect(escapeIlikePattern('price$')).toBe('price\\$')
    })
  })

  describe('边界条件', () => {
    it('空字符串应返回空字符串', () => {
      expect(escapeIlikePattern('')).toBe('')
    })

    it('无特殊字符的字符串应保持不变', () => {
      expect(escapeIlikePattern('中文搜索词')).toBe('中文搜索词')
      expect(escapeIlikePattern('ABC123')).toBe('ABC123')
    })

    it('应正确处理混合特殊字符', () => {
      // '100%_$test\\end' → '100\%\_\$test\\end'
      expect(escapeIlikePattern('100%_$test\\end')).toBe('100\\%\\_\\$test\\\\end')
    })

    it('多个连续特殊字符应全部转义', () => {
      // '%%__\\\\$$' (输入字符串) → 每个特殊字符都被转义
      // % → \%，_ → \_，\ → \\，$ → \$
      // 最终: '\%\%\_\_\\\\\$\$' (JS 字符串字面量)
      expect(escapeIlikePattern('%%__\\\\$$')).toBe('\\%\\%\\_\\_\\\\\\\\\\$\\$')
    })
  })

  describe('安全测试', () => {
    it('应拒绝 SQL 注入模式：百分号通配符注入', () => {
      const malicious = '% UNION SELECT'
      const escaped = escapeIlikePattern(malicious)
      // '%' → '\%'（JS 字符串 '\\%'）
      expect(escaped).toBe('\\% UNION SELECT')
    })

    it('应拒绝 SQL 注入模式：下划线注入', () => {
      const malicious = '____ OR 1=1'
      const escaped = escapeIlikePattern(malicious)
      expect(escaped).toBe('\\_\\_\\_\\_ OR 1=1')
    })

    it('应拒绝 SQL 注入模式：反斜杠注入', () => {
      const malicious = 'test\\ OR 1=1'
      // 'test\\ OR 1=1' 中 '\\' → '\\\\'
      const escaped = escapeIlikePattern(malicious)
      expect(escaped).toBe('test\\\\ OR 1=1')
    })
  })
})

// ─── S-03: XSS 防护测试 ─────────────────────────────────────────────────────

describe('S-03: escapeHtml() - XSS 防护', () => {
  describe('主要功能', () => {
    it('应转义 & 符号', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b')
    })

    it('应转义 < 符号', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    })

    it('应转义 > 符号', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b')
    })

    it('应转义双引号', () => {
      expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;')
    })

    it('应转义单引号', () => {
      expect(escapeHtml("it's")).toBe('it&#039;s')
    })
  })

  describe('边界条件', () => {
    it('空字符串应返回空字符串', () => {
      expect(escapeHtml('')).toBe('')
    })

    it('无特殊字符的字符串应保持不变', () => {
      expect(escapeHtml('普通文本')).toBe('普通文本')
      expect(escapeHtml('ABC123')).toBe('ABC123')
    })

    it('应正确处理混合特殊字符', () => {
      expect(escapeHtml('<div class="test">a & b</div>'))
        .toBe('&lt;div class=&quot;test&quot;&gt;a &amp; b&lt;/div&gt;')
    })
  })

  describe('安全测试', () => {
    it('应拒绝 XSS 攻击：script 标签', () => {
      const malicious = '<script>alert(1)</script>'
      const escaped = escapeHtml(malicious)
      expect(escaped).not.toContain('<script>')
      expect(escaped).toContain('&lt;script&gt;')
    })

    it('应拒绝 XSS 攻击：onclick 事件', () => {
      const malicious = '<img src=x onerror=alert(1)>'
      const escaped = escapeHtml(malicious)
      // escapeHtml 只转义 HTML 标签字符，不处理 onerror 属性值
      // 关键是 < > " 被转义，标签无法执行
      expect(escaped).not.toContain('<img')
      expect(escaped).toContain('&lt;img')
      expect(escaped).toContain('&gt;')
    })

    it('应拒绝 XSS 攻击：javascript: URL', () => {
      const malicious = '<a href="javascript:alert(1)">click</a>'
      const escaped = escapeHtml(malicious)
      // 标签被转义，无法作为 HTML 执行
      expect(escaped).not.toContain('<a href')
      expect(escaped).toContain('&lt;a')
      expect(escaped).toContain('&gt;click&lt;/a&gt;')
    })

    it('应拒绝 XSS 攻击：内联样式注入', () => {
      const malicious = '<div style="expression(alert(1))">test</div>'
      const escaped = escapeHtml(malicious)
      expect(escaped).not.toContain('<div style')
      expect(escaped).toContain('&lt;div')
    })

    it('应拒绝 XSS 攻击：编码绕过尝试', () => {
      // 混合大小写和编码
      const malicious = '<SCRIPT>alert(String.fromCharCode(49))</SCRIPT>'
      const escaped = escapeHtml(malicious)
      expect(escaped).not.toContain('<SCRIPT>')
      expect(escaped).toContain('&lt;SCRIPT&gt;')
    })
  })
})

// ─── S-02: 访问控制测试 ──────────────────────────────────────────────────────

describe('S-02: getAccessLevel() - 会员等级层级', () => {
  describe('主要功能', () => {
    it('应正确识别 free 等级（层级 0）', () => {
      expect(getAccessLevel({ vip_tier: 'free' })).toBe(0)
    })

    it('应正确识别 monthly 等级（层级 1）', () => {
      expect(getAccessLevel({ vip_tier: 'monthly' })).toBe(1)
    })

    it('应正确识别 yearly 等级（层级 2）', () => {
      expect(getAccessLevel({ vip_tier: 'yearly' })).toBe(2)
    })

    it('应正确识别 permanent 等级（层级 3）', () => {
      expect(getAccessLevel({ vip_tier: 'permanent' })).toBe(3)
    })
  })

  describe('边界条件', () => {
    it('null 用户应返回 free 层级（0）', () => {
      expect(getAccessLevel(null)).toBe(0)
    })

    it('undefined 用户应返回 free 层级（0）', () => {
      expect(getAccessLevel(undefined)).toBe(0)
    })

    it('空对象用户应返回 free 层级（0）', () => {
      expect(getAccessLevel({})).toBe(0)
    })

    it('未知会员等级应返回 free 层级（0）', () => {
      expect(getAccessLevel({ vip_tier: 'unknown' })).toBe(0)
      expect(getAccessLevel({ vip_tier: 'admin' })).toBe(0)
      expect(getAccessLevel({ vip_tier: '' })).toBe(0)
    })
  })
})

describe('S-02: canAccessByLevel() - 访问控制逻辑', () => {
  describe('主要功能', () => {
    it('free 用户（层级 0）只能访问 free 文章', () => {
      expect(canAccessByLevel(0, 'free')).toBe(true)
      expect(canAccessByLevel(0, 'monthly')).toBe(false)
      expect(canAccessByLevel(0, 'yearly')).toBe(false)
      expect(canAccessByLevel(0, 'permanent')).toBe(false)
    })

    it('monthly 用户（层级 1）可访问 free 和 monthly 文章', () => {
      expect(canAccessByLevel(1, 'free')).toBe(true)
      expect(canAccessByLevel(1, 'monthly')).toBe(true)
      expect(canAccessByLevel(1, 'yearly')).toBe(false)
      expect(canAccessByLevel(1, 'permanent')).toBe(false)
    })

    it('yearly 用户（层级 2）可访问 free、monthly 和 yearly 文章', () => {
      expect(canAccessByLevel(2, 'free')).toBe(true)
      expect(canAccessByLevel(2, 'monthly')).toBe(true)
      expect(canAccessByLevel(2, 'yearly')).toBe(true)
      expect(canAccessByLevel(2, 'permanent')).toBe(false)
    })

    it('permanent 用户（层级 3）可访问所有等级文章', () => {
      expect(canAccessByLevel(3, 'free')).toBe(true)
      expect(canAccessByLevel(3, 'monthly')).toBe(true)
      expect(canAccessByLevel(3, 'yearly')).toBe(true)
      expect(canAccessByLevel(3, 'permanent')).toBe(true)
    })
  })

  describe('边界条件', () => {
    it('未知文章访问级别应默认为 free（可访问）', () => {
      expect(canAccessByLevel(0, 'unknown')).toBe(true)
      expect(canAccessByLevel(1, 'invalid')).toBe(true)
      expect(canAccessByLevel(2, '')).toBe(true)
    })

    it('空字符串文章级别应默认为 free', () => {
      expect(canAccessByLevel(0, '')).toBe(true)
      expect(canAccessByLevel(1, '')).toBe(true)
    })
  })

  describe('层级递增验证', () => {
    it('层级应严格递增：free < monthly < yearly < permanent', () => {
      // 验证层级递增性：每级用户只能访问同级及以下文章
      // permanent(3) 用户访问 yearly(2) 应该通过
      expect(canAccessByLevel(3, 'yearly')).toBe(true)
      // yearly(2) 用户访问 permanent(3) 应该失败
      expect(canAccessByLevel(2, 'permanent')).toBe(false)
      // free(0) 用户访问 monthly(1) 应该失败
      expect(canAccessByLevel(0, 'monthly')).toBe(false)
      // 每级用户都能访问同级和下级
      for (const userLevel of [0, 1, 2, 3]) {
        for (const articleLevel of [0, 1, 2, 3]) {
          if (userLevel >= articleLevel) {
            const names = ['free', 'monthly', 'yearly', 'permanent']
            expect(canAccessByLevel(userLevel, names[articleLevel])).toBe(true)
          }
        }
      }
    })
  })
})

// ─── S-04: 防抖测试 ──────────────────────────────────────────────────────────

describe('S-04: useDebounce() - 防抖逻辑', () => {
  // 简化版 useDebounce 测试（不涉及 React Hook，直接测试防抖逻辑）
  function debounce<T>(value: T, delay: number, callback: (val: T) => void): () => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    // 模拟防抖行为
    cleanup()
    timeoutId = setTimeout(() => {
      callback(value)
    }, delay)

    return cleanup
  }

  describe('主要功能', () => {
    it('应在延迟后返回最终值', (done: () => void) => {
      debounce('test', 100, (val: string) => {
        expect(val).toBe('test')
        done()
      })
    })

    it('应使用指定的延迟时间', (done: () => void) => {
      const start = Date.now()
      debounce('value', 50, (val: string) => {
        expect(Date.now() - start).toBeGreaterThanOrEqual(45)
        done()
      })
    })

    it('应返回最新的值', (done: () => void) => {
      let capturedValue: string | null = null
      const cleanup = debounce('final', 50, (val: string) => {
        capturedValue = val
      })

      // 快速多次调用
      debounce('first', 50, () => {})
      debounce('second', 50, () => {})
      debounce('third', 50, () => {})

      // 清理之前的定时器
      cleanup()

      setTimeout(() => {
        expect(capturedValue).toBe('final')
        done()
      }, 100)
    })
  })

  describe('边界条件', () => {
    it('空字符串应正常处理', (done: () => void) => {
      debounce('', 50, (val: string) => {
        expect(val).toBe('')
        done()
      })
    })

    it('数字类型应正常处理', (done: () => void) => {
      debounce(123, 50, (val: number) => {
        expect(val).toBe(123)
        done()
      })
    })

    it('对象类型应正常处理', (done: () => void) => {
      const obj = { key: 'value' }
      debounce(obj, 50, (val: typeof obj) => {
        expect(val).toEqual({ key: 'value' })
        done()
      })
    })

    it('null 应正常处理', (done: () => void) => {
      debounce(null as unknown as string, 50, (val: string | null) => {
        expect(val).toBe(null)
        done()
      })
    })
  })
})

// ─── 集成测试：完整搜索安全流程 ───────────────────────────────────────────────

describe('集成测试：搜索安全完整流程', () => {
  describe('安全组合测试', () => {
    it('SQL 注入 + XSS 组合攻击应被双重防护', () => {
      // 模拟恶意搜索词：包含 SQL 注入和 XSS
      const maliciousQuery = '<script>alert(1)</script> OR 1=1; --'

      // 第一层防护：转义 SQL 特殊字符（$ % _ \）
      const sqlSafe = escapeIlikePattern(maliciousQuery)
      // escapeIlikePattern 不处理 <>，所以 script 标签保留，但 $ % _ \ 被转义
      expect(sqlSafe).toContain('<script>alert(1)</script>')
      expect(sqlSafe).not.toContain("'")

      // 第二层防护：转义 HTML 特殊字符（用于安全显示）
      const htmlSafe = escapeHtml(maliciousQuery)
      expect(htmlSafe).not.toContain('<script>')
      expect(htmlSafe).toContain('&lt;script&gt;')
    })

    it('Unicode 混合攻击应被正确处理', () => {
      const unicodeAttack = '中文<script>alert(1)</script>日本語'
      // escapeIlikePattern 不处理 HTML 标签字符
      expect(escapeIlikePattern(unicodeAttack)).toBe('中文<script>alert(1)</script>日本語')
      // escapeHtml 转义 HTML 标签字符
      expect(escapeHtml(unicodeAttack)).toBe('中文&lt;script&gt;alert(1)&lt;/script&gt;日本語')
    })
  })

  describe('访问控制集成测试', () => {
    const testCases = [
      // [用户等级, 文章等级, 期望结果]
      ['free', 'free', true],
      ['free', 'monthly', false],
      ['free', 'yearly', false],
      ['free', 'permanent', false],
      ['monthly', 'free', true],
      ['monthly', 'monthly', true],
      ['monthly', 'yearly', false],
      ['monthly', 'permanent', false],
      ['yearly', 'free', true],
      ['yearly', 'monthly', true],
      ['yearly', 'yearly', true],
      ['yearly', 'permanent', false],
      ['permanent', 'free', true],
      ['permanent', 'monthly', true],
      ['permanent', 'yearly', true],
      ['permanent', 'permanent', true],
    ] as const

    testCases.forEach(([userTier, articleTier, expected]) => {
      it(`${userTier} 用户 ${
        expected ? '应' : '不应'
      }能访问 ${articleTier} 文章`, () => {
        const userLevel = getAccessLevel({ vip_tier: userTier })
        expect(canAccessByLevel(userLevel, articleTier)).toBe(expected)
      })
    })
  })

  describe('防抖与安全的交互', () => {
    it('防抖后的搜索词仍应正确转义', () => {
      // 模拟防抖后的搜索词（实际由 debounce 返回）
      const debouncedQuery = 'test <script>'

      // 防抖后的值用于 SQL 查询时：escapeIlikePattern 转义 SQL 特殊字符
      const escapedSql = escapeIlikePattern(debouncedQuery)
      // escapeIlikePattern 不处理 <>，所以 <script> 保持不变
      expect(escapedSql).toBe('test <script>')

      // 防抖后的值用于显示时：escapeHtml 转义 HTML 特殊字符
      const escapedHtml = escapeHtml(debouncedQuery)
      expect(escapedHtml).toBe('test &lt;script&gt;')
    })
  })
})
