/**
 * POST /api/payments/webhook
 *
 * P18 修复：支付回调 Webhook
 *
 * 接收支付平台的回调通知，验证签名后：
 * 1. 更新 payments 表状态为 approved
 * 2. 调用 activate_membership 激活对应会员
 *
 * 配置：
 *   PAYMENT_WEBHOOK_SECRET — 与支付平台共享的 HMAC-SHA256 密钥
 *   签名由平台在 X-Webhook-Signature 头中以 "sha256={hex}" 格式传递
 *
 * 幂等性：重复回调时若订单已 approved，直接返回 200。
 */
import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET

export const dynamic = "force-dynamic"

function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.error("[webhook] PAYMENT_WEBHOOK_SECRET 未配置")
    return false
  }
  // 支持 "sha256=<hex>" 格式
  const expected = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(body, "utf-8").digest("hex")}`
  return signature === expected
}

interface WebhookPayload {
  orderId: string
  userId: string
  planType: "monthly" | "yearly"
  status: "paid" | "success" | "approved"
  amount?: number
}

export async function POST(request: NextRequest) {
  // 读取原始 body（签名验证需要原始字符串）
  const rawBody = await request.text()

  // 验证签名
  const signature = request.headers.get("x-webhook-signature") ?? ""
  if (WEBHOOK_SECRET && !verifyWebhookSignature(rawBody, signature)) {
    console.warn("[webhook] 签名验证失败")
    return NextResponse.json({ error: "签名验证失败" }, { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 })
  }

  const { orderId, userId, planType } = payload
  if (!orderId || !userId || !planType) {
    return NextResponse.json({ error: "缺少必要字段: orderId, userId, planType" }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 幂等性：检查订单是否已处理
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, status, user_id")
    .eq("order_id", orderId)
    .maybeSingle()

  if (existingPayment) {
    if (existingPayment.status === "approved") {
      return NextResponse.json({ success: true, idempotent: true })
    }
    if (existingPayment.user_id !== userId) {
      console.warn(`[webhook] 订单 ${orderId} 用户不匹配`)
      return NextResponse.json({ error: "订单与用户不匹配" }, { status: 403 })
    }
    // 更新支付状态
    await supabase
      .from("payments")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("order_id", orderId)
  } else {
    // 插入新支付记录
    await supabase.from("payments").insert({
      order_id: orderId,
      user_id: userId,
      plan_type: planType,
      status: "approved",
    })
  }

  // 激活会员（调用 membership/activate 内部逻辑：使用 RPC 或降级 SQL）
  try {
    const { error: rpcError } = await supabase.rpc("activate_membership", {
      p_user_id: userId,
      p_plan_type: planType,
      p_order_id: orderId,
      p_days: planType === "yearly" ? 365 : 30,
      p_is_manual: false,
    })

    if (rpcError) {
      console.warn("[webhook] activate_membership RPC 失败，尝试降级:", rpcError)
      // 降级：直接激活（调用内部 API）
      const activateRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/membership/activate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": process.env.INTERNAL_API_SECRET ?? "",
          },
          body: JSON.stringify({ orderId, planType, manual: true }),
        }
      )
      if (!activateRes.ok) {
        console.error("[webhook] 降级激活失败:", await activateRes.text())
        return NextResponse.json({ error: "激活失败，请联系管理员" }, { status: 500 })
      }
    }
  } catch (err) {
    console.error("[webhook] 激活异常:", err)
    return NextResponse.json({ error: "激活失败，请联系管理员" }, { status: 500 })
  }

  return NextResponse.json({ success: true, orderId, userId, planType })
}
