import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageMetrics } from './PageMetrics'
import { KeywordMetrics } from './KeywordMetrics'
import { PerformanceMetrics } from './PerformanceMetrics'
import { ContentMetrics } from './ContentMetrics'
import { BacklinkMetrics } from './BacklinkMetrics'
import { Recommendations } from './Recommendations'
import { addContentAuditSheet, createWorkbook, downloadWorkbook } from '@/utils/excelExport'

interface MainContentAuditProps {
  pageMetricsData: any[]
  contentMetricsData?: any[]
  isLoadingMetrics?: boolean
  onRefreshMetrics?: () => void
  sessionId: string | number
  jobId: string | null
  sessionStatus?: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'
  activeTab?: string
  onTabChange?: (tab: string) => void
}

export function MainContentAudit({
  pageMetricsData,
  contentMetricsData = [],
  isLoadingMetrics,
  onRefreshMetrics,
  sessionId,
  jobId,
  sessionStatus,
  activeTab = 'page-metrics',
  onTabChange,
}: MainContentAuditProps) {

  const handleExport = () => {
    const workbook = createWorkbook()
    const exportDate = new Date().toISOString().split('T')[0]

    addContentAuditSheet(workbook, pageMetricsData, 'Content Audit')
    downloadWorkbook(workbook, `content-audit-${sessionId}-${exportDate}`)
  }

  const tabs = [
    { id: 'page-metrics', label: 'Page Metrics' },
    { id: 'keyword-metrics', label: 'Keyword Metrics' },
    { id: 'performance-metrics', label: 'Performance Metrics' },
    { id: 'content-metrics', label: 'Content Metrics' },
    { id: 'backlink-metrics', label: 'Backlink Metrics' },
    { id: 'recommendations', label: 'Recommendations' },
  ]

  return (
    <div className="flex flex-col h-full gap-3 -mt-2">
      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange ? onTabChange(tab.id) : undefined}
              className={`px-4 py-2 text-sm font-medium rounded-full cursor-pointer transition-colors border ${
                activeTab === tab.id
                  ? 'bg-(--nd-purple) text-white border-(--nd-purple)'
                  : 'bg-(--nd-bg) text-(--nd-text-muted) border-(--nd-border) hover:text-(--nd-text-secondary) hover:border-(--nd-border-hover)'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button
          onClick={handleExport}
          variant="outline"
          size="sm"
          disabled={isLoadingMetrics}
          className="bg-white border-(--nd-border) text-(--nd-text-secondary) hover:bg-(--nd-bg) hover:text-(--nd-text-primary) rounded-xl"
        >
          <Download className="h-4 w-4 mr-2" />
          Export Sheet
        </Button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'page-metrics' && (
          <PageMetrics 
            data={pageMetricsData} 
            isLoading={isLoadingMetrics} 
            onRefresh={onRefreshMetrics} 
            jobId={jobId}
          />
        )}
        {activeTab === 'keyword-metrics' && (
          <KeywordMetrics
            data={pageMetricsData}
            isLoading={isLoadingMetrics}
            onRefresh={onRefreshMetrics}
            jobId={jobId}
          />
        )}
        {activeTab === 'performance-metrics' && (
          <PerformanceMetrics 
            data={pageMetricsData} 
            isLoading={isLoadingMetrics} 
            onRefresh={onRefreshMetrics} 
            jobId={jobId}
          />
        )}
        {activeTab === 'content-metrics' && (
          <ContentMetrics
            data={contentMetricsData}
            isLoading={isLoadingMetrics}
            onRefresh={onRefreshMetrics}
            jobId={jobId}
          />
        )}
        {activeTab === 'backlink-metrics' && (
          <BacklinkMetrics
            data={pageMetricsData}
            isLoading={isLoadingMetrics}
            onRefresh={onRefreshMetrics}
            jobId={jobId}
          />
        )}
        {activeTab === 'recommendations' && (
          <Recommendations jobId={jobId ?? ''} />
        )}
      </div>
    </div>
  )
}
