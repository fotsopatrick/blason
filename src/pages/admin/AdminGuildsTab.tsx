import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToast } from '@/contexts/ToastContext'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui'
import { formatDate } from '@/lib/format'
import type { Guild } from '@/lib/types'

type GuildRow = Guild & { guild_members: { count: number }[] }

export default function AdminGuildsTab() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-guilds'],
    queryFn: async () => {
      const { data, error } = await api
        .from('guilds')
        .select('*, guild_members(count)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as GuildRow[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.from('guilds').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-guilds'] })
      toast.success('Guilde dissoute.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) {
    return <ErrorState message="Impossible de charger les guildes." onRetry={() => void refetch()} />
  }
  if (data.length === 0) return <EmptyState icon="🛡️" title="Aucune guilde" />

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Guilde</th>
              <th>Membres</th>
              <th>XP</th>
              <th>Créée</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((g) => (
              <tr key={g.id} className="hover">
                <td>
                  <Link to={`/app/guilds/${g.id}`} className="link-hover flex items-center gap-2 font-medium">
                    <span className="text-xl">{g.emblem}</span>
                    {g.name}
                  </Link>
                </td>
                <td>
                  {g.guild_members[0]?.count ?? 0}/{g.max_members}
                </td>
                <td>⚡ {g.xp}</td>
                <td className="whitespace-nowrap text-sm text-base-content/60">{formatDate(g.created_at)}</td>
                <td>
                  <button
                    className="btn btn-outline btn-error btn-xs"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (confirm(`Dissoudre la guilde « ${g.name} » ?`)) {
                        deleteMutation.mutate(g.id)
                      }
                    }}
                  >
                    Dissoudre
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
