import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { describeCorrelation } from '../math'
import type { Group, Stats } from '../compute'
import { BarList, COLORS, Empty, fmt1, fmtR, Section, type BarItem } from './parts'

const toItems = (groups: Group[]): BarItem[] =>
  groups.map((g) => ({ key: g.key, label: g.key, value: g.mean, display: fmt1(g.mean), sub: `n=${g.n} · ${g.k} ${g.k === 1 ? 'kaffe' : 'kaffer'}`, low: g.low }))

export function OriginTab({ stats }: { stats: Stats }) {
  const { altitude } = stats
  const reg = altitude.regression
  const xs = altitude.points.map((p) => p.altitude)
  const x0 = xs.length ? Math.min(...xs) : 0
  const x1 = xs.length ? Math.max(...xs) : 0

  return (
    <div className="space-y-4">
      <Section title="Verdensdel" hint="Gennemsnit af alle karakterer for kaffer fra området.">
        <BarList items={toItems(stats.byContinent)} />
      </Section>
      <Section title="Land">
        <BarList items={toItems(stats.byCountry)} max={8} />
      </Section>
      <Section title="Proces">
        <BarList items={toItems(stats.byProcess)} />
      </Section>
      <Section title="Varietet" hint="Kaffer med flere varieteter tæller med i dem alle.">
        <BarList items={toItems(stats.byVariety)} max={8} />
      </Section>
      <Section title="Ristningsgrad">
        <BarList items={toItems(stats.byRoast)} empty="Ristningsgraden er ikke udfyldt på kafferne endnu. Admin kan udfylde den." />
      </Section>

      <Section title="Højde mod karakter" hint="Hver prik er en kaffe: højde over havet (gennemsnit af min og max) mod gruppens snit.">
        {altitude.points.length === 0 ? (
          <Empty>Grafen vises, når mindst én kaffe har fået 2 karakterer.</Empty>
        ) : (
          <>
            <div role="img" aria-label={`Spredningsdiagram over højde og karakter for ${altitude.points.length} kaffer`}>
              <ResponsiveContainer width="100%" height={240}>
                <ScatterChart margin={{ top: 10, right: 16, left: -14, bottom: 8 }}>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="altitude" name="Højde" unit=" m" domain={['dataMin - 100', 'dataMax + 100']} tick={{ fontSize: 12, fill: COLORS.text }} tickLine={false} tickFormatter={(v) => String(Math.round(Number(v)))} />
                  <YAxis type="number" dataKey="mean" name="Snit" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: COLORS.text }} tickLine={false} width={40} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      const p = active ? payload?.[0]?.payload : null
                      if (!p) return null
                      return (
                        <div className="rounded-lg bg-white px-3 py-2 text-sm shadow ring-1 ring-kaffe-200">
                          <strong>
                            Låge {p.day} · {p.name}
                          </strong>
                          <br />
                          {Math.round(p.altitude)} m · snit {fmt1(p.mean)} (n={p.n})
                        </div>
                      )
                    }}
                  />
                  {reg && (
                    <ReferenceLine
                      segment={[
                        { x: x0, y: Math.max(1, Math.min(5, reg.intercept + reg.slope * x0)) },
                        { x: x1, y: Math.max(1, Math.min(5, reg.intercept + reg.slope * x1)) },
                      ]}
                      stroke={COLORS.light}
                      strokeDasharray="6 4"
                      strokeWidth={2}
                    />
                  )}
                  <Scatter data={altitude.points} fill={COLORS.brown} isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-base text-kaffe-800">
              {reg ? (
                <>
                  Sammenhæng: <strong>r = {fmtR(reg.r)}</strong> ({describeCorrelation(reg.r)}) over {altitude.points.length} kaffer.
                </>
              ) : (
                'Der skal være mindst 3 kaffer for at regne en sammenhæng ud.'
              )}
            </p>
            <p className="text-sm text-kaffe-600">
              En sammenhæng er ikke det samme som en årsag. {altitude.hidden > 0 && `${altitude.hidden} ${altitude.hidden === 1 ? 'kaffe' : 'kaffer'} er udeladt (kun 1 karakter eller ukendt højde).`}
            </p>
          </>
        )}
      </Section>
    </div>
  )
}
