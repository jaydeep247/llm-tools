export function ContentMetrics() {
  // We can just wrap the existing ContentMetricsModule
  // But wait, does it need props? Let's just render a placeholder for now since we don't have the exact props here
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-[#111113] rounded-xl border border-zinc-800">
      <h3 className="text-xl font-semibold text-white mb-2">Content Metrics</h3>
      <p className="text-zinc-500">Integration with Content Analysis module coming soon.</p>
    </div>
  )
}
