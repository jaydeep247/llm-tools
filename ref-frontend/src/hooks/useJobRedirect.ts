import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useGetJobStatusQuery } from '@/store/api/jobApi'

export interface UseJobRedirectOptions {
  jobId: string | null | undefined
  sessionId: string
  projectId: string
  enabled?: boolean
  pollingInterval?: number
  onStatusChange?: (status: string | undefined) => void
  redirectOnStatus?: string[]
  skipRedirect?: boolean
}

/**
 * Hook to monitor job status and redirect to progress page when job is running
 * @param options - Configuration options for the hook
 * @returns Object containing job status, loading state, and error
 */
export const useJobRedirect = ({
  jobId,
  sessionId,
  projectId,
  enabled = true,
  pollingInterval = 5000,
  onStatusChange,
  redirectOnStatus = ['running', 'auditing'],
  skipRedirect = false
}: UseJobRedirectOptions) => {
  const router = useRouter()
  const previousStatusRef = useRef<string | undefined>()

  const { data: job, isLoading, error, refetch } = useGetJobStatusQuery(jobId!, {
    skip: !enabled || !jobId,
    pollingInterval,
  })

  useEffect(() => {
    if (!enabled || !jobId || isLoading || error || skipRedirect) {
      return
    }

    // Check if job status has changed
    if (job?.status !== previousStatusRef.current) {
      previousStatusRef.current = job?.status
      onStatusChange?.(job?.status)
    }

    // Check if job is in a status that should trigger redirect
    const status = job?.status?.toLowerCase()
    const shouldRedirect = status && redirectOnStatus.some(s => s.toLowerCase() === status)

    if (shouldRedirect) {
      const currentPath = window.location.pathname
      const progressPath = `/dashboard/projects/${projectId}/sessions/${sessionId}/progress`
      
      // Only redirect if we're not already on the progress page
      if (currentPath !== progressPath) {
        router.push(progressPath)
      }
    }
  }, [
    job?.status,
    jobId,
    sessionId,
    projectId,
    router,
    isLoading,
    error,
    enabled,
    redirectOnStatus,
    skipRedirect,
    onStatusChange
  ])

  return {
    job,
    isLoading,
    error,
    refetch,
    isRunning: job?.status?.toLowerCase() === 'running' || job?.status?.toLowerCase() === 'auditing',
    shouldRedirect: job?.status && redirectOnStatus.some(s => s.toLowerCase() === job.status.toLowerCase()) && !skipRedirect
  }
}

/**
 * Hook to monitor multiple jobs and redirect when any job is running
 * @param jobs - Array of job configurations to monitor
 * @param options - Shared configuration options
 * @returns Object containing status of all jobs and redirect state
 */
export const useMultipleJobsRedirect = (
  jobs: Array<{
    jobId: string | null | undefined
    sessionId: string
    projectId: string
  }>,
  options?: Partial<Omit<UseJobRedirectOptions, 'jobId' | 'sessionId' | 'projectId'>>
) => {
  const router = useRouter()
  const redirectPerformedRef = useRef(false)

  // Monitor all jobs
  const jobResults = jobs.map(({ jobId, sessionId, projectId }) => 
    useGetJobStatusQuery(jobId!, {
      skip: !jobId,
      pollingInterval: options?.pollingInterval || 5000,
    })
  )

  useEffect(() => {
    if (redirectPerformedRef.current) {
      return
    }

    // Find the first running job
    const runningJob = jobs.find((job, index) => {
      const jobData = jobResults[index].data
      const redirectOnStatus = options?.redirectOnStatus || ['running', 'auditing']
      const status = jobData?.status?.toLowerCase()
      return status && redirectOnStatus.some(s => s.toLowerCase() === status)
    })

    if (runningJob && !options?.skipRedirect) {
      const currentPath = window.location.pathname
      const progressPath = `/dashboard/projects/${runningJob.projectId}/sessions/${runningJob.sessionId}/progress`
      
      // Only redirect if we're not already on the progress page
      if (currentPath !== progressPath) {
        redirectPerformedRef.current = true
        router.push(progressPath)
      }
    }
  }, [jobResults, jobs, router, options])

  const isAnyJobRunning = jobResults.some(result => {
    const status = result.data?.status?.toLowerCase()
    return status === 'running' || status === 'auditing'
  })

  const isLoading = jobResults.some(result => result.isLoading)
  const hasError = jobResults.some(result => result.error)

  return {
    jobs: jobResults.map(result => result.data),
    isLoading,
    hasError,
    isAnyJobRunning,
    jobResults
  }
}