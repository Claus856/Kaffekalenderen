import { describe, expect, it } from 'vitest'
import { checkCoffeeEdit, formFromCoffee, mergeManualFields } from './coffeeEdit'
import type { CoffeeWithNotes } from '../data/queries'

const coffee: CoffeeWithNotes = {
  day: 21,
  name: 'Zimbabwe (Jersey Estate)',
  country: 'Zimbabwe',
  region: 'Jersey Estate',
  continent: 'Afrika',
  altitude_min: 3000,
  altitude_max: 3300,
  variety: 'Coffea Arabica',
  process: 'Vasket',
  roast: null,
  description: 'En kaffe.',
  image_url: 'https://cdn.example.com/a.png',
  source_url: 'https://dk.brew-company.com/pages/coffee-day-21',
  product_url: null,
  manual_fields: [],
  scraped_at: null,
  notes: ['bær', 'nødder'],
}

describe('rediger kaffe', () => {
  it('uændret formular giver ingen ændringer', () => {
    const r = checkCoffeeEdit(coffee, formFromCoffee(coffee))
    expect(r).toMatchObject({ ok: true, changed: [], notes: null })
  })

  it('finder præcis de rettede felter (højde rettet fra fod til meter, ristning udfyldt)', () => {
    const form = { ...formFromCoffee(coffee), altitude_min: '900', altitude_max: '1000', roast: 'medium' }
    const r = checkCoffeeEdit(coffee, form)
    expect(r).toMatchObject({ ok: true, changed: ['altitude_min', 'altitude_max', 'roast'], patch: { altitude_min: 900, altitude_max: 1000, roast: 'medium' } })
  })

  it('tomme felter bliver null, og trimmes', () => {
    const r = checkCoffeeEdit(coffee, { ...formFromCoffee(coffee), region: '   ', variety: '  Arabica ' })
    expect(r).toMatchObject({ ok: true, patch: { region: null, variety: 'Arabica' } })
  })

  it('smagsnoter: rækkefølge og store bogstaver er ligegyldige, men nye noter opdages og normaliseres', () => {
    expect(checkCoffeeEdit(coffee, { ...formFromCoffee(coffee), notes: 'Nødder, BÆR' })).toMatchObject({ ok: true, notes: null, changed: [] })
    const r = checkCoffeeEdit(coffee, { ...formFromCoffee(coffee), notes: 'Bær, Nødder, Mælkechokolade' })
    expect(r).toMatchObject({ ok: true, notes: ['bær', 'nødder', 'mælkechokolade'], changed: ['notes'] })
  })

  it('afviser ugyldige værdier med dansk besked', () => {
    const f = formFromCoffee(coffee)
    expect(checkCoffeeEdit(coffee, { ...f, name: ' ' })).toMatchObject({ ok: false, message: 'Kaffen skal have et navn.' })
    expect(checkCoffeeEdit(coffee, { ...f, altitude_min: '1200', altitude_max: '900' })).toMatchObject({ ok: false, message: expect.stringContaining('Laveste højde') })
    expect(checkCoffeeEdit(coffee, { ...f, altitude_min: '12,5' }).ok).toBe(false)
    expect(checkCoffeeEdit(coffee, { ...f, altitude_max: '9000' }).ok).toBe(false)
    expect(checkCoffeeEdit(coffee, { ...f, continent: 'Atlantis' }).ok).toBe(false)
    expect(checkCoffeeEdit(coffee, { ...f, roast: 'sort' }).ok).toBe(false)
    expect(checkCoffeeEdit(coffee, { ...f, product_url: 'www.brew.dk/x' }).ok).toBe(false)
    expect(checkCoffeeEdit(coffee, { ...f, product_url: 'https://dk.brew-company.com/products/x' }).ok).toBe(true)
  })

  it('manual_fields: de gamle plus de nye, uden dubletter', () => {
    expect(mergeManualFields(['region'], ['altitude_min', 'region'])).toEqual(['region', 'altitude_min'])
    expect(mergeManualFields([], ['notes'])).toEqual(['notes'])
  })
})
