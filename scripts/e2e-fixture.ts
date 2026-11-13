/**
 * Kendt testdatasæt i det RIGTIGE Supabase-projekt, til slut-test på mobil:   npm run e2e -- <kommando>
 *
 *   seed        opret 4 testbrugere (Anna=admin, Bo, Carl, Dorte), stem på dag 1–4 og åbn alle låger
 *   otp <navn>  ny engangskode til en testbruger (så man kan logge ind i appen uden mail)
 *   doors open|close   åbn alle låger / følg datoen igen (show_future_days)
 *   cleanup     slet testbrugerne og deres karakterer, gendan indstillingen og dag 21
 *
 * Testbrugerne hedder smoke-e2e-…@example.com. Cleanup finder dem på navnet, så den virker også efter en afbrudt test.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { admin, otpFor } from './lib/testkit'

const STATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.cache', 'e2e-state.json')
const USERS = [
  { name: 'Anna', admin: true },
  { name: 'Bo', admin: false },
  { name: 'Carl', admin: false },
  { name: 'Dorte', admin: false },
]
const email = (name: string) => `smoke-e2e-${name.toLowerCase()}@example.com`

type Fill = 'mild' | 'medium' | 'strong'
const MIN: Record<Fill, number> = { mild: 4, medium: 6, strong: 8 }

/**
 *            dag 1    dag 2    dag 3    dag 4
 *   Anna      5        2        4        3
 *   Bo        4        3        4        5
 *   Carl      3        2        5        –
 *   Dorte     4        3        3        4
 */
const VOTES: Array<[string, number, number, Fill, string | null]> = [
  ['Anna', 1, 5, 'strong', 'Fantastisk!'], ['Anna', 2, 2, 'mild', null], ['Anna', 3, 4, 'medium', null], ['Anna', 4, 3, 'medium', null],
  ['Bo', 1, 4, 'medium', null], ['Bo', 2, 3, 'medium', 'Lidt syrlig'], ['Bo', 3, 4, 'medium', null], ['Bo', 4, 5, 'strong', null],
  ['Carl', 1, 3, 'mild', null], ['Carl', 2, 2, 'mild', null], ['Carl', 3, 5, 'strong', 'Bedst indtil videre'],
  ['Dorte', 1, 4, 'medium', null], ['Dorte', 2, 3, 'medium', null], ['Dorte', 3, 3, 'medium', null], ['Dorte', 4, 4, 'medium', null],
]

async function findUsers() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 })
  return data.users.filter((u) => /^smoke-e2e-.*@example\.com$/.test(u.email ?? ''))
}

async function setDoors(open: boolean) {
  const r = await admin.from('settings').update({ show_future_days: open }).eq('id', true)
  if (r.error) throw r.error
  console.log(`show_future_days = ${open}`)
}

async function seed() {
  if ((await findUsers()).length) throw new Error('Der findes allerede testbrugere. Kør cleanup først.')

  const coffee21 = await admin.from('coffees').select('*').eq('day', 21).single()
  if (coffee21.error) throw coffee21.error
  fs.mkdirSync(path.dirname(STATE), { recursive: true })
  fs.writeFileSync(STATE, JSON.stringify({ coffee21: coffee21.data }, null, 2))

  const ids = new Map<string, string>()
  for (const u of USERS) {
    const created = await admin.auth.admin.createUser({ email: email(u.name), email_confirm: true })
    if (created.error || !created.data.user) throw new Error(`createUser ${u.name}: ${created.error?.message}`)
    ids.set(u.name, created.data.user.id)
    const p = await admin.from('profiles').insert({ id: created.data.user.id, display_name: u.name, is_admin: u.admin })
    if (p.error) throw p.error
  }

  await setDoors(true) // først nu, så RLS tillader karakterer for dag 1–4 (insert som service role omgår RLS, men appen skal kunne vise dem)
  const rows = VOTES.map(([name, coffee_day, score, fill_level, comment]) => ({
    user_id: ids.get(name)!, coffee_day, score, fill_level, steep_minutes: MIN[fill_level], comment,
  }))
  const r = await admin.from('ratings').insert(rows)
  if (r.error) throw r.error
  console.log(`oprettet ${USERS.length} testbrugere og ${rows.length} karakterer`)
}

async function cleanup() {
  const users = await findUsers()
  for (const u of users) {
    await admin.from('join_attempts').delete().eq('user_id', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
  await setDoors(false)

  if (fs.existsSync(STATE)) {
    const { coffee21 } = JSON.parse(fs.readFileSync(STATE, 'utf8'))
    const { day: _day, ...original } = coffee21
    const r = await admin.from('coffees').update(original).eq('day', 21)
    if (r.error) throw r.error
    // smagsnoter kan være ændret af admin-testen: gendan dem fra scraperens data i cachen er unødvendigt, de ændres ikke af testen
    fs.rmSync(STATE)
    console.log('dag 21 gendannet')
  }

  const left = (await findUsers()).length
  const { data: s } = await admin.from('settings').select('show_future_days').single()
  const { data: members } = await admin.from('profiles').select('display_name')
  console.log(`slettet ${users.length} testbrugere. Tilbage: ${left} testbrugere, show_future_days=${s?.show_future_days}, profiler: ${members?.map((m) => m.display_name).join(', ')}`)
  if (left !== 0 || s?.show_future_days !== false) process.exitCode = 1
}

const [cmd, arg] = process.argv.slice(2)
try {
  if (cmd === 'seed') await seed()
  else if (cmd === 'otp') console.log(await otpFor(email(arg)))
  else if (cmd === 'doors') await setDoors(arg === 'open')
  else if (cmd === 'cleanup') await cleanup()
  else console.log('Brug: seed | otp <navn> | doors open|close | cleanup')
} catch (err) {
  console.error(`FEJL: ${(err as Error).message}`)
  process.exitCode = 1
}
