/**
 * Al statistik beregnes her, i klienten, ud fra de data brugeren har adgang til.
 * Fordi RLS skjuler andres karakterer for dage man selv ikke har stemt på, bygger alt automatisk kun på de dage.
 *
 * Definitioner:
 *  - Gennemsnit pr. gruppe (verdensdel, land, proces, varietet, note …) er "puljet": hver karakter tæller lige meget.
 *    n er antal karakterer, k antal forskellige kaffer i gruppen.
 *  - Spredning er stikprøve-standardafvigelsen (n − 1) og kræver mindst 2 karakterer.
 *  - Grupper med færre end MIN_N karakterer markeres ("low") og indgår ikke i topliste, bundliste m.v.
 *  - Korrelationer kræver mindst MIN_PAIRS par (2 punkter giver altid ±1 og siger intet).
 *  - Afvigelse fra gruppen: for hver karakter, forskellen til de ANDRES gennemsnit samme dag.
 */
import { continentForCountry } from '../lib/continents'
import { average } from '../lib/ratings'
import type { FillLevel } from '../lib/format'
import { linearRegression, mean, median, pearson, sd, type Regression } from './math'
import { normalizeVarieties } from './varieties'

export const MIN_N = 2
export const MIN_PAIRS = 3
export const UNKNOWN_CONTINENT = 'Blend / ukendt'

export interface StatCoffee {
  day: number
  name: string
  country: string | null
  region: string | null
  continent: string | null
  altitude_min: number | null
  altitude_max: number | null
  variety: string | null
  process: string | null
  roast: string | null
  notes: string[]
}
export interface StatRating {
  coffee_day: number
  user_id: string
  score: number
  fill_level: FillLevel
  steep_minutes: number
}
export interface StatMember {
  id: string
  display_name: string
}
export interface StatsInput {
  coffees: StatCoffee[]
  ratings: StatRating[]
  members: StatMember[]
  /** hvem har stemt på hvilke dage (hele gruppen, uden karakterer) */
  participation: Array<{ user_id: string; coffee_day: number }>
  openDay: number
  todayDoor: number
}

export interface CoffeeStat {
  day: number
  name: string
  country: string | null
  n: number
  mean: number
  median: number
  sd: number | null
  min: number
  max: number
  /** dem der gav højeste karakter. Tom ved n < 2 eller hvis alle er enige */
  lovers: string[]
  haters: string[]
  low: boolean
}

export interface Group {
  key: string
  mean: number
  n: number
  k: number
  low: boolean
}

export interface BrewStat {
  n: number
  fills: Record<FillLevel, number>
  typicalFill: FillLevel | null
  meanSteep: number | null
  /** korrelation mellem vandmængde (mild=1, medium=2, strong=3) og karakter */
  corrFill: number | null
  /** korrelation mellem trækketid og karakter */
  corrSteep: number | null
}

export interface RaterStat {
  id: string
  name: string
  n: number
  mean: number | null
  /** antal karakterer 1..5 (index 0 = karakter 1) */
  histogram: number[]
  deviation: { mad: number | null; signed: number | null; days: number }
  favContinent: Group | null
  leastContinent: Group | null
  favNote: Group | null
  leastNote: Group | null
  brew: BrewStat
}

export interface Twin {
  a: string
  b: string
  r: number | null
  /** antal fælles dage */
  n: number
}

export interface Stats {
  basedOnDays: number
  ratingCount: number
  coffees: CoffeeStat[]
  splitting: CoffeeStat[]
  agreement: CoffeeStat[]
  trend: Array<{ day: number; mean: number; n: number }>
  byContinent: Group[]
  byCountry: Group[]
  byProcess: Group[]
  byVariety: Group[]
  byRoast: Group[]
  byNote: Group[]
  notesTop: Group[]
  notesBottom: Group[]
  altitude: {
    points: Array<{ day: number; name: string; altitude: number; mean: number; n: number }>
    regression: Regression | null
    /** kaffer uden plads i grafen (færre end MIN_N karakterer eller ukendt højde) */
    hidden: number
  }
  raters: RaterStat[]
  overallHistogram: number[]
  overallBrew: BrewStat
  brewByFill: Array<{ fill: FillLevel; mean: number; n: number }>
  twins: Twin[]
  participation: Array<{ id: string; name: string; days: number; openDays: number }>
  missingToday: StatMember[]
}

const FILL_ORDINAL: Record<FillLevel, number> = { mild: 1, medium: 2, strong: 3 }
const FILL_TIE_ORDER: FillLevel[] = ['medium', 'mild', 'strong']

const byMeanThenN = (a: { mean: number; n: number; key?: string }, b: { mean: number; n: number; key?: string }) =>
  b.mean - a.mean || b.n - a.n || (a.key ?? '').localeCompare(b.key ?? '', 'da')

/** Karakter-gennemsnit pr. gruppe, hvor en kaffe kan tilhøre flere grupper (varietet, smagsnoter). */
function groupMeans(ratings: StatRating[], coffees: Map<number, StatCoffee>, keysFor: (c: StatCoffee) => string[]): Group[] {
  const acc = new Map<string, { scores: number[]; days: Set<number> }>()
  for (const r of ratings) {
    const c = coffees.get(r.coffee_day)
    if (!c) continue
    for (const key of keysFor(c)) {
      const g = acc.get(key) ?? { scores: [], days: new Set<number>() }
      g.scores.push(r.score)
      g.days.add(r.coffee_day)
      acc.set(key, g)
    }
  }
  return [...acc.entries()]
    .map(([key, g]) => ({ key, mean: mean(g.scores)!, n: g.scores.length, k: g.days.size, low: g.scores.length < MIN_N }))
    .sort(byMeanThenN)
}

/** Bedste og dårligste gruppe blandt dem med nok data. Den dårligste er null, hvis der kun er én. */
function bestAndWorst(groups: Group[]): { best: Group | null; worst: Group | null } {
  const ok = groups.filter((g) => !g.low)
  return { best: ok[0] ?? null, worst: ok.length >= 2 ? ok[ok.length - 1] : null }
}

function histogram(scores: number[]): number[] {
  const h = [0, 0, 0, 0, 0]
  for (const s of scores) if (s >= 1 && s <= 5) h[s - 1]++
  return h
}

export function brewStats(ratings: StatRating[]): BrewStat {
  const fills: Record<FillLevel, number> = { mild: 0, medium: 0, strong: 0 }
  for (const r of ratings) fills[r.fill_level]++
  const top = Math.max(...Object.values(fills))
  const typicalFill = ratings.length ? (FILL_TIE_ORDER.find((f) => fills[f] === top) ?? null) : null
  const scores = ratings.map((r) => r.score)
  const enough = ratings.length >= MIN_PAIRS
  return {
    n: ratings.length,
    fills,
    typicalFill,
    meanSteep: mean(ratings.map((r) => r.steep_minutes)),
    corrFill: enough ? pearson(ratings.map((r) => FILL_ORDINAL[r.fill_level]), scores) : null,
    corrSteep: enough ? pearson(ratings.map((r) => r.steep_minutes), scores) : null,
  }
}

export function computeStats(input: StatsInput): Stats {
  const { ratings, members } = input
  const coffees = new Map(input.coffees.map((c) => [c.day, c]))

  const ratingsByDay = new Map<number, StatRating[]>()
  const ratingsByUser = new Map<string, StatRating[]>()
  for (const r of ratings) {
    ratingsByDay.set(r.coffee_day, [...(ratingsByDay.get(r.coffee_day) ?? []), r])
    ratingsByUser.set(r.user_id, [...(ratingsByUser.get(r.user_id) ?? []), r])
  }

  // ── Kaffer ──
  const coffeeStats: CoffeeStat[] = []
  for (const [day, list] of ratingsByDay) {
    const scores = list.map((r) => r.score)
    const lo = Math.min(...scores)
    const hi = Math.max(...scores)
    const split = list.length >= MIN_N && hi > lo
    coffeeStats.push({
      day,
      name: coffees.get(day)?.name ?? `Låge ${day}`,
      country: coffees.get(day)?.country ?? null,
      n: list.length,
      mean: mean(scores)!,
      median: median(scores)!,
      sd: sd(scores),
      min: lo,
      max: hi,
      lovers: split ? list.filter((r) => r.score === hi).map((r) => r.user_id) : [],
      haters: split ? list.filter((r) => r.score === lo).map((r) => r.user_id) : [],
      low: list.length < MIN_N,
    })
  }
  const ranked = [...coffeeStats].sort((a, b) => b.mean - a.mean || b.n - a.n || a.day - b.day)
  const withSd = coffeeStats.filter((c) => !c.low && c.sd != null)
  const splitting = [...withSd].sort((a, b) => b.sd! - a.sd! || b.n - a.n || a.day - b.day).slice(0, 3)
  const agreement = [...withSd].sort((a, b) => a.sd! - b.sd! || b.n - a.n || a.day - b.day).slice(0, 3)
  const trend = [...coffeeStats].sort((a, b) => a.day - b.day).map((c) => ({ day: c.day, mean: c.mean, n: c.n }))

  // ── Grupper ──
  const byContinent = groupMeans(ratings, coffees, (c) => [c.continent ?? continentForCountry(c.country) ?? UNKNOWN_CONTINENT])
  const byCountry = groupMeans(ratings, coffees, (c) => (c.country ? [c.country] : []))
  const byProcess = groupMeans(ratings, coffees, (c) => (c.process ? [c.process] : []))
  const byVariety = groupMeans(ratings, coffees, (c) => normalizeVarieties(c.variety))
  const byRoast = groupMeans(ratings, coffees, (c) => (c.roast ? [c.roast] : []))
  const byNote = groupMeans(ratings, coffees, (c) => c.notes)

  const eligibleNotes = byNote.filter((g) => !g.low)
  const topCount = Math.min(5, Math.ceil(eligibleNotes.length / 2))
  const bottomCount = Math.min(5, Math.floor(eligibleNotes.length / 2))
  const notesTop = eligibleNotes.slice(0, topCount)
  const notesBottom = bottomCount ? eligibleNotes.slice(-bottomCount).reverse() : []

  // ── Højde mod karakter ──
  const points = coffeeStats
    .filter((c) => !c.low)
    .flatMap((c) => {
      const cf = coffees.get(c.day)
      const lo = cf?.altitude_min ?? cf?.altitude_max
      const hi = cf?.altitude_max ?? cf?.altitude_min
      return lo == null || hi == null ? [] : [{ day: c.day, name: c.name, altitude: (lo + hi) / 2, mean: c.mean, n: c.n }]
    })
    .sort((a, b) => a.altitude - b.altitude)
  const altitude = {
    points,
    regression: points.length >= MIN_PAIRS ? linearRegression(points.map((p) => p.altitude), points.map((p) => p.mean)) : null,
    hidden: coffeeStats.length - points.length,
  }

  // ── Bedømmerne ──
  const raters: RaterStat[] = members.map((m) => {
    const mine = ratingsByUser.get(m.id) ?? []
    const diffs: number[] = []
    for (const r of mine) {
      const others = (ratingsByDay.get(r.coffee_day) ?? []).filter((o) => o.user_id !== m.id).map((o) => o.score)
      if (others.length) diffs.push(r.score - average(others)!)
    }
    const continents = bestAndWorst(groupMeans(mine, coffees, (c) => [c.continent ?? continentForCountry(c.country) ?? UNKNOWN_CONTINENT]))
    const notes = bestAndWorst(groupMeans(mine, coffees, (c) => c.notes))
    return {
      id: m.id,
      name: m.display_name,
      n: mine.length,
      mean: average(mine.map((r) => r.score)),
      histogram: histogram(mine.map((r) => r.score)),
      deviation: {
        mad: average(diffs.map(Math.abs)),
        signed: average(diffs),
        days: diffs.length,
      },
      favContinent: continents.best,
      leastContinent: continents.worst,
      favNote: notes.best,
      leastNote: notes.worst,
      brew: brewStats(mine),
    }
  })

  // ── Smagstvillinger: korrelation mellem hvert par over de dage begge har stemt ──
  const twins: Twin[] = []
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = new Map((ratingsByUser.get(members[i].id) ?? []).map((r) => [r.coffee_day, r.score]))
      const b = new Map((ratingsByUser.get(members[j].id) ?? []).map((r) => [r.coffee_day, r.score]))
      const shared = [...a.keys()].filter((d) => b.has(d)).sort((x, y) => x - y)
      twins.push({
        a: members[i].id,
        b: members[j].id,
        n: shared.length,
        r: shared.length >= MIN_PAIRS ? pearson(shared.map((d) => a.get(d)!), shared.map((d) => b.get(d)!)) : null,
      })
    }
  }

  // ── Bryg ──
  const brewByFill = (['mild', 'medium', 'strong'] as FillLevel[])
    .map((fill) => {
      const scores = ratings.filter((r) => r.fill_level === fill).map((r) => r.score)
      return { fill, mean: mean(scores), n: scores.length }
    })
    .filter((x): x is { fill: FillLevel; mean: number; n: number } => x.mean != null)

  // ── Deltagelse (fra participation, så den dækker hele gruppen, også dage man selv ikke har stemt på) ──
  const openDays = Math.min(25, input.openDay)
  const daysByUser = new Map<string, Set<number>>()
  for (const p of input.participation) {
    if (p.coffee_day > openDays) continue
    const s = daysByUser.get(p.user_id) ?? new Set<number>()
    s.add(p.coffee_day)
    daysByUser.set(p.user_id, s)
  }
  const participation = members.map((m) => ({ id: m.id, name: m.display_name, days: daysByUser.get(m.id)?.size ?? 0, openDays }))
  const missingToday = input.todayDoor > 0 ? members.filter((m) => !daysByUser.get(m.id)?.has(input.todayDoor)) : []

  return {
    basedOnDays: ratingsByDay.size,
    ratingCount: ratings.length,
    coffees: ranked,
    splitting,
    agreement,
    trend,
    byContinent,
    byCountry,
    byProcess,
    byVariety,
    byRoast,
    byNote,
    notesTop,
    notesBottom,
    altitude,
    raters,
    overallHistogram: histogram(ratings.map((r) => r.score)),
    overallBrew: brewStats(ratings),
    brewByFill,
    twins,
    participation,
    missingToday,
  }
}

/** Navnet på et medlem. Bruges af visningen, så den ikke selv skal slå op. */
export const nameOf = (members: StatMember[], id: string) => members.find((m) => m.id === id)?.display_name ?? 'Ukendt'

/** Nærmeste og fjerneste smagstvilling for et medlem (kun par med nok fælles dage). */
export function twinsOf(stats: Stats, id: string): { closest: { id: string; r: number; n: number } | null; farthest: { id: string; r: number; n: number } | null } {
  const mine = stats.twins
    .filter((t) => (t.a === id || t.b === id) && t.r != null)
    .map((t) => ({ id: t.a === id ? t.b : t.a, r: t.r as number, n: t.n }))
    .sort((x, y) => y.r - x.r)
  return { closest: mine[0] ?? null, farthest: mine.length >= 2 ? mine[mine.length - 1] : null }
}
