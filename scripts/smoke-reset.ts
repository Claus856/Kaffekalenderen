/**
 * Røgtest af "Nulstil vurderinger" mod det RIGTIGE Supabase-projekt (npm run smoke:reset).
 *
 * IKKE-DESTRUKTIV: testen sletter aldrig de eksisterende vurderinger. Den tester rettigheder og spærren, og
 * den tager først en sikkerhedskopi af alle vurderinger (scripts/.cache/) og gendanner dem, hvis noget mod forventning
 * skulle blive slettet. Selve sletningen testes i supabase/tests (PGlite) og ved at admin trykker på knappen.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchResetStatus, resetRatings } from '../src/data/queries'
import { admin, createTestUser, deleteTestUsers, makeChecker, newClient, type TestUser } from './lib/testkit'

const { check, ...c } = makeChecker()
const users: TestUser[] = []
const cacheDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.cache')

async function main() {
  // ── Sikkerhedskopi ──
  const { data: before, error } = await admin.from('ratings').select('*')
  if (error) throw error
  fs.mkdirSync(cacheDir, { recursive: true })
  const backupFile = path.join(cacheDir, `ratings-backup-${Date.now()}.json`)
  fs.writeFileSync(backupFile, JSON.stringify(before, null, 2))
  console.log(`sikkerhedskopi af ${before.length} vurderinger: ${path.relative(process.cwd(), backupFile)}\n`)

  try {
    // ── Kalenderens start regnes rigtigt på den rigtige database ──
    const start = await admin.rpc('calendar_start')
    check('calendar_start() = 1. december 00:00 dansk tid (30. nov 23:00 UTC)', new Date(String(start.data)).toISOString() === '2026-11-30T23:00:00.000Z', String(start.data))

    const adminUser = await createTestUser('Rootadm', { admin: true })
    const plain = await createTestUser('Plain')
    users.push(adminUser, plain)

    // ── Rettigheder ──
    for (const [label, db] of [['almindelig bruger', plain.db], ['anon', newClient()]] as const) {
      const st = await db.rpc('ratings_reset_status')
      const rs = await db.rpc('reset_ratings')
      check(`${label}: status afvist`, !!st.error, st.error?.code ?? st.error?.message)
      check(`${label}: nulstil afvist`, !!rs.error, rs.error?.code ?? rs.error?.message)
    }
    const hidden = await plain.db.rpc('calendar_start')
    check('almindelig bruger kan ikke kalde den interne calendar_start()', !!hidden.error, hidden.error?.message)
    check('…og intet blev slettet af de afviste forsøg', (await admin.from('ratings').select('*', { count: 'exact', head: true })).count === before.length)

    // ── Admin: status ──
    const status = await fetchResetStatus(adminUser.db)
    check(`admin ser antallet (${before.length}) og at det ikke er spærret`, status.total === before.length && status.locked === false, JSON.stringify(status))
    const seen = await adminUser.db.from('ratings').select('id')
    check('admin kan stadig ikke læse andres karakterer (kun antallet)', !seen.error && seen.data.length === 0)

    // ── Spærren: en vurdering oprettet efter kalenderens start nægtes slettet ──
    const test = await admin.from('ratings').insert({ user_id: plain.id, coffee_day: 1, score: 3, created_at: '2026-12-02T10:00:00Z' }).select().single()
    if (test.error) throw test.error
    const locked = await fetchResetStatus(adminUser.db)
    check('status: spærret, når der findes en vurdering fra efter 1. december', locked.locked === true && locked.total === before.length + 1, JSON.stringify(locked))

    let refused = ''
    try {
      await resetRatings(adminUser.db)
    } catch (e) {
      refused = (e as Error).message
    }
    check('nulstil afvises med dansk besked', /efter kalenderens start/.test(refused), refused)
    const after = (await admin.from('ratings').select('*', { count: 'exact', head: true })).count
    check('…og INTET blev slettet', after === before.length + 1, `${after} rækker`)
    await admin.from('ratings').delete().eq('id', test.data.id)
  } finally {
    // ── Oprydning og sikring af at dine data er intakte ──
    await deleteTestUsers(users)
    const { data: now } = await admin.from('ratings').select('*')
    const ids = new Set((now ?? []).map((r) => r.id))
    const missing = before.filter((r) => !ids.has(r.id))
    if (missing.length) {
      console.log(`\n⚠ ${missing.length} vurderinger manglede. Gendanner fra sikkerhedskopien…`)
      const { error: restoreErr } = await admin.from('ratings').insert(missing)
      check('gendannelse fra sikkerhedskopi', !restoreErr, restoreErr?.message)
    }
    const { count } = await admin.from('ratings').select('*', { count: 'exact', head: true })
    const { data: users2 } = await admin.auth.admin.listUsers({ perPage: 200 })
    const leftovers = users2.users.filter((u) => /^smoke-.*@example\.com$/.test(u.email ?? '')).length
    check(`dine ${before.length} vurderinger er intakte`, count === before.length, `${count} nu`)
    check('ingen testbrugere tilbage', leftovers === 0, `${leftovers}`)
  }

  console.log(c.failures === 0 ? '\nAlt består ✓' : `\n${c.failures} fejl ✗`)
  process.exitCode = c.failures === 0 ? 0 : 1
}

main().catch((err) => {
  console.error(`\nFEJL: ${(err as Error).message}`)
  process.exitCode = 1
})
