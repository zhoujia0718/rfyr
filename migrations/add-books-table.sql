-- ============================================================
-- 书籍下载功能：books 表
-- ============================================================
-- 执行方式：在 Supabase SQL Editor 中粘贴并运行
-- 注意：download_password 明文存储，仅通过 service_role 可读
--       公开 API 查询时必须显式排除此列
-- ============================================================

CREATE TABLE IF NOT EXISTS books (
  id                UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title             TEXT         NOT NULL,
  author            TEXT,
  description       TEXT,
  cover_url         TEXT,
  file_path         TEXT         NOT NULL,  -- Supabase Storage 路径，如 books/xxx.pdf
  download_password TEXT         NOT NULL,  -- 明文下载码，仅 service_role 可读
  access_level      TEXT         NOT NULL DEFAULT 'monthly'
                                 CHECK (access_level IN ('free', 'monthly', 'yearly')),
  sort_order        INT          NOT NULL DEFAULT 0,
  published         BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_books_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS books_updated_at ON books;
CREATE TRIGGER books_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION update_books_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE books ENABLE ROW LEVEL SECURITY;

-- 公开读取（仅已发布书籍）
-- 重要：公开 API 必须显式 SELECT 列，永远不包含 download_password
CREATE POLICY "books_public_select"
  ON books
  FOR SELECT
  USING (published = true);

-- 写操作仅 service_role（通过 supabaseAdmin 客户端，绕过 RLS）
-- 无需额外 policy，service_role 默认绕过 RLS

-- ── Storage bucket（需在 Supabase Dashboard 手动创建）───────────────────────
-- Bucket 名称：book-pdfs
-- Access：Private（关闭 Public access）
-- 建议在 Dashboard > Storage > New Bucket 中创建
