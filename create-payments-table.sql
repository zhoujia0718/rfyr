-- 创建 payments 表
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id TEXT UNIQUE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('weekly', 'yearly')),
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- 创建更新时间戳的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 创建 user_profiles 表来存储用户的 VIP 状态
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  vip_status BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_profiles_vip_status ON user_profiles(vip_status);

-- 创建自动创建用户档案的触发器
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, vip_status)
  VALUES (NEW.id, FALSE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 为现有用户创建档案（如果不存在）
INSERT INTO user_profiles (id, vip_status)
SELECT id, FALSE
FROM auth.users
WHERE id NOT IN (SELECT id FROM user_profiles);

-- 创建 payment_proofs 存储桶（需要在 Supabase 控制台中手动创建）
-- 在 Supabase 控制台中：
-- 1. 进入 Storage 页面
-- 2. 创建名为 "payment_proofs" 的存储桶
-- 3. 设置为 Public（如果需要公开访问）或 Private
-- 4. 配置 RLS 策略：
--    - 允许认证用户上传自己的凭证
--    - 允许管理员查看所有凭证
