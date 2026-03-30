'use client'

import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAppDispatch } from '../store/hooks'
import { jobApi } from '../store/api/jobApi'

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || ''

interface ContentAuditCompletedEvent {
  jobId: string
}

/**
 * Listens for `content-audit:completed` Socket.IO events and invalidates the
 * RTK Query cache for the associated job.  This forces all content-audit
 * components to refetch fresh field data so loading spinners clear instantly
 * when background metric processing finishes.
 */
export function useContentAuditSocket(
  jobId: string | null | undefined,
  options?: { onCompleted?: (jobId: string) => void }
) {
  const dispatch = useAppDispatch()
  const socketRef = useRef<Socket | null>(null)
  const onCompletedRef = useRef(options?.onCompleted)

  useEffect(() => {
    onCompletedRef.current = options?.onCompleted
  }, [options?.onCompleted])

  useEffect(() => {
    if (!jobId) return

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionAttempts: 5,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join-job', jobId)
    })

    socket.on('content-audit:completed', (data: ContentAuditCompletedEvent) => {
      if (!data?.jobId) {
        return
      }

      // Invalidate the Job tag so all queries (pages, fields, links, sitemaps)
      // automatically refetch — this is what makes the loading spinner stop.
      dispatch(jobApi.util.invalidateTags([{ type: 'Job', id: data.jobId }]))
      onCompletedRef.current?.(data.jobId)
    })

    return () => {
      if (socket.connected) {
        socket.emit('leave-job', jobId)
        socket.disconnect()
      }
      socketRef.current = null
    }
  }, [jobId, dispatch])
}
