-- ============================================================
-- 扩展 guest_reads 表支持多分类维度
-- 执行时间：2026-04-20
--
-- 变更：
-- 1. 将 read_ids/read_count 改为 JSONB，支持按分类追踪
-- 2. read_by_category: { "notes": ["id1","id2"], "stocks": [] }
-- 3. guest_reads 表 RLS 保持 anon 全开（读/写）
-- ============================================================

-- 新增 read_by_category JSONB 字段（按分类追踪已读ID）
ALTER TABLE guest_reads
ADD COLUMN IF NOT EXISTS read_by_category JSONB DEFAULT '{}';

-- 新增 total_read_count INTEGER 字段（所有分类累计，已兼容历史 read_count）
-- read_count 保留（用于向后兼容），read_by_category 用于精确分类控制

-- 注释
COMMENT ON COLUMN guest_reads.read_by_category IS '按分类追踪已读文章ID：{"notes": ["id1","id2"], "stocks": ["id3"]}';

-- ─── 回滚 ───────────────────────────────────────────────────
-- ALTER TABLE guest_reads DROP COLUMN IF EXISTS read_by_category;
