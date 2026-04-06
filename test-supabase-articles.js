const { createClient } = require('@supabase/supabase-js');

// Supabase配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

// 测试获取文章
async function testGetArticles() {
  console.log('Testing get articles...');
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching articles:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
    } else {
      console.log('Successfully fetched articles:', data);
    }
  } catch (error) {
    console.error('Exception fetching articles:', error);
  }
}

// 测试检查表是否存在
async function testCheckTable() {
  console.log('Testing check table...');
  try {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'articles')
      .eq('table_schema', 'public');

    if (error) {
      console.error('Error checking table:', error);
    } else {
      console.log('Table check result:', data);
      if (data.length === 0) {
        console.log('Articles table does not exist!');
      } else {
        console.log('Articles table exists!');
      }
    }
  } catch (error) {
    console.error('Exception checking table:', error);
  }
}

// 运行测试
testGetArticles();
testCheckTable();