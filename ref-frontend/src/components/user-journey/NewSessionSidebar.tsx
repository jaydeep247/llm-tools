'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bug, 
  Database, 
  BarChart3, 
  Sparkles, 
  Search, 
  FileText, 
  Link2Off, 
  CheckCircle2, 
  Network, 
  Gauge, 
  Code, 
  Activity, 
  Brain, 
  FileCheck, 
  Target, 
  Tags,
  GitBranch,
  LayoutDashboard,
  ChevronLeft,
  ChevronDown,
  Bell,
  Swords
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface SessionSidebarProps {
  activeSection?: string
  onSectionChange?: (section: string) => void
  isOpen?: boolean
  onClose?: () => void
}

export const sessionSections = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    children: [
      { id: 'executive-snapshot', label: 'Executive Snapshot' },
      { id: 'wins-losses', label: 'Wins & Losses' },
      {id: 'priority-alerts', label: 'Priority Alerts'},
      { id: 'last-days', label: 'Last 7/30 days' }
    ]
  },
  {
    id: 'audit-center',
    label: 'Audit Center',
    icon: Gauge,
    children: [
      { id: 'technical-audit', label: 'Technical Audit' },
      { id: 'content-audit', label: 'Content Audit' },
      { id: 'structured-data', label: 'Structured Data & AI Files' },
      { id: 'url-explorer', label: 'URL Explorer' },
      { id: 'exports', label: 'Exports' },
    ]
  },
  {
    id: 'ai-visibility',
    label: 'AI Visibility',
    icon: BarChart3,
    children: [
      { id: 'ai-visibility-scorecards', label: 'Scorecards' },
      { id: 'entity-and-gap-analysis', label: 'Entity & Gap Analysis' },
      { id: 'answer-completeness', label: 'AI Answer Preview' },
      { id: 'improvement-actions', label: 'Improvement Actions' },
      {id: 'model-comparison', label: 'Model Comparison'}
    ]
  },
  {
    id: 'prompt-intelligence',
    label: 'Prompt Intelligence',
    icon: Sparkles,
    children: [
      { id: 'discover-prompts', label: 'Discover Prompts' },
      { id: 'topic-clusters', label: 'Clusters & Intent' },
      { id: 'content-matrix', label: 'Difficulty & Opportunity' },
      {id: 'content-brief-builder', label: 'Content Brief Builder'},
      {id: 'add-to-Tracking', label: 'Add to Tracking'}
    ]
  },
  {
    id: 'prompt-tracking',
    label: 'Prompt Tracking',
    icon: Search,
    children: [
      { id: 'keyword-intelligence', label: 'Tracked Prompts' },
      { id: 'prompt-difficulty', label: 'Brand & Competitor Mentions' },
      { id: 'prompt-opportunities', label: 'Citations Tracker' },
      {id: 'share-of-voice', label: 'Share of Voice'},
      {id: 'trends-by-model', label: 'Trends by Model'}
    ]
  },
  {
    id: 'competitors',
    label: 'Competitors',
    icon: Swords,
    children: [
      { id: 'visibility-comparision', label: 'Visibility Comparison' },
      { id: 'competitor-wins-library', label: 'Competitor Wins Library' },
      { id: 'competitor-cited-urls', label: 'Competitor Cited URLs' },
      {id: 'gap-opportunities', label: 'Gap Opportunities'},
      {id: 'growth-trends', label : 'Growth Trends'}
    ]
  },
  {
    id: 'reports-and-alerts',
    label: 'Reports & Alerts',
    icon: Bell,
    children: [
      { id: 'weekly-summary', label: 'Weekly Summary' },
      { id: 'audit-reports', label: 'Audit Reports' },
      { id: 'competitor-reports', label: 'Competitor Reports' },
      {id: 'alerts-center', label: 'Alert Center'},
      {id: 'export-api', label : 'Export / API'}
    ]
  },
  {
    id: 'impact-analytics',
    label: 'Impact Analytics',
    icon: CheckCircle2,
    children: [
      { id: 'impact-overview', label: 'GA4 Connection' },
      { id: 'content-roi', label: 'LLM Traffic' },
      { id: 'attribution-soon', label: 'Top Landing Pages' },
      {id: 'events-and-Conversions', label: 'Events & Conversions'},
      {id: 'visibility-traffic-correlation', label: 'Visibility ↔ Traffic Correlation'}
    ]
  }
]

export function SessionSidebar({ activeSection = 'executive-snapshot', onSectionChange, isOpen = true, onClose }: SessionSidebarProps) {
  const [openSection, setOpenSection] = useState<string | null>(() => {
    const found = sessionSections.find(section =>
      section.children?.some(child => child.id === activeSection)
    )
    return found ? found.id : sessionSections[0]?.id ?? null
  })

  useEffect(() => {
    const found = sessionSections.find(section =>
      section.children?.some(child => child.id === activeSection)
    )
    if (found) {
      setOpenSection(found.id)
    }
  }, [activeSection])
  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm md:hidden z-20 cursor-pointer"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 transition-all duration-300 z-30 overflow-y-auto md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="bg-white/10 backdrop-blur-2xl border-r border-white/20 h-full flex flex-col">
          {/* Logo Section */}
          <div className="flex items-center justify-between px-4 sm:px-5 md:px-6 h-12 sm:h-14 md:h-16 border-b border-white/20 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
                <Image 
                  src="/images/attrock_logo.png" 
                  alt="Attrock" 
                  width={32}
                  height={32}
                  className="w-full h-full object-contain"
                />
              </div>
              <h1 className="text-base sm:text-lg font-bold text-white">Contentlytics</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="md:hidden text-white hover:bg-white/20 rounded-lg transition-all duration-300 h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>

          <nav className="flex-1 px-3 sm:px-4 py-4 sm:py-5 md:py-6 space-y-1 overflow-y-auto">
            {sessionSections.map(section => {
              const Icon = section.icon
              const hasChildren = section.children && section.children.length > 0
              const isSectionActive = section.children?.some(child => child.id === activeSection)
              const isExpanded = openSection === section.id || isSectionActive

              return (
                <div key={section.id}>
                  <button
                    onClick={() => {
                      const firstChild = section.children && section.children[0]
                      setOpenSection(current =>
                        current === section.id ? null : section.id
                      )
                      if (firstChild) {
                        onSectionChange?.(firstChild.id)
                        onClose?.()
                      }
                    }}
                    className={cn(
                      'group relative w-full flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg md:rounded-xl transition-all duration-300 cursor-pointer hover:bg-white/5'
                    )}
                  >
                    {Icon && (
                      <Icon
                        className={cn(
                          'h-4 w-4 sm:h-5 sm:w-5 shrink-0 transition-colors text-white/70 group-hover:text-white/90'
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        'text-xs sm:text-sm font-medium transition-colors flex-1 text-left text-white/70 group-hover:text-white/90'
                      )}
                    >
                      {section.label}
                    </span>
                    {hasChildren && (
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="ml-auto"
                      >
                        <ChevronDown 
                          className={cn(
                            'h-3 w-3 sm:h-4 sm:w-4 transition-colors text-white/70 group-hover:text-white/90'
                          )}
                        />
                      </motion.div>
                    )}
                  </button>

                  {hasChildren && (
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.4, ease: 'easeInOut' }}
                          className="ml-4 mt-1 border-l border-white/10 pl-3 space-y-1 overflow-hidden"
                        >
                          {section.children!.map(child => {
                            const isActive = activeSection === child.id

                            return (
                              <motion.button
                                key={child.id}
                                initial={{ x: -10, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ duration: 0.3, delay: 0.1 }}
                                onClick={() => {
                                  onSectionChange?.(child.id)
                                  onClose?.()
                                }}
                                className={cn(
                                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs sm:text-sm transition-all duration-200 cursor-pointer',
                                  isActive
                                    ? 'bg-white/75 backdrop-blur-md text-slate-900 shadow'
                                    : 'text-white/70 hover:text-white hover:bg-white/5'
                                )}
                              >
                                <span className="truncate">{child.label}</span>
                              </motion.button>
                            )
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}
