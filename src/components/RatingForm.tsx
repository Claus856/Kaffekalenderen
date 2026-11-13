import { useState, type FormEvent } from 'react'
import { FILL_DEFAULT_MINUTES, FILL_LABELS, FILL_LEVELS, type FillLevel } from '../lib/format'
import {
  COMMENT_MAX,
  STEEP_MAX,
  STEEP_MIN,
  isQuickSteep,
  steepAfterFillChange,
  validateDraft,
  type RatingDraft,
  type RatingValue,
} from '../lib/ratings'
import { Button, ErrorMessage } from './ui'

const QUICK_MINUTES: Array<{ fill: FillLevel; minutes: number }> = FILL_LEVELS.map((fill) => ({ fill, minutes: FILL_DEFAULT_MINUTES[fill] }))

const choice = (selected: boolean) =>
  `rounded-2xl border text-center transition ${
    selected ? 'border-kaffe-700 bg-kaffe-700 text-white shadow-sm' : 'border-kaffe-300 bg-white text-kaffe-800 hover:bg-kaffe-100'
  }`

/** Vurdering: karakter 1–5 (kun hele point), vandmængde, trækketid og kommentar. */
export function RatingForm({
  initial,
  submitLabel,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  initial: RatingDraft
  submitLabel: string
  saving: boolean
  error: string | null
  onSubmit: (value: RatingValue) => void
  onCancel?: () => void
}) {
  // Alt formularens tilstand ligger samlet og opdateres funktionelt, så to hurtige klik aldrig overskriver hinanden.
  // custom: "Andet" vises, når tiden ikke er en af hurtigknapperne, eller når man har trykket på den.
  const [form, setForm] = useState({ draft: initial, custom: !isQuickSteep(initial.steep), steepText: String(initial.steep) })
  const { draft, custom, steepText } = form
  const [localError, setLocalError] = useState<string | null>(null)

  const patchDraft = (patch: Partial<RatingDraft>) => setForm((f) => ({ ...f, draft: { ...f.draft, ...patch } }))

  function pickFill(fill: FillLevel) {
    setForm((f) => {
      const steep = steepAfterFillChange(f.draft.fill, f.draft.steep, fill)
      return { draft: { ...f.draft, fill, steep }, steepText: String(steep), custom: !isQuickSteep(steep) }
    })
  }

  function pickMinutes(minutes: number) {
    setForm((f) => ({ draft: { ...f.draft, steep: minutes }, steepText: String(minutes), custom: false }))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const check = validateDraft(draft)
    if (!check.ok) {
      setLocalError(check.message)
      return
    }
    setLocalError(null)
    onSubmit(check.value)
  }

  const quickSelected = (m: number) => !custom && draft.steep === m

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset>
        <legend className="mb-2 text-lg font-semibold text-kaffe-900">
          Din karakter <span className="text-base font-normal text-kaffe-600">(5 er bedst)</span>
        </legend>
        <div role="radiogroup" aria-label="Karakter fra 1 til 5" className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={draft.score === n}
              onClick={() => patchDraft({ score: n })}
              className={`h-16 text-2xl font-bold ${choice(draft.score === n)}`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-lg font-semibold text-kaffe-900">Vandmængde</legend>
        <div role="radiogroup" aria-label="Vandmængde" className="grid grid-cols-3 gap-2">
          {FILL_LEVELS.map((fill) => (
            <button
              key={fill}
              type="button"
              role="radio"
              aria-checked={draft.fill === fill}
              onClick={() => pickFill(fill)}
              className={`min-h-14 px-1 text-base font-medium ${choice(draft.fill === fill)}`}
            >
              {fill === 'medium' ? (
                <>
                  Medium
                  <span className="block text-sm font-normal opacity-80">300 ml</span>
                </>
              ) : (
                FILL_LABELS[fill]
              )}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-lg font-semibold text-kaffe-900">Trækketid</legend>
        <div role="radiogroup" aria-label="Trækketid" className="grid grid-cols-4 gap-2">
          {QUICK_MINUTES.map(({ fill, minutes }) => (
            <button
              key={minutes}
              type="button"
              role="radio"
              aria-checked={quickSelected(minutes)}
              onClick={() => pickMinutes(minutes)}
              className={`min-h-14 px-1 text-base font-medium ${choice(quickSelected(minutes))}`}
            >
              {minutes} min
              <span className="block text-xs font-normal opacity-80">{fill}</span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={custom}
            onClick={() => setForm((f) => ({ ...f, custom: true }))}
            className={`min-h-14 px-1 text-base font-medium ${choice(custom)}`}
          >
            Andet
          </button>
        </div>
        {custom && (
          <div className="mt-3 flex items-center gap-3">
            <input
              id="steep-custom"
              type="number"
              inputMode="numeric"
              min={STEEP_MIN}
              max={STEEP_MAX}
              step={1}
              value={steepText}
              onChange={(e) => {
                const value = e.target.value
                setForm((f) => ({ ...f, steepText: value, draft: { ...f.draft, steep: value === '' ? NaN : Number(value) } }))
              }}
              aria-label="Antal minutter"
              className="h-14 w-28 rounded-2xl border border-kaffe-300 bg-white px-4 text-center text-xl text-kaffe-900 focus:border-kaffe-600 focus:outline-none focus:ring-2 focus:ring-kaffe-400"
            />
            <label htmlFor="steep-custom" className="text-base text-kaffe-800">
              minutter
            </label>
          </div>
        )}
      </fieldset>

      <div>
        <label htmlFor="comment" className="mb-2 block text-lg font-semibold text-kaffe-900">
          Kommentar <span className="text-base font-normal text-kaffe-600">(valgfrit)</span>
        </label>
        <textarea
          id="comment"
          rows={3}
          maxLength={COMMENT_MAX}
          value={draft.comment}
          onChange={(e) => patchDraft({ comment: e.target.value })}
          placeholder="Hvad synes du?"
          className="w-full rounded-2xl border border-kaffe-300 bg-white p-4 text-lg text-kaffe-900 placeholder:text-kaffe-300 focus:border-kaffe-600 focus:outline-none focus:ring-2 focus:ring-kaffe-400"
        />
      </div>

      <ErrorMessage>{localError ?? error}</ErrorMessage>

      <div className="space-y-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Gemmer…' : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="link" onClick={onCancel} disabled={saving}>
            Annullér
          </Button>
        )}
      </div>
    </form>
  )
}
