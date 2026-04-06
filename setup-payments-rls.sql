-- 配置 payments 表的 RLS 策略（简化版本）
-- 注意：storage.objects 的 RLS 需要在 Supabase 控制台手动配置

-- 1. 启用 payments 表的 RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 2. 删除旧的策略（如果存在）
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
DROP POLICY IF EXISTS "Users can create payments" ON payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON payments;
DROP POLICY IF EXISTS "Admins can update payments" ON payments;
DROP POLICY IF EXISTS "Allow all operations" ON payments;

-- 3. 创建允许所有操作的策略（开发模式）
-- 注意：生产环境应该使用更严格的策略
CREATE POLICY "Allow all operations"
ON payments
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. 为 user_profiles 表配置 RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Allow all operations on profiles" ON user_profiles;

CREATE POLICY "Allow all operations on profiles"
ON user_profiles
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
