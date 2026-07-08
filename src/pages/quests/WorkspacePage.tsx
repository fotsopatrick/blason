import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ErrorState, LoadingState, PageHeader } from '@/components/ui'
import { SUBMISSION_STATUS_LABELS, formatRelative } from '@/lib/format'
import type { QuestAssignment, Submission } from '@/lib/types'

export default function WorkspacePage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [githubUrl, setGithubUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [checked, setChecked] = useState<Record<number, boolean>>({})

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['workspace', assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const [assignRes, subsRes] = await Promise.all([
        supabase
          .from('quest_assignments')
          .select('*, quests(*), guilds(*)')
          .eq('id', assignmentId!)
          .maybeSingle(),
        supabase
          .from('submissions')
          .select('*, profiles!submissions_submitted_by_fkey(username, display_name, avatar_url)')
          .eq('assignment_id', assignmentId!)
          .order('created_at', { ascending: false }),
      ])
      if (assignRes.error) throw assignRes.error
      return {
        assignment: assignRes.data as QuestAssignment | null,
        submissions: (subsRes.data ?? []) as Submission[],
      }
    },
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      // 1. Upload des livrables éventuels.
      const urls: string[] = []
      for (const file of files) {
        const path = `${user!.id}/${assignmentId}/${Date.now()}-${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('deliverables')
          .upload(path, file)
        if (uploadError) throw new Error(`Upload de ${file.name} : ${uploadError.message}`)
        const { data: { publicUrl } } = supabase.storage.from('deliverables').getPublicUrl(path)
        urls.push(publicUrl)
      }
      // 2. Création de la soumission.
      const { error } = await supabase.from('submissions').insert({
        assignment_id: assignmentId,
        submitted_by: user!.id,
        github_url: githubUrl.trim(),
        notes: notes.trim(),
        deliverable_urls: urls,
      })
      if (error) throw error
      // 3. Marque l'assignment comme soumis.
      await supabase
        .from('quest_assignments')
        .update({ status: 'submitted' })
        .eq('id', assignmentId!)
    },
    onSuccess: () => {
      setGithubUrl('')
      setNotes('')
      setFiles([])
      void queryClient.invalidateQueries({ queryKey: ['workspace', assignmentId] })
      void queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
      toast.success('Soumission envoyée ! Le créateur de la quête va l’évaluer. 🧾')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!githubUrl.trim() && files.length === 0 && !notes.trim()) {
      toast.error('Ajoute au moins un lien GitHub, un livrable ou une note.')
      return
    }
    submitMutation.mutate()
  }

  if (isLoading) return <LoadingState label="Installation du campement…" />
  if (isError || !data?.assignment || !data.assignment.quests) {
    return <ErrorState message="Espace de quête introuvable ou non autorisé." onRetry={() => void refetch()} />
  }

  const { assignment, submissions } = data
  const quest = assignment.quests!
  const done = assignment.status === 'completed'
  const pendingReview = submissions.some((s) => s.status === 'pending')
  const steps = quest.steps
  const checkedCount = steps.reduce((n, _s, i) => n + (checked[i] ? 1 : 0), 0)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`🏕️ ${quest.title}`}
        subtitle={
          assignment.guild_id
            ? `Quête de guilde — ${assignment.guilds?.name ?? ''}`
            : 'Quête solo'
        }
        actions={
          <Link to={`/app/quests/${quest.id}`} className="btn btn-outline btn-sm">
            📜 Voir la quête
          </Link>
        }
      />

      {done && (
        <div className="alert alert-success mb-6">
          <span>
            🎉 Quête complétée et validée — {quest.xp_reward} XP gagnés
            {assignment.guild_id ? ' par chaque membre de la guilde' : ''} !
          </span>
        </div>
      )}
      {!done && pendingReview && (
        <div className="alert alert-warning mb-6">
          <span>⏳ Soumission en attente de validation par le créateur de la quête.</span>
        </div>
      )}

      <div className="grid gap-6">
        {/* Checklist des étapes (locale, aide-mémoire) */}
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-base">🗺️ Étapes ({checkedCount}/{steps.length})</h2>
              <progress
                className="progress progress-primary w-32"
                value={checkedCount}
                max={steps.length}
              />
            </div>
            <ul className="flex flex-col gap-2">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 rounded-box bg-base-200/60 p-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm mt-0.5"
                    checked={!!checked[i] || done}
                    disabled={done}
                    onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
                  />
                  <div>
                    <div className={`font-medium ${checked[i] || done ? 'line-through opacity-60' : ''}`}>
                      {step.title}
                    </div>
                    <div className="text-sm text-base-content/70">{step.description}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Formulaire de soumission */}
        {!done && (
          <form onSubmit={handleSubmit} className="card bg-base-100 shadow-sm">
            <div className="card-body gap-3">
              <h2 className="card-title text-base">🧾 Soumettre le travail</h2>
              <label className="form-control">
                <span className="label-text mb-1 text-sm">Lien GitHub du projet</span>
                <input
                  type="url"
                  className="input input-bordered w-full"
                  placeholder="https://github.com/ma-guilde/mon-projet"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1 text-sm">Notes pour l'évaluateur</span>
                <textarea
                  className="textarea textarea-bordered min-h-20 w-full"
                  placeholder="Ce qu'on a construit, les choix techniques, le lien de démo…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1 text-sm">
                  Livrables <span className="text-base-content/50">(captures, PDF, zip…)</span>
                </span>
                <input
                  type="file"
                  multiple
                  className="file-input file-input-bordered w-full"
                  onChange={(e) => setFiles([...(e.target.files ?? [])])}
                />
              </label>
              {files.length > 0 && (
                <div className="text-xs text-base-content/60">
                  {files.length} fichier(s) : {files.map((f) => f.name).join(', ')}
                </div>
              )}
              <div className="card-actions justify-end">
                <button type="submit" className="btn btn-primary" disabled={submitMutation.isPending}>
                  {submitMutation.isPending ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    '🚀 Soumettre à validation'
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Historique */}
        {submissions.length > 0 && (
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">📚 Historique des soumissions</h2>
              <ul className="flex flex-col gap-3">
                {submissions.map((sub) => (
                  <li key={sub.id} className="rounded-box border border-base-300 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {sub.profiles?.display_name ?? 'Membre'} · {formatRelative(sub.created_at)}
                      </span>
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
                        className="link link-primary block truncate text-sm"
                      >
                        {sub.github_url}
                      </a>
                    )}
                    {sub.feedback && (
                      <p className="mt-1 text-sm text-base-content/70">
                        <span className="font-medium">Feedback :</span> {sub.feedback}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
