-- ============================================================
-- 日富一日 微信登录 + 邀请系统 + 兑换码 完整数据库初始化
-- 执行方式：在 Supabase Dashboard → SQL Editor 中粘贴执行
-- ============================================================

-- ============================================================
-- 1. 扩展 users 表：新增 wechat_openid 字段
-- ============================================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS wechat_openid TEXT UNIQUE;

-- ============================================================
-- 2. 扩展 user_profiles 表（新增/确认字段）
--    weekly_free_used      周卡免费兑换是否已使用（每人仅 1 次）
--    weekly_purchase_count 周卡已购买次数（含免费，共最多 4 次）
--    read_bonus            邀请加成阅读篇数（普通用户+1/次，周卡+2/次）
--    free_read_count       每日免费阅读篇数上限（默认 3）
-- ============================================================
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS weekly_free_used BOOLEAN DEFAULT FALSE;

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS weekly_purchase_count INTEGER DEFAULT 0;

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS read_bonus INTEGER DEFAULT 0;

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS free_read_count INTEGER DEFAULT 3;

-- 为现有记录补默认值
UPDATE user_profiles SET weekly_free_used = FALSE WHERE weekly_free_used IS NULL;
UPDATE user_profiles SET weekly_purchase_count = 0 WHERE weekly_purchase_count IS NULL;
UPDATE user_profiles SET read_bonus = 0 WHERE read_bonus IS NULL;
UPDATE user_profiles SET free_read_count = 3 WHERE free_read_count IS NULL;

ALTER TABLE user_profiles
ALTER COLUMN weekly_free_used SET DEFAULT FALSE,
ALTER COLUMN weekly_purchase_count SET DEFAULT 0,
ALTER COLUMN read_bonus SET DEFAULT 0,
ALTER COLUMN free_read_count SET DEFAULT 3;

-- ============================================================
-- 3. 扩展 memberships 表：新增 source 字段
--    source 开通来源：purchase（付费）| redeem（兑换码）| free_task（任务）
-- ============================================================
ALTER TABLE memberships
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'purchase';

UPDATE memberships SET source = 'purchase' WHERE source IS NULL;

-- ============================================================
-- 4. 创建 wechat_login_sessions 表（微信扫码登录会话）
--    scene_id         登录二维码场景值（微信生成的临时字符串）
--    openid           用户点击菜单时的微信 openid
--    code             验证码（6位数字）
--    code_sent_at     验证码发送时间
--    code_expires_at  验证码过期时间（5分钟）
--    status           pending（待验证）| verified（已验证）| expired（已过期）| cancelled（已取消）
-- ============================================================
CREATE TABLE IF NOT EXISTS wechat_login_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scene_id TEXT NOT NULL UNIQUE,
  openid TEXT,
  code TEXT,
  code_sent_at TIMESTAMP WITH TIME ZONE,
  code_expires_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'expired', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  verified_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_wechat_sessions_scene ON wechat_login_sessions(scene_id);
CREATE INDEX IF NOT EXISTS idx_wechat_sessions_openid ON wechat_login_sessions(openid);
CREATE INDEX IF NOT EXISTS idx_wechat_sessions_status ON wechat_login_sessions(status);

-- ============================================================
-- 5. 创建 referrer_codes 表（用户邀请码表）
--    每位用户注册后自动生成唯一邀请码
--    邀请码规则：用户 UUID 前 8 位（无连字符，纯小写）
-- ============================================================
CREATE TABLE IF NOT EXISTS referrer_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrer_codes_user_id ON referrer_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrer_codes_code ON referrer_codes(code);

-- ============================================================
-- 6. 创建 referrals 表（邀请关系表）
--    记录邀请人→被邀请人的关系
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_referral UNIQUE (referrer_id, referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_id);

-- ============================================================
-- 7. 创建 redeem_codes 表（兑换码表）
--    格式：RFYR-WEEK-XXXXXX  /  RFYR-YEAR-XXXXXX
--    状态：unused（未使用）| used（已使用）| expired（已过期）
--    码生成后 3 天内必须使用
-- ============================================================
CREATE TABLE IF NOT EXISTS redeem_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('weekly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired')),
  is_free BOOLEAN DEFAULT FALSE,  -- TRUE=免费发放, FALSE=付费购买
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_code ON redeem_codes(code);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes(status);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_type ON redeem_codes(type);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_expires_at ON redeem_codes(expires_at);

-- ============================================================
-- 8. 存储过程：注册时自动创建邀请码
--    触发时机：auth.users 表 INSERT 后
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

DROP TRIGGER IF EXISTS on_auth_user_created_referrer ON auth.users;
CREATE TRIGGER on_auth_user_created_referrer
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_referrer_code();

-- ============================================================
-- 9. 存储过程：自动将未使用的过期兑换码标记为 expired
--    在 Supabase Dashboard → Database → Scheduling 中
--    设置为每小时执行一次：SELECT mark_expired_codes();
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
-- 10. 为现有用户补充邀请码（如果有用户还没邀请码的话）
-- ============================================================
INSERT INTO referrer_codes (user_id, code)
SELECT id, LOWER(SUBSTRING(id::TEXT FROM 1 FOR 8))
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM referrer_codes);

-- ============================================================
-- 11. RLS 行级安全策略
-- ============================================================

-- wechat_login_sessions RLS
ALTER TABLE wechat_login_sessions ENABLE ROW LEVEL SECURITY;

-- 所有人可按 scene_id 查询（用于前端轮询）
CREATE POLICY "Anyone can read wechat_sessions by scene"
ON wechat_login_sessions FOR SELECT
USING (true);

-- 所有人可插入（创建会话）
CREATE POLICY "Anyone can insert wechat_sessions"
ON wechat_login_sessions FOR INSERT
WITH CHECK (true);

-- 所有人可更新（验证码核销）
CREATE POLICY "Anyone can update wechat_sessions"
ON wechat_login_sessions FOR UPDATE
USING (true)
WITH CHECK (true);

-- referrer_codes RLS
ALTER TABLE referrer_codes ENABLE ROW LEVEL SECURITY;

-- 所有人可读取（注册时验证邀请码）
CREATE POLICY "Anyone can read referrer_codes"
ON referrer_codes FOR SELECT
USING (true);

-- 用户可读取自己的邀请码
CREATE POLICY "Users can read own referrer code"
ON referrer_codes FOR SELECT
USING (auth.uid() = user_id);

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

-- 所有人可按 code 查询兑换码状态
CREATE POLICY "Anyone can read redeem_codes by code"
ON redeem_codes FOR SELECT
USING (true);

-- 管理员可增删改（通过 Service Role Key）
CREATE POLICY "Admin can manage redeem_codes"
ON redeem_codes FOR ALL
USING (true);

-- ============================================================
-- 12. 创建会话清理定时任务（Supabase pg_cron 扩展）
--    每 10 分钟清理一次过期的微信登录会话
-- ============================================================
-- 注意：需要先启用 pg_cron 扩展
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- SELECT cron.schedule(
--   'cleanup-wechat-sessions',  -- 任务名
--   '*/10 * * * *',            -- 每 10 分钟执行
--   $$DELETE FROM wechat_login_sessions WHERE status IN ('expired', 'cancelled') AND created_at < NOW() - INTERVAL '1 hour'$$
-- );

-- ============================================================
-- 13. 给 users.wechat_openid 创建索引
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid ON users(wechat_openid)
WHERE wechat_openid IS NOT NULL;
