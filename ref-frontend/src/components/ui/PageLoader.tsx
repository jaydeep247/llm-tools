import { cn } from '@/lib/utils';

interface PageLoaderProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'w-4 h-4 border-[1.5px]',
  md: 'w-6 h-6 border-2',
  lg: 'w-9 h-9 border-[3px]',
};

export function PageLoader({ className, size = 'md' }: PageLoaderProps) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div
        className={cn(
          'rounded-full animate-spin border-(--nd-border,#E8E9EF) border-t-(--nd-purple,#5347CE)',
          sizeMap[size]
        )}
      />
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-4 rounded animate-pulse bg-(--nd-border,#E2E8F0)', className)}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-xl border border-(--nd-border,#E2E8F0) bg-(--nd-card-bg,#FFFFFF) p-5 space-y-3', className)}
    >
      <SkeletonRow className="w-1/3" />
      <SkeletonRow className="w-full" />
      <SkeletonRow className="w-2/3" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Domain-specific skeletons — match exact layout of real components  */
/* ------------------------------------------------------------------ */

/**
 * Matches StatCard: icon pill + value + label + optional progress bar.
 */
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-2xl border border-(--nd-border,#E2E8F0) bg-(--nd-card-bg,#FFFFFF) p-5 space-y-4 animate-pulse', className)}
    >
      {/* icon row */}
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-(--nd-border,#E2E8F0)" />
        <div className="w-4 h-4 rounded bg-(--nd-border,#E2E8F0)" />
      </div>
      {/* value */}
      <div className="space-y-2">
        <div className="h-7 w-20 rounded bg-(--nd-border,#E2E8F0)" />
        <div className="h-3 w-28 rounded opacity-60 bg-(--nd-border,#E2E8F0)" />
        <div className="h-1.5 w-full rounded-full opacity-60 mt-3 bg-(--nd-border,#E2E8F0)" />
      </div>
    </div>
  );
}

/** Four-column grid of StatCardSkeletons. */
export function StatCardGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Matches SectionCard: header bar + body rows.
 */
export function SectionCardSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={cn('rounded-2xl border border-(--nd-border,#E2E8F0) bg-(--nd-card-bg,#FFFFFF) overflow-hidden animate-pulse', className)}
    >
      {/* header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-(--nd-border,#E2E8F0)">
        <div className="h-4 w-32 rounded bg-(--nd-border,#E2E8F0)" />
        <div className="h-3 w-16 rounded opacity-60 bg-(--nd-border,#E2E8F0)" />
      </div>
      {/* body */}
      <div className="p-5 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} className={i % 2 === 0 ? 'w-full' : 'w-4/5'} />
        ))}
      </div>
    </div>
  );
}

/**
 * Matches the project list row in projects/page.tsx.
 */
export function ProjectRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-xl p-4 border border-(--nd-border,#E8E9EF) bg-(--nd-card-bg,#FFFFFF) animate-pulse flex items-center justify-between gap-4', className)}
    >
      <div className="space-y-2 flex-1">
        <div className="h-4 w-40 rounded bg-(--nd-border,#E8E9EF)" />
        <div className="h-3 w-64 rounded bg-(--nd-border,#E8E9EF)" />
      </div>
      <div className="h-7 w-20 rounded-lg shrink-0 bg-(--nd-border,#E8E9EF)" />
    </div>
  );
}

/**
 * Full project list page loading state.
 */
export function ProjectsPageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4 animate-fade-in-hero', className)}>
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded animate-pulse bg-(--nd-border,#E8E9EF)" />
        <div className="h-9 w-36 rounded-lg animate-pulse bg-(--nd-border,#E8E9EF)" />
      </div>
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => <ProjectRowSkeleton key={i} />)}
      </div>
    </div>
  );
}

/**
 * Matches the ScoreCard loading state in AIVisibilityScorecards.tsx.
 */
export function ScoreCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-zinc-800/50 rounded-2xl p-5 border border-zinc-800 animate-pulse',
        className,
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-zinc-800" />
        <div className="h-4 w-24 bg-zinc-800 rounded" />
      </div>
      <div className="h-12 w-20 bg-zinc-800 rounded mt-4" />
    </div>
  );
}

/**
 * Matches a project detail page header loading state.
 */
export function ProjectDetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6 sm:space-y-8 animate-pulse', className)}>
      <div className="space-y-2">
        <div className="h-8 sm:h-10 md:h-12 w-48 sm:w-64 bg-zinc-800/40 rounded" />
        <div className="h-4 sm:h-5 w-32 sm:w-48 bg-zinc-800/40 rounded" />
      </div>
      <StatCardGridSkeleton count={2} />
      <SectionCardSkeleton rows={5} />
    </div>
  );
}

/**
 * Inline table-row skeleton for data-heavy list views.
 */
export function TableRowSkeleton({ cols = 4, className }: { cols?: number; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-3 border-b border-zinc-800 animate-pulse',
        className,
      )}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-3.5 rounded bg-zinc-800',
            i === 0 ? 'flex-2' : 'flex-1',
            i === cols - 1 && 'w-16 flex-none',
          )}
        />
      ))}
    </div>
  );
}

/** A full-height centered loader used as a page-level fallback. */
export function PageCenteredLoader({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center h-full min-h-100', className)}>
      <PageLoader size="lg" />
    </div>
  );
}
