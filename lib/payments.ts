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

export async function createPayment(params: CreatePaymentParams): Promise<Payment> {
  const uid = await resolveAppUserId()
  if (!uid) throw new Error('请先登录后再提交支付')

  const payload = {
    user_id: uid,
    order_id: params.order_id,
    amount: params.amount,
    plan_type: params.plan_type,
    proof_url: params.proof_url,
    status: 'pending'
  }

  const { data, error } = await supabase
    .from('payments')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error(`创建支付记录失败: ${error.message}`)
  return data
}

export async function getPaymentsByUserId(userId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`获取支付记录失败: ${error.message}`)
  }

  return data || []
}

export async function getAllPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`获取所有支付记录失败: ${error.message}`)
  }

  return data || []
}

export async function getPendingPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`获取待审核支付记录失败: ${error.message}`)
  }

  return data || []
}

export async function updatePaymentStatus(
  paymentId: string,
  status: 'approved' | 'rejected'
): Promise<Payment> {
  // 检查用户是否已登录
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('请先登录后再操作')
  }

  const { data, error } = await supabase
    .from('payments')
    .update({ status })
    .eq('id', paymentId)
    .select()
    .single()

  if (error) {
    throw new Error(`更新支付状态失败: ${error.message}`)
  }

  return data
}

export async function approvePaymentAtomic(paymentId: string, userId: string): Promise<void> {
  // 检查用户是否已登录
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('请先登录后再操作')
  }

  const { error } = await supabase.rpc('approve_payment', {
    p_payment_id: paymentId,
    p_user_id: userId
  })

  if (error) {
    throw new Error(`原子化核销失败: ${error.message}`)
  }
}

export async function uploadPaymentProof(
  orderId: string,
  file: File
): Promise<string> {
  const uid = await resolveAppUserId()
  if (!uid) throw new Error('请先登录后再上传凭证')

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
      throw new Error('上传失败：请检查网络连接或重新登录后重试')
    }
    if (error.message.includes('duplicate key')) {
      throw new Error('上传失败：文件已存在，请重试')
    }
    if (error.message.includes('not found')) {
      throw new Error('上传失败：存储桶不存在')
    }
    throw new Error('上传失败：请稍后重试')
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('payment_proofs').getPublicUrl(filePath)
  return publicUrl
}

export function generateOrderId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `PAY${timestamp}${random}`
}
