'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface NdDropdownProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'end'
}

export function NdDropdown({ trigger, children, align = 'end' }: NdDropdownProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escHandler)
    }
  }, [open])

  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const top = rect.bottom + 4
    const left = align === 'end' ? rect.right : rect.left
    setPos({ top, left })
  }, [open, align])

  return (
    <>
      <div ref={triggerRef} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} style={{ display: 'inline-flex' }}>
        {trigger}
      </div>
      {open && createPortal(
        <div
          ref={menuRef}
          className="nd-dropdown-portal"
          style={{
            position: 'fixed',
            top: pos.top,
            left: align === 'end' ? undefined : pos.left,
            right: align === 'end' ? window.innerWidth - pos.left : undefined,
            zIndex: 9999,
            background: '#FFFFFF',
            border: '1px solid #E8E9EF',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
            borderRadius: 10,
            padding: 4,
            minWidth: 160,
            animation: 'fadeIn 100ms ease',
          }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}

interface NdDropdownItemProps {
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
  className?: string
  danger?: boolean
  id?: string
}

export function NdDropdownItem({ children, onClick, className, danger, id }: NdDropdownItemProps) {
  return (
    <button
      id={id}
      onClick={(e) => { e.stopPropagation(); onClick?.(e) }}
      className={`nd-dropdown-item-custom ${danger ? 'nd-dropdown-item-custom-danger' : ''} ${className ?? ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 10px',
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        fontSize: 14,
        color: danger ? '#EF4444' : '#1A1D2B',
        cursor: 'pointer',
        transition: 'background 100ms ease',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? '#FFF1F1' : '#F5F5FA'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}
