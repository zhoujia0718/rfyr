-- 添加short_id字段到articles表
ALTER TABLE articles ADD COLUMN IF NOT EXISTS short_id TEXT UNIQUE;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_articles_short_id ON articles(short_id);