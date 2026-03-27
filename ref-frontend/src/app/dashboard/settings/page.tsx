'use client'

import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Lock, Bell, Palette, Shield, Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function SettingsPage() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center pt-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    )
  }

  // Guard: if auth data isn't available yet (e.g. brief window before first fetch
  // or after an error) keep showing the spinner rather than rendering placeholder values.
  if (!user) {
    return (
      <div className="flex h-full items-center justify-center pt-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
      {/* Header */}

      <Tabs defaultValue="account" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-2 bg-transparent border border-zinc-800 p-1 h-auto rounded-2xl">
          <TabsTrigger 
            value="account"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-white rounded-lg border border-white/0 data-[state=active]:border-white/0 transition-all duration-200 text-xs sm:text-sm py-2 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Account</span>
            </span>
          </TabsTrigger>
          <TabsTrigger 
            value="preferences"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-white rounded-lg border border-white/0 data-[state=active]:border-white/0 transition-all duration-200 text-xs sm:text-sm py-2 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Preferences</span>
            </span>
          </TabsTrigger>
          <TabsTrigger 
            value="security"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-white rounded-lg border border-white/0 data-[state=active]:border-white/0 transition-all duration-200 text-xs sm:text-sm py-2 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Security</span>
            </span>
          </TabsTrigger>
          <TabsTrigger 
            value="notifications"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-white rounded-lg border border-white/0 data-[state=active]:border-white/0 transition-all duration-200 text-xs sm:text-sm py-2 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Account Settings */}
        <TabsContent value="account" className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-6">
            <h2 className="text-xl font-bold text-white mb-6">Profile Information</h2>
            {/* key={user.id} forces inputs to remount with correct defaultValue
                when user data arrives — prevents blank fields after Google sign-in */}
            <div key={user.id} className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="fullname" className="text-white/80 font-semibold text-sm">Full Name</Label>
                  <Input 
                    id="fullname" 
                    placeholder="John Doe" 
                    defaultValue={user?.name || "John Doe"}
                    className="bg-[#1A1A1A] border border-zinc-800 text-white placeholder:text-white/30 hover:border-zinc-700 focus:border-white/30 transition-colors rounded-lg text-sm h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/80 font-semibold text-sm">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email"
                    placeholder="john@example.com" 
                    defaultValue={user?.email || "john@example.com"}
                    disabled
                    className="bg-[#1A1A1A] border border-zinc-800 text-white/50 placeholder:text-white/30 hover:border-zinc-700 focus:border-white/30 transition-colors rounded-lg text-sm h-10 opacity-70 cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio" className="text-white/80 font-semibold text-sm">Bio</Label>
                <textarea 
                  id="bio"
                  placeholder="Tell us about yourself"
                  className="w-full bg-[#1A1A1A] border border-zinc-800 text-white placeholder:text-white/30 hover:border-zinc-700 focus:border-white/30 transition-colors rounded-lg p-3 min-h-24 text-sm resize-none"
                />
              </div>
              <Button className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold text-sm px-6 h-10 cursor-pointer">
                Save Changes
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Preferences */}
        <TabsContent value="preferences" className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-6">
            <h2 className="text-xl font-bold text-white mb-6">Preferences</h2>
            <div className="space-y-6 max-w-2xl">
              <div>
                <Label htmlFor="language" className="text-white/80 font-semibold block mb-2 text-sm">Language</Label>
                <Select defaultValue="en">
                  <SelectTrigger className="bg-[#1A1A1A] border border-zinc-800 text-white rounded-lg text-sm h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A1A1A] border border-zinc-800">
                    <SelectItem value="en" className="text-white text-sm focus:bg-zinc-800/50 cursor-pointer">English</SelectItem>
                    <SelectItem value="es" className="text-white text-sm focus:bg-zinc-800/50 cursor-pointer">Spanish</SelectItem>
                    <SelectItem value="fr" className="text-white text-sm focus:bg-zinc-800/50 cursor-pointer">French</SelectItem>
                    <SelectItem value="de" className="text-white text-sm focus:bg-zinc-800/50 cursor-pointer">German</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="timezone" className="text-white/80 font-semibold block mb-2 text-sm">Timezone</Label>
                <Select defaultValue="utc">
                  <SelectTrigger className="bg-[#1A1A1A] border border-zinc-800 text-white rounded-lg text-sm h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A1A1A] border border-zinc-800">
                    <SelectItem value="utc" className="text-white text-sm focus:bg-zinc-800/50 cursor-pointer">UTC</SelectItem>
                    <SelectItem value="est" className="text-white text-sm focus:bg-zinc-800/50 cursor-pointer">EST</SelectItem>
                    <SelectItem value="cst" className="text-white text-sm focus:bg-zinc-800/50 cursor-pointer">CST</SelectItem>
                    <SelectItem value="pst" className="text-white text-sm focus:bg-zinc-800/50 cursor-pointer">PST</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold text-sm px-6 h-10 cursor-pointer">
                Save Preferences
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-6">
            <h2 className="text-xl font-bold text-white mb-6">Security Settings</h2>
            <div className="space-y-6 max-w-2xl">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/80 font-semibold text-sm">Current Password</Label>
                <Input 
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="bg-[#1A1A1A] border border-zinc-800 text-white placeholder:text-white/30 hover:border-zinc-700 focus:border-white/30 transition-colors rounded-lg text-sm h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newpassword" className="text-white/80 font-semibold text-sm">New Password</Label>
                <Input 
                  id="newpassword"
                  type="password"
                  placeholder="••••••••"
                  className="bg-[#1A1A1A] border border-zinc-800 text-white placeholder:text-white/30 hover:border-zinc-700 focus:border-white/30 transition-colors rounded-lg text-sm h-10"
                />
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-[#1A1A1A] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-zinc-500" />
                    <span className="text-zinc-400 text-sm">Two-Factor Authentication</span>
                  </div>
                  <Switch />
                </div>
              </div>

              <Button className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold text-sm px-6 h-10 cursor-pointer">
                Update Password
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-6">
            <h2 className="text-xl font-bold text-white mb-6">Notification Preferences</h2>
            <div className="space-y-4 max-w-2xl">
              {[
                { label: 'Email Notifications', desc: 'Receive updates via email' },
                { label: 'Usage Alerts', desc: 'Get notified when usage reaches 80%' },
                { label: 'Security Updates', desc: 'Important security notices' },
                { label: 'Product Updates', desc: 'New features and improvements' },
              ].map((item, i) => (
                <div key={i} className="rounded-lg border border-zinc-800 bg-[#1A1A1A] p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white/90 font-semibold text-sm">{item.label}</p>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </div>
                  <Switch defaultChecked={i < 2} />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
