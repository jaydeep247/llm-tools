'use client'

import { useAuth } from '@/hooks/useAuth'
import { NdTabs, NdTabsList, NdTabsTrigger, NdTabsContent } from '@/components/dashboard/ui/nd-tabs'
import { NdSwitch } from '@/components/dashboard/ui/nd-switch'
import { NdSelect, NdSelectItem } from '@/components/dashboard/ui/nd-select'
import { Lock, Bell, Palette, Shield, Loader2 } from 'lucide-react'

export default function SettingsPage() {
  const { user, isLoading } = useAuth()

  if (isLoading || !user) {
    return (
      <div className="flex h-full items-center justify-center pt-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--nd-purple)' }} />
      </div>
    )
  }

  const inputCls = "rounded-lg text-sm h-10"
  const inputStyle = { background: 'var(--nd-bg)', borderColor: 'var(--nd-border)', color: 'var(--nd-text-primary)' }
  const cardStyle = { background: 'var(--nd-card-bg)', borderColor: 'var(--nd-border)' }
  const labelStyle = { color: 'var(--nd-text-secondary)' }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in-hero">
      <h1 className="text-xl font-bold" style={{ color: 'var(--nd-text-primary)' }}>Settings</h1>

      <NdTabs defaultValue="account">
        <NdTabsList>
          {[
            { value: 'account', label: 'Account', icon: Palette },
            { value: 'preferences', label: 'Preferences', icon: Palette },
            { value: 'security', label: 'Security', icon: Shield },
            { value: 'notifications', label: 'Notifications', icon: Bell },
          ].map(({ value, label, icon: Icon }) => (
            <NdTabsTrigger key={value} value={value}>
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </span>
            </NdTabsTrigger>
          ))}
        </NdTabsList>

        {/* Account */}
        <NdTabsContent value="account">
          <div className="rounded-2xl border p-6" style={cardStyle}>
            <h2 className="text-base font-bold mb-5" style={{ color: 'var(--nd-text-primary)' }}>Profile Information</h2>
            <div key={user.id} className="space-y-5 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label htmlFor="fullname" className="text-sm" style={labelStyle}>Full Name</label>
                  <input id="fullname" placeholder="John Doe" defaultValue={user?.name || ''} className={`${inputCls} w-full border px-3 outline-none`} style={inputStyle} />
                </div>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm" style={labelStyle}>Email Address</label>
                  <input id="email" type="email" defaultValue={user?.email || ''} disabled className={`${inputCls} w-full border px-3 outline-none opacity-60 cursor-not-allowed`} style={inputStyle} />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="bio" className="text-sm" style={labelStyle}>Bio</label>
                <textarea id="bio" placeholder="Tell us about yourself" className="w-full border rounded-lg p-3 min-h-24 text-sm resize-none outline-none transition-colors" style={inputStyle} />
              </div>
              <button className="text-white rounded-lg font-semibold text-sm px-5 h-9 cursor-pointer" style={{ background: 'var(--nd-purple)' }}>Save Changes</button>
            </div>
          </div>
        </NdTabsContent>

        {/* Preferences */}
        <NdTabsContent value="preferences">
          <div className="rounded-2xl border p-6" style={cardStyle}>
            <h2 className="text-base font-bold mb-5" style={{ color: 'var(--nd-text-primary)' }}>Preferences</h2>
            <div className="space-y-5 max-w-2xl">
              <div>
                <label className="text-sm block mb-2" style={labelStyle}>Language</label>
                <NdSelect defaultValue="en">
                  {['en:English', 'es:Spanish', 'fr:French', 'de:German'].map(v => {
                    const [val, label] = v.split(':')
                    return <NdSelectItem key={val} value={val}>{label}</NdSelectItem>
                  })}
                </NdSelect>
              </div>
              <div>
                <label className="text-sm block mb-2" style={labelStyle}>Timezone</label>
                <NdSelect defaultValue="utc">
                  {['utc:UTC', 'est:EST', 'cst:CST', 'pst:PST'].map(v => {
                    const [val, label] = v.split(':')
                    return <NdSelectItem key={val} value={val}>{label}</NdSelectItem>
                  })}
                </NdSelect>
              </div>
              <button className="text-white rounded-lg font-semibold text-sm px-5 h-9 cursor-pointer" style={{ background: 'var(--nd-purple)' }}>Save Preferences</button>
            </div>
          </div>
        </NdTabsContent>

        {/* Security */}
        <NdTabsContent value="security">
          <div className="rounded-2xl border p-6" style={cardStyle}>
            <h2 className="text-base font-bold mb-5" style={{ color: 'var(--nd-text-primary)' }}>Security Settings</h2>
            <div className="space-y-5 max-w-2xl">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm" style={labelStyle}>Current Password</label>
                <input id="password" type="password" placeholder="••••••••" className={`${inputCls} w-full border px-3 outline-none`} style={inputStyle} />
              </div>
              <div className="space-y-2">
                <label htmlFor="newpassword" className="text-sm" style={labelStyle}>New Password</label>
                <input id="newpassword" type="password" placeholder="••••••••" className={`${inputCls} w-full border px-3 outline-none`} style={inputStyle} />
              </div>
              <div className="rounded-xl border p-4 flex items-center justify-between" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                <div className="flex items-center gap-3">
                  <Lock className="h-4 w-4" style={{ color: 'var(--nd-text-muted)' }} />
                  <span className="text-sm" style={{ color: 'var(--nd-text-secondary)' }}>Two-Factor Authentication</span>
                </div>
                <NdSwitch />
              </div>
              <button className="text-white rounded-lg font-semibold text-sm px-5 h-9 cursor-pointer" style={{ background: 'var(--nd-purple)' }}>Update Password</button>
            </div>
          </div>
        </NdTabsContent>

        {/* Notifications */}
        <NdTabsContent value="notifications">
          <div className="rounded-2xl border p-6" style={cardStyle}>
            <h2 className="text-base font-bold mb-5" style={{ color: 'var(--nd-text-primary)' }}>Notification Preferences</h2>
            <div className="space-y-3 max-w-2xl">
              {[
                { label: 'Email Notifications', desc: 'Receive updates via email', defaultOn: true },
                { label: 'Usage Alerts', desc: 'Get notified when usage reaches 80%', defaultOn: true },
                { label: 'Security Updates', desc: 'Important security notices', defaultOn: false },
                { label: 'Product Updates', desc: 'New features and improvements', defaultOn: false },
              ].map((item, i) => (
                <div key={i} className="rounded-xl border p-4 flex items-center justify-between gap-4" style={{ background: 'var(--nd-bg)', borderColor: 'var(--nd-border)' }}>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--nd-text-primary)' }}>{item.label}</p>
                    <p className="text-xs" style={{ color: 'var(--nd-text-muted)' }}>{item.desc}</p>
                  </div>
                  <NdSwitch defaultChecked={item.defaultOn} />
                </div>
              ))}
            </div>
          </div>
        </NdTabsContent>
      </NdTabs>
    </div>
  )
}
