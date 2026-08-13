import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import QuestCard from '@/components/QuestCard'
import { EmptyState, ErrorState, FadeIn, LoadingState, PageHeader } from '@/components/ui'
import { DIFFICULTY_LABELS } from '@/lib/format'
import type { Quest, QuestDifficulty } from '@/lib/types'

const XP_RANGES = [
  { label: 'Tous les XP', min: 0, max: Infinity },
  { label: '< 200 XP', min: 0, max: 199 },
  { label: '200 – 400 XP', min: 200, max: 400 },
  { label: '> 400 XP', min: 401, max: Infinity },
]

export default function QuestsPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState<QuestDifficulty | 'all'>('all')
  const [skill, setSkill] = useState<string>('all')
  const [xpRange, setXpRange] = useState(0)
  // « les quetes se melangent » : une quete forgee depuis une offre
  // d'emploi et un parcours libre n'ont rien a voir. On les separe.
  const [origine, setOrigine] = useState<string>('all')

  const { data: quests, isLoading, isError, refetch } = useQuery({
    queryKey: ['quests', 'published'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quests')
        .select('*, profiles!quests_created_by_fkey(username, display_name, avatar_url)')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Quest[]
    },
  })

  // Les offres, pour donner un NOM lisible a chaque origine plutot
  // qu'un identifiant. Une liste de UUID ne se filtre pas a l'oeil.
  const { data: offres } = useQuery({
    queryKey: ['offres', 'pour-filtre'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offres')
        .select('id, titre, entreprise')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as { id: string; titre: string; entreprise: string }[]
    },
  })

  // On ne propose que les offres qui ont VRAIMENT une quete publiee :
  // un filtre qui ne rend jamais rien est un filtre qui trompe.
  const origines = useMemo(() => {
    const avecQuete = new Set((quests ?? []).map((q) => q.offre_id).filter(Boolean))
    return (offres ?? []).filter((o) => avecQuete.has(o.id))
  }, [offres, quests])

  const nbSansOffre = useMemo(
    () => (quests ?? []).filter((q) => !q.offre_id).length,
    [quests],
  )

  const allSkills = useMemo(() => {
    const set = new Set<string>()
    for (const q of quests ?? []) for (const s of q.skills) set.add(s)
    return [...set].sort()
  }, [quests])

  const filtered = useMemo(() => {
    const range = XP_RANGES[xpRange]
    return (quests ?? []).filter((q) => {
      if (difficulty !== 'all' && q.difficulty !== difficulty) return false
      // Separer les deux familles : forgee depuis une offre, ou parcours libre.
      if (origine === 'libre' && q.offre_id) return false
      if (origine !== 'all' && origine !== 'libre' && q.offre_id !== origine) return false
      if (skill !== 'all' && !q.skills.includes(skill)) return false
      if (q.xp_reward < range.min || q.xp_reward > range.max) return false
      if (search) {
        const haystack = `${q.title} ${q.description} ${q.skills.join(' ')}`.toLowerCase()
        if (!haystack.includes(search.toLowerCase())) return false
      }
      return true
    })
  }, [quests, difficulty, skill, xpRange, search, origine])

  return (
    <div>
      <PageHeader
        title="Tableau des quêtes"
        subtitle="Chaque quête est un projet concret, forgé depuis les besoins réels du marché."
        actions={
          profile?.role === 'company' || profile?.role === 'admin' ? (
            <Link to="/app/quests/new" className="btn btn-primary btn-sm">
              ⚒️ Forger une quête
            </Link>
          ) : undefined
        }
      />

      {/* Filtres */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <input
          className="input input-bordered input-sm w-full sm:w-56"
          placeholder="🔍 Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
          <select
            className="select select-bordered select-sm"
            value={origine}
            onChange={(e) => setOrigine(e.target.value)}
            title="Separe les quetes forgees depuis une offre des parcours libres"
          >
            <option value="all">Toutes origines</option>
            {nbSansOffre > 0 && (
              <option value="libre">Parcours libres ({nbSansOffre})</option>
            )}
            {origines.map((o) => (
              <option key={o.id} value={o.id}>
                {o.entreprise ? o.entreprise + ' — ' : ''}
                {o.titre.length > 42 ? o.titre.slice(0, 41) + '…' : o.titre}
              </option>
            ))}
          </select>
        <select
          className="select select-bordered select-sm"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as QuestDifficulty | 'all')}
        >
          <option value="all">Toutes difficultés</option>
          {(Object.keys(DIFFICULTY_LABELS) as QuestDifficulty[]).map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm"
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
        >
          <option value="all">Toutes compétences</option>
          {allSkills.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm"
          value={xpRange}
          onChange={(e) => setXpRange(Number(e.target.value))}
        >
          {XP_RANGES.map((r, i) => (
            <option key={r.label} value={i}>
              {r.label}
            </option>
          ))}
        </select>
        {(search || difficulty !== 'all' || skill !== 'all' || xpRange !== 0 || origine !== 'all') && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('')
              setDifficulty('all')
              setSkill('all')
              setXpRange(0)
            }}
          >
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingState label="Déroulement des parchemins…" />
      ) : isError ? (
        <ErrorState message="Impossible de charger les quêtes." onRetry={() => void refetch()} />
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((quest, i) => (
            <FadeIn key={quest.id} delay={Math.min(i * 0.04, 0.3)}>
              <QuestCard quest={quest} />
            </FadeIn>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="📜"
          title="Aucune quête ne correspond"
          hint="Essaie d'élargir tes filtres, ou reviens plus tard : la forge ne dort jamais."
        />
      )}
    </div>
  )
}
