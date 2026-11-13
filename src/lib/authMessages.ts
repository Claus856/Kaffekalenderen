/** Danske fejlbeskeder til login og oprettelse af profil. Rene funktioner, så de kan testes. */

export interface AuthErrorLike {
  message?: string
  code?: string
  status?: number
  name?: string
}

const isNetworkError = (e: AuthErrorLike) =>
  e.name === 'AuthRetryableFetchError' || e.status === 0 || /failed to fetch|network|load failed/i.test(e.message ?? '')

/** Supabase skriver fx "…you can only request this after 52 seconds." */
const secondsFromMessage = (e: AuthErrorLike) => {
  const m = /after (\d+) seconds?/i.exec(e.message ?? '')
  return m ? Number(m[1]) : null
}

export function describeSendCodeError(e: AuthErrorLike): string {
  if (isNetworkError(e)) return 'Ingen forbindelse. Tjek dit net og prøv igen.'

  if (e.code === 'over_email_send_rate_limit' || e.status === 429 || /rate limit|security purposes/i.test(e.message ?? '')) {
    const s = secondsFromMessage(e)
    return s
      ? `Vent ${s} sekunder, før du beder om en ny kode.`
      : 'Der er bedt om for mange koder lige nu. Vent lidt og prøv igen.'
  }
  if (e.code === 'email_address_not_authorized' || /not authorized/i.test(e.message ?? '')) {
    return 'Mailen kunne ikke sendes til den adresse, for appens mailopsætning er ikke færdig. Sig det til admin.'
  }
  if (e.code === 'signup_disabled') return 'Nye brugere kan ikke oprettes lige nu. Sig det til admin.'
  if (e.code === 'email_provider_disabled') return 'Login med e-mail er slået fra. Sig det til admin.'
  if (e.code === 'validation_failed') return 'Det ligner ikke en gyldig e-mailadresse.'
  return 'Vi kunne ikke sende koden. Prøv igen om lidt.'
}

export function describeVerifyError(e: AuthErrorLike): string {
  if (isNetworkError(e)) return 'Ingen forbindelse. Tjek dit net og prøv igen.'
  // Bevidst smalt: en generel "invalid" (fx ugyldig API-nøgle) skal ikke fremstå som en forkert kode
  if (e.code === 'otp_expired' || /expired or is invalid|token.*expired/i.test(e.message ?? '')) {
    return 'Koden er forkert eller udløbet. Tjek koden, eller bed om en ny.'
  }
  if (e.status === 429 || e.code === 'over_request_rate_limit') return 'For mange forsøg. Vent lidt og prøv igen.'
  return 'Det lykkedes ikke at logge ind. Prøv igen.'
}

export type JoinResult = { ok: true } | { ok: false; message: string }

/** Statuskoder fra Postgres-funktionen create_profile (se supabase/migrations/…_functions.sql). */
export function describeJoinStatus(status: string): JoinResult {
  switch (status) {
    case 'ok':
    case 'har_allerede_profil': // allerede oprettet (fx dobbelttryk): det er stadig en succes
      return { ok: true }
    case 'forkert_kode':
      return { ok: false, message: 'Gruppekoden er forkert. Spørg den, der inviterede dig.' }
    case 'navn_optaget':
      return { ok: false, message: 'Det visningsnavn er allerede taget. Vælg et andet.' }
    case 'ugyldigt_navn':
      return { ok: false, message: 'Visningsnavnet skal være 2–24 tegn.' }
    case 'for_mange_forsog':
      return { ok: false, message: 'Der er indtastet for mange forkerte gruppekoder. Prøv igen om cirka 15 minutter.' }
    case 'ikke_logget_ind':
      return { ok: false, message: 'Du er ikke logget ind længere. Log ind igen.' }
    default:
      return { ok: false, message: 'Noget gik galt. Prøv igen.' }
  }
}
