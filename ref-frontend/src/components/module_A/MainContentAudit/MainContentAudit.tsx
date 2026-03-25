import { useState } from 'react'
import { PageMetrics } from './PageMetrics'
import { KeywordMetrics } from './KeywordMetrics'
import { PerformanceMetrics } from './PerformanceMetrics'
import { ContentMetrics } from './ContentMetrics'
import { BacklinkMetrics } from './BacklinkMetrics'
import { Recommendations } from './Recommendations'

interface MainContentAuditProps {
  pageMetricsData: any[]
  contentMetricsData?: any[]
  isLoadingMetrics?: boolean
  onRefreshMetrics?: () => void
  sessionId: string | number
  jobId: string | null
  sessionStatus?: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled'
}

export function MainContentAudit({
  pageMetricsData,
  contentMetricsData = [],
  isLoadingMetrics,
  onRefreshMetrics,
  sessionId,
  jobId,
  sessionStatus
}: MainContentAuditProps) {
  const [activeTab, setActiveTab] = useState('page-metrics')

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
      <div className="flex flex-wrap items-center gap-2 pb-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-full cursor-pointer transition-colors border ${
              activeTab === tab.id
                ? 'bg-white text-black border-white'
                : 'bg-[#111113] text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'page-metrics' && (
          <PageMetrics 
            data={pageMetricsData} 
            isLoading={isLoadingMetrics} 
            onRefresh={onRefreshMetrics} 
          />
        )}
        {activeTab === 'keyword-metrics' && (
          <KeywordMetrics
            data={pageMetricsData}
            isLoading={isLoadingMetrics}
            onRefresh={onRefreshMetrics}
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
          />
        )}
        {activeTab === 'backlink-metrics' && (
          <BacklinkMetrics
            data={pageMetricsData}
            isLoading={isLoadingMetrics}
            onRefresh={onRefreshMetrics}
          />
        )}
        {activeTab === 'recommendations' && (
          <Recommendations jobId={jobId ?? ''} />
        )}
      </div>
    </div>
  )
}
