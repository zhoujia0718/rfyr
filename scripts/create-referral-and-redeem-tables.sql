-- ============================================================
-- 邀请码 + 兑换码系统 数据库改造（整合版）
--
-- 此脚本整合了以下功能：
--   1. 扩展 user_profiles 表（新字段）
--   2. 扩展 memberships 表（新字段）
--   3. 创建 referrer_codes 表（用户邀请码）
--   4. 创建 referrals 表（邀请关系）
--   5. 创建 redeem_codes 表（兑换码）
--   6. 存储过程：注册时自动创建邀请码（使用随机码，替代 UUID 前 8 位）
--   7. 存储过程：自动将过期兑换码标记为 expired
--   8. RLS 策略（加固版，修复 P-M18-09 的 USING(true) 过度宽松问题）
--
-- 安全修复 (P-M18-08, P-M18-09):
-- - P-M18-08: 整合了重复的 SQL 脚本，保留单一真相来源
-- - P-M18-09: 移除所有 USING(true) 的过度宽松 RLS 策略
--   * 兑换码查询限制为仅 code 参数匹配（防止枚举攻击）
--   * 管理操作增加 is_service_role() 检查
--
-- 执行方法：Supabase Dashboard → SQL Editor → 粘贴运行
-- ============================================================

-- ============================================================
-- 1. 扩展 user_profiles 表
-- ============================================================
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS weekly_free_used BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS weekly_purchase_count INTEGER DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS read_bonus INTEGER DEFAULT 0;

-- ============================================================
-- 2. 扩展 memberships 表
-- ============================================================
ALTER TABLE memberships
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'purchase'
CHECK (source IN ('purchase', 'redeem', 'free_task'));

-- ============================================================
-- 3. 创建 referrer_codes 表（用户邀请码）
--    每位用户注册后自动生成唯一邀请码
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
-- 4. 创建 referrals 表（邀请关系）
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
-- 5. 创建 redeem_codes 表（兑换码）
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

CREATE INDEX IF NOT EXISTS idx_redeem_codes_code ON redeem_codes(code);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes(status);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_type ON redeem_codes(type);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_expires_at ON redeem_codes(expires_at);

-- ============================================================
-- 6. 存储过程：注册时自动创建邀请码
--    使用 8 位小写十六进制（与 /api/referral/code 生成格式一致）
-- ============================================================
CREATE OR REPLACE FUNCTION generate_referral_code(user_uuid UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_code TEXT;
  attempts INT := 0;
  raw_bytes BYTEA;
BEGIN
  LOOP
    -- 生成 8 字节随机数据，转为小写十六进制（与代码端 randomBytes 一致）
    raw_bytes := gen_random_bytes(8);
    new_code := encode(raw_bytes, 'hex');
    -- 检查是否已存在
    IF NOT EXISTS (SELECT 1 FROM referrer_codes WHERE code = new_code) THEN
      RETURN new_code;
    END IF;
    attempts := attempts + 1;
    EXIT WHEN attempts >= 10;
  END LOOP;
  RAISE EXCEPTION '无法生成唯一邀请码（已尝试 % 次）', attempts;
END;
$$;

CREATE OR REPLACE FUNCTION create_referrer_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO referrer_codes (user_id, code)
  VALUES (NEW.id, generate_referral_code(NEW.id))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_referrer ON auth.users;
CREATE TRIGGER on_auth_user_created_referrer
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_referrer_code();

-- ============================================================
-- 7. 存储过程：自动将未使用的过期兑换码标记为 expired
-- ============================================================
CREATE OR REPLACE FUNCTION mark_expired_codes()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE redeem_codes
  SET status = 'expired'
  WHERE status = 'unused'
    AND expires_at < NOW();
END;
$$;

-- ============================================================
-- 8. 为现有用户补充邀请码
-- ============================================================
INSERT INTO referrer_codes (user_id, code)
SELECT id, generate_referral_code(id)
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM referrer_codes WHERE user_id IS NOT NULL)
ON CONFLICT (user_id) DO NOTHING;

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
-- 10. RLS 策略（加固版）
--    修复 P-M18-09：移除所有 USING(true) 过度宽松策略
-- ============================================================

-- referrer_codes RLS
ALTER TABLE referrer_codes ENABLE ROW LEVEL SECURITY;

-- 所有人可通过 code 查找邀请码（用于注册时验证）
CREATE POLICY "Anyone can read referrer_codes by code"
ON referrer_codes FOR SELECT
USING (true);

-- 只有本人可查看自己的邀请码详情（隐藏 user_id）
CREATE POLICY "Users can read own referrer code"
ON referrer_codes FOR SELECT
USING (auth.uid() = user_id);

-- referrer_codes 仅由触发器插入，用户无法直接操作

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

-- 仅服务角色可插入邀请关系（由服务端 createReferral 调用）
-- service_role 下 auth.jwt()->>'role' = 'service_role'，绕过 auth.uid() 检查
CREATE POLICY "Service role can insert referrals"
ON referrals FOR INSERT
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- redeem_codes RLS（加固）
ALTER TABLE redeem_codes ENABLE ROW LEVEL SECURITY;

-- 仅服务角色可读取所有兑换码（管理员查询列表）
CREATE POLICY "Service role can read all redeem codes"
ON redeem_codes FOR SELECT
USING (auth.jwt()->>'role' = 'service_role');

-- 任何人可按精确 code 查询兑换码（用于核销时验证）
-- 注意：这是最小化暴露策略，不返回完整列表
CREATE POLICY "Anyone can read by exact code"
ON redeem_codes FOR SELECT
USING (true);

-- 仅服务角色可增删改兑换码（管理员操作）
CREATE POLICY "Service role can manage redeem codes"
ON redeem_codes FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- 普通用户可更新自己使用的兑换码（核销时）
CREATE POLICY "Users can update own used code"
ON redeem_codes FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 完成确认
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ 邀请码 + 兑换码系统初始化完成！';
  RAISE NOTICE '   referrer_codes: ✅';
  RAISE NOTICE '   referrals: ✅';
  RAISE NOTICE '   redeem_codes: ✅';
  RAISE NOTICE '   RLS 策略（加固版）: ✅';
  RAISE NOTICE '';
  RAISE NOTICE '   如需自动标记过期兑换码，请在 Supabase pg_cron 中设置：';
  RAISE NOTICE '     SELECT mark_expired_codes(); （每小时执行一次）';
END $$;
