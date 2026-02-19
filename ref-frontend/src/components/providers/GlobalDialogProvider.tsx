'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface DialogOptions {
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

interface DialogContextType {
  confirm: (options: DialogOptions) => Promise<boolean>
}

const DialogContext = createContext<DialogContextType | undefined>(undefined)

export function useGlobalDialog() {
  const context = useContext(DialogContext)
  if (!context) {
    throw new Error('useGlobalDialog must be used within a GlobalDialogProvider')
  }
  return context
}

export function GlobalDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<DialogOptions>({
    title: 'Confirm Action',
    description: 'Are you sure you want to proceed?',
    confirmText: 'Continue',
    cancelText: 'Cancel',
    variant: 'default',
  })
  const [resolver, setResolver] = useState<(value: boolean) => void>(() => {})

  const confirm = useCallback((opts: DialogOptions) => {
    setOptions({
      title: 'Confirm Action',
      description: 'Are you sure you want to proceed?',
      confirmText: 'Continue',
      cancelText: 'Cancel',
      variant: 'default',
      ...opts,
    })
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve)
    })
  }, [])

  const handleConfirm = (e: React.MouseEvent) => {
    setOpen(false)
    resolver(true)
  }

  const handleCancel = () => {
    setOpen(false)
    resolver(false)
  }

  return (
    <DialogContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={open} onOpenChange={(val) => {
        if (!val) {
          setOpen(false)
          resolver(false)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description && (
              <AlertDialogDescription>
                {options.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {options.cancelText}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={options.variant === 'destructive' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600' : ''}
            >
              {options.confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContext.Provider>
  )
}
