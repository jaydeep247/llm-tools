'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Check,
  ListChecks,
  PenLine,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface GeneratedPrompt {
  prompt: string
  type: string
  journey_stage?: string
}

export interface TopicPrompts {
  topic: string
  prompts: GeneratedPrompt[]
}

const JOURNEY_STAGE_META: Record<string, { label: string; color: string }> = {
  awareness: { label: 'Awareness', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  consideration: { label: 'Consideration', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  decision: { label: 'Decision', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  post_purchase: { label: 'Post Purchase', color: 'bg-purple-50 text-purple-700 border-purple-200' },
}

interface StepBrandPromptsProps {
  topicGroups: TopicPrompts[]
  onTopicGroupsChange?: (groups: TopicPrompts[]) => void
  customPrompts: string[]
  selectedPrompts?: string[]
  onSelectedPromptsChange?: (prompts: string[]) => void
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
  topicGroups,
  onTopicGroupsChange,
  customPrompts,
  selectedPrompts = [],
  onSelectedPromptsChange = () => {},
  onCustomPromptsChange,
  isPromptsLoading,
  isSaving,
  onNext,
  onBack,
  onSkip,
  currentStep,
  totalSteps,
}: StepBrandPromptsProps) {
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(
    () => new Set(topicGroups.map(g => g.topic))
  )
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  const allGeneratedPrompts = topicGroups.flatMap(g => (g.prompts ?? []).map(p => p.prompt))
  const allAvailable = [...allGeneratedPrompts, ...customPrompts]

  const effectiveSelected = selectedPrompts.length > 0 ? selectedPrompts : allAvailable
  const isAllSelected = allAvailable.length > 0 && allAvailable.every(p => effectiveSelected.includes(p))

  const togglePrompt = (promptStr: string) => {
    if (effectiveSelected.includes(promptStr)) {
      onSelectedPromptsChange(effectiveSelected.filter(p => p !== promptStr))
    } else {
      onSelectedPromptsChange([...effectiveSelected, promptStr])
    }
  }

  const toggleTopic = (topic: string, topicPrompts: GeneratedPrompt[]) => {
    const topicPromptStrs = topicPrompts.map(p => p.prompt)
    const allTopicSelected = topicPromptStrs.every(p => effectiveSelected.includes(p))
    if (allTopicSelected) {
      onSelectedPromptsChange(effectiveSelected.filter(p => !topicPromptStrs.includes(p)))
    } else {
      const merged = Array.from(new Set([...effectiveSelected, ...topicPromptStrs]))
      onSelectedPromptsChange(merged)
    }
  }

  const handleSelectAll = () => {
    if (isAllSelected) {
      onSelectedPromptsChange([])
    } else {
      onSelectedPromptsChange(allAvailable)
    }
  }

  const toggleExpand = (topic: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev)
      if (next.has(topic)) next.delete(topic)
      else next.add(topic)
      return next
    })
  }

  const deletePromptFromGroup = (topic: string, promptStr: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (onTopicGroupsChange) {
      onTopicGroupsChange(
        topicGroups.map(g =>
          g.topic === topic ? { ...g, prompts: g.prompts.filter(p => p.prompt !== promptStr) } : g
        ).filter(g => g.prompts.length > 0)
      )
    }
    onSelectedPromptsChange(effectiveSelected.filter(p => p !== promptStr))
  }

  const deleteCustomPrompt = (promptStr: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onCustomPromptsChange(customPrompts.filter(p => p !== promptStr))
    onSelectedPromptsChange(effectiveSelected.filter(p => p !== promptStr))
  }

  const addCustomPrompt = () => {
    const trimmed = customPrompt.trim()
    if (!trimmed || customPrompts.includes(trimmed)) return
    onCustomPromptsChange([...customPrompts, trimmed])
    onSelectedPromptsChange([...effectiveSelected, trimmed])
    setCustomPrompt('')
    setShowCustomInput(false)
  }

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomPrompt() }
    if (e.key === 'Escape') { setShowCustomInput(false); setCustomPrompt('') }
  }

  const totalPrompts = allAvailable.length
  const selectedCount = effectiveSelected.length

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
            Review AI prompts
          </h2>
          <p className="text-brand-muted text-sm leading-relaxed">
            {isPromptsLoading
              ? 'Generating prompts per topic…'
              : `${selectedCount} of ${totalPrompts} prompts selected across ${topicGroups.length} topic${topicGroups.length !== 1 ? 's' : ''}.`}
          </p>
        </div>
        {!isPromptsLoading && allAvailable.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-lg bg-brand-orange-subtle border border-brand-orange-light text-brand-orange hover:bg-brand-orange/10 font-medium shrink-0 cursor-pointer transition-colors"
          >
            <ListChecks className="w-3.5 h-3.5" />
            {isAllSelected ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      {/* Topic groups */}
      <div className="flex-1 overflow-y-auto scrollbar-hide space-y-3 pr-1">
        {isPromptsLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-2 border-brand-warm" />
              <div className="absolute inset-0 rounded-full border-2 border-brand-orange border-t-transparent animate-spin" />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-sm font-medium text-brand-charcoal">Generating prompts…</p>
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        ) : (
          <>
            {topicGroups.map((group, gIdx) => {
              const isExpanded = expandedTopics.has(group.topic)
              const topicPromptStrs = (group.prompts ?? []).map(p => p.prompt)
              const selectedInTopic = topicPromptStrs.filter(p => effectiveSelected.includes(p)).length
              const allTopicSelected = selectedInTopic === topicPromptStrs.length && topicPromptStrs.length > 0
              const someTopicSelected = selectedInTopic > 0 && !allTopicSelected

              return (
                <motion.div
                  key={group.topic}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gIdx * 0.05 }}
                  className="border border-brand-warm rounded-xl overflow-hidden bg-white"
                >
                  {/* Topic header row */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-brand-surface transition-colors select-none"
                    onClick={() => toggleExpand(group.topic)}
                  >
                    {/* Topic select toggle */}
                    <div
                      role="checkbox"
                      aria-checked={allTopicSelected}
                      onClick={e => { e.stopPropagation(); toggleTopic(group.topic, group.prompts ?? []) }}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                        allTopicSelected
                          ? 'bg-brand-orange border-brand-orange'
                          : someTopicSelected
                          ? 'bg-brand-orange-light border-orange-400'
                          : 'border-brand-warm bg-white'
                      }`}
                    >
                      {allTopicSelected && <Check className="w-3 h-3 text-white" />}
                      {someTopicSelected && <div className="w-2 h-0.5 bg-brand-orange rounded-full" />}
                    </div>

                    <Tag className="w-3.5 h-3.5 text-brand-muted shrink-0" />
                    <span className="flex-1 text-sm font-semibold text-brand-charcoal">{group.topic}</span>
                    <span className="text-xs text-brand-muted tabular-nums">
                      {selectedInTopic}/{topicPromptStrs.length}
                    </span>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-brand-muted shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-brand-muted shrink-0" />}
                  </div>

                  {/* Prompts list */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-brand-surface"
                      >
                        <div className="p-2 space-y-1.5">
                          {(group.prompts ?? []).map((item, idx) => {
                            const isSelected = effectiveSelected.includes(item.prompt)
                            const stageMeta = JOURNEY_STAGE_META[item.journey_stage ?? ''] ?? null
                            return (
                              <motion.div
                                key={item.prompt}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.02 }}
                                onClick={() => togglePrompt(item.prompt)}
                                className={`group w-full p-3 rounded-lg border transition-all cursor-pointer flex gap-3 items-start ${
                                  isSelected
                                    ? 'bg-brand-orange-subtle/50 border-orange-200'
                                    : 'bg-brand-surface border-transparent hover:border-brand-warm hover:bg-white'
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-all ${
                                    isSelected ? 'bg-brand-orange border-brand-orange' : 'border-brand-warm bg-white'
                                  }`}
                                >
                                  {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm leading-relaxed ${isSelected ? 'text-brand-charcoal' : 'text-brand-muted'}`}>
                                    {item.prompt}
                                  </p>
                                  {stageMeta && (
                                    <span className={`mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${stageMeta.color}`}>
                                      {stageMeta.label}
                                    </span>
                                  )}
                                </div>
                                <div
                                  role="button"
                                  onClick={e => deletePromptFromGroup(group.topic, item.prompt, e)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-brand-muted hover:text-red-500 hover:bg-red-50 rounded transition-all shrink-0"
                                  title="Remove prompt"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </div>
                              </motion.div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}

            {/* Custom prompts section */}
            {(customPrompts.length > 0 || showCustomInput) && (
              <div className="border border-dashed border-brand-warm rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-brand-surface flex items-center gap-2">
                  <PenLine className="w-3.5 h-3.5 text-brand-muted" />
                  <span className="text-sm font-semibold text-brand-muted">Custom Prompts</span>
                  <span className="text-xs text-brand-muted">{customPrompts.length}</span>
                </div>
                <div className="p-2 space-y-1.5">
                  {customPrompts.map(prompt => {
                    const isSelected = effectiveSelected.includes(prompt)
                    return (
                      <div
                        key={`custom-${prompt}`}
                        onClick={() => togglePrompt(prompt)}
                        className={`group flex gap-3 items-start p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-brand-orange-subtle/50 border-orange-200'
                            : 'bg-brand-surface border-transparent hover:border-brand-warm hover:bg-white'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-all ${
                            isSelected ? 'bg-brand-orange border-brand-orange' : 'border-brand-warm bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <p className={`flex-1 text-sm leading-relaxed ${isSelected ? 'text-brand-charcoal' : 'text-brand-muted'}`}>
                          {prompt}
                        </p>
                        <div
                          role="button"
                          onClick={e => deleteCustomPrompt(prompt, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-brand-muted hover:text-red-500 hover:bg-red-50 rounded transition-all shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    )
                  })}
                  {showCustomInput && (
                    <div className="flex gap-2 p-1">
                      <Input
                        autoFocus
                        placeholder="Enter your own prompt…"
                        value={customPrompt}
                        onChange={e => setCustomPrompt(e.target.value)}
                        onKeyDown={handleCustomKeyDown}
                        className="bg-white! border-brand-warm! shadow-none! text-brand-charcoal! placeholder:text-brand-muted! focus-visible:border-brand-orange! focus-visible:ring-2! focus-visible:ring-brand-orange/20! h-9 flex-1 text-sm rounded-lg"
                      />
                      <Button
                        onClick={addCustomPrompt}
                        disabled={!customPrompt.trim()}
                        size="sm"
                        className="h-9 px-4 bg-brand-charcoal text-white hover:bg-brand-charcoal rounded-lg text-sm"
                      >
                        Add
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Add custom prompt button */}
            {!showCustomInput && (
              <button
                onClick={() => setShowCustomInput(true)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-dashed border-brand-warm text-left hover:border-brand-muted hover:bg-brand-surface transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-brand-muted" />
                <span className="text-sm font-medium text-brand-muted">Add your own prompt</span>
              </button>
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
              disabled={isPromptsLoading || isSaving || (topicGroups.length === 0 && customPrompts.length === 0)}
              className="bg-brand-orange text-white hover:bg-brand-orange-hover px-6 h-10 text-sm font-semibold rounded-full transition-all flex items-center disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Finish
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

