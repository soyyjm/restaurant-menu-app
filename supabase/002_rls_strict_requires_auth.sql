-- 002_rls_strict_requires_auth.sql
-- Purpose: strict anti-cross-tenant isolation.
-- WARNING: requires Supabase Auth in frontend. Running this NOW will break anonymous clients.

begin;

-- Add per-user ownership columns.
alter table public.dishes add column if not exists owner_id uuid;
alter table public.selected_menu add column if not exists owner_id uuid;
alter table public.menu_history add column if not exists owner_id uuid;
alter table public.settings add column if not exists owner_id uuid;

-- Helpful ownership indexes.
create index if not exists dishes_owner_id_idx on public.dishes (owner_id);
create index if not exists selected_menu_owner_id_idx on public.selected_menu (owner_id);
create index if not exists menu_history_owner_id_idx on public.menu_history (owner_id);
create index if not exists settings_owner_id_idx on public.settings (owner_id);

-- Replace permissive policies with user-isolated policies.
drop policy if exists dishes_open_access on public.dishes;
drop policy if exists selected_menu_singleton_access on public.selected_menu;
drop policy if exists menu_history_open_access on public.menu_history;
drop policy if exists settings_singleton_access on public.settings;

create policy dishes_owner_isolation on public.dishes
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy selected_menu_owner_isolation on public.selected_menu
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and id = 1);

create policy menu_history_owner_isolation on public.menu_history
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy settings_owner_isolation on public.settings
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and id = 1);

commit;
