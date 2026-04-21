'use client'

import { TrendingUp, Zap, Database, Clock } from 'lucide-react'
import { StatCard, StatCardGrid } from '@/components/ui/StatCard'
import { SectionCard } from '@/components/ui/SectionCard'
import { UsageBar } from '@/components/ui/UsageBar'

export default function UsagePage() {
  return (
    <div className="nd-page-container">
      <h1 className="nd-page-title">Usage</h1>

      {/* Usage Stats Grid */}
      <StatCardGrid>
        <StatCard
          label="API Requests"
          value="24.5K"
          subtext="12% increase this week"
          icon={Zap}
          accent="zinc"
          trend="up"
          progress={65}
        />
        <StatCard
          label="Bandwidth Used"
          value="45.2GB"
          subtext="Of 500GB monthly limit"
          icon={Database}
          accent="zinc"
          progress={9}
        />
        <StatCard
          label="Storage Used"
          value="128GB"
          subtext="Of 1TB total limit"
          icon={Database}
          accent="zinc"
          progress={12.8}
        />
        <StatCard
          label="Uptime"
          value="99.98%"
          subtext="Excellent performance"
          icon={Clock}
          accent="emerald"
          progress={99.98}
        />
      </StatCardGrid>

      {/* Usage Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Daily API Requests */}
        <SectionCard title="Daily API Requests">
          <div className="space-y-3">
            {[
              { day: 'Monday',    pct: 45,  val: '4.2K' },
              { day: 'Tuesday',   pct: 52,  val: '4.8K' },
              { day: 'Wednesday', pct: 65,  val: '5.9K' },
            ].map(({ day, pct, val }) => (
              <div key={day} className="nd-usage-row">
                <span className="nd-usage-row-label">{day}</span>
                <div className="flex items-center gap-3 flex-1">
                  <UsageBar value={pct} className="flex-1" />
                  <span className="nd-usage-row-value">{val}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Resource Breakdown */}
        <SectionCard title="Resource Breakdown">
          <div className="space-y-4">
            {[
              { label: 'Compute',   pct: 45 },
              { label: 'Storage',   pct: 28 },
              { label: 'Bandwidth', pct: 18 },
              { label: 'Database',  pct: 9  },
            ].map(({ label, pct }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="nd-usage-row-label">{label}</span>
                  <span className="nd-usage-row-pct">{pct}%</span>
                </div>
                <UsageBar value={pct} />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
