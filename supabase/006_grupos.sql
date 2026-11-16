-- 006_grupos.sql
-- Group menus (menú cerrado / menú para grupos): one event per group booking.
--   * grupo_eventos: the booking (date, time, organizer, pax) + a snapshot of the Menú cerrado
--     it uses (sections with "choose_one" courses), owner-only RLS like 004/005.
--   * grupo_personas: one row per diner who picked their dishes (by themselves through the
--     group link, or added by the organizer / staff).
--   * The organizer can also enter plain counts for people who told them by WhatsApp or in
--     person (grupo_eventos.counts). Total = people rows + counts; each course must add up to pax.
-- Two links, both random 128-bit tokens:
--   token        organizer link  /m/<token>  sees and edits everything for that event
--   share_token  group link      /e/<share>  each diner adds (and later edits) only their own row
-- Picks format: {"<section id>": "<dish id>", ...} with one dish per choose_one section.
-- Counts format: {"<section id>": {"<dish id>": n, ...}, ...}.
-- Safe to run more than once. Requires 004 (public.set_owner_id) and 005 (fiesta_orders policy hardening).

begin;

create table if not exists public.grupo_eventos (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid(),
  date         date not null,
  time         text check (length(time) <= 10),
  title        text not null check (length(title) between 1 and 120),
  organizer    text check (length(organizer) <= 120),
  phone        text check (length(phone) <= 40),
  email        text check (length(email) <= 200),
  pax          int  not null check (pax between 1 and 300),
  menu         jsonb not null,
  menu_id      uuid,
  deadline     date,
  notes        text check (length(notes) <= 1000),
  counts       jsonb not null default '{}'::jsonb,
  counts_notes text check (length(counts_notes) <= 1000),
  counts_at    timestamptz,
  token        text not null unique default replace(gen_random_uuid()::text, '-', ''),
  share_token  text not null unique default replace(gen_random_uuid()::text, '-', ''),
  locked       boolean not null default false,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists grupo_eventos_owner_date_idx on public.grupo_eventos (owner_id, date);

create table if not exists public.grupo_personas (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid not null references public.grupo_eventos(id) on delete cascade,
  owner_id    uuid not null,
  name        text not null check (length(name) between 1 and 60),
  picks       jsonb not null,
  notes       text check (length(notes) <= 300),
  added_by    text not null default 'self' check (added_by in ('self', 'organizer', 'staff')),
  edit_key    text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists grupo_personas_evento_idx on public.grupo_personas (evento_id);

drop trigger if exists set_owner_id on public.grupo_eventos;
create trigger set_owner_id before insert on public.grupo_eventos
  for each row execute function public.set_owner_id();

create or replace function public.grupo_touch() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.grupo_touch() from public, anon;
drop trigger if exists grupo_touch on public.grupo_eventos;
create trigger grupo_touch before update on public.grupo_eventos for each row execute function public.grupo_touch();
drop trigger if exists grupo_touch on public.grupo_personas;
create trigger grupo_touch before update on public.grupo_personas for each row execute function public.grupo_touch();

alter table public.grupo_eventos  enable row level security;
alter table public.grupo_personas enable row level security;
drop policy if exists grupo_eventos_owner_isolation on public.grupo_eventos;
create policy grupo_eventos_owner_isolation on public.grupo_eventos
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists grupo_personas_owner_isolation on public.grupo_personas;
create policy grupo_personas_owner_isolation on public.grupo_personas
  for all to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.grupo_eventos e where e.id = evento_id and e.owner_id = auth.uid()));

-- Same hardening for 005: an order row may only point at one of your own bookings.
drop policy if exists fiesta_orders_owner_isolation on public.fiesta_orders;
create policy fiesta_orders_owner_isolation on public.fiesta_orders
  for all to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.fiesta_bookings b where b.id = booking_id and b.owner_id = auth.uid()));
revoke all on public.grupo_eventos, public.grupo_personas from anon;
grant select, insert, update, delete on public.grupo_eventos, public.grupo_personas to authenticated;

-- ---------- helpers (not callable by anon) ----------

-- Open while not locked, not past the deadline (inclusive) and before the day itself (Madrid time).
create or replace function public.grupo_open(e public.grupo_eventos) returns boolean
language sql stable security invoker set search_path = '' as $$
  select not e.locked
     and (now() at time zone 'Europe/Madrid')::date < e.date
     and (e.deadline is null or (now() at time zone 'Europe/Madrid')::date <= e.deadline)
$$;

-- choose_one sections of a menu snapshot: (section id, array of dish ids)
create or replace function public.grupo_choice_sections(p_menu jsonb)
returns table (sid text, dish_ids text[])
language sql immutable security invoker set search_path = '' as $$
  select s ->> 'id', array(select d ->> 'id' from jsonb_array_elements(coalesce(s -> 'dishes', '[]'::jsonb)) d)
  from jsonb_array_elements(coalesce(p_menu -> 'sections', '[]'::jsonb)) s
  where s ->> 'mode' = 'choose_one'
$$;

-- Picks: exactly one valid dish for every choose_one section, nothing else.
create or replace function public.grupo_check_picks(p_menu jsonb, p_picks jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select jsonb_typeof(p_picks) = 'object'
     and (select count(*) from jsonb_object_keys(p_picks)) = (select count(*) from public.grupo_choice_sections(p_menu))
     and not exists (
       select 1 from public.grupo_choice_sections(p_menu) cs
       where jsonb_typeof(p_picks -> cs.sid) is distinct from 'string' or not ((p_picks ->> cs.sid) = any (cs.dish_ids)))
$$;

-- Counts: only choose_one sections / their dishes, whole numbers 1..300.
create or replace function public.grupo_check_counts(p_menu jsonb, p_counts jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare k text; v jsonb; d text; n jsonb; ids text[];
begin
  if jsonb_typeof(p_counts) is distinct from 'object' then return false; end if;
  for k, v in select * from jsonb_each(p_counts) loop
    select cs.dish_ids into ids from public.grupo_choice_sections(p_menu) cs where cs.sid = k;
    if ids is null or jsonb_typeof(v) <> 'object' then return false; end if;
    for d, n in select * from jsonb_each(v) loop
      if not (d = any (ids)) or jsonb_typeof(n) <> 'number' or (n #>> '{}') !~ '^[0-9]+$'
         or (n #>> '{}')::int not between 1 and 300 then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

-- Largest per-course total of the organizer's counts (= people they account for).
create or replace function public.grupo_counts_people(p_counts jsonb) returns int
language sql immutable security invoker set search_path = '' as $$
  select coalesce(max(t), 0)::int from (
    select (select coalesce(sum((x.value #>> '{}')::int), 0) from jsonb_each(c.value) x) t
    from jsonb_each(coalesce(p_counts, '{}'::jsonb)) c) q
$$;

revoke all on function public.grupo_open(public.grupo_eventos) from public, anon;
revoke all on function public.grupo_choice_sections(jsonb) from public, anon;
revoke all on function public.grupo_check_picks(jsonb, jsonb) from public, anon;
revoke all on function public.grupo_check_counts(jsonb, jsonb) from public, anon;
revoke all on function public.grupo_counts_people(jsonb) from public, anon;

-- ---------- organizer link ----------

create or replace function public.grupo_org(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'date', e.date, 'time', e.time, 'title', e.title, 'organizer', e.organizer, 'pax', e.pax,
    'menu', e.menu, 'deadline', e.deadline, 'open', public.grupo_open(e), 'share_token', e.share_token,
    'counts', e.counts, 'counts_notes', e.counts_notes, 'counts_at', e.counts_at,
    'personas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'picks', p.picks,
        'notes', p.notes, 'added_by', p.added_by, 'updated_at', p.updated_at) order by p.created_at)
      from public.grupo_personas p where p.evento_id = e.id), '[]'::jsonb))
  from public.grupo_eventos e
  where e.token = p_token and length(p_token) = 32
$$;

create or replace function public.grupo_org_counts(p_token text, p_counts jsonb, p_notes text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.grupo_eventos; people int;
begin
  select * into e from public.grupo_eventos where token = p_token and length(p_token) = 32;
  if not found then raise exception 'grupo: not found' using errcode = 'P0002'; end if;
  if not public.grupo_open(e) then raise exception 'grupo: closed' using errcode = 'P0001'; end if;
  if not public.grupo_check_counts(e.menu, p_counts) or length(coalesce(p_notes, '')) > 1000 then
    raise exception 'grupo: invalid' using errcode = '22023';
  end if;
  select count(*) into people from public.grupo_personas where evento_id = e.id;
  if people + public.grupo_counts_people(p_counts) > e.pax then
    raise exception 'grupo: full' using errcode = '22023';
  end if;
  update public.grupo_eventos set counts = p_counts, counts_notes = nullif(trim(p_notes), ''), counts_at = now() where id = e.id;
  return public.grupo_org(p_token);
end $$;

-- ---------- group link ----------

create or replace function public.grupo_share(p_share text, p_id uuid, p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'date', e.date, 'time', e.time, 'title', e.title, 'organizer', e.organizer, 'pax', e.pax,
    'menu', e.menu, 'deadline', e.deadline, 'open', public.grupo_open(e),
    'taken', (select count(*) from public.grupo_personas p where p.evento_id = e.id) + public.grupo_counts_people(e.counts),
    'mine', (select jsonb_build_object('id', p.id, 'name', p.name, 'picks', p.picks, 'notes', p.notes, 'updated_at', p.updated_at)
             from public.grupo_personas p
             where p.evento_id = e.id and p.id = p_id and p.edit_key = p_key and length(p_key) = 32))
  from public.grupo_eventos e
  where e.share_token = p_share and length(p_share) = 32
$$;

-- Save one diner. p_token is either the organizer token (may edit any row, no key needed)
-- or the group share token (adds a row, or edits its own row with id + key).
create or replace function public.grupo_persona_save(
  p_token text, p_id uuid, p_key text, p_name text, p_picks jsonb, p_notes text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare e public.grupo_eventos; is_org boolean; p public.grupo_personas; people int;
begin
  select * into e from public.grupo_eventos where (token = p_token or share_token = p_token) and length(p_token) = 32;
  if not found then raise exception 'grupo: not found' using errcode = 'P0002'; end if;
  is_org := e.token = p_token;
  if not public.grupo_open(e) then raise exception 'grupo: closed' using errcode = 'P0001'; end if;
  if coalesce(length(trim(p_name)), 0) not between 1 and 60 or length(coalesce(p_notes, '')) > 300
     or not public.grupo_check_picks(e.menu, p_picks) then
    raise exception 'grupo: invalid' using errcode = '22023';
  end if;

  if p_id is not null then
    update public.grupo_personas set name = trim(p_name), picks = p_picks, notes = nullif(trim(p_notes), '')
     where id = p_id and evento_id = e.id and (is_org or edit_key = p_key)
     returning * into p;
    if not found then raise exception 'grupo: not found' using errcode = 'P0002'; end if;
  else
    select count(*) into people from public.grupo_personas where evento_id = e.id;
    if people + public.grupo_counts_people(e.counts) >= e.pax then
      raise exception 'grupo: full' using errcode = '22023';
    end if;
    insert into public.grupo_personas (evento_id, owner_id, name, picks, notes, added_by)
    values (e.id, e.owner_id, trim(p_name), p_picks, nullif(trim(p_notes), ''), case when is_org then 'organizer' else 'self' end)
    returning * into p;
  end if;
  return jsonb_build_object('id', p.id, 'key', p.edit_key);
end $$;

create or replace function public.grupo_persona_delete(p_token text, p_id uuid, p_key text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare e public.grupo_eventos; is_org boolean;
begin
  select * into e from public.grupo_eventos where (token = p_token or share_token = p_token) and length(p_token) = 32;
  if not found then return false; end if;
  is_org := e.token = p_token;
  if not public.grupo_open(e) then raise exception 'grupo: closed' using errcode = 'P0001'; end if;
  delete from public.grupo_personas where id = p_id and evento_id = e.id and (is_org or edit_key = p_key);
  return found;
end $$;

revoke all on function public.grupo_org(text) from public;
revoke all on function public.grupo_org_counts(text, jsonb, text) from public;
revoke all on function public.grupo_share(text, uuid, text) from public;
revoke all on function public.grupo_persona_save(text, uuid, text, text, jsonb, text) from public;
revoke all on function public.grupo_persona_delete(text, uuid, text) from public;
grant execute on function public.grupo_org(text) to anon, authenticated;
grant execute on function public.grupo_org_counts(text, jsonb, text) to anon, authenticated;
grant execute on function public.grupo_share(text, uuid, text) to anon, authenticated;
grant execute on function public.grupo_persona_save(text, uuid, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.grupo_persona_delete(text, uuid, text) to anon, authenticated;

commit;
