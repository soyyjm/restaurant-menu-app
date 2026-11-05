-- 006_fiestas_grupo.sql
-- Group link for big tables: the host shares /g/<share_token> with the other families or
-- friends; each of them picks the dishes for their own people. The host sees every pick on
-- their own page, fills the table order with them and sends it (the restaurant still gets
-- one order per booking, plus who-ordered-what for the waiters).
--   * fiesta_bookings.share_token: second random token, only for the group link.
--   * fiesta_shares: one row per companion submission (owner-only RLS, like 005).
--   * fiesta_group(share, id, key): read what a companion needs (no phone, no other people's picks).
--   * fiesta_group_submit(...): create or update one companion submission; returns its id + key,
--     which the companion's browser keeps so they can change their own picks later.
--   * fiesta_booking(token) (host) now also returns share_token and the companions' picks.
-- Safe to run more than once. Requires 005.

begin;

alter table public.fiesta_bookings
  add column if not exists share_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists fiesta_bookings_share_token_uidx on public.fiesta_bookings (share_token);

create table if not exists public.fiesta_shares (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.fiesta_bookings(id) on delete cascade,
  owner_id    uuid not null,
  edit_key    text not null default replace(gen_random_uuid()::text, '-', ''),
  name        text not null check (length(name) between 1 and 60),
  adults      int  not null check (adults between 0 and 40),
  kids        int  not null check (kids between 0 and 30),
  items       jsonb not null,
  notes       text check (length(notes) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (adults + kids >= 1)
);
create index if not exists fiesta_shares_booking_idx on public.fiesta_shares (booking_id);

alter table public.fiesta_shares enable row level security;
drop policy if exists fiesta_shares_owner_isolation on public.fiesta_shares;
create policy fiesta_shares_owner_isolation on public.fiesta_shares
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.fiesta_shares from anon;
grant select, insert, update, delete on public.fiesta_shares to authenticated;

-- Host read: same as 005 plus share_token and the companions' picks.
create or replace function public.fiesta_booking(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'day', b.day, 'name', b.name, 'adults', b.adults, 'kids', b.kids,
    'open', not b.locked and (now() at time zone 'Europe/Madrid')::date < b.day,
    'share_token', b.share_token,
    'order', case when o.booking_id is null then null else jsonb_build_object(
      'items', o.items, 'allergies', o.allergies, 'comments', o.comments,
      'adults', o.adults, 'kids', o.kids, 'submitted_at', o.submitted_at) end,
    'shares', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'adults', s.adults, 'kids', s.kids, 'items', s.items,
        'notes', s.notes, 'updated_at', s.updated_at) order by s.created_at)
      from public.fiesta_shares s where s.booking_id = b.id), '[]'::jsonb))
  from public.fiesta_bookings b
  left join public.fiesta_orders o on o.booking_id = b.id
  where b.token = p_token and length(p_token) = 32
$$;

-- Companion read: booking basics, how many people the group has already covered, and their
-- own submission when p_id + p_key match.
create or replace function public.fiesta_group(p_share text, p_id uuid, p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'day', b.day, 'host', b.name, 'adults', b.adults, 'kids', b.kids,
    'open', not b.locked and (now() at time zone 'Europe/Madrid')::date < b.day,
    'taken_adults', coalesce((select sum(s.adults) from public.fiesta_shares s where s.booking_id = b.id and s.id is distinct from p_id), 0),
    'taken_kids',   coalesce((select sum(s.kids)   from public.fiesta_shares s where s.booking_id = b.id and s.id is distinct from p_id), 0),
    'mine', (select jsonb_build_object('id', s.id, 'name', s.name, 'adults', s.adults, 'kids', s.kids,
                                       'items', s.items, 'notes', s.notes, 'updated_at', s.updated_at)
             from public.fiesta_shares s
             where s.booking_id = b.id and s.id = p_id and s.edit_key = p_key and length(p_key) = 32))
  from public.fiesta_bookings b
  where b.share_token = p_share and length(p_share) = 32
$$;

create or replace function public.fiesta_group_submit(
  p_share text, p_id uuid, p_key text, p_name text, p_adults int, p_kids int, p_items jsonb, p_notes text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare b public.fiesta_bookings; s public.fiesta_shares; n int;
begin
  select * into b from public.fiesta_bookings where share_token = p_share and length(p_share) = 32;
  if not found then raise exception 'fiesta: booking not found' using errcode = 'P0002'; end if;
  if b.locked or (now() at time zone 'Europe/Madrid')::date >= b.day then
    raise exception 'fiesta: closed' using errcode = 'P0001';
  end if;
  if coalesce(length(trim(p_name)), 0) not between 1 and 60
     or p_adults is null or p_kids is null or p_adults < 0 or p_kids < 0 or p_adults + p_kids < 1
     or p_adults > b.adults or p_kids > b.kids
     or jsonb_typeof(p_items) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_items) k where k not in ('adult','kid'))
     or not public.fiesta_check_group(p_items -> 'adult', p_adults)
     or not public.fiesta_check_group(p_items -> 'kid', p_kids)
     or length(coalesce(p_notes, '')) > 500 then
    raise exception 'fiesta: invalid order' using errcode = '22023';
  end if;

  if p_id is not null then
    update public.fiesta_shares
       set name = trim(p_name), adults = p_adults, kids = p_kids, items = p_items,
           notes = nullif(trim(p_notes), ''), updated_at = now()
     where id = p_id and booking_id = b.id and edit_key = p_key
     returning * into s;
    if not found then raise exception 'fiesta: booking not found' using errcode = 'P0002'; end if;
  else
    select count(*) into n from public.fiesta_shares where booking_id = b.id;
    if n >= 40 then raise exception 'fiesta: invalid order (too many)' using errcode = '22023'; end if;
    insert into public.fiesta_shares (booking_id, owner_id, name, adults, kids, items, notes)
    values (b.id, b.owner_id, trim(p_name), p_adults, p_kids, p_items, nullif(trim(p_notes), ''))
    returning * into s;
  end if;
  return jsonb_build_object('id', s.id, 'key', s.edit_key);
end $$;

-- Companion removes their own submission (e.g. they are no longer coming).
create or replace function public.fiesta_group_delete(p_share text, p_id uuid, p_key text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare b public.fiesta_bookings;
begin
  select * into b from public.fiesta_bookings where share_token = p_share and length(p_share) = 32;
  if not found then return false; end if;
  if b.locked or (now() at time zone 'Europe/Madrid')::date >= b.day then
    raise exception 'fiesta: closed' using errcode = 'P0001';
  end if;
  delete from public.fiesta_shares where id = p_id and booking_id = b.id and edit_key = p_key;
  return found;
end $$;

revoke all on function public.fiesta_group(text, uuid, text) from public;
revoke all on function public.fiesta_group_submit(text, uuid, text, text, int, int, jsonb, text) from public;
revoke all on function public.fiesta_group_delete(text, uuid, text) from public;
grant execute on function public.fiesta_group(text, uuid, text) to anon, authenticated;
grant execute on function public.fiesta_group_submit(text, uuid, text, text, int, int, jsonb, text) to anon, authenticated;
grant execute on function public.fiesta_group_delete(text, uuid, text) to anon, authenticated;

commit;
