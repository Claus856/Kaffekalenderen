import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { describeJoinStatus } from '../lib/authMessages'
import { DISPLAY_NAME_MAX, validateDisplayName } from '../lib/validation'
import { Button, ErrorMessage, Field, Logo, Screen } from '../components/ui'
import { useAuth } from './AuthProvider'

/** Første gang: vælg visningsnavn og indtast gruppekoden. Profilen oprettes af Postgres-funktionen create_profile. */
export function JoinScreen({ email }: { email: string }) {
  const { refreshProfile, signOut } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [groupCode, setGroupCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const name = validateDisplayName(displayName)
    if (!name.ok) {
      setError(name.message)
      return
    }
    if (!groupCode.trim()) {
      setError('Skriv gruppekoden.')
      return
    }

    setBusy(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('create_profile', {
      p_display_name: name.value,
      p_group_code: groupCode,
    })
    if (rpcError) {
      setBusy(false)
      setError('Noget gik galt. Tjek din forbindelse og prøv igen.')
      return
    }
    const result = describeJoinStatus(data)
    if (!result.ok) {
      setBusy(false)
      setError(result.message)
      return
    }
    refreshProfile() // AuthProvider henter profilen og viser appen
  }

  return (
    <Screen>
      <Logo subtitle="Velkommen! Vælg et navn, og indtast gruppekoden du har fået af den, der inviterede dig." />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field
          id="display-name"
          label="Dit navn i gruppen"
          hint="Det er det de andre ser. 2–24 tegn."
          type="text"
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX + 10}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={busy}
          autoFocus
        />
        <Field
          id="group-code"
          label="Gruppekode"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={groupCode}
          onChange={(e) => setGroupCode(e.target.value)}
          disabled={busy}
        />
        <ErrorMessage>{error}</ErrorMessage>
        <Button type="submit" disabled={busy || !displayName.trim() || !groupCode.trim()}>
          {busy ? 'Kommer med…' : 'Kom med'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-kaffe-600">Logget ind som {email}.</p>
      <Button variant="link" onClick={() => void signOut()} disabled={busy}>
        Forkert e-mail? Log ud
      </Button>
    </Screen>
  )
}
