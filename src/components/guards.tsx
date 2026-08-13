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

/**
 * Le garde inverse de RequireAuth (13/08/2026).
 *
 * `/login` et `/register` étaient des routes publiques nues : un utilisateur
 * déjà connecté y accédait, voyait le formulaire, et pouvait se reconnecter
 * par-dessus sa propre session. Ce n'est pas qu'inesthétique — un visiteur
 * qui tombe sur un écran de connexion alors qu'il est connecté croit que sa
 * session a sauté, et ressaisit ses identifiants pour rien.
 *
 * On le renvoie donc là d'où il venait (`state.from`, posé par RequireAuth
 * quand il intercepte une URL protégée), ou à défaut vers l'application.
 */
export function RedirigeSiConnecte({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  // Tant qu'on ne SAIT pas s'il y a une session, on n'affiche rien : montrer
  // le formulaire puis le faire disparaître donnerait un clignotement, et
  // laisserait le temps de commencer à taper.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Ouverture de la forge…" />
      </div>
    )
  }
  if (session) {
    const from = (location.state as { from?: string } | null)?.from
    // On ne renvoie vers `from` que s'il s'agit d'un chemin interne : une
    // valeur venue de l'historique ne doit jamais pouvoir rediriger ailleurs.
    const cible = from && from.startsWith('/') && !from.startsWith('//') ? from : '/app'
    return <Navigate to={cible} replace />
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
