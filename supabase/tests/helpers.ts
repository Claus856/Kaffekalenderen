import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url))
const stubSql = readFileSync(new URL('./stub.sql', import.meta.url), 'utf8')

export const GROUP_CODE = 'kaffe-2026'

export const users = {
  alice: 'aaaaaaaa-0000-4000-8000-000000000001', // admin
  bob: 'bbbbbbbb-0000-4000-8000-000000000002',
  carol: 'cccccccc-0000-4000-8000-000000000003', // logget ind, men uden profil
  dave: 'dddddddd-0000-4000-8000-000000000004',
} as const

/** Tom database med stub + ALLE rigtige migrationer i filnavnsrækkefølge. */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(stubSql)
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    await db.exec(readFileSync(migrationsDir + f, 'utf8'))
  }
  return db
}

type Role = 'authenticated' | 'anon' | 'service_role'

/**
 * En "forbindelse" som en bestemt bruger. Ligesom PostgREST sætter den
 * JWT-claims og skifter til rollen authenticated/anon, så RLS gælder fuldt ud.
 */
export function connectAs(db: PGlite, uid: string | null, role: Role = 'authenticated') {
  const claims = uid ? JSON.stringify({ sub: uid, role }) : ''
  return {
    async rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      await db.exec('reset role')
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
      await db.exec(`set role ${role}`)
      try {
        return (await db.query<T>(sql, params)).rows
      } finally {
        await db.exec('reset role')
      }
    },
  }
}

/** Kør som database-ejer (RLS omgås). Bruges til opsætning og til at tjekke facit. */
export async function asOwner<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.exec('reset role')
  return (await db.query<T>(sql, params)).rows
}

/** "Flyt uret": erstatter today_cph() så alle policies regner ud fra den angivne danske dato. */
export async function setToday(db: PGlite, isoDate: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`Ugyldig dato: ${isoDate}`)
  await db.exec('reset role')
  await db.exec(`
    create or replace function public.today_cph() returns date
    language sql stable set search_path = ''
    as $$ select '${isoDate}'::date $$;
  `)
}
