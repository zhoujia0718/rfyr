-- 修改 users 表，添加 phone 和 username 字段
-- 注意：这个脚本应该在 Supabase SQL 编辑器中执行

-- 添加 phone 字段（如果不存在）
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone TEXT UNIQUE;

-- 添加 username 字段（如果不存在）
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- 添加 vip_tier 字段（如果不存在）
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS vip_tier TEXT DEFAULT 'none';

-- 修改 email 字段为可选（因为我们是用手机号注册）
ALTER TABLE users 
ALTER COLUMN email DROP NOT NULL;

-- 修改 name 字段为可选
ALTER TABLE users 
ALTER COLUMN name DROP NOT NULL;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
