import { useState } from 'react'
import { PageHeader } from '@/components/ui'
import AdminStatsTab from './AdminStatsTab'
import AdminUsersTab from './AdminUsersTab'
import AdminQuestsTab from './AdminQuestsTab'
import AdminGuildsTab from './AdminGuildsTab'
import AdminModerationTab from './AdminModerationTab'

type Tab = 'stats' | 'users' | 'quests' | 'guilds' | 'moderation'

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: 'stats', label: 'Statistiques', icon: '📊' },
  { value: 'users', label: 'Utilisateurs', icon: '👥' },
  { value: 'quests', label: 'Quêtes', icon: '📜' },
  { value: 'guilds', label: 'Guildes', icon: '🛡️' },
  { value: 'moderation', label: 'Modération', icon: '🧾' },
]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('stats')

  return (
    <div>
      <PageHeader
        title="👑 Panneau d'administration"
        subtitle="Le trône de la forge : gère utilisateurs, quêtes, guildes et modération."
      />

      <div role="tablist" className="tabs tabs-box mb-6 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            className={`tab ${tab === t.value ? 'tab-active' : ''}`}
            onClick={() => setTab(t.value)}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stats' && <AdminStatsTab />}
      {tab === 'users' && <AdminUsersTab />}
      {tab === 'quests' && <AdminQuestsTab />}
      {tab === 'guilds' && <AdminGuildsTab />}
      {tab === 'moderation' && <AdminModerationTab />}
    </div>
  )
}
