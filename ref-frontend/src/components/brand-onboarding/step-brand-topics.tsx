'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Loader2, ArrowLeft, ArrowRight, Check, PenLine, Trash2, ListChecks } from 'lucide-react'
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
      <div className="mb-6 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
              <Compass className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-2 tracking-tight">
            Choose topics to track
          </h2>
          <p className="text-zinc-500 text-sm">
            Select the topics most relevant to your brand. We'll monitor how your brand appears in AI responses for these topics.
          </p>
        </div>
        {!isTopicsLoading && allDisplayedTopics.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAllToggle}
            className="text-xs h-8 px-3 rounded-lg border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
          >
            <ListChecks className="w-3.5 h-3.5 mr-1.5" />
            {isAllSelected ? "Deselect All" : "Select All"}
          </Button>
        )}
      </div>

      {/* Topic Selection */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {isTopicsLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            <p className="text-sm text-zinc-400">Generating topics based on your brand…</p>
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
                        ? 'bg-emerald-50 border-emerald-200 shadow-sm'
                        : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-600'
                            : 'border-zinc-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span
                        className={`text-sm font-medium ${
                          isSelected ? 'text-zinc-900' : 'text-zinc-600'
                        }`}
                      >
                        {topic}
                      </span>
                      {isCustom && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-zinc-50 text-zinc-500 border-zinc-200 ml-2">
                          Custom
                        </span>
                      )}
                    </div>
                    
                    <div 
                      role="button"
                      onClick={(e) => deleteTopic(topic, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
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
                  className="bg-white! border-zinc-200! hover:border-zinc-300! shadow-none! text-zinc-900! placeholder:text-zinc-400! focus-visible:border-emerald-500! focus-visible:ring-2! focus-visible:ring-emerald-500/20! h-10 flex-1 text-sm rounded-xl"
                />
                <Button
                  onClick={addCustomTopic}
                  disabled={!customTopic.trim()}
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
                transition={{ delay: topics.length * 0.04 }}
                onClick={() => setShowCustomInput(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-zinc-300 text-left hover:border-zinc-400 hover:bg-zinc-50 transition-all cursor-pointer"
              >
                <div className="w-5 h-5 rounded-md border border-zinc-300 bg-white flex items-center justify-center shrink-0">
                  <PenLine className="w-3 h-3 text-zinc-400" />
                </div>
                <span className="text-sm font-medium text-zinc-400">Other (enter your own topic)</span>
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
            disabled={selectedTopics.length === 0 || isTopicsLoading || isSaving}
            className="bg-zinc-900 text-white hover:bg-zinc-700 px-6 h-10 text-sm font-medium rounded-full transition-all shadow-lg shadow-zinc-200 flex items-center disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Continue
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
