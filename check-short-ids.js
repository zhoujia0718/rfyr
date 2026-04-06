const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogctmgdomkktuynsiwmf.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkShortIds() {
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('id, title, short_id')

    if (error) {
      console.error('Error:', error)
      return
    }

    console.log('Total articles:', data.length)
    console.log('')
    console.log('Articles with short_id:', data.filter(a => a.short_id).length)
    console.log('Articles without short_id:', data.filter(a => !a.short_id).length)
    console.log('')
    console.log('Sample articles:')
    data.slice(0, 5).forEach(a => {
      console.log(`  Title: ${a.title}`)
      console.log(`  ID: ${a.id}`)
      console.log(`  short_id: ${a.short_id || '(empty)'}`)
      console.log('')
    })
  } catch (error) {
    console.error('Error:', error)
  }
}

checkShortIds()
