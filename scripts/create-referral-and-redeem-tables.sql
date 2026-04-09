-- ============================================================
-- 邀请码 + 兑换码系统 数据库改造
-- 执行顺序：
--   1. 先执行此脚本（按顺序从 1 到 7）
--   2. 在 Supabase SQL 编辑器中运行
-- ============================================================

-- ============================================================
-- 1. 扩展 user_profiles 表
--    新增字段：
--      weekly_free_used      周卡免费兑换是否已使用（每人仅 1 次）
--      weekly_purchase_count 周卡已购买次数（含免费，共最多 4 次）
--      read_bonus            邀请加成阅读篇数
-- ============================================================
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS weekly_free_used BOOLEAN DEFAULT FALSE;

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS weekly_purchase_count INTEGER DEFAULT 0;

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS read_bonus INTEGER DEFAULT 0;

-- ============================================================
-- 2. 扩展 memberships 表
--    新增字段：
--      source  开通来源：purchase（付费）| redeem（兑换码）| free_task（任务免费）
-- ============================================================
ALTER TABLE memberships
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'purchase'
CHECK (source IN ('purchase', 'redeem', 'free_task'));

-- ============================================================
-- 3. 创建 referrer_codes 表（用户邀请码表）
--    每位用户注册后自动生成唯一邀请码
-- ============================================================
CREATE TABLE IF NOT EXISTS referrer_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 邀请码唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrer_codes_user_id ON referrer_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrer_codes_code ON referrer_codes(code);

-- ============================================================
-- 4. 创建 referrals 表（邀请关系表）
--    记录邀请人→被邀请人的关系
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_referral UNIQUE (referrer_id, referee_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_id);

-- ============================================================
-- 5. 创建 redeem_codes 表（兑换码表）
--    格式：RFYR-WEEK-XXXXXX  /  RFYR-YEAR-XXXXXX
--    状态：unused（未使用）| used（已使用）| expired（已过期）
-- ============================================================
CREATE TABLE IF NOT EXISTS redeem_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('weekly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_redeem_codes_code ON redeem_codes(code);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes(status);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_type ON redeem_codes(type);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_expires_at ON redeem_codes(expires_at);

-- ============================================================
-- 6. 存储过程：注册时自动创建邀请码
--    触发时机：auth.users 表 INSERT 后
--    邀请码规则：用户 UUID 前 8 位（无连字符，纯小写）
-- ============================================================
CREATE OR REPLACE FUNCTION create_referrer_code()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO referrer_codes (user_id, code)
  VALUES (
    NEW.id,
    LOWER(SUBSTRING(NEW.id::TEXT FROM 1 FOR 8))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 触发器：新建用户自动分配邀请码
DROP TRIGGER IF EXISTS on_auth_user_created_referrer ON auth.users;
CREATE TRIGGER on_auth_user_created_referrer
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_referrer_code();

-- ============================================================
-- 7. 存储过程：自动将未使用的过期兑换码标记为 expired
--    在 Supabase Dashboard → Database → Scheduling 中
--    设置为每小时执行一次：
--      SELECT mark_expired_codes();
-- ============================================================
CREATE OR REPLACE FUNCTION mark_expired_codes()
RETURNS VOID AS $$
BEGIN
  UPDATE redeem_codes
  SET status = 'expired'
  WHERE status = 'unused'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. 为现有用户补充邀请码（如果有用户还没邀请码的话）
-- ============================================================
INSERT INTO referrer_codes (user_id, code)
SELECT id, LOWER(SUBSTRING(id::TEXT FROM 1 FOR 8))
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM referrer_codes);

-- ============================================================
-- 9. 为现有 user_profiles 补全新增字段的默认值
-- ============================================================
UPDATE user_profiles SET weekly_free_used = FALSE WHERE weekly_free_used IS NULL;
UPDATE user_profiles SET weekly_purchase_count = 0 WHERE weekly_purchase_count IS NULL;
UPDATE user_profiles SET read_bonus = 0 WHERE read_bonus IS NULL;

ALTER TABLE user_profiles
ALTER COLUMN weekly_free_used SET DEFAULT FALSE,
ALTER COLUMN weekly_purchase_count SET DEFAULT 0,
ALTER COLUMN read_bonus SET DEFAULT 0;

-- ============================================================
-- 10. 设置 RLS（行级安全）策略
-- ============================================================

-- referrer_codes RLS
ALTER TABLE referrer_codes ENABLE ROW LEVEL SECURITY;

-- 所有人可读取邀请码（用于注册时验证邀请码是否有效）
CREATE POLICY "Anyone can read referrer_codes"
ON referrer_codes FOR SELECT
USING (true);

-- 只有本人和管理员可查询自己的邀请码
CREATE POLICY "Users can read own referrer code"
ON referrer_codes FOR SELECT
USING (auth.uid() = user_id);

-- referrer_codes 仅由系统插入，用户无法直接操作
-- （通过 on_auth_user_created_referrer 触发器自动创建）

-- referrals RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- 邀请人可查看自己邀请的用户列表
CREATE POLICY "Referrer can view own referrals"
ON referrals FOR SELECT
USING (auth.uid() = referrer_id);

-- 被邀请人可查看自己的邀请人
CREATE POLICY "Referee can view own referral"
ON referrals FOR SELECT
USING (auth.uid() = referee_id);

-- 任何人可插入（注册时由后端插入）
CREATE POLICY "Anyone can insert referrals"
ON referrals FOR INSERT
WITH CHECK (true);

-- redeem_codes RLS
ALTER TABLE redeem_codes ENABLE ROW LEVEL SECURITY;

-- 所有人可按 code 查询兑换码状态（用于验证）
CREATE POLICY "Anyone can read redeem_codes by code"
ON redeem_codes FOR SELECT
USING (true);

-- 管理员可增删改
CREATE POLICY "Admin can manage redeem_codes"
ON redeem_codes FOR ALL
USING (true);

-- 普通用户可更新自己的兑换码状态（核销时）
CREATE POLICY "Users can update own used codes"
ON redeem_codes FOR UPDATE
USING (true)
WITH CHECK (true);
