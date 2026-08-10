import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useMyGuild } from '@/hooks/queries'
import {
  DifficultyBadge,
  ErrorState,
  LoadingState,
  SkillTags,
  UserAvatar,
} from '@/components/ui'
import { SUBMISSION_STATUS_LABELS, formatDate, formatRelative } from '@/lib/format'
import type { Quest, QuestAssignment, Submission } from '@/lib/types'
import QuestCinematic from '@/components/quests/QuestCinematic'

type SubmissionWithContext = Submission & {
  quest_assignments: QuestAssignment
  profiles: { username: string; display_name: string; avatar_url: string | null }
}

function ReviewPanel({ questId }: { questId: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({})

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['quest-submissions', questId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('submissions')
        .select('*, quest_assignments!inner(*), profiles!submissions_submitted_by_fkey(username, display_name, avatar_url)')
        .eq('quest_assignments.quest_id', questId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SubmissionWithContext[]
    },
  })

  const reviewMutation = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc('review_submission', {
        p_submission_id: id,
        p_approve: approve,
        p_feedback: feedbackById[id] ?? '',
      })
      if (error) throw error
      return approve
    },
    onSuccess: (approved) => {
      void queryClient.invalidateQueries({ queryKey: ['quest-submissions', questId] })
      void queryClient.invalidateQueries({ queryKey: ['quest', questId] })
      toast.success(approved ? 'Soumission validée, XP distribué ⚡' : 'Soumission rejetée.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <LoadingState label="Chargement des soumissions…" />
  if (!submissions || submissions.length === 0) {
    return (
      <p className="text-sm text-base-content/60">
        Aucune soumission pour cette quête pour l'instant.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {submissions.map((sub) => (
        <div key={sub.id} className="rounded-box border border-base-300 bg-base-200/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <UserAvatar url={sub.profiles.avatar_url} name={sub.profiles.display_name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{sub.profiles.display_name}</div>
              <div className="text-xs text-base-content/60">
                {sub.quest_assignments.guild_id ? '🛡️ Soumission de guilde' : '👤 Solo'} ·{' '}
                {formatRelative(sub.created_at)}
              </div>
            </div>
            <span
              className={`badge badge-sm ${
                sub.status === 'pending'
                  ? 'badge-warning'
                  : sub.status === 'approved'
                    ? 'badge-success'
                    : 'badge-error'
              }`}
            >
              {SUBMISSION_STATUS_LABELS[sub.status]}
            </span>
          </div>

          {sub.github_url && (
            <a
              href={sub.github_url}
              target="_blank"
              rel="noreferrer"
              className="link link-primary mt-2 block truncate text-sm"
            >
              🔗 {sub.github_url}
            </a>
          )}
          {sub.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{sub.notes}</p>}
          {sub.deliverable_urls.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {sub.deliverable_urls.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="badge badge-outline">
                  📎 Livrable {i + 1}
                </a>
              ))}
            </div>
          )}

          {sub.status === 'pending' ? (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                className="textarea textarea-bordered textarea-sm w-full"
                placeholder="Feedback pour l'équipe (optionnel)"
                value={feedbackById[sub.id] ?? ''}
                onChange={(e) => setFeedbackById((f) => ({ ...f, [sub.id]: e.target.value }))}
              />
              <div className="flex gap-2">
                <button
                  className="btn btn-success btn-sm"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ id: sub.id, approve: true })}
                >
                  ✅ Valider & attribuer l'XP
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
          ) : (
            sub.feedback && (
              <div className="mt-2 rounded-lg bg-base-100 p-2 text-sm">
                <span className="font-medium">Feedback :</span> {sub.feedback}
              </div>
            )
          )}
        </div>
      ))}
    </div>
  )
}

export default function QuestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: membership } = useMyGuild()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['quest', id],
    enabled: !!id,
    queryFn: async () => {
      const [questRes, assignRes] = await Promise.all([
        supabase
          .from('quests')
          .select('*, profiles!quests_created_by_fkey(username, display_name, avatar_url)')
          .eq('id', id!)
          .maybeSingle(),
        supabase.from('quest_assignments').select('*').eq('quest_id', id!),
      ])
      if (questRes.error) throw questRes.error
      return {
        quest: questRes.data as Quest | null,
        assignments: (assignRes.data ?? []) as QuestAssignment[],
      }
    },
  })

  const acceptMutation = useMutation({
    mutationFn: async (asGuild: boolean) => {
      const { data: inserted, error } = await supabase
        .from('quest_assignments')
        .insert({
          quest_id: id,
          user_id: asGuild ? null : user!.id,
          guild_id: asGuild ? membership!.guild_id : null,
          accepted_by: user!.id,
        })
        .select('id')
        .single()
      if (error) throw error
      return inserted.id as string
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quest', id] })
      void queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
      toast.success('Quête acceptée — en route, aventurier·ère ! 🗡️')
    },
    onError: (err: Error) => {
      toast.error(
        err.message.includes('duplicate')
          ? 'Cette quête est déjà acceptée par toi ou ta guilde.'
          : err.message,
      )
    },
  })

  if (isLoading) return <LoadingState label="Lecture du parchemin…" />
  if (isError || !data?.quest) {
    return <ErrorState message="Quête introuvable." onRetry={() => void refetch()} />
  }

  const { quest, assignments } = data
  const isCreator = quest.created_by === user?.id
  const isAdmin = profile?.role === 'admin'
  const isStudent = profile?.role === 'student'
  const myAssignment = assignments.find(
    (a) => a.user_id === user?.id || (membership && a.guild_id === membership.guild_id),
  )
  const isGuildLeader = membership?.role === 'leader'

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/app/quests" className="btn btn-ghost btn-sm mb-4">
        ← Tableau des quêtes
      </Link>

      <div className="card bg-base-100 shadow-sm">
        <QuestCinematic quest={quest} />
        <div className="card-body">
          <div className="flex flex-wrap items-center gap-2">
            <DifficultyBadge difficulty={quest.difficulty} />
            <span className="badge badge-accent font-semibold">⚡ {quest.xp_reward} XP</span>
            <span className="badge badge-ghost">⏱️ ~{quest.estimated_hours} h</span>
            {quest.source === 'ai' && <span className="badge badge-ghost">🤖 Générée par IA</span>}
            {quest.status !== 'published' && (
              <span className="badge badge-warning">{quest.status === 'draft' ? 'Brouillon' : 'Archivée'}</span>
            )}
          </div>

          <h1 className="font-display mt-2 text-2xl font-bold leading-tight">{quest.title}</h1>
          <p className="mt-2 whitespace-pre-wrap text-base-content/80">{quest.description}</p>

          {quest.story && (
            <details className="rounded-box border border-base-300 bg-base-200/40 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-base-content/70">
                📜 L'histoire racontée
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm italic text-base-content/70">{quest.story}</p>
            </details>
          )}

          <h2 className="mt-4 font-semibold">🗺️ Étapes de la quête</h2>
          <ol className="flex flex-col gap-3">
            {quest.steps.map((step, i) => (
              <li key={i} className="flex gap-3 rounded-box bg-base-200/60 p-3">
                <div className="badge badge-primary badge-lg shrink-0 font-bold">{i + 1}</div>
                <div>
                  <div className="font-medium">{step.title}</div>
                  <div className="text-sm text-base-content/70">{step.description}</div>
                </div>
              </li>
            ))}
          </ol>

          <h2 className="mt-4 font-semibold">🎯 Compétences prouvées</h2>
          <SkillTags skills={quest.skills} />

          {quest.resources.length > 0 && (
            <>
              <h2 className="mt-4 font-semibold">📚 Ressources</h2>
              <ul className="flex flex-col gap-1">
                {quest.resources.map((r) => (
                  <li key={r.url}>
                    <a href={r.url} target="_blank" rel="noreferrer" className="link link-secondary text-sm">
                      → {r.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-4 flex items-center gap-2 text-xs text-base-content/50">
            <span>Forgée par {quest.profiles?.display_name ?? 'inconnu'}</span>
            <span>·</span>
            <span>{formatDate(quest.created_at)}</span>
            <span>·</span>
            <span>{assignments.length} équipe(s)/joueur(s) engagé(s)</span>
          </div>

          {/* Actions étudiant */}
          {isStudent && quest.status === 'published' && (
            <div className="card-actions mt-4 border-t border-base-200 pt-4">
              {myAssignment ? (
                <Link to={`/app/workspace/${myAssignment.id}`} className="btn btn-primary">
                  🏕️ Ouvrir mon espace de quête
                </Link>
              ) : (
                <>
                  <button
                    className="btn btn-primary"
                    disabled={acceptMutation.isPending}
                    onClick={() => acceptMutation.mutate(false)}
                  >
                    ⚔️ Accepter en solo
                  </button>
                  {membership &&
                    (isGuildLeader ? (
                      <button
                        className="btn btn-secondary"
                        disabled={acceptMutation.isPending}
                        onClick={() => acceptMutation.mutate(true)}
                      >
                        🛡️ Accepter pour {membership.guilds.name}
                      </button>
                    ) : (
                      <div className="tooltip" data-tip="Seul le leader de guilde peut accepter pour la guilde">
                        <button className="btn btn-secondary" disabled>
                          🛡️ Accepter pour la guilde
                        </button>
                      </div>
                    ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Panneau de validation (créateur / admin) */}
      {(isCreator || isAdmin) && (
        <div className="card mt-6 bg-base-100 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-base">🧾 Soumissions reçues</h2>
            <ReviewPanel questId={quest.id} />
          </div>
        </div>
      )}
    </div>
  )
}
