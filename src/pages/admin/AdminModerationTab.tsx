import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToast } from '@/contexts/ToastContext'
import { EmptyState, ErrorState, LoadingState, UserAvatar } from '@/components/ui'
import { formatRelative } from '@/lib/format'
import type { Submission } from '@/lib/types'

type PendingSubmission = Submission & {
  profiles: { username: string; display_name: string; avatar_url: string | null }
  quest_assignments: { quest_id: string; guild_id: string | null; quests: { title: string } }
}

export default function AdminModerationTab() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({})

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-pending-submissions'],
    queryFn: async () => {
      const { data, error } = await api
        .from('submissions')
        .select('*, profiles!submissions_submitted_by_fkey(username, display_name, avatar_url), quest_assignments!inner(quest_id, guild_id, quests!inner(title))')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as PendingSubmission[]
    },
  })

  const reviewMutation = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await api.rpc('review_submission', {
        p_submission_id: id,
        p_approve: approve,
        p_feedback: feedbackById[id] ?? '',
      })
      if (error) throw error
      return approve
    },
    onSuccess: (approved) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-pending-submissions'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      toast.success(approved ? 'Validée, XP distribué ⚡' : 'Soumission rejetée.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) {
    return <ErrorState message="Impossible de charger les soumissions." onRetry={() => void refetch()} />
  }
  if (data.length === 0) {
    return (
      <EmptyState
        icon="✨"
        title="Aucune soumission en attente"
        hint="Toutes les soumissions ont été traitées. Le calme règne sur la forge."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-base-content/60">
        En tant qu'admin, tu peux valider ou rejeter n'importe quelle soumission, quel que soit son créateur.
      </p>
      {data.map((sub) => (
        <div key={sub.id} className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="flex flex-wrap items-center gap-2">
              <UserAvatar url={sub.profiles.avatar_url} name={sub.profiles.display_name} size="sm" />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/app/quests/${sub.quest_assignments.quest_id}`}
                  className="link-hover block truncate font-medium"
                >
                  {sub.quest_assignments.quests.title}
                </Link>
                <div className="text-xs text-base-content/60">
                  {sub.profiles.display_name} ·{' '}
                  {sub.quest_assignments.guild_id ? '🛡️ guilde' : '👤 solo'} ·{' '}
                  {formatRelative(sub.created_at)}
                </div>
              </div>
            </div>

            {sub.github_url && (
              <a href={sub.github_url} target="_blank" rel="noreferrer" className="link link-primary truncate text-sm">
                🔗 {sub.github_url}
              </a>
            )}
            {sub.notes && <p className="whitespace-pre-wrap text-sm">{sub.notes}</p>}
            {sub.deliverable_urls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {sub.deliverable_urls.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="badge badge-outline">
                    📎 Livrable {i + 1}
                  </a>
                ))}
              </div>
            )}

            <textarea
              className="textarea textarea-bordered textarea-sm w-full"
              placeholder="Feedback (optionnel)"
              value={feedbackById[sub.id] ?? ''}
              onChange={(e) => setFeedbackById((f) => ({ ...f, [sub.id]: e.target.value }))}
            />
            <div className="flex gap-2">
              <button
                className="btn btn-success btn-sm"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ id: sub.id, approve: true })}
              >
                ✅ Valider
              </button>
              <button
                className="btn btn-outline btn-error btn-sm"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ id: sub.id, approve: false })}
              >
                ❌ Rejeter
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
