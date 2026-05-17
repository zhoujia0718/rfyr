/**
 * 所有重型 Dialog 组件的统一懒加载导出。
 * 各使用处不再直接 import，改从本文件做 dynamic import。
 * 这样重型库只在弹窗打开时才加载。
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
// RedeemDialog
// ------------------------------------------------------------------
export const RedeemDialog = dynamic(
  () => import("./redeem-dialog").then((m) => m.RedeemDialog),
  { ssr: false, loading: () => null }
)

// ------------------------------------------------------------------
// LoginForm
// ------------------------------------------------------------------
export const LoginForm = dynamic(
  () => import("./auth/login-form").then((m) => m.LoginForm),
  { ssr: false, loading: () => null }
)
