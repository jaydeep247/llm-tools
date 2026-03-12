export default function SettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Configure system and platform settings</p>
      </div>

      <div className="space-y-6">
        {/* General Settings */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">General Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Organization Name
              </label>
              <input
                type="text"
                defaultValue="Acme Corporation"
                className="w-full px-4 py-2 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                defaultValue="admin@acme.com"
                className="w-full px-4 py-2 rounded-lg bg-gray-50 dark:bg-[#1F1F23] border border-gray-200 dark:border-[#2B2B30] text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <button className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            Save Changes
          </button>
        </div>

        {/* Security Settings */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Security</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-[#1F1F23]">
              <div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">Two-Factor Authentication</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Enhance account security</div>
              </div>
              <div className="w-12 h-6 bg-green-500 rounded-full"></div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-[#1F1F23]">
              <div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">Session Timeout</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">30 minutes of inactivity</div>
              </div>
              <div className="w-12 h-6 bg-green-500 rounded-full"></div>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">IP Whitelisting</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Restrict access by IP</div>
              </div>
              <div className="w-12 h-6 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
            </div>
          </div>
        </div>

        {/* Integration Settings */}
        <div className="bg-white dark:bg-[#0F0F12] border border-gray-200 dark:border-[#1F1F23] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Integrations</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-[#1F1F23]">
              <div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">Slack</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Connected</div>
              </div>
              <button className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2B2B30]">
                Disconnect
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-[#1F1F23]">
              <div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">GitHub</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Not connected</div>
              </div>
              <button className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded">
                Connect
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-[#1F1F23]">
              <div>
                <div className="font-medium text-gray-900 dark:text-white text-sm">Datadog</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Connected</div>
              </div>
              <button className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2B2B30]">
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
