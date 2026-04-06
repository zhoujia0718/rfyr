// 测试升级会员功能
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQyNTcxOSwiZXhwIjoyMDkwMDAxNzE5fQ.ko2ZYWx0fluVmJ8NB4lo_Ia1a2qZEL7CUCb7v35D5s4';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testUpgrade() {
  try {
    const userId = 'd1b81dcf-439a-44e5-9249-310b5e74a4f7'; // Julio 的用户 ID
    const planType = 'weekly'; // 周卡会员
    
    console.log('=== 测试升级会员功能 ===');
    console.log('用户 ID:', userId);
    console.log('会员类型:', planType);
    
    // 1. 先查询用户当前状态
    const { data: beforeUser, error: beforeError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (beforeError) {
      console.error('查询用户当前状态失败:', beforeError);
      return;
    }
    
    console.log('升级前用户状态:', beforeUser);
    
    // 2. 更新 users 表的 vip_tier 字段
    const { error: updateError } = await supabase
      .from('users')
      .update({ vip_tier: planType })
      .eq('id', userId);
    
    if (updateError) {
      console.error('更新 users 表失败:', updateError);
      return;
    }
    
    console.log('更新 users 表成功');
    
    // 3. 再次查询用户状态
    const { data: afterUser, error: afterError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (afterError) {
      console.error('查询用户更新后状态失败:', afterError);
      return;
    }
    
    console.log('升级后用户状态:', afterUser);
    
    if (afterUser.vip_tier === planType) {
      console.log('✅ 测试成功：会员等级已正确更新');
    } else {
      console.log('❌ 测试失败：会员等级未更新');
    }
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testUpgrade();