import { useState } from 'react'
import type { CoffeeWithNotes } from '../data/queries'
import { formatAltitude } from '../lib/format'

/** Shopifys CDN kan levere billedet i en bestemt bredde (?width=), så telefonen ikke henter mere end nødvendigt. */
function sized(url: string, width: number): string {
  try {
    const u = new URL(url)
    u.searchParams.set('width', String(width))
    return u.toString()
  } catch {
    return url
  }
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-sm text-kaffe-500">{label}</dt>
      <dd className="text-base font-medium text-kaffe-900">{value}</dd>
    </div>
  )
}

/** Kaffens info: billede, oprindelse, verdensdel, højde, proces, varietet, ristning og BREWs smagsnoter. */
export function CoffeeCard({ coffee, eager = false }: { coffee: CoffeeWithNotes; eager?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const longText = (coffee.description?.length ?? 0) > 240

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {coffee.image_url && (
        <img
          src={sized(coffee.image_url, 640)}
          srcSet={`${sized(coffee.image_url, 480)} 480w, ${sized(coffee.image_url, 800)} 800w`}
          sizes="(max-width: 448px) 100vw, 448px"
          width={640}
          height={640}
          alt={`Pose med kaffen ${coffee.name}`}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="aspect-square w-full bg-kaffe-50 object-contain"
        />
      )}

      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-2xl font-bold leading-tight text-kaffe-900">{coffee.country ?? coffee.name}</h2>
          {coffee.region && <p className="text-base text-kaffe-700">{coffee.region}</p>}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Verdensdel" value={coffee.continent} />
          <Fact label="Højde" value={formatAltitude(coffee.altitude_min, coffee.altitude_max)} />
          <Fact label="Proces" value={coffee.process} />
          <Fact label="Ristning" value={coffee.roast} />
          <div className="col-span-2">
            <Fact label="Varietet" value={coffee.variety} />
          </div>
        </dl>

        {coffee.notes.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-kaffe-500">Smagsnoter ifølge BREW</p>
            <ul className="flex flex-wrap gap-2">
              {coffee.notes.map((n) => (
                <li key={n} className="rounded-full bg-kaffe-100 px-3 py-1 text-base text-kaffe-800">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}

        {coffee.description && (
          <div>
            <p className={`whitespace-pre-line text-base leading-relaxed text-kaffe-800 ${longText && !expanded ? 'line-clamp-4' : ''}`}>
              {coffee.description}
            </p>
            {longText && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="mt-1 min-h-12 text-base text-kaffe-700 underline underline-offset-4"
                aria-expanded={expanded}
              >
                {expanded ? 'Vis mindre' : 'Læs mere'}
              </button>
            )}
          </div>
        )}

        {coffee.product_url && (
          <a
            href={coffee.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center text-base text-kaffe-700 underline underline-offset-4"
          >
            Se kaffen hos BREW ↗
          </a>
        )}
      </div>
    </article>
  )
}
