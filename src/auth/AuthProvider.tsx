import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'

export type Profile = Pick<Tables<'profiles'>, 'id' | 'display_name' | 'is_admin' | 'created_at'>

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  /** Logget ind, men uden profil: skal vælge navn og indtaste gruppekoden. RLS giver ingen adgang til noget endnu. */
  | { status: 'needsProfile'; session: Session }
  | { status: 'profileError'; session: Session; message: string }
  | { status: 'ready'; session: Session; profile: Profile }

interface AuthContextValue {
  state: AuthState
  /** Hent profilen igen (fx efter create_profile). */
  refreshProfile: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

type ProfileLoad =
  | { userId: null; status: 'idle' }
  | { userId: string; status: 'loading' }
  | { userId: string; status: 'done'; profile: Profile | null }
  | { userId: string; status: 'error'; message: string }

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = vi ved det ikke endnu, null = ikke logget ind
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profileLoad, setProfileLoad] = useState<ProfileLoad>({ userId: null, status: 'idle' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    // Kun state-opdatering i callbacken. Andre Supabase-kald herfra kan låse klienten.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  // Profilen hentes igen, når brugeren skifter. Fornyelse af token (samme bruger) udløser ikke nyt opslag.
  const userId = session?.user.id ?? null
  useEffect(() => {
    if (!userId) {
      setProfileLoad({ userId: null, status: 'idle' })
      return
    }
    let active = true
    setProfileLoad({ userId, status: 'loading' })
    supabase
      .from('profiles')
      .select('id, display_name, is_admin, created_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setProfileLoad({ userId, status: 'error', message: 'Kunne ikke hente din profil. Tjek din forbindelse.' })
        else setProfileLoad({ userId, status: 'done', profile: data })
      })
    return () => {
      active = false
    }
  }, [userId, reloadKey])

  const refreshProfile = useCallback(() => setReloadKey((k) => k + 1), [])

  const signOut = useCallback(async () => {
    // 'local': kun denne enhed logges ud. Standarden ('global') ville logge alle vennens andre enheder ud også.
    await supabase.auth.signOut({ scope: 'local' })
  }, [])

  const state = useMemo<AuthState>(() => {
    if (session === undefined) return { status: 'loading' }
    if (session === null) return { status: 'signedOut' }
    // 'idle' har userId null, så den fanges også af id-sammenligningen
    if (profileLoad.userId !== session.user.id || profileLoad.status === 'loading') return { status: 'loading' }
    if (profileLoad.status === 'error') return { status: 'profileError', session, message: profileLoad.message }
    if (!profileLoad.profile) return { status: 'needsProfile', session }
    return { status: 'ready', session, profile: profileLoad.profile }
  }, [session, profileLoad])

  const value = useMemo(() => ({ state, refreshProfile, signOut }), [state, refreshProfile, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Den indloggede bruger med profil. Kun til skærme der vises efter login og profiloprettelse. */
export function useMe(): { userId: string; profile: Profile } {
  const { state } = useAuth()
  if (state.status !== 'ready') throw new Error('useMe kræver en indlogget bruger med profil')
  return { userId: state.session.user.id, profile: state.profile }
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth skal bruges inde i <AuthProvider>')
  return ctx
}
