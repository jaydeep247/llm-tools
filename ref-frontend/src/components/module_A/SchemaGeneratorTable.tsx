'use client'

import { useState } from 'react'
import { 
  Play,
  Copy,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGenerateSchemaMutation } from '@/store/api/module_C/aeoApi'
import { useGetSessionQuery } from '@/store/api/projectApi'

interface SchemaGeneratorTableProps {
  sessionId: number
  sessionStatus?: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'
  isLoading?: boolean
  onRefresh?: () => void
  onExport?: () => void
}

export function SchemaGeneratorTable({ 
  sessionId,
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

  // Fetch session data to get the URL
  const { data: sessionData } = useGetSessionQuery(sessionId)
  const session = sessionData?.session
  const url = session?.startUrl || ''

  // Generate schema mutation
  const [generateSchema, { isLoading: isGeneratingSchema }] = useGenerateSchemaMutation()

  const handleGenerateSchema = async () => {
    if (!url) {
      setSchemaError('No URL found for this session')
      return
    }

    setSchemaLoading(true)
    setSchemaError(null)

    try {
      const result = await generateSchema({ 
        url, 
        schema_type: selectedSchemaType 
      }).unwrap()

      if (result.success) {
        // Handle both possible response formats
        setSchemaData(result.results || result.schema)
      } else {
        setSchemaError(result.error || 'Failed to generate schema')
      }
    } catch (error: any) {
      setSchemaError(error?.data?.error || error?.message || 'Failed to generate schema')
    } finally {
      setSchemaLoading(false)
    }
  }

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
          <p className="text-sm text-white/60 mt-1">Generate SEO-optimized Schema.org JSON-LD markup using AI</p>
        </div>
        <Button
          onClick={handleGenerateSchema}
          disabled={schemaLoading || !url}
          className="bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-500 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          <Play className={`h-4 w-4 mr-2 ${schemaLoading ? 'animate-spin' : ''}`} />
          {schemaLoading ? 'Generating...' : 'Generate Schema'}
        </Button>
      </div>

      {/* Schema Type Selector */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-4">
        <label htmlFor="schema-type" className="block text-sm font-medium text-white mb-2">
          Select Schema Type:
        </label>
        <div className="relative w-full sm:w-96">
          <select
            id="schema-type"
            className="w-full bg-white/5 border border-white/20 text-white text-sm h-10 rounded-full px-4 pr-10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            value={selectedSchemaType}
            onChange={(e) => setSelectedSchemaType(e.target.value)}
            disabled={schemaLoading}
          >
            <option value="auto">🤖 Auto-detect (Recommended)</option>
            <option value="Organization">🏢 Organization Markup</option>
            <option value="LocalBusiness">🏪 Local Business Markup</option>
            <option value="WebPage">📄 WebPage Markup</option>
            <option value="Article">📰 Article Markup</option>
            <option value="BlogPosting">✍️ Blog Post Markup</option>
            <option value="Product">🛍️ Product Markup</option>
            <option value="Service">⚙️ Service Markup</option>
            <option value="FAQPage">❓ FAQ Markup</option>
            <option value="BreadcrumbList">🍞 Breadcrumb Markup</option>
            <option value="Person">👤 Person Markup</option>
            <option value="Event">📅 Event Markup</option>
            <option value="Recipe">🍳 Recipe Markup</option>
            <option value="HowTo">📖 How To Markup</option>
            <option value="VideoObject">🎥 Video Markup</option>
            <option value="ImageObject">🖼️ Image Markup</option>
            <option value="Course">🎓 Course Markup</option>
            <option value="JobPosting">💼 Job Posting Markup</option>
            <option value="Review">⭐ Review Markup</option>
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
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
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-12">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-white/20 border-t-green-400 rounded-full animate-spin"></div>
            </div>
            <p className="text-white text-lg font-medium">Analyzing page content and generating schema markup...</p>
            <p className="text-white/60 text-sm">This may take a few moments</p>
          </div>
        </div>
      )}

      {/* Schema Results */}
      {schemaData && !schemaLoading && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg overflow-hidden">
          {/* Header with Format Toggle and Copy Button */}
          <div className="bg-white/10 border-b border-white/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h4 className="text-base font-semibold text-white">Schema Markup</h4>
              <div className="flex items-center gap-2 bg-white/5 rounded-full p-1">
                <button
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer ${
                    schemaFormat === 'json-ld'
                      ? 'bg-white text-black'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                  onClick={() => setSchemaFormat('json-ld')}
                >
                  JSON-LD
                </button>
                <button
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer ${
                    schemaFormat === 'rdfa'
                      ? 'bg-white text-black'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
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
              className="bg-white/5 border-white/20 text-white hover:bg-white/10 cursor-pointer"
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
            <pre className="text-xs sm:text-sm text-white/90 font-mono bg-black/30 p-4 rounded-lg overflow-x-auto">
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
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-lg p-12">
          <div className="flex flex-col items-center justify-center gap-4 text-center max-w-2xl mx-auto">
            <div className="text-6xl mb-2">📝</div>
            <h3 className="text-xl font-bold text-white">Generate Schema Markup</h3>
            <p className="text-white/70">
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
