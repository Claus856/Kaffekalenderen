import { useEffect, useMemo, useState } from 'react'
import { useMe } from '../auth/AuthProvider'
import { useCalendar } from '../data/CalendarContext'
import { fetchCoffee, fetchDayRatings, fetchParticipation, saveRating, type Rating } from '../data/queries'
import { useAsync } from '../data/useAsync'
import { formatDoorDate } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { emptyDraft, type RatingDraft, type RatingValue } from '../lib/ratings'
import { CoffeeCard } from './CoffeeCard'
import { RatingForm } from './RatingForm'
import { GroupRatings, MyRating } from './RatingViews'
import { Button, ErrorMessage } from './ui'

const draftFrom = (r: Rating): RatingDraft => ({ score: r.score, fill: r.fill_level, steep: r.steep_minutes, comment: r.comment ?? '' })

function DoorHeader({ day, isToday }: { day: number; isToday: boolean }) {
  return (
    <header className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-xl font-bold text-kaffe-900">
        Låge {day}
        {isToday && <span className="ml-2 rounded-full bg-kaffe-700 px-2.5 py-0.5 align-middle text-sm font-medium text-white">I dag</span>}
      </h2>
      <p className="text-base text-kaffe-600">{formatDoorDate(day)}</p>
    </header>
  )
}

function Locked({ day }: { day: number }) {
  return (
    <div className="space-y-4">
      <DoorHeader day={day} isToday={false} />
      <section className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-5xl" aria-hidden="true">
          🔒
        </p>
        <p className="mt-3 text-lg font-semibold text-kaffe-900">Denne låge er stadig lukket</p>
        <p className="mt-1 text-base text-kaffe-700">Den åbner {formatDoorDate(day)}.</p>
      </section>
    </div>
  )
}

/** En låge: kaffens info, vurderingsformular, og de andres karakterer når man selv har stemt. */
export function DayView({ day, isToday }: { day: number; isToday: boolean }) {
  const { openDay } = useCalendar()
  if (day > openDay) return <Locked day={day} />
  return <OpenDoor day={day} isToday={isToday} />
}

function OpenDoor({ day, isToday }: { day: number; isToday: boolean }) {
  const { members } = useCalendar()
  const { userId } = useMe()

  const coffee = useAsync(() => fetchCoffee(supabase, day), [day])
  const ratings = useAsync(() => fetchDayRatings(supabase, day), [day], { refetchOnFocus: true })
  const participation = useAsync(() => fetchParticipation(supabase), [], { refetchOnFocus: true })

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!justSaved) return
    const t = setTimeout(() => setJustSaved(false), 4000)
    return () => clearTimeout(t)
  }, [justSaved])

  const mine = ratings.data?.find((r) => r.user_id === userId) ?? null
  const others = useMemo(() => ratings.data?.filter((r) => r.user_id !== userId) ?? [], [ratings.data, userId])
  const votedIds = useMemo(() => {
    const ids = new Set((participation.data ?? []).filter((p) => p.coffee_day === day).map((p) => p.user_id))
    if (mine) ids.add(userId)
    return ids
  }, [participation.data, day, mine, userId])

  async function save(value: RatingValue) {
    setSaving(true)
    setSaveError(null)
    try {
      await saveRating(supabase, userId, day, value)
      ratings.reload()
      participation.reload()
      setEditing(false)
      setJustSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Kunne ikke gemme. Prøv igen.')
    } finally {
      setSaving(false)
    }
  }

  if (coffee.loading || ratings.loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <DoorHeader day={day} isToday={isToday} />
        <div className="h-96 animate-pulse rounded-2xl bg-white/70" />
      </div>
    )
  }

  const error = coffee.error ?? ratings.error
  if (error || !coffee.data) {
    return (
      <div className="space-y-4">
        <DoorHeader day={day} isToday={isToday} />
        <ErrorMessage>{error ?? 'Kaffen kunne ikke findes.'}</ErrorMessage>
        <Button
          onClick={() => {
            coffee.reload()
            ratings.reload()
          }}
        >
          Prøv igen
        </Button>
      </div>
    )
  }

  const showForm = !mine || editing

  return (
    <div className="space-y-4">
      <DoorHeader day={day} isToday={isToday} />
      <CoffeeCard coffee={coffee.data} eager={isToday} />

      {justSaved && (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-base font-medium text-green-800">
          Din vurdering er gemt ✓
        </p>
      )}

      {showForm ? (
        <section className="rounded-2xl bg-white p-5 shadow-sm" aria-label="Vurdering">
          <h3 className="mb-4 text-xl font-bold text-kaffe-900">{mine ? 'Ret din vurdering' : 'Hvad synes du?'}</h3>
          <RatingForm
            initial={mine ? draftFrom(mine) : emptyDraft()}
            submitLabel={mine ? 'Gem ændringer' : 'Gem vurdering'}
            saving={saving}
            error={saveError}
            onSubmit={save}
            onCancel={mine ? () => setEditing(false) : undefined}
          />
          {!mine && (
            <p className="mt-4 text-base text-kaffe-600" role="status">
              De andres karakterer er skjulte, indtil du har givet din egen.{' '}
              {participation.data && members.length > 0 && `${votedIds.size} af ${members.length} har stemt.`}
            </p>
          )}
        </section>
      ) : (
        <>
          <MyRating rating={mine!} onEdit={() => setEditing(true)} />
          <GroupRatings mine={mine!} others={others} members={members} votedIds={votedIds} />
        </>
      )}
    </div>
  )
}
