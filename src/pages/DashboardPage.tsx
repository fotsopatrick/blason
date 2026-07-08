import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useMyAssignments, useMyGuild } from '@/hooks/queries'
import {
  EmptyState,
  FadeIn,
  LoadingState,
  PageHeader,
  StatCard,
  XPBar,
} from '@/components/ui'
import { ASSIGNMENT_STATUS_LABELS, formatRelative } from '@/lib/format'
import { levelForXp, levelTitle } from '@/lib/levels'
import type { Submission } from '@/lib/types'

const STATUS_BADGE: Record<string, string> = {
  in_progress: 'badge-info',
  submitted: 'badge-warning',
  completed: 'badge-success',
  abandoned: 'badge-ghost',
}

function CompanyDashboard() {
  const { user, profile } = useAuth()

  const { data: myQuests, isLoading } = useQuery({
    queryKey: ['company-quests', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quests')
        .select('*, quest_assignments(id, status)')
        .eq('created_by', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const { data: pending } = useQuery({
    queryKey: ['company-pending-subs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('submissions')
        .select('*, quest_assignments!inner(quest_id, quests!inner(title, created_by))')
        .eq('status', 'pending')
        .eq('quest_assignments.quests.created_by', user!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as (Submission & {
        quest_assignments: { quest_id: string; quests: { title: string } }
      })[]
    },
  })

  if (isLoading) return <LoadingState />

  const totalAccepted = (myQuests ?? []).reduce(
    (n, q) => n + ((q.quest_assignments as { id: string }[] | null)?.length ?? 0),
    0,
  )

  return (
    <div>
      <PageHeader
        title={`Bienvenue, ${profile?.display_name || 'maître de forge'}`}
        subtitle="Vos quêtes attirent les aventuriers. Forgez-en de nouvelles."
        actions={
          <Link to="/app/quests/new" className="btn btn-primary btn-sm">
            ⚒️ Forger une quête
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon="📜" label="Quêtes publiées" value={myQuests?.filter((q) => q.status === 'published').length ?? 0} />
        <StatCard icon="🎯" label="Équipes engagées" value={totalAccepted} />
        <StatCard icon="⏳" label="Soumissions à évaluer" value={pending?.length ?? 0} />
      </div>

      {pending && pending.length > 0 && (
        <FadeIn className="mt-6">
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">⏳ Soumissions en attente</h2>
              <ul className="divide-y divide-base-200">
                {pending.map((sub) => (
                  <li key={sub.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{sub.quest_assignments.quests.title}</div>
                      <div className="text-xs text-base-content/60">
                        soumis {formatRelative(sub.created_at)}
                      </div>
                    </div>
                    <Link
                      to={`/app/quests/${sub.quest_assignments.quest_id}`}
                      className="btn btn-outline btn-sm shrink-0"
                    >
                      Évaluer
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </FadeIn>
      )}

      <FadeIn className="mt-6" delay={0.1}>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-base">📜 Mes quêtes</h2>
            {myQuests && myQuests.length > 0 ? (
              <ul className="divide-y divide-base-200">
                {myQuests.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link to={`/app/quests/${q.id}`} className="link-hover truncate font-medium">
                        {q.title}
                      </Link>
                      <div className="text-xs text-base-content/60">
                        {q.xp_reward} XP · {(q.quest_assignments as unknown[] | null)?.length ?? 0} équipe(s)
                      </div>
                    </div>
                    <span className={`badge badge-sm ${q.status === 'published' ? 'badge-success' : 'badge-ghost'}`}>
                      {q.status === 'published' ? 'Publiée' : q.status === 'draft' ? 'Brouillon' : 'Archivée'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="⚒️"
                title="Aucune quête forgée pour l'instant"
                hint="Créez votre première quête manuellement ou générez-la depuis une offre d'emploi."
                action={<Link to="/app/quests/new" className="btn btn-primary btn-sm">Forger une quête</Link>}
              />
            )}
          </div>
        </div>
      </FadeIn>
    </div>
  )
}

function StudentDashboard() {
  const { profile } = useAuth()
  const { data: membership, isLoading: guildLoading } = useMyGuild()
  const { data: assignments, isLoading } = useMyAssignments()

  if (!profile) return <LoadingState />
  const level = levelForXp(profile.xp)
  const active = (assignments ?? []).filter((a) => a.status === 'in_progress' || a.status === 'submitted')
  const completed = (assignments ?? []).filter((a) => a.status === 'completed')

  return (
    <div>
      <PageHeader
        title={`Salut, ${profile.display_name || profile.username} 👋`}
        subtitle={`${levelTitle(level)} de niveau ${level} — la forge résonne de nouvelles quêtes.`}
      />

      <FadeIn>
        <div className="card bg-gradient-to-r from-primary to-primary/80 text-primary-content shadow-md">
          <div className="card-body flex-row items-center gap-6 py-5">
            <div className="text-5xl">⚔️</div>
            <div className="flex-1">
              <div className="text-sm opacity-80">Progression du héros</div>
              <div className="mb-2 text-2xl font-bold">{profile.xp} XP au total</div>
              <div className="[&_*]:!text-primary-content">
                <XPBar xp={profile.xp} compact />
              </div>
            </div>
          </div>
        </div>
      </FadeIn>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon="🎯" label="Quêtes en cours" value={active.length} />
        <StatCard icon="✅" label="Quêtes complétées" value={completed.length} />
        <StatCard
          icon="🛡️"
          label="Guilde"
          value={guildLoading ? '…' : membership ? membership.guilds.name : 'Aucune'}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <FadeIn delay={0.05}>
          <div className="card h-full bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">🎯 Mes quêtes actives</h2>
              {isLoading ? (
                <LoadingState />
              ) : active.length > 0 ? (
                <ul className="divide-y divide-base-200">
                  {active.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link to={`/app/workspace/${a.id}`} className="link-hover truncate font-medium">
                          {a.quests?.title}
                        </Link>
                        <div className="text-xs text-base-content/60">
                          {a.guild_id ? '🛡️ Quête de guilde' : '👤 Solo'} · acceptée {formatRelative(a.accepted_at)}
                        </div>
                      </div>
                      <span className={`badge badge-sm shrink-0 ${STATUS_BADGE[a.status]}`}>
                        {ASSIGNMENT_STATUS_LABELS[a.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="🗺️"
                  title="Aucune quête en cours"
                  hint="Parcours le tableau des quêtes et choisis ta prochaine aventure."
                  action={<Link to="/app/quests" className="btn btn-primary btn-sm">Parcourir les quêtes</Link>}
                />
              )}
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="card h-full bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">🛡️ Ma guilde</h2>
              {guildLoading ? (
                <LoadingState />
              ) : membership ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="text-4xl">{membership.guilds.emblem}</div>
                    <div>
                      <div className="font-bold">{membership.guilds.name}</div>
                      <div className="text-sm italic text-base-content/60">
                        « {membership.guilds.motto} »
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-base-content/70">
                    {membership.guilds.xp} XP de guilde
                  </div>
                  <Link to={`/app/guilds/${membership.guild_id}`} className="btn btn-outline btn-sm w-fit">
                    Ouvrir le hall de guilde
                  </Link>
                </div>
              ) : (
                <EmptyState
                  icon="🛡️"
                  title="Tu n'as pas encore de guilde"
                  hint="Rejoins une guilde existante ou fonde la tienne (3 à 6 membres)."
                  action={<Link to="/app/guilds" className="btn btn-primary btn-sm">Trouver une guilde</Link>}
                />
              )}
            </div>
          </div>
        </FadeIn>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { profile } = useAuth()
  if (!profile) return <LoadingState />
  return profile.role === 'company' ? <CompanyDashboard /> : <StudentDashboard />
}
