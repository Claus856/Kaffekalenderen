import { CONTINENTS } from './continents'
import { splitNotes } from './notes'
import type { CoffeePatch, CoffeeWithNotes, EditableCoffeeField } from '../data/queries'

/** Formularens tilstand: alt som tekst, så felter kan stå tomme. */
export interface CoffeeForm {
  name: string
  country: string
  region: string
  continent: string
  altitude_min: string
  altitude_max: string
  variety: string
  process: string
  roast: string
  description: string
  image_url: string
  product_url: string
  notes: string
}

export const ROAST_OPTIONS = ['lys', 'medium-lys', 'medium', 'medium-mørk', 'mørk']

export const FIELD_LABELS: Record<EditableCoffeeField | 'notes', string> = {
  name: 'Navn',
  country: 'Land',
  region: 'Region',
  continent: 'Verdensdel',
  altitude_min: 'Højde, laveste (m)',
  altitude_max: 'Højde, højeste (m)',
  variety: 'Varietet',
  process: 'Proces',
  roast: 'Ristning',
  description: 'Beskrivelse',
  image_url: 'Billed-URL',
  product_url: 'Produkt-URL',
  notes: 'Smagsnoter (kommasepareret)',
}

const text = (v: string | null) => v ?? ''
const num = (v: number | null) => (v == null ? '' : String(v))

export function formFromCoffee(c: CoffeeWithNotes): CoffeeForm {
  return {
    name: c.name,
    country: text(c.country),
    region: text(c.region),
    continent: text(c.continent),
    altitude_min: num(c.altitude_min),
    altitude_max: num(c.altitude_max),
    variety: text(c.variety),
    process: text(c.process),
    roast: text(c.roast),
    description: text(c.description),
    image_url: text(c.image_url),
    product_url: text(c.product_url),
    notes: c.notes.join(', '),
  }
}

export type EditCheck =
  | { ok: true; patch: CoffeePatch; notes: string[] | null; changed: Array<EditableCoffeeField | 'notes'> }
  | { ok: false; message: string }

const orNull = (s: string) => (s.trim() === '' ? null : s.trim())

function parseAltitude(label: string, s: string): { ok: true; value: number | null } | { ok: false; message: string } {
  if (s.trim() === '') return { ok: true, value: null }
  const n = Number(s)
  if (!Number.isInteger(n) || n < 0 || n > 5000) return { ok: false, message: `${label} skal være et helt tal mellem 0 og 5000 meter.` }
  return { ok: true, value: n }
}

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s)

/** Tjekker formularen og finder præcis hvilke felter der er ændret i forhold til den gemte kaffe. */
export function checkCoffeeEdit(original: CoffeeWithNotes, form: CoffeeForm): EditCheck {
  if (form.name.trim() === '') return { ok: false, message: 'Kaffen skal have et navn.' }
  if (form.continent && !(CONTINENTS as readonly string[]).includes(form.continent)) return { ok: false, message: 'Ukendt verdensdel.' }
  if (form.roast && !ROAST_OPTIONS.includes(form.roast)) return { ok: false, message: 'Ukendt ristningsgrad.' }
  for (const f of ['image_url', 'product_url'] as const) {
    if (form[f].trim() && !isUrl(form[f].trim())) return { ok: false, message: `${FIELD_LABELS[f]} skal starte med http:// eller https://.` }
  }
  const min = parseAltitude(FIELD_LABELS.altitude_min, form.altitude_min)
  if (!min.ok) return min
  const max = parseAltitude(FIELD_LABELS.altitude_max, form.altitude_max)
  if (!max.ok) return max
  if (min.value != null && max.value != null && min.value > max.value) return { ok: false, message: 'Laveste højde må ikke være højere end højeste.' }

  const next: CoffeePatch = {
    name: form.name.trim(),
    country: orNull(form.country),
    region: orNull(form.region),
    continent: orNull(form.continent),
    altitude_min: min.value,
    altitude_max: max.value,
    variety: orNull(form.variety),
    process: orNull(form.process),
    roast: orNull(form.roast),
    description: orNull(form.description),
    image_url: orNull(form.image_url),
    product_url: orNull(form.product_url),
  }

  const patch: CoffeePatch = {}
  const changed: Array<EditableCoffeeField | 'notes'> = []
  for (const key of Object.keys(next) as EditableCoffeeField[]) {
    if (next[key] !== original[key]) {
      ;(patch as Record<string, unknown>)[key] = next[key]
      changed.push(key)
    }
  }

  const notes = splitNotes(form.notes)
  // Rækkefølgen er ligegyldig: databasen sorterer noterne alfabetisk, brugeren skriver dem i vilkårlig orden
  const notesChanged = [...notes].sort().join('|') !== [...original.notes].sort().join('|')
  if (notesChanged) changed.push('notes')

  return { ok: true, patch, notes: notesChanged ? notes : null, changed }
}

/** manual_fields efter en rettelse: de gamle plus de nyligt rettede, uden dubletter. */
export const mergeManualFields = (existing: string[], changed: string[]): string[] => [...new Set([...existing, ...changed])]
