-- ============================================================
-- 配置 pg_cron 定时任务：每日凌晨清理过期游客阅读记录
-- 执行时间：北京时间每天 03:00（UTC 19:00）
-- 注意：需要 Supabase 项目启用 pg_cron 扩展
-- ============================================================

-- 方式一：在 SQL 中直接调度（Supabase Dashboard SQL Editor 中执行）
-- 每天北京时间 03:00 执行清理
SELECT cron.schedule(
    'cleanup-guest-reads-daily',
    '0 3 * * *',
    'SELECT cleanup_expired_guest_reads()'
);

-- ─── 验证 ───────────────────────────────────────────────────
-- SELECT cron.jobid, jobname, schedule, command FROM cron.job;

-- ─── 回滚 ───────────────────────────────────────────────────
-- SELECT cron.unschedule('cleanup-guest-reads-daily');
