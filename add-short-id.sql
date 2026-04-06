-- 添加short_id字段到articles表
ALTER TABLE articles ADD COLUMN IF NOT EXISTS short_id TEXT UNIQUE;

-- 为现有文章生成short_id
-- 注意：这需要手动执行，因为PostgreSQL不支持在UPDATE中使用随机函数
-- 您可以在Supabase控制台中逐个更新文章的short_id

-- 示例：为特定文章更新short_id
-- UPDATE articles SET short_id = 'abc12345' WHERE id = 'your-article-id';