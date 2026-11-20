import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

/** Fuld skærm, centreret kolonne. Mobile-first: 16 px sidemargen og plads til iPhonens hjem-indikator. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      {children}
    </main>
  )
}

export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <header className="mb-8 text-center">
      <div className="text-5xl" aria-hidden="true">
        ☕
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-kaffe-900">Kaffekalenderen</h1>
      {subtitle && <p className="mt-2 text-base text-kaffe-700">{subtitle}</p>}
    </header>
  )
}

type Variant = 'primary' | 'secondary' | 'link' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'h-14 w-full rounded-2xl bg-kaffe-700 text-lg font-semibold text-white shadow-sm hover:bg-kaffe-800 active:bg-kaffe-900',
  secondary: 'h-14 w-full rounded-2xl border border-kaffe-300 bg-white text-lg font-semibold text-kaffe-800 hover:bg-kaffe-100',
  link: 'min-h-12 w-full text-base text-kaffe-700 underline underline-offset-4 hover:text-kaffe-900',
  danger: 'h-14 w-full rounded-2xl bg-red-700 text-lg font-semibold text-white shadow-sm hover:bg-red-800 active:bg-red-900',
}

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`${variants[variant]} transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    />
  )
}

/** Inputtet er 18 px (≥ 16 px), ellers zoomer iOS ind, når feltet får fokus. */
export function Field({
  label,
  hint,
  id,
  className = '',
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-base font-medium text-kaffe-800">
        {label}
      </label>
      <input
        id={id}
        className={`h-14 w-full rounded-2xl border border-kaffe-300 bg-white px-4 text-lg text-kaffe-900 placeholder:text-kaffe-300 focus:border-kaffe-600 focus:outline-none focus:ring-2 focus:ring-kaffe-400 ${className}`}
        {...input}
      />
      {hint && <p className="mt-1 text-sm text-kaffe-600">{hint}</p>}
    </div>
  )
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-800">
      {children}
    </p>
  )
}

export function Splash({ text = 'Henter…' }: { text?: string }) {
  return (
    <Screen>
      <div className="text-center" role="status" aria-live="polite">
        <div className="animate-pulse text-5xl" aria-hidden="true">
          ☕
        </div>
        <p className="mt-3 text-base text-kaffe-700">{text}</p>
      </div>
    </Screen>
  )
}
