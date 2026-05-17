import { supabase } from './supabase'

export interface Payment {
  id: string
  user_id: string
  order_id: string
  amount: number
  plan_type: 'monthly' | 'yearly'
  proof_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

export async function getAllPayments(): Promise<{ data: Payment[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return { data: [], error: `获取所有支付记录失败: ${error.message}` }
    return { data: data || [], error: null }
  } catch (e: any) {
    return { data: [], error: e?.message || '获取所有支付记录失败' }
  }
}

export async function getPendingPayments(): Promise<{ data: Payment[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error)
      return { data: [], error: `获取待审核支付记录失败: ${error.message}` }
    return { data: data || [], error: null }
  } catch (e: any) {
    return { data: [], error: e?.message || '获取待审核支付记录失败' }
  }
}

export async function updatePaymentStatus(
  paymentId: string,
  status: 'approved' | 'rejected'
): Promise<{ data: Payment | null; error: string | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { data: null, error: '请先登录后再操作' }

    // BUG-LIB-06 修复：验证支付记录属于当前用户，防止越权修改他人支付
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('user_id')
      .eq('id', paymentId)
      .maybeSingle()

    if (fetchError) return { data: null, error: `查询支付记录失败: ${fetchError.message}` }
    if (!payment) return { data: null, error: '支付记录不存在' }
    if (payment.user_id !== user.id) {
      return { data: null, error: '无权操作此支付记录' }
    }

    const { data, error } = await supabase
      .from('payments')
      .update({ status })
      .eq('id', paymentId)
      .select()
      .single()

    if (error)
      return { data: null, error: `更新支付状态失败: ${error.message}` }
    return { data, error: null }
  } catch (e: any) {
    return { data: null, error: e?.message || '更新支付状态失败' }
  }
}

export async function approvePaymentAtomic(
  paymentId: string,
  userId: string
): Promise<{ data: null; error: string | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { data: null, error: '请先登录后再操作' }

    // BUG-LIB-06 修复：验证支付记录属于目标用户，防止越权批准他人支付
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('user_id')
      .eq('id', paymentId)
      .maybeSingle()

    if (fetchError) return { data: null, error: `查询支付记录失败: ${fetchError.message}` }
    if (!payment) return { data: null, error: '支付记录不存在' }
    if (payment.user_id !== userId) {
      return { data: null, error: '支付记录与用户不匹配' }
    }

    const { error } = await supabase.rpc('approve_payment', {
      p_payment_id: paymentId,
      p_user_id: userId,
    })

    if (error)
      return { data: null, error: `原子化核销失败: ${error.message}` }
    return { data: null, error: null }
  } catch (e: any) {
    return { data: null, error: e?.message || '原子化核销失败' }
  }
}
