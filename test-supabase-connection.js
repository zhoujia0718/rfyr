const { createClient } = require('@supabase/supabase-js');

// Supabase配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

// 测试连接
async function testConnection() {
  console.log('Testing Supabase connection...');
  try {
    // 测试基本连接
    console.log('Supabase client initialized:', !!supabase);
    
    // 测试获取用户信息
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('Auth test - User:', user);
    console.log('Auth test - Error:', authError);
    
    // 测试获取文章
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*')
      .limit(1);
    
    console.log('Articles test - Data:', articles);
    console.log('Articles test - Error:', articlesError);
    
    if (articlesError) {
      console.log('Error code:', articlesError.code);
      console.log('Error message:', articlesError.message);
    }
    
  } catch (error) {
    console.error('Test failed with exception:', error);
  }
}

// 运行测试
testConnection();