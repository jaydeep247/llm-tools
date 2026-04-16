'use client'

import { motion } from 'framer-motion'
import {
  Sparkles, Globe, Loader2, ArrowRight, FileText,
  Tag, Users, Zap, TrendingUp, Puzzle, Cpu, BookOpen, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BrandProfile } from '@/store/api/brandOnboardingApi'

interface StepBrandReadyProps {
  brandName: string
  brandDescription: string
  brandProfile?: BrandProfile | null
  url: string
  onStart: () => void
  onSkip: () => void
  isLoading: boolean
  isDescriptionLoading?: boolean
  currentStep: number
  totalSteps: number
}

// Renders a compact label chip
function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-surface text-brand-charcoal text-xs font-medium border border-brand-warm">
      {label}
    </span>
  )
}

// A single labelled card row
function ProfileSection({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white border border-brand-warm shadow-sm">
      <div className="w-7 h-7 rounded-lg bg-brand-orange-subtle flex items-center justify-center border border-brand-orange-light shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-brand-muted font-bold mb-1">{label}</p>
        {children}
      </div>
    </div>
  )
}

export function StepBrandReady({
  brandName,
  brandDescription,
  brandProfile,
  url,
  onStart,
  onSkip,
  isLoading,
  isDescriptionLoading = false,
  currentStep,
  totalSteps,
}: StepBrandReadyProps) {

  // Helpers to safely pull list-of-dicts fields
  const audiences = brandProfile?.target_audience?.filter(a => a?.segment) ?? []
  const useCases = brandProfile?.core_use_cases?.filter(u => u?.use_case) ?? []
  const features = brandProfile?.key_features?.filter(f => f?.feature) ?? []
  const painPoints = (brandProfile?.pain_points_solved ?? []).filter(Boolean)
  const differentiators = (brandProfile?.differentiators ?? []).filter(Boolean)
  const integrations = (brandProfile?.integrations_mentioned ?? []).filter(Boolean)
  const techSignals = (brandProfile?.technology_signals ?? []).filter(Boolean)
  const contentThemes = (brandProfile?.content_themes ?? []).filter(Boolean)
  const pricingTiers = (brandProfile?.pricing_tiers ?? []).filter(Boolean)

  const hasRichProfile = !!brandProfile && !isDescriptionLoading

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-brand-charcoal mb-1 tracking-tight">Brand Intelligence Overview</h2>
        <p className="text-brand-muted text-sm">
          Evidence-based analysis extracted directly from your website.
        </p>
      </div>

      {/* Scrollable card body */}
      <div className="flex-1 overflow-y-auto scrollbar-hide space-y-2.5 pr-1 pb-2">

        {/* Brand + URL row */}
        <div className="grid grid-cols-2 gap-2.5">
          <ProfileSection icon={<Sparkles className="w-3.5 h-3.5 text-brand-orange" />} label="Brand">
            <p className="text-sm text-brand-charcoal font-medium truncate">
              {brandProfile?.brand_name || brandName || '—'}
            </p>
          </ProfileSection>
          <ProfileSection icon={<Globe className="w-3.5 h-3.5 text-brand-orange" />} label="Analysing">
            <p className="text-sm text-brand-charcoal font-medium truncate">{url || '—'}</p>
          </ProfileSection>
        </div>

        {/* Category + Business Model row */}
        {hasRichProfile && (brandProfile.product_category || brandProfile.business_model) && (
          <div className="grid grid-cols-2 gap-2.5">
            {brandProfile.product_category && (
              <ProfileSection icon={<Tag className="w-3.5 h-3.5 text-brand-orange" />} label="Category">
                <p className="text-sm text-brand-charcoal">{brandProfile.product_category}</p>
              </ProfileSection>
            )}
            {brandProfile.business_model && (
              <ProfileSection icon={<TrendingUp className="w-3.5 h-3.5 text-brand-orange" />} label="Business Model">
                <p className="text-sm text-brand-charcoal">{brandProfile.business_model}</p>
              </ProfileSection>
            )}
          </div>
        )}

        {/* Description */}
        <ProfileSection icon={<FileText className="w-3.5 h-3.5 text-brand-orange" />} label="Brand Overview">
          {isDescriptionLoading ? (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="w-3.5 h-3.5 text-brand-orange animate-spin" />
              <span className="text-sm text-brand-muted">Analysing your website…</span>
            </div>
          ) : (brandProfile?.description || brandDescription) ? (
            <p className="text-sm text-brand-charcoal leading-relaxed">
              {brandProfile?.description || brandDescription}
            </p>
          ) : (
            <p className="text-sm text-brand-muted italic">Description will be available shortly.</p>
          )}
        </ProfileSection>

        {/* Target Audience */}
        {hasRichProfile && audiences.length > 0 && (
          <ProfileSection icon={<Users className="w-3.5 h-3.5 text-brand-orange" />} label="Target Audience">
            <div className="flex flex-wrap gap-1.5">
              {audiences.map((a, i) => (
                <Chip key={i} label={a.segment} />
              ))}
            </div>
          </ProfileSection>
        )}

        {/* Core Use Cases */}
        {hasRichProfile && useCases.length > 0 && (
          <ProfileSection icon={<Zap className="w-3.5 h-3.5 text-brand-orange" />} label="Core Use Cases">
            <ul className="space-y-1">
              {useCases.slice(0, 5).map((u, i) => (
                <li key={i} className="text-sm text-brand-charcoal flex items-start gap-1.5">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-brand-orange shrink-0" />
                  {u.use_case}
                </li>
              ))}
            </ul>
          </ProfileSection>
        )}

        {/* Key Features */}
        {hasRichProfile && features.length > 0 && (
          <ProfileSection icon={<BookOpen className="w-3.5 h-3.5 text-brand-orange" />} label="Key Features">
            <div className="flex flex-wrap gap-1.5">
              {features.slice(0, 8).map((f, i) => (
                <Chip key={i} label={f.feature} />
              ))}
            </div>
          </ProfileSection>
        )}

        {/* Pain Points */}
        {hasRichProfile && painPoints.length > 0 && (
          <ProfileSection icon={<AlertCircle className="w-3.5 h-3.5 text-brand-orange" />} label="Pain Points Solved">
            <ul className="space-y-1">
              {painPoints.slice(0, 4).map((p, i) => (
                <li key={i} className="text-sm text-brand-charcoal flex items-start gap-1.5">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-brand-orange shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          </ProfileSection>
        )}

        {/* Differentiators */}
        {hasRichProfile && differentiators.length > 0 && (
          <ProfileSection icon={<TrendingUp className="w-3.5 h-3.5 text-brand-orange" />} label="Differentiators">
            <ul className="space-y-1">
              {differentiators.slice(0, 4).map((d, i) => (
                <li key={i} className="text-sm text-brand-charcoal flex items-start gap-1.5">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-brand-orange shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </ProfileSection>
        )}

        {/* Pricing */}
        {hasRichProfile && (brandProfile.pricing_model || pricingTiers.length > 0) && (
          <ProfileSection icon={<Tag className="w-3.5 h-3.5 text-brand-orange" />} label="Pricing">
            {brandProfile.pricing_model && (
              <p className="text-sm text-brand-charcoal mb-1.5">{brandProfile.pricing_model}</p>
            )}
            {pricingTiers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pricingTiers.map((t, i) => <Chip key={i} label={t} />)}
              </div>
            )}
          </ProfileSection>
        )}

        {/* Integrations & Tech */}
        {hasRichProfile && (integrations.length > 0 || techSignals.length > 0) && (
          <div className="grid grid-cols-2 gap-2.5">
            {integrations.length > 0 && (
              <ProfileSection icon={<Puzzle className="w-3.5 h-3.5 text-brand-orange" />} label="Integrations">
                <div className="flex flex-wrap gap-1.5">
                  {integrations.slice(0, 6).map((t, i) => <Chip key={i} label={t} />)}
                </div>
              </ProfileSection>
            )}
            {techSignals.length > 0 && (
              <ProfileSection icon={<Cpu className="w-3.5 h-3.5 text-brand-orange" />} label="Technology">
                <div className="flex flex-wrap gap-1.5">
                  {techSignals.slice(0, 6).map((t, i) => <Chip key={i} label={t} />)}
                </div>
              </ProfileSection>
            )}
          </div>
        )}

        {/* Content Themes */}
        {hasRichProfile && contentThemes.length > 0 && (
          <ProfileSection icon={<BookOpen className="w-3.5 h-3.5 text-brand-orange" />} label="Content Themes">
            <div className="flex flex-wrap gap-1.5">
              {contentThemes.slice(0, 8).map((t, i) => <Chip key={i} label={t} />)}
            </div>
          </ProfileSection>
        )}

      </div>

      {/* Footer */}
      <div className="mt-auto pt-4">
        {isDescriptionLoading && (
          <p className="text-xs text-brand-muted text-center mb-3">
            Waiting for AI analysis before you can continue…
          </p>
        )}
        <div className="flex justify-between items-center mb-4">
          <Button
            onClick={onSkip}
            variant="ghost"
            disabled={isLoading || isDescriptionLoading}
            className="text-brand-muted hover:text-brand-charcoal hover:bg-brand-surface px-4 h-10 text-sm font-medium rounded-full"
          >
            Skip for now
          </Button>

          <Button
            onClick={onStart}
            disabled={isLoading || isDescriptionLoading}
            className="bg-brand-charcoal text-white hover:bg-brand-charcoal px-6 h-10 text-sm font-medium rounded-full transition-all shadow-lg shadow-brand-warm flex items-center"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isDescriptionLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analysing…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        {/* Progress */}
        <div className="pt-4 border-t border-brand-warm flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx <= currentStep ? 'w-8 bg-brand-charcoal' : 'w-1.5 bg-brand-warm'
                }`}
              />
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-brand-muted font-bold">
            Step {currentStep + 1} of {totalSteps}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
