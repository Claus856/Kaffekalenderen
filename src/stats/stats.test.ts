import { describe, expect, it } from 'vitest'
import { computeStats, twinsOf, type StatCoffee, type StatRating, type StatsInput } from './compute'
import { describeCorrelation, linearRegression, median, pearson, sd } from './math'
import { normalizeVarieties } from './varieties'

/**
 * Lille, kendt datasæt. Alle forventede tal herunder er regnet i hånden.
 *
 *            dag 1   dag 2   dag 3   dag 4
 *   Anna      5       2       4       3
 *   Bo        4       3       4       5
 *   Carl      3       2       5       –
 *
 * (fill/steep: se rows nedenfor. Mild = 4 min, medium = 6 min, strong = 8 min)
 */
const coffees: StatCoffee[] = [
  { day: 1, name: 'Brasilien', country: 'Brasilien', region: null, continent: 'Mellem-/Sydamerika', altitude_min: 1000, altitude_max: 1400, variety: 'Bourbon, Catuai', process: 'Vasket', roast: null, notes: ['kakao', 'nødder'] },
  { day: 2, name: 'Etiopien', country: 'Etiopien', region: null, continent: 'Afrika', altitude_min: 1800, altitude_max: 2000, variety: 'Heirloom', process: 'Natural', roast: null, notes: ['blomme', 'citrus'] },
  { day: 3, name: 'Kenya', country: 'Kenya', region: null, continent: 'Afrika', altitude_min: 1700, altitude_max: 2100, variety: 'SL28', process: 'Vasket', roast: null, notes: ['blomme', 'kakao'] },
  { day: 4, name: 'Peru', country: 'Peru', region: null, continent: 'Mellem-/Sydamerika', altitude_min: 1500, altitude_max: 1500, variety: 'Bourbon', process: 'Vasket', roast: null, notes: ['nødder'] },
]
const A = 'anna'
const B = 'bo'
const C = 'carl'
const members = [
  { id: A, display_name: 'Anna' },
  { id: B, display_name: 'Bo' },
  { id: C, display_name: 'Carl' },
]
const r = (coffee_day: number, user_id: string, score: number, fill_level: StatRating['fill_level']): StatRating => ({
  coffee_day,
  user_id,
  score,
  fill_level,
  steep_minutes: { mild: 4, medium: 6, strong: 8 }[fill_level],
})
const ratings: StatRating[] = [
  r(1, A, 5, 'strong'), r(1, B, 4, 'medium'), r(1, C, 3, 'mild'),
  r(2, A, 2, 'mild'), r(2, B, 3, 'medium'), r(2, C, 2, 'mild'),
  r(3, A, 4, 'medium'), r(3, B, 4, 'medium'), r(3, C, 5, 'strong'),
  r(4, A, 3, 'medium'), r(4, B, 5, 'strong'),
]
const participation = ratings.map((x) => ({ user_id: x.user_id, coffee_day: x.coffee_day }))
const input: StatsInput = { coffees, ratings, members, participation, openDay: 4, todayDoor: 4 }

const stats = computeStats(input)
const rater = (id: string) => stats.raters.find((x) => x.id === id)!
const group = (list: { key: string }[], key: string) => list.find((g) => g.key === key)!

describe('matematik', () => {
  it('median, spredning og korrelation', () => {
    expect(median([3, 5])).toBe(4)
    expect(median([2, 3, 2])).toBe(2)
    expect(sd([5, 4, 3])).toBeCloseTo(1, 10)
    expect(sd([3, 5])).toBeCloseTo(Math.SQRT2, 10)
    expect(sd([4])).toBeNull()
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10)
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 10)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull() // ingen variation
    expect(linearRegression([1, 2, 3], [2, 4, 6])).toMatchObject({ slope: 2, intercept: 0 })
    expect(describeCorrelation(0.92)).toBe('stærk positiv sammenhæng')
    expect(describeCorrelation(-0.5)).toBe('moderat negativ sammenhæng')
    expect(describeCorrelation(0.05)).toBe('næsten ingen sammenhæng')
    expect(describeCorrelation(null)).toBe('for få data')
  })
})

describe('kaffer', () => {
  it('baseret på 4 dage og 11 karakterer', () => {
    expect(stats.basedOnDays).toBe(4)
    expect(stats.ratingCount).toBe(11)
  })

  it('rangliste: gennemsnit, median, spredning og antal', () => {
    // Kenya 4,33 · Brasilien 4,0 (n=3) · Peru 4,0 (n=2) · Etiopien 2,33
    expect(stats.coffees.map((c) => c.day)).toEqual([3, 1, 4, 2])
    const d1 = stats.coffees.find((c) => c.day === 1)!
    expect([d1.mean, d1.median, d1.sd, d1.n]).toEqual([4, 4, 1, 3])
    const d2 = stats.coffees.find((c) => c.day === 2)!
    expect(d2.mean).toBeCloseTo(7 / 3, 10)
    expect(d2.median).toBe(2)
    expect(d2.sd).toBeCloseTo(Math.sqrt(1 / 3), 10) // 0,577
    const d4 = stats.coffees.find((c) => c.day === 4)!
    expect([d4.mean, d4.median, d4.n]).toEqual([4, 4, 2])
    expect(d4.sd).toBeCloseTo(Math.SQRT2, 10)
  })

  it('mest splittende og størst enighed', () => {
    expect(stats.splitting.map((c) => c.day)).toEqual([4, 1, 2]) // sd 1,41 · 1,0 · 0,58
    expect(stats.agreement.map((c) => c.day)).toEqual([2, 3, 1]) // 0,58 · 0,58 · 1,0
  })

  it('hvem elskede og hadede hver kaffe mest', () => {
    const get = (day: number) => stats.coffees.find((c) => c.day === day)!
    expect([get(1).lovers, get(1).haters]).toEqual([[A], [C]])
    expect([get(2).lovers, get(2).haters]).toEqual([[B], [A, C]])
    expect([get(3).lovers, get(3).haters]).toEqual([[C], [A, B]])
    expect([get(4).lovers, get(4).haters]).toEqual([[B], [A]])
  })

  it('udvikling over dagene', () => {
    expect(stats.trend.map((t) => [t.day, +t.mean.toFixed(2), t.n])).toEqual([
      [1, 4, 3],
      [2, 2.33, 3],
      [3, 4.33, 3],
      [4, 4, 2],
    ])
  })
})

describe('grupper', () => {
  it('verdensdel: Mellem-/Sydamerika 4,0 (n=5) og Afrika 3,33 (n=6)', () => {
    expect(stats.byContinent.map((g) => [g.key, +g.mean.toFixed(2), g.n, g.k])).toEqual([
      ['Mellem-/Sydamerika', 4, 5, 2],
      ['Afrika', 3.33, 6, 2],
    ])
  })

  it('land, proces og varietet (varieteter splittes op og tæller i hver gruppe)', () => {
    expect(stats.byCountry.map((g) => g.key)).toEqual(['Kenya', 'Brasilien', 'Peru', 'Etiopien'])
    expect(group(stats.byProcess, 'Vasket')).toMatchObject({ mean: 33 / 8, n: 8, k: 3 })
    expect(group(stats.byProcess, 'Natural')).toMatchObject({ n: 3, k: 1 })
    expect(group(stats.byVariety, 'Bourbon')).toMatchObject({ mean: 4, n: 5, k: 2 }) // dag 1 + dag 4
    expect(group(stats.byVariety, 'Catuai')).toMatchObject({ mean: 4, n: 3, k: 1 })
    expect(stats.byRoast).toEqual([]) // ristning er ikke udfyldt
  })

  it('smagsnoter: gennemsnit, top og bund', () => {
    expect(group(stats.byNote, 'kakao')).toMatchObject({ mean: 25 / 6, n: 6, k: 2 })
    expect(group(stats.byNote, 'nødder')).toMatchObject({ mean: 4, n: 5 })
    expect(group(stats.byNote, 'blomme')).toMatchObject({ n: 6 })
    expect(group(stats.byNote, 'citrus')).toMatchObject({ n: 3 })
    expect(stats.notesTop.map((g) => g.key)).toEqual(['kakao', 'nødder'])
    expect(stats.notesBottom.map((g) => g.key)).toEqual(['citrus', 'blomme']) // dårligst først
  })

  it('grupper med n < 2 markeres og kommer ikke i toplisten', () => {
    const only = computeStats({ ...input, ratings: [r(1, A, 5, 'medium'), r(2, A, 1, 'medium')], participation: [] })
    expect(only.byNote.every((g) => g.low || g.n >= 2)).toBe(true)
    expect(only.byNote.find((g) => g.key === 'kakao')?.low).toBe(true) // kun 1 karakter (dag 1; dag 3 mangler)
    expect(only.notesTop).toEqual([])
    expect(only.splitting).toEqual([]) // ingen kaffe med 2 karakterer
  })

  it('højde mod karakter med regression (r ≈ −0,40)', () => {
    expect(stats.altitude.points.map((p) => [p.day, p.altitude])).toEqual([
      [1, 1200],
      [4, 1500],
      [2, 1900],
      [3, 1900],
    ])
    expect(stats.altitude.regression!.r).toBeCloseTo(-0.3978, 3)
    expect(stats.altitude.regression!.slope).toBeLessThan(0)
    expect(stats.altitude.hidden).toBe(0)
  })
})

describe('bedømmerne', () => {
  it('snit pr. person: Carl er strengest, Bo mildest', () => {
    expect([rater(A).mean, rater(B).mean]).toEqual([3.5, 4])
    expect(rater(C).mean).toBeCloseTo(10 / 3, 10)
    const order = [...stats.raters].sort((x, y) => x.mean! - y.mean!).map((x) => x.name)
    expect(order).toEqual(['Carl', 'Anna', 'Bo'])
  })

  it('histogram 1–5 (pr. person og samlet)', () => {
    expect(rater(A).histogram).toEqual([0, 1, 1, 1, 1])
    expect(rater(B).histogram).toEqual([0, 0, 1, 2, 1])
    expect(rater(C).histogram).toEqual([0, 1, 1, 0, 1])
    expect(stats.overallHistogram).toEqual([0, 2, 3, 3, 3])
  })

  it('afvigelse fra de andres snit: Bo mest mainstream, Anna mest kontrær', () => {
    expect(rater(A).deviation.mad).toBeCloseTo(1.125, 10)
    expect(rater(B).deviation.mad).toBeCloseTo(0.875, 10)
    expect(rater(C).deviation.mad).toBeCloseTo(1.0, 10)
    expect(rater(A).deviation.signed).toBeCloseTo(-0.375, 10) // strengere end de andre
    expect(rater(B).deviation.signed).toBeCloseTo(0.625, 10) // mildere
    expect(rater(C).deviation.days).toBe(3)
    const order = [...stats.raters].sort((x, y) => x.deviation.mad! - y.deviation.mad!).map((x) => x.name)
    expect(order).toEqual(['Bo', 'Carl', 'Anna'])
  })

  it('smagstvillinger: korrelation over fælles dage', () => {
    const t = (a: string, b: string) => stats.twins.find((x) => x.a === a && x.b === b)!
    expect(t(A, B)).toMatchObject({ n: 4 })
    expect(t(A, B).r).toBeCloseTo(1 / Math.sqrt(10), 6) // 0,316
    expect(t(A, C)).toMatchObject({ n: 3 })
    expect(t(A, C).r).toBeCloseTo(0.5, 6)
    expect(t(B, C).r).toBeCloseTo(0.7559, 3)

    expect(twinsOf(stats, A).closest).toMatchObject({ id: C })
    expect(twinsOf(stats, A).farthest).toMatchObject({ id: B })
    expect(twinsOf(stats, B).closest).toMatchObject({ id: C })
  })

  it('par med færre end 3 fælles dage får ingen korrelation', () => {
    const few = computeStats({ ...input, ratings: [r(1, A, 5, 'medium'), r(2, A, 1, 'medium'), r(1, B, 4, 'medium'), r(2, B, 2, 'medium')] })
    expect(few.twins.find((x) => x.a === A && x.b === B)).toMatchObject({ n: 2, r: null })
  })

  it('yndlings- og mindst likede verdensdel og smagsnote pr. person (kun grupper med n ≥ 2)', () => {
    expect([rater(A).favContinent?.key, rater(A).favContinent?.mean, rater(A).leastContinent?.key, rater(A).leastContinent?.mean]).toEqual(['Mellem-/Sydamerika', 4, 'Afrika', 3])
    expect([rater(B).favContinent?.key, rater(B).favContinent?.mean, rater(B).leastContinent?.key]).toEqual(['Mellem-/Sydamerika', 4.5, 'Afrika'])
    // Carl har kun stemt én gang i Mellem-/Sydamerika (n=1): kun Afrika er med, og der er ingen "mindst likede"
    expect([rater(C).favContinent?.key, rater(C).favContinent?.mean, rater(C).leastContinent]).toEqual(['Afrika', 3.5, null])
    expect([rater(A).favNote?.key, rater(A).favNote?.mean, rater(A).leastNote?.key, rater(A).leastNote?.mean]).toEqual(['kakao', 4.5, 'blomme', 3])
    expect([rater(B).favNote?.key, rater(B).favNote?.mean, rater(B).leastNote?.key]).toEqual(['nødder', 4.5, 'blomme'])
    expect([rater(C).favNote?.key, rater(C).favNote?.mean, rater(C).leastNote?.key]).toEqual(['kakao', 4, 'blomme'])
  })
})

describe('bryggeparametre', () => {
  it('hvad hver person typisk bruger', () => {
    expect([rater(A).brew.typicalFill, rater(A).brew.meanSteep]).toEqual(['medium', 6])
    expect([rater(B).brew.typicalFill, rater(B).brew.meanSteep]).toEqual(['medium', 6.5])
    expect(rater(C).brew.typicalFill).toBe('mild')
    expect(rater(C).brew.meanSteep).toBeCloseTo(16 / 3, 10)
    expect(rater(A).brew.fills).toEqual({ mild: 1, medium: 2, strong: 1 })
  })

  it('stærkere bryg og længere trækketid hænger sammen med karakteren (samlet og pr. person)', () => {
    expect(stats.overallBrew.corrFill).toBeCloseTo(0.9221, 3)
    expect(stats.overallBrew.corrSteep).toBeCloseTo(0.9221, 3) // trækketiden følger vandmængden 1:1 i datasættet
    expect(rater(A).brew.corrFill).toBeCloseTo(3 / Math.sqrt(10), 6) // 0,949
    expect(rater(B).brew.corrFill).toBeCloseTo(1 / Math.sqrt(1.5), 6) // 0,816
    expect(rater(C).brew.corrFill).toBeCloseTo(0.9449, 3)
  })

  it('snit pr. vandmængde med antal', () => {
    expect(stats.brewByFill.map((x) => [x.fill, +x.mean.toFixed(2), x.n])).toEqual([
      ['mild', 2.33, 3],
      ['medium', 3.6, 5],
      ['strong', 5, 3],
    ])
  })
})

describe('deltagelse', () => {
  it('dage stemt pr. person og hvem der mangler i dag', () => {
    expect(stats.participation.map((p) => [p.name, p.days, p.openDays])).toEqual([
      ['Anna', 4, 4],
      ['Bo', 4, 4],
      ['Carl', 3, 4],
    ])
    expect(stats.missingToday.map((m) => m.display_name)).toEqual(['Carl'])
  })

  it('tæller ikke dage der ikke er åbne endnu, og intet mangler før 1. december', () => {
    const early = computeStats({ ...input, openDay: 0, todayDoor: 0 })
    expect(early.participation.every((p) => p.days === 0 && p.openDays === 0)).toBe(true)
    expect(early.missingToday).toEqual([])
  })
})

describe('tomt datasæt', () => {
  it('giver ingen fejl og tomme lister', () => {
    const empty = computeStats({ ...input, ratings: [], participation: [] })
    expect(empty.basedOnDays).toBe(0)
    expect(empty.coffees).toEqual([])
    expect(empty.raters.every((x) => x.n === 0 && x.mean === null)).toBe(true)
    expect(empty.altitude.regression).toBeNull()
    expect(empty.twins.every((t) => t.r === null)).toBe(true)
  })
})

describe('varieteter', () => {
  it('splittes op og stavevarianter samles', () => {
    expect(normalizeVarieties('Caturra, Criola, Tipica')).toEqual(['Caturra', 'Criolla', 'Typica'])
    expect(normalizeVarieties('Caturra, La Criolla')).toEqual(['Caturra', 'Criolla'])
    expect(normalizeVarieties('Coffea Arabica, Castillo')).toEqual(['Arabica', 'Castillo'])
    expect(normalizeVarieties('Bourbon (N39), Kent')).toEqual(['Bourbon', 'Kent'])
    expect(normalizeVarieties(null)).toEqual([])
  })
})
