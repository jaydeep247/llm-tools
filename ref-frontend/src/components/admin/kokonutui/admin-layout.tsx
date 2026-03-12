'use client'

import { ReactNode, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import AdminSidebar from './sidebar'
import AdminNavbar from './top-nav'
import { ThemeProvider } from '@/components/common/theme-provider'
import { cn } from '@/lib/utils'
import { useAdminLogoutMutation } from '@/store/api/adminAuthApi'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [adminLogout] = useAdminLogoutMutation()

  // The login page has its own full-screen design — skip the chrome.
  if (pathname === '/admin/login') {
    return <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>{children}</ThemeProvider>
  }

  async function handleLogout() {
    try {
      await adminLogout().unwrap()
    } catch {
      // ignore server errors — redirect regardless
    }
    router.push('/admin/login')
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <div className="min-h-screen bg-[#09090B] text-foreground flex">
        <AdminSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />

        <main
          className={cn(
            'flex-1 transition-all duration-300 ease-in-out p-1.5 md:p-3 h-screen overflow-hidden',
            collapsed ? 'md:ml-14' : 'md:ml-68'
          )}
        >
          <div className="bg-[#0F0F11] rounded-2xl border border-zinc-800 h-full flex flex-col overflow-hidden">
            <AdminNavbar
              onMenuToggle={() => setSidebarOpen((o) => !o)}
              onLogout={handleLogout}
            />
            <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
              <div className="mx-auto h-full">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}


