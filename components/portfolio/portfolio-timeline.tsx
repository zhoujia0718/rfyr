"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, PieChart, BarChart3, Clock } from "lucide-react"
import Link from "next/link"

interface PortfolioTimelineProps {
  records: any[]
  selectedDate?: string | null
}

export function PortfolioTimeline({ records, selectedDate }: PortfolioTimelineProps) {
  if (records.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Clock className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">暂无记录</p>
        <p className="text-sm mt-1">选择其他日期或切换视图查看</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {records.map((record, index) => {
        const idx = record.index_change?.[0]
        const isUp = idx ? idx.change_pct >= 0 : true
        const account = record.account_summary

        return (
          <Link key={record.id || index} href={`/portfolio/${record.short_id || record.id}`} className="block">
            <Card className="overflow-hidden hover:shadow-md transition-all hover:border-primary/30 cursor-pointer group">
              {/* 顶部：日期 + 指数涨跌条 */}
              <div className={cn(
                "px-5 py-3 flex items-center justify-between",
                isUp ? "bg-red-50 border-b border-red-100" : "bg-green-50 border-b border-green-100"
              )}>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-foreground">{record.date}</span>
                  {record.title && (
                    <span className="text-sm text-muted-foreground">{record.title}</span>
                  )}
                </div>
                
                {/* 指数涨跌 */}
                <div className="flex items-center gap-2">
                  {record.index_change?.slice(0, 3).map((item: any, i: number) => {
                    const idxUp = item.change_pct >= 0
                    return (
                      <div key={i} className="flex items-center gap-1 px-2 py-1 rounded bg-white/80">
                        <span className="text-xs text-muted-foreground">{item.name}</span>
                        <span className={cn(
                          "text-xs font-bold",
                          idxUp ? "text-red-600" : "text-green-600"
                        )}>
                          {idxUp ? "+" : ""}{item.change_pct.toFixed(2)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <CardContent className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* 账户总览 */}
                  {account && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        {isUp ? <TrendingUp className="h-4 w-4 text-red-500" /> : <TrendingDown className="h-4 w-4 text-green-500" />}
                        账户总览
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">总市值</span>
                          <span className="text-sm font-bold">¥{account.total_value?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">总盈亏</span>
                          <span className={cn(
                            "text-sm font-bold",
                            account.total_profit_loss >= 0 ? "text-red-600" : "text-green-600"
                          )}>
                            {account.total_profit_loss >= 0 ? "+" : ""}¥{account.total_profit_loss?.toLocaleString()}
                            ({account.total_profit_loss >= 0 ? "+" : ""}{account.profit_pct?.toFixed(2)}%)
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">仓位</span>
                          <Badge variant={account.position_pct >= 80 ? "destructive" : account.position_pct >= 50 ? "default" : "secondary"}
                            className="text-xs">
                            {account.position_pct?.toFixed(0)}%
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 仓位分布 */}
                  {record.position_distribution?.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <PieChart className="h-4 w-4" />
                        仓位分布
                      </div>
                      <div className="space-y-1.5">
                        {record.position_distribution.slice(0, 4).map((item: any, i: number) => {
                          // 生成颜色
                          const colors = ["bg-red-400", "bg-blue-400", "bg-yellow-400", "bg-green-400", "bg-purple-400"]
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <div className={cn("w-2 h-2 rounded-full shrink-0", colors[i % colors.length])} />
                              <span className="text-xs flex-1 truncate">{item.name}</span>
                              <span className="text-xs font-medium">{item.pct?.toFixed(1)}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 当日操作 */}
                  {record.operations?.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <BarChart3 className="h-4 w-4" />
                        操作记录
                      </div>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {record.operations.slice(0, 4).map((op: any, i: number) => {
                          const isBuy = op.action.includes("买") || op.action.includes("开")
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground shrink-0">{op.time}</span>
                              <Badge variant={isBuy ? "destructive" : "default"} className={cn(
                                "text-[10px] px-1 py-0 shrink-0",
                                !isBuy && "bg-green-100 text-green-700 border-green-200"
                              )}>
                                {op.action}
                              </Badge>
                              <span className="truncate font-medium">{op.stock_name || op.stock_code}</span>
                              <span className="text-muted-foreground ml-auto shrink-0">
                                ¥{op.price}×{op.quantity}
                              </span>
                            </div>
                          )
                        })}
                        {record.operations.length > 4 && (
                          <div className="text-xs text-muted-foreground text-center">
                            +{record.operations.length - 4} 条操作
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 查看详情 */}
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    查看详细实盘记录 &rarr;
                  </div>
                  {record.images?.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">{record.images.length} 张截图</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
