const { createClient } = require('@supabase/supabase-js')

// Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogctmgdomkktuynsiwmf.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDatabase() {
  try {
    // 获取所有文章
    const { data: articles, error } = await supabase
      .from('articles')
      .select('*')
      .limit(5)

    if (error) {
      console.error('Error fetching articles:', error)
      return
    }

    console.log('Articles data:')
    articles.forEach((article, index) => {
      console.log(`\nArticle ${index + 1}:`)
      console.log('ID:', article.id)
      console.log('Title:', article.title)
      console.log('Category:', article.category)
      console.log('Subcategory:', article.subcategory || 'N/A')
      console.log('---')
    })
  } catch (error) {
    console.error('Error:', error)
  }
}

checkDatabase()