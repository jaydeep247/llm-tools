'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquareText,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Info,
  Search,
  ShoppingCart,
  ArrowLeftRight,
  Bot,
  PenLine,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const PROMPT_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  informational: { label: 'Informational', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: <Info className="w-3 h-3" /> },
  commercial: { label: 'Commercial', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Search className="w-3 h-3" /> },
  comparative: { label: 'Comparative', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: <ArrowLeftRight className="w-3 h-3" /> },
  transactional: { label: 'Transactional', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <ShoppingCart className="w-3 h-3" /> },
  'agent-style': { label: 'Agent-style', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: <Bot className="w-3 h-3" /> },
}

export interface GeneratedPrompt {
  prompt: string
  type: string
}

interface StepBrandPromptsProps {
  prompts: GeneratedPrompt[]
  customPrompts: string[]
  onCustomPromptsChange: (prompts: string[]) => void
  isPromptsLoading: boolean
  isSaving: boolean
  onNext: () => void
  onBack: () => void
  onSkip?: () => void
  currentStep: number
  totalSteps: number
}

export function StepBrandPrompts({
  prompts,
  customPrompts,
  onCustomPromptsChange,
  isPromptsLoading,
  isSaving,
  onNext,
  onBack,
  onSkip,
  currentStep,
  totalSteps,
}: StepBrandPromptsProps) {
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  const addCustomPrompt = () => {
    const trimmed = customPrompt.trim()
    if (!trimmed || customPrompts.includes(trimmed)) return
    onCustomPromptsChange([...customPrompts, trimmed])
    setCustomPrompt('')
    setShowCustomInput(false)
  }

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addCustomPrompt()
    }
    if (e.key === 'Escape') {
      setShowCustomInput(false)
      setCustomPrompt('')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
            <MessageSquareText className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 mb-2 tracking-tight">
          Review AI prompts
        </h2>
        <p className="text-zinc-500 text-sm leading-relaxed">
          We've generated prompts based on your topics. These are the exact queries we'll use to monitor your brand in AI responses.
        </p>
      </div>

      {/* Prompt list */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {isPromptsLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            <p className="text-sm text-zinc-400">Generating prompts from your topics…</p>
          </div>
        ) : (
          <>
            <AnimatePresence>
              {prompts.map((item, idx) => {
                const meta = PROMPT_TYPE_META[item.type] || PROMPT_TYPE_META['informational']
                return (
                  <motion.div
                    key={item.prompt}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.035 }}
                    className="w-full p-3.5 rounded-xl border border-zinc-200 bg-white"
                  >
                    <p className="text-sm text-zinc-700 leading-relaxed">
                      {item.prompt}
                    </p>
                    <div className="mt-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${meta.color}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* Custom prompts added by user */}
            {customPrompts.map((prompt, idx) => (
              <motion.div
                key={`custom-${prompt}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50"
              >
                <p className="text-sm text-zinc-700 leading-relaxed">
                  {prompt}
                </p>
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-zinc-50 text-zinc-600 border-zinc-200">
                    <PenLine className="w-3 h-3" />
                    Custom
                  </span>
                </div>
              </motion.div>
            ))}

            {/* Add custom prompt */}
            {showCustomInput ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 mt-1"
              >
                <Input
                  autoFocus
                  placeholder="Enter your own prompt…"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  className="bg-white! border-zinc-200! hover:border-zinc-300! shadow-none! text-zinc-900! placeholder:text-zinc-400! focus-visible:border-emerald-500! focus-visible:ring-2! focus-visible:ring-emerald-500/20! h-10 flex-1 text-sm rounded-xl"
                />
                <Button
                  onClick={addCustomPrompt}
                  disabled={!customPrompt.trim()}
                  size="sm"
                  className="h-10 px-4 bg-zinc-900 text-white hover:bg-zinc-700 rounded-lg text-sm"
                >
                  Add
                </Button>
              </motion.div>
            ) : (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: prompts.length * 0.035 }}
                onClick={() => setShowCustomInput(true)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-dashed border-zinc-300 text-left hover:border-zinc-400 hover:bg-zinc-50 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-400">Add your own prompt</span>
              </motion.button>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto pt-6">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={onBack}
            className="text-zinc-400 hover:text-zinc-700 transition-colors flex items-center text-sm font-medium group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Go Back
          </button>

          <div className="flex items-center gap-3">
            {onSkip && (
              <Button
                onClick={onSkip}
                variant="ghost"
                disabled={isSaving}
                className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 px-4 h-10 text-sm font-medium rounded-full"
              >
                Skip for now
              </Button>
            )}
            <Button
            onClick={onNext}
            disabled={isPromptsLoading || isSaving || (prompts.length === 0 && customPrompts.length === 0)}
            className="bg-zinc-900 text-white hover:bg-zinc-700 px-6 h-10 text-sm font-medium rounded-full transition-all shadow-lg shadow-zinc-200 flex items-center disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Finish
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
          </div>
        </div>

        {/* Progress */}
        <div className="pt-6 border-t border-zinc-200 flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx <= currentStep ? 'w-8 bg-zinc-900' : 'w-1.5 bg-zinc-200'
                }`}
              />
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            Step {currentStep + 1} of {totalSteps}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
