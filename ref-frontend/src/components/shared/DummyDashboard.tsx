'use client'

import {
  LayoutDashboard,
  FolderOpen,
  Percent,
  Users,
  Download,
  Settings,
  Search,
  Bell,
  ChevronRight,
  Zap,
  TrendingUp,
  ArrowRight,
  Globe,
  BarChart3,
  FileText,
} from 'lucide-react'

/**
 * Light-mode static replica of the real Contentlytics dashboard.
 * Shows actual text, labels, real-looking data — not skeleton boxes.
 * Used as decorative background behind onboarding modals and login.
 */
export function DummyDashboard() {
  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, active: true },
    { label: 'Projects', icon: FolderOpen, active: false },
    { label: 'Usage', icon: Percent, active: false },
    { label: 'Subscriptions', icon: Users, active: false },
    { label: 'Export & API', icon: Download, active: false },
  ]

  const projects = [
    { name: 'Marketing Site', url: 'marketing.example.com', sessions: 8, status: 'Active', pages: 2340 },
    { name: 'Blog Platform', url: 'blog.example.com', sessions: 5, status: 'Active', pages: 856 },
    { name: 'E-commerce Store', url: 'shop.example.com', sessions: 3, status: 'Active', pages: 4210 },
    { name: 'Documentation', url: 'docs.example.com', sessions: 12, status: 'Active', pages: 1120 },
  ]

  const activities = [
    { project: 'Marketing Site', type: 'Crawl completed', pages: '2,340 pages', time: '2 min ago', color: 'bg-emerald-500' },
    { project: 'Blog Platform', type: 'Brand analysis running', pages: '856 pages', time: '5 min ago', color: 'bg-brand-orange' },
    { project: 'E-commerce Store', type: 'SEO audit complete', pages: '4,210 pages', time: '12 min ago', color: 'bg-blue-500' },
  ]

  return (
    <div className="w-full h-full flex bg-[#F8F6F3]">
      {/* ── Sidebar ── */}
      <aside className="hidden lg:flex w-68 bg-white border-r border-black/[0.06] flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 flex items-center h-18">
          <span className="text-xl font-bold tracking-tight text-brand-charcoal">Contentlytics</span>
        </div>

        <div className="mx-5 h-px bg-black/[0.06]" />

        {/* Nav */}
        <div className="flex-1 px-3 py-3 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium ${
                  item.active
                    ? 'bg-brand-orange/10 text-brand-orange'
                    : 'text-[#8A8580]'
                }`}
              >
                <Icon className={`w-4 h-4 ${item.active ? 'text-brand-orange' : 'text-[#B5B0AA]'}`} />
                <span>{item.label}</span>
              </div>
            )
          })}
        </div>

        <div className="mx-5 h-px bg-black/[0.06]" />

        {/* Settings */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium text-[#8A8580]">
            <Settings className="w-4 h-4 text-[#B5B0AA]" />
            <span>Settings</span>
          </div>
        </div>

        <div className="mx-5 h-px bg-black/[0.06]" />

        {/* User */}
        <div className="px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-orange to-brand-orange-hover flex items-center justify-center text-white text-xs font-semibold shrink-0">
            J
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-brand-charcoal truncate">John Doe</p>
            <p className="text-[11px] text-[#8A8580] truncate">john@example.com</p>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="flex-1 p-1.5 md:p-3 h-full overflow-hidden">
        <div className="bg-white rounded-2xl border border-black/[0.06] h-full flex flex-col overflow-hidden">
          {/* Navbar */}
          <header className="flex h-15 shrink-0 items-center justify-between px-6 py-3 border-b border-black/[0.04]">
            <nav className="flex items-center gap-1.5 text-sm">
              <span className="text-[#8A8580]">Dashboard</span>
              <ChevronRight className="h-3 w-3 text-[#C5C0BA]" />
              <span className="text-brand-charcoal font-medium">Overview</span>
            </nav>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2 bg-[#F8F6F3] border border-black/[0.06] rounded-xl px-3 py-1.5 w-55">
                <Search className="h-3.5 w-3.5 text-[#B5B0AA]" />
                <span className="text-sm text-[#B5B0AA]">Search...</span>
                <kbd className="ml-auto text-[10px] text-[#B5B0AA] bg-white px-1.5 py-0.5 rounded-md font-mono border border-black/[0.06]">⌘K</kbd>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center relative hover:bg-[#F8F6F3]">
                <Bell className="h-4 w-4 text-[#8A8580]" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-orange ring-2 ring-white" />
              </div>
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-orange to-brand-orange-hover flex items-center justify-center text-white text-xs font-semibold ml-1">
                J
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
            {/* Greeting */}
            <div>
              <h1 className="text-2xl font-bold text-brand-charcoal">Good morning, John 👋</h1>
              <p className="text-sm text-[#8A8580] mt-1">Here&apos;s what&apos;s happening with your projects today.</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Projects', value: '12', sub: 'Click to manage', icon: FolderOpen, accent: 'text-blue-600 bg-blue-50', iconColor: 'text-blue-500' },
                { label: 'Current Plan', value: 'Pro', sub: 'Renews Dec 15', icon: Zap, accent: 'text-violet-600 bg-violet-50', iconColor: 'text-violet-500' },
                { label: 'API Usage', value: '45%', sub: 'Of monthly quota', icon: TrendingUp, accent: 'text-emerald-600 bg-emerald-50', iconColor: 'text-emerald-500' },
                { label: 'Team Members', value: '5', sub: 'Active members', icon: Users, accent: 'text-amber-600 bg-amber-50', iconColor: 'text-amber-500' },
              ].map((card) => {
                const Icon = card.icon
                return (
                  <div key={card.label} className="rounded-xl border border-black/[0.06] p-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-[#8A8580]">{card.label}</span>
                      <div className={`w-7 h-7 rounded-lg ${card.accent} flex items-center justify-center`}>
                        <Icon className={`w-3.5 h-3.5 ${card.iconColor}`} />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-brand-charcoal">{card.value}</div>
                    <p className="text-[11px] text-[#B5B0AA] mt-1">{card.sub}</p>
                  </div>
                )
              })}
            </div>

            {/* Recent Projects */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-brand-charcoal">Recent Projects</h2>
                <button className="flex items-center gap-1 text-xs font-semibold text-brand-orange bg-brand-orange/10 px-3 py-1.5 rounded-full">
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {projects.map((proj) => (
                  <div key={proj.name} className="rounded-xl border border-black/[0.06] p-4 bg-white">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-sm font-semibold text-brand-charcoal">{proj.name}</h3>
                        <p className="text-[11px] text-[#B5B0AA] mt-0.5 flex items-center gap-1">
                          <Globe className="w-3 h-3" /> {proj.url}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                        {proj.status}
                      </span>
                      <div className="flex items-center gap-3 text-[10px] text-[#8A8580]">
                        <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {proj.pages.toLocaleString()} pages</span>
                        <span>{proj.sessions} sessions</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Activity */}
            <div className="rounded-xl border border-black/[0.06] p-5 bg-white">
              <div className="flex items-center gap-2 mb-4">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <h2 className="text-sm font-semibold text-brand-charcoal">Live Crawl Activity</h2>
              </div>
              {activities.map((a, i) => (
                <div key={i} className="flex items-center gap-4 py-2.5 border-b border-black/[0.04] last:border-0">
                  <div className={`w-2 h-2 rounded-full ${a.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium text-brand-charcoal">{a.project}</span>
                    <span className="text-[11px] text-[#8A8580] ml-2">{a.type}</span>
                  </div>
                  <span className="text-[11px] text-[#B5B0AA] tabular-nums">{a.pages}</span>
                  <span className="text-[11px] text-[#B5B0AA]">{a.time}</span>
                </div>
              ))}
            </div>

            {/* SEO Score overview */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'SEO Health', score: 87, color: 'text-emerald-600', bar: 'bg-emerald-500', barBg: 'bg-emerald-100' },
                { label: 'Content Quality', score: 74, color: 'text-brand-orange', bar: 'bg-brand-orange', barBg: 'bg-brand-orange/15' },
                { label: 'Performance', score: 92, color: 'text-blue-600', bar: 'bg-blue-500', barBg: 'bg-blue-100' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-black/[0.06] p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-[#8A8580]">{item.label}</span>
                    <BarChart3 className="w-4 h-4 text-[#B5B0AA]" />
                  </div>
                  <div className={`text-2xl font-bold ${item.color}`}>{item.score}%</div>
                  <div className={`w-full h-1.5 rounded-full ${item.barBg} mt-3`}>
                    <div className={`h-full rounded-full ${item.bar}`} style={{ width: `${item.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
