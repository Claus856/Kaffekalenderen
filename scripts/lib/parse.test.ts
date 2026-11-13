import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { continentForCountry, titleCaseCountry } from '../../src/lib/continents'
import { normalizeNote, splitNotes } from '../../src/lib/notes'
import {
  ParseError,
  buildCoffee,
  detectRoastFromImage,
  fallbackHandles,
  isMapImage,
  isPackImage,
  parseAltitude,
  parseLabelLines,
  parsePage,
  parseProductJson,
  pickProductHandle,
  productUrl,
} from './parse'

const fixture = (name: string) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

describe('parseAltitude', () => {
  it.each([
    ['1200-1700 m.o.h', 1200, 1700],
    ['1700 - 2200 m.a.s.l.', 1700, 2200],
    ['1.200–1.700 moh', 1200, 1700],
    ['900 – 1100 m', 900, 1100],
    ['600–1,100 m.a.s.l', 600, 1100], // engelsk tusindtalskomma (dag 15). Gav tidligere fejlagtigt 100–600
    ['1,200-1,700 m', 1200, 1700],
    ['1500 m', 1500, 1500],
    ['2200-1700 m', 1700, 2200], // byttet om
  ])('"%s" → %i–%i', (raw, min, max) => {
    expect(parseAltitude(raw)).toEqual({ min, max })
  })

  it('giver null når der ikke er tal, og ignorerer urimelige tal', () => {
    expect(parseAltitude('høj')).toEqual({ min: null, max: null })
    expect(parseAltitude(null)).toEqual({ min: null, max: null })
    expect(parseAltitude('99999 m')).toEqual({ min: null, max: null })
  })
})

describe('parseLabelLines', () => {
  it('finder kendte felter og lader beskrivelsen være i fred', () => {
    const { labels, rest, unknown } = parseLabelLines([
      'Kaffen er dyrket i højlandet.',
      'Højde: 1200-1700 m.o.h',
      'Sort: Ihcafe 90, Icatu',
      'Sorter: ignoreres fordi Sort kom først',
      'Proces: Vasket',
      'Certificering: Økologisk',
      'Producent: COMSA',
    ])
    expect(labels).toEqual({
      altitude: '1200-1700 m.o.h',
      variety: 'Ihcafe 90, Icatu',
      process: 'Vasket',
      certification: 'Økologisk',
    })
    expect(rest).toEqual(['Kaffen er dyrket i højlandet.'])
    expect(unknown).toEqual(['Producent: COMSA'])
  })

  it('tager værdien fra næste linje, hvis labelen står alene', () => {
    expect(parseLabelLines(['Proces:', 'Natural']).labels).toEqual({ process: 'Natural' })
  })

  it('behandler en lang sætning med kolon som beskrivelse, ikke som felt', () => {
    const line = 'Smagen er klassisk for egnen: honning, citrus og en lang, sød afslutning i koppen.'
    expect(parseLabelLines([line]).rest).toEqual([line])
  })
})

describe('billeder', () => {
  const f = (name: string) => `https://cdn.shopify.com/s/files/1/0557/6343/5717/files/${name}?v=1`
  it('kort er aldrig kaffebilleder', () => {
    expect(isMapImage(f('Honduras_map_1c6364d0.png'))).toBe(true)
    expect(isMapImage(f('Brazill_HB_map.png'))).toBe(true) // gav tidligere dag 24 et kort som billede
    expect(isMapImage(f('Kenya_333_81cca712.png'))).toBe(false)
    expect(isMapImage(f('Roasted_beans.png'))).toBe(false)
  })
  it('pakkebilleder hedder <Land>_333_… eller 333_<Land>…', () => {
    expect(isPackImage(f('Honduras_333_a01e7e90.png'))).toBe(true)
    expect(isPackImage(f('333_Zimbabwe-_Compressify.io.png'))).toBe(true)
    expect(isPackImage(f('image_1_6e5a87bc.jpg'))).toBe(false)
    expect(isPackImage(f('Brazill_HB_map.png'))).toBe(false)
  })
})

describe('ristningsgrad', () => {
  it('kan ikke aflæses af det generiske "Roast.png" – returnerer null', () => {
    expect(
      detectRoastFromImage({ src: 'https://cdn.shopify.com/s/files/1/0557/6343/5717/files/Roast.png?v=1701436823', alt: 'Roast' }),
    ).toBeNull()
  })

  it('aflæser grad fra filnavn, alt-tekst eller roast-klasse hvis den findes', () => {
    expect(detectRoastFromImage({ src: 'x/roast_medium_dark.png', alt: '' })).toBe('medium-mørk')
    expect(detectRoastFromImage({ src: 'x/a.png', alt: 'Light roast' })).toBe('lys')
    expect(detectRoastFromImage({ src: 'x/a.png', alt: '', classes: ['foo', 'roast-dark'] })).toBe('mørk')
    expect(detectRoastFromImage({ src: 'x/a.png', alt: '', classes: ['ecom-lys-xyz'] })).toBeNull() // tilfældige klassenavne tæller ikke
  })
})

describe('smagsnoter', () => {
  it('normaliserer: små bogstaver, trimmet, synonymer samlet, unikke', () => {
    expect(splitNotes('Mørk chokolade, Mandel,Aprikos\nValnødder')).toEqual(['mørk chokolade', 'mandel', 'aprikos', 'valnødder'])
    expect(splitNotes('Vegetabilsk, brun farin,\nkakao, frugtagtig')).toEqual(['vegetabilsk', 'brun farin', 'kakao', 'frugtagtig'])
    expect(splitNotes('Mørkchokolade, mørk chokolade, MØRK  CHOKOLADE.')).toEqual(['mørk chokolade'])
    expect(splitNotes('Citrusfrugt og honning')).toEqual(['citrus', 'honning'])
    expect(normalizeNote('  Mælke chokolade ')).toBe('mælkechokolade')
    expect(splitNotes('')).toEqual([])
    expect(splitNotes(null)).toEqual([])
  })
})

describe('verdensdel', () => {
  it('mapper lande (dansk og engelsk, uanset store bogstaver og accenter)', () => {
    expect(continentForCountry('Honduras')).toBe('Mellem-/Sydamerika')
    expect(continentForCountry('GUATEMALA')).toBe('Mellem-/Sydamerika')
    expect(continentForCountry('Etiopien')).toBe('Afrika')
    expect(continentForCountry('Ethiopia')).toBe('Afrika')
    expect(continentForCountry('Kenya')).toBe('Afrika')
    expect(continentForCountry('Indonesien')).toBe('Asien')
    expect(continentForCountry('Papua Ny Guinea')).toBe('Oceanien')
    expect(continentForCountry('Colombia')).toBe('Mellem-/Sydamerika')
    expect(continentForCountry('Den Dominikanske Republik')).toBe('Mellem-/Sydamerika')
  })
  it('giver null for ukendte lande', () => {
    expect(continentForCountry('Atlantis')).toBeNull()
    expect(continentForCountry(null)).toBeNull()
  })
  it('titleCaseCountry', () => {
    expect(titleCaseCountry('HONDURAS')).toBe('Honduras')
    expect(titleCaseCountry('costa rica')).toBe('Costa Rica')
  })
})

describe('produktlink', () => {
  it('foretrækker "SHOP … BØNNER" og ignorerer gavekort o.l.', () => {
    expect(
      pickProductHandle([
        { handle: 'greeting-cards', text: '' },
        { handle: 'kenya-special-kaffebonner', text: 'SHOP KENYA BØNNER' },
      ]),
    ).toBe('kenya-special-kaffebonner')
    expect(pickProductHandle([])).toBeNull()
  })

  it('fallback-handle for den døde Honduras-link', () => {
    expect(fallbackHandles('honduras-specialty-whole-bean-coffee')).toEqual(['honduras-special-kaffebonner'])
    expect(fallbackHandles('kenya-special-kaffebonner')).toEqual([]) // gætter ikke sig selv
    expect(productUrl('x')).toBe('https://dk.brew-company.com/products/x')
  })
})

describe('rigtige sider (fixtures fra dk.brew-company.com)', () => {
  it('dag 1 (Honduras): alle felter fra siden', () => {
    const page = parsePage(fixture('day1.html'))
    expect(page.country).toBe('Honduras')
    expect(page.region).toBe('La Paz - Marcala')
    expect(page.notesRaw).toBe('Vegetabilsk, brun farin,\nkakao, frugtagtig')
    expect(page.labels).toMatchObject({
      altitude: '1200-1700 m.o.h',
      variety: 'Ihcafe 90, Icatu, Red catuai',
      process: 'Vasket',
      certification: 'Økologisk',
    })
    expect(page.description).toMatch(/^Kaffen er dyrket økologisk i højlandet ved Marcala/)
    expect(page.description).not.toMatch(/Højde:|Proces:/)
    expect(page.roastImage?.src).toMatch(/Roast\.png/)
    expect(page.roastLevel).toBeNull()
    expect(page.productLinks.map((p) => p.handle)).toContain('honduras-specialty-whole-bean-coffee')
  })

  it('dag 25 (Kenya): "Sorter:" og "m.a.s.l." giver samme felter som "Sort:" og "m.o.h"', () => {
    const page = parsePage(fixture('day25.html'))
    expect(page.country).toBe('Kenya')
    expect(page.region).toBe('Massai')
    expect(page.labels.variety).toBe('Arabica')
    expect(page.labels.altitude).toBe('1700-2200 m.a.s.l.')
    expect(page.labels.process).toBe('Vasket')
  })

  it('kaster ParseError, hvis siden ikke ligner en kaffeside', () => {
    expect(() => parsePage('<html><body><h1>Ups</h1></body></html>')).toThrow(ParseError)
  })

  it('buildCoffee fletter side og produkt til én post (Honduras, med dødt linkfallback)', () => {
    const page = parsePage(fixture('day1.html'))
    const product = parseProductJson(fixture('product-honduras.json'))
    expect(product.labels).toMatchObject({ origin: 'La Paz - Marcala', altitude: '1200 - 1700 m.a.s.l.', variety: 'Ihcafe 90, Icatu, Red catuai' })

    const { record, notes, missing, issues } = buildCoffee(1, page, product, productUrl('honduras-special-kaffebonner'))
    expect(record).toMatchObject({
      day: 1,
      name: 'Honduras (La Paz - Marcala)',
      country: 'Honduras',
      region: 'La Paz - Marcala',
      continent: 'Mellem-/Sydamerika',
      altitude_min: 1200,
      altitude_max: 1700,
      variety: 'Ihcafe 90, Icatu, Red catuai',
      process: 'Vasket',
      roast: null,
      source_url: 'https://dk.brew-company.com/pages/coffee-day-1',
      product_url: 'https://dk.brew-company.com/products/honduras-special-kaffebonner',
    })
    expect(record.image_url).toMatch(/Honduras_333-_Compressify\.io\.png/) // produktets pakkebillede
    expect(notes).toEqual(['vegetabilsk', 'brun farin', 'kakao', 'frugtagtig'])
    expect(missing).toEqual(['roast'])
    // Side og produkt er enige: ingen afvigelsesadvarsler. Kun ristning.
    expect(issues.filter((i) => i.level === 'warn').map((i) => i.msg.split(':')[0])).toEqual(['ristning'])
  })

  it('buildCoffee advarer om afvigelser mellem side og produkt, og siden vinder', () => {
    const page = parsePage(fixture('day25.html'))
    const product = parseProductJson(fixture('product-kenya.json'))
    product.labels.process = 'natural'
    const { record, issues } = buildCoffee(25, page, product, productUrl('kenya-special-kaffebonner'))
    expect(record.process).toBe('Vasket')
    expect(issues.some((i) => i.level === 'warn' && i.msg.startsWith('proces:'))).toBe(true)
    expect(record.continent).toBe('Afrika')
    expect([record.altitude_min, record.altitude_max]).toEqual([1700, 2200])
  })

  it('buildCoffee falder tilbage til produktet, når siden mangler et felt', () => {
    const page = parsePage(fixture('day25.html'))
    page.labels.process = undefined
    const product = parseProductJson(fixture('product-kenya.json'))
    const { record, issues } = buildCoffee(25, page, product, null)
    expect(record.process).toBe('Vasket')
    expect(issues.some((i) => i.level === 'info' && i.msg.startsWith('proces:'))).toBe(true)
    expect(record.product_url).toBeNull()
  })
})
