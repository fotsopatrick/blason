import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth, RequireRole } from '@/components/guards'
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
import LeaderboardPage from '@/pages/LeaderboardPage'
import PortfolioPage from '@/pages/PortfolioPage'
import AdminPage from '@/pages/admin/AdminPage'
import NotFoundPage from '@/pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
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
