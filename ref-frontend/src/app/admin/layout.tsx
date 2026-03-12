import type { ReactNode } from "react"
import AdminSidebar from "@/components/admin/kokonutui/sidebar"
import AdminTopNav from "@/components/admin/kokonutui/top-nav"
import { ThemeProvider } from "@/components/common/theme-provider"

export default function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <div className="flex h-screen">
        <AdminSidebar />
        <div className="w-full flex flex-1 flex-col">
          <header className="h-16 border-b border-gray-200 dark:border-[#1F1F23]">
            <AdminTopNav />
          </header>
          <main className="flex-1 overflow-auto bg-white dark:bg-[#0F0F12]">{children}</main>
        </div>
      </div>
    </ThemeProvider>
  )
}
