-- 创建 pending_registrations 表，用于注册时的邮箱验证码暂存
CREATE TABLE IF NOT EXISTS pending_registrations (
  email TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referrer_code TEXT
);

-- 设置过期时间索引，便于清理
CREATE INDEX IF NOT EXISTS idx_pending_expires ON pending_registrations(expires_at);

-- 可选：自动清理过期记录的函数
CREATE OR REPLACE FUNCTION cleanup_expired_pending_registrations()
RETURNS void AS $$
BEGIN
  DELETE FROM pending_registrations WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 可选：定期清理（每天凌晨 3 点）
-- 需在 Supabase Dashboard > Database > Extensions 启用 pg_cron
-- SELECT cron.schedule('cleanup-pending-registrations', '0 3 * * *', $$
--   DELETE FROM pending_registrations WHERE expires_at < NOW();
-- $$);
