import { Navigate, useSearchParams } from 'react-router-dom'
import { useMe } from '../auth/AuthProvider'
import { TabBarPills } from '../stats/ui/parts'
import { CoffeeEditor } from './admin/CoffeeEditor'
import { ParticipationPanel } from './admin/ParticipationPanel'
import { SettingsPanel } from './admin/SettingsPanel'

const TABS = [
  { id: 'deltagelse', label: 'Deltagelse' },
  { id: 'kaffer', label: 'Ret kaffe' },
  { id: 'indstillinger', label: 'Indstillinger' },
] as const
type TabId = (typeof TABS)[number]['id']

/** Kun for admin. (Adgangen håndhæves i RLS. Her skjules siden bare for andre.) */
export function AdminPage() {
  const { profile } = useMe()
  const [params, setParams] = useSearchParams()
  if (!profile.is_admin) return <Navigate to="/i-dag" replace />
  const tab: TabId = TABS.some((t) => t.id === params.get('fane')) ? (params.get('fane') as TabId) : 'deltagelse'

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h2 className="text-xl font-bold text-kaffe-900">Admin</h2>
        <p className="text-base text-kaffe-700">Ret kaffedata og se hvem der mangler at stemme.</p>
      </header>
      <TabBarPills tabs={[...TABS]} value={tab} onChange={(id) => setParams({ fane: id }, { replace: true })} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'deltagelse' && <ParticipationPanel />}
        {tab === 'kaffer' && <CoffeeEditor />}
        {tab === 'indstillinger' && <SettingsPanel />}
      </div>
    </div>
  )
}
