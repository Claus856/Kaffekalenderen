import { Link, Navigate, useParams } from 'react-router-dom'
import { DayView } from '../components/DayView'
import { useCalendar } from '../data/CalendarContext'
import { LAST_DAY } from '../lib/dates'

/** /dag/7: en bestemt låge, fx en tidligere dag man vil stemme på. */
export function DayPage() {
  const { day: param } = useParams()
  const cal = useCalendar()
  const day = Number(param)
  if (!Number.isInteger(day) || day < 1 || day > LAST_DAY) return <Navigate to="/kalender" replace />

  return (
    <div className="space-y-3">
      <Link to="/kalender" className="inline-flex min-h-12 items-center text-base text-kaffe-700 underline underline-offset-4">
        ← Kalender
      </Link>
      <DayView key={day} day={day} isToday={day === cal.today} />
    </div>
  )
}
