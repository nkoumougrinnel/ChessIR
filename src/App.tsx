import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './state/auth'
import { ChampionshipProvider, useChampionship } from './state/championship'
import { hideSplash } from './lib/splash'
import { UpdateBanner } from './components/UpdateBanner'
import { ShareProvider } from './components/ShareSheet'
import { isConfigured } from './lib/supabase'
import Layout from './components/Layout'
import { PageLoader } from './components/ui'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import MatchesPage from './pages/MatchesPage'
import MatchDetailPage from './pages/MatchDetailPage'
import StandingsPage from './pages/StandingsPage'
import ProfilePage from './pages/ProfilePage'
import EditProfilePage from './pages/EditProfilePage'
import AwardsPage from './pages/AwardsPage'
import NotificationsPage from './pages/NotificationsPage'
import PlayerHistoryPage from './pages/PlayerHistoryPage'

// Espace admin chargé à la demande : les participants ne téléchargent pas ce code.
const AdminLayout = lazy(() => import('./admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'))
const AdminPlayers = lazy(() => import('./admin/AdminPlayers'))
const AdminWeeks = lazy(() => import('./admin/AdminWeeks'))
const AdminMatches = lazy(() => import('./admin/AdminMatches'))
const AdminMatchDetail = lazy(() => import('./admin/AdminMatchDetail'))
const AdminStandings = lazy(() => import('./admin/AdminStandings'))
const AdminAwards = lazy(() => import('./admin/AdminAwards'))

/** Retire l'écran de lancement quand la session et les données du championnat sont chargées. */
function SplashGate() {
  const { session, loading: authLoading } = useAuth()
  const { loading } = useChampionship()
  useEffect(() => {
    if (!authLoading && (!session || !loading)) hideSplash()
  }, [authLoading, session, loading])
  return null
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!session) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

/** Garde d'interface uniquement : les droits réels sont vérifiés par Supabase (RLS + fonctions). */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (profile?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function MissingConfig() {
  return (
    <div className="mx-auto max-w-md p-6 pt-20 text-center">
      <h1 className="title mb-3">Configuration manquante</h1>
      <p className="text-muted">
        Copiez <code>.env.example</code> en <code>.env</code> et renseignez <code>VITE_SUPABASE_URL</code> et{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> (voir README).
      </p>
    </div>
  )
}

export default function App() {
  if (!isConfigured) {
    hideSplash()
    return <MissingConfig />
  }
  return (
    <BrowserRouter>
      <AuthProvider>
        <ChampionshipProvider>
          <ShareProvider>
          <SplashGate />
          <UpdateBanner />
          <Routes>
            <Route path="/connexion" element={<AuthPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<HomePage />} />
              <Route path="matchs" element={<MatchesPage />} />
              <Route path="matchs/:id" element={<MatchDetailPage />} />
              <Route path="classement" element={<StandingsPage />} />
              <Route path="profil" element={<ProfilePage />} />
              <Route path="profil/modifier" element={<EditProfilePage />} />
              <Route path="profil/recompenses" element={<AwardsPage />} />
              <Route path="joueurs/:participantId" element={<ProfilePage />} />
              <Route path="joueurs/:participantId/historique" element={<PlayerHistoryPage />} />
              <Route path="recompenses" element={<AwardsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <RequireAdmin>
                    <Suspense fallback={<PageLoader />}>
                      <AdminLayout />
                    </Suspense>
                  </RequireAdmin>
                </RequireAuth>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="joueurs" element={<AdminPlayers />} />
              <Route path="semaines" element={<AdminWeeks />} />
              <Route path="matchs" element={<AdminMatches />} />
              <Route path="matchs/:id" element={<AdminMatchDetail />} />
              <Route path="classements" element={<AdminStandings />} />
              <Route path="recompenses" element={<AdminAwards />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ShareProvider>
        </ChampionshipProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
