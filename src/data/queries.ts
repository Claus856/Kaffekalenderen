import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '../lib/database.types'
import type { RatingValue } from '../lib/ratings'

/**
 * Al dataadgang ligger her. Funktionerne tager klienten som parameter, så de kan bruges af både appen og af
 * integrationstesten mod den rigtige database. Hvad man får tilbage bestemmes af RLS i databasen, ikke af koden her.
 */
export type Client = SupabaseClient<Database>

export type Coffee = Tables<'coffees'>
export type Rating = Tables<'ratings'>
export interface CoffeeWithNotes extends Coffee {
  notes: string[]
}
export interface Member {
  id: string
  display_name: string
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`)
}

/** Højeste åbne låge ifølge serveren (Europe/Copenhagen). 0 før 1. december. */
export async function fetchOpenDay(db: Client): Promise<number> {
  const { data, error } = await db.rpc('open_day')
  if (error) fail('Kunne ikke hente kalenderen', error)
  return data ?? 0
}

/** null hvis lågen ikke er åben (RLS skjuler den). */
export async function fetchCoffee(db: Client, day: number): Promise<CoffeeWithNotes | null> {
  const [coffee, notes] = await Promise.all([
    db.from('coffees').select('*').eq('day', day).maybeSingle(),
    db.from('coffee_notes').select('note').eq('coffee_day', day).order('note'),
  ])
  if (coffee.error) fail('Kunne ikke hente kaffen', coffee.error)
  if (notes.error) fail('Kunne ikke hente smagsnoter', notes.error)
  return coffee.data ? { ...coffee.data, notes: notes.data.map((n) => n.note) } : null
}

/**
 * Ratings for en dag. RLS giver KUN mine egne, indtil jeg selv har stemt. Derefter også de andres.
 */
export async function fetchDayRatings(db: Client, day: number): Promise<Rating[]> {
  const { data, error } = await db.from('ratings').select('*').eq('coffee_day', day).order('created_at')
  if (error) fail('Kunne ikke hente karakterer', error)
  return data
}

export async function fetchMembers(db: Client): Promise<Member[]> {
  const { data, error } = await db.from('profiles').select('id, display_name').order('display_name')
  if (error) fail('Kunne ikke hente gruppen', error)
  return data
}

/** Hvem har stemt på hvilke dage. Aldrig karakter eller kommentar. */
export async function fetchParticipation(db: Client): Promise<Array<{ user_id: string; coffee_day: number }>> {
  const { data, error } = await db.rpc('participation')
  if (error) fail('Kunne ikke hente deltagelse', error)
  return data ?? []
}

/** Alle karakterer jeg må se (til kalenderens overblik). */
export async function fetchRatingOverview(db: Client): Promise<Array<{ coffee_day: number; user_id: string; score: number }>> {
  const { data, error } = await db.from('ratings').select('coffee_day, user_id, score')
  if (error) fail('Kunne ikke hente karakterer', error)
  return data
}

/** Alle kaffer jeg må se (åbne låger) med smagsnoter. Til statistikken. */
export async function fetchAllCoffees(db: Client): Promise<CoffeeWithNotes[]> {
  const [coffees, notes] = await Promise.all([db.from('coffees').select('*').order('day'), db.from('coffee_notes').select('coffee_day, note')])
  if (coffees.error) fail('Kunne ikke hente kaffer', coffees.error)
  if (notes.error) fail('Kunne ikke hente smagsnoter', notes.error)
  return coffees.data.map((c) => ({ ...c, notes: notes.data.filter((n) => n.coffee_day === c.day).map((n) => n.note).sort() }))
}

/** Alle karakterer jeg må se, med bryggeparametre. Til statistikken. */
export async function fetchAllRatings(db: Client): Promise<Rating[]> {
  const { data, error } = await db.from('ratings').select('*')
  if (error) fail('Kunne ikke hente karakterer', error)
  return data
}

// ── Admin ──────────────────────────────────────────────────────────────────

/** De felter en admin kan rette på en kaffe. 'notes' (smagsnoter) håndteres for sig. */
export const EDITABLE_COFFEE_FIELDS = [
  'name', 'country', 'region', 'continent', 'altitude_min', 'altitude_max',
  'variety', 'process', 'roast', 'description', 'image_url', 'product_url',
] as const
export type EditableCoffeeField = (typeof EDITABLE_COFFEE_FIELDS)[number]
export type CoffeePatch = Partial<Pick<Coffee, EditableCoffeeField>>

/**
 * Ret en kaffe som admin. De rettede felter lægges i manual_fields (sammen med dem der allerede stod der),
 * så scraperen ikke overskriver dem næste gang. Smagsnoter (hvis angivet) erstatter de gamle.
 */
export async function updateCoffee(
  db: Client,
  day: number,
  patch: CoffeePatch,
  notes: string[] | null,
  manualFields: string[],
): Promise<void> {
  const { error } = await db.from('coffees').update({ ...patch, manual_fields: manualFields }).eq('day', day)
  if (error) fail('Kunne ikke gemme kaffen', error)

  if (notes) {
    const current = await db.from('coffee_notes').select('note').eq('coffee_day', day)
    if (current.error) fail('Kunne ikke læse smagsnoter', current.error)
    const stale = current.data.map((n) => n.note).filter((n) => !notes.includes(n))
    if (stale.length) {
      const del = await db.from('coffee_notes').delete().eq('coffee_day', day).in('note', stale)
      if (del.error) fail('Kunne ikke fjerne gamle smagsnoter', del.error)
    }
    if (notes.length) {
      const ins = await db.from('coffee_notes').upsert(notes.map((note) => ({ coffee_day: day, note })), { onConflict: 'coffee_day,note', ignoreDuplicates: true })
      if (ins.error) fail('Kunne ikke gemme smagsnoter', ins.error)
    }
  }
}

/** Fjerner markeringen "rettet manuelt", så scraperen igen må overskrive kaffens felter. */
export async function clearManualFields(db: Client, day: number): Promise<void> {
  const { error } = await db.from('coffees').update({ manual_fields: [] }).eq('day', day)
  if (error) fail('Kunne ikke nulstille', error)
}

export async function fetchSettings(db: Client): Promise<{ show_future_days: boolean; calendar_year: number }> {
  const { data, error } = await db.from('settings').select('show_future_days, calendar_year').single()
  if (error) fail('Kunne ikke hente indstillinger', error)
  return data
}

export async function setShowFutureDays(db: Client, value: boolean): Promise<void> {
  const { error } = await db.from('settings').update({ show_future_days: value }).eq('id', true)
  if (error) fail('Kunne ikke ændre indstillingen', error)
}

export async function setGroupCode(db: Client, code: string): Promise<void> {
  const { error } = await db.rpc('set_group_code', { p_code: code })
  if (error) fail('Kunne ikke skifte gruppekoden', error)
}

/** Opret eller ret min egen vurdering for en dag. Én pr. bruger pr. dag. */
export async function saveRating(db: Client, userId: string, day: number, value: RatingValue): Promise<void> {
  const { error } = await db.from('ratings').upsert(
    { user_id: userId, coffee_day: day, ...value },
    { onConflict: 'user_id,coffee_day' },
  )
  if (error) {
    if (/row-level security/i.test(error.message)) throw new Error('Den låge er ikke åben endnu, så du kan ikke stemme på den.')
    fail('Kunne ikke gemme vurderingen', error)
  }
}
