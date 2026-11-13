import { useState, type ReactNode } from 'react'
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { formatAverage } from '../../lib/format'

export const COLORS = { brown: '#63402a', light: '#b98a5c', grid: '#e2cfb6', text: '#4a3122', muted: '#9c6b3f' }

/** Korrelation med dansk decimalkomma og fortegn: 0,32 / −0,40 */
export const fmtR = (r: number) => (r < 0 ? '−' : '') + Math.abs(r).toFixed(2).replace('.', ',')
export const fmt1 = formatAverage
export const nText = (n: number) => `n=${n}`

export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="text-lg font-bold text-kaffe-900">{title}</h3>
      {hint && <p className="mt-0.5 text-sm text-kaffe-600">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-kaffe-50 px-3 py-3 text-base text-kaffe-700">{children}</p>
}

export interface BarItem {
  key: string
  label: string
  value: number
  /** teksten til højre, fx "4,3" */
  display: string
  /** lille tekst under bjælken, fx "n=3 · median 4 · σ 0,6" */
  sub?: string
  /** for få data (n < 2): vises svagt */
  low?: boolean
}

/**
 * Rangliste som vandrette bjælker i HTML. Mere læselig end et diagram på 375 px, fordi navnene får hele bredden.
 * Skalaen er som standard 1–5 (karakterskalaen).
 */
export function BarList({
  items,
  max = 6,
  domain = [1, 5],
  empty = 'Ingen data endnu.',
}: {
  items: BarItem[]
  max?: number
  domain?: [number, number]
  empty?: string
}) {
  const [all, setAll] = useState(false)
  if (items.length === 0) return <Empty>{empty}</Empty>
  const shown = all ? items : items.slice(0, max)
  const [lo, hi] = domain
  const pct = (v: number) => Math.max(2, Math.min(100, ((v - lo) / (hi - lo)) * 100))

  return (
    <div>
      <ol className="space-y-3">
        {shown.map((it) => (
          <li key={it.key} className={it.low ? 'opacity-60' : ''}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-base font-medium text-kaffe-900">{it.label}</span>
              <span className="shrink-0 text-lg font-bold text-kaffe-800">{it.display}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-kaffe-100" role="presentation">
              <div className="h-full rounded-full bg-kaffe-600" style={{ width: `${pct(it.value)}%` }} />
            </div>
            {it.sub && <p className="mt-0.5 text-sm text-kaffe-600">{it.sub}</p>}
          </li>
        ))}
      </ol>
      {items.length > max && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 min-h-12 text-base text-kaffe-700 underline underline-offset-4" aria-expanded={all}>
          {all ? 'Vis færre' : `Vis alle ${items.length}`}
        </button>
      )}
      {items.some((i) => i.low) && <p className="mt-1 text-sm text-kaffe-500">Svage rækker har kun 1 karakter (n=1) og tæller ikke med i top og bund.</p>}
    </div>
  )
}

/** Histogram over karakterer 1–5. */
export function Histogram({ counts, label }: { counts: number[]; label: string }) {
  const data = counts.map((count, i) => ({ score: String(i + 1), count }))
  return (
    <div role="img" aria-label={`${label}: ${data.map((d) => `karakter ${d.score}: ${d.count}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="score" tick={{ fontSize: 14, fill: COLORS.text }} axisLine={{ stroke: COLORS.grid }} tickLine={false} />
          <YAxis hide domain={[0, 'dataMax + 1']} />
          <Bar dataKey="count" fill={COLORS.brown} radius={[6, 6, 0, 0]} isAnimationActive={false} label={{ position: 'top', fontSize: 13, fill: COLORS.text }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Fane- og sektionsnavigation. Kan scrolles sidelæns på små skærme. */
export function TabBarPills<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string }>; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" aria-label="Statistik" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          onClick={() => onChange(t.id)}
          className={`min-h-12 shrink-0 rounded-full px-4 text-base font-medium transition ${
            value === t.id ? 'bg-kaffe-700 text-white shadow-sm' : 'bg-white text-kaffe-800 ring-1 ring-kaffe-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-kaffe-50 p-3">
      <p className="text-sm text-kaffe-600">{label}</p>
      <p className="text-2xl font-bold text-kaffe-900">{value}</p>
      {sub && <p className="text-sm text-kaffe-600">{sub}</p>}
    </div>
  )
}
