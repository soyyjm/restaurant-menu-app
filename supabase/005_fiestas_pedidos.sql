-- 005_fiestas_pedidos.sql
-- Festive-menu pre-orders (25/12, 26/12, 1/1, 6/1).
--   * fiesta_bookings: one row per family booking, entered by staff (owner-only RLS, like 004).
--   * fiesta_orders:   the family's dish choices, one row per booking.
--   * Guests never touch the tables. They open /p/<token> and call two SECURITY DEFINER
--     functions with that token: fiesta_booking(token) to read, fiesta_submit(...) to save.
--     The token is a random 128-bit value, so a link only reaches its own booking.
-- Order format (counts per dish key; keys come from fiestas/menus.js):
--   {"adult":{"primero":{"sopa25":2,"carp25":1},"segundo":{...},"postre":{...}},
--    "kid":  {"primero":{...},"segundo":{...},"postre":{...}}}
--   Each course must add up to the number of adults (or kids) on the booking.
-- Safe to run more than once. Requires 004 (public.set_owner_id).

begin;

create table if not exists public.fiesta_bookings (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  day         date not null,
  name        text not null check (length(name) between 1 and 120),
  phone       text check (length(phone) <= 40),
  adults      int  not null check (adults between 1 and 40),
  kids        int  not null default 0 check (kids between 0 and 30),
  table_no    text check (length(table_no) <= 20),
  notes       text check (length(notes) <= 1000),
  token       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  locked      boolean not null default false,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists fiesta_bookings_owner_day_idx on public.fiesta_bookings (owner_id, day);

create table if not exists public.fiesta_orders (
  booking_id    uuid primary key references public.fiesta_bookings(id) on delete cascade,
  owner_id      uuid not null,
  items         jsonb not null,
  allergies     text check (length(allergies) <= 1000),
  comments      text check (length(comments) <= 1000),
  adults        int  not null,   -- head count the order was made for
  kids          int  not null,
  submit_count  int  not null default 1,
  submitted_at  timestamptz not null default now()
);
create index if not exists fiesta_orders_owner_idx on public.fiesta_orders (owner_id);

drop trigger if exists set_owner_id on public.fiesta_bookings;
create trigger set_owner_id before insert on public.fiesta_bookings
  for each row execute function public.set_owner_id();

create or replace function public.fiesta_touch() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.fiesta_touch() from public, anon;
drop trigger if exists fiesta_touch on public.fiesta_bookings;
create trigger fiesta_touch before update on public.fiesta_bookings
  for each row execute function public.fiesta_touch();

alter table public.fiesta_bookings enable row level security;
alter table public.fiesta_orders   enable row level security;

drop policy if exists fiesta_bookings_owner_isolation on public.fiesta_bookings;
create policy fiesta_bookings_owner_isolation on public.fiesta_bookings
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fiesta_orders_owner_isolation on public.fiesta_orders;
create policy fiesta_orders_owner_isolation on public.fiesta_orders
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.fiesta_bookings, public.fiesta_orders from anon;
grant select, insert, update, delete on public.fiesta_bookings, public.fiesta_orders to authenticated;

-- Guest read: booking summary + current order. No phone, notes or ids.
create or replace function public.fiesta_booking(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'day', b.day, 'name', b.name, 'adults', b.adults, 'kids', b.kids,
    'open', not b.locked and (now() at time zone 'Europe/Madrid')::date < b.day,
    'order', case when o.booking_id is null then null else jsonb_build_object(
      'items', o.items, 'allergies', o.allergies, 'comments', o.comments,
      'adults', o.adults, 'kids', o.kids, 'submitted_at', o.submitted_at) end)
  from public.fiesta_bookings b
  left join public.fiesta_orders o on o.booking_id = b.id
  where b.token = p_token and length(p_token) = 32
$$;

-- Validate one group ("adult" or "kid"): every course sums to p_count, counts are 1..p_count.
create or replace function public.fiesta_check_group(p_group jsonb, p_count int) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare c text; k text; v jsonb; total int;
begin
  if p_count = 0 then return p_group is null or p_group = '{}'::jsonb; end if;
  if p_group is null or jsonb_typeof(p_group) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_group)) <> 3 then return false; end if;
  foreach c in array array['primero','segundo','postre'] loop
    if jsonb_typeof(p_group -> c) is distinct from 'object' then return false; end if;
    total := 0;
    for k, v in select * from jsonb_each(p_group -> c) loop
      if length(k) not between 1 and 40 or jsonb_typeof(v) <> 'number'
         or (v #>> '{}') !~ '^[0-9]+$' or (v #>> '{}')::int not between 1 and p_count then
        return false;
      end if;
      total := total + (v #>> '{}')::int;
    end loop;
    if total <> p_count then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.fiesta_check_group(jsonb, int) from public, anon;

-- Guest write: create or replace the order while the booking is open.
create or replace function public.fiesta_submit(p_token text, p_items jsonb, p_allergies text, p_comments text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare b public.fiesta_bookings;
begin
  select * into b from public.fiesta_bookings where token = p_token and length(p_token) = 32;
  if not found then raise exception 'fiesta: booking not found' using errcode = 'P0002'; end if;
  if b.locked or (now() at time zone 'Europe/Madrid')::date >= b.day then
    raise exception 'fiesta: closed' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_items) k where k not in ('adult','kid'))
     or not public.fiesta_check_group(p_items -> 'adult', b.adults)
     or not public.fiesta_check_group(p_items -> 'kid', b.kids) then
    raise exception 'fiesta: invalid order' using errcode = '22023';
  end if;
  if length(coalesce(p_allergies,'')) > 1000 or length(coalesce(p_comments,'')) > 1000 then
    raise exception 'fiesta: text too long' using errcode = '22001';
  end if;

  insert into public.fiesta_orders as o (booking_id, owner_id, items, allergies, comments, adults, kids)
  values (b.id, b.owner_id, p_items, nullif(trim(p_allergies),''), nullif(trim(p_comments),''), b.adults, b.kids)
  on conflict (booking_id) do update
    set items = excluded.items, allergies = excluded.allergies, comments = excluded.comments,
        adults = excluded.adults, kids = excluded.kids,
        submit_count = o.submit_count + 1, submitted_at = now();
  return public.fiesta_booking(p_token);
end $$;

revoke all on function public.fiesta_booking(text) from public;
revoke all on function public.fiesta_submit(text, jsonb, text, text) from public;
grant execute on function public.fiesta_booking(text) to anon, authenticated;
grant execute on function public.fiesta_submit(text, jsonb, text, text) to anon, authenticated;

commit;
