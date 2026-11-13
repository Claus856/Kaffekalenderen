import type { Group, Stats } from '../compute'
import { BarList, Section, type BarItem } from './parts'
import { fmt1 } from './parts'

const toItems = (groups: Group[]): BarItem[] =>
  groups.map((g) => ({ key: g.key, label: g.key, value: g.mean, display: fmt1(g.mean), sub: `n=${g.n} · ${g.k} ${g.k === 1 ? 'kaffe' : 'kaffer'}`, low: g.low }))

export function TasteTab({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-4">
      <Section title="Bedst likede smagsnoter" hint="Gennemsnit af karakterer for kaffer med noten (BREWs egne smagsnoter). Top 5.">
        <BarList items={toItems(stats.notesTop)} max={5} empty="Der skal være mindst 2 karakterer pr. note." />
      </Section>
      <Section title="Dårligst likede smagsnoter" hint="Bund 5, dårligst først.">
        <BarList items={toItems(stats.notesBottom)} max={5} empty="Der skal være flere noter med nok karakterer." />
      </Section>
      <Section title="Alle smagsnoter" hint="Snit pr. note, bedst først.">
        <BarList items={toItems(stats.byNote)} max={10} />
      </Section>
    </div>
  )
}
