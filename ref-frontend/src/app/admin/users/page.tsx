"use client"

import { useState } from "react"
import { Search } from "lucide-react"

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useState("")

  const users = [
    { id: 1, name: "Sarah Anderson", email: "sarah@company.com", status: "Active", plan: "Enterprise" },
    { id: 2, name: "Michael Chen", email: "michael@startup.io", status: "Active", plan: "Pro" },
    { id: 3, name: "Jessica Martinez", email: "jessica@agency.com", status: "Inactive", plan: "Pro" },
    { id: 4, name: "David Kim", email: "david@tech.com", status: "Trial", plan: "Free" },
    { id: 5, name: "Emily Rodriguez", email: "emily@enterprise.com", status: "Active", plan: "Enterprise" },
  ]

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Users & Accounts</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Manage and monitor all user accounts</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-white dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white"
        />
      </div>

      <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#1F1F23] bg-gray-50 dark:bg-[#1F1F23]">
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Email</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Plan</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-200 dark:border-[#1F1F23] hover:bg-gray-50 dark:hover:bg-[#1A1A1F]">
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 font-medium">{user.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{user.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      user.plan === "Enterprise" ? "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300" :
                      user.plan === "Pro" ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300" :
                      "bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300"
                    }`}>
                      {user.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      user.status === "Active" ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300" :
                      user.status === "Inactive" ? "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300" :
                      "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                    }`}>
                      {user.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
