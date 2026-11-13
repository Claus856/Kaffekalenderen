/**
 * Røgtest af login-flowet mod det RIGTIGE Supabase-projekt i .env.
 *
 *   npm run smoke:auth
 *
 * Opretter en midlertidig testbruger (smoke-…@example.com), henter en ægte engangskode via admin-API'et
 * (der sendes INGEN mail, så det virker uden SMTP), logger ind som brugeren og tjekker reglerne.
 * Testbrugeren og dens spor slettes til sidst, også hvis noget fejler.
 *
 * Gruppekoden kendes ikke her, så den lykkede oprettelse af en profil testes i supabase/tests (PGlite).
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { describeJoinStatus, describeVerifyError } from '../src/lib/authMessages'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
const publishable = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !secret || !publishable) {
  console.error('Mangler SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY og/eller VITE_SUPABASE_ANON_KEY i .env')
  process.exit(1)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, secret, opts)
const newClient = () => createClient(url, publishable, opts)

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`)
}

async function otpFor(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties?.email_otp) throw new Error(`Kunne ikke hente engangskode: ${error?.message ?? 'ingen email_otp'}`)
  return data.properties.email_otp
}

async function main() {
  const email = `smoke-${randomUUID().slice(0, 8)}@example.com`
  let userId: string | null = null

  try {
    console.log(`Testbruger: ${email}\n`)

    // ── 1. Login med engangskode ──
    const a = newClient()
    const login = await a.auth.verifyOtp({ email, token: await otpFor(email), type: 'email' })
    userId = login.data.user?.id ?? null
    check('verifyOtp med rigtig kode giver session', !!login.data.session && login.data.user?.email === email, login.error?.message)
    if (!userId) throw new Error('Ingen bruger oprettet. Stopper.')

    const wrong = await newClient().auth.verifyOtp({ email, token: '000000', type: 'email' })
    check('forkert kode afvises', !!wrong.error, wrong.error?.code)
    check('…og får en dansk, venlig besked', !!wrong.error && /forkert eller udløbet/.test(describeVerifyError(wrong.error)), wrong.error ? describeVerifyError(wrong.error) : '')

    // ── 2. Logget ind, men uden profil: RLS giver ingen adgang ──
    const profile = await a.from('profiles').select('id').eq('id', userId).maybeSingle()
    check('ingen profil endnu', !profile.error && profile.data === null)
    const coffees = await a.from('coffees').select('day')
    check('kaffer: 0 rækker uden profil (der findes 25)', !coffees.error && coffees.data?.length === 0, coffees.error?.message)
    const ratings = await a.from('ratings').select('id')
    check('ratings: 0 rækker uden profil', !ratings.error && ratings.data?.length === 0)
    const profiles = await a.from('profiles').select('id')
    check('profiler: ingen andres profiler synlige uden profil', !profiles.error && profiles.data?.length === 0)
    const ins = await a.from('ratings').insert({ coffee_day: 1, score: 5 })
    check('kan ikke stemme uden profil', !!ins.error, ins.error?.message)
    const od = await a.rpc('open_day')
    check('open_day() virker for indlogget bruger', !od.error && typeof od.data === 'number', `giver ${od.data}`)
    const direct = await a.from('profiles').insert({ id: userId, display_name: 'Snyd', is_admin: true })
    check('kan ikke oprette sig selv som admin direkte i profiles', !!direct.error, direct.error?.message)

    // ── 3. Gruppekode ──
    const bad = await a.rpc('create_profile', { p_display_name: 'Smoketest', p_group_code: `forkert-${randomUUID()}` })
    check('create_profile med forkert kode → forkert_kode', bad.data === 'forkert_kode', String(bad.data ?? bad.error?.message))
    check('…med dansk besked', JSON.stringify(describeJoinStatus(String(bad.data))).includes('Gruppekoden er forkert'))
    const shortName = await a.rpc('create_profile', { p_display_name: 'x', p_group_code: 'hvadsomhelst' })
    check('for kort navn → ugyldigt_navn', shortName.data === 'ugyldigt_navn', String(shortName.data))
    const still = await a.from('profiles').select('id').eq('id', userId).maybeSingle()
    check('stadig ingen profil efter forkerte forsøg', still.data === null)

    // ── 4. Session: fornyelse og lokal log ud ──
    const refreshed = await a.auth.refreshSession()
    check('sessionen kan fornys (auto-refresh)', !!refreshed.data.session?.access_token && !refreshed.error, refreshed.error?.message)

    const b = newClient() // "telefonen" og "computeren": samme bruger, to enheder
    const loginB = await b.auth.verifyOtp({ email, token: await otpFor(email), type: 'email' })
    check('anden enhed kan logge ind samtidig', !!loginB.data.session, loginB.error?.message)
    await a.auth.signOut({ scope: 'local' })
    const stillB = await b.auth.getUser()
    check('log ud på én enhed (scope local) logger IKKE den anden ud', !stillB.error && stillB.data.user?.id === userId, stillB.error?.message)
  } finally {
    if (userId) {
      await admin.from('join_attempts').delete().eq('user_id', userId)
      const del = await admin.auth.admin.deleteUser(userId)
      const gone = await admin.auth.admin.getUserById(userId)
      check('testbruger slettet igen', !del.error && !!gone.error, del.error?.message)
    }
  }

  console.log(failures === 0 ? '\nAlt består ✓' : `\n${failures} fejl ✗`)
  process.exitCode = failures === 0 ? 0 : 1
}

main().catch((err) => {
  console.error(`\nFEJL: ${(err as Error).message}`)
  process.exit(1)
})
