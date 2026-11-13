import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { DayView } from '../components/DayView'
import { useCalendar } from '../data/CalendarContext'
import { fetchRatingOverview } from '../data/queries'
import { useAsync } from '../data/useAsync'
import { supabase } from '../lib/supabase'
import { useMe } from '../auth/AuthProvider'

function BeforeStart({ days }: { days: number }) {
  return (
    <section className="rounded-2xl bg-white p-6 text-center shadow-sm">
      <p className="text-5xl" aria-hidden="true">
        🎄
      </p>
      <h2 className="mt-3 text-xl font-bold text-kaffe-900">Kalenderen åbner 1. december</h2>
      <p className="mt-1 text-base text-kaffe-700">
        {days === 1 ? 'Der er 1 dag' : `Der er ${days} dage`} til første låge.
      </p>
    </section>
  )
}

/** "Du mangler N tidligere låger": man må gerne stemme på tidligere dage, hvis man er kommet bagud. */
function BehindNudge({ today }: { today: number }) {
  const { userId } = useMe()
  const overview = useAsync(() => fetchRatingOverview(supabase), [], { refetchOnFocus: true })
  const missing = useMemo(() => {
    if (!overview.data) return 0
    const mine = new Set(overview.data.filter((r) => r.user_id === userId).map((r) => r.coffee_day))
    let n = 0
    for (let d = 1; d < today; d++) if (!mine.has(d)) n++
    return n
  }, [overview.data, userId, today])

  if (missing === 0) return null
  return (
    <Link
      to="/kalender"
      className="flex min-h-12 items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900"
    >
      <span>
        Du mangler {missing} tidligere {missing === 1 ? 'låge' : 'låger'}
      </span>
      <span aria-hidden="true">Kalender →</span>
    </Link>
  )
}

export function TodayPage() {
  const cal = useCalendar()

  if (cal.today === 0) return <BeforeStart days={cal.daysUntilStart} />

  return (
    <div className="space-y-4">
      {cal.allOpenedEarly && (
        <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900">
          {cal.phase === 'before'
            ? 'Testtilstand: admin har åbnet alle låger før 1. december. “I dag” viser den sidste låge.'
            : 'Admin har åbnet alle låger. “I dag” følger stadig datoen.'}
        </p>
      )}
      {cal.phase === 'after' && (
        <p role="status" className="rounded-xl bg-kaffe-100 px-4 py-3 text-base text-kaffe-800">
          Kalenderen er slut. Alle låger er åbne.
        </p>
      )}
      <BehindNudge today={cal.today} />
      <DayView key={cal.today} day={cal.today} isToday />
    </div>
  )
}
