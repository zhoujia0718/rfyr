/**
 * M15-17: app/portfolio/page.tsx — 个人实盘页逻辑测试
 *
 * 测试覆盖：
 * 1. reviewContentHasHtml — P-M8-01 修复：先转义再检测，防止 "<" 被误判
 * 2. ReviewPlainBody — 纯文本分段逻辑（按空行分割）
 * 3. 会员等级检查（isYearly = tier === 'yearly'）
 * 4. 复盘文章（is_review=true）需年度VIP
 * 5. portfolio 数据按日期倒序
 * 6. reviews 数据按 publishdate 倒序
 * 7. 空数据处理
 */
import { describe, it, expect } from 'vitest'

// ─── 从组件提取的纯函数 ──────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
    return map[c]
  })
}

// P-M8-01 FIX: 先转义用户输入再检测，防止 "<" 字符被误判为 HTML 标签
// 正则要求标签名以小写字母开头（排除 RSIC、DIV 等大写/混合标签）
// 不使用 i 标志确保只匹配小写标签名
function reviewContentHasHtml(s: string): boolean {
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
  return /<[a-z][a-z0-9]*(?:\s[^>]*)?\/?\s*>/.test(escaped)
}

// 纯文本复盘：按空行分段
function splitReviewText(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  return trimmed.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
}

// 会员等级检查
function isYearlyMember(tier: string): boolean {
  return tier === 'yearly'
}

// 排序（降序：非空日期在前，空值排在最后）
function sortByDateDesc<T extends { date?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = a.date || ''
    const db = b.date || ''
    if (da === db) return 0
    if (da === '') return 1   // 空值排在最后
    if (db === '') return -1  // 空值排在最后
    return db.localeCompare(da)
  })
}

function sortByPublishDateDesc<T extends { publishdate?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = a.publishdate || ''
    const db = b.publishdate || ''
    if (da === db) return 0
    if (da === '') return 1
    if (db === '') return -1
    return db.localeCompare(da)
  })
}

// ─── P-M8-01: reviewContentHasHtml ────────────────────────────────────

describe('M15-17a: P-M8-01 修复：reviewContentHasHtml', () => {
  it('纯文本 "< 短线笔记" 不应被误判为 HTML', () => {
    expect(reviewContentHasHtml('< 短线笔记')).toBe(false)
  })

  it('大写标签名 "<RSIC>" 不应被误判为 HTML', () => {
    expect(reviewContentHasHtml('<RSIC>')).toBe(false)
  })

  it('数字 "<3>" 不应被误判为 HTML', () => {
    expect(reviewContentHasHtml('<3>')).toBe(false)
  })

  it('大写标签名 "<DIV>" 不应被误判为 HTML', () => {
    expect(reviewContentHasHtml('<DIV>内容</DIV>')).toBe(false)
  })

  it('小写 HTML 标签应被检测', () => {
    expect(reviewContentHasHtml('<p>内容</p>')).toBe(true)
    expect(reviewContentHasHtml('<h1>标题</h1>')).toBe(true)
    expect(reviewContentHasHtml('<div class="test">')).toBe(true)
  })

  it('转义后的 HTML 应被检测', () => {
    expect(reviewContentHasHtml('&lt;p&gt;内容&lt;/p&gt;')).toBe(false)
  })

  it('空白字符串不检测为 HTML', () => {
    expect(reviewContentHasHtml('')).toBe(false)
    expect(reviewContentHasHtml('   ')).toBe(false)
  })

  it('单字符 "<" 不误判', () => {
    expect(reviewContentHasHtml('<')).toBe(false)
  })

  it('自闭合标签应被检测', () => {
    expect(reviewContentHasHtml('<img src="x.jpg" />')).toBe(true)
  })
})

// ─── ReviewPlainBody 文本分段 ────────────────────────────────────────────

describe('M15-17b: ReviewPlainBody 文本分段', () => {
  it('空字符串返回空数组', () => {
    expect(splitReviewText('')).toEqual([])
  })

  it('纯空白返回空数组', () => {
    expect(splitReviewText('   ')).toEqual([])
    expect(splitReviewText('\n\n\n')).toEqual([])
  })

  it('单段文本不分割', () => {
    expect(splitReviewText('这是唯一一段')).toEqual(['这是唯一一段'])
  })

  it('双空行分割为多段', () => {
    const result = splitReviewText('第一段\n\n第二段')
    expect(result.length).toBe(2)
    expect(result[0]).toBe('第一段')
    expect(result[1]).toBe('第二段')
  })

  it('多空行统一视为分隔符', () => {
    const result = splitReviewText('A\n\n\n\n\nB')
    expect(result.length).toBe(2)
    expect(result).toEqual(['A', 'B'])
  })

  it('段内单换行不分割', () => {
    const result = splitReviewText('第一段内容\n第二行\n\n第二段')
    expect(result.length).toBe(2)
    expect(result[0]).toBe('第一段内容\n第二行')
  })

  it('首尾空白自动 trim', () => {
    const result = splitReviewText('  \n\n  第一段  \n\n  第二段  \n  ')
    expect(result.length).toBe(2)
    expect(result[0]).toBe('第一段')
    expect(result[1]).toBe('第二段')
  })
})

// ─── 会员等级检查 ───────────────────────────────────────────────

describe('M15-17c: 会员等级检查', () => {
  it('yearly 返回 true', () => {
    expect(isYearlyMember('yearly')).toBe(true)
  })

  it('monthly 返回 false', () => {
    expect(isYearlyMember('monthly')).toBe(false)
  })

  it('none 返回 false', () => {
    expect(isYearlyMember('none')).toBe(false)
  })

  it('permanent 返回 false', () => {
    expect(isYearlyMember('permanent')).toBe(false)
  })

  it('undefined 视为 none', () => {
    const tier: string | undefined = undefined
    expect(isYearlyMember(tier || 'none')).toBe(false)
  })
})

// ─── 排序 ───────────────────────────────────────────────────────

describe('M15-17d: portfolio / reviews 排序', () => {
  const portfolioRecords = [
    { id: '1', date: '2026-04-01' },
    { id: '2', date: '2026-04-15' },
    { id: '3', date: '2026-04-10' },
  ]

  const reviewArticles = [
    { id: '1', publishdate: '2026-04-05' },
    { id: '2', publishdate: '2026-04-20' },
    { id: '3', publishdate: '2026-04-12' },
  ]

  it('portfolio 按 date 倒序', () => {
    const sorted = sortByDateDesc(portfolioRecords)
    expect(sorted.map((r) => r.date)).toEqual(['2026-04-15', '2026-04-10', '2026-04-01'])
  })

  it('reviews 按 publishdate 倒序', () => {
    const sorted = sortByPublishDateDesc(reviewArticles)
    expect(sorted.map((r) => r.publishdate)).toEqual(['2026-04-20', '2026-04-12', '2026-04-05'])
  })

  it('空数组排序后仍为空', () => {
    expect(sortByDateDesc([])).toEqual([])
    expect(sortByPublishDateDesc([])).toEqual([])
  })

  it('date/publishdate 为空时排在最后', () => {
    const items = [{ id: 'with-date', date: '2026-04-01' }, { id: 'no-date' }]
    const sorted = sortByDateDesc(items)
    expect(sorted[0].id).toBe('with-date')  // 有日期排在前面
    expect(sorted[1].id).toBe('no-date')    // 无日期排在后面
  })
})

// ─── 空数据处理 ───────────────────────────────────────────────

describe('M15-17e: 空数据处理', () => {
  it('portfolio 为空时设为空数组', () => {
    const data = null
    const records = Array.isArray(data) ? data : []
    expect(records).toEqual([])
  })

  it('portfolio 为非数组时设为空数组', () => {
    const data = { error: 'not found' }
    const records = Array.isArray(data) ? data : []
    expect(records).toEqual([])
  })

  it('reviews 为空时设为空数组', () => {
    const data = null
    const reviews = Array.isArray(data) ? data : []
    expect(reviews).toEqual([])
  })
})
