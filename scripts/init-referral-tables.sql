-- ============================================================
-- [已废弃] 邀请码系统建表 SQL
--
-- 此文件已废弃，功能已整合到：
--   scripts/create-referral-and-redeem-tables.sql
--
-- 该整合脚本包含以下改进：
--   - 统一了重复的 SQL 逻辑（init-referral-tables.sql 与
--     create-referral-and-redeem-tables.sql 完全重复）
--   - 使用随机邀请码替代 UUID 前 8 位（安全性更高）
--   - 加固了 RLS 策略（移除 USING(true) 过度宽松策略）
--
-- 请使用 scripts/create-referral-and-redeem-tables.sql 代替此文件
-- ============================================================

-- 为防止意外执行，此文件内容已被注释
-- 如果你需要运行建表，请运行：
--   scripts/create-referral-and-redeem-tables.sql

/*
-- 1. 创建 referrer_codes 表（用户邀请码）
CREATE TABLE IF NOT EXISTS referrer_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 创建 referrals 表（邀请关系）
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_referral UNIQUE (referrer_id, referee_id)
);

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
*/
