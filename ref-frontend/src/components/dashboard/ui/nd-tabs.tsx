'use client'

import { useState, type ReactNode } from 'react'

interface NdTabsProps {
  defaultValue: string
  children: ReactNode
  className?: string
}

interface NdTabsContextValue {
  value: string
  setValue: (v: string) => void
}

import { createContext, useContext } from 'react'
const TabsCtx = createContext<NdTabsContextValue>({ value: '', setValue: () => {} })

export function NdTabs({ defaultValue, children, className }: NdTabsProps) {
  const [value, setValue] = useState(defaultValue)
  return (
    <TabsCtx.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  )
}

interface NdTabsListProps {
  children: ReactNode
  className?: string
}

export function NdTabsList({ children, className }: NdTabsListProps) {
  return (
    <div
      className={`flex w-full gap-1 p-1 h-auto rounded-xl border ${className ?? ''}`}
      style={{ background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }}
    >
      {children}
    </div>
  )
}

interface NdTabsTriggerProps {
  value: string
  children: ReactNode
  className?: string
}

export function NdTabsTrigger({ value, children, className }: NdTabsTriggerProps) {
  const ctx = useContext(TabsCtx)
  const isActive = ctx.value === value

  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={`flex-1 rounded-lg text-xs sm:text-sm py-2 cursor-pointer font-medium transition-all ${className ?? ''}`}
      style={{
        background: isActive ? 'var(--nd-purple)' : 'transparent',
        color: isActive ? '#FFFFFF' : '#6B7188',
        boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
        border: 'none',
      }}
    >
      {children}
    </button>
  )
}

interface NdTabsContentProps {
  value: string
  children: ReactNode
  className?: string
}

export function NdTabsContent({ value, children, className }: NdTabsContentProps) {
  const ctx = useContext(TabsCtx)
  if (ctx.value !== value) return null
  return <div className={className}>{children}</div>
}
