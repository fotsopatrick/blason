import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type { Guild, GuildMember, QuestAssignment } from '@/lib/types'

/** Guilde de l'utilisateur courant (null si aucune). */
export function useMyGuild() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-guild', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await api
        .from('guild_members')
        .select('*, guilds(*)')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data as (GuildMember & { guilds: Guild }) | null
    },
  })
}

/** Assignments visibles pour moi : solo + ceux de ma guilde. */
export function useMyAssignments() {
  const { user } = useAuth()
  const { data: membership } = useMyGuild()
  const guildId = membership?.guild_id
  return useQuery({
    queryKey: ['my-assignments', user?.id, guildId ?? 'none'],
    enabled: !!user,
    queryFn: async () => {
      const orFilter = guildId
        ? `user_id.eq.${user!.id},guild_id.eq.${guildId}`
        : `user_id.eq.${user!.id}`
      const { data, error } = await api
        .from('quest_assignments')
        .select('*, quests(*), guilds(*)')
        .or(orFilter)
        .order('accepted_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as QuestAssignment[]
    },
  })
}
