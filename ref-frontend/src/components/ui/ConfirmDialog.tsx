'use client'

import { useState, useCallback, useRef } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Presentational ConfirmDialog — use this when you manage state      */
/*  yourself (e.g. "are you sure?" before a delete button)            */
/* ------------------------------------------------------------------ */

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Dialog title */
  title: string
  /** Body description */
  description?: string
  /** Label for the destructive / confirm button (default: "Confirm") */
  confirmLabel?: string
  /** Label for the cancel button (default: "Cancel") */
  cancelLabel?: string
  /** Show destructive (red) styling on the action button */
  destructive?: boolean
  /** Shows a spinner and disables buttons while true */
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-white border-(--nd-border) text-(--nd-text-primary) max-w-md">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            {destructive && (
              <div className="mt-0.5 shrink-0 w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
            )}
            <div>
              <AlertDialogTitle className="text-base font-semibold text-white">{title}</AlertDialogTitle>
              {description && (
                <AlertDialogDescription className="mt-1.5 text-sm text-(--nd-text-muted)">
                  {description}
                </AlertDialogDescription>
              )}
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) hover:text-(--nd-text-primary) cursor-pointer"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              'cursor-pointer',
              destructive
                ? 'bg-red-600 hover:bg-red-700 text-white border-0'
                : 'bg-white text-black hover:bg-zinc-200',
            )}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/* ------------------------------------------------------------------ */
/*  useConfirm hook — promise-based replacement for window.confirm()  */
/*                                                                     */
/*  Usage:                                                             */
/*    const { confirm, ConfirmUI } = useConfirm()                     */
/*    // In JSX: <ConfirmUI />                                         */
/*    // To trigger: const ok = await confirm({ title: '...' })       */
/* ------------------------------------------------------------------ */

interface UseConfirmOptions
  extends Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm' | 'isLoading'> {}

export function useConfirm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [opts, setOpts] = useState<UseConfirmOptions>({ title: '' })
  const resolveRef = useRef<(value: boolean) => void>(() => {})

  const confirm = useCallback((options: UseConfirmOptions): Promise<boolean> => {
    setOpts(options)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const handleConfirm = useCallback(async () => {
    setLoading(true)
    try {
      resolveRef.current(true)
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }, [])

  const handleCancel = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      resolveRef.current(false)
      setOpen(false)
    }
  }, [])

  const ConfirmUI = (
    <ConfirmDialog
      {...opts}
      open={open}
      onOpenChange={handleCancel}
      onConfirm={handleConfirm}
      isLoading={loading}
    />
  )

  return { confirm, ConfirmUI }
}
