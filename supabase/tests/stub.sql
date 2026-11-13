-- Kun til test: efterligner de dele af Supabase som migrationerne forudsætter.
-- Køres FØR migrationerne i en tom PGlite-database. Hører ikke hjemme i supabase/migrations.

create schema if not exists extensions;
create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- Samme logik som Supabases auth.uid(): læser sub-claimet fra JWT'en
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;

-- Supabase giver som standard ALLE rettigheder på nye objekter i public til disse roller.
-- Vi efterligner det, så testene beviser at migrationerne selv strammer rettighederne.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
