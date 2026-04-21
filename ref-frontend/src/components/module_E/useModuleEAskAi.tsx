'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ModuleEAskAiChatShell, type ModuleEAskAiChatTurn } from '@/components/module_E/ModuleEAskAiChatShell'
import { useAskModuleEAIMutation, useGetModuleESuggestedQuestionsMutation } from '@/store/api/module_E/moduleEApi'

function chatMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function ModuleEMetricAskButton({
  disabled,
  onClick,
}: {
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border',
        'px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
        'transition-opacity cursor-pointer shrink-0',
        'disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80',
      )}
      style={{
        borderColor: 'var(--nd-purple)',
        background: 'var(--nd-purple-subtle)',
        color: 'var(--nd-purple)',
      }}
    >
      <MessageSquare className="size-3 shrink-0" aria-hidden />
      Ask AI
    </button>
  )
}

export function useModuleEAskAi(projectId?: string | null, jobId?: string | null) {
  const [askModuleEAI, { isLoading: isAskingAI, error: askAIError, reset: resetAskAI }] = useAskModuleEAIMutation()
  const [getSuggestedQuestions] = useGetModuleESuggestedQuestionsMutation()
  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ModuleEAskAiChatTurn[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!askDialogOpen || !chatScrollRef.current) return
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [askDialogOpen, chatMessages, isAskingAI])

  const openAskAiDialog = async () => {
    if (!projectId) return
    resetAskAI()
    setChatMessages([])
    setChatInput('')
    setAskDialogOpen(true)
    try {
      const res = (await getSuggestedQuestions({ project_id: projectId }).unwrap()) as {
        data?: { questions?: string[] }
        questions?: string[]
      }
      const qs = res?.data?.questions ?? res?.questions
      setSuggestions(Array.isArray(qs) ? qs.filter(Boolean).slice(0, 12) : [])
    } catch {
      setSuggestions([])
    }
  }

  const submitAskAi = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!projectId || !chatInput.trim() || isAskingAI) return
    const question = chatInput.trim()
    setChatInput('')
    const priorHistory = chatMessages.slice(-6).map((m) => ({ role: m.role, content: m.content }))
    const userTurn: ModuleEAskAiChatTurn = { id: chatMessageId(), role: 'user', content: question }
    setChatMessages((prev) => [...prev, userTurn])

    try {
      const res = await askModuleEAI({
        project_id: projectId,
        job_id: jobId || undefined,
        question,
        conversation_history: priorHistory.length ? priorHistory : undefined,
      }).unwrap()

      const text = res?.answer?.trim() || res?.data?.answer?.trim() || ''
      const sources = res?.sources || res?.data?.sources
      if (!text) return
      setChatMessages((prev) => [...prev, { id: chatMessageId(), role: 'assistant', content: text, sources }])
    } catch {
      setChatMessages((prev) => prev.filter((m) => m.id !== userTurn.id))
      setChatInput(question)
    }
  }

  const runMetricAskAi = async (displayLabel: string, prompt: string) => {
    if (!projectId || !jobId) return
    resetAskAI()
    const userTurn: ModuleEAskAiChatTurn = { id: chatMessageId(), role: 'user', content: `Explain: ${displayLabel}` }
    setChatMessages([userTurn])
    setChatInput('')
    setAskDialogOpen(true)
    try {
      const res = await askModuleEAI({
        project_id: projectId,
        job_id: jobId,
        question: prompt,
      }).unwrap()
      const text = res?.answer?.trim() || res?.data?.answer?.trim() || ''
      const sources = res?.sources || res?.data?.sources
      if (!text) return
      setChatMessages((prev) => [...prev, { id: chatMessageId(), role: 'assistant', content: text, sources }])
    } catch {
      setChatMessages([])
      setAskDialogOpen(false)
    }
  }

  const askAiDialog = (
    <Dialog
      open={askDialogOpen}
      onOpenChange={(open) => {
        setAskDialogOpen(open)
        if (!open) {
          resetAskAI()
          setChatMessages([])
          setChatInput('')
        }
      }}
    >
      <DialogContent
        className={cn(
          'w-[calc(100vw-1rem)] max-h-[95vh] gap-0 overflow-visible border-0 bg-transparent p-0 pt-10 shadow-none sm:max-w-3xl lg:max-w-5xl',
          'data-[state=open]:zoom-in-[0.98]',
        )}
        showCloseButton
      >
        <ModuleEAskAiChatShell
          chatScrollRef={chatScrollRef}
          chatMessages={chatMessages}
          chatInput={chatInput}
          setChatInput={setChatInput}
          isAskingAI={isAskingAI}
          askAIError={askAIError}
          onSubmit={submitAskAi}
          onSuggestionClick={(text) => setChatInput(text)}
          suggestions={suggestions}
        />
      </DialogContent>
    </Dialog>
  )

  return { askAiDialog, openAskAiDialog, runMetricAskAi, isAskingAI, canAskAi: !!projectId && !!jobId }
}

