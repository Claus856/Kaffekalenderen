/**
 * Normalisering af smagsnoter. Bruges af scraperen og af admin-siden, så
 * statistik pr. note ikke splittes af stavemåder ("Mørk chokolade" / "mørkchokolade").
 *
 * Regler: små bogstaver, trimmet, mellemrum slået sammen, og synonymer samlet under ét navn.
 */

/** variant → kanonisk note. Begge sider skal være normaliserede (små bogstaver). Udvid efter behov. */
export const NOTE_SYNONYMS: Record<string, string> = {
  // chokolade
  'mørkchokolade': 'mørk chokolade',
  'mørk choklade': 'mørk chokolade',
  'mørk chocolade': 'mørk chokolade',
  'dark chocolate': 'mørk chokolade',
  'mælke chokolade': 'mælkechokolade',
  'mælkchokolade': 'mælkechokolade',
  'mælkechoklade': 'mælkechokolade',
  'mælke-chokolade': 'mælkechokolade',
  'milk chocolate': 'mælkechokolade',
  'choklade': 'chokolade',
  'chocolate': 'chokolade',
  'cacao': 'kakao',
  'cocoa': 'kakao',
  // citrus
  'citrusfrugt': 'citrus',
  'citrusfrugter': 'citrus',
  'citrusagtig': 'citrus',
  'lemon': 'citron',
  'orange': 'appelsin',
  // frugt og bær
  'rød æble': 'rødt æble',
  'frugtig': 'frugtagtig',
  'fruity': 'frugtagtig',
  'frugter': 'frugt',
  'berries': 'bær',
  // nødder
  'mandler': 'mandel',
  'almond': 'mandel',
  'nød': 'nødder',
  'nuts': 'nødder',
  'valnød': 'valnødder',
  'hasselnød': 'hasselnødder',
  'hazelnut': 'hasselnødder',
  // sødme og krydderi
  'caramel': 'karamel',
  'brunt farin': 'brun farin',
  'vanille': 'vanilje',
  'vanilla': 'vanilje',
  'honey': 'honning',
  'floral': 'blomsteragtig',
  'blomstret': 'blomsteragtig',
  'blomstrende': 'blomsteragtig',
  'jasmine': 'jasmin',
}

/** Én rå note → normaliseret note, eller null hvis der ikke er noget tilbage. */
export function normalizeNote(raw: string): string | null {
  const cleaned = raw
    .replace(/ /g, ' ')
    .replace(/\([^)]*\)/g, ' ') // "(let)" o.l.
    .toLocaleLowerCase('da-DK')
    .replace(/["“”„'’]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.:;\-–—]+|[\s.:;\-–—]+$/g, '')
    .trim()
  if (!cleaned) return null
  return NOTE_SYNONYMS[cleaned] ?? cleaned
}

/** "Mørk chokolade, Mandel,Aprikos\nvalnødder" → ['mørk chokolade', 'mandel', 'aprikos', 'valnødder'] (unikke, i rækkefølge) */
export function splitNotes(raw: string | null | undefined): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const part of raw.split(/[,;\n]+|\s+og\s+|\s+&\s+/i)) {
    const n = normalizeNote(part)
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}
