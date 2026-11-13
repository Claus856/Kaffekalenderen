import type { Member, Rating } from '../data/queries'
import { FILL_LABELS, formatAverage, formatMinutes } from '../lib/format'
import { average } from '../lib/ratings'

function BrewLine({ r }: { r: Pick<Rating, 'fill_level' | 'steep_minutes'> }) {
  return (
    <p className="text-sm text-kaffe-600">
      {FILL_LABELS[r.fill_level]} · {formatMinutes(r.steep_minutes)}
    </p>
  )
}

function ScoreBadge({ score, large = false }: { score: number; large?: boolean }) {
  return (
    <span
      aria-label={`Karakter ${score}`}
      className={`flex shrink-0 items-center justify-center rounded-full bg-kaffe-700 font-bold text-white ${large ? 'h-16 w-16 text-3xl' : 'h-12 w-12 text-2xl'}`}
    >
      {score}
    </span>
  )
}

/** Min egen vurdering, med knap til at rette den. */
export function MyRating({ rating, onEdit }: { rating: Rating; onEdit: () => void }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" aria-label="Din vurdering">
      <div className="flex items-center gap-4">
        <ScoreBadge score={rating.score} large />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-kaffe-900">Din vurdering</h3>
          <BrewLine r={rating} />
        </div>
      </div>
      {rating.comment && <p className="mt-3 whitespace-pre-line text-base italic text-kaffe-800">“{rating.comment}”</p>}
      <button type="button" onClick={onEdit} className="mt-2 min-h-12 text-base text-kaffe-700 underline underline-offset-4">
        Ret min vurdering
      </button>
    </section>
  )
}

/** De andres karakterer, kommentarer og bryggeparametre. Vises først, når man selv har stemt (RLS). */
export function GroupRatings({
  mine,
  others,
  members,
  votedIds,
}: {
  mine: Rating
  others: Rating[]
  members: Member[]
  /** alle der har stemt denne dag (fra participation()) */
  votedIds: Set<string>
}) {
  const name = (id: string) => members.find((m) => m.id === id)?.display_name ?? 'Ukendt'
  const all = [mine, ...others]
  const avg = average(all.map((r) => r.score))
  const sorted = [...others].sort((a, b) => b.score - a.score || name(a.user_id).localeCompare(name(b.user_id), 'da'))
  const missing = members.filter((m) => !votedIds.has(m.id))

  return (
    <section className="space-y-3" aria-label="Gruppens vurderinger">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-lg font-semibold text-kaffe-900">Gruppen</h3>
        {avg != null && (
          <p className="text-base text-kaffe-700">
            Snit <strong>{formatAverage(avg)}</strong> · {all.length} {all.length === 1 ? 'stemme' : 'stemmer'}
          </p>
        )}
      </div>

      {sorted.length === 0 && <p className="rounded-2xl bg-white p-5 text-base text-kaffe-700 shadow-sm">Ingen andre har stemt endnu.</p>}

      <ul className="space-y-3">
        {sorted.map((r) => (
          <li key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <ScoreBadge score={r.score} />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-kaffe-900">{name(r.user_id)}</p>
                <BrewLine r={r} />
              </div>
            </div>
            {r.comment && <p className="mt-2 whitespace-pre-line text-base italic text-kaffe-800">“{r.comment}”</p>}
          </li>
        ))}
      </ul>

      <p className="px-1 text-base text-kaffe-600" role="status">
        {missing.length === 0 ? 'Alle har stemt ✓' : `Mangler at stemme: ${missing.map((m) => m.display_name).join(', ')}`}
      </p>
    </section>
  )
}
