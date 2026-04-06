import { supabase } from './supabase'

export interface PortfolioRecord {
  id: string
  short_id?: string
  date: string
  title?: string
  images: string[]
  content?: string
  index_change?: unknown
  position_distribution?: unknown
  operations?: unknown
  holdings_summary?: unknown
  account_summary?: unknown
  created_at?: string
  updated_at?: string
}

// 获取所有实盘记录（按日期倒序）
export async function getPortfolioRecords(): Promise<PortfolioRecord[]> {
  const { data, error } = await supabase
    .from('portfolio_records')
    .select('*')
    .order('date', { ascending: false })

  if (error) {
    console.error('Error fetching portfolio records:', error)
    return []
  }

  return (data || []) as PortfolioRecord[]
}

// 根据短ID获取单条记录
export async function getPortfolioByShortId(shortId: string): Promise<PortfolioRecord | null> {
  const { data, error } = await supabase
    .from('portfolio_records')
    .select('*')
    .eq('short_id', shortId)
    .single()

  if (error) {
    console.error('Error fetching portfolio by short ID:', error)
    return null
  }

  return data as PortfolioRecord
}

// 根据日期获取记录
export async function getPortfolioByDate(date: string): Promise<PortfolioRecord | null> {
  const { data, error } = await supabase
    .from('portfolio_records')
    .select('*')
    .eq('date', date)
    .single()

  if (error) {
    return null
  }

  return data as PortfolioRecord
}

// 获取有记录的日期列表
export async function getPortfolioDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from('portfolio_records')
    .select('date')

  if (error) {
    console.error('Error fetching portfolio dates:', error)
    return []
  }

  return (data || []).map(d => d.date)
}

// 创建实盘记录
export async function createPortfolioRecord(record: Partial<PortfolioRecord>): Promise<PortfolioRecord | null> {
  const { data, error } = await supabase
    .from('portfolio_records')
    .insert([record])
    .select()
    .single()

  if (error) {
    console.error('Error creating portfolio record:', error)
    return null
  }

  return data as PortfolioRecord
}

// 更新实盘记录
export async function updatePortfolioRecord(id: string, record: Partial<PortfolioRecord>): Promise<PortfolioRecord | null> {
  const { data, error } = await supabase
    .from('portfolio_records')
    .update({ ...record, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating portfolio record:', error)
    return null
  }

  return data as PortfolioRecord
}

// 删除实盘记录
export async function deletePortfolioRecord(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('portfolio_records')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting portfolio record:', error)
    return false
  }

  return true
}

// 获取月份范围内的记录（用于日历标注）
export async function getPortfolioRecordsByMonth(year: number, month: number): Promise<PortfolioRecord[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`

  const { data, error } = await supabase
    .from('portfolio_records')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) {
    console.error('Error fetching portfolio records by month:', error)
    return []
  }

  return (data || []) as PortfolioRecord[]
}
