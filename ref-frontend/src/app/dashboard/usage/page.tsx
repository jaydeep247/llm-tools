'use client'

import { TrendingUp, Zap, Database, Clock } from 'lucide-react'
import { StatCard, StatCardGrid } from '@/components/ui/StatCard'
import { SectionCard } from '@/components/ui/SectionCard'
import { UsageBar } from '@/components/ui/UsageBar'

export default function UsagePage() {
  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
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
              <div key={day} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
                <span className="text-xs sm:text-sm text-zinc-400 w-28 shrink-0">{day}</span>
                <div className="flex items-center gap-3 flex-1">
                  <UsageBar value={pct} className="flex-1" />
                  <span className="text-xs sm:text-sm text-zinc-500 min-w-[3rem] text-right">{val}</span>
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
                  <span className="text-xs sm:text-sm text-zinc-400">{label}</span>
                  <span className="text-xs sm:text-sm font-semibold text-white">{pct}%</span>
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
