import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET: 获取所有文章 or 按条件过滤
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const shortId = searchParams.get('short_id')
  const isReview = searchParams.get('is_review')

  try {
    if (shortId) {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('short_id', shortId)
        .single()

      if (error) return NextResponse.json({ error: '文章不存在' }, { status: 404 })
      return NextResponse.json(data)
    }

    let query = supabase.from('articles').select('*')

    if (isReview === 'true') {
      query = query.eq('is_review', true)
    }

    const { data, error } = await query.order('publishdate', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  } catch (err) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
