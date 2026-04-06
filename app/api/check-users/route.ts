import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    // 查询用户表的结构
    const { data: schema, error: schemaError } = await supabase
      .rpc('get_table_schema', { table_name: 'users' })
    
    if (schemaError) {
      console.error('获取表结构失败:', schemaError)
    }
    
    // 查询用户数据
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
    
    if (usersError) {
      console.error('获取用户数据失败:', usersError)
    }
    
    return NextResponse.json({
      schema: schema || '无法获取表结构',
      users: users || []
    })
  } catch (error) {
    console.error('错误:', error)
    return NextResponse.json({ error: '服务器错误' }, { status: 500 })
  }
}