import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { EmptyState, ErrorState, LoadingState, PageHeader, UserAvatar } from '@/components/ui'
import { levelForXp } from '@/lib/levels'
import type { LeaderboardGuild, LeaderboardUser } from '@/lib/types'

type Period = 'week' | 'month' | 'all'
type Board = 'users' | 'guilds'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: '7 jours' },
  { value: 'month', label: '30 jours' },
  { value: 'all', label: 'Toujours' },
]

const MEDALS = ['🥇', '🥈', '🥉']

export default function LeaderboardPage() {
  const [board, setBoard] = useState<Board>('users')
  const [period, setPeriod] = useState<Period>('all')

  const usersQuery = useQuery({
    queryKey: ['leaderboard', 'users', period],
    enabled: board === 'users',
    queryFn: async () => {
      const { data, error } = await api.rpc('leaderboard_users', {
        p_period: period,
        p_limit: 20,
      })
      if (error) throw error
      return (data ?? []) as LeaderboardUser[]
    },
  })

  const guildsQuery = useQuery({
    queryKey: ['leaderboard', 'guilds', period],
    enabled: board === 'guilds',
    queryFn: async () => {
      const { data, error } = await api.rpc('leaderboard_guilds', {
        p_period: period,
        p_limit: 20,
      })
      if (error) throw error
      return (data ?? []) as LeaderboardGuild[]
    },
  })

  const active = board === 'users' ? usersQuery : guildsQuery

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="🏆 Classements"
        subtitle="La gloire se mesure en XP. Qui domine la forge ?"
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="tabs tabs-box">
          <button
            role="tab"
            className={`tab ${board === 'users' ? 'tab-active' : ''}`}
            onClick={() => setBoard('users')}
          >
            ⚔️ Aventuriers
          </button>
          <button
            role="tab"
            className={`tab ${board === 'guilds' ? 'tab-active' : ''}`}
            onClick={() => setBoard('guilds')}
          >
            🛡️ Guildes
          </button>
        </div>
        <div className="join">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={`btn join-item btn-sm ${period === p.value ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {active.isLoading ? (
        <LoadingState label="Comptage des exploits…" />
      ) : active.isError ? (
        <ErrorState message="Impossible de charger le classement." onRetry={() => void active.refetch()} />
      ) : board === 'users' ? (
        (usersQuery.data?.length ?? 0) > 0 ? (
          <div className="card bg-base-100 shadow-sm">
            <ul className="divide-y divide-base-200">
              {usersQuery.data!.map((row, i) => (
                <li key={row.user_id} className="flex items-center gap-3 p-4">
                  <div className="w-8 text-center text-lg font-bold">
                    {MEDALS[i] ?? <span className="text-sm text-base-content/50">#{i + 1}</span>}
                  </div>
                  <UserAvatar url={row.avatar_url} name={row.display_name || row.username} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/u/${row.username}`} className="link-hover font-medium">
                      {row.display_name || row.username}
                    </Link>
                    <div className="text-xs text-base-content/60">
                      Nv. {levelForXp(Number(row.total_xp))} · {row.quests_completed} quête(s)
                    </div>
                  </div>
                  <div className="badge badge-accent font-semibold">⚡ {row.total_xp} XP</div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState
            icon="🏜️"
            title="Aucun exploit sur cette période"
            hint="Complète une quête pour inscrire ton nom dans les annales."
          />
        )
      ) : (guildsQuery.data?.length ?? 0) > 0 ? (
        <div className="card bg-base-100 shadow-sm">
          <ul className="divide-y divide-base-200">
            {guildsQuery.data!.map((row, i) => (
              <li key={row.guild_id} className="flex items-center gap-3 p-4">
                <div className="w-8 text-center text-lg font-bold">
                  {MEDALS[i] ?? <span className="text-sm text-base-content/50">#{i + 1}</span>}
                </div>
                <div className="text-2xl">{row.emblem}</div>
                <div className="min-w-0 flex-1">
                  <Link to={`/app/guilds/${row.guild_id}`} className="link-hover font-medium">
                    {row.name}
                  </Link>
                  <div className="text-xs text-base-content/60">
                    {row.member_count} membre(s) · {row.quests_completed} quête(s)
                  </div>
                </div>
                <div className="badge badge-accent font-semibold">⚡ {row.total_xp} XP</div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState
          icon="🏜️"
          title="Aucune guilde classée sur cette période"
          hint="Les quêtes de guilde validées font grimper ce classement."
        />
      )}
    </div>
  )
}
