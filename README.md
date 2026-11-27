# Kaffekalenderen ☕

Mobilvenlig webapp hvor vennegruppen hver dag i december giver karakter til dagens kaffe fra
BREW Companys kaffejulekalender (2026, Grønland-udgaven) og følger med i en masse statistik.
Hele brugerfladen er på dansk, og alle datoer og "dagens låge" regnes i tidszonen Europe/Copenhagen.

**Stak:** Vite · React · TypeScript · Tailwind · Recharts · Supabase (Postgres, Auth, RLS) · Netlify

**Live:** https://kaffekalenderen.netlify.app · **Kode:** https://github.com/Claus856/Kaffekalenderen

**Version 0.1.0.** Færdigt: scraper, login med e-mailkode og gruppekode, "I dag" med vurdering, kalender,
statistik, admin, hjemmeskærm (PWA) og Netlify-opsætning. Se [CHANGELOG.md](CHANGELOG.md).

## Indhold

1. [Forudsætninger](#1-forudsætninger)
2. [Supabase-projekt](#2-supabase-projekt)
3. [Kør migrationerne](#3-kør-migrationerne)
4. [Gruppekode, admin og login](#4-gruppekode-admin-og-login)
5. [Miljøvariabler](#5-miljøvariabler)
6. [Hent kaffedata fra BREW](#6-hent-kaffedata-fra-brew)
7. [Kør appen lokalt](#7-kør-appen-lokalt)
8. [Deploy til Netlify](#8-deploy-til-netlify)
9. [Hjemmeskærm (PWA)](#9-hjemmeskærm-pwa)
10. [Invitér nye personer](#10-invitér-nye-personer)
11. [Sådan læses statistikken](#11-sådan-læses-statistikken)
12. [Tests](#12-tests)
13. [Kendte forhold](#13-kendte-forhold)
14. [Mappestruktur](#14-mappestruktur)

## 1. Forudsætninger

- Node.js 20 eller nyere
- En gratis Supabase-konto og en Netlify-konto
- En mailkonto der kan sende login-koder (se afsnit 2, punkt 4)

```bash
npm install
```

## 2. Supabase-projekt

1. Opret et projekt på [supabase.com](https://supabase.com) (vælg en EU-region). Dette projekt:
   - Project ID: `lhlhfkzutxpxreaviofy`
   - Region: `eu-north-1`
   - URL: `https://lhlhfkzutxpxreaviofy.supabase.co`
2. Notér under **Project Settings → API**: projektets URL, *Publishable key* (den gamle `anon`) og *Secret key*
   (den gamle `service_role`). Nøglerne skal **kun** stå i `.env` (se afsnit 5), aldrig i README eller i git.
3. **Authentication → Providers → Email**: slå e-mail-login til. Sæt *Email OTP Length* til `6`.
4. **Egen SMTP-server (nødvendig).** Supabases indbyggede mailafsender sender ifølge
   [Supabases dokumentation](https://supabase.com/docs/guides/auth/auth-smtp) **kun til medlemmer af dit eget
   Supabase-team** (andre adresser afvises med "Email address not authorized"), højst 2 mails i timen, og den er
   ikke beregnet til produktion. Vennerne kan derfor ikke få en login-kode uden en egen SMTP-server. Sæt den op
   under **Authentication → Emails → SMTP Settings**. Med en Gmail-konto: host `smtp.gmail.com`, port `465`,
   brugernavn din Gmail-adresse og en [app-adgangskode](https://myaccount.google.com/apppasswords) som adgangskode
   (kræver 2-trinsbekræftelse). Efter opsætningen er grænsen 30 mails i timen, og den kan hæves samme sted.
   Første mail havner nogle gange i spam.
5. **Authentication → Email Templates**: login sker med en 6-cifret kode, ikke et link (links åbner i
   Safari i stedet for hjemmeskærms-appen på iPhone). Supabase beskriver, at koden sendes ved at skrive
   `{{ .Token }}` i skabelonen *Magic Link*. Ret også *Confirm signup* for en sikkerheds skyld:

   ```html
   <h2>Din kode til Kaffekalenderen</h2>
   <p>Indtast denne kode i appen: <strong>{{ .Token }}</strong></p>
   ```

   På gratis-planen kan skabelonerne være låst, før en egen SMTP-server er sat op.
6. Efter første deploy: **Authentication → URL Configuration → Site URL** sættes til appens Netlify-adresse.

## 3. Kør migrationerne

Migrationerne ligger i `supabase/migrations/` og skal køres i filnavnsrækkefølge:

| Fil | Indhold |
| --- | --- |
| `20261112100000_schema.sql` | tabeller, typer, triggers |
| `20261112100100_functions.sql` | datoregler (Europe/Copenhagen), `create_profile`, hjælpefunktioner |
| `20261112100200_rls.sql` | Row Level Security og rettigheder |
| `20261120100000_reset_ratings.sql` | admin-funktioner til at nulstille alle vurderinger (med spærre) |

**Med Supabase CLI** (anbefalet):

```bash
npx supabase login
npx supabase link --project-ref <dit-projekt-ref>
npx supabase db push --remote
```

`--remote` er nødvendigt i Supabase CLI v3, hvor `db push` ellers peger på en lokal Docker-database og fejler med
`ECONNREFUSED 127.0.0.1:54322`. CLI'en spørger efter projektets databasekodeord. Skriv det ved prompten, ikke i
kommandoen (tegn som `%` og `$` bliver ellers forvansket af cmd).

**Eller manuelt:** åbn **SQL Editor** i Supabase og kør de tre filer, én ad gangen, i rækkefølge.

Typerne i `src/lib/database.types.ts` er genereret fra skemaet. Efter en ny migration:
`npx supabase gen types typescript --remote -s public > src/lib/database.types.ts`.

## 4. Gruppekode, admin og login

Appen har ingen almindelig brugeroprettelse. Man logger ind med e-mail-kode og skal derefter vælge et
visningsnavn og indtaste **gruppekoden**. Uden profil giver RLS ingen adgang til noget.

Sæt gruppekoden (kør i SQL Editor). Koden gemmes som bcrypt-hash og kan ikke læses via API'et, og der skelnes
ikke mellem store og små bogstaver:

```sql
update public.settings
   set group_code_hash = extensions.crypt(lower(btrim('DIN-GRUPPEKODE')), extensions.gen_salt('bf'))
 where id;
```

Den første bruger gør sig selv til admin i SQL Editor, efter profilen er oprettet:

```sql
update public.profiles set is_admin = true where display_name = 'DitVisningsnavn';
```

Derefter kan en admin skifte gruppekoden i appen (**Admin → Indstillinger**).

**Sådan virker login**

1. Man skriver sin e-mail og får en 6-cifret kode. Koden tastes ind og sendes automatisk, når det sjette ciffer er
   indtastet.
2. Første gang vælger man visningsnavn og indtaster gruppekoden. Profilen oprettes af Postgres-funktionen
   `create_profile`, som tjekker koden. Visningsnavne er unikke, så ingen kan udgive sig for en anden.
3. Sessionen gemmes på enheden og fornyes automatisk, så man normalt kun logger ind én gang pr. enhed. **Log ud**
   gælder kun den enhed man trykker på.
4. Appen nægter at starte, hvis `VITE_SUPABASE_ANON_KEY` ved en fejl indeholder secret/service_role-nøglen.

**Rettigheder** (alt håndhæves i databasen med RLS, ikke kun i frontend):

- **Skjulte karakterer:** man kan kun læse andres karakterer for en dag, hvis man selv har stemt den dag.
- **Egne karakterer:** man kan kun oprette, rette og slette sine egne. Kun hele point 1–5.
- **Ingen spoilere:** kaffer for fremtidige låger kan kun ses af admin. Før 1. december er ingen låger åbne,
  og dag 25 åbner 25. december. Man må gerne stemme på tidligere dage, hvis man er kommet bagud.
- **Spærring mod gætteri:** efter 10 forkerte gruppekoder inden for 15 minutter afvises alle forsøg
  midlertidigt. Det gælder alle, så en tilfældig vens fejlindtastning kan midlertidigt blokere en anden.
- Admin kan slå **"Åbn alle låger"** til (`settings.show_future_days`), fx til test før 1. december eller til
  efterslæb. "I dag" følger stadig datoen. Husk at slå den fra igen.

**Admin-siden** (kun for admin): *Deltagelse* (hvem har stemt på hvilke dage og hvem mangler i dag, aldrig
karakterer), *Ret kaffe* (ret felterne på en kaffe, fx ristning, og felter du retter overskrives ikke af scraperen) og
*Indstillinger* (tjekliste før start, åbn alle låger, skift gruppekode og nulstil alle vurderinger).

**Nulstil alle vurderinger** (Admin → Indstillinger) sletter alle karakterer, kommentarer og bryggeparametre fra hele
gruppen, så kalenderen kan starte med rent bord efter test. Kaffer, medlemmer og indstillinger røres ikke. Det kan
**ikke fortrydes**, så der skal skrives `NULSTIL` for at bekræfte. Funktionerne (`reset_ratings`, `ratings_reset_status`) ligger i
databasen og kan kun bruges af admin. De er **spærret, så rigtige stemmer ikke kan slettes ved en fejl**: er der
oprettet en vurdering efter kalenderens start (1. december kl. 00:00 dansk tid), nægter databasen at nulstille. Spærren ser på
hvornår der blev stemt og ikke på uret, så testvurderinger fra november kan stadig nulstilles på selve 1. december, så længe
ingen rigtige stemmer er kommet til. Skal rigtige stemmer alligevel slettes, gøres det direkte i Supabase (SQL Editor).
Panelet viser også en tjekliste ("Klar til 1. december?"): ingen testvurderinger, og "Åbn alle låger" er slået fra.

## 5. Miljøvariabler

Kopiér `.env.example` til `.env` og udfyld:

| Variabel | Bruges af | Hemmelig? |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | frontend | nej |
| `VITE_SUPABASE_ANON_KEY` | frontend (Publishable key) | nej (beskyttet af RLS) |
| `SUPABASE_URL` | scripts | nej |
| `SUPABASE_SERVICE_ROLE_KEY` | **kun** scripts lokalt (Secret key) | **ja** |

`SUPABASE_SERVICE_ROLE_KEY` omgår al RLS. Den har bevidst intet `VITE_`-præfiks, så Vite aldrig bundler den ind i
frontend-koden. `.env` er i `.gitignore`. Sæt den aldrig i Netlify og commit den aldrig.

`npm run build` kører automatisk et **hemmelighedstjek** (`scripts/check-secrets.ts`) på den færdige app og fejler,
hvis den finder værdien af service-role-nøglen, en `sb_secret_…`-nøgle eller en JWT med rollen `service_role`.

## 6. Hent kaffedata fra BREW

Kaffeinfo findes på `https://dk.brew-company.com/pages/coffee-day-N` for N = 1–25 og ændrer sig ikke, så den hentes
**én gang** og gemmes i databasen.

```bash
npm run scrape:dry     # hent, parse og vis opsummering – skriver intet til databasen
npm run scrape         # det samme, og upsert til Supabase (kræver .env)
```

Flere muligheder: `npm run scrape -- --days=1-5,25`, `--refresh` (ignorér cache), `--delay=4000` (pause i ms).

- Siden parses (land, region, smagsnoter, beskrivelse, højde, sort, proces). Shopifys `/products/<handle>.json`
  bruges som kryds-tjek og til et rent pakkebillede. Er de uenige, vinder siden, og uoverensstemmelsen logges.
- Er produktlinket på siden dødt (det er det for Honduras og Congo), prøves `<land>-special-kaffebonner`, og det
  logges. Findes intet produkt, bliver `product_url` tom (dag 23 og 24).
- Verdensdel udledes af en fast tabel i `src/lib/continents.ts`. Ukendte lande (og blends) giver tom verdensdel og logges.
- Smagsnoter normaliseres (små bogstaver, trimmet, synonymer samlet via `src/lib/notes.ts`) og gemmes i `coffee_notes`.
- **Ristningsgrad:** vises på siden som et billede, men det er den samme generiske fil (`Roast.png`) på alle sider uden
  noget der skelner mellem kaffer. Feltet `roast` bliver derfor tomt, og det logges. Udfyld det i **Admin → Ret kaffe**.
- Scriptet kan køres igen uden dubletter (upsert på dag). Felter en admin har rettet i hånden
  (`coffees.manual_fields`) overskrives ikke.
- Siden begrænser hurtige kald (`429`). Scriptet henter derfor ét kald ad gangen med pause, prøver igen med backoff og
  gemmer alt i `scripts/.cache/`, så genkørsler ikke belaster siden.
- Til sidst skrives en opsummering: hvilke dage der lykkedes, hvilke felter der mangler pr. dag, advarsler, alle
  smagsnoter og mulige dubletter. Alt data ligger også i `scripts/out/coffees.json`.

## 7. Kør appen lokalt

```bash
npm run dev        # http://localhost:5173
npm run build      # produktionsbuild i dist/ (kører typetjek og hemmelighedstjek)
npm run preview    # server den færdige build lokalt
```

Appen på `localhost` bruger den **rigtige** Supabase-database fra `.env`. Der er ingen separat testdatabase, så
vurderinger du giver under test er rigtige data. Nulstil dem før 1. december i **Admin → Indstillinger → Nulstil alle vurderinger** (se afsnit 4).

## 8. Deploy til Netlify

`netlify.toml` er sat op med build-kommando, publiceringsmappe, SPA-redirect (alle stier åbner `index.html`),
cache-regler og sikkerhedsheaders.

1. Læg projektet på GitHub (`git init`, commit, push). `.env` er i `.gitignore` og kommer ikke med.
2. Netlify → **Add new site → Import an existing project** → vælg repositoryet. Build-indstillingerne læses fra
   `netlify.toml`.
3. **Site configuration → Environment variables**: opret **kun** disse to:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (Publishable key)

   Opret **ikke** `SUPABASE_SERVICE_ROLE_KEY` i Netlify.
4. Deploy. Sæt derefter Netlify-adressen som **Site URL** i Supabase (afsnit 2, punkt 6).
5. Åbn adressen på telefonen, log ind og opret din profil med gruppekoden.

**Dette projekt:** Netlify-sitet hedder `kaffekalenderen` (https://kaffekalenderen.netlify.app) og er koblet til
GitHub-grenen `main`, så hvert push deployer automatisk. Kun de to `VITE_`-variabler ligger i Netlify.

Gratis Netlify-projekter får en "Powered by Netlify"-badge nederst til højre, som dækker appens fanebjælke. Slå den
fra under **Project configuration → General → Powered by Netlify badge**. Det virker straks uden redeploy.

## 9. Hjemmeskærm (PWA)

Appen har et manifest og ikon, så den kan lægges på hjemmeskærmen og åbne i fuld skærm.

- **iPhone (Safari):** åbn appen → Del-knappen → **Føj til hjemmeskærm**. Log ind i selve hjemmeskærms-appen. Koden
  tastes ind i appen, så man ikke skal forbi Safari.
- **Android (Chrome):** menuen ⋮ → **Installér app** (eller **Føj til startskærm**).

En service worker (`public/sw.js`) cacher appens filer, så den åbner hurtigt og kan starte uden net. Data (karakterer,
kaffer) caches aldrig, så de er altid friske, og nye versioner hentes straks ved næste åbning.

## 10. Invitér nye personer

Send dem linket til appen og **gruppekoden**. De logger ind med deres e-mail, vælger et visningsnavn og indtaster
koden. Der skal ikke gøres mere i Supabase, og gruppen kan godt vokse fra 4 til 6 undervejs. En ny ven kan stemme på
tidligere dage og ser først andres karakterer for de dage, vedkommende selv har stemt på.

Vil du skifte koden (fx hvis den er spredt for vidt): **Admin → Indstillinger → Skift gruppekode**. Eksisterende
medlemmer påvirkes ikke.

## 11. Sådan læses statistikken

Al statistik beregnes i klienten (`src/stats/compute.ts`) ud fra de data man har adgang til. Fordi RLS skjuler andres
karakterer for dage man selv ikke har stemt på, bygger den kun på de dage. Det står øverst: "Baseret på X dage".
Alle tal vises med antal karakterer (n).

- **Gennemsnit pr. gruppe** (verdensdel, land, proces, varietet, ristning, smagsnote) er "puljet": hver karakter tæller lige
  meget. Varieteter og smagsnoter deles op, så en kaffe med flere tæller med i dem alle.
- **Spredning (σ)** er stikprøve-standardafvigelsen (n − 1) og kræver mindst 2 karakterer.
- **Grupper med n < 2** vises svagt, og de er udeladt af top, bund, "mest splittende" m.v.
- **Afvigelse fra gruppen:** gennemsnittet af afstanden mellem en persons karakter og de **andres** snit samme dag.
  Lav = mainstream, høj = kontrær. Fortegnet viser, om personen er strengere eller mildere end de andre.
- **Smagstvillinger** er Pearsons korrelation mellem to personers karakterer over de dage begge har stemt på
  (+1 = helt enige, −1 = stik modsatte). Kræver mindst 3 fælles dage, ellers vises ingen værdi.
- **Bryg:** korrelation mellem vandmængde (mild = 1, medium = 2, strong = 3) eller trækketid og karakter, pr. person og
  samlet. En sammenhæng er ikke det samme som en årsag.
- **Højde mod karakter:** hver prik er en kaffe (højde = gennemsnit af min og max), med en tendenslinje og r.

## 12. Tests

```bash
npm test               # alle 137 tests (kører uden netværk)
npm run test:rls       # kun RLS-testene
npm run typecheck
```

- **`supabase/tests/`** (56 tests) kører de rigtige migrationer i en lokal Postgres (PGlite, ingen Docker nødvendig) med
  testbrugere (admin, almindelig bruger, bruger uden profil, anon) og "flytter uret" for at teste datoreglerne. Hver
  regel fra afsnit 4 har egne tests: skjulte karakterer, kun egne ratings, ingen spoilere, 1. og 25. december, hele
  point 1–5, gruppekode, spærring og at man ikke kan gøre sig selv til admin. Nulstilling af vurderinger har 12 tests
  (kun admin, spærren ved kalenderens start, at intet andet slettes). PGlite er Postgres, men ikke Supabase.
- **`src/stats/`** (24 tests) regner statistikken på et lille datasæt med tre bedømmere og fire kaffer, hvor alle
  forventede tal er regnet i hånden.
- **`scripts/lib/parse.test.ts`** (28 tests) tester parseren på rigtige uddrag af BREWs sider.
- **`src/lib/`** (29 tests): datoer og tidszone, validering, danske fejlbeskeder, redigering af kaffe, bekræftelse af nulstilling.

**Tests mod det rigtige Supabase-projekt** (kræver `.env`). De opretter midlertidige testbrugere
(`smoke-…@example.com`), henter engangskoder via admin-API'et (der sendes ingen mail) og rydder op bagefter:

```bash
npm run smoke:auth      # login, ingen adgang uden profil, forkert gruppekode, sessionsfornyelse, log ud
npm run smoke:ratings   # stem, skjulte karakterer, ret, kalenderoverblik, lukkede låger
npm run smoke:reset     # nulstil-funktionerne: rettigheder og spærren (sletter aldrig noget, tager en sikkerhedskopi først)
```

**Slut-test på mobil:** `npm run e2e -- seed` opretter fire testbrugere med et kendt datasæt og åbner alle låger, så
appen kan prøves i en browser på 375 px. `npm run e2e -- otp <Navn>` giver en loginkode, og
`npm run e2e -- cleanup` sletter alt og gendanner indstillingerne. **Kør altid cleanup bagefter.**

## 13. Kendte forhold

- **Ristningsgrad:** BREWs side angiver den ikke pr. kaffe, så scraperen lader den stå tom. Alle 25 kaffer er sat til
  `medium` direkte i databasen og markeret som rettet manuelt, så en ny kørsel af scraperen ikke tømmer feltet. Sættes
  en ny, tom database op, skal ristningen udfyldes igen. Statistik pr. ristning har derfor kun én gruppe.
- **Ukendte kaffer:** dag 13, 15, 21, 23 og 24 er sat til "Ukendt kaffe" (kun ristning er udfyldt), fordi vi ikke har de
  rigtige oplysninger. Alle felter er markeret som rettet manuelt. Udfyld dem i **Admin → Ret kaffe**, når de kendes.
- **Blends** (dag 10 og 17) har ikke ét land, og dermed ingen verdensdel. De samles under "Blend / ukendt" i statistikken,
  sammen med de ukendte kaffer. Verdensdel kan sættes i admin.
- **Kildedata fra BREW kan være forkerte.** Flere dage har højder, varieteter eller noter der afviger mellem BREWs side og
  deres produktside. Siden vinder, og afvigelserne står i scraperens opsummering.
- Service workeren er afprøvet i Node, men ikke i en rigtig browser (det indbyggede browserpanel kan ikke
  registrere service workers). Tjek efter deploy i Chrome: DevTools → Application → Service Workers.
- Der er ikke sat en `Content-Security-Policy`-header. Siden ligger nu på Netlify og kan afprøves, så den kan tilføjes
  (Recharts bruger inline-styles, så `style-src` skal tillade `'unsafe-inline'`).

## 14. Mappestruktur

```
supabase/migrations/   SQL: tabeller, funktioner, RLS
supabase/tests/        RLS-tests (PGlite) og stub af Supabase-miljøet
scripts/               scraper, røgtests, slut-test, hemmelighedstjek og ikon-generator
scripts/lib/           parser, høflig HTTP-klient og fælles testværktøj
src/lib/               Supabase-klient, typer, datoer, validering, verdensdel-tabel, smagsnoter
src/data/              dataadgang (queries), indlæsning og delt kalenderkontekst
src/auth/              login (e-mailkode), profil med gruppekode og sessionshåndtering
src/components/        fælles UI, kaffekort, vurderingsformular og appens ramme
src/pages/             I dag, Kalender, Dag, Statistik og Admin
src/stats/             statistikberegninger (compute.ts) og visning (ui/)
public/                manifest, service worker og ikoner
```
