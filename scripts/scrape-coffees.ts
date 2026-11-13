/**
 * Henter de 25 kaffer fra BREW Companys kaffekalender og gemmer dem i Supabase.
 *
 *   npm run scrape                 hent + upsert til Supabase (kræver .env med service-role-nøglen)
 *   npm run scrape:dry             hent + parse + opsummering, uden at røre databasen
 *   npm run scrape -- --refresh    ignorér den lokale cache og hent alt igen
 *   npm run scrape -- --days=1-5,25   kun enkelte dage
 *   npm run scrape -- --delay=4000    pause mellem kald i ms (standard 3000)
 *
 * Kan køres igen uden dubletter (upsert på dag). Felter en admin har rettet i hånden
 * (coffees.manual_fields) overskrives ikke.
 *
 * Service-role-nøglen læses KUN her, fra .env, og bruges aldrig i frontend-koden.
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PoliteFetcher } from './lib/http'
import {
  SITE,
  buildCoffee,
  fallbackHandles,
  pageUrl,
  parsePage,
  parseProductJson,
  pickProductHandle,
  productUrl,
  type Issue,
  type ParsedCoffee,
  type ProductData,
} from './lib/parse'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache')
const OUT_DIR = path.join(ROOT, 'scripts', 'out')

// ── Argumenter ─────────────────────────────────────────────────────────────

function parseDays(spec: string): number[] {
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim())
    if (!m) throw new Error(`Ugyldig --days: "${spec}" (brug fx 1-5,25)`)
    const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])]
    for (let d = a; d <= b; d++) {
      if (d < 1 || d > 25) throw new Error(`Dag ${d} er uden for 1–25`)
      out.add(d)
    }
  }
  return [...out].sort((x, y) => x - y)
}

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(`--${name}`)
const value = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const DRY_RUN = flag('dry-run')
const REFRESH = flag('refresh')
const DELAY_MS = Number(value('delay') ?? 3000)
const DAYS = value('days') ? parseDays(value('days')!) : Array.from({ length: 25 }, (_, i) => i + 1)

const log = (msg = '') => console.log(msg)

// ── Hent og parse én dag ───────────────────────────────────────────────────

interface DayResult {
  day: number
  ok: boolean
  error?: string
  parsed?: ParsedCoffee
}

async function scrapeDay(day: number, fetcher: PoliteFetcher): Promise<DayResult> {
  const url = pageUrl(day)
  let html: string
  try {
    const res = await fetcher.get(url, `page-${day}.html`)
    if (res.status !== 200) return { day, ok: false, error: `HTTP ${res.status} på ${url}` }
    html = res.body
  } catch (err) {
    return { day, ok: false, error: (err as Error).message }
  }

  let page
  try {
    page = parsePage(html)
  } catch (err) {
    return { day, ok: false, error: `Kunne ikke parse siden: ${(err as Error).message}` }
  }

  // Produktet: kryds-tjek, rent pakkebillede og produkt-URL
  const extra: Issue[] = []
  let product: ProductData | null = null
  let productHref: string | null = null

  const pageHandle = pickProductHandle(page.productLinks)
  if (!pageHandle) {
    extra.push({ level: 'warn', msg: 'ingen produktlink på siden (product_url = null)' })
  } else {
    let allNotFound = true
    for (const handle of [pageHandle, ...fallbackHandles(pageHandle)]) {
      try {
        const res = await fetcher.get(`${SITE}/products/${handle}.json`, `product-${handle}.json`)
        if (res.status === 200) {
          product = parseProductJson(res.body)
          productHref = productUrl(handle)
          if (handle !== pageHandle) {
            extra.push({ level: 'warn', msg: `produktlinket på siden (/products/${pageHandle}) findes ikke (404). Bruger /products/${handle} i stedet` })
          }
          allNotFound = false
          break
        }
        if (res.status !== 404) allNotFound = false
      } catch (err) {
        allNotFound = false
        extra.push({ level: 'warn', msg: `produkt-JSON for ${handle} kunne ikke hentes: ${(err as Error).message}` })
      }
    }
    if (!product) {
      if (allNotFound) {
        extra.push({ level: 'warn', msg: `produktlinket på siden (/products/${pageHandle}) er dødt (404) og ingen fallback fundet. product_url = null` })
      } else {
        productHref = productUrl(pageHandle)
        extra.push({ level: 'warn', msg: `produktet kunne ikke verificeres. product_url er linket fra siden (/products/${pageHandle}), billedet er fra siden` })
      }
    }
  }

  const parsed = buildCoffee(day, page, product, productHref)
  parsed.issues.push(...extra)
  return { day, ok: true, parsed }
}

// ── Supabase ───────────────────────────────────────────────────────────────

function makeClient(): { client: SupabaseClient; host: string } {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Mangler SUPABASE_URL og/eller SUPABASE_SERVICE_ROLE_KEY i .env (se .env.example). Kør med --dry-run for at se resultatet uden at skrive til databasen.',
    )
  }
  // Fang den klassiske forveksling: anon-nøglen i stedet for service-role-nøglen
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const role = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role
      if (role !== 'service_role') {
        throw new Error(`SUPABASE_SERVICE_ROLE_KEY har rollen "${role}". Den skal være service_role-nøglen, ikke anon-nøglen.`)
      }
    } catch (err) {
      if ((err as Error).message.startsWith('SUPABASE_SERVICE_ROLE_KEY')) throw err
    }
  }
  return {
    client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    host: new URL(url).host,
  }
}

interface DbResult {
  day: number
  ok: boolean
  error?: string
  keptManual: string[]
}

async function writeToSupabase(client: SupabaseClient, results: DayResult[]): Promise<DbResult[]> {
  const days = results.filter((r) => r.ok).map((r) => r.day)
  const { data: existingRows, error: readErr } = await client.from('coffees').select('*').in('day', days)
  if (readErr) throw new Error(`Kunne ikke læse eksisterende kaffer: ${readErr.message}`)
  const existing = new Map((existingRows ?? []).map((r) => [r.day as number, r]))

  const out: DbResult[] = []
  for (const r of results) {
    if (!r.ok || !r.parsed) continue
    const { record, notes } = r.parsed
    const prev = existing.get(r.day)
    const manual: string[] = prev?.manual_fields ?? []
    const keptManual: string[] = []

    const payload: Record<string, unknown> = { ...record, scraped_at: new Date().toISOString() }
    for (const f of manual) {
      if (f !== 'notes' && prev && f in record) {
        payload[f] = prev[f]
        keptManual.push(f)
      }
    }

    const { error } = await client.from('coffees').upsert(payload, { onConflict: 'day' })
    if (error) {
      out.push({ day: r.day, ok: false, error: error.message, keptManual })
      continue
    }

    if (manual.includes('notes')) {
      keptManual.push('notes')
    } else {
      // Fjern forældede noter først, tilføj derefter nye. Aldrig et øjeblik uden noter.
      const { data: cur, error: curErr } = await client.from('coffee_notes').select('note').eq('coffee_day', r.day)
      if (curErr) {
        out.push({ day: r.day, ok: false, error: `noter: ${curErr.message}`, keptManual })
        continue
      }
      const stale = (cur ?? []).map((n) => n.note as string).filter((n) => !notes.includes(n))
      if (stale.length) {
        const { error: delErr } = await client.from('coffee_notes').delete().eq('coffee_day', r.day).in('note', stale)
        if (delErr) {
          out.push({ day: r.day, ok: false, error: `noter (slet): ${delErr.message}`, keptManual })
          continue
        }
      }
      if (notes.length) {
        const { error: noteErr } = await client
          .from('coffee_notes')
          .upsert(notes.map((note) => ({ coffee_day: r.day, note })), { onConflict: 'coffee_day,note', ignoreDuplicates: true })
        if (noteErr) {
          out.push({ day: r.day, ok: false, error: `noter: ${noteErr.message}`, keptManual })
          continue
        }
      }
    }
    out.push({ day: r.day, ok: true, keptManual })
  }
  return out
}

// ── Opsummering ────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

const fmtAlt = (p: ParsedCoffee) =>
  p.record.altitude_min == null ? '–' : p.record.altitude_min === p.record.altitude_max ? `${p.record.altitude_min}` : `${p.record.altitude_min}–${p.record.altitude_max}`

function printSummary(results: DayResult[], db: DbResult[] | null, fetcher: PoliteFetcher, mode: string) {
  const ok = results.filter((r) => r.ok && r.parsed)
  const failed = results.filter((r) => !r.ok)

  log()
  log('═══ Kaffekalenderen · scraper-opsummering ═══')
  log(`Tilstand:   ${mode}`)
  log(`Netværk:    ${fetcher.networkCalls} kald, ${fetcher.cacheHits} fra cache`)
  log(`Parset:     ${ok.length}/${results.length} dage  (${ok.map((r) => r.day).join(', ') || 'ingen'})`)
  if (failed.length) {
    log(`FEJLET:     ${failed.length} dage`)
    for (const f of failed) log(`  dag ${f.day}: ${f.error}`)
  }
  if (db) {
    const dbOk = db.filter((d) => d.ok)
    log(`Database:   ${dbOk.length}/${ok.length} dage gemt`)
    for (const d of db.filter((x) => !x.ok)) log(`  dag ${d.day}: ${d.error}`)
    for (const d of db.filter((x) => x.keptManual.length)) log(`  dag ${d.day}: manuelle rettelser bevaret (${d.keptManual.join(', ')})`)
  }

  log()
  log('Pr. dag')
  log('Dag  Land (region)'.padEnd(52) + 'Verdensdel'.padEnd(20) + 'Højde (m)'.padEnd(11) + 'Proces'.padEnd(12) + 'Noter  Mangler')
  for (const r of ok) {
    const p = r.parsed!
    log(
      String(r.day).padEnd(5) +
        p.record.name.slice(0, 46).padEnd(47) +
        (p.record.continent ?? '–').padEnd(20) +
        fmtAlt(p).padEnd(11) +
        (p.record.process ?? '–').padEnd(12) +
        String(p.notes.length).padEnd(7) +
        (p.missing.length ? p.missing.join(', ') : '–'),
    )
  }

  log()
  log('Felter der mangler (antal dage)')
  const missingCount = new Map<string, number>()
  for (const r of ok) for (const m of r.parsed!.missing) missingCount.set(m, (missingCount.get(m) ?? 0) + 1)
  if (missingCount.size === 0) log('  ingen')
  for (const [f, n] of [...missingCount].sort((a, b) => b[1] - a[1])) log(`  ${f.padEnd(16)} ${n}/${ok.length}`)

  const warnings = ok.flatMap((r) => r.parsed!.issues.filter((i) => i.level === 'warn').map((i) => ({ day: r.day, msg: i.msg })))
  // ristning-advarslen er ens på alle dage: vis den én gang
  const roastWarn = warnings.filter((w) => w.msg.startsWith('ristning:'))
  const otherWarn = warnings.filter((w) => !w.msg.startsWith('ristning:'))
  log()
  log(`Advarsler (${otherWarn.length}${roastWarn.length ? ` + ristning på ${roastWarn.length} dage` : ''})`)
  if (roastWarn.length) log(`  ristning (${roastWarn.length} dage): ${roastWarn[0].msg.replace(/^ristning: /, '')}`)
  for (const w of otherWarn) log(`  dag ${w.day}: ${w.msg}`)
  const infos = ok.flatMap((r) => r.parsed!.issues.filter((i) => i.level === 'info').map((i) => ({ day: r.day, msg: i.msg })))
  if (infos.length) {
    log()
    log(`Bemærkninger (${infos.length})`)
    for (const i of infos) log(`  dag ${i.day}: ${i.msg}`)
  }

  const unmapped = [...new Set(ok.filter((r) => r.parsed!.record.country && !r.parsed!.record.continent).map((r) => r.parsed!.record.country!))]
  log()
  log(`Lande uden verdensdel: ${unmapped.length ? unmapped.join(', ') + '  → tilføj i src/lib/continents.ts' : 'ingen'}`)

  const noteCount = new Map<string, number>()
  for (const r of ok) for (const n of r.parsed!.notes) noteCount.set(n, (noteCount.get(n) ?? 0) + 1)
  const distinct = [...noteCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'da'))
  log()
  log(`Smagsnoter efter normalisering: ${distinct.length} forskellige`)
  log('  ' + distinct.map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(' · '))
  const names = distinct.map(([n]) => n)
  const near: string[] = []
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [names[i], names[j]]
      const close = Math.min(a.length, b.length) >= 5 && levenshtein(a, b) <= 2
      const contains = new RegExp(`(^|\\s)${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(a) || new RegExp(`(^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(b)
      if (close || contains) near.push(`${a} ~ ${b}`)
    }
  log(`Mulige dubletter at slå sammen (NOTE_SYNONYMS i src/lib/notes.ts): ${near.length ? near.join(' · ') : 'ingen fundet'}`)

  const dist = (key: 'process' | 'variety' | 'region') => {
    const m = new Map<string, number>()
    for (const r of ok) {
      const v = r.parsed!.record[key]
      if (v) m.set(v, (m.get(v) ?? 0) + 1)
    }
    return [...m].map(([v, c]) => (c > 1 ? `${v} ×${c}` : v)).join(' · ')
  }
  log()
  log(`Processer:  ${dist('process')}`)
  log(`Varieteter: ${dist('variety')}`)

  const seen = new Map<string, number[]>()
  for (const r of ok) {
    const k = `${r.parsed!.record.country}|${r.parsed!.record.region}`
    seen.set(k, [...(seen.get(k) ?? []), r.day])
  }
  const dups = [...seen].filter(([, d]) => d.length > 1)
  if (dups.length) {
    log()
    log(`Samme land+region på flere dage (tjek at det ikke er en fejl): ${dups.map(([k, d]) => `${k.replace('|', ' / ')} (dag ${d.join(', ')})`).join(' · ')}`)
  }
  log()
  log(`Fuldt output med alle felter, noter og advarsler: ${path.relative(ROOT, path.join(OUT_DIR, 'coffees.json'))}`)
  log()
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const mode = DRY_RUN ? 'DRY-RUN (intet skrives til Supabase)' : 'UPSERT til Supabase'

  // Fejl tidligt, hvis nøglerne mangler. Hellere det end 25 sider hentet til ingen nytte.
  let supa: { client: SupabaseClient; host: string } | null = null
  if (!DRY_RUN) supa = makeClient()

  log(`Henter ${DAYS.length} dage fra ${SITE} (pause ${DELAY_MS} ms mellem kald${REFRESH ? ', ignorerer cache' : ', bruger cache hvor den findes'})`)
  const fetcher = new PoliteFetcher({ cacheDir: CACHE_DIR, delayMs: DELAY_MS, refresh: REFRESH, log })

  const results: DayResult[] = []
  for (const day of DAYS) {
    const r = await scrapeDay(day, fetcher)
    results.push(r)
    log(r.ok ? `  ✓ dag ${String(day).padStart(2)}  ${r.parsed!.record.name}` : `  ✗ dag ${String(day).padStart(2)}  ${r.error}`)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(OUT_DIR, 'coffees.json'),
    JSON.stringify(
      results.map((r) => (r.ok ? { day: r.day, ...r.parsed } : { day: r.day, error: r.error })),
      null,
      2,
    ),
  )

  let db: DbResult[] | null = null
  if (supa) db = await writeToSupabase(supa.client, results)

  printSummary(results, db, fetcher, supa ? `${mode} (${supa.host})` : mode)

  if (results.some((r) => !r.ok) || db?.some((d) => !d.ok)) process.exitCode = 1
}

main().catch((err) => {
  console.error(`\nFEJL: ${(err as Error).message}`)
  process.exit(1)
})
