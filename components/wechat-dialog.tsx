"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface WechatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WechatDialog({ open, onOpenChange }: WechatDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">添加微信客服</DialogTitle>
          <DialogDescription className="text-center">
            扫码添加客服微信，获取免费周卡会员
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4 py-4">
          {/* 微信二维码图片 */}
          <div className="w-64 h-64 flex items-center justify-center bg-white p-2 border border-border">
            <img 
              src="/qrcode/微信图片_20260328173325_3_11.png" 
              alt="微信二维码" 
              className="w-full h-full object-contain"
            />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            扫码添加客服微信<br/>
            昵称：MX佳
          </p>
          <Button onClick={() => onOpenChange(false)} className="w-full">
            我已添加
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
