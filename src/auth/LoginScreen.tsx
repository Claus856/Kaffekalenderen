import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { describeSendCodeError, describeVerifyError } from '../lib/authMessages'
import { OTP_LENGTH, cleanOtp, isValidEmail, normalizeEmail } from '../lib/validation'
import { Button, ErrorMessage, Field, Logo, Screen } from '../components/ui'

/** Supabase tillader kun én kode pr. 60 sekunder pr. adresse. */
const RESEND_SECONDS = 60

type Step = 'email' | 'code'

export function LoginScreen() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const lastTried = useRef('')

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    const address = normalizeEmail(email)
    if (!isValidEmail(address)) {
      setError('Skriv en gyldig e-mailadresse.')
      return
    }
    setBusy(true)
    setError(null)
    // shouldCreateUser: nye venner opretter sig selv her. Uden gruppekode (næste skærm) får de ingen adgang.
    const { error: err } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } })
    setBusy(false)
    if (err) {
      setError(describeSendCodeError(err))
      return
    }
    setEmail(address)
    setCode('')
    lastTried.current = ''
    setStep('code')
    setCooldown(RESEND_SECONDS)
  }

  async function verify(token: string) {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (err) {
      setBusy(false)
      setError(describeVerifyError(err))
      setCode('')
      lastTried.current = ''
    }
    // Ved succes skifter AuthProvider skærm af sig selv, så busy forbliver sat.
  }

  // Feltet er deaktiveret, mens koden tjekkes, og mister så fokus. Efter en fejl skal markøren tilbage.
  useEffect(() => {
    if (step === 'code' && !busy) document.getElementById('code')?.focus()
  }, [step, busy])

  // Send automatisk, når den sjette cifre er tastet eller indsat (iPhone kan selv foreslå koden fra mailen).
  useEffect(() => {
    if (step === 'code' && code.length === OTP_LENGTH && lastTried.current !== code && !busy) {
      lastTried.current = code
      void verify(code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step])

  if (step === 'email') {
    return (
      <Screen>
        <Logo subtitle="Log ind med din e-mail. Du får en 6-cifret kode." />
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <Field
            id="email"
            label="E-mail"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="dig@eksempel.dk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" disabled={busy || !email.trim()}>
            {busy ? 'Sender kode…' : 'Send kode'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-kaffe-600">
          Ingen adgangskode. Du bliver husket på denne enhed, så du normalt kun logger ind én gang.
        </p>
      </Screen>
    )
  }

  return (
    <Screen>
      <Logo subtitle={`Vi har sendt en kode til ${email}. Tjek også spam.`} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (code.length === OTP_LENGTH && !busy) {
            lastTried.current = code
            void verify(code)
          }
        }}
        className="space-y-4"
      >
        <Field
          id="code"
          label="Kode fra mailen"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH + 4}
          placeholder="••••••"
          className="text-center text-3xl tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(cleanOtp(e.target.value))}
          disabled={busy}
          autoFocus
        />
        <ErrorMessage>{error}</ErrorMessage>
        <Button type="submit" disabled={busy || code.length !== OTP_LENGTH}>
          {busy ? 'Logger ind…' : 'Log ind'}
        </Button>
      </form>
      <div className="mt-4 space-y-1">
        <Button variant="link" onClick={() => void sendCode()} disabled={busy || cooldown > 0}>
          {cooldown > 0 ? `Send ny kode om ${cooldown} s` : 'Send ny kode'}
        </Button>
        <Button
          variant="link"
          onClick={() => {
            setStep('email')
            setCode('')
            setError(null)
          }}
          disabled={busy}
        >
          Brug en anden e-mail
        </Button>
      </div>
    </Screen>
  )
}
