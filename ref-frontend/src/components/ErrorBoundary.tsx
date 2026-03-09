'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary] Caught:', error, info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-50 gap-4 p-6 rounded-xl border border-red-500/20 bg-red-500/5">
          <AlertTriangle className="w-8 h-8 text-red-400" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-red-400">Something went wrong</p>
            <p className="text-xs text-zinc-500">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleReset} className="gap-2">
            <RefreshCw className="w-3 h-3" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
