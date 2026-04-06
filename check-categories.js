const { createClient } = require('@supabase/supabase-js')

// Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogctmgdomkktuynsiwmf.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkCategories() {
  try {
    // 获取所有分类
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')

    if (error) {
      console.error('Error fetching categories:', error)
      return
    }

    console.log('Categories data:')
    categories.forEach((category, index) => {
      console.log(`\nCategory ${index + 1}:`)
      console.log('ID:', category.id)
      console.log('Name:', category.name)
      console.log('Parent ID:', category.parent_id || 'N/A')
      console.log('---')
    })
  } catch (error) {
    console.error('Error:', error)
  }
}

checkCategories()