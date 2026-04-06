// 测试数据库表结构
const { createClient } = require('@supabase/supabase-js');

// 直接使用配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDbStructure() {
  try {
    console.log('Testing database structure...');
    
    // 测试articles表的结构
    console.log('\n=== Testing articles table ===');
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*')
      .limit(1);
    
    if (articlesError) {
      console.error('Error fetching articles:', articlesError);
    } else if (articles && articles.length > 0) {
      console.log('Articles table exists and has data');
      console.log('Article fields:', Object.keys(articles[0]));
    } else {
      console.log('Articles table exists but has no data');
    }
    
    // 测试categories表的结构
    console.log('\n=== Testing categories table ===');
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .limit(1);
    
    if (categoriesError) {
      console.error('Error fetching categories:', categoriesError);
    } else if (categories && categories.length > 0) {
      console.log('Categories table exists and has data');
      console.log('Category fields:', Object.keys(categories[0]));
    } else {
      console.log('Categories table exists but has no data');
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testDbStructure();
