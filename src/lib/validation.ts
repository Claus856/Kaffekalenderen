export const OTP_LENGTH = 6
export const DISPLAY_NAME_MIN = 2
export const DISPLAY_NAME_MAX = 24

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase()

export const isValidEmail = (raw: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim())

/** Kun cifre, højst OTP_LENGTH. Fjerner mellemrum og bindestreger, så en indsat "123 456" virker. */
export const cleanOtp = (raw: string) => raw.replace(/\D/g, '').slice(0, OTP_LENGTH)

export type NameCheck = { ok: true; value: string } | { ok: false; message: string }

export function validateDisplayName(raw: string): NameCheck {
  const value = raw.trim().replace(/\s+/g, ' ')
  if (value.length < DISPLAY_NAME_MIN) return { ok: false, message: `Visningsnavnet skal være mindst ${DISPLAY_NAME_MIN} tegn.` }
  if (value.length > DISPLAY_NAME_MAX) return { ok: false, message: `Visningsnavnet må højst være ${DISPLAY_NAME_MAX} tegn.` }
  return { ok: true, value }
}
