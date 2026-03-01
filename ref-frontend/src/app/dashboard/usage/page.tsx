'use client'

import { TrendingUp, Zap, Database, Clock } from 'lucide-react'

export default function UsagePage() {
  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
      {/* Usage Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* API Requests */}
        <div className="group rounded-2xl p-3 sm:p-4 border border-zinc-800 bg-[#111113] hover:border-zinc-700 hover:bg-[#1A1A1A] transition-all duration-300">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">API Requests</span>
              <Zap className="h-4 w-4 text-zinc-500 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-1">
              <p className="text-xl sm:text-2xl font-bold text-white">24.5K</p>
              <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> 12% increase this week
              </p>
            </div>
            <div className="w-full bg-zinc-800/50 rounded-full h-1.5 overflow-hidden">
              <div className="bg-white/60 h-full rounded-full w-[65%]" />
            </div>
            <p className="text-[10px] text-zinc-500">65% of 40K monthly limit</p>
          </div>
        </div>

        {/* Bandwidth */}
        <div className="group rounded-2xl p-3 sm:p-4 border border-zinc-800 bg-[#111113] hover:border-zinc-700 hover:bg-[#1A1A1A] transition-all duration-300">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Bandwidth Used</span>
              <Database className="h-4 w-4 text-zinc-500 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-1">
              <p className="text-xl sm:text-2xl font-bold text-white">45.2GB</p>
              <p className="text-[10px] text-zinc-500">Of 500GB monthly limit</p>
            </div>
            <div className="w-full bg-zinc-800/50 rounded-full h-1.5 overflow-hidden">
              <div className="bg-white/60 h-full rounded-full w-[9%]" />
            </div>
            <p className="text-[10px] text-zinc-500">9% utilized</p>
          </div>
        </div>

        {/* Storage */}
        <div className="group rounded-2xl p-3 sm:p-4 border border-zinc-800 bg-[#111113] hover:border-zinc-700 hover:bg-[#1A1A1A] transition-all duration-300">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Storage Used</span>
              <Database className="h-4 w-4 text-zinc-500 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-1">
              <p className="text-xl sm:text-2xl font-bold text-white">128GB</p>
              <p className="text-[10px] text-zinc-500">Of 1TB total limit</p>
            </div>
            <div className="w-full bg-zinc-800/50 rounded-full h-1.5 overflow-hidden">
              <div className="bg-white/60 h-full rounded-full w-[12.8%]" />
            </div>
            <p className="text-[10px] text-zinc-500">12.8% utilized</p>
          </div>
        </div>

        {/* Uptime */}
        <div className="group rounded-2xl p-3 sm:p-4 border border-zinc-800 bg-[#111113] hover:border-zinc-700 hover:bg-[#1A1A1A] transition-all duration-300">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Uptime</span>
              <Clock className="h-4 w-4 text-zinc-500 group-hover:text-white/80 transition-colors" />
            </div>
            <div className="space-y-1">
              <p className="text-xl sm:text-2xl font-bold text-white">99.98%</p>
              <p className="text-[10px] text-zinc-500">This month</p>
            </div>
            <div className="w-full bg-zinc-800/50 rounded-full h-1.5 overflow-hidden">
              <div className="bg-white/60 h-full rounded-full w-[99.98%]" />
            </div>
            <p className="text-[10px] text-zinc-500">Excellent performance</p>
          </div>
        </div>
      </div>

      {/* Usage Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Daily API Requests */}
        <div className="rounded-2xl p-3 sm:p-4 border border-zinc-800 bg-[#111113]">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-3">Daily API Requests</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
              <span className="text-xs sm:text-sm text-zinc-400">Monday</span>
              <div className="flex items-center gap-2">
                <div className="w-16 sm:w-20 bg-zinc-800/50 rounded-full h-1.5 md:h-2">
                  <div className="bg-white/60 h-full rounded-full w-[45%]" />
                </div>
                <span className="text-xs sm:text-sm text-zinc-500 min-w-fit">4.2K</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-1.5 md:py-2 border-b border-zinc-700">
              <span className="text-xs sm:text-sm text-zinc-400">Tuesday</span>
              <div className="flex items-center gap-2">
                <div className="w-16 sm:w-20 bg-zinc-800/50 rounded-full h-1.5 md:h-2">
                  <div className="bg-white/60 h-full rounded-full w-[52%]" />
                </div>
                <span className="text-xs sm:text-sm text-zinc-500 min-w-fit">4.8K</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-1.5 md:py-2 border-b border-zinc-700">
              <span className="text-xs sm:text-sm text-zinc-400">Wednesday</span>
              <div className="flex items-center gap-2">
                <div className="w-16 sm:w-20 bg-zinc-800/50 rounded-full h-1.5 md:h-2">
                  <div className="bg-white/60 h-full rounded-full w-[65%]" />
                </div>
                <span className="text-xs sm:text-sm text-zinc-500 min-w-fit">5.9K</span>
              </div>
            </div>
          </div>
        </div>

        {/* Resource Breakdown */}
        <div className="rounded-2xl md:rounded-2xl p-4 sm:p-5 md:p-6 border border-zinc-700 bg-zinc-800/50 backdrop-blur-xl">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-3 md:mb-4">Resource Breakdown</h3>
          <div className="space-y-3 md:space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5 md:mb-2">
                <span className="text-xs sm:text-sm text-zinc-400">Compute</span>
                <span className="text-xs sm:text-sm font-semibold text-white">45%</span>
              </div>
              <div className="w-full bg-zinc-800/50 rounded-full h-1.5 md:h-2">
                <div className="bg-white/60 h-full rounded-full w-[45%]" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5 md:mb-2">
                <span className="text-xs sm:text-sm text-zinc-400">Storage</span>
                <span className="text-xs sm:text-sm font-semibold text-white">28%</span>
              </div>
              <div className="w-full bg-zinc-800/50 rounded-full h-1.5 md:h-2">
                <div className="bg-white/60 h-full rounded-full w-[28%]" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5 md:mb-2">
                <span className="text-xs sm:text-sm text-zinc-400">Bandwidth</span>
                <span className="text-xs sm:text-sm font-semibold text-white">18%</span>
              </div>
              <div className="w-full bg-zinc-800/50 rounded-full h-1.5 md:h-2">
                <div className="bg-white/60 h-full rounded-full w-[18%]" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5 md:mb-2">
                <span className="text-xs sm:text-sm text-zinc-400">Database</span>
                <span className="text-xs sm:text-sm font-semibold text-white">9%</span>
              </div>
              <div className="w-full bg-zinc-800/50 rounded-full h-1.5 md:h-2">
                <div className="bg-white/60 h-full rounded-full w-[9%]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
