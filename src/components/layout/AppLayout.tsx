import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { UserAvatar, XPBar } from '@/components/ui'

const THEME_KEY = 'blason-theme'

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(
    () => localStorage.getItem(THEME_KEY) ?? 'blason',
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const dark = theme === 'blasonnuit'
  return (
    <button
      className="btn btn-ghost btn-circle"
      title={dark ? 'Thème clair' : 'Thème sombre'}
      onClick={() => setTheme(dark ? 'blason' : 'blasonnuit')}
    >
      {dark ? '🌞' : '🌙'}
    </button>
  )
}

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
}

export default function AppLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const items: NavItem[] = [
    { to: '/app', label: 'Tableau de bord', icon: '🏰', end: true },
    { to: '/app/quests', label: 'Quêtes', icon: '📜' },
    { to: '/app/my-quests', label: 'Mes quêtes', icon: '🎯' },
    { to: '/app/offres', label: 'Carrière', icon: '💼' },
    { to: '/app/entretiens', label: 'Entretiens', icon: '🎤' },
    { to: '/app/guilds', label: 'Guildes', icon: '🛡️' },
    { to: '/app/leaderboard', label: 'Classements', icon: '🏆' },
  ]
  if (profile?.role === 'company' || profile?.role === 'admin') {
    items.push({ to: '/app/quests/new', label: 'Forger une quête', icon: '⚒️' })
  }
  if (profile?.role === 'admin') {
    items.push({ to: '/app/admin', label: 'Administration', icon: '👑' })
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const navLinks = (onClick?: () => void) => (
    <ul className="menu w-full gap-1 p-0">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onClick}
            className={({ isActive }) =>
              isActive ? 'menu-active font-semibold' : undefined
            }
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="drawer lg:drawer-open min-h-screen bg-base-200">
      <input id="app-drawer" type="checkbox" className="drawer-toggle" />

      <div className="drawer-content flex min-h-screen flex-col">
        {/* Navbar */}
        <header className="navbar sticky top-0 z-40 border-b border-base-300 bg-base-100/90 backdrop-blur">
          <div className="flex-none lg:hidden">
            <label htmlFor="app-drawer" className="btn btn-ghost btn-square" aria-label="Menu">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </label>
          </div>
          <div className="flex-1">
            <NavLink to="/app" className="btn btn-ghost text-lg font-display font-bold lg:hidden">
              ⚔️ Blason
            </NavLink>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {profile && (
              <div className="dropdown dropdown-end">
                <div tabIndex={0} role="button" className="btn btn-ghost gap-2 px-2">
                  <UserAvatar url={profile.avatar_url} name={profile.display_name || profile.username} size="sm" />
                  <span className="hidden max-w-32 truncate text-sm sm:inline">
                    {profile.display_name || profile.username}
                  </span>
                </div>
                <ul tabIndex={0} className="dropdown-content menu z-50 mt-2 w-56 rounded-box bg-base-100 p-2 shadow-lg">
                  <li className="menu-title text-xs">
                    @{profile.username} · {profile.role}
                  </li>
                  <li><NavLink to="/app/profile">👤 Mon profil</NavLink></li>
                  <li><NavLink to={`/u/${profile.username}`}>🌐 Portfolio public</NavLink></li>
                  <li><button onClick={handleSignOut}>🚪 Se déconnecter</button></li>
                </ul>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
          <Outlet />
        </main>

        <footer className="border-t border-base-300 py-4 text-center text-xs text-base-content/50">
          Blason — bâtis tes armes, quête après quête.
        </footer>
      </div>

      {/* Sidebar */}
      <div className="drawer-side z-50">
        <label htmlFor="app-drawer" aria-label="Fermer le menu" className="drawer-overlay" />
        <aside className="flex min-h-full w-64 flex-col border-r border-base-300 bg-base-100 p-4">
          <NavLink to="/app" className="mb-6 flex items-center gap-2 px-2">
            <span className="text-2xl">⚔️</span>
            <span className="font-display text-xl font-bold tracking-wide">Blason</span>
          </NavLink>

          {profile && (
            <div className="mb-6 rounded-box bg-base-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <UserAvatar url={profile.avatar_url} name={profile.display_name || profile.username} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {profile.display_name || profile.username}
                  </div>
                  <div className="text-xs text-base-content/60">@{profile.username}</div>
                </div>
              </div>
              <XPBar xp={profile.xp} compact />
            </div>
          )}

          <nav className="flex-1">
            {navLinks(() => {
              const drawer = document.getElementById('app-drawer') as HTMLInputElement | null
              if (drawer) drawer.checked = false
            })}
          </nav>
        </aside>
      </div>
    </div>
  )
}
