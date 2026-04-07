import { supabase } from './supabase'
import { resolveAppUserId } from '@/lib/app-user-id'

export interface Payment {
  id: string
  user_id: string
  order_id: string
  amount: number
  plan_type: 'weekly' | 'yearly'
  proof_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

export interface CreatePaymentParams {
  user_id: string
  order_id: string
  amount: number
  plan_type: 'weekly' | 'yearly'
  proof_url: string
}

export async function createPayment(
  params: CreatePaymentParams
): Promise<{ data: Payment | null; error: string | null }> {
  try {
    const uid = await resolveAppUserId()
    if (!uid) return { data: null, error: '请先登录后再提交支付' }

    const payload = {
      user_id: uid,
      order_id: params.order_id,
      amount: params.amount,
      plan_type: params.plan_type,
      proof_url: params.proof_url,
      status: 'pending',
    }

    const { data, error } = await supabase
      .from('payments')
      .insert(payload)
      .select()
      .single()

    if (error) return { data: null, error: `创建支付记录失败: ${error.message}` }
    return { data, error: null }
  } catch (e: any) {
    return { data: null, error: e?.message || '创建支付记录失败' }
  }
}

export async function getPaymentsByUserId(
  userId: string
): Promise<{ data: Payment[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) return { data: [], error: `获取支付记录失败: ${error.message}` }
    return { data: data || [], error: null }
  } catch (e: any) {
    return { data: [], error: e?.message || '获取支付记录失败' }
  }
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

export async function uploadPaymentProof(
  orderId: string,
  file: File
): Promise<{ data: string | null; error: string | null }> {
  try {
    const uid = await resolveAppUserId()
    if (!uid) return { data: null, error: '请先登录后再上传凭证' }

    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 10)
    const fileName = `${timestamp}_${randomStr}_${orderId}.png`
    const filePath = `payment_proofs/${fileName}`

    const { error } = await supabase.storage
      .from('payment_proofs')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      if (error.message.includes('row-level security policy')) {
        return { data: null, error: '上传失败：请检查网络连接或重新登录后重试' }
      }
      if (error.message.includes('duplicate key')) {
        return { data: null, error: '上传失败：文件已存在，请重试' }
      }
      if (error.message.includes('not found')) {
        return { data: null, error: '上传失败：存储桶不存在' }
      }
      return { data: null, error: `上传失败: ${error.message}` }
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('payment_proofs').getPublicUrl(filePath)
    return { data: publicUrl, error: null }
  } catch (e: any) {
    return { data: null, error: e?.message || '上传失败' }
  }
}

export function generateOrderId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `PAY${timestamp}${random}`
}
