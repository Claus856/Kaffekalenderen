import { FILL_LABELS } from '../../lib/format'
import { MIN_PAIRS, type BrewStat, type Stats } from '../compute'
import { describeCorrelation } from '../math'
import { BarList, Empty, fmt1, fmtR, Section, type BarItem } from './parts'

export function BrewSummary({ brew }: { brew: BrewStat }) {
  if (brew.n === 0) return <p className="text-base text-kaffe-600">Ingen bryg registreret endnu.</p>
  return (
    <p className="text-base text-kaffe-800">
      Bruger oftest <strong>{brew.typicalFill ? FILL_LABELS[brew.typicalFill] : '–'}</strong> og trækker i snit{' '}
      <strong>{brew.meanSteep != null ? fmt1(brew.meanSteep) : '–'} min</strong> (n={brew.n}).
      <span className="block text-sm text-kaffe-600">
        Mild {brew.fills.mild} · Medium {brew.fills.medium} · Strong {brew.fills.strong}
      </span>
    </p>
  )
}

export function CorrelationLine({ label, brew }: { label: string; brew: BrewStat }) {
  const fill = brew.corrFill
  const steep = brew.corrSteep
  if (fill == null && steep == null) {
    return (
      <li className="text-base text-kaffe-700">
        <strong className="text-kaffe-900">{label}</strong>:{' '}
        {brew.n >= MIN_PAIRS
          ? `bruger altid samme bryg, så der er ingen sammenhæng at regne ud (n=${brew.n}).`
          : `for få data (kræver mindst ${MIN_PAIRS} karakterer, n=${brew.n}).`}
      </li>
    )
  }
  return (
    <li className="text-base text-kaffe-800">
      <strong className="text-kaffe-900">{label}</strong> (n={brew.n})
      <br />
      Stærkere bryg: {fill != null ? `r = ${fmtR(fill)} (${describeCorrelation(fill)})` : 'ingen variation'}
      <br />
      Længere trækketid: {steep != null ? `r = ${fmtR(steep)} (${describeCorrelation(steep)})` : 'ingen variation'}
    </li>
  )
}

export function BrewTab({ stats }: { stats: Stats }) {
  const voters = stats.raters.filter((r) => r.n > 0)
  const byFill: BarItem[] = stats.brewByFill.map((f) => ({ key: f.fill, label: FILL_LABELS[f.fill], value: f.mean, display: fmt1(f.mean), sub: `n=${f.n} karakterer`, low: f.n < 2 }))

  return (
    <div className="space-y-4">
      <Section title="Hvad bruger hver person typisk?" hint="Mest brugte vandmængde og gennemsnitlig trækketid.">
        {voters.length === 0 ? (
          <Empty>Ingen karakterer endnu.</Empty>
        ) : (
          <ul className="space-y-4">
            {voters.map((r) => (
              <li key={r.id}>
                <p className="text-base font-semibold text-kaffe-900">{r.name}</p>
                <BrewSummary brew={r.brew} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Snit pr. vandmængde" hint="Samlet for alle. Pas på: det kan skyldes hvem der brugte hvilken styrke.">
        <BarList items={byFill} empty="Ingen karakterer endnu." />
      </Section>

      <Section
        title="Hænger bryggen sammen med karakteren?"
        hint="Korrelation mellem vandmængde (mild, medium, strong) eller trækketid og karakter. +1 = jo stærkere/længere, jo bedre karakter."
      >
        <ul className="space-y-4">
          <CorrelationLine label="Alle samlet" brew={stats.overallBrew} />
          {voters.map((r) => (
            <CorrelationLine key={r.id} label={r.name} brew={r.brew} />
          ))}
        </ul>
        <p className="mt-3 text-sm text-kaffe-600">En sammenhæng er ikke det samme som en årsag, og med få karakterer kan tallet svinge meget.</p>
      </Section>
    </div>
  )
}
