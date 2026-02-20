import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import SessionDetailClient from './SessionDetailClient'

async function getSession(sessionId: string) {
  const cookieStore = await cookies()
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'
  
  try {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      headers: {
        Cookie: cookieStore.toString(),
        'Content-Type': 'application/json'
      },
      cache: 'no-store' // Ensure we get fresh status
    })
    
    if (!res.ok) {
      // If 401/403, we might want to let the client handle it via its auth flow
      // If 404, client handles it
      return null
    }
    
    return res.json()
  } catch (error) {
    console.error('Failed to fetch session on server:', error)
    return null
  }
}

export default async function SessionDetailPage({
  params
}: {
  params: Promise<{ projectId: string; sessionId: string }>
}) {
  const { projectId, sessionId } = await params
  
  // Server-side check for session status to prevent flash of content
  const data = await getSession(sessionId)
  const session = data?.session || data?.data

  if (session) {
    if (session.status === 'running' || session.status === 'auditing') {
      redirect(`/dashboard/projects/${projectId}/sessions/${sessionId}/progress`)
    }
  }
  
  return <SessionDetailClient />
}
