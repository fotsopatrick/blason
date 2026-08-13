import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { EmptyState, ErrorState, FadeIn, LoadingState, PageHeader, SkillTags } from '@/components/ui'
import { formatDate } from '@/lib/format'

type Offre = {
  id: string
  titre: string
  entreprise: string
  url: string
  domaine: string
  tags: string[]
  notes: string
  created_at: string
}

const DOMAINES = [
  { value: 'tous', label: 'Tous les domaines' },
  { value: 'ia-agents', label: 'IA & agents' },
  { value: 'dev', label: 'Développement' },
  { value: 'cloud-devops', label: 'Cloud & DevOps' },
  { value: 'data', label: 'Data' },
  { value: 'design', label: 'Design' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'autre', label: 'Autre' },
]

const DOMAINE_LABELS: Record<string, string> = Object.fromEntries(
  DOMAINES.filter((d) => d.value !== 'tous').map((d) => [d.value, d.label]),
)

const DOMAINE_BADGE: Record<string, string> = {
  'ia-agents': 'badge-secondary',
  dev: 'badge-info',
  'cloud-devops': 'badge-warning',
  data: 'badge-success',
  design: 'badge-error',
  marketing: 'badge-ghost',
  commercial: 'badge-accent',
}

export default function OffresPage() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [domaine, setDomaine] = useState('tous')
  const [showAdd, setShowAdd] = useState(false)
  const [titre, setTitre] = useState('')
  const [entreprise, setEntreprise] = useState('')
  const [url, setUrl] = useState('')
  const [nouveauDomaine, setNouveauDomaine] = useState('ia-agents')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')

  const { data: offres, isLoading, isError, refetch } = useQuery({
    queryKey: ['offres', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await api
        .from('offres')
        .select('*')
        .eq('created_by', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Offre[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.from('offres').insert({
        titre: titre.trim(),
        entreprise: entreprise.trim(),
        url: url.trim(),
        domaine: nouveauDomaine,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 12),
        notes: notes.trim(),
        created_by: user!.id,
      })
      if (error) throw error
      return data[0] as Offre | null
    },
    onSuccess: () => {
      setShowAdd(false)
      setTitre('')
      setEntreprise('')
      setUrl('')
      setTags('')
      setNotes('')
      void queryClient.invalidateQueries({ queryKey: ['offres'] })
      toast.success('Offre ajoutée à ton grimoire 📜')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleAdd = (e: FormEvent) => {
    e.preventDefault()
    createMutation.mutate()
  }

  const filtered = (offres ?? []).filter((o) => domaine === 'tous' || o.domaine === domaine)

  return (
    <div>
      <PageHeader
        title="Offres — choisis ton domaine"
        subtitle="Chaque offre est une porte d'entrée : choisis ton domaine et forge ta réalisation."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            ✍️ Ajouter une offre
          </button>
        }
      />

      <div className="mb-6 w-full max-w-xs">
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Domaine</span>
          <select className="select select-bordered" value={domaine} onChange={(e) => setDomaine(e.target.value)}>
            {DOMAINES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <LoadingState label="Ouverture du grimoire des offres…" />
      ) : isError ? (
        <ErrorState message="Impossible de charger les offres." onRetry={() => void refetch()} />
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o, i) => (
            <FadeIn key={o.id} delay={i * 0.04}>
              <div className="card h-full bg-base-100 shadow-sm transition-shadow hover:shadow-md">
                <div className="card-body">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="card-title text-base">{o.titre}</h2>
                      {o.entreprise && <div className="text-sm text-base-content/60">{o.entreprise}</div>}
                    </div>
                    <span className={`badge badge-sm shrink-0 ${DOMAINE_BADGE[o.domaine] ?? 'badge-ghost'}`}>
                      {DOMAINE_LABELS[o.domaine] ?? o.domaine}
                    </span>
                  </div>
                  {o.tags.length > 0 && (
                    <div className="mt-1">
                      <SkillTags skills={o.tags} max={4} />
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <span className="text-xs text-base-content/50">{formatDate(o.created_at)}</span>
                    <Link to={`/app/offres/${o.id}`} className="btn btn-outline btn-sm">
                      Voir / préparer
                    </Link>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="🗂️"
          title={domaine === 'tous' ? "Aucune offre pour l'instant" : 'Aucune offre dans ce domaine'}
          hint="Ajoute ta première offre d'emploi et commence à la préparer."
          action={
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              Ajouter une offre
            </button>
          }
        />
      )}

      <dialog className={`modal ${showAdd ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-display text-lg font-bold">✍️ Ajouter une offre</h3>
          <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-3">
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Titre du poste</span>
              <input
                className="input input-bordered w-full"
                required
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Architecte IA"
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
              <span className="label-text mb-1 text-sm">Lien de l'offre</span>
              <input
                type="url"
                className="input input-bordered w-full"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Domaine</span>
              <select
                className="select select-bordered w-full"
                value={nouveauDomaine}
                onChange={(e) => setNouveauDomaine(e.target.value)}
              >
                {DOMAINES.filter((d) => d.value !== 'tous').map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-sm">
                Tags <span className="text-base-content/50">(mots-clés courts, séparés par des virgules)</span>
              </span>
              <input
                className="input input-bordered w-full"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="agents, python, cloud"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Description de l'offre</span>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Colle ici la description du poste — elle restera sur la fiche de l'offre."
              />
            </label>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>
                Annuler
              </button>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  'Ajouter 📜'
                )}
              </button>
            </div>
          </form>
        </div>
        <button
          className="modal-backdrop"
          type="button"
          onClick={() => setShowAdd(false)}
          aria-label="Fermer"
        />
      </dialog>
    </div>
  )
}
