import { useState } from 'react'
import { formatMinutes } from '../../lib/format'
import { nameOf, twinsOf, type StatCoffee, type StatMember, type StatRating, type Stats } from '../compute'
import { BrewSummary, CorrelationLine } from './BrewTab'
import { deviationText } from './UsTab'
import { Empty, fmt1, fmtR, Histogram, Metric, Section } from './parts'

/** Personlig side pr. bedømmer med alle tallene for personen. */
export function PeopleTab({
  stats,
  members,
  coffees,
  ratings,
  meId,
}: {
  stats: Stats
  members: StatMember[]
  coffees: StatCoffee[]
  ratings: StatRating[]
  meId: string
}) {
  const [selected, setSelected] = useState(members.some((m) => m.id === meId) ? meId : members[0]?.id)
  const rater = stats.raters.find((r) => r.id === selected)
  if (!rater) return <Empty>Ingen i gruppen endnu.</Empty>

  const ranked = [...stats.raters].filter((r) => r.n > 0).sort((a, b) => a.mean! - b.mean!)
  const strictRank = ranked.findIndex((r) => r.id === rater.id) + 1
  const devRanked = [...stats.raters].filter((r) => r.deviation.mad != null).sort((a, b) => a.deviation.mad! - b.deviation.mad!)
  const devRank = devRanked.findIndex((r) => r.id === rater.id) + 1
  const part = stats.participation.find((p) => p.id === rater.id)
  const twins = twinsOf(stats, rater.id)
  const votes = ratings.filter((r) => r.user_id === rater.id).sort((a, b) => a.coffee_day - b.coffee_day)
  // Kaffer uden land (fx "Ukendt kaffe") vises med deres navn
  const coffeeName = (day: number) => {
    const c = coffees.find((x) => x.day === day)
    return c?.country ?? c?.name ?? 'Ukendt kaffe'
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Vælg person" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === selected}
            onClick={() => setSelected(m.id)}
            className={`min-h-12 shrink-0 rounded-full px-4 text-base font-medium ${m.id === selected ? 'bg-kaffe-800 text-white' : 'bg-white text-kaffe-800 ring-1 ring-kaffe-200'}`}
          >
            {m.display_name}
            {m.id === meId && ' (dig)'}
          </button>
        ))}
      </div>

      <Section title={rater.name}>
        {rater.n === 0 ? (
          <Empty>Du kan ikke se nogen karakterer fra {rater.name} endnu. Det kræver, at du selv har stemt på samme dage.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Snit" value={fmt1(rater.mean!)} sub={`n=${rater.n} karakterer`} />
            <Metric label="Strenghed" value={`nr. ${strictRank}`} sub={`af ${ranked.length} (1 = strengest)`} />
            <Metric label="Afvigelse" value={rater.deviation.mad != null ? fmt1(rater.deviation.mad) : '–'} sub={devRank ? `nr. ${devRank} af ${devRanked.length} (1 = mest mainstream)` : 'kræver flere stemmer'} />
            <Metric label="Deltagelse" value={part ? `${part.days} af ${part.openDays}` : '–'} sub="åbne låger stemt på" />
          </div>
        )}
        {rater.deviation.signed != null && <p className="mt-3 text-base text-kaffe-800">Er i snit {deviationText(rater.deviation.signed)}.</p>}
      </Section>

      {rater.n > 0 && (
        <>
          <Section title="Fordeling af karakterer">
            <Histogram counts={rater.histogram} label={`${rater.name}s karakterer`} />
          </Section>

          <Section title="Yndlings og mindst likede" hint="Kun grupper med mindst 2 karakterer.">
            <dl className="space-y-3 text-base">
              <Pair label="Yndlingsverdensdel" g={rater.favContinent} />
              <Pair label="Mindst likede verdensdel" g={rater.leastContinent} />
              <Pair label="Yndlingssmagsnote" g={rater.favNote} />
              <Pair label="Mindst likede smagsnote" g={rater.leastNote} />
            </dl>
          </Section>

          <Section title="Bryg">
            <BrewSummary brew={rater.brew} />
            <ul className="mt-3">
              <CorrelationLine label={rater.name} brew={rater.brew} />
            </ul>
          </Section>

          <Section title="Smagstvillinger">
            {twins.closest ? (
              <p className="text-base text-kaffe-800">
                Ligner mest: <strong>{nameOf(members, twins.closest.id)}</strong> ({fmtR(twins.closest.r)}, n={twins.closest.n})
                {twins.farthest && (
                  <>
                    <br />
                    Ligner mindst: <strong>{nameOf(members, twins.farthest.id)}</strong> ({fmtR(twins.farthest.r)}, n={twins.farthest.n})
                  </>
                )}
              </p>
            ) : (
              <Empty>Kræver mindst 3 fælles dage med en anden.</Empty>
            )}
          </Section>

          <Section title="Alle karakterer fra personen" hint="Kun dage du selv har stemt på.">
            <ul className="divide-y divide-kaffe-100">
              {votes.map((v) => (
                <li key={v.coffee_day} className="flex items-center justify-between gap-3 py-2 text-base">
                  <span className="min-w-0 truncate text-kaffe-900">
                    Låge {v.coffee_day} · {coffeeName(v.coffee_day)}
                  </span>
                  <span className="shrink-0 text-kaffe-700">
                    {formatMinutes(v.steep_minutes)} · <strong className="text-lg text-kaffe-900">{v.score}</strong>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  )
}

function Pair({ label, g }: { label: string; g: { key: string; mean: number; n: number } | null }) {
  return (
    <div>
      <dt className="text-sm text-kaffe-600">{label}</dt>
      <dd className="font-medium text-kaffe-900">{g ? `${g.key} · snit ${fmt1(g.mean)} (n=${g.n})` : '–'}</dd>
    </div>
  )
}
