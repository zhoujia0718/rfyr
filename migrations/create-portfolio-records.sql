-- 创建个人实盘记录表
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
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_portfolio_records_date ON portfolio_records(date DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_records_short_id ON portfolio_records(short_id);

-- 创建更新时间触发器
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
