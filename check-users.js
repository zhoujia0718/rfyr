// 检查用户表数据
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQyNTcxOSwiZXhwIjoyMDkwMDAxNzE5fQ.ko2ZYWx0fluVmJ8NB4lo_Ia1a2qZEL7CUCb7v35D5s4';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkUsers() {
  try {
    console.log('=== 检查用户表数据 ===');
    
    // 查询用户表的数据
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');
    
    if (usersError) {
      console.error('查询用户数据失败:', usersError);
      return;
    }
    
    console.log('用户表数据:');
    users.forEach(user => {
      console.log(`ID: ${user.id}`);
      console.log(`用户名: ${user.username}`);
      console.log(`手机号: ${user.phone}`);
      console.log(`会员等级: ${user.vip_tier}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('错误:', error);
  }
}

checkUsers();