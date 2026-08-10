import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { ErrorState, LoadingState, SkillTags } from '@/components/ui'
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

type RealisationEtat = 'brainstorming' | 'construction' | 'securite' | 'pret' | 'envoyee'

type Realisation = {
  id: string
  offre_id: string | null
  poste: string
  projet: string
  competence: string
  lien: string
  acces_login: string
  acces_mot_de_passe: string
  etat: RealisationEtat
  created_at: string
}

const ETAT_LABELS: Record<RealisationEtat, string> = {
  brainstorming: '🧠 Brainstorming',
  construction: '🏗️ Construction',
  securite: '🔐 Contrôle de sécurité',
  pret: '✅ Prête',
  envoyee: '📨 Envoyée',
}

const ETAT_BADGE: Record<RealisationEtat, string> = {
  brainstorming: 'badge-ghost',
  construction: 'badge-info',
  securite: 'badge-warning',
  pret: 'badge-success',
  envoyee: 'badge-accent',
}

function RealisationCard({ realisation }: { realisation: Realisation }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [projet, setProjet] = useState(realisation.projet)
  const [competence, setCompetence] = useState(realisation.competence)
  const [lien, setLien] = useState(realisation.lien)
  const [accesLogin, setAccesLogin] = useState(realisation.acces_login)
  const [accesMdp, setAccesMdp] = useState(realisation.acces_mot_de_passe)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('realisations')
        .update({
          projet,
          competence,
          lien,
          acces_login: accesLogin,
          acces_mot_de_passe: accesMdp,
        })
        .eq('id', realisation.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['realisations', realisation.offre_id] })
      toast.success('Réalisation sauvegardée ✍️')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('realisations')
        .update({ etat: 'envoyee' })
        .eq('id', realisation.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['realisations', realisation.offre_id] })
      toast.success('Réalisation marquée envoyée 📨')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const ready = realisation.etat === 'pret' || realisation.etat === 'envoyee'

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{realisation.poste || 'Réalisation'}</div>
        <span className={`badge badge-sm ${ETAT_BADGE[realisation.etat]}`}>{ETAT_LABELS[realisation.etat]}</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Projet</span>
          <input
            className="input input-bordered w-full"
            value={projet}
            onChange={(e) => setProjet(e.target.value)}
            placeholder="Le nom du projet"
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Compétence visée</span>
          <input
            className="input input-bordered w-full"
            value={competence}
            onChange={(e) => setCompetence(e.target.value)}
            placeholder="agents IA, React…"
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Lien</span>
          <input
            type="url"
            className="input input-bordered w-full"
            value={lien}
            onChange={(e) => setLien(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="form-control">
            <span className="label-text mb-1 text-sm">Accès — identifiant</span>
            <input
              className="input input-bordered w-full"
              value={accesLogin}
              onChange={(e) => setAccesLogin(e.target.value)}
              placeholder="login@exemple.fr"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1 text-sm">Accès — mot de passe</span>
            <input
              className="input input-bordered w-full"
              value={accesMdp}
              onChange={(e) => setAccesMdp(e.target.value)}
              placeholder="••••••••"
            />
          </label>
        </div>
      </div>

      {ready && (
        <div className="alert alert-success mt-3">
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-semibold">📨 Lien à envoyer à l'entreprise</span>
            {lien ? (
              <a href={lien} target="_blank" rel="noreferrer" className="link link-primary break-all">
                {lien}
              </a>
            ) : (
              <span className="text-base-content/60">Aucun lien renseigné</span>
            )}
            <span>Identifiant : {accesLogin || '—'}</span>
            <span>Mot de passe : {accesMdp || '—'}</span>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
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
        {realisation.etat === 'pret' && (
          <button
            className="btn btn-success btn-sm"
            disabled={sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
          >
            {sendMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              '📨 Marquer envoyée'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default function OffreDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: offre, isLoading: offreLoading, isError, refetch } = useQuery({
    queryKey: ['offre', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offres')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data as Offre | null
    },
  })

  const { data: realisations, isLoading: realisationsLoading } = useQuery({
    queryKey: ['realisations', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('realisations')
        .select('*')
        .eq('offre_id', id!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Realisation[]
    },
  })

  const launchMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('realisations').insert({
        offre_id: id,
        poste: offre?.titre ?? '',
        etat: 'brainstorming',
        created_by: user!.id,
      })
      if (error) throw error
      return data[0] as Realisation | null
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['realisations', id] })
      toast.success('Réalisation lancée — à la forge ! ⚒️')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (offreLoading) return <LoadingState label="Lecture du parchemin…" />
  if (isError || !offre) {
    return <ErrorState message="Offre introuvable." onRetry={() => void refetch()} />
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/app/offres" className="btn btn-ghost btn-sm mb-4">
        ← Retour aux offres
      </Link>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-sm badge-primary">{offre.domaine}</span>
            {offre.entreprise && <span className="badge badge-ghost">{offre.entreprise}</span>}
            <span className="badge badge-ghost">{formatDate(offre.created_at)}</span>
          </div>
          <h1 className="font-display mt-2 text-2xl font-bold">{offre.titre}</h1>
          {offre.url && (
            <a href={offre.url} target="_blank" rel="noreferrer" className="link link-secondary break-all text-sm">
              🔗 {offre.url}
            </a>
          )}
          {offre.tags.length > 0 && (
            <div className="mt-1">
              <SkillTags skills={offre.tags} />
            </div>
          )}
          {offre.notes && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-base-content/70">{offre.notes}</p>
          )}
        </div>
      </div>

      <div className="card mt-6 bg-base-100 shadow-sm">
        <div className="card-body">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="card-title text-base">🎯 Réalisations</h2>
              <p className="text-sm text-base-content/60">
                Un projet qui montre ton savoir-faire pour ce poste.
              </p>
            </div>
            <button
              className="btn btn-primary btn-sm"
              disabled={launchMutation.isPending}
              onClick={() => launchMutation.mutate()}
            >
              {launchMutation.isPending ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                '⚒️ Lancer une réalisation'
              )}
            </button>
          </div>

          {realisationsLoading ? (
            <LoadingState />
          ) : realisations && realisations.length > 0 ? (
            <div className="mt-3 flex flex-col gap-4">
              {realisations.map((r) => (
                <RealisationCard key={r.id} realisation={r} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-base-content/60">
              Aucune réalisation pour l'instant. Lance la première pour ce poste.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
