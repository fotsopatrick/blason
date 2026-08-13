import { Navigate, Route, Routes } from 'react-router-dom'
import { RedirigeSiConnecte, RequireAuth, RequireRole } from '@/components/guards'
import AppLayout from '@/components/layout/AppLayout'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import AuthCallbackPage from '@/pages/auth/AuthCallbackPage'
import DashboardPage from '@/pages/DashboardPage'
import ProfilePage from '@/pages/ProfilePage'
import GuildsPage from '@/pages/guilds/GuildsPage'
import GuildDetailPage from '@/pages/guilds/GuildDetailPage'
import QuestsPage from '@/pages/quests/QuestsPage'
import QuestDetailPage from '@/pages/quests/QuestDetailPage'
import QuestCreatePage from '@/pages/quests/QuestCreatePage'
import WorkspacePage from '@/pages/quests/WorkspacePage'
import MyQuestsPage from '@/pages/quests/MyQuestsPage'
import OffresPage from '@/pages/carriere/OffresPage'
import OffreDetailPage from '@/pages/carriere/OffreDetailPage'
import EntretiensPage from '@/pages/carriere/EntretiensPage'
import LeaderboardPage from '@/pages/LeaderboardPage'
import PortfolioPage from '@/pages/PortfolioPage'
import AdminPage from '@/pages/admin/AdminPage'
import NotFoundPage from '@/pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {/*
        Connexion et inscription sont fermées à qui possède déjà une session
        (13/08/2026) : elles étaient publiques et nues, si bien qu'un
        utilisateur connecté tombait sur le formulaire de connexion et
        pouvait croire que sa session avait sauté.
      */}
      <Route
        path="/login"
        element={
          <RedirigeSiConnecte>
            <LoginPage />
          </RedirigeSiConnecte>
        }
      />
      <Route
        path="/register"
        element={
          <RedirigeSiConnecte>
            <RegisterPage />
          </RedirigeSiConnecte>
        }
      />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/u/:username" element={<PortfolioPage />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="guilds" element={<GuildsPage />} />
        <Route path="guilds/:id" element={<GuildDetailPage />} />
        <Route path="quests" element={<QuestsPage />} />
        <Route
          path="quests/new"
          element={
            <RequireRole roles={['company', 'admin']}>
              <QuestCreatePage />
            </RequireRole>
          }
        />
        <Route path="quests/:id" element={<QuestDetailPage />} />
        <Route path="my-quests" element={<MyQuestsPage />} />
        <Route path="workspace/:assignmentId" element={<WorkspacePage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="offres" element={<OffresPage />} />
        <Route path="offres/:id" element={<OffreDetailPage />} />
        <Route path="entretiens" element={<EntretiensPage />} />
        <Route
          path="admin"
          element={
            <RequireRole roles={['admin']}>
              <AdminPage />
            </RequireRole>
          }
        />
      </Route>

      <Route path="/dashboard" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
