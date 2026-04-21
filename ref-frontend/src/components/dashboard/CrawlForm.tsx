'use client'

import { useState } from 'react'
import { NdSelect, NdSelectItem } from '@/components/dashboard/ui/nd-select'
import { NdSwitch } from '@/components/dashboard/ui/nd-switch'
import { useGetProjectsQuery } from '@/store/api'
import { Search, StopCircle, Loader2, Globe, FolderOpen, ChevronDown, ChevronUp } from 'lucide-react'

interface CrawlFormProps {
  onSubmit: (data: CrawlFormData) => void
  onStop?: () => void
  loading?: boolean
  isCrawling?: boolean
  stopping?: boolean
}

export interface CrawlFormData {
  projectId: string
  url: string
  runCrawl: boolean
  allowSubdomains: boolean
  runAudits: boolean
  auditDevice: 'mobile' | 'desktop'
  captureLinkDetails: boolean
}

export function CrawlForm({ onSubmit, onStop, loading = false, isCrawling = false, stopping = false }: CrawlFormProps) {
  const [projectId, setProjectId] = useState<string>('')
  const [url, setUrl] = useState('')
  const [runCrawl, setRunCrawl] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [allowSubdomains, setAllowSubdomains] = useState(true)
  const [runAudits, setRunAudits] = useState(false)
  const [auditDevice, setAuditDevice] = useState<'mobile' | 'desktop'>('desktop')
  const [captureLinkDetails, setCaptureLinkDetails] = useState(true)

  const { data: projectsData, isLoading: isLoadingProjects } = useGetProjectsQuery()
  const projects = projectsData?.projects || []

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !url.trim()) return

    onSubmit({
      projectId: projectId,
      url: url.trim(),
      runCrawl,
      allowSubdomains,
      runAudits,
      auditDevice,
      captureLinkDetails,
    })
  }

  const isProcessActive = loading || isCrawling

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Project Selection */}
      <div className="space-y-2">
        <label htmlFor="project" className="text-white/90 text-sm font-medium flex items-center gap-2">
          <FolderOpen className="h-4 w-4" />
          Select Project
        </label>
        <NdSelect
          value={projectId}
          onValueChange={setProjectId}
          disabled={loading}
          id="project"
          placeholder="Choose a project..."
          triggerStyle={{
            background: 'rgba(39,39,42,0.5)',
            borderColor: '#3f3f46',
            color: projectId ? '#FFFFFF' : '#52525b',
            borderRadius: 16,
          }}
        >
          {isLoadingProjects ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
              <span className="ml-2 text-sm text-zinc-500">Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-4 text-center text-sm text-zinc-500">
              No projects found. Create one first.
            </div>
          ) : (
            projects.map((project: { id: string; name: string }) => (
              <NdSelectItem key={project.id} value={project.id.toString()}>
                {project.name}
              </NdSelectItem>
            ))
          )}
        </NdSelect>
      </div>

      {/* URL Input */}
      <div className="space-y-2">
        <label htmlFor="url" className="text-white/90 text-sm font-medium flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Website URL
        </label>
        <div className="flex gap-2">
          <input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter website URL (e.g., example.com or https://example.com)"
            className="flex-1 h-10 px-4 text-sm text-white placeholder:text-zinc-600 rounded-2xl border outline-none transition-colors"
            style={{ background: 'rgba(39,39,42,0.5)', borderColor: '#3f3f46' }}
            onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
            onBlur={(e) => { e.currentTarget.style.background = 'rgba(39,39,42,0.5)' }}
            disabled={loading}
            required
          />
          <button
            type="submit"
            disabled={loading || !url.trim() || !projectId}
            className="inline-flex items-center gap-2 px-6 font-semibold text-sm rounded-2xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#FFFFFF', color: '#000000' }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Analyze
              </>
            )}
          </button>
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              disabled={!isProcessActive || stopping}
              className="inline-flex items-center gap-2 px-6 font-semibold text-sm rounded-2xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#EF4444', color: '#FFFFFF' }}
            >
              {stopping ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <StopCircle className="h-4 w-4" />
                  Stop
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Run Crawl Option */}
      <div className="flex items-center space-x-2 rounded-2xl p-4 bg-zinc-800/40 border border-zinc-800 hover:bg-zinc-800/50 transition-all">
        <NdSwitch
          id="runCrawl"
          checked={runCrawl}
          onCheckedChange={setRunCrawl}
          disabled={loading}
        />
        <label htmlFor="runCrawl" className="text-white/90 cursor-pointer flex-1 text-sm font-medium">
          🕷️ Run Crawl (Analyze multiple pages)
        </label>
      </div>

      {/* Advanced Options */}
      {runCrawl && (
        <div className="space-y-4 rounded-2xl p-4 bg-zinc-800/40 border border-zinc-800">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-white/90 hover:text-white transition-colors"
          >
            <span className="text-sm font-medium">Advanced Options</span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              {/* Allow Subdomains */}
              <div className="flex items-center justify-between">
                <label htmlFor="allowSubdomains" className="text-white/80 text-sm cursor-pointer">
                  Allow Subdomains
                </label>
                <NdSwitch
                  id="allowSubdomains"
                  checked={allowSubdomains}
                  onCheckedChange={setAllowSubdomains}
                  disabled={loading}
                />
              </div>

              {/* Run Audits */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label htmlFor="runAudits" className="text-white/80 text-sm cursor-pointer">
                    🔍 Run Performance Audits (Optional)
                  </label>
                  <p className="text-[10px] text-white/50">
                    Lighthouse audits with Core Web Vitals (LCP, TBT, CLS)
                  </p>
                </div>
                <NdSwitch
                  id="runAudits"
                  checked={runAudits}
                  onCheckedChange={setRunAudits}
                  disabled={loading}
                />
              </div>

              {/* Audit Device (only show if runAudits is enabled) */}
              {runAudits && (
                <div className="space-y-2 pl-4 border-l-2 border-zinc-700">
                  <label htmlFor="auditDevice" className="text-white/80 text-sm">
                    Audit Device
                  </label>
                  <NdSelect
                    value={auditDevice}
                    onValueChange={(value) => setAuditDevice(value as 'mobile' | 'desktop')}
                    disabled={loading}
                    id="auditDevice"
                    triggerStyle={{
                      background: 'rgba(39,39,42,0.5)',
                      borderColor: '#3f3f46',
                      color: '#FFFFFF',
                    }}
                  >
                    <NdSelectItem value="desktop">Desktop</NdSelectItem>
                    <NdSelectItem value="mobile">Mobile</NdSelectItem>
                  </NdSelect>
                </div>
              )}

              {/* Capture Link Details */}
              <div className="flex items-center justify-between">
                <label htmlFor="captureLinkDetails" className="text-white/80 text-sm cursor-pointer">
                  Capture Link Details
                </label>
                <NdSwitch
                  id="captureLinkDetails"
                  checked={captureLinkDetails}
                  onCheckedChange={setCaptureLinkDetails}
                  disabled={loading}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading Progress */}
      {loading && (
        <div className="rounded-2xl p-4 bg-zinc-800/40 border border-zinc-800">
          <div className="flex items-center gap-3 text-zinc-400 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Fetching data. Please wait...</span>
          </div>
          <div className="mt-3 h-1 bg-zinc-800/50 rounded-full overflow-hidden">
            <div className="h-full bg-white/60 rounded-full animate-progress-bar" />
          </div>
        </div>
      )}
    </form>
  )
}
