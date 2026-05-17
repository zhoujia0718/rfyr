-- 给 user_profiles 表添加被邀请来源文章 ID 字段
-- 用于记录用户通过哪篇文章的邀请链接注册，注册后可免费查看该文章

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS referrer_article_id TEXT;

COMMENT ON COLUMN user_profiles.referrer_article_id IS '用户通过哪篇文章的邀请链接注册，存储文章 ID 或 short_id，注册后可免费查看该文章';
