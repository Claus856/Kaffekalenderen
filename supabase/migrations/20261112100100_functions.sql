-- Kaffekalenderen · hjælpefunktioner (bruges af RLS-policies og klienten)
--
-- Alle funktioner der rører RLS-beskyttede tabeller er "security definer" med
-- tomt search_path. Det er nødvendigt, fordi en policy der selv slår op i sin
-- egen tabel ellers giver "infinite recursion detected in policy".

-- ── Dato og låger (Europe/Copenhagen) ──────────────────────────────────────

-- Datoen i Danmark for et givet tidspunkt
create function public.cph_date(p_ts timestamptz) returns date
language sql immutable
set search_path = ''
as $$ select (p_ts at time zone 'Europe/Copenhagen')::date $$;

-- Dagens dato i Danmark. Testene erstatter denne for at kunne "flytte uret".
create function public.today_cph() returns date
language sql stable
set search_path = ''
as $$ select public.cph_date(now()) $$;

-- Hvor mange låger er åbne på en given dato? 0 før 1. december, 1–25 derefter, 25 efter jul.
create function public.open_day_on(p_date date, p_year smallint) returns smallint
language sql immutable
set search_path = ''
as $$
  select case
    when p_date < make_date(p_year, 12, 1) then 0
    else least(25, p_date - make_date(p_year, 12, 1) + 1)
  end::smallint
$$;

-- Højeste åbne låge lige nu. Bruges af RLS og af klienten (så uret på telefonen er ligegyldigt).
create function public.open_day() returns smallint
language sql stable security definer
set search_path = ''
as $$
  select case
    when s.show_future_days then 25
    else public.open_day_on(public.today_cph(), s.calendar_year)
  end::smallint
  from public.settings s
  where s.id
$$;

-- ── Hvem er jeg? ───────────────────────────────────────────────────────────

create function public.is_member() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()))
$$;

create function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
$$;

-- Har den indloggede selv givet karakter for dagen? (grundlaget for "skjulte karakterer")
create function public.has_rated(p_day smallint) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ratings r
    where r.user_id = (select auth.uid()) and r.coffee_day = p_day
  )
$$;

-- ── Oprettelse af profil med gruppekode ────────────────────────────────────

-- Returnerer en statuskode som klienten oversætter til dansk:
--   ok | ikke_logget_ind | har_allerede_profil | ugyldigt_navn |
--   for_mange_forsog | forkert_kode | navn_optaget
-- (Statuskoder i stedet for exceptions, så et mislykket forsøg stadig bliver logget.)
create function public.create_profile(p_display_name text, p_group_code text) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_display_name);
  v_hash text;
begin
  if v_uid is null then
    return 'ikke_logget_ind';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    return 'har_allerede_profil';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 24 then
    return 'ugyldigt_navn';
  end if;

  -- Spærring mod gætteri: højst 10 forkerte forsøg pr. 15 minutter i alt
  if (select count(*) from public.join_attempts
       where not success and created_at > now() - interval '15 minutes') >= 10 then
    return 'for_mange_forsog';
  end if;

  select s.group_code_hash into v_hash from public.settings s where s.id;

  if v_hash is null
     or p_group_code is null
     or extensions.crypt(lower(btrim(p_group_code)), v_hash) <> v_hash then
    insert into public.join_attempts (user_id, success) values (v_uid, false);
    return 'forkert_kode';
  end if;

  if exists (select 1 from public.profiles where lower(btrim(display_name)) = lower(v_name)) then
    return 'navn_optaget';
  end if;

  insert into public.profiles (id, display_name) values (v_uid, v_name);
  insert into public.join_attempts (user_id, success) values (v_uid, true);
  return 'ok';
exception
  when unique_violation then
    return 'navn_optaget';
end;
$$;

-- Admin kan skifte gruppekoden (ellers: se README for SQL til første opsætning)
create function public.set_group_code(p_code text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Kun admin kan ændre gruppekoden' using errcode = '42501';
  end if;
  if p_code is null or char_length(btrim(p_code)) < 6 then
    raise exception 'Gruppekoden skal være mindst 6 tegn' using errcode = '22023';
  end if;
  update public.settings s
     set group_code_hash = extensions.crypt(lower(btrim(p_code)), extensions.gen_salt('bf'))
   where s.id;
end;
$$;

-- ── Deltagelse: hvem har stemt på hvilke dage (uden karakter og kommentar) ──
create function public.participation() returns table (user_id uuid, coffee_day smallint)
language sql stable security definer
set search_path = ''
as $$
  select r.user_id, r.coffee_day
  from public.ratings r
  where public.is_member() and r.coffee_day <= public.open_day()
$$;

-- ── Rettigheder på funktionerne ────────────────────────────────────────────
-- Postgres giver som standard EXECUTE til alle. Vi lukker for anon og åbner kun det nødvendige.
revoke all on function
  public.cph_date(timestamptz),
  public.today_cph(),
  public.open_day_on(date, smallint),
  public.open_day(),
  public.is_member(),
  public.is_admin(),
  public.has_rated(smallint),
  public.create_profile(text, text),
  public.set_group_code(text),
  public.participation()
from public, anon;

grant execute on function
  public.cph_date(timestamptz),
  public.today_cph(),
  public.open_day_on(date, smallint),
  public.open_day(),
  public.is_member(),
  public.is_admin(),
  public.has_rated(smallint),
  public.create_profile(text, text),
  public.set_group_code(text),
  public.participation()
to authenticated, service_role;
