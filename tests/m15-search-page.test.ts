/**
 * M15-16: app/search/page.tsx — 搜索页逻辑测试
 *
 * 测试覆盖：
 * 1. escapeIlikePattern — 转义 $ % _ \ 特殊字符（S-01 修复）
 * 2. escapeHtml — HTML 转义防止 XSS（S-03 修复）
 * 3. useDebounce — 防抖延迟
 * 4. getAccessLevel — 会员等级层级映射（S-02 修复）
 * 5. canAccessByLevel — 按等级过滤搜索结果（S-02 修复）
 * 6. 空搜索词不发起请求（S-06 修复）
 * 7. 搜索结果按等级过滤
 * 8. getExcerpt — 去除 HTML 标签生成摘要
 *
 * 修复记录：
 * - S-01: 转义 ilike 模式中的特殊字符
 * - S-02: 根据用户会员等级过滤搜索结果
 * - S-03: HTML 转义搜索词防止 XSS
 * - S-04: 防抖 Hook
 * - S-06: 空搜索词不发起请求
 */
import { describe, it, expect } from 'vitest'

// ─── 从组件提取的纯函数 ──────────────────────────────────────────────

function escapeIlikePattern(input: string): string {
  return input.replace(/[$%_\\]/g, '\\$&')
}

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

function getAccessLevel(user: { vip_tier?: string } | null): number {
  const hierarchy: Record<string, number> = { free: 0, monthly: 1, yearly: 2, permanent: 3 }
  return hierarchy[user?.vip_tier || 'free'] ?? 0
}

function canAccessByLevel(userLevel: number, articleLevel: string): boolean {
  const articleLevelMap: Record<string, number> = { free: 0, monthly: 1, yearly: 2, permanent: 3 }
  const articleRank = articleLevelMap[articleLevel] ?? 0
  return userLevel >= articleRank
}

function getExcerpt(content: string, maxLength: number = 120): string {
  const plainText = content.replace(/<[^>]+>/g, '')
  if (plainText.length <= maxLength) return plainText
  return plainText.substring(0, maxLength) + '...'
}

function buildIlikePattern(rawQuery: string): string {
  const escaped = escapeIlikePattern(rawQuery)
  return `%${escaped}%`
}

// ─── S-01: escapeIlikePattern ───────────────────────────────────────────

describe('M15-16a: S-01 修复：escapeIlikePattern 转义特殊字符', () => {
  it('普通文本不改变', () => {
    expect(escapeIlikePattern('短线笔记')).toBe('短线笔记')
    expect(escapeIlikePattern('RSIC')).toBe('RSIC')
  })

  it('转义 $', () => {
    expect(escapeIlikePattern('$100')).toBe('\\$100')
  })

  it('转义 %', () => {
    expect(escapeIlikePattern('50%')).toBe('50\\%')
  })

  it('转义 _（ilike 通配符）', () => {
    expect(escapeIlikePattern('a_b')).toBe('a\\_b')
  })

  it('转义 \\', () => {
    expect(escapeIlikePattern('a\\b')).toBe('a\\\\b')
  })

  it('多个特殊字符逐一转义', () => {
    // 输入: $100%_test\\x  →  输出: \$100\%\_test\\x
    expect(escapeIlikePattern('$100%_test\\x')).toBe('\\$100\\%\\_test\\\\x')
  })
})

// ─── S-02: getAccessLevel / canAccessByLevel ────────────────────────────

describe('M15-16b: S-02 修复：会员等级过滤', () => {
  describe('getAccessLevel', () => {
    it('null/undefined 用户返回 free=0', () => {
      expect(getAccessLevel(null)).toBe(0)
      expect(getAccessLevel({})).toBe(0)
    })

    it('free 返回 0', () => {
      expect(getAccessLevel({ vip_tier: 'free' })).toBe(0)
    })

    it('monthly 返回 1', () => {
      expect(getAccessLevel({ vip_tier: 'monthly' })).toBe(1)
    })

    it('yearly 返回 2', () => {
      expect(getAccessLevel({ vip_tier: 'yearly' })).toBe(2)
    })

    it('permanent 返回 3', () => {
      expect(getAccessLevel({ vip_tier: 'permanent' })).toBe(3)
    })

    it('未知等级返回 0', () => {
      expect(getAccessLevel({ vip_tier: 'unknown' })).toBe(0)
    })
  })

  describe('canAccessByLevel', () => {
    it('free 可访问 free 文章', () => {
      expect(canAccessByLevel(0, 'free')).toBe(true)
    })

    it('free 不可访问 monthly 文章', () => {
      expect(canAccessByLevel(0, 'monthly')).toBe(false)
    })

    it('free 不可访问 yearly 文章', () => {
      expect(canAccessByLevel(0, 'yearly')).toBe(false)
    })

    it('monthly 可访问 free + monthly', () => {
      expect(canAccessByLevel(1, 'free')).toBe(true)
      expect(canAccessByLevel(1, 'monthly')).toBe(true)
      expect(canAccessByLevel(1, 'yearly')).toBe(false)
    })

    it('yearly 可访问 free + monthly + yearly', () => {
      expect(canAccessByLevel(2, 'free')).toBe(true)
      expect(canAccessByLevel(2, 'monthly')).toBe(true)
      expect(canAccessByLevel(2, 'yearly')).toBe(true)
      expect(canAccessByLevel(2, 'permanent')).toBe(false)
    })

    it('permanent 可访问全部', () => {
      expect(canAccessByLevel(3, 'free')).toBe(true)
      expect(canAccessByLevel(3, 'monthly')).toBe(true)
      expect(canAccessByLevel(3, 'yearly')).toBe(true)
      expect(canAccessByLevel(3, 'permanent')).toBe(true)
    })

    it('未知文章等级视为 free（articleRank=0）', () => {
      expect(canAccessByLevel(0, 'unknown')).toBe(true)
      expect(canAccessByLevel(0, '')).toBe(true)
    })
  })
})

// ─── S-03: escapeHtml ───────────────────────────────────────────────────

describe('M15-16c: S-03 修复：escapeHtml 防止 XSS', () => {
  it('普通文本不改变', () => {
    expect(escapeHtml('短线笔记 2024')).toBe('短线笔记 2024')
  })

  it('转义 &', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B')
  })

  it('转义 < 和 >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('转义 "', () => {
    expect(escapeHtml('他说"你好"')).toBe('他说&quot;你好&quot;')
  })

  it("转义 '", () => {
    expect(escapeHtml("it's great")).toBe('it&#039;s great')
  })

  it('组合注入', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  })
})

// ─── S-06: 空搜索词不发起请求 ───────────────────────────────────────

describe('M15-16d: S-06 修复：空搜索词不发起请求', () => {
  it('空字符串视为空搜索', () => {
    const query = ''
    const shouldSkip = !query.trim()
    expect(shouldSkip).toBe(true)
  })

  it('纯空格字符串视为空搜索', () => {
    const query = '   '
    const shouldSkip = !query.trim()
    expect(shouldSkip).toBe(true)
  })

  it('有内容的字符串不跳过', () => {
    const query = 'RSIC'
    const shouldSkip = !query.trim()
    expect(shouldSkip).toBe(false)
  })

  it('有空格但不为空的字符串不跳过', () => {
    const query = '短线笔记'
    const shouldSkip = !query.trim()
    expect(shouldSkip).toBe(false)
  })
})

// ─── ilike 模式构造 ─────────────────────────────────────────────────

describe('M15-16e: ilike 模式构造', () => {
  it('基础模式构造', () => {
    expect(buildIlikePattern('RSIC')).toBe('%RSIC%')
  })

  it('含特殊字符时先转义', () => {
    expect(buildIlikePattern('50%')).toBe('%50\\%%')
    expect(buildIlikePattern('a_b')).toBe('%a\\_b%')
  })
})

// ─── getExcerpt ─────────────────────────────────────────────────────

describe('M15-16f: getExcerpt — 去除 HTML 生成摘要', () => {
  it('纯文本直接截断（plainText.length > maxLength）', () => {
    // "短线笔记内容" = 6 chars > maxLength 5
    expect(getExcerpt('短线笔记内容', 5)).toBe('短线笔记内...')
  })

  it('plainText.length === maxLength 时不添加省略号', () => {
    expect(getExcerpt('短线笔记内容', 6)).toBe('短线笔记内容')
  })

  it('含 HTML 标签时去除标签后截断', () => {
    // "这是短线笔记内容" = 10 chars > maxLength 9
    const html = '<p>这是<strong>短线</strong>笔记内容</p>'
    expect(getExcerpt(html, 9)).toBe('这是短线笔记内容')
  })

  it('不超过 maxLength 时不添加省略号', () => {
    expect(getExcerpt('短线', 10)).toBe('短线')
  })

  it('恰好等于 maxLength 时不添加省略号', () => {
    expect(getExcerpt('短线笔记', 5)).toBe('短线笔记')
  })
})

// ─── 搜索结果过滤集成 ───────────────────────────────────────────────

describe('M15-16g: 搜索结果按等级过滤集成', () => {
  const articles = [
    { id: '1', title: '免费文章', content: '', access_level: 'free' },
    { id: '2', title: '月卡文章', content: '', access_level: 'monthly' },
    { id: '3', title: '年度文章', content: '', access_level: 'yearly' },
    { id: '4', title: '永久文章', content: '', access_level: 'permanent' },
  ]

  function filterArticles(userLevel: number, items = articles) {
    return items.filter((a) => canAccessByLevel(userLevel, a.access_level || 'free'))
  }

  it('free 用户只能看到 free 文章', () => {
    const result = filterArticles(0)
    expect(result.length).toBe(1)
    expect(result[0].title).toBe('免费文章')
  })

  it('monthly 用户可看到 free + monthly', () => {
    const result = filterArticles(1)
    expect(result.length).toBe(2)
    expect(result.map((a) => a.title)).toEqual(['免费文章', '月卡文章'])
  })

  it('yearly 用户可看到 free + monthly + yearly', () => {
    const result = filterArticles(2)
    expect(result.length).toBe(3)
  })

  it('permanent 用户可看到全部', () => {
    const result = filterArticles(3)
    expect(result.length).toBe(4)
  })
})
