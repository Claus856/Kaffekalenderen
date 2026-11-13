import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { useCalendar } from '../data/CalendarContext'
import { fetchRatingOverview } from '../data/queries'
import { useAsync } from '../data/useAsync'
import { LAST_DAY } from '../lib/dates'
import { formatAverage } from '../lib/format'
import { summarizeCalendar, type DaySummary } from '../lib/ratings'
import { supabase } from '../lib/supabase'

type DoorState = 'locked' | 'open' | 'voted'

function Door({ day, state, summary, isToday }: { day: number; state: DoorState; summary?: DaySummary; isToday: boolean }) {
  const base = 'flex aspect-square flex-col items-center justify-center rounded-2xl text-center transition active:scale-95'
  const look: Record<DoorState, string> = {
    locked: 'bg-kaffe-100 text-kaffe-400',
    open: 'border-2 border-kaffe-500 bg-white text-kaffe-900',
    voted: 'bg-kaffe-700 text-white',
  }
  const label =
    state === 'locked'
      ? `Låge ${day}, lukket`
      : state === 'voted'
        ? `Låge ${day}, stemt. Din karakter ${summary?.mine}${summary?.avg != null ? `, gruppens snit ${formatAverage(summary.avg)}` : ''}`
        : `Låge ${day}, åben, ikke stemt endnu`

  return (
    <Link
      to={`/dag/${day}`}
      aria-label={label}
      aria-current={isToday ? 'date' : undefined}
      className={`${base} ${look[state]} ${isToday ? 'ring-2 ring-kaffe-500 ring-offset-2 ring-offset-kaffe-50' : ''}`}
    >
      <span className="text-2xl font-bold leading-none">{day}</span>
      {state === 'locked' && (
        <span className="mt-1 text-base" aria-hidden="true">
          🔒
        </span>
      )}
      {state === 'open' && <span className="mt-1 text-sm font-medium text-kaffe-600">Stem</span>}
      {state === 'voted' && (
        <span className="mt-1 text-sm leading-tight">
          Du <strong>{summary?.mine}</strong>
          {summary?.avg != null && (
            <>
              <br />Ø {formatAverage(summary.avg)}
            </>
          )}
        </span>
      )}
    </Link>
  )
}

/** Grid med 25 låger: lukket, åben men ikke stemt, eller stemt (egen karakter og gruppens snit). */
export function CalendarPage() {
  const cal = useCalendar()
  const { userId } = useMe()
  const overview = useAsync(() => fetchRatingOverview(supabase), [], { refetchOnFocus: true })
  const summary = useMemo(() => (overview.data ? summarizeCalendar(overview.data, userId) : new Map<number, DaySummary>()), [overview.data, userId])

  const voted = [...summary.values()].filter((s) => s.mine != null).length
  const open = Math.min(cal.openDay, LAST_DAY)

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h2 className="text-xl font-bold text-kaffe-900">Kalender</h2>
        <p className="text-base text-kaffe-700" role="status">
          {open === 0
            ? 'Ingen låger er åbne endnu. Første låge åbner 1. december.'
            : `Du har stemt på ${voted} af ${open} åbne ${open === 1 ? 'låge' : 'låger'}.`}
        </p>
        {overview.error && <p className="mt-1 text-base text-red-700">Kunne ikke hente dine karakterer.</p>}
      </header>

      <ul className="grid grid-cols-4 gap-2">
        {Array.from({ length: LAST_DAY }, (_, i) => i + 1).map((day) => {
          const s = summary.get(day)
          const state: DoorState = day > cal.openDay ? 'locked' : s?.mine != null ? 'voted' : 'open'
          return (
            <li key={day}>
              <Door day={day} state={state} summary={s} isToday={day === cal.today} />
            </li>
          )
        })}
      </ul>

      <p className="px-1 text-sm text-kaffe-600">
        Tryk på en låge for at se kaffen eller stemme. Man må gerne stemme på tidligere dage, hvis man er kommet bagud.
      </p>
    </div>
  )
}
