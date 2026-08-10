import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { EmptyState, ErrorState, FadeIn, LoadingState, PageHeader } from '@/components/ui'
import { formatDate } from '@/lib/format'

type EntretienEtat = 'a_preparer' | 'preparation' | 'pret' | 'passe'

type Entretien = {
  id: string
  poste: string
  entreprise: string
  date_entretien: string | null
  etat: EntretienEtat
  preparation: string
  questions_reelles: string
  created_at: string
}

const ETAT_LABELS: Record<EntretienEtat, string> = {
  a_preparer: '📜 À préparer',
  preparation: '✍️ En préparation',
  pret: '✅ Prêt',
  passe: '🏁 Passé',
}

const ETAT_BADGE: Record<EntretienEtat, string> = {
  a_preparer: 'badge-ghost',
  preparation: 'badge-info',
  pret: 'badge-success',
  passe: 'badge-accent',
}

function buildPreparation(gen: unknown): string {
  const g = gen as {
    story?: string
    steps?: { title?: string; description?: string }[]
  } | null
  const lines: string[] = []
  if (g?.story) lines.push(g.story)
  for (const s of g?.steps ?? []) {
    if (!s?.title) continue
    lines.push(`- ${s.title}${s.description ? ` : ${s.description}` : ''}`)
  }
  return lines.join('\n')
}

function EntretienCard({ entretien }: { entretien: Entretien }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [preparation, setPreparation] = useState(entretien.preparation)
  const [questions, setQuestions] = useState(entretien.questions_reelles)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('entretiens')
        .update({ preparation, questions_reelles: questions })
        .eq('id', entretien.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['entretiens'] })
      toast.success('Préparation sauvegardée ✍️')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const passeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('entretiens')
        .update({ etat: 'passe' })
        .eq('id', entretien.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['entretiens'] })
      toast.success('Entretien marqué passé 🏁')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">{entretien.poste}</div>
            <div className="text-sm text-base-content/60">
              {entretien.entreprise || 'Entreprise non renseignée'}
              {entretien.date_entretien ? ` · ${formatDate(entretien.date_entretien)}` : ''}
            </div>
          </div>
          <span className={`badge badge-sm ${ETAT_BADGE[entretien.etat]}`}>{ETAT_LABELS[entretien.etat]}</span>
        </div>

        <label className="form-control">
          <span className="label-text mb-1 text-sm">Préparation</span>
          <textarea
            className="textarea textarea-bordered min-h-28 w-full"
            value={preparation}
            onChange={(e) => setPreparation(e.target.value)}
            placeholder="Ce que je vais dire, les questions possibles…"
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Ce qui s'est vraiment passé</span>
          <textarea
            className="textarea textarea-bordered min-h-20 w-full"
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            placeholder="Les questions posées, mes réponses, le ressenti…"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-outline btn-sm"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              '💾 Sauvegarder'
            )}
          </button>
          {entretien.etat !== 'passe' && (
            <button
              className="btn btn-success btn-sm"
              disabled={passeMutation.isPending}
              onClick={() => passeMutation.mutate()}
            >
              {passeMutation.isPending ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                '🏁 Marquer passé'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EntretiensPage() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [poste, setPoste] = useState('')
  const [entreprise, setEntreprise] = useState('')
  const [date, setDate] = useState('')

  const { data: entretiens, isLoading, isError, refetch } = useQuery({
    queryKey: ['entretiens', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entretiens')
        .select('*')
        .eq('created_by', user!.id)
        .order('date_entretien', { ascending: false })
      if (error) throw error
      return (data ?? []) as Entretien[]
    },
  })

  const prepareMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('entretiens').insert({
        poste: poste.trim(),
        entreprise: entreprise.trim(),
        date_entretien: date || null,
        etat: 'a_preparer',
        created_by: user!.id,
      })
      if (error) throw error
      const row = data[0] as Entretien | undefined
      if (!row) throw new Error("L'entretien n'a pas pu être créé")
      const { data: gen, error: genError } = await supabase.functions.invoke('generate-quest', {
        body: { job_posting: poste.trim() },
      })
      if (genError) throw genError
      const preparation = buildPreparation(gen)
      const { error: upError } = await supabase
        .from('entretiens')
        .update({ preparation })
        .eq('id', row.id)
      if (upError) throw upError
      return row.id
    },
    onSuccess: () => {
      setPoste('')
      setEntreprise('')
      setDate('')
      void queryClient.invalidateQueries({ queryKey: ['entretiens'] })
      toast.success('Entretien préparé — le parchemin est prêt 📜')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handlePrepare = (e: FormEvent) => {
    e.preventDefault()
    if (!poste.trim()) {
      toast.error("Renseigne d'abord le poste visé.")
      return
    }
    prepareMutation.mutate()
  }

  return (
    <div>
      <PageHeader
        title="Entretiens"
        subtitle="Prépare chaque duel, note ce qui s'est vraiment passé."
      />

      <form onSubmit={handlePrepare} className="card mb-6 bg-base-100 shadow-sm">
        <div className="card-body gap-3">
          <h2 className="card-title text-base">🗡️ Préparer un entretien</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Poste</span>
              <input
                className="input input-bordered w-full"
                required
                value={poste}
                onChange={(e) => setPoste(e.target.value)}
                placeholder="Développeur Fullstack"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Entreprise</span>
              <input
                className="input input-bordered w-full"
                value={entreprise}
                onChange={(e) => setEntreprise(e.target.value)}
                placeholder="CGI"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Date</span>
              <input
                type="date"
                className="input input-bordered w-full"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <div className="card-actions justify-end">
            <button type="submit" className="btn btn-primary" disabled={prepareMutation.isPending}>
              {prepareMutation.isPending ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                '🗡️ Préparer'
              )}
            </button>
          </div>
        </div>
      </form>

      {isLoading ? (
        <LoadingState label="Dépliage du parchemin des entretiens…" />
      ) : isError ? (
        <ErrorState message="Impossible de charger les entretiens." onRetry={() => void refetch()} />
      ) : entretiens && entretiens.length > 0 ? (
        <div className="flex flex-col gap-4">
          {entretiens.map((e, i) => (
            <FadeIn key={e.id} delay={i * 0.04}>
              <EntretienCard entretien={e} />
            </FadeIn>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="🗡️"
          title="Aucun entretien préparé"
          hint="Prépare ton premier entretien : la forge t'aide à structurer ta préparation."
        />
      )}
    </div>
  )
}
