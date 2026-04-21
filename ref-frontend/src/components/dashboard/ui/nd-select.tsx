'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

interface NdSelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  children: ReactNode
  placeholder?: string
  id?: string
  className?: string
  triggerStyle?: React.CSSProperties
}

interface SelectCtxValue {
  value: string
  onSelect: (value: string, label: string) => void
}

import { createContext, useContext } from 'react'
const SelectCtx = createContext<SelectCtxValue>({ value: '', onSelect: () => {} })

export function NdSelect({ value, defaultValue, onValueChange, disabled, children, placeholder, id, className, triggerStyle }: NdSelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? '')
  const [label, setLabel] = useState('')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentValue = value !== undefined ? value : internalValue

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return
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

  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }, [open])

  const handleSelect = (val: string, lbl: string) => {
    if (value === undefined) setInternalValue(val)
    setLabel(lbl)
    onValueChange?.(val)
    setOpen(false)
  }

  return (
    <SelectCtx.Provider value={{ value: currentValue, onSelect: handleSelect }}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        className={`nd-select-trigger ${className ?? ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: 42,
          padding: '0 14px',
          border: '1px solid var(--nd-border, #E8E9EF)',
          borderRadius: 10,
          background: 'var(--nd-card-bg, #FFFFFF)',
          color: label || currentValue ? 'var(--nd-text-primary, #1A1D2B)' : '#8B91A5',
          fontSize: 14,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 200ms ease',
          ...triggerStyle,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label || placeholder || currentValue || 'Select...'}
        </span>
        <ChevronDown size={14} style={{ color: '#8B91A5', flexShrink: 0, marginLeft: 8 }} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
            background: '#FFFFFF',
            border: '1px solid #E8E9EF',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
            borderRadius: 12,
            padding: 4,
            maxHeight: 240,
            overflowY: 'auto',
            animation: 'fadeIn 100ms ease',
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </SelectCtx.Provider>
  )
}

interface NdSelectItemProps {
  value: string
  children: ReactNode
  className?: string
}

export function NdSelectItem({ value, children, className }: NdSelectItemProps) {
  const ctx = useContext(SelectCtx)
  const isSelected = ctx.value === value

  return (
    <button
      type="button"
      onClick={() => ctx.onSelect(value, typeof children === 'string' ? children : value)}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        padding: '8px 12px',
        borderRadius: 8,
        border: 'none',
        background: isSelected ? '#F5F5FA' : 'transparent',
        color: '#1A1D2B',
        fontSize: 14,
        cursor: 'pointer',
        transition: 'background 100ms ease',
        textAlign: 'left',
        fontWeight: isSelected ? 500 : 400,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5FA' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#F5F5FA' : 'transparent' }}
    >
      {children}
    </button>
  )
}
