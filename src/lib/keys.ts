/**
 * Sikkerhedsnet: alt med VITE_-præfiks ender i browserens JavaScript. Hvis den hemmelige nøgle ved en fejl
 * lægges i VITE_SUPABASE_ANON_KEY, nægter appen at starte i stedet for at lække den.
 */

/** Returnerer en fejlbesked, hvis nøglen er hemmelig (secret/service_role), ellers null. */
export function secretKeyProblem(key: string): string | null {
  if (/^sb_secret_/i.test(key)) {
    return 'VITE_SUPABASE_ANON_KEY indeholder en SECRET-nøgle (sb_secret_…). Brug Publishable-nøglen (sb_publishable_…).'
  }
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(decodeBase64Url(parts[1])) as { role?: string }
      if (payload.role === 'service_role') {
        return 'VITE_SUPABASE_ANON_KEY indeholder service_role-nøglen. Brug anon/publishable-nøglen.'
      }
    } catch {
      // ikke en læsbar JWT: ikke vores sag her
    }
  }
  return null
}

function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}
