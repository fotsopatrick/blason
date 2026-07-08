import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingState } from '@/components/ui'
import type { UserRole } from '@/lib/types'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Ouverture de la forge…" />
      </div>
    )
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return <>{children}</>
}

export function RequireRole({
  roles,
  children,
}: {
  roles: UserRole[]
  children: ReactNode
}) {
  const { profile, loading } = useAuth()

  if (loading || (!profile && loading)) {
    return <LoadingState />
  }
  if (!profile || !roles.includes(profile.role)) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <div className="text-5xl">🔒</div>
        <p className="font-semibold">Accès réservé</p>
        <p className="text-sm text-base-content/60">
          Cette zone requiert le rôle : {roles.join(' ou ')}.
        </p>
      </div>
    )
  }
  return <>{children}</>
}
