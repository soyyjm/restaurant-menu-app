-- 004_owner_rls_revoke_anon.sql
-- Purpose: close the anon-key holes found on 2026-10-22.
--   * Every app table is readable AND writable by owner only (owner_id = auth.uid()).
--   * Adds owner_id to menus_cerrados (it had none).
--   * Revokes all anon privileges on public tables (the anon key is public in index.html).
--   * Nulls and drops settings.gemini_api_key (Gemini now goes through netlify/functions/gemini.mjs).
-- Replaces 002 + 003 (it includes both). Idempotent: safe to re-run.
-- Run in Supabase SQL Editor AFTER the owner account has signed in at least once.
-- Rollback: 004_owner_rls_revoke_anon_rollback.sql. Checks: 004_TEST_NOTES.md.

begin;

-- 0. The account that owns all existing rows. Change only if you sign in with another email.
create temporary table _owner on commit drop as
  select id from auth.users where lower(email) = lower('soyyjm@gmail.com') limit 1;

do $$
begin
  if not exists (select 1 from _owner) then
    raise exception 'Owner account not found in auth.users; sign in once in the app first.';
  end if;
end $$;

-- 1. Ownership column on every app table, filled for new rows by the signed-in user.
create or replace function public.set_owner_id() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.owner_id := coalesce(new.owner_id, auth.uid());
  return new;
end $$;

revoke all on function public.set_owner_id() from public, anon;

do $$
declare
  t text;
  v_owner uuid := (select id from _owner);
begin
  foreach t in array array['dishes','selected_menu','menu_history','settings','menus_cerrados'] loop
    execute format('alter table public.%I add column if not exists owner_id uuid', t);
    execute format('alter table public.%I alter column owner_id set default auth.uid()', t);
    execute format('update public.%I set owner_id = %L where owner_id is null', t, v_owner);
    execute format('alter table public.%I alter column owner_id set not null', t);
    execute format('create index if not exists %I on public.%I (owner_id)', t || '_owner_id_idx', t);

    -- Inserts that send owner_id: null explicitly (e.g. restored backups) still get the caller's id.
    execute format('drop trigger if exists set_owner_id on public.%I', t);
    execute format('create trigger set_owner_id before insert on public.%I for each row execute function public.set_owner_id()', t);
  end loop;
end $$;

-- Drop every existing policy (001 open policies, 002 policies, anything added by hand).
do $$
declare
  p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('dishes','selected_menu','menu_history','settings','menus_cerrados')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2. Owner-only policies (authenticated role only; anon gets no policy at all).
alter table public.dishes enable row level security;
alter table public.selected_menu enable row level security;
alter table public.menu_history enable row level security;
alter table public.settings enable row level security;
alter table public.menus_cerrados enable row level security;

create policy dishes_owner_isolation on public.dishes
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy selected_menu_owner_isolation on public.selected_menu
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and id = 1);

create policy menu_history_owner_isolation on public.menu_history
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy settings_owner_isolation on public.settings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and id = 1);

create policy menus_cerrados_owner_isolation on public.menus_cerrados
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 3. Table privileges: nothing for anon, CRUD for authenticated (RLS still filters rows).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant select, insert, update, delete
  on public.dishes, public.selected_menu, public.menu_history, public.settings, public.menus_cerrados
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- 4. The leaked Gemini key: wipe the value, then the column. Revoke the key in Google AI Studio too.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'settings' and column_name = 'gemini_api_key'
  ) then
    execute 'update public.settings set gemini_api_key = null';
    execute 'alter table public.settings drop column gemini_api_key';
  end if;
end $$;

commit;
