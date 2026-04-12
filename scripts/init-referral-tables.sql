-- ============================================================
-- 邀请码系统建表 SQL
-- 执行方法：打开 Supabase Dashboard → SQL Editor → 粘贴运行
-- ============================================================

-- 1. 创建 referrer_codes 表（用户邀请码）
CREATE TABLE IF NOT EXISTS referrer_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrer_codes_user_id ON referrer_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrer_codes_code ON referrer_codes(code);
ALTER TABLE referrer_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read referrer_codes" ON referrer_codes;
CREATE POLICY "Anyone can read referrer_codes" ON referrer_codes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can read own referrer code" ON referrer_codes;
CREATE POLICY "Users can read own referrer code" ON referrer_codes FOR SELECT USING (auth.uid() = user_id);

-- 2. 创建 referrals 表（邀请关系）
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_referral UNIQUE (referrer_id, referee_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_id);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Referrer can view own referrals" ON referrals;
CREATE POLICY "Referrer can view own referrals" ON referrals FOR SELECT USING (auth.uid() = referrer_id);
DROP POLICY IF EXISTS "Referee can view own referral" ON referrals;
CREATE POLICY "Referee can view own referral" ON referrals FOR SELECT USING (auth.uid() = referee_id);
DROP POLICY IF EXISTS "Anyone can insert referrals" ON referrals;
CREATE POLICY "Anyone can insert referrals" ON referrals FOR INSERT WITH CHECK (true);

-- 3. 创建 redeem_codes 表（兑换码）
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
ALTER TABLE redeem_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read redeem_codes by code" ON redeem_codes;
CREATE POLICY "Anyone can read redeem_codes by code" ON redeem_codes FOR SELECT USING (true);

-- 4. 创建新用户自动分配邀请码的触发器
CREATE OR REPLACE FUNCTION create_referrer_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO referrer_codes (user_id, code)
  VALUES (NEW.id, LOWER(SUBSTRING(NEW.id::TEXT FROM 1 FOR 8)))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created_referrer ON auth.users;
CREATE TRIGGER on_auth_user_created_referrer
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_referrer_code();

-- 5. 为现有用户补充邀请码
INSERT INTO referrer_codes (user_id, code)
SELECT id, LOWER(SUBSTRING(id::TEXT FROM 1 FOR 8))
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM referrer_codes WHERE user_id IS NOT NULL)
ON CONFLICT (user_id) DO NOTHING;

-- 6. 扩展 user_profiles 表（如还未添加）
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS weekly_free_used BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS weekly_purchase_count INTEGER DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS read_bonus INTEGER DEFAULT 0;
