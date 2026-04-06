const { createClient } = require('@supabase/supabase-js');

// 创建 Supabase 客户端
const supabase = createClient(
  'https://ogctmgdomkktuynsiwmf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA'
);

// 检查文章表结构
async function checkArticlesTable() {
  try {
    console.log('检查文章表结构:');
    
    // 获取文章表的列信息
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_columns', { table_name: 'articles' });

    if (columnsError) {
      console.error('Error getting table columns:', columnsError);
      
      // 尝试直接获取文章数据，看看实际结构
      console.log('\n尝试获取文章数据:');
      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .limit(3);

      if (articlesError) {
        console.error('Error fetching articles:', articlesError);
      } else {
        console.log('文章数据:', articlesData);
      }
      
      return;
    }

    console.log('文章表列信息:');
    console.table(columns);

    // 获取文章数据
    console.log('\n获取文章数据:');
    const { data: articlesData, error: articlesError } = await supabase
      .from('articles')
      .select('*')
      .limit(3);

    if (articlesError) {
      console.error('Error fetching articles:', articlesError);
    } else {
      console.log('文章数据:', articlesData);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkArticlesTable();