import { useState } from 'react'
import { Button, ErrorMessage, Field } from '../../components/ui'
import { fetchSettings, setGroupCode, setShowFutureDays } from '../../data/queries'
import { useAsync } from '../../data/useAsync'
import { supabase } from '../../lib/supabase'
import { useCalendar } from '../../data/CalendarContext'

/** Indstillinger: åbn alle låger (test/efterslæb) og skift gruppekode. */
export function SettingsPanel() {
  const settings = useAsync(() => fetchSettings(supabase), [])
  const cal = useCalendar()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [code, setCode] = useState('')

  async function toggleFuture(next: boolean) {
    if (next && !window.confirm('Alle låger bliver åbne for ALLE, og man kan stemme på alt. Husk at slå den fra igen. Fortsæt?')) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await setShowFutureDays(supabase, next)
      settings.reload()
      setMessage(next ? 'Alle låger er nu åbne. Genindlæs appen for at se det overalt.' : 'Låger åbner igen efter datoen.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noget gik galt.')
    } finally {
      setBusy(false)
    }
  }

  async function changeCode() {
    if (code.trim().length < 6) {
      setError('Gruppekoden skal være mindst 6 tegn.')
      return
    }
    if (!window.confirm('Skift gruppekode? Den gamle kode virker ikke mere til nye medlemmer. Eksisterende medlemmer påvirkes ikke.')) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await setGroupCode(supabase, code)
      setCode('')
      setMessage('Gruppekoden er skiftet. Husk at give den nye kode til dem, du vil invitere.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noget gik galt.')
    } finally {
      setBusy(false)
    }
  }

  if (settings.error) return <ErrorMessage>{settings.error}</ErrorMessage>
  if (!settings.data) return <div className="h-40 animate-pulse rounded-2xl bg-white/70" />
  const on = settings.data.show_future_days

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="text-lg font-bold text-kaffe-900">Åbn alle låger</h3>
        <p className="mt-1 text-base text-kaffe-700">
          Normalt åbner én låge pr. dag fra 1. december (dansk tid). Slår du det til, kan alle se og stemme på alle låger. Brug det til
          test før 1. december eller til efterslæb, og husk at slå det fra igen.
        </p>
        <p className="mt-2 text-base text-kaffe-800">
          Status: <strong>{on ? 'alle låger er åbne' : 'følger datoen'}</strong> · højeste åbne låge: {cal.openDay}
        </p>
        <div className="mt-3">
          <Button variant={on ? 'secondary' : 'primary'} onClick={() => void toggleFuture(!on)} disabled={busy}>
            {on ? 'Slå fra (følg datoen)' : 'Åbn alle låger'}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="text-lg font-bold text-kaffe-900">Skift gruppekode</h3>
        <p className="mt-1 text-base text-kaffe-700">Koden nye venner skal bruge, første gang de logger ind. Mindst 6 tegn. Store og små bogstaver er ligegyldige.</p>
        <div className="mt-3 space-y-3">
          <Field id="new-code" label="Ny gruppekode" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <Button onClick={() => void changeCode()} disabled={busy || code.trim().length === 0}>
            Skift gruppekode
          </Button>
        </div>
      </section>

      <ErrorMessage>{error}</ErrorMessage>
      {message && (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-base text-green-800">
          {message}
        </p>
      )}
    </div>
  )
}
