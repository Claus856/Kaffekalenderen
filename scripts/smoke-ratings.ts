/**
 * Integrationstest af vurderingsflowet mod det RIGTIGE Supabase-projekt (npm run smoke:ratings).
 * Bruger appens egne dataadgangsfunktioner (src/data/queries.ts) med tre midlertidige testbrugere.
 * Åbner midlertidigt alle låger og gendanner indstillingen, og sletter testbrugerne og deres vurderinger bagefter.
 */
import { fetchCoffee, fetchDayRatings, fetchMembers, fetchOpenDay, fetchParticipation, fetchRatingOverview, saveRating } from '../src/data/queries'
import { summarizeCalendar } from '../src/lib/ratings'
import { createTestUser, deleteTestUsers, makeChecker, openAllDoors, verifyClean, type TestUser } from './lib/testkit'

const { check, ...c } = makeChecker()
const users: TestUser[] = []
const DAY = 5

async function main() {
  let restore: (() => Promise<void>) | null = null
  try {
    const [a, b, d] = await Promise.all([createTestUser('Aa'), createTestUser('Bb'), createTestUser('Cc')])
    users.push(a, b, d)
    check('tre testbrugere med profil og session', users.length === 3)

    // ── Før 1. december er ingen låger åbne ──
    check('open_day() er 0 (november)', (await fetchOpenDay(a.db)) === 0)
    check('kaffe for dag 5 er skjult for almindelig bruger', (await fetchCoffee(a.db, DAY)) === null)
    let blocked = ''
    try {
      await saveRating(a.db, a.id, DAY, { score: 4, fill_level: 'medium', steep_minutes: 6, comment: null })
    } catch (e) {
      blocked = (e as Error).message
    }
    check('kan ikke stemme på en lukket låge, med venlig besked', /ikke åben endnu/.test(blocked), blocked)

    // ── Åbn alle låger (test), og stem ──
    restore = await openAllDoors()
    check('open_day() er 25 med show_future_days', (await fetchOpenDay(a.db)) === 25)

    const coffee = await fetchCoffee(a.db, DAY)
    check('kaffe + smagsnoter hentes for en åben låge', !!coffee && coffee.day === DAY && coffee.notes.length > 0, coffee ? `${coffee.name}, ${coffee.notes.length} noter` : '')

    await saveRating(a.db, a.id, DAY, { score: 4, fill_level: 'strong', steep_minutes: 8, comment: 'Kraftig' })
    check('B ser INGEN karakterer, før B selv har stemt', (await fetchDayRatings(b.db, DAY)).length === 0)
    const part = await fetchParticipation(b.db)
    check('…men kan se at A har stemt (uden karakter)', part.some((p) => p.user_id === a.id && p.coffee_day === DAY) && !('score' in (part[0] ?? {})))
    const overviewB = summarizeCalendar(await fetchRatingOverview(b.db), b.id)
    check('kalenderoverblikket for B viser ingen snit for dagen', overviewB.get(DAY) === undefined)

    await saveRating(b.db, b.id, DAY, { score: 2, fill_level: 'mild', steep_minutes: 4, comment: null })
    const seenByB = await fetchDayRatings(b.db, DAY)
    check('efter B har stemt ser B både A og sig selv', seenByB.length === 2, `${seenByB.map((r) => r.score).sort().join(',')}`)
    const members = await fetchMembers(b.db)
    check('B kan se navne på gruppens medlemmer', ['Aa', 'Bb', 'Cc'].every((n) => members.some((m) => m.display_name === n)))
    check('C (har ikke stemt) ser stadig intet', (await fetchDayRatings(d.db, DAY)).length === 0)

    // ── Ret egen vurdering: stadig én række, andre ser opdateringen ──
    await saveRating(a.db, a.id, DAY, { score: 5, fill_level: 'strong', steep_minutes: 11, comment: 'Rettet' })
    const afterEdit = await fetchDayRatings(b.db, DAY)
    const aRow = afterEdit.find((r) => r.user_id === a.id)
    check('rettelse giver stadig én række pr. bruger', afterEdit.length === 2)
    check('…og B ser A\'s nye karakter, tid (11 min) og kommentar', aRow?.score === 5 && aRow.steep_minutes === 11 && aRow.comment === 'Rettet')
    check('updated_at er sat efter rettelse', !!aRow && new Date(aRow.updated_at) >= new Date(aRow.created_at))

    // ── Kalenderoverblik: min karakter og gruppens snit ──
    const overviewA = summarizeCalendar(await fetchRatingOverview(a.db), a.id).get(DAY)
    check('kalender: min karakter 5 og gruppens snit 3,5 (5 og 2)', overviewA?.mine === 5 && overviewA.avg === 3.5 && overviewA.n === 2, JSON.stringify(overviewA))

    // ── DB-regler: ingen halve point, ingen karakter uden for 1–5 ──
    let bad = ''
    try {
      await saveRating(b.db, b.id, DAY, { score: 6, fill_level: 'medium', steep_minutes: 6, comment: null })
    } catch (e) {
      bad = (e as Error).message
    }
    check('databasen afviser karakter 6', bad.length > 0, bad)
    const half = await b.db.from('ratings').update({ score: 3.5 as unknown as number }).eq('user_id', b.id)
    check('databasen afviser halve point (3,5)', !!half.error, half.error?.message)
    const stillB = (await fetchDayRatings(b.db, DAY)).find((r) => r.user_id === b.id)
    check('B\'s karakter er uændret efter de afviste forsøg', stillB?.score === 2)

    // ── Luk igen: nu er lågen skjult og låst for alle ──
    await restore()
    restore = null
    check('open_day() er 0 igen', (await fetchOpenDay(a.db)) === 0)
    check('kaffen er skjult igen', (await fetchCoffee(b.db, DAY)) === null)
    let locked = ''
    try {
      await saveRating(a.db, a.id, DAY, { score: 1, fill_level: 'mild', steep_minutes: 4, comment: null })
    } catch (e) {
      locked = (e as Error).message
    }
    check('rettelse af en låge der er lukket igen afvises', /ikke åben endnu/.test(locked), locked)
  } finally {
    if (restore) await restore()
    await deleteTestUsers(users)
    const clean = await verifyClean(users.map((u) => u.id))
    check('alt ryddet op', clean)
  }

  console.log(c.failures === 0 ? '\nAlt består ✓' : `\n${c.failures} fejl ✗`)
  process.exitCode = c.failures === 0 ? 0 : 1
}

main().catch(async (err) => {
  console.error(`\nFEJL: ${(err as Error).message}`)
  process.exitCode = 1
})
