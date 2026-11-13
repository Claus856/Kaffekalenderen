import { FILL_DEFAULT_MINUTES, type FillLevel } from './format'

export const COMMENT_MAX = 1000
export const STEEP_MIN = 1
export const STEEP_MAX = 60

export interface RatingDraft {
  score: number | null
  fill: FillLevel
  steep: number
  comment: string
}

/** Standard svarer til databasens defaults: medium og 6 minutter. */
export const emptyDraft = (): RatingDraft => ({ score: null, fill: 'medium', steep: FILL_DEFAULT_MINUTES.medium, comment: '' })

export interface RatingValue {
  score: number
  fill_level: FillLevel
  steep_minutes: number
  comment: string | null
}

export type DraftCheck = { ok: true; value: RatingValue } | { ok: false; message: string }

export function validateDraft(d: RatingDraft): DraftCheck {
  if (d.score == null || !Number.isInteger(d.score) || d.score < 1 || d.score > 5) {
    return { ok: false, message: 'Vælg en karakter fra 1 til 5.' }
  }
  if (!Number.isInteger(d.steep) || d.steep < STEEP_MIN || d.steep > STEEP_MAX) {
    return { ok: false, message: `Trækketiden skal være et helt antal minutter mellem ${STEEP_MIN} og ${STEEP_MAX}.` }
  }
  const comment = d.comment.trim()
  if (comment.length > COMMENT_MAX) return { ok: false, message: `Kommentaren må højst være ${COMMENT_MAX} tegn.` }
  return { ok: true, value: { score: d.score, fill_level: d.fill, steep_minutes: d.steep, comment: comment || null } }
}

/**
 * Skifter man vandmængde, følger trækketiden med (4/6/8 min), men kun hvis man ikke selv har valgt en anden tid.
 */
export function steepAfterFillChange(prevFill: FillLevel, prevSteep: number, nextFill: FillLevel): number {
  return prevSteep === FILL_DEFAULT_MINUTES[prevFill] ? FILL_DEFAULT_MINUTES[nextFill] : prevSteep
}

/** Er trækketiden en af de tre hurtigknapper? Ellers vises feltet til "andet antal minutter". */
export const isQuickSteep = (minutes: number) => Object.values(FILL_DEFAULT_MINUTES).includes(minutes)

// ── Overblik til kalenderen ────────────────────────────────────────────────

export interface RatingRow {
  coffee_day: number
  user_id: string
  score: number
}

export interface DaySummary {
  /** min egen karakter, eller null hvis jeg ikke har stemt */
  mine: number | null
  /** gruppens snit. Kun kendt, når jeg selv har stemt (RLS skjuler ellers de andres karakterer) */
  avg: number | null
  /** antal karakterer jeg kan se */
  n: number
}

export const average = (nums: number[]): number | null => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)

/** Pr. dag: min karakter og gruppens snit, ud fra de rækker RLS giver mig lov at se. */
export function summarizeCalendar(rows: RatingRow[], myId: string): Map<number, DaySummary> {
  const byDay = new Map<number, RatingRow[]>()
  for (const r of rows) byDay.set(r.coffee_day, [...(byDay.get(r.coffee_day) ?? []), r])

  const out = new Map<number, DaySummary>()
  for (const [day, list] of byDay) {
    const mine = list.find((r) => r.user_id === myId)?.score ?? null
    // Har jeg ikke stemt, viser vi intet snit, selv hvis der af en eller anden grund skulle være rækker
    out.set(day, { mine, avg: mine == null ? null : average(list.map((r) => r.score)), n: list.length })
  }
  return out
}
