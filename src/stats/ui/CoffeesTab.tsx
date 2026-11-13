import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { nameOf, type CoffeeStat, type StatMember, type Stats } from '../compute'
import { BarList, COLORS, Empty, fmt1, Section, type BarItem } from './parts'

const label = (c: CoffeeStat) => `Låge ${c.day} · ${c.country ?? c.name}`
const spread = (c: CoffeeStat) => (c.sd == null ? 'spredning ukendt' : `σ ${fmt1(c.sd)}`)
const sub = (c: CoffeeStat) => `n=${c.n} · median ${fmt1(c.median)} · ${spread(c)}`

function names(ids: string[], members: StatMember[]) {
  return ids.map((id) => nameOf(members, id)).join(', ')
}

export function CoffeesTab({ stats, members }: { stats: Stats; members: StatMember[] }) {
  const ranking: BarItem[] = stats.coffees.map((c) => ({ key: String(c.day), label: label(c), value: c.mean, display: fmt1(c.mean), sub: sub(c), low: c.low }))
  const split: BarItem[] = stats.splitting.map((c) => ({ key: String(c.day), label: label(c), value: c.sd ?? 0, display: `σ ${fmt1(c.sd ?? 0)}`, sub: `n=${c.n} · fra ${c.min} til ${c.max}` }))
  const agree: BarItem[] = stats.agreement.map((c) => ({ key: String(c.day), label: label(c), value: c.sd ?? 0, display: `σ ${fmt1(c.sd ?? 0)}`, sub: `n=${c.n} · snit ${fmt1(c.mean)}` }))
  const hasVotes = stats.coffees.length > 0
  const opinions = [...stats.coffees].filter((c) => c.lovers.length > 0).sort((a, b) => a.day - b.day)

  return (
    <div className="space-y-4">
      <Section title="Rangliste" hint="Gennemsnit af alle karakterer. σ er spredningen: jo højere, jo mere uenige.">
        <BarList items={ranking} max={8} empty="Ingen kaffer har fået karakter endnu." />
      </Section>

      <Section title="Mest splittende" hint="Højest spredning mellem karaktererne (kræver mindst 2 stemmer).">
        <BarList items={split} domain={[0, 2]} empty="Der skal være mindst 2 stemmer på en kaffe." />
      </Section>

      <Section title="Størst enighed" hint="Lavest spredning.">
        <BarList items={agree} domain={[0, 2]} empty="Der skal være mindst 2 stemmer på en kaffe." />
      </Section>

      <Section title="Udvikling over dagene" hint="Gruppens snit pr. låge.">
        {hasVotes ? (
          <div role="img" aria-label={`Gruppens snit pr. dag: ${stats.trend.map((t) => `dag ${t.day}: ${fmt1(t.mean)}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={stats.trend} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: COLORS.text }} tickLine={false} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: COLORS.text }} tickLine={false} width={40} />
                <Tooltip
                  content={({ active, payload }) => {
                    const p = active ? payload?.[0]?.payload : null
                    if (!p) return null
                    return (
                      <div className="rounded-lg bg-white px-3 py-2 text-sm shadow ring-1 ring-kaffe-200">
                        <strong>Låge {p.day}</strong>
                        <br />
                        Snit {fmt1(p.mean)} (n={p.n})
                      </div>
                    )
                  }}
                />
                <Line type="monotone" dataKey="mean" stroke={COLORS.brown} strokeWidth={3} dot={{ r: 4, fill: COLORS.brown }} activeDot={{ r: 6 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-center text-sm text-kaffe-600">Dag</p>
          </div>
        ) : (
          <Empty>Grafen vises, når du har stemt på en låge.</Empty>
        )}
      </Section>

      <Section title="Hvem elskede og hadede den mest?" hint="Højeste og laveste karakter pr. kaffe (hvor der er uenighed).">
        {opinions.length === 0 ? (
          <Empty>Vises, når mindst 2 har stemt på samme kaffe, og de ikke er enige.</Empty>
        ) : (
          <ul className="space-y-3">
            {opinions.map((c) => (
              <li key={c.day} className="text-base">
                <p className="font-medium text-kaffe-900">{label(c)}</p>
                <p className="text-kaffe-800">
                  <span aria-hidden="true">❤️</span> Elskede: <strong>{names(c.lovers, members)}</strong> ({c.max})
                </p>
                <p className="text-kaffe-800">
                  <span aria-hidden="true">💔</span> Hadede: <strong>{names(c.haters, members)}</strong> ({c.min})
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
