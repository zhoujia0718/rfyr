"use client"

import * as React from "react"
import Link from "next/link"
import { Crown } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface UpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UpgradeDialog({ open, onOpenChange }: UpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 rounded-2xl border bg-background p-8 pt-10 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-pink-100">
            <Crown className="h-8 w-8 text-red-500" strokeWidth={1.5} />
          </div>
          <DialogTitle className="text-xl font-bold text-foreground leading-snug">
            个股挖掘年度VIP专享
          </DialogTitle>
          <DialogDescription className="mt-3 text-base text-muted-foreground leading-relaxed">
            升级年度VIP会员，解锁深度个股研究报告和投资机会挖掘
          </DialogDescription>
        </div>

        <div className="mt-8 flex w-full flex-col gap-3">
          <Button
            asChild
            className="h-11 w-full rounded-lg bg-[#2B57AC] text-base font-semibold text-white hover:bg-[#234a8f]"
          >
            <Link href="/membership">立即开通会员</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-lg border-border bg-background text-base font-medium text-foreground hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            稍后再说
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
