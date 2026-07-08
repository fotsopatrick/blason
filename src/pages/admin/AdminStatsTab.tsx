import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ErrorState, LoadingState, StatCard } from '@/components/ui'
import type { AdminStats } from '@/lib/types'

export default function AdminStatsTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_stats')
      if (error) throw error
      return data as AdminStats
    },
  })

  if (isLoading) return <LoadingState label="Compilation des annales…" />
  if (isError || !data) {
    return <ErrorState message="Impossible de charger les statistiques." onRetry={() => void refetch()} />
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard icon="👥" label="Utilisateurs" value={data.total_users} />
      <StatCard icon="🔥" label="Actifs (30 j)" value={data.active_users_30d} />
      <StatCard icon="🛡️" label="Guildes" value={data.total_guilds} />
      <StatCard icon="📜" label="Quêtes publiées" value={data.published_quests} hint={`${data.total_quests} au total`} />
      <StatCard icon="✅" label="Quêtes complétées" value={data.quests_completed} />
      <StatCard icon="⏳" label="Soumissions en attente" value={data.pending_submissions} />
      <StatCard icon="⚡" label="XP distribué" value={data.total_xp_distributed} />
    </div>
  )
}
