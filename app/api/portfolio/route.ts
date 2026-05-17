import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAdmin, parseAdminFromCookie } from '@/lib/server-admin-auth'

// GET: 公开接口，展示所有实盘记录（无需认证）
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const year = searchParams.get('year')
  const month = searchParams.get('month')
  const date = searchParams.get('date')
  const shortId = searchParams.get('short_id')

  const yearNum = year ? parseInt(year, 10) : NaN
  const monthNum = month ? parseInt(month, 10) : NaN

  try {
    if (shortId) {
      const { data, error } = await supabase
        .from('portfolio_records')
        .select('*')
        .eq('short_id', shortId)
        .single()
      if (error || !data) return NextResponse.json({ error: '记录不存在' }, { status: 404 })
      return NextResponse.json(data)
    }

    let query = supabase
      .from('portfolio_records')
      .select('*')

    if (date) {
      query = query.eq('date', date)
    } else if (!isNaN(yearNum) && !isNaN(monthNum) && year && month) {
      const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`
      const endDate = `${year}-${String(monthNum).padStart(2, '0')}-31`
      query = query.gte('date', startDate).lte('date', endDate)
    }

    const { data, error } = await query.order('date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  } catch {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// POST: 创建记录（仅管理员）
export async function POST(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) return authError

  const { userId } = parseAdminFromCookie(request)

  try {
    const body = await request.json()

    const ALLOWED_FIELDS = ["short_id", "title", "stock_code", "date", "type", "content", "tags", "images",
      "index_change", "position_distribution", "operations", "holdings_summary", "account_summary"]
    const sanitized: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (key in body) sanitized[key] = body[key]
    }

    if (userId) sanitized.user_id = userId

    if (!sanitized.short_id) {
      const { randomBytes } = require("crypto")
      const bytes = randomBytes(6)
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
      sanitized.short_id = Array.from(bytes as unknown as ArrayLike<number>)
        .map((b: number) => chars[b % chars.length])
        .join("")
    }

    const { data, error } = await supabase
      .from('portfolio_records')
      .insert([sanitized])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// PUT: 更新记录（仅管理员）
export async function PUT(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

    const ALLOWED_UPDATE_FIELDS = ["title", "stock_code", "date", "type", "content", "tags", "images",
      "index_change", "position_distribution", "operations", "holdings_summary", "account_summary"]
    const sanitized: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (key in updates) sanitized[key] = updates[key]
    }

    const { data, error } = await supabase
      .from('portfolio_records')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: '记录不存在' }, { status: 404 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}

// DELETE: 删除记录（仅管理员）
export async function DELETE(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) return authError

  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  try {
    const { error, data } = await supabase
      .from('portfolio_records')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: '记录不存在' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}
