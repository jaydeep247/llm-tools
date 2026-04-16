import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Info } from 'lucide-react'

// zinc-800 hex — tail fill must match the bubble background exactly
const BUBBLE_BG = '#27272a'

interface FieldTooltipProps {
  description: string
}

export function FieldTooltip({ description }: FieldTooltipProps) {
  if (!description) return null
  return (
    <TooltipPrimitive.Provider delayDuration={100}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <span
            role="button"
            tabIndex={0}
            className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors focus:outline-none shrink-0 cursor-help"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Field description"
          >
            <Info className="h-3 w-3" />
          </span>
        </TooltipPrimitive.Trigger>

        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            align="start"
            sideOffset={10}
            style={{ animationDuration: '110ms' }}
            className={[
              'z-50 max-w-57.5 w-max relative',
              'bg-zinc-800 border border-zinc-700/60',
              'text-zinc-100 text-[11px] leading-relaxed',
              /* large radius = iMessage pill look */
              'rounded-2xl px-3 py-2.5 shadow-2xl',
              'origin-[--radix-tooltip-content-transform-origin]',
              'data-[state=delayed-open]:animate-in',
              'data-[state=delayed-open]:fade-in-0',
              'data-[state=delayed-open]:zoom-in-95',
              'data-[state=delayed-open]:slide-in-from-bottom-2',
              'data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0',
              'data-[state=closed]:zoom-out-95',
              'whitespace-normal',
            ].join(' ')}
          >
            {description}

            {/*
              iMessage-style speech-bubble tail at the bottom-LEFT corner.
              The SVG is 14 × 9 px. It overlaps the bubble by 1 px (bottom: -8)
              so the tail blends seamlessly into the bubble border.

              Path: M0 0  → top-left (covers the border seam)
                    L11 0 → top edge, 11 px wide
                    C9 0, 4 3, 0 9 → cubic curve to the tail tip (0, 9)
                    Z            → straight left edge back to (0, 0)
            */}
            <svg
              aria-hidden="true"
              width="14"
              height="9"
              viewBox="0 0 14 9"
              style={{ position: 'absolute', bottom: -8, left: 12, display: 'block' }}
            >
              <path d="M0 0 L11 0 C9 0 4 3 0 9 Z" fill={BUBBLE_BG} />
            </svg>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
