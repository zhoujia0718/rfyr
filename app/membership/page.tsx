"use client"

import * as React from "react"
import { Check, Gift, Crown, Zap, FileText, TrendingUp, ChevronDown, Sparkles } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { RedeemDialog, WechatDialog } from "@/components/dialogs"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PlanCardProps {
  name: string
  badge: string
  period: string
  features: string[]
  limitations?: string[]
  accentColor: string
  /** 年卡略强化视觉层次 */
  emphasis?: "default" | "recommended"
  onActivate: () => void
}

function PlanCard({
  name,
  badge,
  period,
  features,
  limitations,
  accentColor,
  emphasis = "default",
  onActivate,
}: PlanCardProps) {
  const isRecommended = emphasis === "recommended"

  // 年卡 — 暖金色系
  const goldTop = "#f59e0b"
  const goldDark = "#92610a"
  const goldMid = "#b45309"
  const goldLight = "#fef9c3"
  const goldLightMid = "#fef3c7"
  const goldRing = "#f59e0b"
  const goldCheckBg = "rgba(180,83,9,0.12)"
  const goldCheck = "#b45309"
  const goldBtn1 = "#92400e"
  const goldBtn2 = "#b45309"

  // 周卡 — 冷静蓝灰色系，精致青绿
  const slateTop = "#6366f1"
  const slateDark = "#3730a3"
  const slateMid = "#4f46e5"
  const slateLight = "#eef2ff"
  const slateMid2 = "#e0e7ff"
  const slateRing = "#6366f1"
  const slateCheckBg = "rgba(99,102,241,0.12)"
  const slateCheck = "#4f46e5"
  const slateBtn1 = "#4338ca"
  const slateBtn2 = "#6366f1"

  const top = isRecommended ? goldTop : slateTop
  const dark = isRecommended ? goldDark : slateDark
  const mid = isRecommended ? goldMid : slateMid
  const light = isRecommended ? goldLight : slateLight
  const lightMid = isRecommended ? goldLightMid : slateMid2
  const ring = isRecommended ? goldRing : slateRing
  const checkBg = isRecommended ? goldCheckBg : slateCheckBg
  const check = isRecommended ? goldCheck : slateCheck
  const btn1 = isRecommended ? goldBtn1 : slateBtn1
  const btn2 = isRecommended ? goldBtn2 : slateBtn2

  return (
    <div
      className={cn(
        "relative flex min-h-[420px] flex-col overflow-hidden rounded-2xl transition-all duration-300 md:min-h-[460px]",
        isRecommended
          ? `bg-gradient-to-b from-[#fffdf5] via-[#fffdf7] to-[#fffbeb] shadow-[0_12px_48px_rgba(245,158,11,0.18),0_4px_16px_rgba(180,83,9,0.08)] ring-2 ring-amber-400/60`
          : `bg-gradient-to-b from-white via-[#f8faff] to-[#eef2ff] shadow-[0_8px_40px_rgba(99,102,241,0.1),0_2px_8px_rgba(0,0,0,0.04)] ring-1 ring-indigo-200/70`
      )}
    >
      {/* 顶部渐变条 */}
      <div
        className="h-1.5 w-full"
        style={{
          background: `linear-gradient(90deg, ${dark}, ${top}, ${dark})`,
        }}
      />

      {/* 标签区 */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold",
              isRecommended
                ? `border-amber-300 bg-gradient-to-r from-[#fef9c3] to-[#fef3c7] text-[#92610a]`
                : `border-indigo-200 bg-gradient-to-r from-indigo-50 to-indigo-100 text-[#4338ca]`
            )}
          >
            {isRecommended
              ? <Sparkles className="h-3 w-3" />
              : <Gift className="h-3 w-3" />}
            {badge}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
              isRecommended
                ? `bg-amber-50 text-[#92610a]`
                : `bg-indigo-50 text-[#4338ca]`
            )}
          >
            {period}
          </span>
        </div>
      </div>

      {/* 标题 */}
      <div className="px-6 pt-5">
        <h3 className="text-2xl font-bold tracking-tight text-[#1f2328]">{name}</h3>
        <div
          className="mt-4 h-px w-full opacity-40"
          style={{
            background: `linear-gradient(90deg, transparent, ${top}, transparent)`,
          }}
        />
      </div>

      {/* 权益列表 */}
      <div className="flex flex-1 flex-col px-6 py-8">
        <ul className="space-y-4">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-[15px] leading-snug text-[#24292f]">
              <div
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ background: checkBg }}
              >
                <Check
                  className="h-3.5 w-3.5"
                  style={{ color: check }}
                  strokeWidth={2.5}
                />
              </div>
              <span>{feature}</span>
            </li>
          ))}
          {limitations?.map((lim) => (
            <li
              key={lim}
              className="flex items-start gap-3 text-[15px] leading-snug"
              style={{ color: mid, opacity: 0.85 }}
            >
              <div
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ background: checkBg, opacity: 0.6 }}
              >
                <span className="h-1 w-1 rounded-full" style={{ background: mid, opacity: 0.6 }} />
              </div>
              <span>{lim}</span>
            </li>
          ))}
        </ul>
        <div className="flex-1 min-h-[2rem]" aria-hidden />
      </div>

      {/* 按钮 */}
      <div className="px-6 pb-7 pt-2">
        <Button
          size="lg"
          className="h-11 w-full text-sm font-semibold text-white transition-all duration-200 shadow-md hover:shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${btn1}, ${btn2})`,
            boxShadow: isRecommended
              ? `0 6px 24px rgba(180,83,9,0.3)`
              : `0 6px 24px rgba(79,70,229,0.3)`,
          }}
          onClick={onActivate}
        >
          <Crown className="mr-2 h-4 w-4" />
          兑换码开通
        </Button>
      </div>
    </div>
  )
}

const FAQS = [
  {
    q: "普通用户可以查看哪些内容？",
    a: "可免费浏览大佬合集等公开栏目；短线笔记设有免费阅读篇数上限，超出后需开通周卡或年度会员继续阅读。",
  },
  {
    q: "周卡和年卡有什么区别？",
    a: "周卡与年卡均可提升短线笔记可读篇数；年卡有效期 365 天，并额外解锁「个股挖掘」深度内容（周卡不含该项）。",
  },
  {
    q: "如何获取兑换码？",
    a: "关注公众号获取免费周卡，或通过付费购买获取（请联系客服）。",
  },
  {
    q: "会员到期后会怎样？",
    a: "到期后恢复为普通用户权限，仍可浏览免费范围内的内容。",
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div
      className="border-b border-[#d0d7de]/50 last:border-0"
      style={{ borderColor: "#d0d7de50" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left text-sm font-medium text-[#1f2328] hover:text-[#0969da] transition-colors duration-200 cursor-pointer"
      >
        {q}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            open ? "rotate-180 text-[#0969da]" : "text-[#8c959f]"
          )}
        />
      </button>
      {open && (
        <div className="pb-4 text-sm text-[#656d76] leading-relaxed">
          {a}
        </div>
      )}
    </div>
  )
}

export default function MembershipPage() {
  const [redeemOpen, setRedeemOpen] = React.useState(false)
  const [wechatOpen, setWechatOpen] = React.useState(false)
  const [selectedPlan, setSelectedPlan] = React.useState<"weekly" | "yearly">("yearly")

  const handleActivate = (plan: "weekly" | "yearly") => {
    setSelectedPlan(plan)
    setRedeemOpen(true)
  }

  const handleSuccess = () => {
    window.location.reload()
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#fafbfc]">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero — 紧凑高度 + 纯净背景 */}
        <section className="relative border-b border-amber-200/25">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(#b45309 1px, transparent 1px), linear-gradient(90deg, #b45309 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
            aria-hidden
          />
          <div className="relative mx-auto max-w-4xl px-4 py-9 text-center md:py-11 lg:px-8 lg:py-12">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/80 px-4 py-1.5 shadow-sm backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#d97706]" />
              <span className="text-xs font-semibold text-[#92400e]">
                会员专属内容
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[#1f2328] md:text-4xl lg:text-[2.65rem] lg:leading-tight">
              解锁短线笔记与深度内容
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#57606a] md:text-[15px]">
              会员核心权益为短线笔记：提升可读篇数、解锁实战复盘；年卡另含大佬合集畅读与个股挖掘深度栏目
            </p>
          </div>
        </section>

        {/* Plan Cards */}
        <section className="mx-auto max-w-3xl px-4 py-10 lg:px-8 lg:py-14">
          <div className="grid items-stretch gap-6 md:grid-cols-2 md:gap-7">
            {/* Weekly */}
            <PlanCard
              name="周卡会员"
              badge="入门"
              period="有效期 7 天"
              accentColor="#6366f1"
              emphasis="default"
              features={[
                "短线笔记（周卡额度内畅读）",
                "大佬合集在线阅读",
                "提升免费阅读上限",
              ]}
              limitations={["不含个股挖掘深度栏目"]}
              onActivate={() => handleActivate("weekly")}
            />

            {/* Yearly */}
            <PlanCard
              name="年度VIP"
              badge="推荐"
              period="有效期 365 天"
              accentColor="#f59e0b"
              emphasis="recommended"
              features={[
                "全部短线笔记在线阅读",
                "大佬合集在线畅读",
                "个股挖掘深度内容（年卡专属）",
              ]}
              onActivate={() => handleActivate("yearly")}
            />
          </div>
        </section>

        {/* Free Banner */}
        <section className="mx-auto max-w-4xl px-4 pb-14 lg:px-8">
          <button
            onClick={() => setWechatOpen(true)}
            className="group relative flex w-full items-center gap-5 rounded-2xl border border-[#d97706]/30 bg-gradient-to-r from-[#fffbeb] to-[#fef3c7] p-6 text-left transition-all duration-300 hover:border-[#d97706]/50 hover:shadow-[0_4px_20px_rgba(217,119,6,0.12)] cursor-pointer"
          >
            {/* Glow dot */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fef3c7] border border-[#fcd34d]/60 shadow-sm">
              <Gift className="h-6 w-6 text-[#d97706]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-[#92400e]">免费获取周卡</h3>
                <span className="rounded-full bg-[#fef3c7] border border-[#fcd34d] px-2 py-0.5 text-[10px] font-semibold text-[#b45309]">
                  限时
                </span>
              </div>
              <p className="mt-1 text-sm text-[#b45309]/80 leading-relaxed">
                关注公众号，完成转发任务，可免费获取 7 天周卡会员权益
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 shrink-0 text-sm font-semibold text-[#d97706] group-hover:gap-3 transition-all duration-200">
              <span>查看方式</span>
              <Zap className="h-4 w-4" />
            </div>
          </button>
        </section>

        {/* Benefits */}
        <section
          className="border-t border-[#d0d7de]/40 bg-white"
          style={{ background: "#ffffff" }}
        >
          <div className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
            <h2
              className="text-lg font-bold text-center mb-10 tracking-tight"
              style={{ color: "#1f2328" }}
            >
              会员专属权益
            </h2>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  icon: FileText,
                  title: "短线笔记",
                  desc: "会员核心权益：实战复盘、交易策略与可读篇数提升",
                  color: "#0969da",
                  bg: "#eff8ff",
                },
                {
                  icon: Crown,
                  title: "大佬合集",
                  desc: "顶尖投资者持仓与逻辑深度解读，在线畅读",
                  color: "#1a7f37",
                  bg: "#f0fdf4",
                },
                {
                  icon: TrendingUp,
                  title: "个股挖掘",
                  desc: "深度个股与机会梳理，年度VIP专属",
                  color: "#8250df",
                  bg: "#faf5ff",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col items-center text-center p-6 rounded-2xl transition-all duration-200 hover:shadow-sm"
                  style={{ background: "#fafbfc" }}
                >
                  <div
                    className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                    style={{ background: item.bg }}
                  >
                    <item.icon className="h-7 w-7" style={{ color: item.color }} />
                  </div>
                  <h3 className="font-semibold text-[#1f2328] mb-1.5">{item.title}</h3>
                  <p className="text-sm text-[#656d76] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          className="border-t border-[#d0d7de]/40 bg-[#fafbfc]"
        >
          <div className="mx-auto max-w-3xl px-4 py-16 lg:px-8">
            <h2
              className="text-lg font-bold text-center mb-8 tracking-tight"
              style={{ color: "#1f2328" }}
            >
              常见问题
            </h2>
            <div className="bg-white rounded-2xl px-6" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              {FAQS.map(({ q, a }) => (
                <FAQItem key={q} q={q} a={a} />
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />

      <RedeemDialog
        open={redeemOpen}
        onOpenChange={setRedeemOpen}
        planType={selectedPlan}
        onSuccess={handleSuccess}
      />
      <WechatDialog open={wechatOpen} onOpenChange={setWechatOpen} />
    </div>
  )
}
