import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import GoogleButton from './GoogleButton'

export default function LoginPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/app'
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect.'
          : error.message,
      )
      return
    }
    navigate((location.state as { from?: string } | null)?.from ?? '/app', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 p-4">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body">
          <Link to="/" className="mb-2 flex items-center justify-center gap-2">
            <span className="text-3xl">⚔️</span>
            <span className="font-display text-2xl font-bold">QuestForge</span>
          </Link>
          <h1 className="text-center text-lg font-semibold">La forge t’attend, aventurier·ère</h1>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <label className="form-control w-full">
              <span className="label-text mb-1 text-sm">Email</span>
              <input
                type="email"
                required
                className="input input-bordered w-full"
                placeholder="toi@exemple.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text mb-1 text-sm">Mot de passe</span>
              <input
                type="password"
                required
                className="input input-bordered w-full"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error && (
              <div className="alert alert-error py-2 text-sm">
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? <span className="loading loading-spinner loading-sm" /> : '🗝️ Entrer dans la forge'}
            </button>
          </form>

          <div className="divider text-xs">ou</div>
          <GoogleButton label="Continuer avec Google" />

          <p className="mt-3 text-center text-sm text-base-content/60">
            Pas encore de compte ?{' '}
            <Link to="/register" className="link link-primary">
              Rejoindre la forge
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
