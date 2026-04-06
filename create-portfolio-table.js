/**
 * 创建 portfolio_records 表的迁移脚本
 *
 * 运行方式（需要在项目根目录）：
 *   node create-portfolio-table.js
 *
 * 或者你也可以直接去 Supabase Dashboard -> SQL Editor 粘贴并执行 migrations/create-portfolio-records.sql
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ogctmgdomkktuynsiwmf.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3RtZ2RvbWtrdHV5bnNpd21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjU3MTksImV4cCI6MjA5MDAwMTcxOX0.Jv0MxL0hoZupYyQtfdp7I7k5heLQRHIbJKXptsmdewA'

const supabase = createClient(supabaseUrl, supabaseKey)

async function createTable() {
  console.log('正在连接 Supabase...')
  console.log('URL:', supabaseUrl)

  // 先检查表是否存在
  console.log('\n检查 portfolio_records 表是否存在...')
  const { data: checkData, error: checkError } = await supabase
    .from('portfolio_records')
    .select('id')
    .limit(1)

  if (!checkError) {
    console.log('✓ 表已存在，无需创建')
    return
  }

  if (checkError.code !== '42P01') {
    console.log('遇到未知错误:', checkError)
    return
  }

  console.log('表不存在，开始创建...')

  // 构造 SQL
  const sql = `
CREATE TABLE IF NOT EXISTS portfolio_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_id TEXT UNIQUE,
  date DATE NOT NULL,
  title TEXT,
  images TEXT[] DEFAULT '{}',
  content TEXT,
  index_change JSONB DEFAULT '[]',
  position_distribution JSONB DEFAULT '[]',
  operations JSONB DEFAULT '[]',
  holdings_summary JSONB DEFAULT '[]',
  account_summary JSONB DEFAULT '{"total_value":0,"total_profit_loss":0,"profit_pct":0,"position_pct":0}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_records_date ON portfolio_records(date DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_records_short_id ON portfolio_records(short_id);

CREATE OR REPLACE FUNCTION update_portfolio_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_portfolio_records_updated_at ON portfolio_records;
CREATE TRIGGER update_portfolio_records_updated_at
BEFORE UPDATE ON portfolio_records
FOR EACH ROW
EXECUTE FUNCTION update_portfolio_records_updated_at();
`.trim()

  // 使用 Supabase 的 RPC 功能执行 SQL（如果 service role key 可用）
  // 或者直接通过 pg_execute_rpc
  const { data, error } = await supabase.rpc('pg_catalog.exec', { sql })

  if (error) {
    console.log('RPC 执行失败:', error)
    console.log('\n请通过以下方式创建表：')
    console.log('方式一：在 Supabase Dashboard -> SQL Editor 中执行以下 SQL：')
    console.log('-'.repeat(60))
    console.log(sql)
    console.log('-'.repeat(60))
    console.log('\n方式二：运行 supabase CLI 命令：')
    console.log('  npx supabase db execute -f migrations/create-portfolio-records.sql')
    console.log('\n方式三：在终端中用 psql 连接 Supabase：')
    console.log('  psql "postgresql://postgres:[YOUR-PASSWORD]@db.ogctmgdomkktuynsiwmf.supabase.co:5432/postgres" -f migrations/create-portfolio-records.sql')
  } else {
    console.log('✓ 表创建成功！', data)
  }
}

createTable()
