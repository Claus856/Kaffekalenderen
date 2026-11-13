import { describe, expect, it } from 'vitest'
import { describeJoinStatus, describeSendCodeError, describeVerifyError } from './authMessages'
import { secretKeyProblem } from './keys'
import { cleanOtp, isValidEmail, normalizeEmail, validateDisplayName } from './validation'

describe('e-mail og kode', () => {
  it('normaliserer og validerer e-mail', () => {
    expect(normalizeEmail('  Claus@Example.DK ')).toBe('claus@example.dk')
    expect(isValidEmail('claus@example.dk')).toBe(true)
    expect(isValidEmail(' a.b+c@sub.example.com ')).toBe(true)
    for (const bad of ['', 'claus', 'claus@', '@example.dk', 'claus@example', 'cl aus@example.dk']) {
      expect(isValidEmail(bad)).toBe(false)
    }
  })

  it('cleanOtp beholder kun cifre og højst 6', () => {
    expect(cleanOtp('123456')).toBe('123456')
    expect(cleanOtp('123 456')).toBe('123456') // indsat med mellemrum
    expect(cleanOtp('12-34-56')).toBe('123456')
    expect(cleanOtp('1234567890')).toBe('123456')
    expect(cleanOtp('abc')).toBe('')
  })
})

describe('visningsnavn', () => {
  it('trimmer, samler mellemrum og tjekker længde 2–24', () => {
    expect(validateDisplayName('  Mette   Marie ')).toEqual({ ok: true, value: 'Mette Marie' })
    expect(validateDisplayName('Jo')).toEqual({ ok: true, value: 'Jo' })
    expect(validateDisplayName('x').ok).toBe(false)
    expect(validateDisplayName('   ').ok).toBe(false)
    expect(validateDisplayName('a'.repeat(24)).ok).toBe(true)
    expect(validateDisplayName('a'.repeat(25)).ok).toBe(false)
  })
})

describe('danske fejlbeskeder', () => {
  it('send kode: rate limit med sekunder, ikke-autoriseret mail, netværk', () => {
    expect(
      describeSendCodeError({ code: 'over_email_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 52 seconds.' }),
    ).toBe('Vent 52 sekunder, før du beder om en ny kode.')
    expect(describeSendCodeError({ status: 429, message: 'email rate limit exceeded' })).toMatch(/for mange koder/)
    expect(describeSendCodeError({ code: 'email_address_not_authorized', message: 'Email address not authorized' })).toMatch(/mailopsætning/)
    expect(describeSendCodeError({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' })).toMatch(/Ingen forbindelse/)
    expect(describeSendCodeError({ message: 'noget helt andet' })).toMatch(/kunne ikke sende koden/)
  })

  it('verificér kode: forkert/udløbet, men ikke generelle fejl', () => {
    expect(describeVerifyError({ code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' })).toMatch(/forkert eller udløbet/)
    expect(describeVerifyError({ message: 'Token has expired or is invalid' })).toMatch(/forkert eller udløbet/)
    // en ugyldig API-nøgle må ikke fremstå som en forkert kode
    expect(describeVerifyError({ status: 401, message: 'Invalid API key' })).toMatch(/Det lykkedes ikke at logge ind/)
    expect(describeVerifyError({ status: 429, message: 'too many' })).toMatch(/For mange forsøg/)
    expect(describeVerifyError({ message: 'Failed to fetch' })).toMatch(/Ingen forbindelse/)
  })

  it('statuskoder fra create_profile dækkes alle, og ukendte giver en venlig fejl', () => {
    expect(describeJoinStatus('ok')).toEqual({ ok: true })
    expect(describeJoinStatus('har_allerede_profil')).toEqual({ ok: true })
    for (const s of ['forkert_kode', 'navn_optaget', 'ugyldigt_navn', 'for_mange_forsog', 'ikke_logget_ind']) {
      const r = describeJoinStatus(s)
      expect(r.ok).toBe(false)
      expect(r.ok === false && r.message.length).toBeGreaterThan(10)
    }
    expect(describeJoinStatus('helt_ny_kode')).toEqual({ ok: false, message: 'Noget gik galt. Prøv igen.' })
  })
})

describe('nøgle-vagt', () => {
  const jwt = (role: string) => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role })}.signatur`
  }

  it('afviser secret- og service_role-nøgler i frontend', () => {
    expect(secretKeyProblem('sb_secret_abc123')).toMatch(/SECRET/)
    expect(secretKeyProblem(jwt('service_role'))).toMatch(/service_role/)
  })

  it('accepterer publishable og anon', () => {
    expect(secretKeyProblem('sb_publishable_abc123')).toBeNull()
    expect(secretKeyProblem(jwt('anon'))).toBeNull()
    expect(secretKeyProblem('ikke-en-jwt')).toBeNull()
  })
})
