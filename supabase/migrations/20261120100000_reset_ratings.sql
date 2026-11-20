-- Kaffekalenderen · nulstilling af vurderinger (kun admin)
--
-- Bruges til at slette testvurderinger, før kalenderen går i gang. Kaffer, medlemmer og indstillinger røres ikke.
--
-- Spærre: har nogen stemt efter kalenderens start (1. december kl. 00:00 dansk tid), kan der ikke nulstilles,
-- så rigtige stemmer aldrig kan forsvinde ved en fejl eller i en kapret admin-session. Spærren ser på hvornår
-- vurderingerne er OPRETTET, ikke på uret, så testvurderinger fra november kan nulstilles, også efter 1. december,
-- så længe ingen rigtige stemmer er kommet til.

-- Kalenderens start: 1. december i kalenderåret (settings.calendar_year), kl. 00:00 dansk tid. Kun til internt brug.
create function public.calendar_start() returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select make_timestamptz(s.calendar_year, 12, 1, 0, 0, 0, 'Europe/Copenhagen')
  from public.settings s
  where s.id
$$;

-- Antal vurderinger i alt og om nulstilling er spærret. Admin ser ikke karakterer, kun antallet.
create function public.ratings_reset_status() returns table (total integer, locked boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Kun admin kan nulstille vurderinger' using errcode = '42501';
  end if;
  return query
    select
      (select count(*)::integer from public.ratings),
      exists (select 1 from public.ratings r where r.created_at >= public.calendar_start());
end;
$$;

-- Sletter ALLE vurderinger og returnerer hvor mange. Kan ikke fortrydes.
create function public.reset_ratings() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not public.is_admin() then
    raise exception 'Kun admin kan nulstille vurderinger' using errcode = '42501';
  end if;

  if exists (select 1 from public.ratings r where r.created_at >= public.calendar_start()) then
    raise exception 'Der er stemt efter kalenderens start, så vurderingerne kan ikke nulstilles her'
      using errcode = '55000';
  end if;

  delete from public.ratings where true; -- "where true": nogle opsætninger kræver WHERE på DELETE
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Rettigheder: Postgres og Supabase giver som standard EXECUTE til for mange. Kun de to admin-funktioner åbnes.
revoke all on function public.calendar_start() from public, anon, authenticated;
revoke all on function public.ratings_reset_status() from public, anon;
revoke all on function public.reset_ratings() from public, anon;

grant execute on function public.calendar_start() to service_role;
grant execute on function public.ratings_reset_status() to authenticated, service_role;
grant execute on function public.reset_ratings() to authenticated, service_role;
