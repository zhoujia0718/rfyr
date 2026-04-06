const { createClient } = require('@supabase/supabase-js')
const { nanoid } = require('nanoid')

// Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogctmgdomkktuynsiwmf.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA'

const supabase = createClient(supabaseUrl, supabaseKey)

async function updateArticlesWithShortId() {
  try {
    // 获取所有没有short_id的文章
    const { data: articles, error } = await supabase
      .from('articles')
      .select('*')
      .is('short_id', 'null', true)

    if (error) {
      console.error('Error fetching articles:', error)
      return
    }

    console.log(`Found ${articles.length} articles without short_id`)

    // 为每篇文章生成短ID
    for (const article of articles) {
      const shortId = nanoid(8)
      
      const { error: updateError } = await supabase
        .from('articles')
        .update({ short_id: shortId })
        .eq('id', article.id)

      if (updateError) {
        console.error(`Error updating article ${article.id}:`, updateError)
      } else {
        console.log(`Updated article "${article.title}" with short_id: ${shortId}`)
      }
    }

    console.log('All articles updated successfully!')
  } catch (error) {
    console.error('Error:', error)
  }
}

updateArticlesWithShortId()