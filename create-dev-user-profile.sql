-- 为开发模式创建测试用户
-- 注意：这需要 Supabase 超级管理员权限
-- 如果执行失败，请使用 Supabase 控制台的 Authentication 页面手动创建用户

-- 尝试直接插入测试用户（最简化版本）
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'dev@example.com',
  crypt('dev123456', gen_salt('dev123456')),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 为测试用户创建档案（如果触发器没有自动创建）
INSERT INTO user_profiles (id, vip_status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  FALSE
)
ON CONFLICT (id) DO NOTHING;

-- 如果上面的SQL执行失败，请使用以下替代方案：
-- 在 Supabase 控制台的 Authentication 页面中：
-- 1. 点击 "Add user"
-- 2. 输入邮箱：dev@example.com
-- 3. 输入密码：dev123456
-- 4. 点击 "Create user"
-- 5. 复制生成的用户 ID
-- 6. 修改 email-login.tsx 中的快速登录，将 userId 设置为真实的用户 ID
