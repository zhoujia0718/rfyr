-- 创建 rate_limits 表用于 IP 和用户限流
-- 用于防止暴力破解邀请码、登录等场景
--
-- 修复说明：移除了无意义的 UNIQUE 约束
-- 约束 (key_type, key_value, created_at) 总是允许插入，因为 created_at 每次都不同
-- 正确的做法是依赖应用逻辑 + 时间窗口查询来计数

CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  key_type TEXT NOT NULL,          -- 'ip', 'user', 'login_ip' 等
  key_value TEXT NOT NULL,        -- IP 地址、用户 ID 或 Session Token
  reset_at TIMESTAMPTZ NOT NULL,  -- 重置时间（用于参考，实际以 created_at 为准）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引：用于查询和清理
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_type_value ON rate_limits(key_type, key_value);
CREATE INDEX IF NOT EXISTS idx_rate_limits_created_at ON rate_limits(created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at);

-- 添加每日阅读计数字段（用于月卡每日限制）
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS daily_read_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_read_date DATE;

-- RLS 策略（允许 service role 访问）
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- 允许 service role 操作
CREATE POLICY "Allow service role full access" ON rate_limits
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 允许任何人查询（用于限流检查）
CREATE POLICY "Allow public read for rate limiting" ON rate_limits
  FOR SELECT
  USING (true);

-- 允许任何人插入（用于记录限流）
CREATE POLICY "Allow public insert for rate limiting" ON rate_limits
  FOR INSERT
  WITH CHECK (true);

-- 允许任何人删除（用于清理过期记录）
CREATE POLICY "Allow public delete for rate limiting" ON rate_limits
  FOR DELETE
  USING (true);
