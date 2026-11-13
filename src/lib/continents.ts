/**
 * Fast mapping fra land til verdensdel. Bruges af scraperen og af admin-siden.
 * Nøglerne er normaliserede (små bogstaver, uden accenter). Både danske og engelske landenavne er med.
 * Lande der ikke findes her giver null, og scraperen logger dem, så tabellen kan udvides.
 */

export const CONTINENTS = ['Afrika', 'Mellem-/Sydamerika', 'Asien', 'Oceanien'] as const
export type Continent = (typeof CONTINENTS)[number]

const AFRIKA: Continent = 'Afrika'
const AMERIKA: Continent = 'Mellem-/Sydamerika'
const ASIEN: Continent = 'Asien'
const OCEANIEN: Continent = 'Oceanien'

const TABLE: Record<string, Continent> = {}

function add(continent: Continent, ...names: string[]) {
  for (const n of names) TABLE[normalizeCountryKey(n)] = continent
}

export function normalizeCountryKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accenter væk: é → e og å → a (æ og ø har ingen nedbrydning og bevares)
    .toLocaleLowerCase('da-DK')
    .replace(/[^a-zæø\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

add(AFRIKA,
  'Etiopien', 'Ethiopia', 'Kenya', 'Tanzania', 'Rwanda', 'Burundi', 'Uganda', 'Malawi', 'Zambia', 'Zimbabwe',
  'Congo', 'DR Congo', 'Demokratiske Republik Congo', 'Cameroun', 'Cameroon', 'Elfenbenskysten', 'Ivory Coast',
  'Madagaskar', 'Mozambique', 'Ghana', 'Togo', 'Angola', 'Sydafrika', 'Sierra Leone', 'Liberia', 'Nigeria',
  'Sao Tome', 'Sao Tome og Principe', 'Eswatini', 'Swaziland',
)

add(AMERIKA,
  'Brasilien', 'Brazil', 'Colombia', 'Columbia', 'Peru', 'Bolivia', 'Ecuador', 'Venezuela', 'Paraguay',
  'Costa Rica', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Panama', 'Mexico',
  'Cuba', 'Jamaica', 'Dominikanske Republik', 'Den Dominikanske Republik', 'Dominican Republic', 'Haiti', 'Puerto Rico',
)

add(ASIEN,
  'Indonesien', 'Indonesia', 'Indien', 'India', 'Vietnam', 'Thailand', 'Laos', 'Myanmar', 'Burma', 'Kina', 'China',
  'Yemen', 'Jemen', 'Filippinerne', 'Philippines', 'Nepal', 'Sri Lanka', 'Taiwan', 'Malaysia',
  'Timor-Leste', 'Østtimor', 'Sumatra', 'Java', 'Sulawesi', 'Bali', 'Flores',
)

add(OCEANIEN, 'Papua Ny Guinea', 'Papua New Guinea', 'Hawaii', 'Australien', 'Fiji', 'Ny Kaledonien', 'New Caledonia')

/** Verdensdel for et landenavn, eller null hvis landet ikke står i tabellen. */
export function continentForCountry(country: string | null | undefined): Continent | null {
  if (!country) return null
  return TABLE[normalizeCountryKey(country)] ?? null
}

/** "HONDURAS" → "Honduras", "costa rica" → "Costa Rica". */
export function titleCaseCountry(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('da-DK')
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('da-DK'))
}
