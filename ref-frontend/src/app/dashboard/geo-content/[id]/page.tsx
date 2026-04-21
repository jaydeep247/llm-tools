'use client'

import { useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
import { NdDropdown, NdDropdownItem } from '@/components/dashboard/ui/nd-dropdown'
import { NdDialog, NdDialogTitle, NdDialogDescription, NdDialogFooter } from '@/components/dashboard/ui/nd-dialog'
import { useGetGeoContentQuery, useUpdateGeoContentTitleMutation } from '@/store/api/geoContentApi'

// ─── Prose styles injected directly so we don't need @tailwindcss/typography ──
const PROSE_STYLES = `
  .geo-prose h1 { font-size: 1.875rem; font-weight: 700; color: #fff; margin-bottom: 1rem; line-height: 1.2; }
  .geo-prose h2 { font-size: 1.375rem; font-weight: 600; color: #e4e4e7; margin-top: 2rem; margin-bottom: 0.75rem; }
  .geo-prose h3 { font-size: 1.125rem; font-weight: 600; color: #d4d4d8; margin-top: 1.5rem; margin-bottom: 0.5rem; }
  .geo-prose p { color: #a1a1aa; line-height: 1.75; margin-bottom: 1rem; }
  .geo-prose ul, .geo-prose ol { color: #a1a1aa; margin-bottom: 1rem; padding-left: 1.5rem; }
  .geo-prose li { margin-bottom: 0.4rem; line-height: 1.7; }
  .geo-prose strong { color: #e4e4e7; font-weight: 600; }
  .geo-prose em { color: #c4b5fd; font-style: italic; }
  .geo-prose blockquote { border-left: 3px solid #6366f1; padding-left: 1rem; margin: 1.5rem 0; color: #a1a1aa; font-style: italic; }
`

// ─── Copy helpers ─────────────────────────────────────────────────────────────

function copyAsHtml(html: string) {
  navigator.clipboard.writeText(html).catch(() => {})
}

function copyAsMarkdown(html: string) {
  try {
    // Dynamic import to avoid SSR issues
    import('turndown').then(({ default: TurndownService }) => {
      const td = new TurndownService()
      navigator.clipboard.writeText(td.turndown(html)).catch(() => {})
    })
  } catch {
    // Fallback: copy as plain text
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

export default function GeoContentViewerPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const { data: content, isLoading, error } = useGetGeoContentQuery(id)
  const [updateTitle, { isLoading: isSavingTitle }] = useUpdateGeoContentTitleMutation()

  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)
  const [copiedLinkedin, setCopiedLinkedin] = useState<'title' | 'body' | null>(null)

  const copyLinkedin = (which: 'title' | 'body') => {
    if (which === 'title') navigator.clipboard.writeText(content?.title ?? '').catch(() => {})
    else copyAsPlainText(bodyHtml)
    setCopiedLinkedin(which)
    setTimeout(() => setCopiedLinkedin(null), 2000)
  }

  // LinkedIn Pulse modal
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
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (error || !content) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mb-3" />
        <h2 className="text-lg font-semibold text-white mb-1">Content not found</h2>
        <p className="text-zinc-500 text-sm mb-4">This article doesn't exist or you don't have access.</p>
        <button
          onClick={() => router.push('/dashboard/geo-content')}
          className="inline-flex items-center gap-2 px-4 h-9 text-sm rounded-lg border cursor-pointer transition-colors"
          style={{ borderColor: '#3f3f46', color: '#d4d4d8', background: 'transparent' }}
        >
          Back to Content List
        </button>
      </div>
    )
  }

  // Remove <h1> from htmlContent body (we render title separately with edit support)
  const bodyHtml = content.htmlContent
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '')
    .trim()

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Inject prose styles */}
      <style>{PROSE_STYLES}</style>

      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-hero pb-16">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button
            id="geo-viewer-back-btn"
            onClick={() => router.push('/dashboard/geo-content')}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-sm transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Content list
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Copy dropdown */}
            <NdDropdown
              trigger={
                <button
                  id="geo-copy-dropdown-btn"
                  className="inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded-lg border cursor-pointer transition-colors"
                  style={{ borderColor: '#3f3f46', color: '#d4d4d8', background: 'transparent' }}
                >
                  {copiedFormat ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              }
              align="end"
            >
              <NdDropdownItem id="geo-copy-html" onClick={() => handleCopy('html')}>
                Copy as HTML
              </NdDropdownItem>
              <NdDropdownItem id="geo-copy-markdown" onClick={() => handleCopy('markdown')}>
                Copy as Markdown
              </NdDropdownItem>
              <NdDropdownItem id="geo-copy-text" onClick={() => handleCopy('text')}>
                Copy as Plain Text
              </NdDropdownItem>
            </NdDropdown>

            {/* WordPress */}
            <button
              id="geo-wordpress-btn"
              className="inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded-lg border cursor-pointer transition-colors"
              style={{ borderColor: '#3f3f46', color: '#d4d4d8', background: 'transparent' }}
              onClick={() => window.open('https://wordpress.com/post', '_blank')}
            >
              <Globe className="h-3.5 w-3.5" />
              WordPress
            </button>

            {/* LinkedIn Pulse */}
            <button
              id="geo-linkedin-btn"
              className="inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded-lg border cursor-pointer transition-colors"
              style={{ borderColor: '#3f3f46', color: '#d4d4d8', background: 'transparent' }}
              onClick={() => setLinkedinOpen(true)}
            >
              <Linkedin className="h-3.5 w-3.5" />
              LinkedIn Pulse
            </button>

            {/* Image Generator (placeholder) */}
            <button
              id="geo-image-btn"
              className="inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded-lg border cursor-pointer transition-colors"
              style={{ borderColor: '#3f3f46', color: '#d4d4d8', background: 'transparent' }}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Image Generator
            </button>
          </div>
        </div>

        {/* ── Content card ── */}
        <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-8 sm:p-10">

          {/* Title with inline edit */}
          <div className="group relative mb-6">
            {editingTitle ? (
              <div className="flex items-start gap-2">
                <input
                  id="geo-title-input"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle()
                    if (e.key === 'Escape') handleCancelTitle()
                  }}
                  className="text-2xl sm:text-3xl font-bold h-auto py-1 flex-1 border px-3 rounded-lg outline-none"
                  style={{ background: 'rgba(39,39,42,0.5)', borderColor: '#3f3f46', color: '#FFFFFF' }}
                />
                <button
                  disabled={isSavingTitle}
                  onClick={handleSaveTitle}
                  className="shrink-0 h-9 w-9 flex items-center justify-center text-green-400 hover:bg-green-500/10 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {isSavingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
                <button
                  onClick={handleCancelTitle}
                  className="shrink-0 h-9 w-9 flex items-center justify-center text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight flex-1">
                  {content.title}
                </h1>
                <button
                  id="geo-edit-title-btn"
                  onClick={handleStartEditTitle}
                  className="opacity-0 group-hover:opacity-100 shrink-0 mt-1 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all cursor-pointer"
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
          <div className="mt-8 pt-6 border-t border-zinc-800 flex flex-wrap gap-4 text-xs text-zinc-600">
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
      <NdDialog open={linkedinOpen} onOpenChange={setLinkedinOpen} className="bg-[#111113] border-zinc-800 text-white max-w-lg">
        <NdDialogTitle className="text-white text-lg font-semibold">
          Post to LinkedIn Article
        </NdDialogTitle>
        <NdDialogDescription className="text-zinc-500 text-sm">
          Follow these steps to post your content as a LinkedIn Article (LinkedIn Pulse).
        </NdDialogDescription>

          <div className="space-y-4 py-2">
            {/* Step 1 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center mt-0.5">
                1
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300">Open LinkedIn Article Editor</p>
              </div>
              <button
                id="linkedin-open-editor-btn"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded-lg border cursor-pointer transition-colors"
                style={{ borderColor: '#3f3f46', color: '#d4d4d8', background: 'transparent' }}
                onClick={() =>
                  window.open('https://www.linkedin.com/pulse/new/', '_blank')
                }
              >
                Open <ExternalLink className="h-3 w-3" />
              </button>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center mt-0.5">
                2
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300">Paste title</p>
              </div>
              <button
                id="linkedin-copy-title-btn"
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded-lg border cursor-pointer transition-all duration-200 ${
                  copiedLinkedin === 'title'
                    ? 'border-green-500/50 text-green-400 bg-green-500/10'
                    : ''
                }`}
                style={copiedLinkedin === 'title' ? {} : { borderColor: '#3f3f46', color: '#d4d4d8', background: 'transparent' }}
                onClick={() => copyLinkedin('title')}
              >
                {copiedLinkedin === 'title' ? (
                  <><Check className="h-3 w-3" /> Copied!</>
                ) : (
                  <><Copy className="h-3 w-3" /> Copy Title</>
                )}
              </button>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-800">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center mt-0.5">
                3
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300">Paste body under the title</p>
              </div>
              <button
                id="linkedin-copy-body-btn"
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 h-8 text-sm rounded-lg border cursor-pointer transition-all duration-200 ${
                  copiedLinkedin === 'body'
                    ? 'border-green-500/50 text-green-400 bg-green-500/10'
                    : ''
                }`}
                style={copiedLinkedin === 'body' ? {} : { borderColor: '#3f3f46', color: '#d4d4d8', background: 'transparent' }}
                onClick={() => copyLinkedin('body')}
              >
                {copiedLinkedin === 'body' ? (
                  <><Check className="h-3 w-3" /> Copied!</>
                ) : (
                  <><Copy className="h-3 w-3" /> Copy Body</>
                )}
              </button>
            </div>

          </div>

          <NdDialogFooter className="flex items-center justify-between w-full mt-2">
            <a
              href="https://www.linkedin.com/help/linkedin/answer/a548918"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-600 hover:text-zinc-400 underline underline-offset-2 transition-colors"
            >
              Example Screenshot
            </a>
            <button
              id="linkedin-close-btn"
              onClick={() => setLinkedinOpen(false)}
              className="inline-flex items-center gap-2 px-4 h-9 text-sm rounded-lg border cursor-pointer transition-colors"
              style={{ borderColor: '#3f3f46', color: '#d4d4d8', background: 'transparent' }}
            >
              Close
            </button>
          </NdDialogFooter>
      </NdDialog>
    </>
  )
}
