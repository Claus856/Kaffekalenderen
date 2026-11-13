import type { Enums } from './database.types'

export type FillLevel = Enums<'fill_level'>

export const FILL_LEVELS: FillLevel[] = ['mild', 'medium', 'strong']

export const FILL_LABELS: Record<FillLevel, string> = {
  mild: 'Mild',
  medium: 'Medium (300 ml)',
  strong: 'Strong',
}

/** Hurtigknapperne til trækketid: 4 min (mild), 6 min (medium), 8 min (strong). */
export const FILL_DEFAULT_MINUTES: Record<FillLevel, number> = { mild: 4, medium: 6, strong: 8 }

/** "1200–1700 m", "1700 m" eller null, hvis højden er ukendt. */
export function formatAltitude(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const lo = min ?? max!
  const hi = max ?? min!
  return lo === hi ? `${lo} m` : `${lo}–${hi} m`
}

/** Gennemsnit med dansk decimalkomma: 4.1 → "4,1" */
export function formatAverage(avg: number): string {
  return avg.toFixed(1).replace('.', ',')
}

export const formatMinutes = (n: number) => `${n} min`
