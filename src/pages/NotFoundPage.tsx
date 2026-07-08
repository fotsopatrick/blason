import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-base-200 p-4 text-center">
      <div className="text-7xl">🗺️</div>
      <h1 className="font-display text-3xl font-bold">Terre inconnue</h1>
      <p className="max-w-md text-base-content/60">
        Cette page n'existe pas sur la carte. Même les meilleurs éclaireurs se perdent parfois.
      </p>
      <Link to="/" className="btn btn-primary">
        ⚔️ Retour à la forge
      </Link>
    </div>
  )
}
