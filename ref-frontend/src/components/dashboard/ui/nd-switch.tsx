'use client'

import { useState } from 'react'

interface NdSwitchProps {
  id?: string
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function NdSwitch({ id, checked, defaultChecked, onCheckedChange, disabled, className }: NdSwitchProps) {
  const isControlled = checked !== undefined
  const [internalChecked, setInternalChecked] = useState(defaultChecked ?? false)
  const isOn = isControlled ? checked : internalChecked

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={isOn}
      disabled={disabled}
      className={`nd-switch ${className ?? ''}`}
      onClick={() => {
        if (disabled) return
        if (!isControlled) setInternalChecked(!isOn)
        onCheckedChange?.(!isOn)
      }}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: 40,
        height: 22,
        borderRadius: 999,
        border: 'none',
        padding: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: isOn ? 'var(--nd-purple, #5347CE)' : 'var(--nd-border, #E8E9EF)',
        transition: 'background 200ms ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'block',
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          transition: 'transform 200ms ease',
          transform: isOn ? 'translateX(18px)' : 'translateX(0)',
        }}
      />
    </button>
  )
}