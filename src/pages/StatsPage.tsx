import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { useCalendar } from '../data/CalendarContext'
import { fetchAllCoffees, fetchAllRatings, fetchParticipation } from '../data/queries'
import { useAsync } from '../data/useAsync'
import { supabase } from '../lib/supabase'
import { computeStats } from '../stats/compute'
import { BrewTab } from '../stats/ui/BrewTab'
import { CoffeesTab } from '../stats/ui/CoffeesTab'
import { OriginTab } from '../stats/ui/OriginTab'
import { PeopleTab } from '../stats/ui/PeopleTab'
import { TasteTab } from '../stats/ui/TasteTab'
import { TwinsTab } from '../stats/ui/TwinsTab'
import { UsTab } from '../stats/ui/UsTab'
import { Empty, TabBarPills } from '../stats/ui/parts'
import { Button, ErrorMessage } from '../components/ui'

const TABS = [
  { id: 'kaffer', label: 'Kaffer' },
  { id: 'oprindelse', label: 'Oprindelse' },
  { id: 'smag', label: 'Smag' },
  { id: 'os', label: 'Os' },
  { id: 'tvillinger', label: 'Tvillinger' },
  { id: 'bryg', label: 'Bryg' },
  { id: 'personer', label: 'Personer' },
] as const

type TabId = (typeof TABS)[number]['id']

/**
 * Statistik. Beregnes i klienten ud fra de data man har adgang til. Fordi RLS skjuler andres karakterer for
 * dage man selv ikke har stemt på, bygger alt kun på de dage. Det vises tydeligt øverst.
 */
export function StatsPage() {
  const cal = useCalendar()
  const { userId } = useMe()
  const [params, setParams] = useSearchParams()
  const tab: TabId = TABS.some((t) => t.id === params.get('fane')) ? (params.get('fane') as TabId) : 'kaffer'

  const data = useAsync(
    async () => {
      const [coffees, ratings, participation] = await Promise.all([fetchAllCoffees(supabase), fetchAllRatings(supabase), fetchParticipation(supabase)])
      return { coffees, ratings, participation }
    },
    [],
    { refetchOnFocus: true },
  )

  const stats = useMemo(
    () =>
      data.data
        ? computeStats({ coffees: data.data.coffees, ratings: data.data.ratings, members: cal.members, participation: data.data.participation, openDay: cal.openDay, todayDoor: cal.today })
        : null,
    [data.data, cal.members, cal.openDay, cal.today],
  )

  if (data.error && !data.data) {
    return (
      <div className="space-y-4">
        <ErrorMessage>{data.error}</ErrorMessage>
        <Button onClick={data.reload}>Prøv igen</Button>
      </div>
    )
  }
  if (!stats || !data.data) return <div className="h-64 animate-pulse rounded-2xl bg-white/70" aria-busy="true" />

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h2 className="text-xl font-bold text-kaffe-900">Statistik</h2>
        <p className="text-base text-kaffe-700" role="status">
          {stats.basedOnDays === 0 ? (
            'Ingen karakterer endnu.'
          ) : (
            <>
              Baseret på <strong>{stats.basedOnDays}</strong> {stats.basedOnDays === 1 ? 'dag' : 'dage'} og <strong>{stats.ratingCount}</strong> karakterer.
            </>
          )}
        </p>
        <p className="text-sm text-kaffe-600">
          Andres karakterer er skjulte for dage, du ikke selv har stemt på, så statistikken bygger kun på de dage, du har stemt på.
        </p>
      </header>

      <TabBarPills tabs={[...TABS]} value={tab} onChange={(id) => setParams({ fane: id }, { replace: true })} />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {stats.basedOnDays === 0 ? (
          <Empty>Stem på dagens låge (eller en tidligere), så dukker statistikken op her.</Empty>
        ) : (
          <>
            {tab === 'kaffer' && <CoffeesTab stats={stats} members={cal.members} />}
            {tab === 'oprindelse' && <OriginTab stats={stats} />}
            {tab === 'smag' && <TasteTab stats={stats} />}
            {tab === 'os' && <UsTab stats={stats} />}
            {tab === 'tvillinger' && <TwinsTab stats={stats} members={cal.members} />}
            {tab === 'bryg' && <BrewTab stats={stats} />}
            {tab === 'personer' && <PeopleTab stats={stats} members={cal.members} coffees={data.data.coffees} ratings={data.data.ratings} meId={userId} />}
          </>
        )}
      </div>
    </div>
  )
}
