/**
 * Laver PNG-ikonerne til hjemmeskærmen ud fra public/icons/icon.svg:  npm run icons
 * Ikonet er fuldt udfyldt (ingen gennemsigtige hjørner), så både Android (maskable) og iOS kan beskære det frit.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const svg = fs.readFileSync(path.join(dir, 'icon.svg'))

const targets: Array<[string, number]> = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
]

for (const [file, size] of targets) {
  await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(dir, file))
  console.log(`✓ ${file} (${size}×${size})`)
}
