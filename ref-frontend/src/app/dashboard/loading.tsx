export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center h-full min-h-100">
      <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--nd-border)', borderTopColor: 'var(--nd-purple)' }} />
    </div>
  );
}
