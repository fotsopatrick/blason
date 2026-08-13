import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToast } from '@/contexts/ToastContext'
import { DifficultyBadge, EmptyState, ErrorState, LoadingState } from '@/components/ui'
import { formatDate } from '@/lib/format'
import type { Quest, QuestStatus } from '@/lib/types'

type QuestRow = Quest & { profiles: { display_name: string } | null }

export default function AdminQuestsTab() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-quests'],
    queryFn: async () => {
      const { data, error } = await api
        .from('quests')
        .select('*, profiles!quests_created_by_fkey(display_name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as QuestRow[]
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: QuestStatus }) => {
      const { error } = await api.from('quests').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-quests'] })
      toast.success('Statut de la quête mis à jour.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.from('quests').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-quests'] })
      toast.success('Quête supprimée.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) {
    return <ErrorState message="Impossible de charger les quêtes." onRetry={() => void refetch()} />
  }
  if (data.length === 0) return <EmptyState icon="📜" title="Aucune quête" />

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Quête</th>
              <th>Auteur</th>
              <th>Difficulté</th>
              <th>Statut</th>
              <th>Créée</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((q) => (
              <tr key={q.id} className="hover">
                <td className="max-w-xs">
                  <Link to={`/app/quests/${q.id}`} className="link-hover block truncate font-medium">
                    {q.title}
                  </Link>
                  <span className="text-xs text-base-content/50">
                    ⚡ {q.xp_reward} XP {q.source === 'ai' && '· 🤖'}
                  </span>
                </td>
                <td className="whitespace-nowrap text-sm">{q.profiles?.display_name ?? '—'}</td>
                <td><DifficultyBadge difficulty={q.difficulty} /></td>
                <td>
                  <select
                    className="select select-bordered select-xs"
                    value={q.status}
                    disabled={statusMutation.isPending}
                    onChange={(e) =>
                      statusMutation.mutate({ id: q.id, status: e.target.value as QuestStatus })
                    }
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                    <option value="archived">archived</option>
                  </select>
                </td>
                <td className="whitespace-nowrap text-sm text-base-content/60">{formatDate(q.created_at)}</td>
                <td>
                  <button
                    className="btn btn-outline btn-error btn-xs"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (confirm(`Supprimer définitivement « ${q.title} » ?`)) {
                        deleteMutation.mutate(q.id)
                      }
                    }}
                  >
                    Supprimer
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
