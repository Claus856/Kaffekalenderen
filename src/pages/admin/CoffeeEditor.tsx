import { useEffect, useState, type ChangeEvent } from 'react'
import { Button, ErrorMessage } from '../../components/ui'
import { clearManualFields, fetchAllCoffees, updateCoffee } from '../../data/queries'
import { useAsync } from '../../data/useAsync'
import { CONTINENTS } from '../../lib/continents'
import { FIELD_LABELS, ROAST_OPTIONS, checkCoffeeEdit, formFromCoffee, mergeManualFields, type CoffeeForm } from '../../lib/coffeeEdit'
import { supabase } from '../../lib/supabase'

const inputClass =
  'h-14 w-full rounded-2xl border border-kaffe-300 bg-white px-4 text-lg text-kaffe-900 focus:border-kaffe-600 focus:outline-none focus:ring-2 focus:ring-kaffe-400'

function Labeled({ id, label, manual, children }: { id: string; label: string; manual: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-center justify-between text-base font-medium text-kaffe-800">
        <span>{label}</span>
        {manual && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">rettet manuelt</span>}
      </label>
      {children}
    </div>
  )
}

/** Ret kaffedata manuelt, hvis scraperen har fået noget forkert. Rettede felter overskrives ikke af scraperen. */
export function CoffeeEditor() {
  const list = useAsync(() => fetchAllCoffees(supabase), [])
  const [day, setDay] = useState(1)
  const [form, setForm] = useState<CoffeeForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const coffee = list.data?.find((c) => c.day === day) ?? null

  // Formularen nulstilles, når man skifter kaffe, eller når kaffen er gemt og hentet igen
  useEffect(() => {
    setForm(coffee ? formFromCoffee(coffee) : null)
  }, [coffee])

  if (list.error) return <ErrorMessage>{list.error}</ErrorMessage>
  if (!list.data || !coffee || !form) return <div className="h-64 animate-pulse rounded-2xl bg-white/70" />

  const manual = new Set(coffee.manual_fields)
  const set = (key: keyof CoffeeForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value })

  async function save() {
    if (!coffee || !form) return
    const check = checkCoffeeEdit(coffee, form)
    if (!check.ok) {
      setError(check.message)
      setMessage(null)
      return
    }
    if (check.changed.length === 0) {
      setError(null)
      setMessage('Ingen ændringer at gemme.')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await updateCoffee(supabase, coffee.day, check.patch, check.notes, mergeManualFields(coffee.manual_fields, check.changed))
      setMessage(`Gemt ✓ (${check.changed.map((f) => FIELD_LABELS[f]).join(', ')}). Scraperen overskriver dem ikke.`)
      list.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke gemme.')
    } finally {
      setSaving(false)
    }
  }

  async function resetManual() {
    if (!coffee || !window.confirm('Fjern markeringen? Så må scraperen overskrive kaffens felter næste gang den kører.')) return
    try {
      await clearManualFields(supabase, coffee.day)
      setMessage('Markeringen er fjernet.')
      list.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke nulstille.')
    }
  }

  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
      <div>
        <label htmlFor="coffee-day" className="mb-1 block text-base font-medium text-kaffe-800">
          Kaffe
        </label>
        <select
          id="coffee-day"
          value={day}
          onChange={(e) => {
            setDay(Number(e.target.value))
            setError(null)
            setMessage(null)
          }}
          className={inputClass}
        >
          {list.data.map((c) => (
            <option key={c.day} value={c.day}>
              Låge {c.day} · {c.country ?? c.name}
              {c.manual_fields.length ? ' ✎' : ''}
            </option>
          ))}
        </select>
      </div>

      <Labeled id="f-name" label={FIELD_LABELS.name} manual={manual.has('name')}>
        <input id="f-name" className={inputClass} value={form.name} onChange={set('name')} />
      </Labeled>
      <Labeled id="f-country" label={FIELD_LABELS.country} manual={manual.has('country')}>
        <input id="f-country" className={inputClass} value={form.country} onChange={set('country')} />
      </Labeled>
      <Labeled id="f-region" label={FIELD_LABELS.region} manual={manual.has('region')}>
        <input id="f-region" className={inputClass} value={form.region} onChange={set('region')} />
      </Labeled>
      <Labeled id="f-continent" label={FIELD_LABELS.continent} manual={manual.has('continent')}>
        <select id="f-continent" className={inputClass} value={form.continent} onChange={set('continent')}>
          <option value="">(ingen)</option>
          {CONTINENTS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Labeled>
      <div className="grid grid-cols-2 gap-3">
        <Labeled id="f-alt-min" label={FIELD_LABELS.altitude_min} manual={manual.has('altitude_min')}>
          <input id="f-alt-min" className={inputClass} inputMode="numeric" value={form.altitude_min} onChange={set('altitude_min')} />
        </Labeled>
        <Labeled id="f-alt-max" label={FIELD_LABELS.altitude_max} manual={manual.has('altitude_max')}>
          <input id="f-alt-max" className={inputClass} inputMode="numeric" value={form.altitude_max} onChange={set('altitude_max')} />
        </Labeled>
      </div>
      <Labeled id="f-variety" label={FIELD_LABELS.variety} manual={manual.has('variety')}>
        <input id="f-variety" className={inputClass} value={form.variety} onChange={set('variety')} />
      </Labeled>
      <Labeled id="f-process" label={FIELD_LABELS.process} manual={manual.has('process')}>
        <input id="f-process" className={inputClass} value={form.process} onChange={set('process')} />
      </Labeled>
      <Labeled id="f-roast" label={FIELD_LABELS.roast} manual={manual.has('roast')}>
        <select id="f-roast" className={inputClass} value={form.roast} onChange={set('roast')}>
          <option value="">(ikke udfyldt)</option>
          {ROAST_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled id="f-notes" label={FIELD_LABELS.notes} manual={manual.has('notes')}>
        <input id="f-notes" className={inputClass} value={form.notes} onChange={set('notes')} />
      </Labeled>
      <Labeled id="f-description" label={FIELD_LABELS.description} manual={manual.has('description')}>
        <textarea id="f-description" rows={5} className="w-full rounded-2xl border border-kaffe-300 bg-white p-4 text-lg text-kaffe-900 focus:border-kaffe-600 focus:outline-none focus:ring-2 focus:ring-kaffe-400" value={form.description} onChange={set('description')} />
      </Labeled>
      <Labeled id="f-image" label={FIELD_LABELS.image_url} manual={manual.has('image_url')}>
        <input id="f-image" className={inputClass} inputMode="url" value={form.image_url} onChange={set('image_url')} />
      </Labeled>
      <Labeled id="f-product" label={FIELD_LABELS.product_url} manual={manual.has('product_url')}>
        <input id="f-product" className={inputClass} inputMode="url" value={form.product_url} onChange={set('product_url')} />
      </Labeled>

      <ErrorMessage>{error}</ErrorMessage>
      {message && (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-base text-green-800">
          {message}
        </p>
      )}

      <Button onClick={() => void save()} disabled={saving}>
        {saving ? 'Gemmer…' : 'Gem rettelser'}
      </Button>
      {coffee.manual_fields.length > 0 && (
        <Button variant="link" onClick={() => void resetManual()}>
          Fjern “rettet manuelt” (scraperen må overskrive igen)
        </Button>
      )}
    </section>
  )
}
