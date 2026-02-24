'use client'

import { ChevronRight, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface SessionNavbarProps {
  projectId: string
  projectName: string
  sessionId: string
  activeSection?: string
  onMenuToggle?: () => void
}

const sectionLabels: Record<string, { parent?: string; label: string }> = {
  'executive-snapshot': { parent: 'Overview', label: 'Executive Snapshot' },
  'wins-losses': { parent: 'Overview', label: 'Wins & Losses' },
  'technical-audit': { parent: 'Audit Center', label: 'Technical Audit' },
  'content-audit': { parent: 'Audit Center', label: 'Content Audit' },
  'url-explorer': { parent: 'Exploration', label: 'URL Explorer' },
  'topic-clusters': { parent: 'Exploration', label: 'Topic Clusters' },
  'llm-files': { parent: 'Structured Data & LLM Files', label: 'LLM Files' },
  'schema-audit': { parent: 'Structured Data & LLM Files', label: 'Schema Audit' },
  'ai-visibility': { parent: 'AI SEO / AEO Visibility', label: 'AI Visibility Score' },
  'entity-coverage': { parent: 'AI SEO / AEO Visibility', label: 'Entity Coverage' },
  'keyword-intelligence': { parent: 'Keyword → Prompt Intelligence', label: 'Keyword Intelligence' },
  'prompt-difficulty': { parent: 'Keyword → Prompt Intelligence', label: 'Prompt Difficulty' },
  'prompt-tracking': { parent: 'Prompt Tracking & Testing', label: 'Prompt Tracking' },
  'multi-model-testing': { parent: 'Prompt Tracking & Testing', label: 'Multi-Model Testing' },
}

export function SessionNavbar({ projectId, projectName, sessionId, activeSection, onMenuToggle }: SessionNavbarProps) {
  const current = activeSection ? sectionLabels[activeSection] : undefined
  
  return (
    <nav className="fixed top-0 left-0 md:left-64 right-0 z-40 w-full md:w-[calc(100%-16rem)]">
      <div className="bg-white/10 backdrop-blur-2xl border-b border-white/20 shadow-lg shadow-black/20 h-12 sm:h-14 md:h-16 px-3 sm:px-4 md:px-6 flex items-center gap-3 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-white hover:bg-white/20 hover:text-white rounded-full transition-all duration-300 h-9 w-9 shrink-0"
          onClick={onMenuToggle}
        >
          <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
        
        <div className="flex items-center gap-1.5 sm:gap-2 text-white/80 text-xs sm:text-sm md:text-base">
          <Link 
            href="/dashboard/projects"
            className="hover:text-white transition-colors cursor-pointer"
          >
            Projects
          </Link>
          
          <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-white/50" />
          
          <Link 
            href={`/dashboard/projects/${projectId}`}
            className="hover:text-white transition-colors cursor-pointer truncate max-w-37.5 sm:max-w-62.5 md:max-w-none"
          >
            {projectName}
          </Link>
          
          <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-white/50" />
          
          <span className="text-white font-medium truncate">
            Session #{sessionId}
          </span>
          
          {current?.parent && (
            <>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-white/50" />
              <span className="text-white/60 truncate hidden sm:inline-block">
                {current.parent}
              </span>
            </>
          )}

          {current && (
            <>
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-white/50" />
              <span className="text-white/60 truncate">
                {current.label}
              </span>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
