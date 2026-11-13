/**
 * Høflig HTTP-klient til scraperen.
 *
 * dk.brew-company.com svarer "429 local_rate_limited", hvis man henter for hurtigt (set allerede ved 6 kald
 * i træk). Derfor: ét kald ad gangen, pause mellem kald, backoff på 429/5xx (Retry-After respekteres),
 * og alt hentet gemmes i en lokal cache, så genkørsler og parser-rettelser ikke belaster serveren igen.
 */
import fs from 'node:fs'
import path from 'node:path'

export interface FetchResult {
  status: number
  body: string
  fromCache: boolean
}

export interface FetcherOptions {
  cacheDir: string
  /** pause mellem to netværkskald (ms) */
  delayMs: number
  /** ignorér cachen og hent igen */
  refresh: boolean
  maxAttempts?: number
  log: (msg: string) => void
}

const USER_AGENT = 'Mozilla/5.0 (compatible; Kaffekalenderen-scraper/0.1; engangsindhentning til privat brug)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class PoliteFetcher {
  private lastRequestAt = 0
  networkCalls = 0
  cacheHits = 0

  constructor(private readonly opts: FetcherOptions) {
    fs.mkdirSync(opts.cacheDir, { recursive: true })
  }

  async get(url: string, cacheKey: string): Promise<FetchResult> {
    const file = path.join(this.opts.cacheDir, cacheKey.replace(/[^a-z0-9._-]/gi, '_'))

    if (!this.opts.refresh) {
      if (fs.existsSync(file)) {
        this.cacheHits++
        return { status: 200, body: fs.readFileSync(file, 'utf8'), fromCache: true }
      }
      if (fs.existsSync(file + '.404')) {
        this.cacheHits++
        return { status: 404, body: '', fromCache: true }
      }
    }

    const maxAttempts = this.opts.maxAttempts ?? 6
    let lastProblem = ''

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const sinceLast = Date.now() - this.lastRequestAt
      if (sinceLast < this.opts.delayMs) await sleep(this.opts.delayMs - sinceLast)

      let res: Response
      try {
        this.networkCalls++
        res = await fetch(url, {
          headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'accept-language': 'da,en;q=0.8' },
          signal: AbortSignal.timeout(30_000),
          redirect: 'follow',
        })
      } catch (err) {
        this.lastRequestAt = Date.now()
        lastProblem = `netværksfejl (${(err as Error).message})`
        const wait = Math.min(120_000, 10_000 * 2 ** (attempt - 1))
        this.opts.log(`  ⚠ ${url}: ${lastProblem}. Venter ${Math.round(wait / 1000)} s (forsøg ${attempt}/${maxAttempts})`)
        await sleep(wait)
        continue
      }
      this.lastRequestAt = Date.now()

      if (res.status === 200) {
        const body = await res.text()
        fs.writeFileSync(file, body)
        return { status: 200, body, fromCache: false }
      }

      if (res.status === 404 || res.status === 410) {
        fs.writeFileSync(file + '.404', '')
        return { status: 404, body: '', fromCache: false }
      }

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(120_000, 20_000 * 2 ** (attempt - 1))
        lastProblem = `HTTP ${res.status}`
        this.opts.log(`  ⚠ ${url}: HTTP ${res.status}. Venter ${Math.round(wait / 1000)} s (forsøg ${attempt}/${maxAttempts})`)
        await sleep(wait)
        continue
      }

      // 401/403 osv.: ikke noget vi kan retry'e os ud af, og ikke noget vi cacher
      return { status: res.status, body: '', fromCache: false }
    }

    throw new Error(`Gav op efter ${maxAttempts} forsøg på ${url} (${lastProblem})`)
  }
}
