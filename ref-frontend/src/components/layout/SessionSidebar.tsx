'use client'

import { useState } from 'react'
import Image from 'next/image'
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
  TrendingUp,
  GitBranch,
  LayoutDashboard,
  ChevronLeft,
  Lightbulb,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface SessionSidebarProps {
  activeSection?: string
  onSectionChange?: (section: string) => void
  isOpen?: boolean
  onClose?: () => void
}

const menuItems = [
  { id: 'executive-snapshot', label: 'Executive Snapshot', icon: Zap },
  { id: 'crawler', label: 'Crawler', icon: Bug },
  { id: 'crawled-data', label: 'Crawled Data', icon: Database },
  { id: 'text-quality', label: 'Text Quality Analyzer', icon: Sparkles },
  { id: 'link-analysis', label: 'Link Analysis', icon: Network },
  { id: 'site-structure', label: 'Site Structure', icon: GitBranch },
  { id: 'performance', label: 'Performance Audits', icon: Gauge },
  { id: 'ga4-traffic', label: 'GA4 Traffic Analysis', icon: BarChart3 },
  { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
  { id: 'schema-generator', label: 'Schema Generator', icon: Code },
  { id: 'module-e', label: 'Brand Intelligence', icon: Activity },
  { id: 'ai-intelligence', label: 'AI Intelligence', icon: Brain },
  { id: 'ai-visibility-scorecards', label: 'AI Visibility Scorecards', icon: Brain },
  { id: 'content-metrics', label: 'Content Metrics', icon: FileCheck },
  { id: 'answer-completeness', label: 'Answer Completeness', icon: Target },
  { id: 'entity-extractor', label: 'Entity Extractor', icon: Tags },
  { id: 'growth-trends', label: 'Growth Trends', icon: TrendingUp },
]

export function SessionSidebar({ activeSection = 'crawler', onSectionChange, isOpen = true, onClose }: SessionSidebarProps) {
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

          {/* Navigation Items */}
          <nav className="flex-1 px-3 sm:px-4 py-4 sm:py-5 md:py-6 space-y-1 overflow-y-auto">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSectionChange?.(item.id)
                    onClose?.()
                  }}
                  className={cn(
                    'group relative w-full flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg md:rounded-xl transition-all duration-300 cursor-pointer',
                    isActive
                      ? 'bg-white/75 backdrop-blur-md shadow-lg'
                      : 'hover:bg-white/5'
                  )}
                >
                  <Icon 
                    className={cn(
                      'h-4 w-4 sm:h-5 sm:w-5 shrink-0 transition-colors',
                      isActive ? 'text-slate-900' : 'text-white/70 group-hover:text-white/90'
                    )} 
                  />
                  <span 
                    className={cn(
                      'text-xs sm:text-sm font-medium transition-colors',
                      isActive ? 'text-slate-900 font-semibold' : 'text-white/70 group-hover:text-white/90'
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}
