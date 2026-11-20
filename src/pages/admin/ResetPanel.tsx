import { useState } from 'react'
import { Button, ErrorMessage, Field } from '../../components/ui'
import { resetRatings, type ResetStatus } from '../../data/queries'
import type { AsyncState } from '../../data/useAsync'
import { RESET_PHRASE, isResetConfirmed, vurderingerText } from '../../lib/reset'
import { supabase } from '../../lib/supabase'

/**
 * Nulstil alle vurderinger, så kalenderen kan starte med rent bord. Kan ikke fortrydes, så der kræves at man
 * skriver NULSTIL. Databasen spærrer, hvis der er stemt efter kalenderens start (1. december).
 */
export function ResetPanel({ status }: { status: AsyncState<ResetStatus> }) {
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function reset() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const deleted = await resetRatings(supabase)
      setPhrase('')
      setMessage(`Slettet ${vurderingerText(deleted)}. Alle låger står nu uden karakterer.`)
      status.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nulstillingen mislykkedes.')
      status.reload()
    } finally {
      setBusy(false)
    }
  }

  if (status.error && !status.data) return <ErrorMessage>{status.error}</ErrorMessage>
  if (!status.data) return <div className="h-40 animate-pulse rounded-2xl bg-white/70" />
  const { total, locked } = status.data

  return (
    <section className="rounded-2xl border-2 border-red-200 bg-white p-4 shadow-sm" aria-labelledby="reset-title">
      <h3 id="reset-title" className="text-lg font-bold text-red-800">
        Nulstil alle vurderinger
      </h3>
      <p className="mt-1 text-base text-kaffe-700">
        Sletter alle karakterer, kommentarer og bryggeparametre fra <strong>alle</strong> i gruppen, fx testvurderinger før kalenderen
        starter. Kaffer, medlemmer og indstillinger røres ikke. <strong>Det kan ikke fortrydes.</strong>
      </p>
      <p className="mt-2 text-base text-kaffe-900" role="status">
        {total === 0 ? 'Der er ingen vurderinger i databasen.' : `Der er ${vurderingerText(total)} i databasen.`}
      </p>

      {locked ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900" role="status">
          Nulstilling er spærret: der er stemt efter kalenderens start (1. december). Rigtige stemmer slettes ikke ved en fejl. Skal de
          alligevel slettes, kan det gøres direkte i Supabase (SQL Editor).
        </p>
      ) : total > 0 ? (
        <div className="mt-3 space-y-3">
          <Field
            id="reset-phrase"
            label={`Skriv ${RESET_PHRASE} for at bekræfte`}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
          <Button variant="danger" onClick={() => void reset()} disabled={busy || !isResetConfirmed(phrase)}>
            {busy ? 'Sletter…' : `Slet alle ${vurderingerText(total)}`}
          </Button>
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        <ErrorMessage>{error}</ErrorMessage>
        {message && (
          <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-base text-green-800">
            {message}
          </p>
        )}
      </div>
    </section>
  )
}
