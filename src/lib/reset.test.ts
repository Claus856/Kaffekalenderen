import { describe, expect, it } from 'vitest'
import { RESET_PHRASE, describeResetError, isResetConfirmed, vurderingerText } from './reset'

describe('nulstil: bekræftelse', () => {
  it('kræver ordet NULSTIL, uanset store/små bogstaver og mellemrum omkring', () => {
    expect(RESET_PHRASE).toBe('NULSTIL')
    for (const ok of ['NULSTIL', 'nulstil', '  Nulstil  ']) expect(isResetConfirmed(ok)).toBe(true)
    for (const bad of ['', 'nulstil alle', 'nulstill', 'reset', 'NULSTIL.', 'nul stil']) expect(isResetConfirmed(bad)).toBe(false)
  })

  it('danske fejlbeskeder for spærret, ikke admin og ukendt fejl', () => {
    expect(describeResetError({ code: '55000', message: 'x' })).toMatch(/efter kalenderens start/)
    expect(describeResetError({ message: 'Der er stemt efter kalenderens start, så vurderingerne kan ikke nulstilles her' })).toMatch(/1\. december/)
    expect(describeResetError({ code: '42501' })).toBe('Kun admin kan nulstille vurderinger.')
    expect(describeResetError({ message: 'Kun admin kan nulstille vurderinger' })).toBe('Kun admin kan nulstille vurderinger.')
    expect(describeResetError({ message: 'noget helt andet' })).toBe('Nulstillingen mislykkedes. Prøv igen.')
  })

  it('ental og flertal', () => {
    expect(vurderingerText(0)).toBe('0 vurderinger')
    expect(vurderingerText(1)).toBe('1 vurdering')
    expect(vurderingerText(15)).toBe('15 vurderinger')
  })
})
