"use client"

import Image from "next/image"
import { Bell, ChevronRight, Search, Calendar } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "../theme-toggle"
import { useState } from "react"

interface BreadcrumbItem {
  label: string
  href?: string
}

export default function AdminTopNav() {
  const [environment, setEnvironment] = useState<"production" | "staging">("production")
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const dateRange = { from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), to: new Date() }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Admin Portal", href: "/admin" },
    { label: "Dashboard", href: "/admin/overview" },
  ]

  return (
    <nav className="px-3 sm:px-6 flex items-center justify-between bg-white dark:bg-[#0F0F12] border-b border-gray-200 dark:border-[#1F1F23] h-full gap-4">
      <div className="font-medium text-sm hidden sm:flex items-center space-x-1 truncate max-w-75">
        {breadcrumbs.map((item, index) => (
          <div key={item.label} className="flex items-center">
            {index > 0 && <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400 mx-1" />}
            {item.href ? (
              <Link
                href={item.href}
                className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-gray-900 dark:text-gray-100">{item.label}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex-1 max-w-xs hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search users, accounts..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30]">
          <Calendar className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
            {dateRange.from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
            {dateRange.to.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>

        <select
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as "production" | "staging")}
          className={`hidden sm:inline-flex px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            environment === "production"
              ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
              : "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300"
          }`}
        >
          <option value="production">Production</option>
          <option value="staging">Staging</option>
        </select>

        <button
          type="button"
          className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-[#1F1F23] rounded-full transition-colors"
        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600 dark:text-gray-300" />
        </button>

        <ThemeToggle />

        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="focus:outline-none"
          >
            <Image
              src="https://ferf1mheo22r9ira.public.blob.vercel-storage.com/avatar-01-n0x8HFv8EUetf9z6ht0wScJKoTHqf8.png"
              alt="User avatar"
              width={28}
              height={28}
              className="rounded-full ring-2 ring-gray-200 dark:ring-[#2B2B30] sm:w-8 sm:h-8 cursor-pointer"
            />
          </button>
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg shadow-lg p-4 z-50">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-[#1F1F23]">
                <Image
                  src="https://ferf1mheo22r9ira.public.blob.vercel-storage.com/avatar-01-n0x8HFv8EUetf9z6ht0wScJKoTHqf8.png"
                  alt="User avatar"
                  width={40}
                  height={40}
                  className="rounded-full"
                />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Admin User</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">admin@example.com</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1F1F23] rounded">
                  Profile Settings
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1F1F23] rounded">
                  Preferences
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded">
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
