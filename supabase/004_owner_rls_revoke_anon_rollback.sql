-- 004_owner_rls_revoke_anon_rollback.sql
-- Emergency undo of 004 if the signed-in app can no longer load or save.
-- Default: any SIGNED-IN user gets full access again (anon stays locked out).
-- owner_id columns and data are kept, so 004 can be re-run later without a new backfill.
-- The Gemini key is NOT restored: it was leaked and must stay revoked.

begin;

do $$
declare
  t text;
  p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('dishes','selected_menu','menu_history','settings','menus_cerrados')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  foreach t in array array['dishes','selected_menu','menu_history','settings','menus_cerrados'] loop
    execute format('alter table public.%I alter column owner_id drop not null', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)',
                   t || '_signed_in_access', t);
  end loop;
end $$;

grant select, insert, update, delete
  on public.dishes, public.selected_menu, public.menu_history, public.settings, public.menus_cerrados
  to authenticated;

-- Empty column only, so old code that selects it does not fail. Never store a key here again.
alter table public.settings add column if not exists gemini_api_key text;

commit;

-- LAST RESORT ONLY (re-opens the 2026-10-22 hole: anyone with the public anon key can read/write/delete).
-- Uncomment only if the app must work signed-out while you fix something, then re-run 004.
-- begin;
-- grant select, insert, update, delete
--   on public.dishes, public.selected_menu, public.menu_history, public.settings, public.menus_cerrados
--   to anon;
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['dishes','selected_menu','menu_history','settings','menus_cerrados'] loop
--     execute format('create policy %I on public.%I for all to anon using (true) with check (true)', t || '_anon_access', t);
--   end loop;
-- end $$;
-- commit;
