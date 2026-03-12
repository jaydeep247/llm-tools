"use client"

import {
  BarChart2,
  Users2,
  Settings,
  HelpCircle,
  Menu,
  Home,
  TrendingUp,
  Brain,
  Zap,
  Activity,
  MessageSquare,
  Flag,
  FileText,
} from "lucide-react"

import Link from "next/link"
import { useState } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"

export default function AdminSidebar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  function handleNavigation() {
    setIsMobileMenuOpen(false)
  }

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/")
  }

  function NavItem({
    href,
    icon: Icon,
    children,
  }: {
    href: string
    icon: React.ComponentType<{ className?: string }>
    children: React.ReactNode
  }) {
    const active = isActive(href)
    return (
      <Link
        href={href}
        onClick={handleNavigation}
        className={`flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
          active
            ? "text-gray-900 dark:text-white bg-gray-100 dark:bg-[#1F1F23]"
            : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#1F1F23]"
        }`}
      >
        <Icon className="h-4 w-4 mr-3 shrink-0" />
        {children}
      </Link>
    )
  }

  return (
    <>
      <button
        type="button"
        className="lg:hidden fixed top-4 left-4 z-70 p-2 rounded-lg bg-white dark:bg-[#0F0F12] shadow-md"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        <Menu className="h-5 w-5 text-gray-600 dark:text-gray-300" />
      </button>
      <nav
        className={`
                fixed inset-y-0 left-0 z-70 w-64 bg-white dark:bg-[#0F0F12] transform transition-transform duration-200 ease-in-out
                lg:translate-x-0 lg:static lg:w-64 border-r border-gray-200 dark:border-[#1F1F23]
                ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
            `}
      >
        <div className="h-full flex flex-col">
          <Link
            href="/admin/overview"
            onClick={handleNavigation}
            className="h-16 px-6 flex items-center border-b border-gray-200 dark:border-[#1F1F23]"
          >
            <div className="flex items-center gap-3">
              <Image
                src="https://kokonutui.com/logo.svg"
                alt="Acme"
                width={32}
                height={32}
                className="shrink-0 hidden dark:block"
              />
              <Image
                src="https://kokonutui.com/logo-black.svg"
                alt="Acme"
                width={32}
                height={32}
                className="shrink-0 block dark:hidden"
              />
              <span className="text-lg font-semibold hover:cursor-pointer text-gray-900 dark:text-white">
                Admin
              </span>
            </div>
          </Link>

          <div className="flex-1 overflow-y-auto py-4 px-4">
            <div className="space-y-6">
              <div>
                <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Business
                </div>
                <div className="space-y-1">
                  <NavItem href="/admin/overview" icon={Home}>
                    Dashboard
                  </NavItem>
                  <NavItem href="/admin/accounts" icon={Users2}>
                    Accounts & Users
                  </NavItem>
                  <NavItem href="/admin/revenue" icon={TrendingUp}>
                    Revenue
                  </NavItem>
                </div>
              </div>

              <div>
                <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Product
                </div>
                <div className="space-y-1">
                  <NavItem href="/admin/features" icon={BarChart2}>
                    Features
                  </NavItem>
                  <NavItem href="/admin/patterns" icon={Zap}>
                    Winning Patterns
                  </NavItem>
                  <NavItem href="/admin/experiments" icon={Flag}>
                    Experiments
                  </NavItem>
                </div>
              </div>

              <div>
                <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Intelligence
                </div>
                <div className="space-y-1">
                  <NavItem href="/admin/intelligence" icon={Brain}>
                    LLM Quality Lab
                  </NavItem>
                  <NavItem href="/admin/support" icon={MessageSquare}>
                    Support Feedback
                  </NavItem>
                </div>
              </div>

              <div>
                <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  System
                </div>
                <div className="space-y-1">
                  <NavItem href="/admin/health" icon={Activity}>
                    Health
                  </NavItem>
                  <NavItem href="/admin/reports" icon={FileText}>
                    Reports
                  </NavItem>
                  <NavItem href="/admin/settings" icon={Settings}>
                    Settings
                  </NavItem>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 border-t border-gray-200 dark:border-[#1F1F23]">
            <div className="space-y-1">
              <NavItem href="#" icon={HelpCircle}>
                Help
              </NavItem>
            </div>
          </div>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-65 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  )
}
