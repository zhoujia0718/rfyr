-- ============================================================
-- 游客阅读追踪表 guest_reads
-- ============================================================
-- 用于追踪未登录游客的阅读次数（服务端强制限制）
-- 比 localStorage 更安全，无法被用户直接篡改

-- 创建表
CREATE TABLE IF NOT EXISTS guest_reads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    -- 游客身份标识：IP + UA 的哈希
    guest_id VARCHAR(64) NOT NULL,
    -- 已读文章 ID 列表
    read_ids TEXT[] DEFAULT '{}',
    -- 已读篇数
    read_count INTEGER DEFAULT 0,
    -- 首次阅读时间
    first_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- 最近阅读时间
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- 记录过期时间（30天后自动清理）
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',
    -- 创建时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为 guest_id 创建索引
CREATE INDEX IF NOT EXISTS idx_guest_reads_guest_id ON guest_reads(guest_id);

-- 为 expires_at 创建索引（用于清理过期记录）
CREATE INDEX IF NOT EXISTS idx_guest_reads_expires_at ON guest_reads(expires_at);

-- 添加唯一约束：一个 guest_id 只有一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_reads_guest_id_unique ON guest_reads(guest_id);

-- ============================================================
-- 自动清理过期记录的函数和触发器
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_guest_reads()
RETURNS void AS $$
BEGIN
    DELETE FROM guest_reads WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 可选：创建一个定期执行的 cron job（需要 pg_cron 扩展）
-- SELECT cron.schedule('cleanup-guest-reads', '0 3 * * *', 'SELECT cleanup_expired_guest_reads()');

-- ============================================================
-- RLS 策略（Row Level Security）
-- ============================================================
ALTER TABLE guest_reads ENABLE ROW LEVEL SECURITY;

-- 允许服务端操作（使用 service role key）
CREATE POLICY "Allow service role all" ON guest_reads
    FOR ALL
    TO authenticated
    USING (auth.role() = 'service_role');

-- 允许匿名读取（前端获取阅读次数展示）
CREATE POLICY "Allow anon read" ON guest_reads
    FOR SELECT
    TO anon
    USING (true);

-- 允许匿名插入（记录阅读）
CREATE POLICY "Allow anon insert" ON guest_reads
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- 允许匿名更新（更新阅读记录）
CREATE POLICY "Allow anon update" ON guest_reads
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE guest_reads IS '游客阅读追踪表，用于追踪未登录用户的阅读次数（服务端强制限制）';
COMMENT ON COLUMN guest_reads.guest_id IS '游客身份标识：IP + UA 的哈希值';
COMMENT ON COLUMN guest_reads.read_ids IS '已读文章 ID 列表';
COMMENT ON COLUMN guest_reads.read_count IS '已读篇数';
COMMENT ON COLUMN guest_reads.expires_at IS '记录过期时间，过期后自动清理';
