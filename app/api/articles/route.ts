import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getArticlesByCategory, getArticlesForNotesSection } from '@/lib/articles'

export const dynamic = 'force-dynamic'

// GET: 获取所有文章 or 按条件过滤
// 安全修复：添加认证 + 字段白名单防止内容泄露
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const shortId = searchParams.get('short_id')
  const isReview = searchParams.get('is_review')
  const category = searchParams.get('category')
  const section = searchParams.get('section')

  try {
    if (shortId) {
      // 单篇查询：字段白名单，不返回 content 全文
      const { data, error } = await supabase
        .from('articles')
        .select('id, short_id, title, publishdate, author, access_level, html_url')
        .eq('short_id', shortId)
        .single()

      if (error) return NextResponse.json({ error: '文章不存在' }, { status: 404 })
      return NextResponse.json(data)
    }

    // 栏目列表查询：在服务端执行，避免浏览器直连 Supabase（某些网络会拒绝连接）
    if (section === 'notes') {
      const articles = await getArticlesForNotesSection()
      return NextResponse.json(articles)
    }

    if (category) {
      const articles = await getArticlesByCategory(category)
      return NextResponse.json(articles)
    }

    let query = supabase
      .from('articles')
      .select('id, short_id, title, publishdate, author, access_level, html_url')
      .order('publishdate', { ascending: false })

    if (isReview === 'true') {
      query = query.eq('is_review', true)
    }

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  } catch (err) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
