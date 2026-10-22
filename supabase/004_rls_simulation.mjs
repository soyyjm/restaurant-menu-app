// Simulates the Supabase roles/auth setup in PGlite and runs 001 -> 004 -> checks -> rollback -> 004.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const repo = process.argv[2];
const sql = f => readFileSync(`${repo}/supabase/${f}`, 'utf8');
const db = new PGlite();
const OWNER = '11111111-1111-1111-1111-111111111111';
const INTRUDER = '22222222-2222-2222-2222-222222222222';
let fails = 0;

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  insert into auth.users values ('${OWNER}','soyyjm@gmail.com'), ('${INTRUDER}','x@example.com');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  create table public.dishes (id text primary key, name text, category text);
  create table public.selected_menu (id int primary key, dishes jsonb);
  create table public.menu_history (id serial primary key, date date, dishes jsonb);
  create table public.settings (id int primary key, print_settings jsonb, gemini_api_key text);
  create table public.menus_cerrados (id uuid default gen_random_uuid() primary key, name text not null,
    sections jsonb not null default '[]', updated_at timestamptz default now());
  insert into public.dishes values ('d1','Paella','arroz'), ('d2','Flan','postre');
  insert into public.selected_menu values (1, '[]');
  insert into public.settings values (1, '{"geminiModel":"x"}', 'FAKE-NOT-A-KEY');
  insert into public.menus_cerrados (name) values ('Grupo A'), ('Grupo B');
`);
await db.exec(sql('001_hardening_nonbreaking.sql'));

async function as(role, uid, q, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return await db.query(q, params); } finally { await db.exec('reset role'); }
}
async function expect(label, fn, ok) {
  let r, err;
  try { r = await fn(); } catch (e) { err = e; }
  const pass = ok(r, err);
  if (!pass) fails++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${err ? `  [${err.message}]` : r ? `  [rows=${r.rows?.length ?? ''} affected=${r.affectedRows ?? ''}]` : ''}`);
}
const denied = (r, e) => !!e && /permission denied/.test(e.message);
const okRows = n => (r, e) => !e && r.rows.length === n;
const okAffected = n => (r, e) => !e && r.affectedRows === n;
const fails_ = (r, e) => !!e;

const tables = ['dishes', 'selected_menu', 'menu_history', 'settings', 'menus_cerrados'];

// Before: reproduce the reported hole.
await expect('before 004: anon reads settings', () => as('anon', null, 'select * from settings'), okRows(1));

await db.exec(sql('004_owner_rls_revoke_anon.sql'));
await db.exec(sql('004_owner_rls_revoke_anon.sql')); // idempotent re-run

async function checks(tag) {
  for (const t of tables) {
    await expect(`${tag} anon select ${t}`, () => as('anon', null, `select * from ${t}`), denied);
  }
  await expect(`${tag} anon insert dishes`, () => as('anon', null, `insert into dishes (id,name) values ('x','x')`), denied);
  await expect(`${tag} anon delete menus_cerrados`, () => as('anon', null, `delete from menus_cerrados`), denied);

  // Owner: the app's real calls (index.html loadAll / save loop / menus cerrados).
  await expect(`${tag} owner reads dishes`, () => as('authenticated', OWNER, `select * from dishes where owner_id = $1`, [OWNER]), okRows(2));
  await expect(`${tag} owner reads menus_cerrados`, () => as('authenticated', OWNER, `select * from menus_cerrados order by updated_at desc`), (r, e) => !e && r.rows.length >= 2);
  await expect(`${tag} owner upsert dishes`, () => as('authenticated', OWNER,
    `insert into dishes (id,name,owner_id) values ('d1','Paella valenciana',$1),('d3','Gazpacho',$1)
     on conflict (id) do update set name = excluded.name, owner_id = excluded.owner_id`, [OWNER]), okAffected(2));
  await expect(`${tag} owner delete dish`, () => as('authenticated', OWNER, `delete from dishes where id='d3' and owner_id=$1`, [OWNER]), okAffected(1));
  await expect(`${tag} owner upsert settings`, () => as('authenticated', OWNER,
    `insert into settings (id, print_settings, owner_id) values (1,'{"a":1}',$1)
     on conflict (id) do update set print_settings = excluded.print_settings, owner_id = excluded.owner_id`, [OWNER]), okAffected(1));
  await expect(`${tag} owner upsert selected_menu`, () => as('authenticated', OWNER,
    `insert into selected_menu (id, dishes, owner_id) values (1,'[1]',$1)
     on conflict (id) do update set dishes = excluded.dishes, owner_id = excluded.owner_id`, [OWNER]), okAffected(1));
  await expect(`${tag} owner upsert menu_history (date)`, () => as('authenticated', OWNER,
    `insert into menu_history (date, dishes, owner_id) values ('2026-10-22','[]',$1)
     on conflict (date) do update set dishes = excluded.dishes`, [OWNER]), okAffected(1));
  await expect(`${tag} owner insert menus_cerrados without owner_id`, () => as('authenticated', OWNER,
    `insert into menus_cerrados (name) values ('Nuevo') returning owner_id`), (r, e) => !e && r.rows[0].owner_id === OWNER);
  await expect(`${tag} owner insert menus_cerrados owner_id null`, () => as('authenticated', OWNER,
    `insert into menus_cerrados (name, owner_id) values ('Restaurado', null) returning owner_id`), (r, e) => !e && r.rows[0].owner_id === OWNER);
  await expect(`${tag} owner update menus_cerrados`, () => as('authenticated', OWNER,
    `update menus_cerrados set name = name || '!' where name = 'Nuevo' returning *`), okRows(1));
  await expect(`${tag} owner delete menus_cerrados`, () => as('authenticated', OWNER,
    `delete from menus_cerrados where name in ('Nuevo!','Restaurado')`), okAffected(2));

  // Another signed-up account sees and changes nothing of the owner's.
  for (const t of tables) {
    await expect(`${tag} intruder select ${t}`, () => as('authenticated', INTRUDER, `select * from ${t}`), okRows(0));
  }
  await expect(`${tag} intruder update dishes`, () => as('authenticated', INTRUDER, `update dishes set name='hack'`), okAffected(0));
  await expect(`${tag} intruder delete menus_cerrados`, () => as('authenticated', INTRUDER, `delete from menus_cerrados`), okAffected(0));
  await expect(`${tag} intruder upsert settings id=1`, () => as('authenticated', INTRUDER,
    `insert into settings (id, print_settings) values (1,'{}') on conflict (id) do update set print_settings = excluded.print_settings`), fails_);
  await expect(`${tag} intruder insert as owner`, () => as('authenticated', INTRUDER,
    `insert into menus_cerrados (name, owner_id) values ('x', '${OWNER}')`), fails_);
  await expect(`${tag} intruder steals row (owner_id change)`, () => as('authenticated', OWNER,
    `update dishes set owner_id = '${INTRUDER}' where id='d1'`), fails_);
}

await checks('[004]');
await expect('gemini_api_key column dropped', () => db.query(
  `select 1 from information_schema.columns where table_name='settings' and column_name='gemini_api_key'`), okRows(0));

await db.exec(sql('004_owner_rls_revoke_anon_rollback.sql'));
await expect('[rollback] anon still denied', () => as('anon', null, 'select * from dishes'), denied);
await expect('[rollback] owner reads dishes', () => as('authenticated', OWNER, 'select * from dishes'), okRows(2));
await expect('[rollback] owner inserts menus_cerrados', () => as('authenticated', OWNER,
  `insert into menus_cerrados (name) values ('tras rollback')`), okAffected(1));

await db.exec(sql('004_owner_rls_revoke_anon.sql'));
await checks('[re-004]');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
