const { createClient } = require('@supabase/supabase-js')

// Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogctmgdomkktuynsiwmf.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA'

const supabase = createClient(supabaseUrl, supabaseKey)

async function addSubcategoryField() {
  try {
    // 尝试添加subcategory字段
    const { data, error } = await supabase.rpc('add_subcategory_field')
    
    if (error) {
      console.error('Error adding subcategory field:', error)
      console.log('You may need to add the field manually in Supabase console:')
      console.log('ALTER TABLE articles ADD COLUMN IF NOT EXISTS subcategory TEXT;')
    } else {
      console.log('Subcategory field added successfully:', data)
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

async function updateArticlesWithSubcategory() {
  try {
    // 更新一些文章，添加subcategory值
    const { data, error } = await supabase
      .from('articles')
      .update({ subcategory: '价值投资' })
      .eq('title', '索罗斯的反身性理论')
      .select()

    if (error) {
      console.error('Error updating article:', error)
    } else {
      console.log('Article updated successfully:', data)
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

async function checkTableStructure() {
  try {
    // 查询表结构
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .limit(1)

    if (error) {
      console.error('Error fetching table structure:', error)
    } else {
      console.log('Table structure:')
      console.log('Available columns:', Object.keys(data[0] || {}))
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

async function main() {
  console.log('Checking table structure...')
  await checkTableStructure()
  
  console.log('\nUpdating articles with subcategory...')
  await updateArticlesWithSubcategory()
  
  console.log('\nChecking updated data...')
  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .limit(5)

  if (error) {
    console.error('Error fetching articles:', error)
  } else {
    console.log('Updated articles:')
    articles.forEach((article, index) => {
      console.log(`\nArticle ${index + 1}:`)
      console.log('Title:', article.title)
      console.log('Subcategory:', article.subcategory || 'N/A')
      console.log('---')
    })
  }
}

main()