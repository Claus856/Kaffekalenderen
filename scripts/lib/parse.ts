/**
 * Ren parsing af BREW Companys kaffesider og produkt-JSON. Ingen netværk og ingen database her,
 * så det hele kan testes (scripts/lib/parse.test.ts).
 *
 * Siderne er bygget med page-builderen EComposer. Strukturen (undersøgt på dag 1, 2, 3 og 25):
 *   <section> … <h3>MERE OM KAFFEN</h3>
 *     <h4>HONDURAS</h4>                              ← land
 *     <h5>Oprindelse</h5> <div.text-content>La Paz - Marcala</div>
 *     <h5>Ristning</h5>   <img src=".../Roast.png">  ← samme generiske billede på alle sider
 *     <h5>Smagsnoter</h5> <div.text-content>Vegetabilsk, brun farin,<br>kakao</div>
 *     <img kort>  <div.text-content>beskrivelse … Højde: … / Sort: … / Proces: …</div>
 *
 * Shopifys /products/<handle>.json har de samme "Label: værdi"-linjer i body_html plus et rent
 * pakkebillede (images[0]), så den bruges som kryds-tjek og til billedet.
 */
import * as cheerio from 'cheerio'
import { continentForCountry, titleCaseCountry } from '../../src/lib/continents'
import { splitNotes } from '../../src/lib/notes'

export const SITE = 'https://dk.brew-company.com'
export const pageUrl = (day: number) => `${SITE}/pages/coffee-day-${day}`
export const productUrl = (handle: string) => `${SITE}/products/${handle}`

export class ParseError extends Error {}

// ── Felter og labels ───────────────────────────────────────────────────────

export type LabelKey = 'origin' | 'roast' | 'notes' | 'altitude' | 'variety' | 'process' | 'certification'

const LABELS: Array<[LabelKey, RegExp]> = [
  ['origin', /^(oprindelse|origin|region)$/],
  ['roast', /^(ristning|ristningsgrad|roast|roast level|roasting)$/],
  ['notes', /^(smagsnoter|smag|tasting notes?|noter)$/],
  ['altitude', /^(h[øo]jde|h[øo]jde over havet|altitude)$/],
  ['variety', /^(sort|sorter|varietet|varieteter|variety|varieties)$/],
  ['process', /^(proces|processering|process|processing|forarbejdning)$/],
  ['certification', /^(certificering|certificeringer|certifikat|certifikater|certification)$/],
]

export function labelKey(raw: string): LabelKey | null {
  const k = raw.toLocaleLowerCase('da-DK').replace(/[:\s]+$/g, '').trim()
  for (const [key, re] of LABELS) if (re.test(k)) return key
  return null
}

export type Labels = Partial<Record<LabelKey, string>>

// ── Tekst-hjælpere ─────────────────────────────────────────────────────────

export function clean(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}

/** Tekstlinjer i et element: <br> og blok-elementer (div, p, li) giver linjeskift. */
function linesOf($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string[] {
  const c = el.clone()
  c.find('br').replaceWith('\n')
  c.find('div, p, li, h1, h2, h3, h4, h5, h6').each((_, e) => {
    $(e).prepend('\n').append('\n')
  })
  return c
    .text()
    .split('\n')
    .map(clean)
    .filter(Boolean)
}

const LABEL_LINE = /^([^:]{2,30}?)\s*:\s*(.*)$/

/**
 * Deler linjer op i kendte "Label: værdi"-felter, ukendte korte labels (logges) og løs tekst (beskrivelse).
 * En label uden værdi på samme linje tager værdien fra næste linje.
 */
export function parseLabelLines(lines: string[]): { labels: Labels; rest: string[]; unknown: string[] } {
  const labels: Labels = {}
  const rest: string[] = []
  const unknown: string[] = []
  let pending: LabelKey | null = null

  for (const line of lines) {
    if (pending) {
      labels[pending] ??= line
      pending = null
      continue
    }
    const m = LABEL_LINE.exec(line)
    if (!m) {
      rest.push(line)
      continue
    }
    const key = labelKey(m[1])
    const value = clean(m[2])
    if (key) {
      if (value) labels[key] ??= value
      else pending = key
    } else if (m[1].trim().split(/\s+/).length <= 2 && m[1].length <= 20 && value.length > 0 && value.length <= 80) {
      unknown.push(line) // fx "Producent: COMSA" – ikke et felt vi kender; udelades af beskrivelsen og logges
    } else {
      rest.push(line)
    }
  }
  return { labels, rest, unknown }
}

// ── Værdi-parsere ──────────────────────────────────────────────────────────

/** "1200-1700 m.o.h", "1700 - 2200 m.a.s.l.", "1.200–1.700 moh", "600–1,100 m", "1500 m" → { min, max } i meter */
export function parseAltitude(raw: string | null | undefined): { min: number | null; max: number | null } {
  if (!raw) return { min: null, max: null }
  // Tusindtalsseparator (punktum, komma eller mellemrum): 1.200 / 1,100 / 1 200 → 1200
  const noThousands = raw.replace(/(?<!\d)(\d{1,2})[.,\s](\d{3})(?!\d)/g, '$1$2')
  const nums = (noThousands.match(/\d{2,4}/g) ?? []).map(Number).filter((n) => n >= 0 && n <= 5000)
  if (nums.length === 0) return { min: null, max: null }
  if (nums.length === 1) return { min: nums[0], max: nums[0] }
  const [a, b] = nums
  return a <= b ? { min: a, max: b } : { min: b, max: a }
}

/** Ristningsgrad ud fra ord som "light", "medium", "dark", "lys", "mørk". Null hvis intet genkendes. */
export function normalizeRoast(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.toLocaleLowerCase('da-DK')
  if (/medium[\s_-]*(dark|m[øo]rk)/.test(s)) return 'medium-mørk'
  if (/medium[\s_-]*(light|lys)/.test(s)) return 'medium-lys'
  if (/\bmedium\b|\bmellem\b/.test(s)) return 'medium'
  if (/\b(light|lys|lyst)\b/.test(s)) return 'lys'
  if (/\b(dark|m[øo]rk|m[øo]rkt)\b/.test(s)) return 'mørk'
  return null
}

/**
 * Ristningsgraden vises som et billede. Vi leder KUN i det der kan skelne mellem kaffer:
 * filnavn, alt-tekst, title og klasser der begynder med "roast". Ordet "Roast" alene siger intet.
 */
export function detectRoastFromImage(img: { src: string; alt: string; title?: string; classes?: string[] }): string | null {
  const file = decodeURIComponent(img.src.split('?')[0].split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '')
  const classHints = (img.classes ?? []).filter((c) => /^roast[-_]/i.test(c))
  for (const hint of [file, img.alt, img.title ?? '', ...classHints]) {
    const level = normalizeRoast(hint.replace(/[_-]+/g, ' '))
    if (level) return level
  }
  return null
}

function normalizeProcess(raw: string): string {
  const s = clean(raw).toLocaleLowerCase('da-DK')
  const syn: Record<string, string> = {
    washed: 'Vasket',
    'fully washed': 'Vasket',
    natural: 'Natural',
    naturlig: 'Natural',
    honey: 'Honey',
  }
  return syn[s] ?? s.charAt(0).toLocaleUpperCase('da-DK') + s.slice(1)
}

function normalizeRegion(raw: string): string {
  return clean(raw).replace(/\s*[–—-]\s*/g, ' - ')
}

function normalizeVariety(raw: string): string {
  return raw
    .split(/[,;/]|\s+og\s+/i)
    .map(clean)
    .filter(Boolean)
    .join(', ')
}

const fileName = (src: string) => decodeURIComponent(src.split('?')[0].split('/').pop() ?? '')

/** Landkort (fx "Honduras_map_….png" eller "Brazill_HB_map.png") er aldrig et kaffebillede. */
export function isMapImage(src: string): boolean {
  return /(^|[^a-z])map([^a-z]|$)/i.test(fileName(src))
}

/** 333 g-pakkebillede: "Honduras_333_….png" eller "333_Zimbabwe-_….png". */
export function isPackImage(src: string): boolean {
  return /(^|[^0-9])333([^0-9]|$)/.test(fileName(src)) && !isMapImage(src)
}

function absUrl(src: string | undefined): string | null {
  if (!src) return null
  if (src.startsWith('//')) return 'https:' + src
  if (src.startsWith('/')) return SITE + src
  return src
}

// ── Siden ──────────────────────────────────────────────────────────────────

export interface PageData {
  country: string | null
  region: string | null
  notesRaw: string | null
  roastImage: { src: string; alt: string } | null
  roastLevel: string | null
  description: string | null
  labels: Labels
  unknownLines: string[]
  images: Array<{ src: string; alt: string }>
  packImage: string | null
  productLinks: Array<{ handle: string; text: string }>
}

const IGNORED_PRODUCT_HANDLES = /^(greeting-cards?|gift-cards?|gavekort)/i

export function parsePage(html: string): PageData {
  const $ = cheerio.load(html)

  const marker = $('h1, h2, h3, h4, h5, h6')
    .filter((_, el) => /mere om kaffen/i.test($(el).text()))
    .first()
  if (!marker.length) {
    throw new ParseError('Fandt ikke overskriften "MERE OM KAFFEN" – siden har en anden struktur end forventet')
  }
  const sectionEl = marker.closest('section, .ecom-section')
  const section = sectionEl.length ? sectionEl : marker.parent().parent().parent()

  let country: string | null = null
  let pending: LabelKey | null = null
  let region: string | null = null
  let notesRaw: string | null = null
  let roastImage: PageData['roastImage'] = null
  let roastLevel: string | null = null
  const bodyLines: string[] = []
  const images: PageData['images'] = []

  section.find('h1, h2, h3, h4, h5, h6, .text-content, img').each((_, el) => {
    const $el = $(el)
    const tag = el.tagName.toLowerCase()

    if (/^h[1-6]$/.test(tag)) {
      const text = clean($el.text())
      if (!text || /mere om kaffen/i.test(text)) return
      const key = labelKey(text)
      if (key) pending = key
      else if (!country) country = titleCaseCountry(text)
      return
    }

    if (tag === 'img') {
      const src = absUrl($el.attr('src') ?? $el.attr('data-src'))
      if (!src) return
      const img = { src, alt: clean($el.attr('alt') ?? '') }
      if (pending === 'roast') {
        roastImage = img
        roastLevel = detectRoastFromImage({
          ...img,
          title: $el.attr('title'),
          classes: ($el.attr('class') ?? '').split(/\s+/),
        })
        pending = null
      } else {
        images.push(img)
      }
      return
    }

    // .text-content
    const lines = linesOf($, $el)
    if (pending === 'origin') {
      region = normalizeRegion(lines.join(' '))
      pending = null
    } else if (pending === 'notes') {
      notesRaw = lines.join('\n')
      pending = null
    } else {
      bodyLines.push(...lines)
    }
  })

  const { labels, rest, unknown } = parseLabelLines(bodyLines)

  // Pakkebilledet "<Land>_333_….png" ligger i en anden sektion end selve indholdet
  const packImage =
    $('img')
      .map((_, el) => absUrl($(el).attr('src') ?? $(el).attr('data-src')))
      .get()
      .find((s): s is string => !!s && isPackImage(s)) ?? null

  const productLinks: PageData['productLinks'] = []
  $('a[href*="/products/"]').each((_, el) => {
    const m = /\/products\/([^/?#]+)/.exec($(el).attr('href') ?? '')
    if (!m || IGNORED_PRODUCT_HANDLES.test(m[1])) return
    if (!productLinks.some((p) => p.handle === m[1])) productLinks.push({ handle: m[1], text: clean($(el).text()) })
  })

  return {
    country,
    region,
    notesRaw,
    roastImage,
    roastLevel,
    description: rest.length ? rest.join('\n\n') : null,
    labels,
    unknownLines: unknown,
    images,
    packImage,
    productLinks,
  }
}

/** Det produktlink der sandsynligvis er "SHOP … BØNNER"-knappen. */
export function pickProductHandle(links: PageData['productLinks']): string | null {
  return (links.find((l) => /b[øo]nner|beans/i.test(l.text)) ?? links[0])?.handle ?? null
}

/**
 * Siden linker nogle gange til en handle der ikke findes (fx honduras-specialty-whole-bean-coffee).
 * Den danske butiks produkter hedder <land>-special-kaffebonner, så det prøves som fallback.
 */
export function fallbackHandles(handle: string): string[] {
  const base = handle.replace(/-(specialty|special)-.*$/i, '')
  const guess = `${base}-special-kaffebonner`
  return guess === handle || !base ? [] : [guess]
}

// ── Produkt-JSON ───────────────────────────────────────────────────────────

export interface ProductData {
  handle: string
  title: string
  images: string[]
  labels: Labels
  descriptionLines: string[]
}

export function parseProductJson(text: string): ProductData {
  let product: any
  try {
    product = JSON.parse(text).product
  } catch {
    throw new ParseError('Produkt-JSON kunne ikke læses')
  }
  if (!product || typeof product.body_html !== 'string') throw new ParseError('Produkt-JSON mangler product.body_html')

  const $ = cheerio.load(`<div id="b">${product.body_html}</div>`, null, false)
  const lines = linesOf($, $('#b'))
  const { labels, rest } = parseLabelLines(lines)
  return {
    handle: String(product.handle ?? ''),
    title: String(product.title ?? ''),
    images: (product.images ?? []).map((i: any) => absUrl(i?.src)).filter(Boolean) as string[],
    labels,
    descriptionLines: rest,
  }
}

// ── Sammenfletning til én kaffe ────────────────────────────────────────────

export interface CoffeeRecord {
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
  description: string | null
  image_url: string | null
  source_url: string
  product_url: string | null
}

export type Issue = { level: 'warn' | 'info'; msg: string }

export interface ParsedCoffee {
  record: CoffeeRecord
  notes: string[]
  /** felter der er tomme: kandidater til manuel rettelse i admin */
  missing: string[]
  issues: Issue[]
}

const REQUIRED: Array<keyof CoffeeRecord | 'notes'> = [
  'country', 'region', 'continent', 'altitude_min', 'altitude_max', 'variety', 'process',
  'roast', 'description', 'image_url', 'product_url', 'notes',
]

const sameText = (a: string, b: string) => clean(a).toLocaleLowerCase('da-DK') === clean(b).toLocaleLowerCase('da-DK')

export function buildCoffee(
  day: number,
  page: PageData,
  product: ProductData | null,
  productHref: string | null,
): ParsedCoffee {
  const issues: Issue[] = []
  const warn = (msg: string) => issues.push({ level: 'warn', msg })
  const info = (msg: string) => issues.push({ level: 'info', msg })

  // Side først, produkt som reserve. Afvigelser logges, men siden vinder.
  const pick = (what: string, fromPage: string | null | undefined, fromProduct: string | null | undefined, same = sameText) => {
    if (fromPage && fromProduct && !same(fromPage, fromProduct)) {
      warn(`${what}: siden siger "${fromPage}", produktet siger "${fromProduct}" (bruger siden)`)
    }
    if (!fromPage && fromProduct) info(`${what}: mangler på siden, hentet fra produktet`)
    return fromPage || fromProduct || null
  }

  const country = page.country
  const region = pick('region', page.region, product?.labels.origin ? normalizeRegion(product.labels.origin) : null)

  const altRaw = page.labels.altitude ?? product?.labels.altitude ?? null
  const alt = parseAltitude(altRaw)
  if (page.labels.altitude && product?.labels.altitude) {
    const p = parseAltitude(product.labels.altitude)
    if (p.min !== alt.min || p.max !== alt.max) {
      warn(`højde: siden ${alt.min}-${alt.max} m, produktet ${p.min}-${p.max} m (bruger siden)`)
    }
  } else if (!page.labels.altitude && product?.labels.altitude) {
    info('højde: mangler på siden, hentet fra produktet')
  }
  if (altRaw && alt.min === null) warn(`højde: kunne ikke aflæse tal i "${altRaw}"`)

  const variety = pick(
    'varietet',
    page.labels.variety ? normalizeVariety(page.labels.variety) : null,
    product?.labels.variety ? normalizeVariety(product.labels.variety) : null,
  )
  const processRaw = pick(
    'proces',
    page.labels.process ? normalizeProcess(page.labels.process) : null,
    product?.labels.process ? normalizeProcess(product.labels.process) : null,
  )

  // Smagsnoter: sammenlign som mængder, ikke som tekst
  const pageNotes = splitNotes(page.notesRaw)
  const productNotes = splitNotes(product?.labels.notes)
  if (pageNotes.length && productNotes.length) {
    const a = [...pageNotes].sort().join('|')
    const b = [...productNotes].sort().join('|')
    if (a !== b) warn(`smagsnoter: siden [${pageNotes.join(', ')}] ≠ produktet [${productNotes.join(', ')}] (bruger siden)`)
  }
  const notes = pageNotes.length ? pageNotes : productNotes
  if (!pageNotes.length && productNotes.length) info('smagsnoter: mangler på siden, hentet fra produktet')

  // Ristning: kun hvis den kan aflæses. Ellers null (aldrig et gæt).
  const roast =
    page.roastLevel ??
    normalizeRoast(page.labels.roast) ??
    normalizeRoast(product?.labels.roast)
  if (!roast) {
    warn(
      page.roastImage
        ? `ristning: kan ikke aflæses. Billedet er det generiske "${page.roastImage.src.split('?')[0].split('/').pop()}" (alt="${page.roastImage.alt}") uden noget der skelner mellem kaffer`
        : 'ristning: ingen ristningsgrafik fundet på siden',
    )
  }

  // Billede: produktets pakkebillede > sidens "_333"-pakkebillede > første ikke-kort-billede i indholdet
  let image_url = product?.images[0] ?? null
  if (!image_url) {
    image_url = page.packImage ?? page.images.find((i) => !isMapImage(i.src))?.src ?? null
    if (image_url) info('billede: fra siden (produktets billede ikke tilgængeligt)')
  }

  const continent = continentForCountry(country)
  if (country && !continent) warn(`land "${country}" findes ikke i verdensdel-tabellen (src/lib/continents.ts)`)

  for (const line of page.unknownLines) warn(`ukendt felt på siden (ikke gemt): "${line}"`)
  if (page.labels.certification) info(`certificering: ${page.labels.certification} (ikke gemt, har ikke noget felt)`)

  const record: CoffeeRecord = {
    day,
    name: country ? (region ? `${country} (${region})` : country) : `Kaffe ${day}`,
    country,
    region,
    continent,
    altitude_min: alt.min,
    altitude_max: alt.max,
    variety,
    process: processRaw,
    roast,
    description: page.description ?? (product?.descriptionLines.length ? product.descriptionLines.join('\n\n') : null),
    image_url,
    source_url: pageUrl(day),
    product_url: productHref,
  }

  const missing = REQUIRED.filter((f) => (f === 'notes' ? notes.length === 0 : record[f as keyof CoffeeRecord] == null))
  return { record, notes, missing, issues }
}
