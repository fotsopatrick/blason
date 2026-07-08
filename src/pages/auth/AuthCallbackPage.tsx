import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { LoadingState } from '@/components/ui'

// Cible du redirect OAuth (Google) : attend que la session soit établie puis route vers l'app.
export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    let done = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session && !done) {
        done = true
        navigate('/app', { replace: true })
      }
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
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
