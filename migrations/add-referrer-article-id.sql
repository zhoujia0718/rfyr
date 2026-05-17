-- 给 pending_registrations 表加来源文章 ID 列
ALTER TABLE pending_registrations
ADD COLUMN IF NOT EXISTS referrer_article_id TEXT;

COMMENT ON COLUMN pending_registrations.referrer_article_id IS '被邀请人通过哪个文章页面的邀请链接注册，存储文章 ID 或 short_id，注册成功后直接设为已读';
