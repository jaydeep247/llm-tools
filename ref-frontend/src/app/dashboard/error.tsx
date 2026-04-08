'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div className="flex flex-col items-center justify-center h-full  min-h-100 gap-6 p-8">
      <AlertTriangle className="w-10 h-10 text-red-400" />
      <div className="text-center space-y-2 max-w-md">
        <h2 className="text-base font-semibold text-zinc-100">Something went wrong</h2>
        <p className="text-sm text-zinc-400">
          {error.message ?? 'An unexpected error occurred in the dashboard.'}
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-600 font-mono">Error ID: {error.digest}</p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={reset} className="gap-2">
        <RefreshCw className="w-3 h-3" />
        Try again
      </Button>
    </div>
  );
}
