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

- `004_owner_rls_revoke_anon.sql` (+ `_rollback.sql`, `004_probe.sh`, `004_TEST_NOTES.md`)
  - Supersedes 002 + 003: owner-only RLS on all five tables incl. `menus_cerrados`, revokes anon, drops `settings.gemini_api_key`.
  - Use this instead of the order below. Steps and checks in `004_TEST_NOTES.md`.

## Recommended order (historical; superseded by 004)
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
