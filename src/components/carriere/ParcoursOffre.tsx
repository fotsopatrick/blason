/**
 * Le parcours d'apprentissage d'une offre.
 *
 * POURQUOI CE COMPOSANT EXISTE (13/08/2026)
 *
 * Le moteur d'apprentissage (server/moteur.cjs) savait deja transformer une
 * annonce en parcours : competences reelles, questions d'entretien, et la
 * fiche « pret pour les USA ». Mais l'endpoint n'etait appelable qu'en
 * ligne de commande. Le Royaume, lui, affichait « colle une offre, genere un
 * parcours, puis reviens » — un message qui demandait a l'utilisateur une
 * action qu'aucun bouton ne rendait possible.
 *
 * Une fonction qu'aucune interface n'atteint n'existe pas.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getToken } from '@/lib/api'
import { useToast } from '@/contexts/ToastContext'
import { LoadingState } from '@/components/ui'

interface CompetenceParcours {
  nom: string
  brut: string
  couvert: boolean
  nb_exercices: number
}

interface PointUS {
  cle: string
  titre: string
  etat: 'bloquant' | 'favorable' | 'a-verifier' | 'a-preparer' | 'info'
  dit: string
}

interface Parcours {
  id: string
  titre: string
  entreprise: string
  pays: string
  salaire: string
  competences: CompetenceParcours[]
  entretien: { skill: string; genre: string; question: string }[]
  us_check: PointUS[]
  avertissements?: string[]
}

// Le moteur vit hors du client `api` (qui imite l'ancienne forme supabase-js) :
// on l'appelle directement, avec le meme jeton.
async function appeler<T>(chemin: string, options?: { methode?: string; corps?: unknown }): Promise<T> {
  const jeton = getToken()
  const r = await fetch(`/api${chemin}`, {
    method: options?.methode ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    body: options?.corps ? JSON.stringify(options.corps) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { message?: string }).message ?? `Erreur ${r.status}`)
  return j as T
}

// Chaque etat de la fiche US porte une couleur qui dit quoi en faire :
// rouge on s'arrete, vert on y va, ambre on verifie, bleu on prepare.
const ETAT_BADGE: Record<PointUS['etat'], string> = {
  bloquant: 'badge-error',
  favorable: 'badge-success',
  'a-verifier': 'badge-warning',
  'a-preparer': 'badge-info',
  info: 'badge-ghost',
}
const ETAT_MOT: Record<PointUS['etat'], string> = {
  bloquant: 'bloquant',
  favorable: 'favorable',
  'a-verifier': 'à vérifier',
  'a-preparer': 'à préparer',
  info: 'info',
}

export default function ParcoursOffre({ offreId }: { offreId: string }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [ouvertUS, setOuvertUS] = useState(true)

  const { data: liste, isLoading } = useQuery({
    queryKey: ['parcours', offreId],
    queryFn: () => appeler<Parcours[]>('/parcours'),
  })
  const parcours = liste?.find((p) => (p as Parcours & { offre_id?: string }).offre_id === offreId)

  const generer = useMutation({
    mutationFn: () => appeler<Parcours>('/parcours/generer', { methode: 'POST', corps: { offre_id: offreId } }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['parcours'] })
      toast.success(`Parcours créé : ${p.competences.length} compétences à travailler.`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <LoadingState />

  return (
    <div className="card mt-6 bg-base-100 shadow-sm">
      <div className="card-body">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="card-title text-base">🗺️ Parcours d’apprentissage</h2>
            <p className="text-sm text-base-content/60">
              L’annonce est lue pour ce qu’elle exige vraiment : chaque compétence devient un
              bâtiment du Royaume, avec des exercices notés et des révisions espacées.
            </p>
          </div>
          {!parcours && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={generer.isPending}
              onClick={() => generer.mutate()}
            >
              {generer.isPending ? 'Lecture de l’annonce…' : '⚒️ Générer le parcours'}
            </button>
          )}
        </div>

        {!parcours ? (
          <p className="mt-3 text-sm text-base-content/60">
            Aucun parcours pour cette offre. Colle bien le texte <b>complet</b> de l’annonce dans
            les notes avant de générer : sur Indeed et LinkedIn, la description est repliée
            derrière « voir plus », et sans elle le parcours porte sur les mots du titre.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {parcours.pays === 'US' && <span className="badge badge-sm badge-secondary">🇺🇸 poste américain</span>}
              {parcours.salaire && <span className="badge badge-sm badge-ghost">{parcours.salaire}</span>}
              <span className="badge badge-sm badge-ghost">
                {parcours.entretien.length} questions d’entretien
              </span>
            </div>

            {/* Les compétences, et surtout : lesquelles ont une vraie banque. */}
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Compétences exigées par le poste</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {parcours.competences.map((c) => (
                  <span
                    key={c.nom}
                    className={`badge gap-1.5 ${c.couvert ? 'badge-primary' : 'badge-ghost'}`}
                    title={
                      c.couvert
                        ? `${c.nb_exercices} exercices notés`
                        : 'Pas encore de banque dédiée : fiche générique (rôle, limites, coût, panne)'
                    }
                  >
                    {c.nom}
                    <span className="opacity-70">{c.nb_exercices}</span>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-base-content/50">
                Les compétences en gris n’ont pas encore de banque dédiée : elles reçoivent la
                fiche générique. C’est du travail réel, mais moins fin — autant le savoir.
              </p>
            </div>

            {/* La fiche USA : le manque le plus coûteux, et invisible depuis la France. */}
            {parcours.us_check.length > 0 && (
              <div className="mt-5">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setOuvertUS((o) => !o)}
                >
                  <h3 className="text-sm font-semibold">
                    🇺🇸 Prêt pour les USA — {parcours.us_check.length} points
                  </h3>
                  <span className="text-xs text-base-content/50">{ouvertUS ? '▲' : '▼'}</span>
                </button>
                {ouvertUS && (
                  <ul className="mt-2 flex flex-col gap-2">
                    {parcours.us_check.map((u) => (
                      <li key={u.cle} className="rounded-box border border-base-300 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`badge badge-sm ${ETAT_BADGE[u.etat]}`}>{ETAT_MOT[u.etat]}</span>
                          <span className="text-sm font-medium">{u.titre}</span>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-base-content/70">{u.dit}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {parcours.avertissements?.map((a) => (
              <div key={a} className="alert alert-warning mt-4 text-sm">
                <span>{a}</span>
              </div>
            ))}

            <div className="mt-5 flex flex-wrap gap-2">
              {/* Page autonome hors du routage React : une balise <a>. */}
              <a href={`/royaume/?parcours=${parcours.id}`} className="btn btn-primary btn-sm">
                🗺️ Entrer dans le Royaume
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
