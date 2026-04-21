'use client'

import { useState, useCallback, useRef, type ReactNode } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { NdDialog, NdDialogTitle, NdDialogDescription, NdDialogFooter } from './nd-dialog'

export interface NdConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}

export function NdConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  isLoading = false,
  onConfirm,
}: NdConfirmDialogProps) {
  return (
    <NdDialog open={open} onOpenChange={onOpenChange}>
      <div className="flex items-start gap-3">
        {destructive && (
          <div
            className="mt-0.5 shrink-0 flex items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 12, background: '#FFF1F1' }}
          >
            <AlertTriangle className="w-4 h-4" style={{ color: '#EF4444' }} />
          </div>
        )}
        <div>
          <NdDialogTitle>{title}</NdDialogTitle>
          {description && <NdDialogDescription>{description}</NdDialogDescription>}
        </div>
      </div>
      <NdDialogFooter className="mt-4">
        <button
          onClick={() => onOpenChange(false)}
          disabled={isLoading}
          className="nd-btn-outline cursor-pointer"
        >
          {cancelLabel}
        </button>
        <button
          onClick={async () => { await onConfirm() }}
          disabled={isLoading}
          className={destructive ? 'nd-btn-danger cursor-pointer' : 'nd-btn-primary cursor-pointer'}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {confirmLabel}
        </button>
      </NdDialogFooter>
    </NdDialog>
  )
}

/* ── useNdConfirm hook ────────────────────────────────────────────── */

interface UseNdConfirmOptions
  extends Omit<NdConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm' | 'isLoading'> {}

export function useNdConfirm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [opts, setOpts] = useState<UseNdConfirmOptions>({ title: '' })
  const resolveRef = useRef<(value: boolean) => void>(() => {})

  const confirm = useCallback((options: UseNdConfirmOptions): Promise<boolean> => {
    setOpts(options)
    setOpen(true)
    return new Promise<boolean>((resolve) => { resolveRef.current = resolve })
  }, [])

  const handleConfirm = useCallback(async () => {
    setLoading(true)
    try { resolveRef.current(true) } finally { setLoading(false); setOpen(false) }
  }, [])

  const handleCancel = useCallback((isOpen: boolean) => {
    if (!isOpen) { resolveRef.current(false); setOpen(false) }
  }, [])

  const ConfirmUI = (
    <NdConfirmDialog
      {...opts}
      open={open}
      onOpenChange={handleCancel}
      onConfirm={handleConfirm}
      isLoading={loading}
    />
  )

  return { confirm, ConfirmUI }
}
