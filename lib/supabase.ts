import { createClient } from '@supabase/supabase-js'

// Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogctmgdomkktuynsiwmf.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA'

export const supabase = createClient(supabaseUrl, supabaseKey)

// 测试连接
export async function testConnection() {
  try {
    console.log('开始测试Supabase连接...')
    
    // 测试连接
    const { data: testData, error: testError } = await supabase
      .from('articles')
      .select('*')
      .limit(1)

    if (testError) {
      console.log('Supabase connection test error:', testError)
      
      // 测试categories表
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .limit(1)
      
      if (categoriesError) {
        console.log('Categories table test error:', categoriesError)
      } else {
        console.log('Categories table test successful:', categoriesData)
      }
    } else {
      console.log('Supabase connection test successful:', testData)
    }
  } catch (error) {
    console.log('Supabase connection test failed:', error)
  }
}