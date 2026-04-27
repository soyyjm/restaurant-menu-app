-- 001_hardening_nonbreaking.sql
-- Purpose: add constraints/indexes + baseline RLS without breaking current frontend behavior.
-- Safe to run multiple times.

begin;

-- Ensure useful defaults exist for ordering/perf.
alter table public.dishes
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists order_index integer;

alter table public.selected_menu
  add column if not exists updated_at timestamptz default now();

alter table public.menu_history
  add column if not exists updated_at timestamptz default now();

alter table public.settings
  add column if not exists updated_at timestamptz default now();

-- Singleton guardrails for app-level tables.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'selected_menu_singleton_id_chk'
      and conrelid = 'public.selected_menu'::regclass
  ) then
    alter table public.selected_menu
      add constraint selected_menu_singleton_id_chk check (id = 1) not valid;
    alter table public.selected_menu validate constraint selected_menu_singleton_id_chk;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_singleton_id_chk'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_singleton_id_chk check (id = 1) not valid;
    alter table public.settings validate constraint settings_singleton_id_chk;
  end if;
end $$;

-- Uniqueness and index hardening.
create unique index if not exists menu_history_date_uidx on public.menu_history (date);

create index if not exists dishes_created_at_idx on public.dishes (created_at desc);
create index if not exists dishes_order_index_idx on public.dishes (order_index);
create index if not exists dishes_category_idx on public.dishes (category);
create index if not exists menu_history_date_idx on public.menu_history (date desc);

-- Baseline RLS enabled (non-breaking policies keep existing behavior).
alter table public.dishes enable row level security;
alter table public.selected_menu enable row level security;
alter table public.menu_history enable row level security;
alter table public.settings enable row level security;

-- Keep anon/auth access for current app runtime; explicit policies are easier to tighten later.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dishes' and policyname = 'dishes_open_access'
  ) then
    create policy dishes_open_access on public.dishes
      for all to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'selected_menu' and policyname = 'selected_menu_singleton_access'
  ) then
    create policy selected_menu_singleton_access on public.selected_menu
      for all to anon, authenticated
      using (id = 1)
      with check (id = 1);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'menu_history' and policyname = 'menu_history_open_access'
  ) then
    create policy menu_history_open_access on public.menu_history
      for all to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'settings' and policyname = 'settings_singleton_access'
  ) then
    create policy settings_singleton_access on public.settings
      for all to anon, authenticated
      using (id = 1)
      with check (id = 1);
  end if;
end $$;

commit;
