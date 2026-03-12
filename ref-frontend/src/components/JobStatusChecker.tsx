'use client'

import { useJobRedirect } from '@/hooks/useJobRedirect'

interface JobStatusCheckerProps {
  jobId: string | null | undefined
  sessionId: string
  projectId: string
  children: React.ReactNode
  enabled?: boolean
  onStatusChange?: (status: string | undefined) => void
}

/**
 * Component that monitors job status and automatically redirects to progress page
 * when the job is running. This can be used to wrap any component or page.
 * 
 * @example
 * ```tsx
 * <JobStatusChecker 
 *   jobId={jobId} 
 *   sessionId={sessionId} 
 *   projectId={projectId}
 * >
 *   <YourComponent />
 * </JobStatusChecker>
 * ```
 */
export function JobStatusChecker({
  jobId,
  sessionId,
  projectId,
  children,
  enabled = true,
  onStatusChange
}: JobStatusCheckerProps) {
  useJobRedirect({
    jobId,
    sessionId,
    projectId,
    enabled,
    onStatusChange
  })

  return <>{children}</>
}