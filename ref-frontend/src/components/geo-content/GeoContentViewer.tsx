'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Copy,
  Pencil,
  Check,
  X,
  Loader2,
  AlertCircle,
  ChevronDown,
  ExternalLink,
  Linkedin,
  Globe,
  ImageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useGetGeoContentQuery, useUpdateGeoContentTitleMutation } from '@/store/api/geoContentApi'

// ─── Prose styles ─────────────────────────────────────────────────────────────
const PROSE_STYLES = `
  .geo-prose h1 { font-size: 1.875rem; font-weight: 700; color: #1A1D2B; margin-bottom: 1rem; line-height: 1.2; }
  .geo-prose h2 { font-size: 1.375rem; font-weight: 600; color: #1A1D2B; margin-top: 2rem; margin-bottom: 0.75rem; }
  .geo-prose h3 { font-size: 1.125rem; font-weight: 600; color: #4A5068; margin-top: 1.5rem; margin-bottom: 0.5rem; }
  .geo-prose p { color: #4A5068; line-height: 1.75; margin-bottom: 1rem; }
  .geo-prose ul, .geo-prose ol { color: #4A5068; margin-bottom: 1rem; padding-left: 1.5rem; }
  .geo-prose li { margin-bottom: 0.4rem; line-height: 1.7; }
  .geo-prose strong { color: #1A1D2B; font-weight: 600; }
  .geo-prose em { color: #5347CE; font-style: italic; }
  .geo-prose blockquote { border-left: 3px solid #5347CE; padding-left: 1rem; margin: 1.5rem 0; color: #4A5068; font-style: italic; }
`

// ─── Copy helpers ─────────────────────────────────────────────────────────────

function copyAsHtml(html: string) {
  navigator.clipboard.writeText(html).catch(() => {})
}

function copyAsMarkdown(html: string) {
  try {
    import('turndown').then(({ default: TurndownService }) => {
      const td = new TurndownService()
      navigator.clipboard.writeText(td.turndown(html)).catch(() => {})
    })
  } catch {
    copyAsPlainText(html)
  }
}

function copyAsPlainText(html: string) {
  try {
    const text = new DOMParser().parseFromString(html, 'text/html').body.innerText
    navigator.clipboard.writeText(text).catch(() => {})
  } catch {
    navigator.clipboard.writeText(html.replace(/<[^>]+>/g, ' ')).catch(() => {})
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GeoContentViewer({
  id,
  onBack,
}: {
  id: string
  onBack: () => void
}) {
  const { data: content, isLoading, error } = useGetGeoContentQuery(id)
  const [updateTitle, { isLoading: isSavingTitle }] = useUpdateGeoContentTitleMutation()

  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)
  const [copiedLinkedin, setCopiedLinkedin] = useState<'title' | 'body' | null>(null)
  const [linkedinOpen, setLinkedinOpen] = useState(false)

  const handleStartEditTitle = () => {
    setDraftTitle(content?.title ?? '')
    setEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    if (!draftTitle.trim() || !content) return
    try {
      await updateTitle({ id, title: draftTitle.trim() }).unwrap()
      setEditingTitle(false)
    } catch {
      // title stays as-is
    }
  }

  const handleCancelTitle = () => {
    setEditingTitle(false)
    setDraftTitle('')
  }

  const handleCopy = (format: 'html' | 'markdown' | 'text') => {
    if (!content) return
    if (format === 'html') copyAsHtml(content.htmlContent)
    if (format === 'markdown') copyAsMarkdown(content.htmlContent)
    if (format === 'text') copyAsPlainText(content.htmlContent)
    setCopiedFormat(format)
    setTimeout(() => setCopiedFormat(null), 2000)
  }

  // ─── States ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-(--nd-text-muted)" />
      </div>
    )
  }

  if (error || !content) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="h-12 w-12 text-red-600 mb-3" />
        <h2 className="text-lg font-semibold text-(--nd-text-primary) mb-1">Content not found</h2>
        <p className="text-(--nd-text-muted) text-sm mb-4">This article doesn&apos;t exist or you don&apos;t have access.</p>
        <Button
          onClick={onBack}
          variant="outline"
          className="border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) cursor-pointer"
        >
          Back to Content List
        </Button>
      </div>
    )
  }

  // Remove <h1> from body (we render title separately with edit support)
  const bodyHtml = content.htmlContent
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '')
    .trim()

  const copyLinkedin = (which: 'title' | 'body') => {
    if (which === 'title') navigator.clipboard.writeText(content.title).catch(() => {})
    else copyAsPlainText(bodyHtml)
    setCopiedLinkedin(which)
    setTimeout(() => setCopiedLinkedin(null), 2000)
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{PROSE_STYLES}</style>

      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-hero pb-16">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button
            id="geo-viewer-back-btn"
            onClick={onBack}
            className="flex items-center gap-1.5 text-(--nd-text-muted) hover:text-(--nd-text-primary) text-sm transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Content list
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Copy dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id="geo-copy-dropdown-btn"
                  variant="outline"
                  size="sm"
                  className="border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) hover:text-(--nd-text-primary) gap-1.5 cursor-pointer"
                >
                  {copiedFormat ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white border-(--nd-border)">
                <DropdownMenuItem
                  id="geo-copy-html"
                  className="text-(--nd-text-secondary) focus:bg-(--nd-bg) focus:text-(--nd-text-primary) cursor-pointer"
                  onClick={() => handleCopy('html')}
                >
                  Copy as HTML
                </DropdownMenuItem>
                <DropdownMenuItem
                  id="geo-copy-markdown"
                  className="text-(--nd-text-secondary) focus:bg-(--nd-bg) focus:text-(--nd-text-primary) cursor-pointer"
                  onClick={() => handleCopy('markdown')}
                >
                  Copy as Markdown
                </DropdownMenuItem>
                <DropdownMenuItem
                  id="geo-copy-text"
                  className="text-(--nd-text-secondary) focus:bg-(--nd-bg) focus:text-(--nd-text-primary) cursor-pointer"
                  onClick={() => handleCopy('text')}
                >
                  Copy as Plain Text
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* WordPress */}
            <Button
              id="geo-wordpress-btn"
              variant="outline"
              size="sm"
              className="border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) hover:text-(--nd-text-primary) gap-1.5 cursor-pointer"
              onClick={() => window.open('https://wordpress.com/post', '_blank')}
            >
              <Globe className="h-3.5 w-3.5" />
              WordPress
            </Button>

            {/* LinkedIn Pulse */}
            <Button
              id="geo-linkedin-btn"
              variant="outline"
              size="sm"
              className="border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) hover:text-(--nd-text-primary) gap-1.5 cursor-pointer"
              onClick={() => setLinkedinOpen(true)}
            >
              <Linkedin className="h-3.5 w-3.5" />
              LinkedIn Pulse
            </Button>

            {/* Image Generator (placeholder) */}
            <Button
              id="geo-image-btn"
              variant="outline"
              size="sm"
              className="border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) hover:text-(--nd-text-primary) gap-1.5 cursor-pointer"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Image Generator
            </Button>
          </div>
        </div>

        {/* ── Content card ── */}
<div className="rounded-2xl border border-(--nd-border) bg-white p-8 sm:p-10">

          {/* Title with inline edit */}
          <div className="group relative mb-6">
            {editingTitle ? (
              <div className="flex items-start gap-2">
                <Input
                  id="geo-title-input"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle()
                    if (e.key === 'Escape') handleCancelTitle()
                  }}
                  className="text-2xl sm:text-3xl font-bold bg-(--nd-bg) border-(--nd-border) text-(--nd-text-primary) h-auto py-1"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={isSavingTitle}
                  onClick={handleSaveTitle}
                  className="shrink-0 h-9 w-9 text-green-600 hover:bg-green-50 cursor-pointer"
                >
                  {isSavingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancelTitle}
                  className="shrink-0 h-9 w-9 text-red-600 hover:bg-red-50 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-(--nd-text-primary) leading-tight flex-1">
                  {content.title}
                </h1>
                <button
                  id="geo-edit-title-btn"
                  onClick={handleStartEditTitle}
                  className="opacity-0 group-hover:opacity-100 shrink-0 mt-1 p-1.5 rounded-lg text-(--nd-text-muted) hover:text-(--nd-text-primary) hover:bg-(--nd-bg) transition-all cursor-pointer"
                  aria-label="Edit title"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Article body */}
          <div
            className="geo-prose"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          {/* Footer meta */}
          <div className="mt-8 pt-6 border-t border-(--nd-border) flex flex-wrap gap-4 text-xs text-(--nd-text-muted)">
            <span>{content.wordCount.toLocaleString()} words</span>
            {content.listicle && <span>Listicle format</span>}
            {content.keywords.length > 0 && (
              <span>Keywords: {content.keywords.join(', ')}</span>
            )}
            <span>
              Created {new Date(content.createdAt).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* ── LinkedIn Pulse Modal ── */}
      <Dialog open={linkedinOpen} onOpenChange={setLinkedinOpen}>
        <DialogContent
          id="linkedin-pulse-modal"
          className="bg-white border-(--nd-border) text-(--nd-text-primary) max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-(--nd-text-primary) text-lg font-semibold">
              Post to LinkedIn Article
            </DialogTitle>
            <DialogDescription className="text-(--nd-text-muted) text-sm">
              Follow these steps to post your content as a LinkedIn Article (LinkedIn Pulse).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Step 1 */}
<div className="flex items-start gap-3 p-3 rounded-lg bg-(--nd-bg) border border-(--nd-border)">
              <span className="shrink-0 w-6 h-6 rounded-full bg-(--nd-purple-subtle) text-(--nd-purple) text-xs font-bold flex items-center justify-center mt-0.5">
                1
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-(--nd-text-secondary)">Open LinkedIn Article Editor</p>
              </div>
              <Button
                id="linkedin-open-editor-btn"
                size="sm"
                variant="outline"
                className="shrink-0 border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) gap-1.5 cursor-pointer"
                onClick={() => window.open('https://www.linkedin.com/pulse/new/', '_blank')}
              >
                Open <ExternalLink className="h-3 w-3" />
              </Button>
            </div>

            {/* Step 2 */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-(--nd-bg) border border-(--nd-border)">
              <span className="shrink-0 w-6 h-6 rounded-full bg-(--nd-purple-subtle) text-(--nd-purple) text-xs font-bold flex items-center justify-center mt-0.5">
                2
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-(--nd-text-secondary)">Paste title</p>
              </div>
              <Button
                id="linkedin-copy-title-btn"
                size="sm"
                variant="outline"
                className={`shrink-0 gap-1.5 cursor-pointer transition-all duration-200 ${
                  copiedLinkedin === 'title'
                    ? 'border-green-500/50 text-green-600 bg-green-50 hover:bg-green-100'
                    : 'border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg)'
                }`}
                onClick={() => copyLinkedin('title')}
              >
                {copiedLinkedin === 'title' ? (
                  <><Check className="h-3 w-3" /> Copied!</>
                ) : (
                  <><Copy className="h-3 w-3" /> Copy Title</>
                )}
              </Button>
            </div>

            {/* Step 3 */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-(--nd-bg) border border-(--nd-border)">
              <span className="shrink-0 w-6 h-6 rounded-full bg-(--nd-purple-subtle) text-(--nd-purple) text-xs font-bold flex items-center justify-center mt-0.5">
                3
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-(--nd-text-secondary)">Paste body under the title</p>
              </div>
              <Button
                id="linkedin-copy-body-btn"
                size="sm"
                variant="outline"
                className={`shrink-0 gap-1.5 cursor-pointer transition-all duration-200 ${
                  copiedLinkedin === 'body'
                    ? 'border-green-500/50 text-green-600 bg-green-50 hover:bg-green-100'
                    : 'border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg)'
                }`}
                onClick={() => copyLinkedin('body')}
              >
                {copiedLinkedin === 'body' ? (
                  <><Check className="h-3 w-3" /> Copied!</>
                ) : (
                  <><Copy className="h-3 w-3" /> Copy Body</>
                )}
              </Button>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between w-full mt-2">
            <a
              href="https://www.linkedin.com/help/linkedin/answer/a548918"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-(--nd-text-muted) hover:text-(--nd-text-secondary) underline underline-offset-2 transition-colors"
            >
              Example Screenshot
            </a>
            <Button
              id="linkedin-close-btn"
              variant="outline"
              onClick={() => setLinkedinOpen(false)}
              className="border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) cursor-pointer"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
