'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Lock, Bell, Palette, Shield } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function SettingsPage() {
  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 animate-fade-in-hero">
      {/* Header */}
      <div className="space-y-1 md:space-y-2">
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white">Settings & Preferences</h1>
        <p className="text-white/70 text-sm sm:text-base md:text-lg font-light">
          Manage your account, security, and preferences
        </p>
      </div>

      <Tabs defaultValue="account" className="space-y-4 md:space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2 bg-transparent border border-white/20 p-0.5 sm:p-1 h-auto rounded-lg md:rounded-xl">
          <TabsTrigger 
            value="account"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=inactive]:text-white/70 data-[state=inactive]:hover:text-white rounded-md md:rounded-lg border border-white/0 data-[state=active]:border-white/0 transition-all duration-200 text-xs sm:text-sm py-2 cursor-pointer"
          >
            <span className="flex items-center gap-1.5 sm:gap-2">
              <Palette className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Account</span>
            </span>
          </TabsTrigger>
          <TabsTrigger 
            value="preferences"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=inactive]:text-white/70 data-[state=inactive]:hover:text-white rounded-md md:rounded-lg border border-white/0 data-[state=active]:border-white/0 transition-all duration-200 text-xs sm:text-sm py-2 cursor-pointer"
          >
            <span className="flex items-center gap-1.5 sm:gap-2">
              <Palette className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Preferences</span>
            </span>
          </TabsTrigger>
          <TabsTrigger 
            value="security"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=inactive]:text-white/70 data-[state=inactive]:hover:text-white rounded-md md:rounded-lg border border-white/0 data-[state=active]:border-white/0 transition-all duration-200 text-xs sm:text-sm py-2 cursor-pointer"
          >
            <span className="flex items-center gap-1.5 sm:gap-2">
              <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Security</span>
            </span>
          </TabsTrigger>
          <TabsTrigger 
            value="notifications"
            className="data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=inactive]:text-white/70 data-[state=inactive]:hover:text-white rounded-md md:rounded-lg border border-white/0 data-[state=active]:border-white/0 transition-all duration-200 text-xs sm:text-sm py-2 cursor-pointer"
          >
            <span className="flex items-center gap-1.5 sm:gap-2">
              <Bell className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Account Settings */}
        <TabsContent value="account" className="space-y-4 md:space-y-6">
          <div className="rounded-xl md:rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-4 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg sm:text-xl font-bold text-white mb-4 md:mb-6">Profile Information</h2>
            <div className="space-y-4 md:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-1.5 md:space-y-2">
                  <Label htmlFor="fullname" className="text-white/80 font-semibold text-xs sm:text-sm">Full Name</Label>
                  <Input 
                    id="fullname" 
                    placeholder="John Doe" 
                    defaultValue="John Doe"
                    className="bg-white/10 border border-white/20 text-white placeholder:text-white/50 hover:border-white/30 focus:border-white/50 transition-colors rounded-lg text-sm"
                  />
                </div>
                <div className="space-y-1.5 md:space-y-2">
                  <Label htmlFor="email" className="text-white/80 font-semibold text-xs sm:text-sm">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email"
                    placeholder="john@example.com" 
                    defaultValue="john@example.com"
                    className="bg-white/10 border border-white/20 text-white placeholder:text-white/50 hover:border-white/30 focus:border-white/50 transition-colors rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5 md:space-y-2">
                <Label htmlFor="bio" className="text-white/80 font-semibold text-xs sm:text-sm">Bio</Label>
                <textarea 
                  id="bio"
                  placeholder="Tell us about yourself"
                  className="w-full bg-white/10 border border-white/20 text-white placeholder:text-white/50 hover:border-white/30 focus:border-white/50 transition-colors rounded-lg p-3 min-h-20 sm:min-h-24 text-sm"
                />
              </div>
              <Button className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold text-xs sm:text-sm px-4 sm:px-6 h-9 sm:h-10">
                Save Changes
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Preferences */}
        <TabsContent value="preferences" className="space-y-4 md:space-y-6">
          <div className="rounded-xl md:rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-4 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg sm:text-xl font-bold text-white mb-4 md:mb-6">Preferences</h2>
            <div className="space-y-4 md:space-y-6">
              <div>
                <Label htmlFor="language" className="text-white/80 font-semibold block mb-1.5 md:mb-2 text-xs sm:text-sm">Language</Label>
                <Select defaultValue="en">
                  <SelectTrigger className="bg-white/10 border border-white/20 text-white rounded-lg text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white/10 backdrop-blur-md border border-white/20">
                    <SelectItem value="en" className="text-white text-sm">English</SelectItem>
                    <SelectItem value="es" className="text-white text-sm">Spanish</SelectItem>
                    <SelectItem value="fr" className="text-white text-sm">French</SelectItem>
                    <SelectItem value="de" className="text-white text-sm">German</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="timezone" className="text-white/80 font-semibold block mb-1.5 md:mb-2 text-xs sm:text-sm">Timezone</Label>
                <Select defaultValue="utc">
                  <SelectTrigger className="bg-white/10 border border-white/20 text-white rounded-lg text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white/10 backdrop-blur-md border border-white/20">
                    <SelectItem value="utc" className="text-white text-sm">UTC</SelectItem>
                    <SelectItem value="est" className="text-white text-sm">EST</SelectItem>
                    <SelectItem value="cst" className="text-white text-sm">CST</SelectItem>
                    <SelectItem value="pst" className="text-white text-sm">PST</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold text-xs sm:text-sm px-4 sm:px-6 h-9 sm:h-10">
                Save Preferences
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-4 md:space-y-6">
          <div className="rounded-xl md:rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-4 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg sm:text-xl font-bold text-white mb-4 md:mb-6">Security Settings</h2>
            <div className="space-y-4 md:space-y-6">
              <div className="space-y-1.5 md:space-y-2">
                <Label htmlFor="password" className="text-white/80 font-semibold text-xs sm:text-sm">Current Password</Label>
                <Input 
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="bg-white/10 border border-white/20 text-white placeholder:text-white/50 hover:border-white/30 focus:border-white/50 transition-colors rounded-lg text-sm"
                />
              </div>
              <div className="space-y-1.5 md:space-y-2">
                <Label htmlFor="newpassword" className="text-white/80 font-semibold text-xs sm:text-sm">New Password</Label>
                <Input 
                  id="newpassword"
                  type="password"
                  placeholder="••••••••"
                  className="bg-white/10 border border-white/20 text-white placeholder:text-white/50 hover:border-white/30 focus:border-white/50 transition-colors rounded-lg text-sm"
                />
              </div>

              <div className="rounded-lg md:rounded-xl border border-white/20 bg-white/5 p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-white/60" />
                    <span className="text-white/70 text-xs sm:text-sm">Two-Factor Authentication</span>
                  </div>
                  <Switch />
                </div>
              </div>

              <Button className="bg-white text-black hover:bg-slate-100 rounded-full font-semibold text-xs sm:text-sm px-4 sm:px-6 h-9 sm:h-10">
                Update Password
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-4 md:space-y-6">
          <div className="rounded-xl md:rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-4 sm:p-5 md:p-6 lg:p-8">
            <h2 className="text-lg sm:text-xl font-bold text-white mb-4 md:mb-6">Notification Preferences</h2>
            <div className="space-y-3 sm:space-y-4">
              {[
                { label: 'Email Notifications', desc: 'Receive updates via email' },
                { label: 'Usage Alerts', desc: 'Get notified when usage reaches 80%' },
                { label: 'Security Updates', desc: 'Important security notices' },
                { label: 'Product Updates', desc: 'New features and improvements' },
              ].map((item, i) => (
                <div key={i} className="rounded-md md:rounded-lg border border-white/20 bg-white/5 p-3 sm:p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-white/90 font-semibold text-xs sm:text-sm">{item.label}</p>
                    <p className="text-[10px] sm:text-xs text-white/60">{item.desc}</p>
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
