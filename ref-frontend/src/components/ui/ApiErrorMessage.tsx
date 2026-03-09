import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { SerializedError } from '@reduxjs/toolkit';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ApiError = FetchBaseQueryError | SerializedError | undefined;

function getErrorMessage(error: ApiError): string {
  if (!error) return 'An unexpected error occurred.';

  // FetchBaseQueryError
  if ('status' in error) {
    if (error.status === 'FETCH_ERROR') return 'Network error — please check your connection.';
    if (error.status === 'PARSING_ERROR') return 'Unexpected response from server.';
    if (error.status === 401) return 'You are not authorized. Please log in again.';
    if (error.status === 403) return 'You do not have permission to perform this action.';
    if (error.status === 404) return 'The requested resource was not found.';
    if (error.status === 429) return 'Too many requests. Please slow down and try again.';
    if (typeof error.status === 'number' && error.status >= 500) {
      return 'Server error — please try again later.';
    }
    // Extract message from structured error body
    if (typeof error.data === 'object' && error.data !== null) {
      const data = error.data as Record<string, unknown>;
      if (typeof data.message === 'string') return data.message;
      if (typeof data.error === 'string') return data.error;
    }
    return `Request failed (${error.status}).`;
  }

  // SerializedError
  if ('message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return 'An unexpected error occurred.';
}

interface ApiErrorMessageProps {
  error: ApiError;
  className?: string;
  compact?: boolean;
}

export function ApiErrorMessage({ error, className, compact = false }: ApiErrorMessageProps) {
  if (!error) return null;

  const message = getErrorMessage(error);

  if (compact) {
    return (
      <p className={cn('text-xs text-red-400 flex items-center gap-1', className)}>
        <AlertCircle className="w-3 h-3 shrink-0" />
        {message}
      </p>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3',
        className
      )}
    >
      <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
      <p className="text-sm text-red-400">{message}</p>
    </div>
  );
}
