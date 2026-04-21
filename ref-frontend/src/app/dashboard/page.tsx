'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  FolderOpen,
  MoreVertical,
  Pencil,
  Trash2,
  ExternalLink,
  Plus,
  BarChart3,
  Clock,
  ArrowUpRight,
} from 'lucide-react'
import { useGetProjectsQuery, type Project } from '@/store/api/projectApi'
import { useAuth } from '@/hooks/useAuth'
import { NdDropdown, NdDropdownItem } from '@/components/dashboard/ui/nd-dropdown'
import { ProjectEditDialog } from '@/components/dashboard/ProjectEditDialog'
import { ProjectDeleteDialog } from '@/components/dashboard/ProjectDeleteDialog'
import { GreetingHeader } from '@/components/dashboard/GreetingHeader'
import { LiveCrawlActivity } from '@/components/dashboard/LiveCrawlActivity'

/* ── Color palette for project avatars ── */
const avatarColors = ['#5347CE', '#4896FE', '#16C8C7', '#059669', '#D97706', '#E11D48']
function getAvatarColor(index: number) {
  return avatarColors[index % avatarColors.length]
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { data: projectsData } = useGetProjectsQuery(undefined, { refetchOnMountOrArgChange: true })
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)

  const projects = projectsData?.projects ?? []
  const totalProjects = projects.length
  const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length
  const totalSessions = projects.reduce((sum, p) => sum + (p._count?.sessions || 0), 0)

  return (
    <div className="nd-dashboard-page">
      {/* ── Greeting ── */}
      <GreetingHeader />

      {/* ── Stat strip ── */}
      <div className="nd-stats-row">
        <button
          onClick={() => router.push('/dashboard/projects')}
          className="nd-card nd-card-clickable nd-stat-card cursor-pointer"
        >
          <div className="nd-stat-icon" style={{ background: 'var(--nd-purple-subtle)' }}>
            <FolderOpen size={20} strokeWidth={1.75} style={{ color: 'var(--nd-purple)' }} />
          </div>
          <div>
            <p className="nd-stat-value">{totalProjects}</p>
            <p className="nd-stat-label">Total Projects</p>
          </div>
        </button>

        <div className="nd-card nd-stat-card">
          <div className="nd-stat-icon" style={{ background: 'var(--nd-positive-bg)' }}>
            <BarChart3 size={20} strokeWidth={1.75} style={{ color: 'var(--nd-positive-text)' }} />
          </div>
          <div>
            <p className="nd-stat-value">{activeProjects}</p>
            <p className="nd-stat-label">Active Projects</p>
          </div>
        </div>

        <div className="nd-card nd-stat-card">
          <div className="nd-stat-icon" style={{ background: '#EEF4FF' }}>
            <Clock size={20} strokeWidth={1.75} style={{ color: 'var(--nd-blue)' }} />
          </div>
          <div>
            <p className="nd-stat-value">{totalSessions}</p>
            <p className="nd-stat-label">Total Sessions</p>
          </div>
        </div>
      </div>

      {/* ── Recent Projects ── */}
      <section>
        <div className="nd-section-header">
          <h2 className="nd-section-title">Recent Projects</h2>
          {projects.length > 0 && (
            <button
              onClick={() => router.push('/dashboard/projects')}
              className="nd-link-btn cursor-pointer"
            >
              View All <ArrowRight size={14} />
            </button>
          )}
        </div>

        {projects.length > 0 ? (
          <div className="nd-project-grid">
            {projects.slice(0, 6).map((project, i) => (
              <div
                key={project.id}
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                className="nd-card nd-card-clickable nd-project-card group cursor-pointer"
              >
                <div
                  className="nd-project-avatar"
                  style={{ background: getAvatarColor(i) }}
                >
                  {project.name.charAt(0).toUpperCase()}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="nd-project-name">{project.name}</h3>
                  <div className="nd-project-meta">
                    <span className={`nd-badge ${project.status === 'ACTIVE' ? 'nd-badge-active' : 'nd-badge-inactive'}`}>
                      {project.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </span>
                    <span className="nd-meta-text">
                      {project._count?.sessions || 0} sessions
                    </span>
                  </div>
                </div>

                <NdDropdown
                  trigger={
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="nd-menu-trigger opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <MoreVertical size={16} />
                    </button>
                  }
                  align="end"
                >
                  <NdDropdownItem
                    onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/projects/${project.id}`) }}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> View
                  </NdDropdownItem>
                  <NdDropdownItem
                    onClick={(e) => { e.stopPropagation(); setProjectToEdit(project) }}
                  >
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </NdDropdownItem>
                  <NdDropdownItem
                    danger
                    onClick={(e) => { e.stopPropagation(); setProjectToDelete(project) }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </NdDropdownItem>
                </NdDropdown>

                <ArrowUpRight
                  size={16}
                  className="nd-project-arrow opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="nd-card nd-empty-state">
            <FolderOpen size={40} strokeWidth={1.5} className="nd-empty-icon" />
            <h3 className="nd-empty-title">No projects yet</h3>
            <p className="nd-empty-text">Create your first project to get started</p>
            <button
              onClick={() => router.push('/dashboard/projects')}
              className="nd-btn-primary cursor-pointer"
            >
              <Plus size={15} />
              Create Project
            </button>
          </div>
        )}
      </section>

      {/* ── Live / Recent Crawl Activity ── */}
      {projects.length > 0 && (
        <LiveCrawlActivity projects={projects.slice(0, 8)} />
      )}

      {/* ── Quick Actions ── */}
      <section>
        <h2 className="nd-section-title" style={{ marginBottom: 16 }}>Quick Actions</h2>
        <div className="nd-actions-row">
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="nd-card nd-card-clickable nd-action-card cursor-pointer"
          >
            <div className="nd-action-icon" style={{ background: 'var(--nd-purple-subtle)' }}>
              <Plus size={18} strokeWidth={2} style={{ color: 'var(--nd-purple)' }} />
            </div>
            <div>
              <p className="nd-action-title">New Project</p>
              <p className="nd-action-desc">Create a new project to organize your crawls</p>
            </div>
          </button>

          <button
            onClick={() => router.push('/dashboard/usage')}
            className="nd-card nd-card-clickable nd-action-card cursor-pointer"
          >
            <div className="nd-action-icon" style={{ background: '#E6FAF9' }}>
              <BarChart3 size={18} strokeWidth={2} style={{ color: 'var(--nd-teal)' }} />
            </div>
            <div>
              <p className="nd-action-title">View Usage</p>
              <p className="nd-action-desc">Check your API usage and quota</p>
            </div>
          </button>

          <button
            onClick={() => router.push('/dashboard/settings')}
            className="nd-card nd-card-clickable nd-action-card cursor-pointer"
          >
            <div className="nd-action-icon" style={{ background: '#EEF4FF' }}>
              <ExternalLink size={18} strokeWidth={2} style={{ color: 'var(--nd-blue)' }} />
            </div>
            <div>
              <p className="nd-action-title">Settings</p>
              <p className="nd-action-desc">Manage your account and preferences</p>
            </div>
          </button>
        </div>
      </section>

      <ProjectEditDialog
        project={projectToEdit}
        open={!!projectToEdit}
        onOpenChange={(open) => !open && setProjectToEdit(null)}
      />
      <ProjectDeleteDialog
        project={projectToDelete}
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
      />
    </div>
  )
}
