import { NavLink, Outlet } from 'react-router-dom'
import { useAuth, useMe } from '../auth/AuthProvider'

const tabs = [
  { to: '/i-dag', label: 'I dag', icon: '☕' },
  { to: '/kalender', label: 'Kalender', icon: '🗓️' },
  { to: '/statistik', label: 'Statistik', icon: '📊' },
]

function TabBar({ items }: { items: Array<{ to: string; label: string; icon: string }> }) {
  return (
    <nav
      aria-label="Hovedmenu"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-kaffe-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-medium ${isActive ? 'text-kaffe-800' : 'text-kaffe-500'}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`text-2xl leading-none ${isActive ? '' : 'opacity-60'}`} aria-hidden="true">
                    {t.icon}
                  </span>
                  {t.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Appens ramme for en indlogget bruger: overskrift, indhold og fanebjælke i bunden (stor til tommelfingeren). */
export function Shell() {
  const { signOut } = useAuth()
  const { profile } = useMe()
  const items = profile.is_admin ? [...tabs, ...adminTabs] : tabs

  return (
    <>
      <div className="mx-auto min-h-dvh w-full max-w-md px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between py-2">
          <h1 className="text-xl font-bold text-kaffe-900">☕ Kaffekalenderen</h1>
          <div className="flex items-center gap-1 text-base text-kaffe-700">
            <span className="max-w-[8rem] truncate">{profile.display_name}</span>
            <button type="button" onClick={() => void signOut()} className="min-h-12 rounded-xl px-2 underline underline-offset-4">
              Log ud
            </button>
          </div>
        </header>
        <main className="mt-2">
          <Outlet />
        </main>
      </div>
      <TabBar items={items} />
    </>
  )
}

/** Faner der kun vises for admin. */
const adminTabs: Array<{ to: string; label: string; icon: string }> = [{ to: '/admin', label: 'Admin', icon: '🛠️' }]
