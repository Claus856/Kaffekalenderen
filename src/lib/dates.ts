/**
 * Datoer og "dagens låge" i Europe/Copenhagen.
 *
 * Databasen er den egentlige kilde til hvilke låger der er åbne (funktionen open_day() i RLS).
 * Her regnes kun det klienten selv skal bruge: dagens dato i Danmark, en nedtælling og hvilken låge
 * der er "i dag", så man ikke ser den forkerte, hvis admin har åbnet alle låger (settings.show_future_days).
 */

export const LAST_DAY = 25
/** Kalenderens år. Skal passe til settings.calendar_year i databasen. */
export const CALENDAR_YEAR = 2026

/** Dagens dato i Danmark som YYYY-MM-DD, uanset hvilken tidszone telefonen står i. */
export function todayInCopenhagen(now: Date = new Date()): string {
  // sv-SE giver ISO-format (YYYY-MM-DD)
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

/** Kalenderdag efter uret: 0 før 1. december, 1–25 i december, 25 på og efter 25. december. */
export function clockDay(iso: string, year: number = CALENDAR_YEAR): number {
  const { y, m, d } = parseIso(iso)
  if (y < year || (y === year && m < 12)) return 0
  if (y > year) return LAST_DAY
  return Math.min(LAST_DAY, d)
}

export type Phase = 'before' | 'during' | 'after'

export function phaseOf(iso: string, year: number = CALENDAR_YEAR): Phase {
  const { y, m, d } = parseIso(iso)
  if (y < year || (y === year && m < 12)) return 'before'
  if (y > year || d > LAST_DAY) return 'after'
  return 'during'
}

/** Antal dage til 1. december (0 hvis den er i dag eller allerede passeret). */
export function daysUntilStart(iso: string, year: number = CALENDAR_YEAR): number {
  const { y, m, d } = parseIso(iso)
  const diff = (Date.UTC(year, 11, 1) - Date.UTC(y, m - 1, d)) / 86_400_000
  return Math.max(0, Math.round(diff))
}

/**
 * Hvilken låge er "i dag"? Højst den serveren har åbnet, og højst den uret siger.
 * Før 1. december med alt åbnet (testtilstand) bruges den højeste åbne låge.
 * Returnerer 0, hvis intet er åbent.
 */
export function todaysDoor(openDay: number, clock: number): number {
  if (openDay <= 0) return 0
  if (clock <= 0) return openDay
  return Math.min(openDay, clock)
}

export function formatDoorDate(day: number, year: number = CALENDAR_YEAR): string {
  return `${day}. december ${year}`
}
