import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useMyGuild } from '@/hooks/queries'
import { EmptyState, ErrorState, FadeIn, LoadingState, PageHeader } from '@/components/ui'
import type { Guild } from '@/lib/types'

const EMBLEMS = ['🛡️', '🐉', '⚒️', '🦅', '🐺', '🔥', '🌙', '⚡', '🏹', '🗡️']

type GuildWithCount = Guild & { guild_members: { count: number }[] }

export default function GuildsPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: membership } = useMyGuild()

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [emblem, setEmblem] = useState('🛡️')
  const [motto, setMotto] = useState('')
  const [description, setDescription] = useState('')
  const [maxMembers, setMaxMembers] = useState(6)

  const { data: guilds, isLoading, isError, refetch } = useQuery({
    queryKey: ['guilds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guilds')
        .select('*, guild_members(count)')
        .order('xp', { ascending: false })
      if (error) throw error
      return (data ?? []) as GuildWithCount[]
    },
  })

  const joinMutation = useMutation({
    mutationFn: async (guildId: string) => {
      const { error } = await supabase.rpc('join_guild', { p_guild_id: guildId })
      if (error) throw error
      return guildId
    },
    onSuccess: (guildId) => {
      void queryClient.invalidateQueries({ queryKey: ['my-guild'] })
      void queryClient.invalidateQueries({ queryKey: ['guilds'] })
      toast.success('Bienvenue dans ta nouvelle guilde ! 🛡️')
      navigate(`/app/guilds/${guildId}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_guild', {
        p_name: name.trim(),
        p_emblem: emblem,
        p_motto: motto.trim(),
        p_description: description.trim(),
        p_max_members: maxMembers,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (guildId) => {
      void queryClient.invalidateQueries({ queryKey: ['my-guild'] })
      void queryClient.invalidateQueries({ queryKey: ['guilds'] })
      toast.success('Guilde fondée ! Que la forge résonne 🔥')
      navigate(`/app/guilds/${guildId}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleCreate = (e: FormEvent) => {
    e.preventDefault()
    createMutation.mutate()
  }

  const isStudent = profile?.role === 'student'
  const canJoin = isStudent && !membership

  return (
    <div>
      <PageHeader
        title="Guildes"
        subtitle="Les aventuriers solitaires vont vite ; les guildes vont loin."
        actions={
          canJoin ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              🏰 Fonder une guilde
            </button>
          ) : undefined
        }
      />

      {membership && (
        <div className="alert mb-6 border-primary/30 bg-primary/10">
          <span>
            Tu es membre de <strong>{membership.guilds.name}</strong>.{' '}
            <Link to={`/app/guilds/${membership.guild_id}`} className="link link-primary">
              Ouvrir le hall →
            </Link>
          </span>
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Convocation des guildes…" />
      ) : isError ? (
        <ErrorState message="Impossible de charger les guildes." onRetry={() => void refetch()} />
      ) : guilds && guilds.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guilds.map((guild, i) => {
            const memberCount = guild.guild_members[0]?.count ?? 0
            const full = memberCount >= guild.max_members
            return (
              <FadeIn key={guild.id} delay={i * 0.04}>
                <div className="card h-full bg-base-100 shadow-sm transition-shadow hover:shadow-md">
                  <div className="card-body">
                    <div className="flex items-start justify-between">
                      <div className="text-4xl">{guild.emblem}</div>
                      <span className={`badge badge-sm ${full ? 'badge-ghost' : 'badge-success'}`}>
                        {memberCount}/{guild.max_members} membres
                      </span>
                    </div>
                    <h2 className="card-title text-base">{guild.name}</h2>
                    {guild.motto && (
                      <p className="text-sm italic text-base-content/60">« {guild.motto} »</p>
                    )}
                    <p className="line-clamp-2 text-sm text-base-content/70">{guild.description}</p>
                    <div className="mt-1 text-sm font-semibold text-accent-content/80">
                      <span className="badge badge-accent badge-sm">{guild.xp} XP</span>
                    </div>
                    <div className="card-actions mt-2 justify-end">
                      <Link to={`/app/guilds/${guild.id}`} className="btn btn-ghost btn-sm">
                        Voir
                      </Link>
                      {canJoin && !full && (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={joinMutation.isPending}
                          onClick={() => joinMutation.mutate(guild.id)}
                        >
                          Rejoindre
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </FadeIn>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon="🏰"
          title="Aucune guilde pour l'instant"
          hint="Sois pionnier·ère : fonde la première guilde de la forge."
          action={
            canJoin ? (
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                Fonder une guilde
              </button>
            ) : undefined
          }
        />
      )}

      {/* Modal de création */}
      <dialog className={`modal ${showCreate ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-display text-lg font-bold">🏰 Fonder une guilde</h3>
          <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-3">
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Nom de la guilde</span>
              <input
                className="input input-bordered w-full"
                required
                minLength={3}
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Les Forgerons du Code"
              />
            </label>
            <div>
              <span className="label-text mb-1 block text-sm">Emblème</span>
              <div className="flex flex-wrap gap-1">
                {EMBLEMS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={`btn btn-square btn-sm text-lg ${emblem === e ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setEmblem(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Devise</span>
              <input
                className="input input-bordered w-full"
                maxLength={80}
                value={motto}
                onChange={(e) => setMotto(e.target.value)}
                placeholder="Le code est notre enclume"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Description</span>
              <textarea
                className="textarea textarea-bordered w-full"
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Qui cherchez-vous, que construisez-vous ?"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Taille max ({maxMembers} membres)</span>
              <input
                type="range"
                min={3}
                max={6}
                className="range range-primary"
                value={maxMembers}
                onChange={(e) => setMaxMembers(Number(e.target.value))}
              />
            </label>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>
                Annuler
              </button>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  'Fonder ⚒️'
                )}
              </button>
            </div>
          </form>
        </div>
        <button
          className="modal-backdrop"
          type="button"
          onClick={() => setShowCreate(false)}
          aria-label="Fermer"
        />
      </dialog>
    </div>
  )
}
