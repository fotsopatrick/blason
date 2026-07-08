import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  UserAvatar,
} from '@/components/ui'
import { ASSIGNMENT_STATUS_LABELS, formatRelative } from '@/lib/format'
import { levelForXp } from '@/lib/levels'
import type { Guild, GuildMember, GuildMessage, Profile, QuestAssignment } from '@/lib/types'

function GuildChat({ guildId, members }: { guildId: string; members: (GuildMember & { profiles: Profile })[] }) {
  const { user } = useAuth()
  const toast = useToast()
  const [messages, setMessages] = useState<GuildMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>()
    for (const m of members) map.set(m.user_id, m.profiles)
    return map
  }, [members])

  useEffect(() => {
    let active = true

    const load = async () => {
      const { data } = await supabase
        .from('guild_messages')
        .select('*')
        .eq('guild_id', guildId)
        .order('created_at', { ascending: true })
        .limit(100)
      if (active) {
        setMessages((data ?? []) as GuildMessage[])
        setLoading(false)
      }
    }
    void load()

    // Realtime : nouveaux messages de la guilde.
    const channel = supabase
      .channel(`guild-chat-${guildId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guild_messages', filter: `guild_id=eq.${guildId}` },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === (payload.new as GuildMessage).id)
              ? prev
              : [...prev, payload.new as GuildMessage],
          )
        },
      )
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [guildId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if (!content || !user) return
    setSending(true)
    const { error } = await supabase
      .from('guild_messages')
      .insert({ guild_id: guildId, user_id: user.id, content })
    setSending(false)
    if (error) {
      toast.error(`Message non envoyé : ${error.message}`)
      return
    }
    setText('')
  }

  return (
    <div className="flex h-96 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto rounded-box bg-base-200 p-3">
        {loading ? (
          <LoadingState label="Chargement du chat…" />
        ) : messages.length === 0 ? (
          <EmptyState icon="💬" title="Le hall est silencieux" hint="Lance la conversation !" />
        ) : (
          messages.map((msg) => {
            const author = profileById.get(msg.user_id)
            const mine = msg.user_id === user?.id
            return (
              <div key={msg.id} className={`chat ${mine ? 'chat-end' : 'chat-start'}`}>
                <div className="chat-image">
                  <UserAvatar
                    url={author?.avatar_url}
                    name={author?.display_name || author?.username || '?'}
                    size="sm"
                  />
                </div>
                <div className="chat-header text-xs text-base-content/60">
                  {author?.display_name || author?.username || 'Ancien membre'}
                  <time className="ml-1 opacity-60">{formatRelative(msg.created_at)}</time>
                </div>
                <div className={`chat-bubble ${mine ? 'chat-bubble-primary' : ''} whitespace-pre-wrap break-words text-sm`}>
                  {msg.content}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="mt-3 flex gap-2">
        <input
          className="input input-bordered flex-1"
          placeholder="Écris à ta guilde…"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}>
          {sending ? <span className="loading loading-spinner loading-sm" /> : 'Envoyer'}
        </button>
      </form>
    </div>
  )
}

export default function GuildDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['guild', id],
    enabled: !!id,
    queryFn: async () => {
      const [guildRes, membersRes, assignmentsRes] = await Promise.all([
        supabase.from('guilds').select('*').eq('id', id!).maybeSingle(),
        supabase
          .from('guild_members')
          .select('*, profiles(*)')
          .eq('guild_id', id!)
          .order('joined_at', { ascending: true }),
        supabase
          .from('quest_assignments')
          .select('*, quests(id, title, xp_reward, difficulty)')
          .eq('guild_id', id!)
          .order('accepted_at', { ascending: false }),
      ])
      if (guildRes.error) throw guildRes.error
      if (membersRes.error) throw membersRes.error
      return {
        guild: guildRes.data as Guild | null,
        members: (membersRes.data ?? []) as (GuildMember & { profiles: Profile })[],
        assignments: (assignmentsRes.data ?? []) as QuestAssignment[],
      }
    },
  })

  const joinMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('join_guild', { p_guild_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['guild', id] })
      void queryClient.invalidateQueries({ queryKey: ['my-guild'] })
      toast.success('Bienvenue dans la guilde ! 🛡️')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const leaveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('leave_guild')
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries()
      toast.info('Tu as quitté la guilde.')
      navigate('/app/guilds')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <LoadingState label="Ouverture du hall de guilde…" />
  if (isError || !data?.guild) {
    return <ErrorState message="Guilde introuvable ou inaccessible." onRetry={() => void refetch()} />
  }

  const { guild, members, assignments } = data
  const isMember = members.some((m) => m.user_id === user?.id)
  const canJoin =
    profile?.role === 'student' && !isMember && members.length < guild.max_members
  const completedCount = assignments.filter((a) => a.status === 'completed').length

  return (
    <div>
      <PageHeader
        title={`${guild.emblem} ${guild.name}`}
        subtitle={guild.motto ? `« ${guild.motto} »` : undefined}
        actions={
          <>
            {canJoin && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
              >
                Rejoindre la guilde
              </button>
            )}
            {isMember && (
              <button
                className="btn btn-outline btn-error btn-sm"
                onClick={() => {
                  if (confirm('Quitter la guilde ?')) leaveMutation.mutate()
                }}
                disabled={leaveMutation.isPending}
              >
                Quitter
              </button>
            )}
          </>
        }
      />

      {guild.description && (
        <p className="mb-6 max-w-2xl text-sm text-base-content/70">{guild.description}</p>
      )}

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="badge badge-accent">{guild.xp} XP de guilde</div>
        <div className="badge badge-ghost">
          {members.length}/{guild.max_members} membres
        </div>
        <div className="badge badge-ghost">{completedCount} quête(s) complétée(s)</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {/* Membres */}
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">👥 Membres</h2>
              <ul className="divide-y divide-base-200">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 py-2.5">
                    <UserAvatar
                      url={m.profiles.avatar_url}
                      name={m.profiles.display_name || m.profiles.username}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <Link to={`/u/${m.profiles.username}`} className="link-hover truncate text-sm font-medium">
                        {m.profiles.display_name || m.profiles.username}
                      </Link>
                      <div className="text-xs text-base-content/60">
                        Nv. {levelForXp(m.profiles.xp)} · {m.profiles.xp} XP
                      </div>
                    </div>
                    {m.role === 'leader' && <span className="badge badge-accent badge-sm">👑 Leader</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Quêtes de guilde */}
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">📜 Quêtes de la guilde</h2>
              {assignments.length > 0 ? (
                <ul className="divide-y divide-base-200">
                  {assignments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                      <Link
                        to={isMember ? `/app/workspace/${a.id}` : `/app/quests/${a.quest_id}`}
                        className="link-hover min-w-0 truncate text-sm font-medium"
                      >
                        {a.quests?.title}
                      </Link>
                      <span className="badge badge-ghost badge-sm shrink-0">
                        {ASSIGNMENT_STATUS_LABELS[a.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="🗺️"
                  title="Aucune quête acceptée"
                  hint="Le leader peut accepter une quête au nom de la guilde depuis la page d'une quête."
                />
              )}
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-base">💬 Hall de guilde</h2>
            {isMember ? (
              <GuildChat guildId={guild.id} members={members} />
            ) : (
              <EmptyState
                icon="🔒"
                title="Réservé aux membres"
                hint="Rejoins la guilde pour accéder au chat."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
