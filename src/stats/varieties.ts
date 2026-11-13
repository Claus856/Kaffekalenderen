/**
 * Varietet står som én tekst med flere sorter ("Bourbon, Catuai, Caturra") og med stavevarianter på tværs af
 * kaffer. Her deles den op og samles, så statistik pr. varietet ikke splittes af "Criola" / "Criolla" / "La Criolla".
 */
const SYNONYMS: Record<string, string> = {
  criola: 'Criolla',
  'la criolla': 'Criolla',
  tipica: 'Typica',
  'coffea arabica': 'Arabica',
}

export function normalizeVarieties(raw: string | null | undefined): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const part of raw.split(/[,;/]|\s+og\s+/i)) {
    const cleaned = part.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
    if (!cleaned) continue
    const key = cleaned.toLocaleLowerCase('da-DK')
    const canonical = SYNONYMS[key] ?? cleaned.charAt(0).toLocaleUpperCase('da-DK') + cleaned.slice(1)
    if (!out.includes(canonical)) out.push(canonical)
  }
  return out
}
