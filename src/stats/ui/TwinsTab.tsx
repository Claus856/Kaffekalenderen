import { MIN_PAIRS, nameOf, twinsOf, type StatMember, type Stats } from '../compute'
import { Empty, fmtR, Section } from './parts'

/** Farve efter korrelation: grøn = enige, rød = uenige. Gennemsigtighed efter styrke. */
function cellStyle(r: number | null): { backgroundColor: string } {
  if (r == null) return { backgroundColor: 'transparent' }
  const alpha = Math.min(1, Math.abs(r)) * 0.6
  return { backgroundColor: r >= 0 ? `rgba(22, 101, 52, ${alpha})` : `rgba(185, 28, 28, ${alpha})` }
}

const short = (name: string) => (name.length > 6 ? name.slice(0, 5) + '…' : name)

export function TwinsTab({ stats, members }: { stats: Stats; members: StatMember[] }) {
  const ids = members.map((m) => m.id)
  const pair = (a: string, b: string) => stats.twins.find((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a))
  const anyR = stats.twins.some((t) => t.r != null)

  return (
    <div className="space-y-4">
      <Section
        title="Smagstvillinger"
        hint={`Korrelation mellem to personers karakterer over de dage begge har stemt på. +1 = helt enige, −1 = stik modsatte. Kræver mindst ${MIN_PAIRS} fælles dage.`}
      >
        {members.length < 2 ? (
          <Empty>Der skal være mindst 2 i gruppen.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-center" aria-label="Korrelation mellem personer">
              <thead>
                <tr>
                  <th className="w-14" />
                  {members.map((m) => (
                    <th key={m.id} scope="col" className="px-0.5 text-sm font-medium text-kaffe-800" title={m.display_name}>
                      {short(m.display_name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="pr-1 text-left text-sm font-medium text-kaffe-800" title={row.display_name}>
                      {short(row.display_name)}
                    </th>
                    {members.map((col) => {
                      if (row.id === col.id) {
                        return (
                          <td key={col.id} className="rounded-lg bg-kaffe-100 text-kaffe-400">
                            –
                          </td>
                        )
                      }
                      const t = pair(row.id, col.id)
                      return (
                        <td
                          key={col.id}
                          style={cellStyle(t?.r ?? null)}
                          className="h-14 min-w-[3rem] rounded-lg ring-1 ring-kaffe-100"
                          aria-label={`${row.display_name} og ${col.display_name}: ${t?.r != null ? fmtR(t.r) : 'for få fælles dage'}, ${t?.n ?? 0} fælles dage`}
                        >
                          <span className="block text-base font-bold leading-tight text-kaffe-900">{t?.r != null ? fmtR(t.r) : '·'}</span>
                          <span className="block text-xs text-kaffe-700">n={t?.n ?? 0}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!anyR && members.length >= 2 && <p className="mt-2 text-sm text-kaffe-600">Endnu ingen par med {MIN_PAIRS} eller flere fælles dage.</p>}
        <p className="mt-2 text-sm text-kaffe-600">n er antal fælles dage. En prik betyder for få fælles dage.</p>
      </Section>

      <Section title="Nærmeste og fjerneste smag" hint="For hver person: hvem der ligner mest og mindst.">
        {!anyR ? (
          <Empty>Vises, når mindst to personer har {MIN_PAIRS} fælles dage.</Empty>
        ) : (
          <ul className="space-y-3">
            {ids.map((id) => {
              const t = twinsOf(stats, id)
              if (!t.closest) return null
              return (
                <li key={id} className="text-base text-kaffe-800">
                  <strong className="text-kaffe-900">{nameOf(members, id)}</strong>
                  <br />
                  Ligner mest: {nameOf(members, t.closest.id)} ({fmtR(t.closest.r)}, n={t.closest.n})
                  {t.farthest && (
                    <>
                      <br />
                      Ligner mindst: {nameOf(members, t.farthest.id)} ({fmtR(t.farthest.r)}, n={t.farthest.n})
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
