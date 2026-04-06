const { createClient } = require('@supabase/supabase-js');

// Supabase配置
const supabaseUrl = 'https://ogctmgdomkktuynsiwmf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA';

const supabase = createClient(supabaseUrl, supabaseKey);

// 测试发送验证码
async function testSendOtp() {
  console.log('Testing Send OTP...');
  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      email: 'test123@gmail.com',
      options: {
        emailRedirectTo: 'http://localhost:3000'
      }
    });

    if (error) {
      console.error('Send OTP error:', error);
    } else {
      console.log('Send OTP successful:', data);
    }
  } catch (error) {
    console.error('Send OTP failed:', error);
  }
}

// 运行测试
testSendOtp();