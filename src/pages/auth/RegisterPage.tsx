import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import GoogleButton from './GoogleButton'

export default function RegisterPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accountType, setAccountType] = useState<'student' | 'company'>('student')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/app" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setError('Le pseudo doit faire 3-24 caractères : minuscules, chiffres et _ uniquement.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: displayName,
          role: accountType,
        },
      },
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/app', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 p-4">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body">
          <Link to="/" className="mb-2 flex items-center justify-center gap-2">
            <span className="text-3xl">⚔️</span>
            <span className="font-display text-2xl font-bold">Blason</span>
          </Link>
          <h1 className="text-center text-lg font-semibold">Forge ton personnage</h1>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <div className="join w-full">
              <button
                type="button"
                className={`btn join-item flex-1 ${accountType === 'student' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setAccountType('student')}
              >
                🎓 Étudiant·e
              </button>
              <button
                type="button"
                className={`btn join-item flex-1 ${accountType === 'company' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setAccountType('company')}
              >
                🏢 Entreprise / École
              </button>
            </div>

            <label className="form-control w-full">
              <span className="label-text mb-1 text-sm">
                {accountType === 'company' ? 'Nom de l’organisation' : 'Nom affiché'}
              </span>
              <input
                type="text"
                required
                className="input input-bordered w-full"
                placeholder={accountType === 'company' ? 'TechNova Labs' : 'Aria Moreau'}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text mb-1 text-sm">Pseudo (public)</span>
              <input
                type="text"
                required
                className="input input-bordered w-full"
                placeholder="aria_dev"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
            </label>
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
              <span className="label-text mb-1 text-sm">Mot de passe (8+ caractères)</span>
              <input
                type="password"
                required
                minLength={8}
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
              {submitting ? <span className="loading loading-spinner loading-sm" /> : '⚒️ Créer mon compte'}
            </button>
          </form>

          <div className="divider text-xs">ou</div>
          <GoogleButton label="S’inscrire avec Google" />

          <p className="mt-3 text-center text-sm text-base-content/60">
            Déjà membre ?{' '}
            <Link to="/login" className="link link-primary">
              Connexion
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
