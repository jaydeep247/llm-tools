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
        <Label htmlFor="project" className="text-foreground text-sm font-medium flex items-center gap-2">
          <FolderOpen className="h-4 w-4" />
          Select Project
        </Label>
        <Select value={projectId} onValueChange={setProjectId} disabled={loading}>
          <SelectTrigger 
            id="project"
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground hover:bg-accent focus:bg-accent rounded-2xl"
          >
            <SelectValue placeholder="Choose a project..." />
          </SelectTrigger>
          <SelectContent className="bg-white border-[#E2E8F0] text-[#0F172A] shadow-md">
            {isLoadingProjects ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading projects...</span>
              </div>
            ) : projects.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No projects found. Create one first.
              </div>
            ) : (
              projects.map((project: { id: string; name: string }) => (
                <SelectItem key={project.id} value={project.id.toString()} className="text-foreground">
                  {project.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* URL Input */}
      <div className="space-y-2">
        <Label htmlFor="url" className="text-foreground text-sm font-medium flex items-center gap-2">
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
            className="flex-1 bg-secondary border-border text-foreground placeholder:text-muted-foreground focus:bg-accent rounded-2xl"
            disabled={loading}
            required
          />
          <Button
            type="submit"
            disabled={loading || !url.trim() || !projectId}
            className="bg-primary text-primary-foreground hover:opacity-90 rounded-2xl px-6 font-semibold"
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
      <div className="flex items-center space-x-2 rounded-2xl p-4 bg-secondary border border-border hover:bg-accent transition-all">
        <Switch
          id="runCrawl"
          checked={runCrawl}
          onCheckedChange={setRunCrawl}
          disabled={loading}
          className="data-[state=checked]:bg-primary"
        />
        <Label htmlFor="runCrawl" className="text-foreground cursor-pointer flex-1 text-sm font-medium">
          🕷️ Run Crawl (Analyze multiple pages)
        </Label>
      </div>

      {/* Advanced Options */}
      {runCrawl && (
        <div className="space-y-4 rounded-2xl p-4 bg-secondary border border-border">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-foreground hover:text-primary transition-colors"
          >
            <span className="text-sm font-medium">Advanced Options</span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-4 border-t border-border">
              {/* Allow Subdomains */}
              <div className="flex items-center justify-between">
                <Label htmlFor="allowSubdomains" className="text-foreground text-sm cursor-pointer">
                  Allow Subdomains
                </Label>
                <Switch
                  id="allowSubdomains"
                  checked={allowSubdomains}
                  onCheckedChange={setAllowSubdomains}
                  disabled={loading}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              {/* Run Audits */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="runAudits" className="text-foreground text-sm cursor-pointer">
                    🔍 Run Performance Audits (Optional)
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    Lighthouse audits with Core Web Vitals (LCP, TBT, CLS)
                  </p>
                </div>
                <Switch
                  id="runAudits"
                  checked={runAudits}
                  onCheckedChange={setRunAudits}
                  disabled={loading}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              {/* Audit Device (only show if runAudits is enabled) */}
              {runAudits && (
                <div className="space-y-2 pl-4 border-l-2 border-border">
                  <Label htmlFor="auditDevice" className="text-foreground text-sm">
                    Audit Device
                  </Label>
                  <Select value={auditDevice} onValueChange={(value: 'mobile' | 'desktop') => setAuditDevice(value)} disabled={loading}>
                    <SelectTrigger 
                      id="auditDevice"
                      className="bg-secondary border-border text-foreground hover:bg-accent"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#E2E8F0] text-[#0F172A] shadow-md">
                      <SelectItem value="desktop" className="text-foreground">Desktop</SelectItem>
                      <SelectItem value="mobile" className="text-foreground">Mobile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Capture Link Details */}
              <div className="flex items-center justify-between">
                <Label htmlFor="captureLinkDetails" className="text-foreground text-sm cursor-pointer">
                  Capture Link Details
                </Label>
                <Switch
                  id="captureLinkDetails"
                  checked={captureLinkDetails}
                  onCheckedChange={setCaptureLinkDetails}
                  disabled={loading}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading Progress */}
      {loading && (
        <div className="rounded-2xl p-4 bg-secondary border border-border">
          <div className="flex items-center gap-3 text-muted-foreground text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Fetching data. Please wait...</span>
          </div>
          <div className="mt-3 h-1 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary/60 rounded-full animate-progress-bar" />
          </div>
        </div>
      )}
    </form>
  )
}
