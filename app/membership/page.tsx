"use client"

import * as React from "react"
import { Check, Gift, Crown, MessageCircle } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { PaymentDialog, WechatDialog } from "@/components/dialogs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const plans = [
  {
    id: "weekly",
    name: "周卡免费会员",
    price: "0",
    originalPrice: "29",
    period: "7天",
    description: "转发任务免费开通",
    badge: "免费",
    features: [
      "投资日历查看",
      "大佬合集阅读",
      "短线笔记访问",
      "个股挖掘阅读",
    ],
    limitations: ["仅限在线阅读", "不支持PDF下载", "有效期7天"],
    action: "联系开通",
    type: "weekly-free" as const,
  },
  {
    id: "yearly",
    name: "年度VIP会员",
    price: "299",
    period: "365天",
    description: "最佳性价比",
    badge: "推荐",
    features: [
      "投资日历查看",
      "大佬合集阅读",
      "短线笔记访问",
      "个股挖掘阅读",
      "大佬合集PDF下载",
      "短线笔记PDF下载",
      "专属客服支持",
    ],
    limitations: [],
    recommended: true,
    action: "立即开通",
    type: "yearly" as const,
  },
]

export default function MembershipPage() {
  const [paymentOpen, setPaymentOpen] = React.useState(false)
  const [wechatOpen, setWechatOpen] = React.useState(false)
  const [selectedPlan, setSelectedPlan] = React.useState<string | null>(null)

  const handlePlanAction = (planId: string, planType: string) => {
    if (planType === "weekly-free") {
      // 周卡免费会员 - 打开微信二维码对话框
      setWechatOpen(true)
    } else {
      // 年度VIP - 打开支付对话框
      setSelectedPlan(planId)
      setPaymentOpen(true)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Header */}
        <section className="border-b border-border bg-secondary/30">
          <div className="mx-auto max-w-4xl px-4 py-12 text-center lg:px-8 lg:py-16">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">
              开通会员
            </h1>
            <p className="mt-3 text-muted-foreground">
              解锁全部深度内容，开启专业投资之旅
            </p>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="mx-auto max-w-4xl px-4 py-12 lg:px-8 lg:py-16">
          <div className="grid gap-6 md:grid-cols-2">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={cn(
                  "relative flex flex-col transition-shadow hover:shadow-lg",
                  plan.recommended && "border-primary shadow-md"
                )}
              >
                {/* Badge */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className={cn(
                    "rounded-full px-4 py-1 text-xs font-medium",
                    plan.type === "weekly-free" 
                      ? "bg-green-500 text-white" 
                      : "bg-primary text-primary-foreground"
                  )}>
                    {plan.badge}
                  </span>
                </div>

                <CardHeader className="text-center pt-8">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="mt-1">{plan.description}</CardDescription>
                  <div className="mt-4 flex items-baseline justify-center gap-2">
                    {plan.originalPrice && (
                      <span className="text-lg text-muted-foreground line-through">
                        ¥{plan.originalPrice}
                      </span>
                    )}
                    <span className={cn(
                      "text-4xl font-bold",
                      plan.type === "weekly-free" ? "text-green-600" : "text-primary"
                    )}>
                      ¥{plan.price}
                    </span>
                    <span className="text-muted-foreground">/{plan.period}</span>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col">
                  <ul className="flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-sm">
                        <Check className={cn(
                          "h-4 w-4 shrink-0",
                          plan.type === "weekly-free" ? "text-green-500" : "text-primary"
                        )} />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {plan.limitations.map((limitation) => (
                      <li key={limitation} className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="h-4 w-4 shrink-0" />
                        <span>{limitation}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={cn(
                      "mt-6 w-full",
                      plan.type === "weekly-free" 
                        ? "bg-green-600 hover:bg-green-700" 
                        : ""
                    )}
                    variant={plan.recommended ? "default" : "outline"}
                    size="lg"
                    onClick={() => handlePlanAction(plan.id, plan.type)}
                  >
                    {plan.type === "weekly-free" ? (
                      <>
                        <MessageCircle className="mr-2 h-4 w-4" />
                        {plan.action}
                      </>
                    ) : (
                      <>
                        <Crown className="mr-2 h-4 w-4" />
                        {plan.action}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* How to get weekly free membership */}
        <section className="border-t border-border bg-secondary/30">
          <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
            <div className="flex items-center gap-3 mb-6">
              <Gift className="h-6 w-6 text-green-600" />
              <h2 className="text-xl font-semibold text-foreground">
                如何获得周卡免费会员
              </h2>
            </div>
            <div className="space-y-4 text-muted-foreground">
              <div className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  1
                </span>
                <p>添加客服微信，获取专属转发文案和海报</p>
              </div>
              <div className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  2
                </span>
                <p>将文案和海报转发至朋友圈，保留24小时以上</p>
              </div>
              <div className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  3
                </span>
                <p>截图发送给客服，审核通过后手动开通7天会员</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
            <h2 className="mb-8 text-center text-xl font-semibold text-foreground">
              常见问题
            </h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-medium text-foreground">普通用户可以查看哪些内容？</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  普通用户可以免费查看投资日历和大佬合集的基础内容。
                </p>
              </div>
              <div>
                <h3 className="font-medium text-foreground">周卡会员和年度VIP有什么区别？</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  周卡会员可以阅读所有在线内容（包括个股挖掘），有效期7天，不支持PDF下载。年度VIP除了阅读权限外，还可以下载大佬合集和短线笔记的PDF资料（含水印），有效期365天。
                </p>
              </div>
              <div>
                <h3 className="font-medium text-foreground">PDF下载有什么限制？</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  仅年度VIP会员支持PDF文档下载。下载的PDF会自动添加您的专属水印，包含会员信息，请勿传播分享。
                </p>
              </div>
              <div>
                <h3 className="font-medium text-foreground">会员到期后会怎样？</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  会员到期后，您将恢复为普通用户权限，可以继续查看投资日历和大佬合集的基础内容。
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />

      <PaymentDialog 
        open={paymentOpen} 
        onOpenChange={setPaymentOpen}
        planId={selectedPlan}
      />
      <WechatDialog 
        open={wechatOpen} 
        onOpenChange={setWechatOpen}
      />
    </div>
  )
}
