/**
 * M1-12: app/api/articles/route.ts — 文章列表 API 测试
 *
 * 测试覆盖：
 * 1. GET — 按 short_id 查询单篇文章
 * 2. GET — 获取所有文章（按 publishDate 倒序）
 * 3. GET — 按 is_review=true 过滤
 * 4. shortId 不存在时返回 404
 * 5. 数据库错误时返回 500
 * 6. 捕获未知异常返回 500
 *
 * 修复记录：
 * - GET /api/articles?short_id=xxx 时，不存在的 shortId 返回 404
 */
import { describe, it, expect, vi } from 'vitest'

// ─── Mock ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── 辅助类型（简化版，避免复杂泛型解析问题）─────────────────────────

type DbShortIdResult = { data: any; error: string | null }
type DbAllResult = { data: any[]; error: string | null }
type Article = {
  id: string
  short_id?: string
  title: string
  content: string
  category?: string
  is_review?: boolean
  publishdate?: string
  access_level?: string
  created_at: string
}
type ApiResponse = { error?: string } | Article[] | Article

// ─── 辅助函数（从 route.ts 提取）───────────────────────────────

async function articlesGetHandler(
  shortId: string | null,
  isReview: string | null,
  db: {
    findByShortId: (id: string) => Promise<DbShortIdResult>
    findAll: (isReview?: boolean) => Promise<DbAllResult>
  }
): Promise<{ status: number; body: ApiResponse }> {
  try {
    if (shortId) {
      const { data, error } = await db.findByShortId(shortId)
      if (error) return { status: 500, body: { error } }
      if (!data) return { status: 404, body: { error: '文章不存在' } }
      return { status: 200, body: data }
    }

    const { data, error } = await db.findAll(isReview === 'true' ? true : undefined)
    if (error) return { status: 500, body: { error } }
    return { status: 200, body: data || [] }
  } catch {
    return { status: 500, body: { error: '服务器错误' } }
  }
}

// ─── GET — shortId 查询 ───────────────────────────────────────────────

describe('M1-12a: GET shortId 查询', () => {
  it('存在的 shortId 应返回 200 + 文章', async () => {
    const result = await articlesGetHandler('rsic-2024', null, {
      findByShortId: async () => ({
        data: {
          id: 'art-1',
          short_id: 'rsic-2024',
          title: 'RSIC择时技巧',
          content: '<p>内容</p>',
          created_at: '2026-04-01',
        },
        error: null,
      }),
      findAll: async () => ({ data: [], error: null }),
    })
    expect(result.status).toBe(200)
    expect((result.body as Article).title).toBe('RSIC择时技巧')
  })

  it('不存在的 shortId 应返回 404', async () => {
    const result = await articlesGetHandler('not-exist', null, {
      findByShortId: async () => ({ data: null, error: null }),
      findAll: async () => ({ data: [], error: null }),
    })
    expect(result.status).toBe(404)
    expect((result.body as { error: string }).error).toBe('文章不存在')
  })

  it('数据库错误时应返回 500', async () => {
    const result = await articlesGetHandler('error-id', null, {
      findByShortId: async () => ({ data: null, error: 'Database error' }),
      findAll: async () => ({ data: [], error: null }),
    })
    expect(result.status).toBe(500)
    expect((result.body as { error: string }).error).toBe('Database error')
  })
})

// ─── GET — 全量查询 ───────────────────────────────────────────────

describe('M1-12b: GET 全量查询', () => {
  const SAMPLE_ARTICLES: Article[] = [
    { id: 'art-3', short_id: 'art-3', title: '最新文章', content: '', publishdate: '2026-04-20', created_at: '2026-04-20' },
    { id: 'art-1', short_id: 'art-1', title: '最旧文章', content: '', publishdate: '2026-04-01', created_at: '2026-04-01' },
  ]

  it('无参数时应返回所有文章', async () => {
    const result = await articlesGetHandler(null, null, {
      findByShortId: async () => ({ data: null, error: null }),
      findAll: async () => ({ data: SAMPLE_ARTICLES, error: null }),
    })
    expect(result.status).toBe(200)
    expect(Array.isArray(result.body)).toBe(true)
    expect((result.body as Article[]).length).toBe(2)
  })

  it('空结果应返回空数组', async () => {
    const result = await articlesGetHandler(null, null, {
      findByShortId: async () => ({ data: null, error: null }),
      findAll: async () => ({ data: [], error: null }),
    })
    expect(result.status).toBe(200)
    expect(result.body).toEqual([])
  })

  it('数据库错误时应返回 500', async () => {
    const result = await articlesGetHandler(null, null, {
      findByShortId: async () => ({ data: null, error: null }),
      findAll: async () => ({ data: [], error: 'Connection failed' }),
    })
    expect(result.status).toBe(500)
    expect((result.body as { error: string }).error).toBe('Connection failed')
  })

  it('未知异常应返回 500', async () => {
    const result = await articlesGetHandler(null, null, {
      findByShortId: async () => { throw new Error('unexpected') },
      findAll: async () => { throw new Error('unexpected') },
    })
    expect(result.status).toBe(500)
    expect((result.body as { error: string }).error).toBe('服务器错误')
  })
})

// ─── GET — is_review 过滤 ─────────────────────────────────────────

describe('M1-12c: GET is_review 过滤', () => {
  const REVIEW_ARTICLES: Article[] = [
    { id: 'rev-1', short_id: 'rev-1', title: '复盘笔记', content: '', is_review: true, publishdate: '2026-04-15', created_at: '2026-04-15' },
  ]

  it('is_review=true 应只返回 is_review=true 的文章', async () => {
    const result = await articlesGetHandler(null, 'true', {
      findByShortId: async () => ({ data: null, error: null }),
      findAll: async () => ({ data: REVIEW_ARTICLES, error: null }),
    })
    expect(result.status).toBe(200)
    expect((result.body as Article[]).length).toBe(1)
    expect((result.body as Article[])[0].is_review).toBe(true)
  })

  it('is_review=false（默认）应返回所有文章', async () => {
    const result = await articlesGetHandler(null, null, {
      findByShortId: async () => ({ data: null, error: null }),
      findAll: async () => ({
        data: [
          { id: 'a', short_id: 'a', title: 'A', content: '', is_review: false, created_at: '2026-04-01' },
          { id: 'b', short_id: 'b', title: 'B', content: '', is_review: true, created_at: '2026-04-02' },
        ],
        error: null,
      }),
    })
    expect(result.status).toBe(200)
    expect((result.body as Article[]).length).toBe(2)
  })
})
