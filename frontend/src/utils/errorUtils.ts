/**
 * Extracts a user-facing error message from API/RTK Query errors.
 * Prefers server-provided message/error/details so the frontend shows the actual error.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err == null) return fallback;
  const anyErr = err as Record<string, unknown>;
  // RTK Query / fetchBaseQuery: error body is in .data
  const data = anyErr?.data as Record<string, unknown> | undefined;
  if (data && typeof data === 'object') {
    const msg = data.message ?? data.error ?? data.details;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
    if (typeof msg === 'string') return msg;
  }
  // Axios-style .response.data
  const res = anyErr?.response as Record<string, unknown> | undefined;
  const resData = res?.data as Record<string, unknown> | undefined;
  if (resData && typeof resData === 'object') {
    const msg = resData.message ?? resData.error ?? resData.details;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  // Error instance or string
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message.trim();
  if (typeof err === 'string' && err.trim()) return err.trim();
  return fallback;
}
