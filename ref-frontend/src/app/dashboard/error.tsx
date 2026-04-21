'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Dashboard Error]', error);
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-100 gap-6 p-8">
      <AlertTriangle className="w-10 h-10" style={{ color: 'var(--nd-negative-text)' }} />
      <div className="text-center space-y-2 max-w-md">
        <h2 className="text-base font-semibold" style={{ color: 'var(--nd-text-primary)' }}>Something went wrong</h2>
        <p className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>
          {error.message ?? 'An unexpected error occurred in the dashboard.'}
        </p>
        {error.digest && (
          <p className="text-xs font-mono" style={{ color: 'var(--nd-text-muted)' }}>Error ID: {error.digest}</p>
        )}
      </div>
      <button onClick={reset} className="nd-btn-outline gap-2 cursor-pointer">
        <RefreshCw className="w-3 h-3" />
        Try again
      </button>
    </div>
  );
}
