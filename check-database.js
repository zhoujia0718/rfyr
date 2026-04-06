// 检查数据库表结构的脚本
const { createClient } = require('@supabase/supabase-js');

// Supabase配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  try {
    console.log('开始检查数据库表结构...');
    
    // 检查 users 表
    console.log('\n检查 users 表:');
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(5);
    
    if (usersError) {
      console.error('查询 users 表失败:', usersError);
    } else {
      console.log('users 表数据:', usersData);
      console.log('users 表数据数量:', usersData.length);
    }
    
    // 检查 memberships 表
    console.log('\n检查 memberships 表:');
    const { data: membershipsData, error: membershipsError } = await supabase
      .from('memberships')
      .select('*')
      .limit(5);
    
    if (membershipsError) {
      console.error('查询 memberships 表失败:', membershipsError);
    } else {
      console.log('memberships 表数据:', membershipsData);
      console.log('memberships 表数据数量:', membershipsData.length);
    }
    
  } catch (error) {
    console.error('执行脚本出错:', error);
  }
}

checkDatabase();
