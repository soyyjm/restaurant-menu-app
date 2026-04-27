# Supabase Hardening

## Files
- `001_hardening_nonbreaking.sql`
  - Add indexes/constraints and enable baseline RLS without breaking current anonymous frontend behavior.
- `002_rls_strict_requires_auth.sql`
  - Enforce per-user isolation with `owner_id = auth.uid()` policies.
  - Requires Supabase Auth integration in frontend before use.
- `003_backfill_owner_id_template.sql`
  - Backfill existing rows to your signed-in user before enabling strict RLS.
  - Also creates `owner_id` columns automatically if they do not exist yet.

## Recommended order
1. Run `001_hardening_nonbreaking.sql` in Supabase SQL Editor.
2. Verify app still works (load/save dishes, menu, history, settings).
3. Integrate Auth in frontend and sign in once with your real account.
4. Edit and run `003_backfill_owner_id_template.sql` (set your email).
5. Run `002_rls_strict_requires_auth.sql`.

## Quick verification queries
```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('dishes','selected_menu','menu_history','settings');

select tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('dishes','selected_menu','menu_history','settings')
order by tablename, policyname;
```
