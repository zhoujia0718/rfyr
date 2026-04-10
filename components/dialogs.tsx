/**
 * 所有重型 Dialog 组件的统一懒加载导出。
 * 各使用处不再直接 import，改从本文件做 dynamic import。
 * 这样重型库（jspdf/html2canvas 等）只在弹窗打开时才加载。
 */

import dynamic from "next/dynamic"

// ------------------------------------------------------------------
// UpgradeDialog
// ------------------------------------------------------------------
export const UpgradeDialog = dynamic(
  () => import("./upgrade-dialog").then((m) => m.UpgradeDialog),
  { ssr: false, loading: () => null }
)

// ------------------------------------------------------------------
// PaymentDialog (payment-dialog-new.tsx)
// ------------------------------------------------------------------
export const PaymentDialog = dynamic(
  () => import("./payment-dialog-new").then((m) => m.PaymentDialog),
  { ssr: false, loading: () => null }
)

// ------------------------------------------------------------------
// RedeemDialog
// ------------------------------------------------------------------
export const RedeemDialog = dynamic(
  () => import("./redeem-dialog").then((m) => m.RedeemDialog),
  { ssr: false, loading: () => null }
)

// ------------------------------------------------------------------
// WechatDialog
// ------------------------------------------------------------------
export const WechatDialog = dynamic(
  () => import("./wechat-dialog").then((m) => m.WechatDialog),
  { ssr: false, loading: () => null }
)

// ------------------------------------------------------------------
// LoginForm
// ------------------------------------------------------------------
export const LoginForm = dynamic(
  () => import("./auth/login-form").then((m) => m.LoginForm),
  { ssr: false, loading: () => null }
)

