'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
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
        <Label htmlFor="project" className="text-white/90 text-sm font-medium flex items-center gap-2">
          <FolderOpen className="h-4 w-4" />
          Select Project
        </Label>
        <Select value={projectId} onValueChange={setProjectId} disabled={loading}>
          <SelectTrigger 
            id="project"
            className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-600 hover:bg-white/15 focus:bg-white/15 rounded-2xl"
          >
            <SelectValue placeholder="Choose a project..." />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-zinc-700">
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
              projects.map((project) => (
                <SelectItem key={project.id} value={project.id.toString()} className="text-white">
                  {project.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* URL Input */}
      <div className="space-y-2">
        <Label htmlFor="url" className="text-white/90 text-sm font-medium flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Website URL
        </Label>
        <div className="flex gap-2">
          <Input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter website URL (e.g., example.com or https://example.com)"
            className="flex-1 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-600 focus:bg-white/15 rounded-2xl"
            disabled={loading}
            required
          />
          <Button
            type="submit"
            disabled={loading || !url.trim() || !projectId}
            className="bg-white text-black hover:bg-slate-100 rounded-2xl px-6 font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Analyzing...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Analyze
              </>
            )}
          </Button>
          {onStop && (
            <Button
              type="button"
              onClick={onStop}
              disabled={!isProcessActive || stopping}
              variant="destructive"
              className="rounded-2xl px-6 font-semibold"
            >
              {stopping ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Stopping...
                </>
              ) : (
                <>
                  <StopCircle className="h-4 w-4 mr-2" />
                  Stop
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Run Crawl Option */}
      <div className="flex items-center space-x-2 rounded-2xl p-4 bg-zinc-800/40 border border-zinc-800 hover:bg-zinc-800/50 transition-all">
        <Switch
          id="runCrawl"
          checked={runCrawl}
          onCheckedChange={setRunCrawl}
          disabled={loading}
          className="data-[state=checked]:bg-white"
        />
        <Label htmlFor="runCrawl" className="text-white/90 cursor-pointer flex-1 text-sm font-medium">
          🕷️ Run Crawl (Analyze multiple pages)
        </Label>
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
                <Label htmlFor="allowSubdomains" className="text-white/80 text-sm cursor-pointer">
                  Allow Subdomains
                </Label>
                <Switch
                  id="allowSubdomains"
                  checked={allowSubdomains}
                  onCheckedChange={setAllowSubdomains}
                  disabled={loading}
                  className="data-[state=checked]:bg-white"
                />
              </div>

              {/* Run Audits */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="runAudits" className="text-white/80 text-sm cursor-pointer">
                    🔍 Run Performance Audits (Optional)
                  </Label>
                  <p className="text-[10px] text-white/50">
                    Lighthouse audits with Core Web Vitals (LCP, TBT, CLS)
                  </p>
                </div>
                <Switch
                  id="runAudits"
                  checked={runAudits}
                  onCheckedChange={setRunAudits}
                  disabled={loading}
                  className="data-[state=checked]:bg-white"
                />
              </div>

              {/* Audit Device (only show if runAudits is enabled) */}
              {runAudits && (
                <div className="space-y-2 pl-4 border-l-2 border-zinc-700">
                  <Label htmlFor="auditDevice" className="text-white/80 text-sm">
                    Audit Device
                  </Label>
                  <Select value={auditDevice} onValueChange={(value: 'mobile' | 'desktop') => setAuditDevice(value)} disabled={loading}>
                    <SelectTrigger 
                      id="auditDevice"
                      className="bg-zinc-800/50 border-zinc-700 text-white hover:bg-white/15"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-zinc-700">
                      <SelectItem value="desktop" className="text-white">Desktop</SelectItem>
                      <SelectItem value="mobile" className="text-white">Mobile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Capture Link Details */}
              <div className="flex items-center justify-between">
                <Label htmlFor="captureLinkDetails" className="text-white/80 text-sm cursor-pointer">
                  Capture Link Details
                </Label>
                <Switch
                  id="captureLinkDetails"
                  checked={captureLinkDetails}
                  onCheckedChange={setCaptureLinkDetails}
                  disabled={loading}
                  className="data-[state=checked]:bg-white"
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
