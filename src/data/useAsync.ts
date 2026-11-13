import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: string | null
  /** true kun ved første hentning. Genhentning beholder de gamle data, så siden ikke blinker. */
  loading: boolean
  reload: () => void
}

/**
 * Henter data og henter igen, når siden bliver synlig igen (fx når telefonen låses op efter nogle timer,
 * så man ser nye karakterer og nye åbne låger uden at skulle opdatere).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts: { refetchOnFocus?: boolean } = {}): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; error: string | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let active = true
    fnRef.current().then(
      (data) => {
        if (active) setState({ data, error: null, loading: false })
      },
      (err: unknown) => {
        if (active) setState((s) => ({ data: s.data, error: err instanceof Error ? err.message : 'Noget gik galt.', loading: false }))
      },
    )
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  useEffect(() => {
    if (!opts.refetchOnFocus) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [opts.refetchOnFocus])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}
