'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

function Dialog({ children, open, onOpenChange, modal, defaultOpen }: {
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  modal?: boolean
  defaultOpen?: boolean
}) {
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      open={open}
      onOpenChange={onOpenChange}
      modal={modal}
      defaultOpen={defaultOpen}
    >
      {children}
    </DialogPrimitive.Root>
  )
}

function DialogTrigger({ children, asChild, ...props }: {
  children?: React.ReactNode
  asChild?: boolean
  [key: string]: unknown
}) {
  return (
    <DialogPrimitive.Trigger data-slot="dialog-trigger" asChild={asChild} {...props}>
      {children}
    </DialogPrimitive.Trigger>
  )
}

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <DialogPrimitive.Portal data-slot="dialog-portal">{children}</DialogPrimitive.Portal>
}

function DialogClose({ children, asChild, ...props }: {
  children?: React.ReactNode
  asChild?: boolean
  [key: string]: unknown
}) {
  return (
    <DialogPrimitive.Close data-slot="dialog-close" asChild={asChild} {...props}>
      {children}
    </DialogPrimitive.Close>
  )
}

function DialogOverlay({ className }: {
  className?: string
}) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[100] bg-black/70',
        className,
      )}
    />
  )
}

function DialogContent({ children, className, showCloseButton = true, ...props }: {
  children?: React.ReactNode
  className?: string
  showCloseButton?: boolean
  [key: string]: unknown
}) {
  React.useEffect(() => {
    document.dispatchEvent(new CustomEvent('rfyr:hide-error'))
  }, [])

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-[101] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: {
  className?: string
  [key: string]: unknown
}) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: {
  className?: string
  [key: string]: unknown
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: {
  className?: string
  [key: string]: unknown
}) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: {
  className?: string
  [key: string]: unknown
}) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
