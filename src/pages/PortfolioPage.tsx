import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  DifficultyBadge,
  ErrorState,
  FadeIn,
  LoadingState,
  SkillTags,
  StatCard,
  UserAvatar,
  XPBar,
} from '@/components/ui'
import { formatDate } from '@/lib/format'
import { levelForXp, levelTitle } from '@/lib/levels'
import type { Guild, GuildMember, Profile, QuestAssignment, Submission } from '@/lib/types'

// Portfolio public : accessible sans authentification via /u/:username.
export default function PortfolioPage() {
  const { username } = useParams<{ username: string }>()
  const { session } = useAuth()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['portfolio', username],
    enabled: !!username,
    queryFn: async () => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username!)
        .maybeSingle()
      if (error) throw error
      if (!profile) return null

      const [assignmentsRes, membershipRes] = await Promise.all([
        supabase
          .from('quest_assignments')
          .select('*, quests(*), submissions(github_url, status, created_at)')
          .eq('status', 'completed')
          .or(`user_id.eq.${profile.id},accepted_by.eq.${profile.id}`)
          .order('completed_at', { ascending: false }),
        supabase
          .from('guild_members')
          .select('*, guilds(*)')
          .eq('user_id', profile.id)
          .maybeSingle(),
      ])

      return {
        profile: profile as Profile,
        completed: (assignmentsRes.data ?? []) as (QuestAssignment & {
          submissions: Pick<Submission, 'github_url' | 'status' | 'created_at'>[]
        })[],
        membership: membershipRes.data as (GuildMember & { guilds: Guild }) | null,
      }
    },
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200">
        <LoadingState label="Déploiement du blason…" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200">
        <ErrorState
          message={isError ? 'Erreur de chargement du portfolio.' : 'Aventurier·ère introuvable.'}
          onRetry={isError ? () => void refetch() : undefined}
        />
      </div>
    )
  }

  const { profile, completed, membership } = data
  const level = levelForXp(profile.xp)
  const provenSkills = [...new Set(completed.flatMap((a) => a.quests?.skills ?? []))]
  const githubLinks = completed
    .flatMap((a) => a.submissions.filter((s) => s.status === 'approved' && s.github_url))
    .map((s) => s.github_url)

  return (
    <div className="min-h-screen bg-base-200">
      <header className="navbar mx-auto max-w-4xl">
        <div className="flex-1">
          <Link to="/" className="flex items-center gap-2 px-2">
            <span className="text-2xl">⚔️</span>
            <span className="font-display text-lg font-bold">Blason</span>
          </Link>
        </div>
        <Link to={session ? '/app' : '/register'} className="btn btn-primary btn-sm">
          {session ? 'Mon tableau de bord' : 'Rejoindre la forge'}
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-16">
        {/* En-tête héros */}
        <FadeIn>
          <div className="card bg-base-100 shadow-md">
            <div className="card-body items-center gap-4 text-center sm:flex-row sm:text-left">
              <UserAvatar
                url={profile.avatar_url}
                name={profile.display_name || profile.username}
                size="xl"
              />
              <div className="flex-1">
                <h1 className="font-display text-2xl font-bold">
                  {profile.display_name || profile.username}
                </h1>
                <p className="text-sm text-base-content/60">@{profile.username}</p>
                {profile.career_goal && (
                  <p className="mt-1 text-sm font-medium text-secondary">🎯 {profile.career_goal}</p>
                )}
                {profile.bio && <p className="mt-2 text-sm text-base-content/70">{profile.bio}</p>}
                {membership && (
                  <div className="mt-2 badge badge-outline gap-1">
                    {membership.guilds.emblem} {membership.guilds.name}
                  </div>
                )}
              </div>
              <div className="w-full sm:w-56">
                <div className="mb-1 text-center">
                  <span className="badge badge-accent font-semibold">
                    Nv. {level} · {levelTitle(level)}
                  </span>
                </div>
                <XPBar xp={profile.xp} compact />
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Stats */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatCard icon="⚡" label="XP total" value={profile.xp} />
          <StatCard icon="✅" label="Quêtes complétées" value={completed.length} />
          <StatCard icon="🧭" label="Membre depuis" value={formatDate(profile.created_at)} />
        </div>

        {/* Compétences prouvées */}
        <FadeIn delay={0.05} className="mt-6">
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">🎖️ Compétences prouvées par des quêtes</h2>
              {provenSkills.length > 0 ? (
                <SkillTags skills={provenSkills} />
              ) : (
                <p className="text-sm text-base-content/60">
                  Aucune quête validée pour l'instant — les compétences prouvées apparaîtront ici.
                </p>
              )}
              {profile.skills.length > 0 && (
                <>
                  <h3 className="mt-3 text-sm font-medium text-base-content/70">
                    Compétences déclarées
                  </h3>
                  <SkillTags skills={profile.skills} />
                </>
              )}
            </div>
          </div>
        </FadeIn>

        {/* Quêtes complétées */}
        <FadeIn delay={0.1} className="mt-6">
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">📜 Quêtes accomplies</h2>
              {completed.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {completed.map((a) => (
                    <li key={a.id} className="rounded-box border border-base-300 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{a.quests?.title}</span>
                        {a.quests && <DifficultyBadge difficulty={a.quests.difficulty} />}
                        <span className="badge badge-accent badge-sm">⚡ {a.quests?.xp_reward} XP</span>
                        {a.guild_id && <span className="badge badge-ghost badge-sm">🛡️ en guilde</span>}
                      </div>
                      {a.quests && (
                        <div className="mt-2">
                          <SkillTags skills={a.quests.skills} max={6} />
                        </div>
                      )}
                      {a.submissions
                        .filter((s) => s.status === 'approved' && s.github_url)
                        .map((s) => (
                          <a
                            key={s.github_url}
                            href={s.github_url}
                            target="_blank"
                            rel="noreferrer"
                            className="link link-primary mt-2 block truncate text-sm"
                          >
                            🔗 {s.github_url}
                          </a>
                        ))}
                      {a.completed_at && (
                        <div className="mt-1 text-xs text-base-content/50">
                          Validée le {formatDate(a.completed_at)}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-base-content/60">
                  Le journal d'exploits est encore vierge.
                </p>
              )}
            </div>
          </div>
        </FadeIn>

        {/* Projets GitHub */}
        {githubLinks.length > 0 && (
          <FadeIn delay={0.15} className="mt-6">
            <div className="card bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-base">💻 Projets livrés</h2>
                <ul className="flex flex-col gap-1">
                  {[...new Set(githubLinks)].map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noreferrer" className="link link-secondary text-sm">
                        → {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeIn>
        )}
      </main>
    </div>
  )
}
