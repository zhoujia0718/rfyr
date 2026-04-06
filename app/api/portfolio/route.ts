import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET: 获取所有记录 or 按月份查询
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const year = searchParams.get('year')
  const month = searchParams.get('month')
  const date = searchParams.get('date')
  const shortId = searchParams.get('short_id')

  try {
    if (shortId) {
      const { data, error } = await supabase
        .from('portfolio_records')
        .select('*')
        .eq('short_id', shortId)
        .single()
      if (error) return NextResponse.json({ error: '记录不存在' }, { status: 404 })
      return NextResponse.json(data)
    }

    let query = supabase.from('portfolio_records').select('*')

    if (date) {
      query = query.eq('date', date)
    } else if (year && month) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = `${year}-${String(month).padStart(2, '0')}-31`
      query = query.gte('date', startDate).lte('date', endDate)
    }

    const { data, error } = await query.order('date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  } catch (err) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// POST: 创建记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // 如果没有 short_id，自动生成
    if (!body.short_id) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
      let short_id = ''
      for (let i = 0; i < 8; i++) {
        short_id += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      body.short_id = short_id
    }
    
    const { data, error } = await supabase
      .from('portfolio_records')
      .insert([body])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// PUT: 更新记录
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

    const { data, error } = await supabase
      .from('portfolio_records')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// DELETE: 删除记录
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  try {
    const { error } = await supabase
      .from('portfolio_records')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
