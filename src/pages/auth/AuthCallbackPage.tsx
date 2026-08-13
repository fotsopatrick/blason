import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '@/lib/api'
import { LoadingState } from '@/components/ui'

// Cible du redirect OAuth (Google) : attend que la session soit établie puis route vers l'app.
export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    let done = false
    const params = new URLSearchParams(window.location.search)
    const accessToken = params.get('access_token')
    if (accessToken) {
      setToken(accessToken)
      window.history.replaceState({}, '', '/auth/callback')
    }
    const { data: { subscription } } = api.auth.onAuthStateChange((_e, session) => {
      if (session && !done) {
        done = true
        navigate('/app', { replace: true })
      }
    })
    api.auth.getSession().then(({ data: { session } }) => {
      if (session && !done) {
        done = true
        navigate('/app', { replace: true })
      }
    })
    const timeout = setTimeout(() => {
      if (!done) navigate('/login', { replace: true })
    }, 6000)
    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingState label="Authentification en cours…" />
    </div>
  )
}
