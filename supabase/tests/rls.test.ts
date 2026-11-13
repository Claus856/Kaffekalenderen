import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GROUP_CODE, asOwner, connectAs, createDb, setToday, users } from './helpers'

/**
 * Tester migrationerne i supabase/migrations/ mod en rigtig Postgres (PGlite) med
 * to-tre testbrugere. Hver regel fra kravspecifikationen har sin egen test.
 *
 *   alice = admin  ·  bob = almindelig bruger  ·  carol = logget ind men UDEN profil
 *   dave  = bruges til at teste oprettelse af profil
 */

let db: PGlite
const as = {
  alice: () => connectAs(db, users.alice),
  bob: () => connectAs(db, users.bob),
  carol: () => connectAs(db, users.carol),
  dave: () => connectAs(db, users.dave),
  anon: () => connectAs(db, null, 'anon'),
  service: () => connectAs(db, null, 'service_role'),
}

type Who = 'alice' | 'bob' | 'dave'

/** Giv karakter som en bruger (som klienten ville gøre det). */
function rate(who: Who, day: number, score: number, extra: Record<string, unknown> = {}) {
  const cols = ['user_id', 'coffee_day', 'score', ...Object.keys(extra)]
  const vals = [users[who], day, score, ...Object.values(extra)]
  return as[who]().rows(
    `insert into public.ratings (${cols.join(', ')}) values (${vals.map((_, i) => '$' + (i + 1)).join(', ')}) returning id`,
    vals,
  )
}

const days = (rows: Array<{ coffee_day: number }>) => rows.map((r) => Number(r.coffee_day)).sort((a, b) => a - b)

beforeAll(async () => {
  db = await createDb()

  await asOwner(
    db,
    `insert into auth.users (id, email) values ($1,'alice@test.dk'),($2,'bob@test.dk'),($3,'carol@test.dk'),($4,'dave@test.dk')`,
    [users.alice, users.bob, users.carol, users.dave],
  )
  await asOwner(
    db,
    `insert into public.coffees (day, name, country)
     select d, 'Kaffe ' || d, 'Land ' || d from generate_series(1, 25) d`,
  )
  await asOwner(db, `insert into public.coffee_notes (coffee_day, note) values (1,'kakao'),(4,'jasmin'),(25,'honning')`)
  await asOwner(
    db,
    `update public.settings set group_code_hash = extensions.crypt($1, extensions.gen_salt('bf')) where id`,
    [GROUP_CODE],
  )

  // Alice og Bob får profil gennem den rigtige funktion. Alice sættes til admin (som i README).
  expect((await as.alice().rows(`select public.create_profile('Alice', $1) as r`, [GROUP_CODE]))[0].r).toBe('ok')
  expect((await as.bob().rows(`select public.create_profile('Bob', $1) as r`, [GROUP_CODE]))[0].r).toBe('ok')
  await asOwner(db, `update public.profiles set is_admin = true where id = $1`, [users.alice])
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await asOwner(db, `truncate public.ratings, public.join_attempts`)
  await asOwner(db, `delete from public.profiles where id = $1`, [users.dave])
  await asOwner(db, `update public.settings set show_future_days = false, calendar_year = 2026 where id`)
  await asOwner(db, `update public.coffees set name = 'Kaffe ' || day, region = null, manual_fields = '{}'`)
  await setToday(db, '2026-12-03') // dag 1–3 er åbne
})

// ───────────────────────────────────────────────────────────────────────────
describe('Dato og låger (Europe/Copenhagen)', () => {
  it('cph_date regner i dansk tid, også omkring midnat og sommertid', async () => {
    const q = async (ts: string) =>
      String((await asOwner<{ d: Date }>(db, `select public.cph_date($1::timestamptz) as d`, [ts]))[0].d.toISOString()).slice(0, 10)

    expect(await q('2026-11-30T23:30:00Z')).toBe('2026-12-01') // 00:30 dansk vintertid
    expect(await q('2026-11-30T22:59:00Z')).toBe('2026-11-30') // 23:59 dansk tid
    expect(await q('2026-12-24T22:59:00Z')).toBe('2026-12-24')
    expect(await q('2026-12-24T23:00:00Z')).toBe('2026-12-25') // 00:00 den 25.
    expect(await q('2026-06-30T22:30:00Z')).toBe('2026-07-01') // sommertid (UTC+2)
  })

  it('today_cph() er cph_date(now()) i de rigtige migrationer', async () => {
    const fresh = await createDb() // uden setToday-overstyring
    try {
      const [r] = await asOwner<{ same: boolean }>(fresh, `select public.today_cph() = public.cph_date(now()) as same`)
      expect(r.same).toBe(true)
    } finally {
      await fresh.close()
    }
  })

  it('open_day_on: 0 før 1. dec, 1–25 i december, 25 på og efter 25. dec', async () => {
    const open = async (d: string) =>
      Number((await asOwner<{ n: number }>(db, `select public.open_day_on($1::date, 2026::smallint) as n`, [d]))[0].n)

    expect(await open('2026-11-30')).toBe(0)
    expect(await open('2026-12-01')).toBe(1)
    expect(await open('2026-12-03')).toBe(3)
    expect(await open('2026-12-24')).toBe(24)
    expect(await open('2026-12-25')).toBe(25)
    expect(await open('2026-12-31')).toBe(25)
    expect(await open('2027-01-05')).toBe(25)
  })

  it('open_day() følger today_cph() og er tilgængelig for indloggede', async () => {
    expect(Number((await as.bob().rows<{ n: number }>(`select public.open_day() as n`))[0].n)).toBe(3)
    await setToday(db, '2026-11-12')
    expect(Number((await as.bob().rows<{ n: number }>(`select public.open_day() as n`))[0].n)).toBe(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Profil og gruppekode', () => {
  it('uden profil giver RLS ingen adgang til noget', async () => {
    await rate('bob', 1, 4) // der findes en vurdering som carol ikke må se

    expect(await as.carol().rows(`select * from public.coffees`)).toHaveLength(0)
    expect(await as.carol().rows(`select * from public.coffee_notes`)).toHaveLength(0)
    expect(await as.carol().rows(`select * from public.ratings`)).toHaveLength(0)
    expect(await as.carol().rows(`select * from public.profiles`)).toHaveLength(0)
    expect(await as.carol().rows(`select id from public.settings`)).toHaveLength(0)
    expect(await as.carol().rows(`select * from public.participation()`)).toHaveLength(0)

    await expect(rate('dave', 1, 5)).rejects.toThrow(/row-level security/i) // dave har heller ingen profil
  })

  it('anon-rollen kan ikke læse eller skrive nogen tabel', async () => {
    for (const t of ['coffees', 'coffee_notes', 'ratings', 'profiles', 'settings', 'join_attempts']) {
      await expect(as.anon().rows(`select * from public.${t}`)).rejects.toThrow(/permission denied/i)
    }
    await expect(as.anon().rows(`select public.create_profile('Anon', 'x')`)).rejects.toThrow(/permission denied/i)
    await expect(as.anon().rows(`select public.open_day()`)).rejects.toThrow(/permission denied/i)
  })

  it('forkert gruppekode afvises og giver ingen profil', async () => {
    const [r] = await as.dave().rows<{ r: string }>(`select public.create_profile('Dave', 'forkert') as r`)
    expect(r.r).toBe('forkert_kode')
    expect(await asOwner(db, `select 1 from public.profiles where id = $1`, [users.dave])).toHaveLength(0)
  })

  it('rigtig gruppekode giver profil – uanset store/små bogstaver og mellemrum – og aldrig admin', async () => {
    const [r] = await as.dave().rows<{ r: string }>(`select public.create_profile('  Dave  ', '  KAFFE-2026 ') as r`)
    expect(r.r).toBe('ok')
    const [p] = await asOwner<{ display_name: string; is_admin: boolean }>(
      db,
      `select display_name, is_admin from public.profiles where id = $1`,
      [users.dave],
    )
    expect(p).toEqual({ display_name: 'Dave', is_admin: false })
  })

  it('man kan ikke oprette en profil mere, og visningsnavne er unikke (uden hensyn til store bogstaver)', async () => {
    expect((await as.bob().rows<{ r: string }>(`select public.create_profile('Bob2', $1) as r`, [GROUP_CODE]))[0].r).toBe(
      'har_allerede_profil',
    )
    expect((await as.dave().rows<{ r: string }>(`select public.create_profile('BOB', $1) as r`, [GROUP_CODE]))[0].r).toBe(
      'navn_optaget',
    )
    expect((await as.dave().rows<{ r: string }>(`select public.create_profile('x', $1) as r`, [GROUP_CODE]))[0].r).toBe(
      'ugyldigt_navn',
    )
  })

  it('uden gyldig login (ingen auth.uid) kan der ikke oprettes profil', async () => {
    const [r] = await connectAs(db, null, 'authenticated').rows<{ r: string }>(
      `select public.create_profile('Spøgelse', $1) as r`,
      [GROUP_CODE],
    )
    expect(r.r).toBe('ikke_logget_ind')
  })

  it('spærrer for gætteri: efter 10 forkerte forsøg afvises også den rigtige kode', async () => {
    for (let i = 0; i < 10; i++) {
      const [r] = await as.dave().rows<{ r: string }>(`select public.create_profile('Dave', $1) as r`, [`gæt-${i}`])
      expect(r.r).toBe('forkert_kode')
    }
    const [blocked] = await as.dave().rows<{ r: string }>(`select public.create_profile('Dave', $1) as r`, [GROUP_CODE])
    expect(blocked.r).toBe('for_mange_forsog')
    expect(await asOwner(db, `select 1 from public.profiles where id = $1`, [users.dave])).toHaveLength(0)
  })

  it('gruppekode-hashen kan ikke læses via API – heller ikke af admin', async () => {
    await expect(as.alice().rows(`select group_code_hash from public.settings`)).rejects.toThrow(/permission denied/i)
    await expect(as.alice().rows(`select * from public.settings`)).rejects.toThrow(/permission denied/i)
    const [s] = await as.alice().rows<{ show_future_days: boolean }>(`select id, show_future_days from public.settings`)
    expect(s.show_future_days).toBe(false)
  })

  it('kun admin kan skifte gruppekoden, og den nye kode virker', async () => {
    await expect(as.bob().rows(`select public.set_group_code('ny-kode-123')`)).rejects.toThrow(/Kun admin/)
    await expect(as.alice().rows(`select public.set_group_code('abc')`)).rejects.toThrow(/mindst 6 tegn/)

    await as.alice().rows(`select public.set_group_code('Ny-Kode-123')`)
    expect((await as.dave().rows<{ r: string }>(`select public.create_profile('Dave', $1) as r`, [GROUP_CODE]))[0].r).toBe(
      'forkert_kode',
    )
    expect((await as.dave().rows<{ r: string }>(`select public.create_profile('Dave', 'ny-kode-123') as r`))[0].r).toBe('ok')

    await asOwner(db, `update public.settings set group_code_hash = extensions.crypt($1, extensions.gen_salt('bf')) where id`, [
      GROUP_CODE,
    ])
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Skjulte karakterer', () => {
  it('andres ratings er skjulte, indtil man selv har stemt på samme dag', async () => {
    await rate('alice', 1, 5)

    expect(await as.bob().rows(`select * from public.ratings where coffee_day = 1`)).toHaveLength(0)
    expect(await as.bob().rows(`select * from public.ratings`)).toHaveLength(0)

    await rate('bob', 1, 2)

    const bobSees = await as.bob().rows<{ user_id: string; score: number }>(
      `select user_id, score from public.ratings where coffee_day = 1 order by score`,
    )
    expect(bobSees.map((r) => [r.user_id, Number(r.score)])).toEqual([
      [users.bob, 2],
      [users.alice, 5],
    ])
    // …og Alice kan nu også se Bobs
    expect(await as.alice().rows(`select * from public.ratings where coffee_day = 1`)).toHaveLength(2)
  })

  it('oplåsningen gælder kun den ene dag – ikke de andre', async () => {
    await rate('alice', 1, 5)
    await rate('alice', 2, 3)
    await rate('bob', 1, 4)

    expect(days(await as.bob().rows(`select coffee_day from public.ratings`))).toEqual([1, 1])
    expect(await as.bob().rows(`select * from public.ratings where coffee_day = 2`)).toHaveLength(0)
  })

  it('sletter man sin egen vurdering, skjules andres igen', async () => {
    await rate('alice', 1, 5)
    await rate('bob', 1, 4)
    expect(await as.bob().rows(`select * from public.ratings`)).toHaveLength(2)

    await as.bob().rows(`delete from public.ratings where coffee_day = 1`)
    expect(await as.bob().rows(`select * from public.ratings`)).toHaveLength(0)
  })

  it('admin får heller ingen genvej: også admin skal selv stemme først', async () => {
    await rate('bob', 1, 4)
    expect(await as.alice().rows(`select * from public.ratings`)).toHaveLength(0)
  })

  it('participation() viser hvem der har stemt – men aldrig karakter eller kommentar', async () => {
    await rate('alice', 2, 3, { comment: 'hemmelig' })

    const rows = await as.bob().rows<Record<string, unknown>>(`select * from public.participation()`)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(['coffee_day', 'user_id'])
    expect(rows[0].user_id).toBe(users.alice)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Egne ratings', () => {
  it('man kan ikke oprette en vurdering for en anden', async () => {
    await expect(
      as.bob().rows(`insert into public.ratings (user_id, coffee_day, score) values ($1, 1, 5)`, [users.alice]),
    ).rejects.toThrow(/row-level security/i)
  })

  it('user_id udfyldes automatisk med den indloggede, hvis klienten udelader den', async () => {
    const [r] = await as.bob().rows<{ user_id: string }>(
      `insert into public.ratings (coffee_day, score) values (1, 4) returning user_id`,
    )
    expect(r.user_id).toBe(users.bob)
  })

  it('man kan ikke rette eller slette en andens vurdering', async () => {
    await rate('alice', 1, 5)
    await rate('bob', 1, 3) // så Bob kan se Alices

    expect(await as.bob().rows(`update public.ratings set score = 1 where user_id = $1 returning id`, [users.alice])).toHaveLength(0)
    expect(await as.bob().rows(`delete from public.ratings where user_id = $1 returning id`, [users.alice])).toHaveLength(0)

    const [facit] = await asOwner<{ score: number }>(db, `select score from public.ratings where user_id = $1`, [users.alice])
    expect(Number(facit.score)).toBe(5)
  })

  it('man kan ikke give sin vurdering til en anden eller flytte den til en anden dag', async () => {
    await rate('bob', 1, 3)
    await expect(
      as.bob().rows(`update public.ratings set user_id = $1 where user_id = $2`, [users.alice, users.bob]),
    ).rejects.toThrow(/kan ikke ændres|row-level security/i)
    await expect(as.bob().rows(`update public.ratings set coffee_day = 2 where user_id = $1`, [users.bob])).rejects.toThrow(
      /kan ikke ændres/,
    )
  })

  it('man kan rette sin egen vurdering, og updated_at opdateres', async () => {
    await rate('bob', 1, 3)
    const [before] = await asOwner<{ updated_at: Date }>(db, `select updated_at from public.ratings where user_id = $1`, [users.bob])
    await new Promise((r) => setTimeout(r, 15))

    const [after] = await as.bob().rows<{ score: number; comment: string; fill_level: string; steep_minutes: number; updated_at: Date }>(
      `update public.ratings set score = 5, comment = 'Rettet', fill_level = 'strong', steep_minutes = 8
       where user_id = $1 returning score, comment, fill_level, steep_minutes, updated_at`,
      [users.bob],
    )
    expect([Number(after.score), after.comment, after.fill_level, Number(after.steep_minutes)]).toEqual([5, 'Rettet', 'strong', 8])
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime())
  })

  it('man kan slette sin egen vurdering', async () => {
    await rate('bob', 1, 3)
    expect(await as.bob().rows(`delete from public.ratings where user_id = $1 returning id`, [users.bob])).toHaveLength(1)
  })

  it('kun én vurdering pr. bruger pr. dag', async () => {
    await rate('bob', 1, 3)
    await expect(rate('bob', 1, 4)).rejects.toThrow(/duplicate key|unique/i)
  })

  it('score er kun hele tal 1–5', async () => {
    for (const bad of ['0', '6', '-1']) {
      await expect(rate('bob', 1, Number(bad))).rejects.toThrow(/check constraint/i)
    }
    // Halve point kan ikke gemmes: kolonnen er smallint. PostgREST sender tallet som tekst til Postgres.
    await expect(
      as.bob().rows(`insert into public.ratings (coffee_day, score) values (1, '3.5')`),
    ).rejects.toThrow(/invalid input syntax for type smallint/i)

    for (const good of [1, 2, 3, 4, 5]) {
      await asOwner(db, `delete from public.ratings`)
      expect(await rate('bob', 1, good)).toHaveLength(1)
    }
  })

  it('bryggeparametre har fornuftige standarder og grænser', async () => {
    const [r] = await as.bob().rows<{ fill_level: string; steep_minutes: number }>(
      `insert into public.ratings (coffee_day, score) values (1, 4) returning fill_level, steep_minutes`,
    )
    expect([r.fill_level, Number(r.steep_minutes)]).toEqual(['medium', 6])

    await asOwner(db, `delete from public.ratings`)
    await expect(rate('bob', 1, 4, { fill_level: 'extra-strong' })).rejects.toThrow(/invalid input value for enum/i)
    await expect(rate('bob', 1, 4, { steep_minutes: 0 })).rejects.toThrow(/check constraint/i)
    await expect(rate('bob', 1, 4, { steep_minutes: 61 })).rejects.toThrow(/check constraint/i)
    expect(await rate('bob', 1, 4, { steep_minutes: 11 })).toHaveLength(1) // "andet antal minutter"
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Ingen spoilere: fremtidige låger', () => {
  it('almindelige brugere ser kun åbne låger (dag 1–3 den 3. december)', async () => {
    expect(days(await as.bob().rows(`select day as coffee_day from public.coffees`))).toEqual([1, 2, 3])
    expect(await as.bob().rows(`select * from public.coffees where day = 4`)).toHaveLength(0)
    expect(await as.bob().rows(`select * from public.coffees where day = 25`)).toHaveLength(0)
    expect(await as.bob().rows(`select * from public.coffee_notes where coffee_day = 4`)).toHaveLength(0)
    expect(days(await as.bob().rows(`select coffee_day from public.coffee_notes`))).toEqual([1])
  })

  it('admin kan se alle 25 kaffer og deres smagsnoter', async () => {
    expect(await as.alice().rows(`select * from public.coffees`)).toHaveLength(25)
    expect(days(await as.alice().rows(`select coffee_day from public.coffee_notes`))).toEqual([1, 4, 25])
  })

  it('man kan ikke stemme på en fremtidig låge – heller ikke som admin', async () => {
    await expect(rate('bob', 4, 5)).rejects.toThrow(/row-level security/i)
    await expect(rate('bob', 25, 5)).rejects.toThrow(/row-level security/i)
    await expect(rate('alice', 4, 5)).rejects.toThrow(/row-level security/i)
  })

  it('man må gerne stemme på tidligere dage, hvis man er kommet bagud', async () => {
    await setToday(db, '2026-12-20')
    expect(await rate('bob', 1, 4)).toHaveLength(1)
    expect(await rate('bob', 7, 3)).toHaveLength(1)
  })

  it('før 1. december er ingen låger åbne for almindelige brugere – men admin kan rette data', async () => {
    await setToday(db, '2026-11-30')
    expect(await as.bob().rows(`select * from public.coffees`)).toHaveLength(0)
    await expect(rate('bob', 1, 4)).rejects.toThrow(/row-level security/i)
    expect(await as.alice().rows(`select * from public.coffees`)).toHaveLength(25)
  })

  it('1. december åbner dag 1; 25. december åbner dag 25', async () => {
    await setToday(db, '2026-12-01')
    expect(days(await as.bob().rows(`select day as coffee_day from public.coffees`))).toEqual([1])

    await setToday(db, '2026-12-24')
    expect(await as.bob().rows(`select * from public.coffees`)).toHaveLength(24)
    expect(await as.bob().rows(`select * from public.coffees where day = 25`)).toHaveLength(0)
    await expect(rate('bob', 25, 5)).rejects.toThrow(/row-level security/i)

    await setToday(db, '2026-12-25')
    expect(await as.bob().rows(`select * from public.coffees`)).toHaveLength(25)
    expect(await rate('bob', 25, 5)).toHaveLength(1)
  })

  it('efter jul er alle låger åbne (også i januar)', async () => {
    await setToday(db, '2027-01-03')
    expect(await as.bob().rows(`select * from public.coffees`)).toHaveLength(25)
  })

  it('"vis fremtidige låger" åbner alt for alle, og kan kun ændres af admin', async () => {
    // Bob forsøger – RLS filtrerer rækken væk, så intet ændres
    expect(await as.bob().rows(`update public.settings set show_future_days = true returning id`)).toHaveLength(0)
    expect(await as.bob().rows(`select * from public.coffees`)).toHaveLength(3)

    await as.alice().rows(`update public.settings set show_future_days = true`)
    expect(await as.bob().rows(`select * from public.coffees`)).toHaveLength(25)
    expect(await rate('bob', 25, 5)).toHaveLength(1)

    await as.alice().rows(`update public.settings set show_future_days = false`)
    expect(await as.bob().rows(`select * from public.coffees`)).toHaveLength(3)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('Rettigheder, admin og profiler', () => {
  it('man kan ikke gøre sig selv til admin', async () => {
    await expect(as.bob().rows(`update public.profiles set is_admin = true where id = $1`, [users.bob])).rejects.toThrow(
      /permission denied/i,
    )
  })

  it('profiler kan ikke oprettes eller slettes direkte', async () => {
    await expect(
      as.dave().rows(`insert into public.profiles (id, display_name, is_admin) values ($1, 'Dave', true)`, [users.dave]),
    ).rejects.toThrow(/permission denied/i)
    await expect(as.bob().rows(`delete from public.profiles where id = $1`, [users.bob])).rejects.toThrow(/permission denied/i)
  })

  it('man kan omdøbe sig selv, men ikke andre, og ikke til et navn der er taget', async () => {
    expect(await as.bob().rows(`update public.profiles set display_name = 'Bobby' where id = $1 returning id`, [users.bob])).toHaveLength(1)
    expect(await as.bob().rows(`update public.profiles set display_name = 'Hacker' where id = $1 returning id`, [users.alice])).toHaveLength(0)
    await expect(as.bob().rows(`update public.profiles set display_name = 'alice' where id = $1`, [users.bob])).rejects.toThrow(
      /duplicate key|unique/i,
    )
    await asOwner(db, `update public.profiles set display_name = 'Bob' where id = $1`, [users.bob])
  })

  it('medlemmer kan se hinandens navne', async () => {
    const names = (await as.bob().rows<{ display_name: string }>(`select display_name from public.profiles order by 1`)).map((r) => r.display_name)
    expect(names).toEqual(['Alice', 'Bob'])
  })

  it('kun admin kan oprette, rette og slette kaffer og smagsnoter', async () => {
    await expect(as.bob().rows(`insert into public.coffees (day, name) values (1, 'x')`)).rejects.toThrow(/row-level security|duplicate key/i)
    expect(await as.bob().rows(`update public.coffees set name = 'Hacket' where day = 1 returning day`)).toHaveLength(0)
    expect(await as.bob().rows(`delete from public.coffees where day = 1 returning day`)).toHaveLength(0)
    await expect(as.bob().rows(`insert into public.coffee_notes (coffee_day, note) values (1, 'hack')`)).rejects.toThrow(/row-level security/i)

    const [ok] = await as.alice().rows<{ name: string; manual_fields: string[] }>(
      `update public.coffees set name = 'Rettet af admin', manual_fields = array['name'] where day = 1 returning name, manual_fields`,
    )
    expect(ok).toEqual({ name: 'Rettet af admin', manual_fields: ['name'] })
    // Admin kan også rette en fremtidig kaffe
    expect(await as.alice().rows(`update public.coffees set region = 'Rettet' where day = 20 returning day`)).toHaveLength(1)
  })

  it('smagsnoter skal være normaliserede (små bogstaver, trimmet)', async () => {
    await expect(as.alice().rows(`insert into public.coffee_notes (coffee_day, note) values (1, 'Kakao')`)).rejects.toThrow(/check constraint/i)
    await expect(as.alice().rows(`insert into public.coffee_notes (coffee_day, note) values (1, ' kakao ')`)).rejects.toThrow(/check constraint/i)
  })

  it('join_attempts kan ikke læses eller skrives udefra', async () => {
    await expect(as.bob().rows(`select * from public.join_attempts`)).rejects.toThrow(/permission denied/i)
    await expect(as.bob().rows(`insert into public.join_attempts (success) values (true)`)).rejects.toThrow(/permission denied/i)
  })

  it('service_role (scraperen) kan upserte kaffer uden om RLS', async () => {
    const [r] = await as.service().rows<{ name: string }>(
      `insert into public.coffees (day, name) values (1, 'Fra scraper')
       on conflict (day) do update set name = excluded.name returning name`,
    )
    expect(r.name).toBe('Fra scraper')
  })

  it('sletter man en profil, forsvinder vedkommendes vurderinger (cascade)', async () => {
    await rate('bob', 1, 4)
    await asOwner(db, `delete from public.profiles where id = $1`, [users.bob])
    expect(await asOwner(db, `select * from public.ratings`)).toHaveLength(0)
    await asOwner(db, `insert into public.profiles (id, display_name) values ($1, 'Bob')`, [users.bob])
  })
})
