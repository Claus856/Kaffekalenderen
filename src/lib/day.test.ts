import { describe, expect, it } from 'vitest'
import { clockDay, daysUntilStart, phaseOf, todayInCopenhagen, todaysDoor } from './dates'
import { formatAltitude, formatAverage } from './format'
import { emptyDraft, isQuickSteep, steepAfterFillChange, summarizeCalendar, validateDraft } from './ratings'

describe('dagens dato i Europe/Copenhagen', () => {
  it('regner i dansk tid, også omkring midnat og sommertid', () => {
    expect(todayInCopenhagen(new Date('2026-11-30T22:59:00Z'))).toBe('2026-11-30') // 23:59 dansk tid
    expect(todayInCopenhagen(new Date('2026-11-30T23:00:00Z'))).toBe('2026-12-01') // 00:00 dansk tid
    expect(todayInCopenhagen(new Date('2026-12-24T22:59:00Z'))).toBe('2026-12-24')
    expect(todayInCopenhagen(new Date('2026-12-24T23:00:00Z'))).toBe('2026-12-25')
    expect(todayInCopenhagen(new Date('2026-06-30T22:00:00Z'))).toBe('2026-07-01') // sommertid UTC+2
  })
})

describe('kalenderdag efter uret', () => {
  it('0 før 1. dec, 1–25 i december, 25 på og efter 25. dec', () => {
    expect(clockDay('2026-11-30')).toBe(0)
    expect(clockDay('2026-12-01')).toBe(1)
    expect(clockDay('2026-12-07')).toBe(7)
    expect(clockDay('2026-12-25')).toBe(25)
    expect(clockDay('2026-12-31')).toBe(25)
    expect(clockDay('2027-01-04')).toBe(25)
    expect(clockDay('2025-12-10')).toBe(0) // et tidligere års december er ikke kalenderen
  })

  it('fase og nedtælling', () => {
    expect(phaseOf('2026-11-13')).toBe('before')
    expect(phaseOf('2026-12-01')).toBe('during')
    expect(phaseOf('2026-12-25')).toBe('during')
    expect(phaseOf('2026-12-26')).toBe('after')
    expect(phaseOf('2027-01-02')).toBe('after')
    expect(daysUntilStart('2026-11-13')).toBe(18)
    expect(daysUntilStart('2026-11-30')).toBe(1)
    expect(daysUntilStart('2026-12-01')).toBe(0)
    expect(daysUntilStart('2026-12-15')).toBe(0)
  })

  it('"i dag" er aldrig en låge der ikke er åben, og aldrig en senere end uret siger', () => {
    expect(todaysDoor(0, 0)).toBe(0) // før 1. dec, intet åbent
    expect(todaysDoor(7, 7)).toBe(7) // normal dag
    expect(todaysDoor(25, 7)).toBe(7) // admin har åbnet alt: "i dag" er stadig den 7.
    expect(todaysDoor(3, 7)).toBe(3) // serveren har ikke åbnet længere endnu: følg serveren
    expect(todaysDoor(25, 0)).toBe(25) // testtilstand før 1. dec
    expect(todaysDoor(25, 25)).toBe(25) // juledag
  })
})

describe('format', () => {
  it('højde', () => {
    expect(formatAltitude(1200, 1700)).toBe('1200–1700 m')
    expect(formatAltitude(1100, 1100)).toBe('1100 m')
    expect(formatAltitude(null, 1500)).toBe('1500 m')
    expect(formatAltitude(null, null)).toBeNull()
  })
  it('gennemsnit med decimalkomma', () => {
    expect(formatAverage(4.1)).toBe('4,1')
    expect(formatAverage(3)).toBe('3,0')
    expect(formatAverage(3.75)).toBe('3,8')
  })
})

describe('vurdering', () => {
  it('standard er medium og 6 minutter, og uden karakter kan man ikke gemme', () => {
    const d = emptyDraft()
    expect([d.fill, d.steep]).toEqual(['medium', 6])
    expect(validateDraft(d).ok).toBe(false)
  })

  it('kun hele point 1–5', () => {
    for (const bad of [0, 6, -1, 3.5, NaN]) {
      expect(validateDraft({ ...emptyDraft(), score: bad }).ok).toBe(false)
    }
    for (const good of [1, 2, 3, 4, 5]) {
      expect(validateDraft({ ...emptyDraft(), score: good }).ok).toBe(true)
    }
  })

  it('trækketid skal være et helt antal minutter 1–60', () => {
    const base = { ...emptyDraft(), score: 4 }
    for (const bad of [0, 61, 2.5, NaN]) expect(validateDraft({ ...base, steep: bad }).ok).toBe(false)
    expect(validateDraft({ ...base, steep: 11 })).toEqual({
      ok: true,
      value: { score: 4, fill_level: 'medium', steep_minutes: 11, comment: null },
    })
  })

  it('kommentar trimmes; tom kommentar bliver null; for lang afvises', () => {
    const base = { ...emptyDraft(), score: 5 }
    expect(validateDraft({ ...base, comment: '  Lækker  ' })).toMatchObject({ ok: true, value: { comment: 'Lækker' } })
    expect(validateDraft({ ...base, comment: '   ' })).toMatchObject({ ok: true, value: { comment: null } })
    expect(validateDraft({ ...base, comment: 'x'.repeat(1001) }).ok).toBe(false)
  })

  it('trækketiden følger vandmængden, men kun hvis man ikke selv har valgt en anden tid', () => {
    expect(steepAfterFillChange('medium', 6, 'strong')).toBe(8)
    expect(steepAfterFillChange('strong', 8, 'mild')).toBe(4)
    expect(steepAfterFillChange('medium', 11, 'strong')).toBe(11) // egen tid bevares
    expect(steepAfterFillChange('medium', 8, 'mild')).toBe(8) // 8 er ikke medium-standarden: egen valgte tid
    expect(isQuickSteep(4) && isQuickSteep(6) && isQuickSteep(8)).toBe(true)
    expect(isQuickSteep(5)).toBe(false)
  })
})

describe('kalenderoverblik', () => {
  const me = 'me'
  it('min karakter og gruppens snit pr. dag; intet snit hvis jeg ikke har stemt', () => {
    const rows = [
      { coffee_day: 1, user_id: me, score: 4 },
      { coffee_day: 1, user_id: 'a', score: 5 },
      { coffee_day: 1, user_id: 'b', score: 3 },
      { coffee_day: 2, user_id: me, score: 2 },
      { coffee_day: 3, user_id: 'a', score: 5 }, // jeg har ikke stemt: tæller ikke med i et snit
    ]
    const s = summarizeCalendar(rows, me)
    expect(s.get(1)).toEqual({ mine: 4, avg: 4, n: 3 })
    expect(s.get(2)).toEqual({ mine: 2, avg: 2, n: 1 })
    expect(s.get(3)).toEqual({ mine: null, avg: null, n: 1 })
    expect(s.get(4)).toBeUndefined()
  })
})
