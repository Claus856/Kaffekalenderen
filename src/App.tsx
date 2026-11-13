import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { JoinScreen } from './auth/JoinScreen'
import { LoginScreen } from './auth/LoginScreen'
import { Shell } from './components/Shell'
import { Button, ErrorMessage, Screen, Splash } from './components/ui'
import { CalendarProvider } from './data/CalendarContext'
import { configProblem } from './lib/supabase'
import { CalendarPage } from './pages/CalendarPage'
import { DayPage } from './pages/DayPage'
import { TodayPage } from './pages/TodayPage'

// Statistik (Recharts) og admin hentes først, når man åbner dem, så "I dag" starter hurtigt på telefonen
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))

const Loading = () => <div className="h-64 animate-pulse rounded-2xl bg-white/70" aria-busy="true" />

/** Adgangsstyring i frontend. Den egentlige beskyttelse ligger i RLS, så dette er kun for at vise den rigtige skærm. */
function Gate() {
  const { state, refreshProfile, signOut } = useAuth()

  switch (state.status) {
    case 'loading':
      return <Splash />
    case 'signedOut':
      return <LoginScreen />
    case 'needsProfile':
      return <JoinScreen email={state.session.user.email ?? ''} />
    case 'profileError':
      return (
        <Screen>
          <div className="space-y-4">
            <ErrorMessage>{state.message}</ErrorMessage>
            <Button onClick={refreshProfile}>Prøv igen</Button>
            <Button variant="link" onClick={() => void signOut()}>
              Log ud
            </Button>
          </div>
        </Screen>
      )
    case 'ready':
      return (
        <CalendarProvider>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/i-dag" element={<TodayPage />} />
              <Route path="/kalender" element={<CalendarPage />} />
              <Route path="/dag/:day" element={<DayPage />} />
              <Route
                path="/statistik"
                element={
                  <Suspense fallback={<Loading />}>
                    <StatsPage />
                  </Suspense>
                }
              />
              <Route
                path="/admin"
                element={
                  <Suspense fallback={<Loading />}>
                    <AdminPage />
                  </Suspense>
                }
              />
              <Route path="*" element={<Navigate to="/i-dag" replace />} />
            </Route>
          </Routes>
        </CalendarProvider>
      )
  }
}

export default function App() {
  if (configProblem) {
    return (
      <Screen>
        <ErrorMessage>{configProblem}</ErrorMessage>
      </Screen>
    )
  }
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
