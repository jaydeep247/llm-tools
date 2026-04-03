'use client'

import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

const prose = cn(
  'text-base sm:text-[17px] leading-[1.65] text-zinc-200',
  '[&_p]:mb-4 [&_p:last-child]:mb-0',
  '[&_strong]:font-semibold [&_strong]:text-zinc-50',
  '[&_em]:text-zinc-300',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2',
  '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2',
  '[&_li]:marker:text-zinc-500 [&_li]:pl-0.5',
  '[&_h1]:mb-3 [&_h1]:mt-2 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white',
  '[&_h2]:mb-3 [&_h2]:mt-4 [&_h2]:border-b [&_h2]:border-zinc-800 [&_h2]:pb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-zinc-100',
  '[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-100',
  '[&_hr]:my-5 [&_hr]:border-zinc-800',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-violet-500/50 [&_blockquote]:pl-4 [&_blockquote]:text-zinc-400 [&_blockquote]:text-[0.95em]',
  '[&_a]:text-sky-400 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-sky-300',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
  '[&_th]:border [&_th]:border-zinc-700 [&_th]:bg-zinc-950 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-zinc-200',
  '[&_td]:border [&_td]:border-zinc-800 [&_td]:px-3 [&_td]:py-2 [&_td]:text-zinc-300',
)

const components: Components = {
  code({ className, children, ...props }) {
    const text = String(children).replace(/\n$/, '')
    const isBlock = Boolean(className?.includes('language-')) || text.includes('\n')
    if (!isBlock) {
      return (
        <code
          className="rounded bg-zinc-950 px-2 py-0.5 font-mono text-[0.9em] text-emerald-300/95 ring-1 ring-zinc-800/80"
          {...props}
        >
          {text}
        </code>
      )
    }
    return (
      <pre className="my-3 overflow-x-auto rounded-lg border border-zinc-800 bg-black/40 p-4">
        <code className="font-mono text-sm text-zinc-300" {...props}>
          {text}
        </code>
      </pre>
    )
  },
}

export function ModuleFAskAiMarkdown({ content }: { content: string }) {
  return (
    <div className={prose}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
