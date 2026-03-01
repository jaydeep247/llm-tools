

import { useEffect, useState } from 'react'
import { 
  Play,
  Copy,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGetSessionQuery } from '@/store/api/sessionApi'
import { useGetJobSchemaQuery, useGenerateJobSchemaMutation } from '@/store/api/jobApi'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SchemaGeneratorTableProps {
  sessionId: string
  jobId: string | null
  sessionStatus?: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
}

export function SchemaGeneratorTable({ 
  sessionId,
  jobId,
  sessionStatus = 'completed',
  isLoading: externalLoading = false,
  onRefresh,
  onExport 
}: SchemaGeneratorTableProps) {
  const [schemaData, setSchemaData] = useState<any>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [copiedSchema, setCopiedSchema] = useState(false)
  const [schemaFormat, setSchemaFormat] = useState<'json-ld' | 'rdfa'>('json-ld')
  const [selectedSchemaType, setSelectedSchemaType] = useState<string>('auto')
  const [schemaJobId, setSchemaJobId] = useState<string | null>(null)
  const [lastSchemaCreatedAt, setLastSchemaCreatedAt] = useState<string | null>(null)

  const { data: sessionData } = useGetSessionQuery(sessionId)
  const session = sessionData?.session

  const [generateJobSchema] = useGenerateJobSchemaMutation()

  const { data: schemaResult } = useGetJobSchemaQuery(schemaJobId || '', {
    skip: !schemaJobId,
    pollingInterval: schemaLoading ? 3000 : 0,
  })

  const handleGenerateSchema = async () => {
    if (!jobId) {
      setSchemaError('No crawl job found for this session. Run a crawl first.')
      return
    }

    setSchemaLoading(true)
    setSchemaError(null)
    setSchemaData(null)

    try {
      await generateJobSchema({
        jobId,
        schemaType: selectedSchemaType === 'auto' ? undefined : selectedSchemaType,
      }).unwrap()

      setSchemaJobId(jobId)
    } catch (error: any) {
      setSchemaError(error?.data?.error || error?.message || 'Failed to generate schema')
      setSchemaLoading(false)
    }
  }

  useEffect(() => {
    if (!schemaResult) return

    const createdAt = schemaResult.createdAt ?? null

    if (lastSchemaCreatedAt && createdAt && createdAt <= lastSchemaCreatedAt) {
      return
    }

    if (!schemaLoading) return

    if (schemaResult.success) {
      setSchemaData(schemaResult)
      setSchemaLoading(false)
    } else if (schemaResult.error) {
      setSchemaError(schemaResult.message || schemaResult.error || 'Failed to generate schema')
      setSchemaLoading(false)
    }

    if (createdAt) {
      setLastSchemaCreatedAt(createdAt)
    }
  }, [schemaLoading, schemaResult, lastSchemaCreatedAt])

  const copySchemaToClipboard = () => {
    const textToCopy = schemaFormat === 'json-ld'
      ? (schemaData?.schema_text ?? schemaData?.schemaText ?? schemaData?.json_ld)
      : (schemaData?.rdfa_markup ?? schemaData?.rdfaMarkup ?? schemaData?.rdfa)
    
    if (!textToCopy || typeof textToCopy !== 'string') return

    const doCopy = (text: string) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setCopiedSchema(true)
          setTimeout(() => setCopiedSchema(false), 2000)
        }).catch(() => fallbackCopy(text))
      } else {
        fallbackCopy(text)
      }
    }

    const fallbackCopy = (text: string) => {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopiedSchema(true)
        setTimeout(() => setCopiedSchema(false), 2000)
      } catch {
        // ignore
      }
      document.body.removeChild(ta)
    }

    doCopy(textToCopy)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-white">📝 Schema.org Markup Generator</h3>
          <p className="text-sm text-zinc-400 mt-1">Generate SEO-optimized Schema.org JSON-LD markup using AI</p>
        </div>
        <Button
          onClick={handleGenerateSchema}
          disabled={schemaLoading || !jobId}
          className="bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-500 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          <Play className={`h-4 w-4 mr-2 ${schemaLoading ? 'animate-spin' : ''}`} />
          {schemaLoading ? 'Generating...' : 'Generate Schema'}
        </Button>
      </div>

      {/* Schema Type Selector */}
      <div className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-4">
        <label htmlFor="schema-type" className="block text-sm font-medium text-white mb-2">
          Select Schema Type:
        </label>
        <div className="w-full sm:w-96">
          <Select
            value={selectedSchemaType}
            onValueChange={setSelectedSchemaType}
            disabled={schemaLoading}
          >
            <SelectTrigger
              id="schema-type"
              className="bg-zinc-800 border-zinc-700 text-white rounded-full text-sm w-full"
            >
              <SelectValue placeholder="Select schema type" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-zinc-700">
              <SelectItem value="auto" className="text-white text-sm">
                🤖 Auto-detect (Recommended)
              </SelectItem>
              <SelectItem value="Organization" className="text-white text-sm">
                🏢 Organization Markup
              </SelectItem>
              <SelectItem value="LocalBusiness" className="text-white text-sm">
                🏪 Local Business Markup
              </SelectItem>
              <SelectItem value="WebPage" className="text-white text-sm">
                📄 WebPage Markup
              </SelectItem>
              <SelectItem value="Article" className="text-white text-sm">
                📰 Article Markup
              </SelectItem>
              <SelectItem value="BlogPosting" className="text-white text-sm">
                ✍️ Blog Post Markup
              </SelectItem>
              <SelectItem value="Product" className="text-white text-sm">
                🛍️ Product Markup
              </SelectItem>
              <SelectItem value="Service" className="text-white text-sm">
                ⚙️ Service Markup
              </SelectItem>
              <SelectItem value="FAQPage" className="text-white text-sm">
                ❓ FAQ Markup
              </SelectItem>
              <SelectItem value="BreadcrumbList" className="text-white text-sm">
                🍞 Breadcrumb Markup
              </SelectItem>
              <SelectItem value="Person" className="text-white text-sm">
                👤 Person Markup
              </SelectItem>
              <SelectItem value="Event" className="text-white text-sm">
                📅 Event Markup
              </SelectItem>
              <SelectItem value="Recipe" className="text-white text-sm">
                🍳 Recipe Markup
              </SelectItem>
              <SelectItem value="HowTo" className="text-white text-sm">
                📖 How To Markup
              </SelectItem>
              <SelectItem value="VideoObject" className="text-white text-sm">
                🎥 Video Markup
              </SelectItem>
              <SelectItem value="ImageObject" className="text-white text-sm">
                🖼️ Image Markup
              </SelectItem>
              <SelectItem value="Course" className="text-white text-sm">
                🎓 Course Markup
              </SelectItem>
              <SelectItem value="JobPosting" className="text-white text-sm">
                💼 Job Posting Markup
              </SelectItem>
              <SelectItem value="Review" className="text-white text-sm">
                ⭐ Review Markup
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error State */}
      {schemaError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-red-300 mb-1">Error Generating Schema</h4>
            <p className="text-sm text-red-200">{schemaError}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {schemaLoading && (
        <div className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-12">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-zinc-700 border-t-green-400 rounded-full animate-spin"></div>
            </div>
            <p className="text-white text-lg font-medium">Analyzing page content and generating schema markup...</p>
            <p className="text-zinc-400 text-sm">This may take a few moments</p>
          </div>
        </div>
      )}

      {/* Schema Results */}
      {schemaData && !schemaLoading && (
        <div className="bg-zinc-800/50 border border-zinc-800 rounded-lg overflow-hidden">
          {/* Header with Format Toggle and Copy Button */}
          <div className="bg-zinc-800 border-b border-zinc-800 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h4 className="text-base font-semibold text-white">Schema Markup</h4>
              <div className="flex items-center gap-2 bg-zinc-800/50 rounded-full p-1">
                <button
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer ${
                    schemaFormat === 'json-ld'
                      ? 'bg-white text-black'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  onClick={() => setSchemaFormat('json-ld')}
                >
                  JSON-LD
                </button>
                <button
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer ${
                    schemaFormat === 'rdfa'
                      ? 'bg-white text-black'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  onClick={() => setSchemaFormat('rdfa')}
                >
                  RDFa
                </button>
              </div>
            </div>
            <Button
              onClick={copySchemaToClipboard}
              variant="outline"
              size="sm"
              className="bg-zinc-800/50 border-zinc-700 text-white hover:bg-zinc-800 cursor-pointer"
            >
              {copiedSchema ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          </div>

          {/* Schema Code Display */}
          <div className="p-4 overflow-x-auto">
            <pre className="text-xs sm:text-sm text-zinc-100 font-mono bg-black/30 p-4 rounded-lg overflow-x-auto">
              <code>
                {schemaFormat === 'json-ld'
                  ? (schemaData.schema_text ?? schemaData.schemaText ?? schemaData.json_ld ?? '')
                  : (schemaData.rdfa_markup ?? schemaData.rdfaMarkup ?? schemaData.rdfa ?? '')}
              </code>
            </pre>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!schemaData && !schemaLoading && !schemaError && (
        <div className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-12">
          <div className="flex flex-col items-center justify-center gap-4 text-center max-w-2xl mx-auto">
            <div className="text-6xl mb-2">📝</div>
            <h3 className="text-xl font-bold text-white">Generate Schema Markup</h3>
            <p className="text-zinc-300">
              Click the "Generate Schema" button above to create SEO-optimized Schema.org markup for your page.
              <br /><br />
              Our AI will analyze your page content and generate the most appropriate schema type
              (Article, Product, LocalBusiness, Organization, etc.) with all relevant properties.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
