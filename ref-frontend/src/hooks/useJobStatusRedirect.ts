import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGetJobStatusQuery } from '@/store/api/jobApi'

interface UseJobStatusRedirectOptions {
  jobId: string | null | undefined
  sessionId: string
  projectId: string
  enabled?: boolean
}

export const useJobStatusRedirect = ({
  jobId,
  sessionId,
  projectId,
  enabled = true
}: UseJobStatusRedirectOptions) => {
  const router = useRouter()

  const { data: job, isLoading, error } = useGetJobStatusQuery(jobId!, {
    skip: !enabled || !jobId,
    pollingInterval: 5000, // Poll every 5 seconds
  })

  useEffect(() => {
    if (!enabled || !jobId || isLoading || error) {
      return
    }

    // Check if job is running and redirect to progress page
    if (job?.status === 'running' || job?.status === 'auditing') {
      const currentPath = window.location.pathname
      const progressPath = `/dashboard/jobs/${jobId}/progress`
      
      // Only redirect if we're not already on the progress page
      if (currentPath !== progressPath) {
        router.push(progressPath)
      }
    }
  }, [job?.status, jobId, sessionId, projectId, router, isLoading, error, enabled])

  return {
    job,
    isLoading,
    error,
    isRunning: job?.status === 'running' || job?.status === 'auditing',
  }
}