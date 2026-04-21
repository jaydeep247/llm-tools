'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface NdDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
}

export function NdDialog({ open, onOpenChange, children, className }: NdDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  if (!open) return null

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onOpenChange(false) }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-[fadeIn_150ms_ease]" />

      {/* Content */}
      <div
        className={`nd-dialog relative animate-[scaleIn_200ms_ease] ${className ?? ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 cursor-pointer"
          style={{ color: '#8B91A5', background: 'none', border: 'none', padding: 4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#1A1D2B' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#8B91A5' }}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function NdDialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={`nd-dialog-title ${className ?? ''}`}>{children}</h2>
}

export function NdDialogDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={`nd-dialog-desc ${className ?? ''}`}>{children}</p>
}

export function NdDialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`nd-dialog-footer ${className ?? ''}`}>{children}</div>
}
