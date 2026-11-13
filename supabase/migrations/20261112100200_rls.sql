-- Kaffekalenderen · Row Level Security
--
-- Principper:
--  * Uden profil (public.is_member()) giver RLS ingen adgang til noget.
--  * Skjulte karakterer: andres ratings for en dag er først synlige, når man selv har stemt på dagen.
--  * Ingen spoilere: kaffer for fremtidige låger er kun synlige for admin.
--  * Man kan kun oprette, rette og slette sine egne ratings.
--  * Al logik ligger her i databasen. Frontenden er bare en bekvemmelighed.

alter table public.settings      enable row level security;
alter table public.profiles      enable row level security;
alter table public.coffees       enable row level security;
alter table public.coffee_notes  enable row level security;
alter table public.ratings       enable row level security;
alter table public.join_attempts enable row level security;  -- ingen policies = ingen adgang udefra

-- ── Tabelrettigheder (grants) ──────────────────────────────────────────────
-- Supabase giver som standard alle rettigheder til anon/authenticated på nye tabeller.
-- Vi fjerner dem og giver kun det nødvendige tilbage. RLS filtrerer derefter rækkerne.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles, public.coffees, public.coffee_notes, public.ratings to authenticated;
grant insert, update, delete on public.coffees, public.coffee_notes to authenticated;   -- policies kræver admin
grant insert, update, delete on public.ratings to authenticated;                        -- policies kræver ejerskab
grant update (display_name) on public.profiles to authenticated;                        -- is_admin kan IKKE ændres via API
-- group_code_hash udelades bevidst: hashen kan aldrig læses via API, heller ikke af admin
grant select (id, show_future_days, calendar_year) on public.settings to authenticated;
grant update (show_future_days, calendar_year) on public.settings to authenticated;

-- ── settings: kun admin ────────────────────────────────────────────────────
create policy settings_select_admin on public.settings
  for select to authenticated
  using (public.is_admin());

create policy settings_update_admin on public.settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── profiles ───────────────────────────────────────────────────────────────
-- Medlemmer kan se hinandens visningsnavne. Profiler oprettes KUN via create_profile().
create policy profiles_select_member on public.profiles
  for select to authenticated
  using (public.is_member());

-- Man kan omdøbe sig selv (kolonnerettigheden ovenfor forhindrer ændring af is_admin)
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── coffees og coffee_notes ────────────────────────────────────────────────
-- Medlemmer ser åbne låger. Admin ser alle (og kan rette dem).
create policy coffees_select on public.coffees
  for select to authenticated
  using (public.is_member() and (day <= (select public.open_day()) or public.is_admin()));

create policy coffees_write_admin on public.coffees
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy coffee_notes_select on public.coffee_notes
  for select to authenticated
  using (public.is_member() and (coffee_day <= (select public.open_day()) or public.is_admin()));

create policy coffee_notes_write_admin on public.coffee_notes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── ratings ────────────────────────────────────────────────────────────────
-- Læs: mine egne altid; andres først når jeg selv har stemt på samme dag (og dagen er åben).
-- has_rated() er security definer, så policyen ikke rekurserer i sin egen tabel.
create policy ratings_select on public.ratings
  for select to authenticated
  using (
    public.is_member()
    and (
      user_id = (select auth.uid())
      or (coffee_day <= (select public.open_day()) and public.has_rated(coffee_day))
    )
  );

-- Opret: kun for mig selv, kun for åbne låger (man må gerne stemme på tidligere dage)
create policy ratings_insert_own on public.ratings
  for insert to authenticated
  with check (
    public.is_member()
    and user_id = (select auth.uid())
    and coffee_day <= (select public.open_day())
  );

-- Ret: kun mine egne. Triggeren forhindrer at user_id/coffee_day flyttes.
create policy ratings_update_own on public.ratings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and coffee_day <= (select public.open_day())
  );

-- Slet: kun mine egne
create policy ratings_delete_own on public.ratings
  for delete to authenticated
  using (user_id = (select auth.uid()));
