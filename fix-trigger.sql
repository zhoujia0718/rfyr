-- 修复用户创建问题
-- 先禁用触发器，创建用户后再启用

-- 1. 禁用自动创建用户档案的触发器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. 现在可以在 Supabase 控制台中创建用户了
-- 创建用户后，请执行以下 SQL 为该用户创建档案：

-- 3. 为所有没有档案的用户创建档案
INSERT INTO user_profiles (id, vip_status)
SELECT id, FALSE
FROM auth.users
WHERE id NOT IN (SELECT id FROM user_profiles)
ON CONFLICT (id) DO NOTHING;

-- 4. 重新启用触发器（可选，如果希望新用户自动创建档案）
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION handle_new_user();
