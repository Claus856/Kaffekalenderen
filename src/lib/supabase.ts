import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { secretKeyProblem } from './keys'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Fejl i opsætningen, vist på en skærm i stedet for en tom side. Null hvis alt er i orden. */
export const configProblem: string | null = !url || !key
  ? 'Mangler VITE_SUPABASE_URL og/eller VITE_SUPABASE_ANON_KEY i .env (se README).'
  : secretKeyProblem(key)

// Ved opsætningsfejl oprettes klienten med pladsholdere, og appen viser configProblem i stedet for at bruge den.
export const supabase = createClient<Database>(
  configProblem ? 'http://localhost' : url!,
  configProblem ? 'ikke-konfigureret' : key!,
  {
    auth: {
      persistSession: true, // login huskes på enheden (localStorage)
      autoRefreshToken: true, // sessionen fornyes automatisk, så man normalt kun logger ind én gang pr. enhed
      detectSessionInUrl: false, // vi bruger kode i mailen, ikke links
    },
  },
)
