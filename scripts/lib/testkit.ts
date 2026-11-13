/**
 * Fælles værktøj til tests mod det RIGTIGE Supabase-projekt i .env:
 * midlertidige testbrugere med profil, rigtige sessioner (uden at sende mail) og sikker oprydning.
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
const publishable = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !secret || !publishable) {
  console.error('Mangler SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY og/eller VITE_SUPABASE_ANON_KEY i .env')
  process.exit(1)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
export const admin: SupabaseClient<Database> = createClient<Database>(url, secret, opts)
export const newClient = (): SupabaseClient<Database> => createClient<Database>(url, publishable, opts)

export interface TestUser {
  id: string
  email: string
  name: string
  db: SupabaseClient<Database>
}

/** Engangskode fra admin-API'et: ingen mail sendes. */
export async function otpFor(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties?.email_otp) throw new Error(`Kunne ikke hente engangskode: ${error?.message ?? 'ingen email_otp'}`)
  return data.properties.email_otp
}

/** Opretter en testbruger, logger ind og giver en profil (direkte, så gruppekoden ikke er nødvendig). */
export async function createTestUser(name: string, opts2: { admin?: boolean } = {}): Promise<TestUser> {
  const email = `smoke-${name.toLowerCase()}-${randomUUID().slice(0, 6)}@example.com`
  const db = newClient()
  const login = await db.auth.verifyOtp({ email, token: await otpFor(email), type: 'email' })
  const id = login.data.user?.id
  if (!id) throw new Error(`Kunne ikke logge testbruger ${name} ind: ${login.error?.message}`)
  const { error } = await admin.from('profiles').insert({ id, display_name: name, is_admin: opts2.admin ?? false })
  if (error) throw new Error(`Kunne ikke oprette profil til ${name}: ${error.message}`)
  return { id, email, name, db }
}

export async function deleteTestUsers(users: TestUser[]): Promise<void> {
  for (const u of users) {
    await admin.from('join_attempts').delete().eq('user_id', u.id)
    await admin.auth.admin.deleteUser(u.id) // profil og ratings følger med (cascade)
  }
}

/** Åbner alle låger midlertidigt og returnerer en funktion der gendanner den oprindelige indstilling. */
export async function openAllDoors(): Promise<() => Promise<void>> {
  const { data, error } = await admin.from('settings').select('show_future_days').single()
  if (error) throw error
  const before = data.show_future_days
  const set = async (v: boolean) => {
    const r = await admin.from('settings').update({ show_future_days: v }).eq('id', true)
    if (r.error) throw r.error
  }
  await set(true)
  return () => set(before)
}

export function makeChecker() {
  let failures = 0
  return {
    check(name: string, ok: boolean, detail = '') {
      if (!ok) failures++
      console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`)
    },
    get failures() {
      return failures
    },
  }
}

/** Sikker rydning: kør altid, selv ved fejl, og bekræft at intet er til overs. */
export async function verifyClean(testUserIds: string[]): Promise<boolean> {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 })
  const left = users.users.filter((u) => /^smoke-.*@example\.com$/.test(u.email ?? ''))
  const { data: s } = await admin.from('settings').select('show_future_days').single()
  const { count } = testUserIds.length
    ? await admin.from('ratings').select('*', { count: 'exact', head: true }).in('user_id', testUserIds)
    : { count: 0 }
  const ok = left.length === 0 && s?.show_future_days === false && count === 0
  console.log(`oprydning: testbrugere tilbage ${left.length}, testvurderinger tilbage ${count}, show_future_days=${s?.show_future_days} → ${ok ? 'ren ✓' : 'IKKE REN ✗'}`)
  return ok
}
