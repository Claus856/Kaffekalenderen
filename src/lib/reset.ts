/** Bekræftelse og fejlbeskeder til "Nulstil alle vurderinger" i admin. Rene funktioner, så de kan testes. */

/** Admin skal skrive dette ord for at kunne slette. Forhindrer et uheldigt tryk. */
export const RESET_PHRASE = 'NULSTIL'

export const isResetConfirmed = (input: string) => input.trim().toLocaleUpperCase('da-DK') === RESET_PHRASE

/** Fejl fra databasefunktionerne ratings_reset_status() og reset_ratings(), på dansk. */
export function describeResetError(err: { message?: string; code?: string }): string {
  if (err.code === '55000' || /efter kalenderens start/i.test(err.message ?? '')) {
    return 'Der er stemt efter kalenderens start (1. december), så vurderingerne kan ikke nulstilles i appen.'
  }
  if (err.code === '42501' || /kun admin/i.test(err.message ?? '')) return 'Kun admin kan nulstille vurderinger.'
  return 'Nulstillingen mislykkedes. Prøv igen.'
}

export const vurderingerText = (n: number) => `${n} ${n === 1 ? 'vurdering' : 'vurderinger'}`
