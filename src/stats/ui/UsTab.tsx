import type { RaterStat, Stats } from '../compute'
import { BarList, Empty, fmt1, Histogram, Section, type BarItem } from './parts'

/** "mildere end de andre (+0,6)" / "strengere end de andre (−0,4)" */
export function deviationText(signed: number | null): string {
  if (signed == null) return ''
  if (Math.abs(signed) < 0.05) return 'giver omtrent samme karakterer som de andre'
  const v = `${signed < 0 ? '−' : '+'}${Math.abs(signed).toFixed(1).replace('.', ',')}`
  return signed < 0 ? `strengere end de andre (${v})` : `mildere end de andre (${v})`
}

export function UsTab({ stats }: { stats: Stats }) {
  const voters = stats.raters.filter((r) => r.n > 0)

  const byMean = [...voters].sort((a, b) => a.mean! - b.mean!)
  const strictness: BarItem[] = byMean.map((r, i) => ({
    key: r.id,
    label: r.name,
    value: r.mean!,
    display: fmt1(r.mean!),
    sub: `n=${r.n} karakterer${byMean.length > 1 && i === 0 ? ' · strengest' : ''}${byMean.length > 1 && i === byMean.length - 1 ? ' · mildest' : ''}`,
    low: r.n < 2,
  }))

  const withDev = voters.filter((r) => r.deviation.mad != null).sort((a, b) => a.deviation.mad! - b.deviation.mad!)
  const mainstream: BarItem[] = withDev.map((r: RaterStat, i) => ({
    key: r.id,
    label: r.name,
    value: r.deviation.mad!,
    display: fmt1(r.deviation.mad!),
    sub: `${r.deviation.days} ${r.deviation.days === 1 ? 'dag' : 'dage'} · ${deviationText(r.deviation.signed)}${withDev.length > 1 && i === 0 ? ' · mest mainstream' : ''}${withDev.length > 1 && i === withDev.length - 1 ? ' · mest kontrær' : ''}`,
    low: r.deviation.days < 2,
  }))

  const participation: BarItem[] = [...stats.participation]
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name, 'da'))
    .map((p) => ({ key: p.id, label: p.name, value: p.days, display: `${p.days} af ${p.openDays}`, sub: p.openDays === 0 ? undefined : `${Math.round((p.days / p.openDays) * 100)} % af de åbne låger` }))

  return (
    <div className="space-y-4">
      <Section title="Snit pr. person" hint="Strengest øverst, mildest nederst.">
        <BarList items={strictness} empty="Ingen karakterer endnu." />
      </Section>

      <Section title="Fordeling af karakterer" hint="Hvor mange gange hver karakter er givet.">
        {stats.ratingCount === 0 ? (
          <Empty>Ingen karakterer endnu.</Empty>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-base font-medium text-kaffe-900">Alle ({stats.ratingCount})</p>
              <Histogram counts={stats.overallHistogram} label="Alle karakterer" />
            </div>
            {voters.map((r) => (
              <div key={r.id}>
                <p className="text-base font-medium text-kaffe-900">
                  {r.name} ({r.n})
                </p>
                <Histogram counts={r.histogram} label={`${r.name}s karakterer`} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Afvigelse fra gruppen" hint="Gennemsnitlig afstand mellem personens karakter og de andres snit samme dag. Lav = mainstream, høj = kontrær.">
        <BarList items={mainstream} domain={[0, 2]} empty="Kræver at mindst 2 personer har stemt på samme dag." />
      </Section>

      <Section title="Deltagelse" hint="Antal dage hver person har stemt på, ud af de låger der er åbne.">
        <BarList items={participation} domain={[0, Math.max(1, stats.participation[0]?.openDays ?? 1)]} empty="Ingen låger er åbne endnu." />
        {stats.missingToday.length > 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-base text-amber-900" role="status">
            Mangler at stemme i dag: <strong>{stats.missingToday.map((m) => m.display_name).join(', ')}</strong>
          </p>
        ) : (
          stats.participation.some((p) => p.openDays > 0) && <p className="mt-3 text-base text-green-800">Alle har stemt i dag ✓</p>
        )}
      </Section>
    </div>
  )
}
