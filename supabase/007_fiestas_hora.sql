-- 007: agreed arrival time for festive bookings (fiesta_bookings.arrival).
-- Staff enter it in fiestas.html; the guest page (/p/<token>) shows it next to the date.
-- Safe to run more than once. Requires 005 (and 006 if already applied; nothing here touches it).
begin;

alter table public.fiesta_bookings add column if not exists arrival time;

-- Guest read: same as 005, plus 'arrival' as 'HH:MM' (null when not set).
create or replace function public.fiesta_booking(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'day', b.day, 'arrival', to_char(b.arrival, 'HH24:MI'), 'name', b.name, 'adults', b.adults, 'kids', b.kids,
    'open', not b.locked and (now() at time zone 'Europe/Madrid')::date < b.day,
    'order', case when o.booking_id is null then null else jsonb_build_object(
      'items', o.items, 'allergies', o.allergies, 'comments', o.comments,
      'adults', o.adults, 'kids', o.kids, 'submitted_at', o.submitted_at) end)
  from public.fiesta_bookings b
  left join public.fiesta_orders o on o.booking_id = b.id
  where b.token = p_token and length(p_token) = 32
$$;
revoke all on function public.fiesta_booking(text) from public;
grant execute on function public.fiesta_booking(text) to anon, authenticated;

commit;
