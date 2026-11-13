-- Kaffekalenderen · tabeller, typer og triggers
-- Adgangskontrol (RLS) og funktioner ligger i de to efterfølgende migrationer.

create extension if not exists pgcrypto with schema extensions;

create type public.fill_level as enum ('mild', 'medium', 'strong');

-- ── settings: præcis én række ──────────────────────────────────────────────
create table public.settings (
  id boolean primary key default true check (id),   -- check (id) tvinger én række
  group_code_hash text,                             -- bcrypt-hash af gruppekoden (aldrig læsbar via API)
  show_future_days boolean not null default false,  -- true = alle låger er åbne for alle (test / efterslæb)
  calendar_year smallint not null default 2026 check (calendar_year between 2020 and 2100)
);
insert into public.settings (id) values (true);

-- ── profiles: id = auth.uid() ──────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 24),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
-- To personer kan ikke have samme visningsnavn (så man ikke kan udgive sig for en anden)
create unique index profiles_display_name_key on public.profiles (lower(btrim(display_name)));

-- ── coffees: dag 1–25 ──────────────────────────────────────────────────────
create table public.coffees (
  day smallint primary key check (day between 1 and 25),
  name text not null,
  country text,
  region text,
  continent text,
  altitude_min integer check (altitude_min is null or altitude_min between 0 and 5000),
  altitude_max integer check (altitude_max is null or altitude_max between 0 and 5000),
  variety text,
  process text,
  roast text,
  description text,
  image_url text,
  source_url text,
  product_url text,
  -- Felter en admin har rettet i hånden. Scraperen overskriver dem ikke ved genkørsel.
  manual_fields text[] not null default '{}',
  scraped_at timestamptz,
  constraint coffees_altitude_order check (
    altitude_min is null or altitude_max is null or altitude_min <= altitude_max
  )
);

-- ── coffee_notes: normaliserede smagsnoter (små bogstaver, trimmet) ────────
create table public.coffee_notes (
  coffee_day smallint not null references public.coffees (day) on delete cascade,
  note text not null check (note <> '' and note = lower(btrim(note))),
  primary key (coffee_day, note)
);
create index coffee_notes_note_idx on public.coffee_notes (note);

-- ── ratings: én pr. bruger pr. dag ─────────────────────────────────────────
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  coffee_day smallint not null references public.coffees (day) on delete cascade,
  score smallint not null check (score between 1 and 5),  -- smallint + check = kun hele point
  comment text check (comment is null or char_length(comment) <= 1000),
  fill_level public.fill_level not null default 'medium',
  steep_minutes smallint not null default 6 check (steep_minutes between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, coffee_day)
);
create index ratings_coffee_day_idx on public.ratings (coffee_day);

-- user_id og coffee_day kan ikke flyttes efter oprettelse; updated_at holdes ajour
create function public.ratings_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.coffee_day is distinct from old.coffee_day then
    raise exception 'user_id og coffee_day kan ikke ændres på en vurdering' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger ratings_before_update
  before update on public.ratings
  for each row execute function public.ratings_before_update();

-- ── join_attempts: forsøg på at indtaste gruppekoden (til spærring mod gætteri) ──
create table public.join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index join_attempts_failed_idx on public.join_attempts (created_at) where not success;
