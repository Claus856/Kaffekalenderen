import { useMemo } from 'react'
import { useCalendar } from '../../data/CalendarContext'
import { fetchParticipation } from '../../data/queries'
import { useAsync } from '../../data/useAsync'
import { supabase } from '../../lib/supabase'
import { ErrorMessage } from '../../components/ui'

const short = (name: string) => (name.length > 6 ? name.slice(0, 5) + '…' : name)

/** Hvem har stemt på hvilke dage (aldrig karakterer), og hvem der mangler i dag. */
export function ParticipationPanel() {
  const cal = useCalendar()
  const part = useAsync(() => fetchParticipation(supabase), [], { refetchOnFocus: true })

  const voted = useMemo(() => {
    const s = new Set<string>()
    for (const p of part.data ?? []) s.add(`${p.user_id}:${p.coffee_day}`)
    return s
  }, [part.data])

  if (part.error) return <ErrorMessage>{part.error}</ErrorMessage>
  if (!part.data) return <div className="h-40 animate-pulse rounded-2xl bg-white/70" />

  const open = Math.min(cal.openDay, 25)
  const days = Array.from({ length: open }, (_, i) => open - i) // nyeste øverst
  const missingToday = cal.today > 0 ? cal.members.filter((m) => !voted.has(`${m.id}:${cal.today}`)) : []

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="text-lg font-bold text-kaffe-900">Mangler at stemme i dag</h3>
        {cal.today === 0 ? (
          <p className="mt-1 text-base text-kaffe-700">Ingen låger er åbne endnu.</p>
        ) : missingToday.length === 0 ? (
          <p className="mt-1 text-base text-green-800">Alle har stemt på låge {cal.today} ✓</p>
        ) : (
          <p className="mt-1 text-base text-kaffe-900">
            Låge {cal.today}: <strong>{missingToday.map((m) => m.display_name).join(', ')}</strong>
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="text-lg font-bold text-kaffe-900">Deltagelse pr. låge</h3>
        <p className="text-sm text-kaffe-600">✓ = har stemt. Kun hvem, aldrig hvilken karakter.</p>
        {days.length === 0 ? (
          <p className="mt-2 text-base text-kaffe-700">Ingen åbne låger endnu.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-1 text-center">
              <thead>
                <tr>
                  <th scope="col" className="text-left text-sm font-medium text-kaffe-600">Låge</th>
                  {cal.members.map((m) => (
                    <th key={m.id} scope="col" className="px-1 text-sm font-medium text-kaffe-800" title={m.display_name}>
                      {short(m.display_name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d} className={d === cal.today ? 'bg-kaffe-100' : ''}>
                    <th scope="row" className="rounded-l-lg py-2 pl-2 text-left text-base font-medium text-kaffe-900">
                      {d}
                      {d === cal.today && <span className="ml-1 text-xs font-normal text-kaffe-600">i dag</span>}
                    </th>
                    {cal.members.map((m) => (
                      <td key={m.id} className="py-2 text-lg" aria-label={`${m.display_name}, låge ${d}: ${voted.has(`${m.id}:${d}`) ? 'har stemt' : 'mangler'}`}>
                        {voted.has(`${m.id}:${d}`) ? <span className="text-green-700">✓</span> : <span className="text-kaffe-300">·</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
