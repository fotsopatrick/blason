import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'

const FEATURES = [
  {
    icon: '📜',
    title: 'Des offres d’emploi, des quêtes',
    text: 'Chaque quête est forgée à partir d’une vraie offre d’emploi : tu construis exactement ce que les recruteurs attendent.',
  },
  {
    icon: '🛡️',
    title: 'Forme ta guilde',
    text: 'Constitue une équipe de 3 à 6 membres, relevez des quêtes ensemble et partagez l’XP de chaque victoire.',
  },
  {
    icon: '⚡',
    title: 'Gagne de l’XP, monte en niveau',
    text: 'Chaque quête validée rapporte de l’XP. Grimpe les classements hebdomadaires et deviens une légende de la forge.',
  },
  {
    icon: '🏆',
    title: 'Un portfolio qui prouve tout',
    text: 'Ton profil public rassemble quêtes complétées, compétences prouvées et projets GitHub. Partage-le aux recruteurs.',
  },
]

export default function LandingPage() {
  const { session, loading } = useAuth()

  // Utilisateur déjà connecté → directement au tableau de bord.
  if (!loading && session) return <Navigate to="/app" replace />

  return (
    <div className="min-h-screen bg-base-200">
      <header className="navbar mx-auto max-w-6xl">
        <div className="flex-1">
          <span className="flex items-center gap-2 px-2">
            <span className="text-2xl">⚔️</span>
            <span className="font-display text-xl font-bold">QuestForge</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Link to="/login" className="btn btn-ghost">Connexion</Link>
          <Link to="/register" className="btn btn-primary">Commencer</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="py-16 text-center sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-4 text-6xl">⚔️</div>
            <h1 className="font-display mx-auto max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
              Transforme les offres d’emploi en <span className="text-primary">quêtes épiques</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-base-content/70">
              QuestForge transforme les compétences que le marché réclame en projets concrets.
              Forme ta guilde, complète des quêtes, gagne de l’XP et forge un portfolio
              qui prouve ce que tu sais faire.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register" className="btn btn-primary btn-lg">
                ⚒️ Rejoindre la forge
              </Link>
              <Link to="/login" className="btn btn-outline btn-lg">
                J’ai déjà un compte
              </Link>
            </div>
          </motion.div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              className="card bg-base-100 shadow-sm"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <div className="card-body">
                <div className="text-3xl">{f.icon}</div>
                <h2 className="card-title text-base">{f.title}</h2>
                <p className="text-sm text-base-content/70">{f.text}</p>
              </div>
            </motion.div>
          ))}
        </section>
      </main>

      <footer className="border-t border-base-300 py-6 text-center text-sm text-base-content/50">
        QuestForge — apprends en héros.
      </footer>
    </div>
  )
}
