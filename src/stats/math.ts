export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Stikprøve-standardafvigelse (n − 1). Null ved færre end 2 observationer. */
export function sd(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs)!
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}

/** Pearsons korrelation. Null ved færre end 2 par, eller hvis den ene række ikke varierer. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  const mx = mean(xs.slice(0, n))!
  const my = mean(ys.slice(0, n))!
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  if (sxx < 1e-12 || syy < 1e-12) return null
  return sxy / Math.sqrt(sxx * syy)
}

export interface Regression {
  slope: number
  intercept: number
  r: number
}

export function linearRegression(xs: number[], ys: number[]): Regression | null {
  const r = pearson(xs, ys)
  if (r == null) return null
  const mx = mean(xs)!
  const my = mean(ys)!
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0)
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx, r }
}

/** Kort, dansk beskrivelse af en korrelations styrke. */
export function describeCorrelation(r: number | null): string {
  if (r == null) return 'for få data'
  const a = Math.abs(r)
  const strength = a >= 0.7 ? 'stærk' : a >= 0.4 ? 'moderat' : a >= 0.2 ? 'svag' : 'næsten ingen'
  if (a < 0.2) return 'næsten ingen sammenhæng'
  return `${strength} ${r > 0 ? 'positiv' : 'negativ'} sammenhæng`
}
