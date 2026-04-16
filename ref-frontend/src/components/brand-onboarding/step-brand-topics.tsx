'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ArrowLeft, ArrowRight, Check, PenLine, Trash2, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface StepBrandTopicsProps {
  topics: string[]
  onTopicsChange?: (topics: string[]) => void
  selectedTopics: string[]
  onSelectedTopicsChange: (topics: string[]) => void
  isTopicsLoading: boolean
  isSaving: boolean
  onNext: () => void
  onBack: () => void
  onSkip?: () => void
  currentStep: number
  totalSteps: number
}

export function StepBrandTopics({
  topics,
  onTopicsChange,
  selectedTopics,
  onSelectedTopicsChange,
  isTopicsLoading,
  isSaving,
  onNext,
  onBack,
  onSkip,
  currentStep,
  totalSteps,
}: StepBrandTopicsProps) {
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customTopic, setCustomTopic] = useState('')

  // Combine topics from API with any custom topics the user added
  const allDisplayedTopics = Array.from(new Set([...topics, ...selectedTopics]))

  const isAllSelected = allDisplayedTopics.length > 0 && allDisplayedTopics.every(t => selectedTopics.includes(t))

  const toggleTopic = (topic: string) => {
    if (selectedTopics.includes(topic)) {
      onSelectedTopicsChange(selectedTopics.filter((t) => t !== topic))
    } else {
      onSelectedTopicsChange([...selectedTopics, topic])
    }
  }

  const deleteTopic = (topic: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onSelectedTopicsChange(selectedTopics.filter((t) => t !== topic))
    if (onTopicsChange && topics.includes(topic)) {
      onTopicsChange(topics.filter((t) => t !== topic))
    }
  }

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      onSelectedTopicsChange([])
    } else {
      onSelectedTopicsChange(allDisplayedTopics)
    }
  }

  const addCustomTopic = () => {
    const trimmed = customTopic.trim()
    if (!trimmed || selectedTopics.includes(trimmed)) return
    onSelectedTopicsChange([...selectedTopics, trimmed])
    setCustomTopic('')
    setShowCustomInput(false)
  }

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addCustomTopic()
    }
    if (e.key === 'Escape') {
      setShowCustomInput(false)
      setCustomTopic('')
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
      <div className="mb-5 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-brand-charcoal mb-1.5 tracking-tight">
            Choose topics to track
          </h2>
          <p className="text-brand-muted text-sm">
            Select the topics most relevant to your brand. We&apos;ll monitor how your brand appears in AI responses for these topics.
          </p>
        </div>
        {!isTopicsLoading && allDisplayedTopics.length > 0 && (
          <button
            onClick={handleSelectAllToggle}
            className="inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-lg bg-brand-orange-subtle border border-brand-orange-light text-brand-orange hover:bg-brand-orange/10 font-medium shrink-0 cursor-pointer transition-colors"
          >
            <ListChecks className="w-3.5 h-3.5" />
            {isAllSelected ? "Deselect All" : "Select All"}
          </button>
        )}
      </div>

      {/* Topic Selection */}
      <div className="flex-1 overflow-y-auto scrollbar-hide space-y-2 pr-1">
        {isTopicsLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-2 border-brand-warm" />
              <div className="absolute inset-0 rounded-full border-2 border-brand-orange border-t-transparent animate-spin" />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-sm font-medium text-brand-charcoal">Generating topics…</p>
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        ) : (
          <>
            <AnimatePresence>
              {allDisplayedTopics.map((topic, idx) => {
                const isSelected = selectedTopics.includes(topic)
                const isCustom = !topics.includes(topic)
                
                return (
                  <motion.button
                    key={topic}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    onClick={() => toggleTopic(topic)}
                    className={`group w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand-orange-subtle border-brand-orange-light shadow-sm'
                        : 'bg-white border-brand-warm hover:border-brand-warm hover:bg-brand-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? 'bg-brand-orange border-brand-orange'
                            : 'border-brand-warm bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span
                        className={`text-sm font-medium ${
                          isSelected ? 'text-brand-charcoal' : 'text-brand-muted'
                        }`}
                      >
                        {topic}
                      </span>
                      {isCustom && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-brand-surface text-brand-muted border-brand-warm ml-2">
                          Custom
                        </span>
                      )}
                    </div>
                    
                    <div 
                      role="button"
                      onClick={(e) => deleteTopic(topic, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-brand-muted hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                      title="Permanently remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </div>
                  </motion.button>
                )
              })}
            </AnimatePresence>

            {/* Custom topic option */}
            {showCustomInput ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 mt-1"
              >
                <Input
                  autoFocus
                  placeholder="Enter your own topic…"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  className="bg-white! border-brand-warm! hover:border-brand-warm! shadow-none! text-brand-charcoal! placeholder:text-brand-muted! focus-visible:border-brand-orange! focus-visible:ring-2! focus-visible:ring-brand-orange/20! h-10 flex-1 text-sm rounded-xl"
                />
                <Button
                  onClick={addCustomTopic}
                  disabled={!customTopic.trim()}
                  size="sm"
                  className="h-10 px-4 bg-brand-charcoal text-white hover:bg-brand-charcoal rounded-lg text-sm"
                >
                  Add
                </Button>
              </motion.div>
            ) : (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: topics.length * 0.04 }}
                onClick={() => setShowCustomInput(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-brand-warm text-left hover:border-brand-muted hover:bg-brand-surface transition-all cursor-pointer"
              >
                <div className="w-5 h-5 rounded-md border border-brand-warm bg-white flex items-center justify-center shrink-0">
                  <PenLine className="w-3 h-3 text-brand-muted" />
                </div>
                <span className="text-sm font-medium text-brand-muted">Other (enter your own topic)</span>
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
            className="text-brand-muted hover:text-brand-charcoal transition-colors flex items-center text-sm font-medium group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Go Back
          </button>

          <div className="flex items-center gap-3">
            {onSkip && (
              <button
                onClick={onSkip}
                disabled={isSaving}
                className="text-brand-muted hover:text-brand-charcoal px-4 h-10 text-sm font-medium rounded-full transition-colors cursor-pointer disabled:opacity-40"
              >
                Skip for now
              </button>
            )}
            <Button
              onClick={onNext}
              disabled={selectedTopics.length === 0 || isTopicsLoading || isSaving}
              className="bg-brand-orange text-white hover:bg-brand-orange-hover px-6 h-10 text-sm font-semibold rounded-full transition-all flex items-center disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
