/**
 * U0-01 专用测试页面：验证 DialogContent onOpenChange 不产生 React 警告
 *
 * 用途：Playwright E2E 测试专用，不用于生产。
 * 访问：/test/dialog
 *
 * 注意：Radix 的 onOpenChange 应该放在 Dialog（Root）上，不放在 Content 上。
 * 这是 Radix Compound Component 模式的标准用法。
 */
'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export default function TestDialogPage() {
  const [open, setOpen] = React.useState(false)

  return (
    <div style={{ padding: 40 }}>
      <h1>DialogContent onOpenChange 测试</h1>

      <button
        id="open-dialog"
        onClick={() => setOpen(true)}
        style={{ padding: '8px 16px', margin: '16px 0' }}
      >
        打开 Dialog
      </button>

      {/*
        Radix 标准用法：onOpenChange 只放在 Dialog（Root）上，
        Content 只负责展示。不要在 Content 上重复传递 onOpenChange。
      */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="dialog-content">
          <DialogTitle>测试弹窗</DialogTitle>
          <DialogDescription>
            这是 DialogContent 测试。如果出现 &quot;Unknown event handler property onOpenChange&quot; 警告，说明 bug 未修复。
          </DialogDescription>
          <p>这是 DialogContent 测试。</p>
          <p>如果出现 &quot;Unknown event handler property onOpenChange&quot; 警告，说明 bug 未修复。</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
