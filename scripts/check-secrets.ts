/**
 * Sikkerhedstjek efter build: findes der en hemmelig Supabase-nøgle i den færdige app?  (kører automatisk efter npm run build)
 *
 * Alt i dist/ sendes til alle besøgende. Tjekket fejler (og stopper dermed deployen) hvis det finder:
 *   - værdien af SUPABASE_SERVICE_ROLE_KEY fra .env eller miljøet
 *   - en "secret"-nøgle (sb_secret_…)
 *   - en JWT hvor rollen er service_role
 *
 *   npm run check:secrets [mappe]      (standard: dist)
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve(process.argv[2] ?? 'dist')
if (!fs.existsSync(target)) {
  console.error(`Mappen findes ikke: ${target}. Kør npm run build først.`)
  process.exit(1)
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else yield p
  }
}

const TEXT_EXT = /\.(js|mjs|css|html|json|webmanifest|svg|txt|map)$/i
const secretValue = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const problems: string[] = []
let scanned = 0

for (const file of walk(target)) {
  if (!TEXT_EXT.test(file)) continue
  scanned++
  const text = fs.readFileSync(file, 'utf8')
  const rel = path.relative(target, file)

  if (secretValue && secretValue.length >= 16 && text.includes(secretValue)) problems.push(`${rel}: indeholder værdien af SUPABASE_SERVICE_ROLE_KEY`)
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text)) problems.push(`${rel}: indeholder en secret-nøgle (sb_secret_…)`)

  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const role = (JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')) as { role?: string }).role
      if (role === 'service_role') problems.push(`${rel}: indeholder en JWT med rollen service_role`)
    } catch {
      // ikke en JWT: ignorér
    }
  }
}

if (problems.length) {
  console.error('\n✗ HEMMELIGE NØGLER I DEN FÆRDIGE APP. Deploy ikke!\n')
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nTjek at ingen hemmelig nøgle står i en VITE_-variabel eller importeres i src/.')
  process.exit(1)
}
console.log(`✓ Hemmelighedstjek: ${scanned} filer i ${path.relative(process.cwd(), target) || '.'} gennemsøgt, ingen hemmelige nøgler fundet.`)
