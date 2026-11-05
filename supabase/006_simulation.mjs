// Simulates Supabase roles in PGlite, runs 001 → 004 → 005 → 006 (006 twice) and checks the group link.
// Usage: node supabase/006_simulation.mjs <repo>   (needs @electric-sql/pglite@0.2.17 installed nearby)
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
  insert into public.selected_menu values (1, '[]');
  insert into public.settings values (1, '{}', null);
`);
await db.exec(sql('001_hardening_nonbreaking.sql'));
await db.exec(sql('004_owner_rls_revoke_anon.sql'));
await db.exec(sql('005_fiestas_pedidos.sql'));

async function as(role, uid, q, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return await db.query(q, params); } finally { await db.exec('reset role'); }
}
async function expect(label, fn, ok) {
  let r, err;
  try { r = await fn(); } catch (e) { err = e; }
  const pass = ok(r, err);
  if (!pass) fails++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${err ? `  [${err.message}]` : ''}`);
  return r;
}
const denied = (r, e) => !!e && /permission denied/.test(e.message);
const errMatch = re => (r, e) => !!e && re.test(e.message);

// A booking created before 006 must get a share_token when 006 runs.
const future = "(now() at time zone 'Europe/Madrid')::date + 20";
await as('authenticated', OWNER, `insert into public.fiesta_bookings (day,name,adults,kids) values (${future},'Mesa grande',12,3)`);
await as('authenticated', OWNER, `insert into public.fiesta_bookings (day,name,adults) values (${future},'Otra mesa',2)`);
await db.exec(sql('006_fiestas_grupo.sql'));
await db.exec(sql('006_fiestas_grupo.sql')); // idempotent
const { token, share_token } = (await db.query(`select token, share_token from public.fiesta_bookings where name='Mesa grande'`)).rows[0];
const other = (await db.query(`select token, share_token from public.fiesta_bookings where name='Otra mesa'`)).rows[0];

await expect('existing bookings got distinct share tokens', async () => db.query('select count(distinct share_token) n from public.fiesta_bookings'),
  (r, e) => !e && Number(r.rows[0].n) === 2 && share_token.length === 32 && share_token !== token);
await expect('anon cannot select shares', () => as('anon', null, 'select * from public.fiesta_shares'), denied);

const grp = (sh, id = null, key = null) => as('anon', null, 'select public.fiesta_group($1,$2,$3) j', [sh, id, key]);
await expect('companion reads group basics (no phone, nobody else\'s picks)', () => grp(share_token),
  (r, e) => !e && r.rows[0].j.host === 'Mesa grande' && r.rows[0].j.adults === 12 && r.rows[0].j.mine === null && !('phone' in r.rows[0].j) && !('shares' in r.rows[0].j));
await expect('host token is not a share token', () => grp(token), (r, e) => !e && r.rows[0].j === null);

const items3 = { adult: { primero: { sopa25: 2, carp25: 1 }, segundo: { pula25: 3 }, postre: { bola25: 3 } } };
const sub = (sh, id, key, name, a, k, items, notes = '') => as('anon', null,
  'select public.fiesta_group_submit($1,$2,$3,$4,$5,$6,$7,$8) j', [sh, id, key, name, a, k, JSON.stringify(items), notes]);
const s1 = await expect('companion submits for 3 adults', () => sub(share_token, null, null, 'Família Roca', 3, 0, items3, 'Sin cebolla'),
  (r, e) => !e && r.rows[0].j.id && r.rows[0].j.key.length === 32);
const { id: id1, key: key1 } = s1.rows[0].j;
const kidItems = { adult: { primero: { cast25: 1 }, segundo: { riso25: 1 }, postre: { sorm: 1 } }, kid: { primero: { kmac: 2 }, segundo: { kesc: 2 }, postre: { khel: 2 } } };
await expect('second companion submits 1 adult + 2 kids', () => sub(share_token, null, null, 'Marc', 1, 2, kidItems), (r, e) => !e);

await expect('companion sees own submission with id+key, and others\' totals', () => grp(share_token, id1, key1),
  (r, e) => !e && r.rows[0].j.mine.name === 'Família Roca' && r.rows[0].j.taken_adults === 1 && r.rows[0].j.taken_kids === 2);
await expect('wrong key does not reveal the submission', () => grp(share_token, id1, 'f'.repeat(32)),
  (r, e) => !e && r.rows[0].j.mine === null);
await expect('companion updates own submission', () => sub(share_token, id1, key1, 'Família Roca', 2, 0,
  { adult: { primero: { sopa25: 2 }, segundo: { pula25: 2 }, postre: { bola25: 2 } } }), (r, e) => !e && r.rows[0].j.id === id1);
await expect('cannot update with a wrong key', () => sub(share_token, id1, 'f'.repeat(32), 'X', 1, 0,
  { adult: { primero: { a: 1 }, segundo: { b: 1 }, postre: { c: 1 } } }), errMatch(/not found/));
await expect('cannot write into another booking with a foreign share token', () => sub(other.share_token, id1, key1, 'X', 1, 0,
  { adult: { primero: { a: 1 }, segundo: { b: 1 }, postre: { c: 1 } } }), errMatch(/not found/));

const badSub = (label, a, k, items, name = 'Ana') => expect(`rejects ${label}`, () => sub(share_token, null, null, name, a, k, items), errMatch(/invalid order/));
await badSub('counts not matching people', 2, 0, items3);
await badSub('zero people', 0, 0, {});
await badSub('more adults than the booking', 13, 0, { adult: { primero: { a: 13 }, segundo: { b: 13 }, postre: { c: 13 } } });
await badSub('empty name', 1, 0, { adult: { primero: { a: 1 }, segundo: { b: 1 }, postre: { c: 1 } } }, '  ');
await badSub('kid picks without kids', 1, 0, { adult: { primero: { a: 1 }, segundo: { b: 1 }, postre: { c: 1 } }, kid: { primero: { k: 1 } } });

const host = await expect('host read lists companions and share token', () => as('anon', null, 'select public.fiesta_booking($1) j', [token]),
  (r, e) => !e && r.rows[0].j.share_token === share_token && r.rows[0].j.shares.length === 2 && r.rows[0].j.shares[0].name === 'Família Roca'
    && r.rows[0].j.shares[0].adults === 2 && !('edit_key' in r.rows[0].j.shares[0]));
await expect('host still submits the table order (005 RPC unchanged)', () => as('anon', null, 'select public.fiesta_submit($1,$2,$3,$4) j',
  [token, JSON.stringify({ adult: { primero: { sopa25: 12 }, segundo: { pula25: 12 }, postre: { bola25: 12 } }, kid: { primero: { kmac: 3 }, segundo: { kesc: 3 }, postre: { khel: 3 } } }), '', '']),
  (r, e) => !e && r.rows[0].j.order && r.rows[0].j.shares.length === 2);

await expect('owner reads shares', () => as('authenticated', OWNER, 'select name from public.fiesta_shares'), (r, e) => !e && r.rows.length === 2);
await expect('intruder reads no shares', () => as('authenticated', INTRUDER, 'select name from public.fiesta_shares'), (r, e) => !e && r.rows.length === 0);
await expect('anon cannot read edit keys through any table', () => as('anon', null, 'select edit_key from public.fiesta_shares'), denied);

await expect('companion deletes own submission', () => as('anon', null, 'select public.fiesta_group_delete($1,$2,$3) j', [share_token, id1, key1]),
  (r, e) => !e && r.rows[0].j === true);
await expect('delete with wrong key does nothing', async () => {
  const id2 = (await db.query(`select id from public.fiesta_shares limit 1`)).rows[0].id;
  return as('anon', null, 'select public.fiesta_group_delete($1,$2,$3) j', [share_token, id2, 'f'.repeat(32)]); },
  (r, e) => !e && r.rows[0].j === false);

await expect('locked booking rejects companion submit', async () => {
  await as('authenticated', OWNER, `update public.fiesta_bookings set locked = true where token = '${token}'`);
  return sub(share_token, null, null, 'Tarde', 1, 0, { adult: { primero: { a: 1 }, segundo: { b: 1 }, postre: { c: 1 } } }); }, errMatch(/closed/));
await expect('group read shows open=false when locked', () => grp(share_token), (r, e) => !e && r.rows[0].j.open === false);
await expect('deleting the booking deletes its shares', async () => {
  await as('authenticated', OWNER, `delete from public.fiesta_bookings where token = '${token}'`);
  return db.query('select count(*) n from public.fiesta_shares'); }, (r, e) => !e && Number(r.rows[0].n) === 0);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
