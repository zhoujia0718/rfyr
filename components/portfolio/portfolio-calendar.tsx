"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PortfolioCalendarProps {
  year: number
  month: number
  datesWithRecords: Set<string>
  records: any[]
  onDateSelect: (date: string) => void
  onMonthChange: (year: number, month: number) => void
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]

// A股指数名称（简化显示）
const INDEX_NAMES: Record<string, string> = {
  "上证指数": "上证",
  "深证成指": "深成",
  "创业板指": "创业板",
  "沪深300": "沪深300",
  "科创50": "科创50",
}

export function PortfolioCalendar({
  year,
  month,
  datesWithRecords,
  records,
  onDateSelect,
  onMonthChange,
}: PortfolioCalendarProps) {
  // 生成当月日历数据
  const calendarDays = React.useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay()
    const daysInMonth = new Date(year, month, 0).getDate()
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const days: Array<{ date: string; day: number; isToday: boolean; hasRecord: boolean; record?: any; isEmpty: boolean }> = []

    // 填充上月的空白
    for (let i = 0; i < firstDay; i++) {
      days.push({ date: "", day: 0, isToday: false, hasRecord: false, isEmpty: true })
    }

    // 当月日期
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const record = records.find(r => r.date === dateStr)
      days.push({
        date: dateStr,
        day: d,
        isToday: dateStr === todayStr,
        hasRecord: datesWithRecords.has(dateStr),
        record,
        isEmpty: false,
      })
    }

    return days
  }, [year, month, datesWithRecords, records])

  // 判断是否是交易日（有记录）
  const getRecordByDate = (dateStr: string) => records.find(r => r.date === dateStr)

  const prevMonth = () => {
    if (month === 1) {
      onMonthChange(year - 1, 12)
    } else {
      onMonthChange(year, month - 1)
    }
  }

  const nextMonth = () => {
    if (month === 12) {
      onMonthChange(year + 1, 1)
    } else {
      onMonthChange(year, month + 1)
    }
  }

  const monthName = `${year}年${month}月`

  return (
    <div className="space-y-4">
      {/* 指数涨跌提示条 */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {records.slice(0, 4).map((record) => {
          const idx = record.index_change?.[0]
          if (!idx) return null
          const isUp = idx.change_pct >= 0
          return (
            <div key={record.date} className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-md bg-secondary/60 border border-border">
              <span className="text-xs text-muted-foreground">{idx.name}</span>
              <span className={cn(
                "text-xs font-bold",
                isUp ? "text-red-500" : "text-green-500"
              )}>
                {isUp ? "+" : ""}{idx.change_pct.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>

      {/* 日历主体 - 同花顺风格 */}
      <div className="rounded-xl border border-border overflow-hidden shadow-sm bg-background">
        {/* 头部：月份导航 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm">{monthName}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* 星期标题 */}
        <div className="grid grid-cols-7 border-b border-border bg-secondary/20">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center py-2 text-xs font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>

        {/* 日期网格 */}
        <div className="grid grid-cols-7">
          {calendarDays.map((item, idx) => {
            if (item.isEmpty) {
              return <div key={`empty-${idx}`} className="min-h-[80px] border-b border-r border-border/50 bg-muted/10" />
            }

            const isUp = item.record?.index_change?.[0]?.change_pct >= 0
            const changePct = item.record?.index_change?.[0]?.change_pct

            return (
              <div
                key={item.date}
                onClick={() => item.hasRecord && onDateSelect(item.date)}
                className={cn(
                  "min-h-[80px] border-b border-r border-border/50 p-1.5 cursor-pointer transition-colors",
                  item.hasRecord ? "bg-secondary/20 hover:bg-secondary/40" : "bg-background",
                  item.isToday && "ring-2 ring-inset ring-primary/30",
                )}
              >
                {/* 日期 */}
                <div className={cn(
                  "text-xs font-medium mb-1",
                  item.isToday ? "text-primary font-bold" : "text-foreground",
                  [0, 6].includes(new Date(item.date).getDay()) && "text-muted-foreground"
                )}>
                  {item.day}
                </div>

                {/* 有记录时显示内容 */}
                {item.hasRecord && item.record && (
                  <div className="space-y-0.5">
                    {/* 红点标注 */}
                    <div className="flex items-center gap-1">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        isUp ? "bg-red-500" : "bg-green-500"
                      )} />
                      <span className="text-[10px] font-medium truncate block">
                        {item.record.index_change?.[0]?.name || "实盘"}
                      </span>
                    </div>
                    
                    {/* 涨跌幅度 */}
                    {changePct !== undefined && (
                      <div className={cn(
                        "text-[11px] font-bold leading-tight",
                        isUp ? "text-red-600" : "text-green-600"
                      )}>
                        {isUp ? "+" : ""}{changePct.toFixed(2)}%
                      </div>
                    )}

                    {/* 仓位提示 */}
                    {item.record.position_distribution?.[0] && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        仓{item.record.position_distribution[0].pct}%
                      </div>
                    )}
                  </div>
                )}

                {/* 无记录但今日 */}
                {!item.hasRecord && item.isToday && (
                  <div className="mt-1 text-[10px] text-muted-foreground">今日</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>上涨</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>下跌</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded border-2 border-primary/30" />
          <span>今日</span>
        </div>
        <div className="ml-auto text-muted-foreground/60">
          点击有记录的日期查看详情
        </div>
      </div>
    </div>
  )
}
