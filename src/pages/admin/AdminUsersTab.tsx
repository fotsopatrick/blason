import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { EmptyState, ErrorState, LoadingState, UserAvatar } from '@/components/ui'
import { levelForXp } from '@/lib/levels'
import type { Profile, UserRole } from '@/lib/types'

export default function AdminUsersTab() {
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await api
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Profile[]
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Profile> }) => {
      const { error } = await api.from('profiles').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('Utilisateur mis à jour.')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) {
    return <ErrorState message="Impossible de charger les utilisateurs." onRetry={() => void refetch()} />
  }

  const filtered = data.filter((u) => {
    if (!search) return true
    const h = `${u.username} ${u.display_name}`.toLowerCase()
    return h.includes(search.toLowerCase())
  })

  return (
    <div>
      <input
        className="input input-bordered input-sm mb-4 w-full sm:w-72"
        placeholder="🔍 Rechercher un utilisateur…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <EmptyState icon="👥" title="Aucun utilisateur" />
      ) : (
        <div className="card bg-base-100 shadow-sm">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th>Niveau / XP</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.id === user?.id
                  return (
                    <tr key={u.id} className="hover">
                      <td>
                        <div className="flex items-center gap-2">
                          <UserAvatar url={u.avatar_url} name={u.display_name || u.username} size="sm" />
                          <div className="min-w-0">
                            <Link to={`/u/${u.username}`} className="link-hover block truncate font-medium">
                              {u.display_name || u.username}
                            </Link>
                            <div className="text-xs text-base-content/50">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          className="select select-bordered select-xs"
                          value={u.role}
                          disabled={isSelf || updateMutation.isPending}
                          onChange={(e) =>
                            updateMutation.mutate({ id: u.id, patch: { role: e.target.value as UserRole } })
                          }
                        >
                          <option value="student">student</option>
                          <option value="company">company</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap text-sm">
                        Nv. {levelForXp(u.xp)} · {u.xp} XP
                      </td>
                      <td>
                        {u.is_banned ? (
                          <span className="badge badge-error badge-sm">Banni</span>
                        ) : (
                          <span className="badge badge-success badge-sm">Actif</span>
                        )}
                      </td>
                      <td>
                        {!isSelf && (
                          <button
                            className={`btn btn-xs ${u.is_banned ? 'btn-success' : 'btn-outline btn-error'}`}
                            disabled={updateMutation.isPending}
                            onClick={() =>
                              updateMutation.mutate({ id: u.id, patch: { is_banned: !u.is_banned } })
                            }
                          >
                            {u.is_banned ? 'Réactiver' : 'Bannir'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
