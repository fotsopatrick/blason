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

  const allSkills = useMemo(() => {
    const set = new Set<string>()
    for (const q of quests ?? []) for (const s of q.skills) set.add(s)
    return [...set].sort()
  }, [quests])

  const filtered = useMemo(() => {
    const range = XP_RANGES[xpRange]
    return (quests ?? []).filter((q) => {
      if (difficulty !== 'all' && q.difficulty !== difficulty) return false
      if (skill !== 'all' && !q.skills.includes(skill)) return false
      if (q.xp_reward < range.min || q.xp_reward > range.max) return false
      if (search) {
        const haystack = `${q.title} ${q.description} ${q.skills.join(' ')}`.toLowerCase()
        if (!haystack.includes(search.toLowerCase())) return false
      }
      return true
    })
  }, [quests, difficulty, skill, xpRange, search])

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
        {(search || difficulty !== 'all' || skill !== 'all' || xpRange !== 0) && (
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
