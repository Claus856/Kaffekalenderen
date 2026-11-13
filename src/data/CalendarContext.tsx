import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { CALENDAR_YEAR, clockDay, daysUntilStart, phaseOf, todayInCopenhagen, todaysDoor, type Phase } from '../lib/dates'
import { supabase } from '../lib/supabase'
import { fetchMembers, fetchOpenDay, type Member } from './queries'
import { useAsync } from './useAsync'
import { Button, ErrorMessage, Screen, Splash } from '../components/ui'

export interface CalendarInfo {
  /** højeste åbne låge ifølge databasen (0 før 1. december) */
  openDay: number
  /** lågen der er "i dag" (0 hvis intet er åbent) */
  today: number
  phase: Phase
  /** dage til 1. december */
  daysUntilStart: number
  /** alle i gruppen, så vi kan vise navne */
  members: Member[]
  /** er alle låger åbnet, selvom datoen ikke er nået dertil? (testtilstand / efterslæb) */
  allOpenedEarly: boolean
}

const CalendarContext = createContext<CalendarInfo | null>(null)

/** Henter hvilke låger der er åbne og hvem der er i gruppen, og henter igen når appen vises igen. */
export function CalendarProvider({ children }: { children: ReactNode }) {
  const open = useAsync(() => fetchOpenDay(supabase), [], { refetchOnFocus: true })
  const members = useAsync(() => fetchMembers(supabase), [], { refetchOnFocus: true })

  const info = useMemo<CalendarInfo | null>(() => {
    if (open.data === undefined || members.data === undefined) return null
    const iso = todayInCopenhagen()
    const clock = clockDay(iso)
    return {
      openDay: open.data,
      today: todaysDoor(open.data, clock),
      phase: phaseOf(iso),
      daysUntilStart: daysUntilStart(iso),
      members: members.data,
      allOpenedEarly: open.data > clock,
    }
  }, [open.data, members.data])

  if (!info) {
    const error = open.error ?? members.error
    if (error) {
      return (
        <Screen>
          <div className="space-y-4">
            <ErrorMessage>{error}</ErrorMessage>
            <Button
              onClick={() => {
                open.reload()
                members.reload()
              }}
            >
              Prøv igen
            </Button>
          </div>
        </Screen>
      )
    }
    return <Splash />
  }
  return <CalendarContext.Provider value={info}>{children}</CalendarContext.Provider>
}

export function useCalendar(): CalendarInfo {
  const ctx = useContext(CalendarContext)
  if (!ctx) throw new Error('useCalendar skal bruges inde i <CalendarProvider>')
  return ctx
}

export { CALENDAR_YEAR }
