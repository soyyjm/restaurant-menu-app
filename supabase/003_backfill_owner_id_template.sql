-- 003_backfill_owner_id_template.sql
-- Run BEFORE 002. Replace the email below with the account you will use to sign in.
-- This script is idempotent and can be re-run safely.

begin;

-- Ensure owner_id columns exist before backfill.
alter table public.dishes add column if not exists owner_id uuid;
alter table public.selected_menu add column if not exists owner_id uuid;
alter table public.menu_history add column if not exists owner_id uuid;
alter table public.settings add column if not exists owner_id uuid;

do $$
declare
  v_email text := 'soyyjm@gmail.com';
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    raise exception 'No auth.users row found for email: %', v_email;
  end if;

  update public.dishes set owner_id = v_user_id where owner_id is null;
  update public.selected_menu set owner_id = v_user_id where owner_id is null;
  update public.menu_history set owner_id = v_user_id where owner_id is null;
  update public.settings set owner_id = v_user_id where owner_id is null;
end $$;

commit;
