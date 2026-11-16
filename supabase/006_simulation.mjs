// Simulates Supabase roles in PGlite, runs 001 → 004 → 005 → 006 (006 twice) and checks group menus.
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
await db.exec(sql('006_grupos.sql'));
await db.exec(sql('006_grupos.sql')); // idempotent

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

// The example booking: Menú Degustación, 24 people, pica-pica shared, two choose_one courses.
const menu = { name: 'Menú Degustación', price: 27, sections: [
  { id: 'pica', title: 'Pica pica', mode: 'shared', dishes: [{ id: 'nachos', name: 'Nachos Sol' }] },
  { id: 'p1', title: 'Primer plato', mode: 'choose_one', dishes: ['ensal', 'canel', 'huevos', 'fritura', 'pulpo'].map(id => ({ id, name: id })) },
  { id: 'p2', title: 'Segundo plato', mode: 'choose_one', dishes: ['bacalao', 'cabrito', 'paella', 'lomo', 'chuleton'].map(id => ({ id, name: id })) }
] };
const future = "(now() at time zone 'Europe/Madrid')::date + 10";
const ins = await expect('owner creates a group event (owner from trigger)', () => as('authenticated', OWNER,
  `insert into public.grupo_eventos (date, time, title, organizer, pax, menu) values (${future}, '15:00', 'Comida Ana', 'Ana', 24, $1)
   returning id, token, share_token, owner_id`, [JSON.stringify(menu)]),
  (r, e) => !e && r.rows[0].owner_id === OWNER && r.rows[0].token.length === 32 && r.rows[0].share_token !== r.rows[0].token);
const { id: evId, token, share_token: share } = ins.rows[0];
const other = (await as('authenticated', OWNER, `insert into public.grupo_eventos (date, title, pax, menu) values (${future}, 'Otro', 2, $1) returning token, share_token`, [JSON.stringify(menu)])).rows[0];

await expect('anon cannot select events', () => as('anon', null, 'select * from public.grupo_eventos'), denied);
await expect('anon cannot select people', () => as('anon', null, 'select * from public.grupo_personas'), denied);
await expect('intruder sees no events', () => as('authenticated', INTRUDER, 'select * from public.grupo_eventos'), (r, e) => !e && r.rows.length === 0);
await expect('anon cannot call helpers', () => as('anon', null, `select public.grupo_check_picks('{}', '{}')`), denied);

const shareRead = (sh, id = null, key = null) => as('anon', null, 'select public.grupo_share($1,$2,$3) j', [sh, id, key]);
await expect('group link reads menu and progress, no phone/email/token', () => shareRead(share),
  (r, e) => !e && r.rows[0].j.pax === 24 && r.rows[0].j.taken === 0 && r.rows[0].j.open === true && !('phone' in r.rows[0].j) && !('token' in r.rows[0].j) && !('personas' in r.rows[0].j));
await expect('organizer token is not a group token', () => shareRead(token), (r, e) => !e && r.rows[0].j === null);

const save = (tk, id, key, name, picks, notes = '') => as('anon', null, 'select public.grupo_persona_save($1,$2,$3,$4,$5,$6) j', [tk, id, key, name, JSON.stringify(picks), notes]);
const p1 = await expect('diner saves own picks through the group link', () => save(share, null, null, 'Marta', { p1: 'canel', p2: 'paella' }, 'Sin marisco no, gracias'),
  (r, e) => !e && r.rows[0].j.key.length === 32);
const { id: martaId, key: martaKey } = p1.rows[0].j;
await expect('diner reads own row back with id + key', () => shareRead(share, martaId, martaKey), (r, e) => !e && r.rows[0].j.mine.name === 'Marta' && r.rows[0].j.taken === 1);
await expect('wrong key does not show the row', () => shareRead(share, martaId, 'f'.repeat(32)), (r, e) => !e && r.rows[0].j.mine === null);
await expect('diner edits own row', () => save(share, martaId, martaKey, 'Marta', { p1: 'pulpo', p2: 'paella' }), (r, e) => !e);
await expect('diner cannot edit with a wrong key', () => save(share, martaId, 'f'.repeat(32), 'X', { p1: 'pulpo', p2: 'paella' }), errMatch(/not found/));
await expect('other event\'s group link cannot touch this row', () => save(other.share_token, martaId, martaKey, 'X', { p1: 'pulpo', p2: 'paella' }), errMatch(/not found/));

const bad = (label, picks, name = 'Ana') => expect(`rejects ${label}`, () => save(share, null, null, name, picks), errMatch(/invalid/));
await bad('missing course', { p1: 'canel' });
await bad('dish from another course', { p1: 'paella', p2: 'paella' });
await bad('shared section as a pick', { p1: 'canel', p2: 'paella', pica: 'nachos' });
await bad('unknown dish', { p1: 'canel', p2: 'sushi' });
await bad('empty name', { p1: 'canel', p2: 'paella' }, '   ');

const org = () => as('anon', null, 'select public.grupo_org($1) j', [token]);
await expect('organizer sees everyone with names', () => org(),
  (r, e) => !e && r.rows[0].j.personas.length === 1 && r.rows[0].j.personas[0].picks.p1 === 'pulpo' && !('edit_key' in r.rows[0].j.personas[0]) && r.rows[0].j.share_token === share);
await expect('organizer adds a person without a key', () => save(token, null, null, 'Jordi', { p1: 'ensal', p2: 'lomo' }), (r, e) => !e);
await expect('organizer edits Marta without her key', () => save(token, martaId, null, 'Marta R.', { p1: 'pulpo', p2: 'bacalao' }), (r, e) => !e);
await expect('row added by organizer is marked so', () => org(), (r, e) => !e && r.rows[0].j.personas.find(p => p.name === 'Jordi').added_by === 'organizer');

const counts = (c, notes = '') => as('anon', null, 'select public.grupo_org_counts($1,$2,$3) j', [token, JSON.stringify(c), notes]);
await expect('organizer saves counts for the other 22', () => counts({ p1: { ensal: 6, canel: 6, huevos: 5, fritura: 5 }, p2: { bacalao: 10, paella: 12 } }, 'Uno celíaco'),
  (r, e) => !e && r.rows[0].j.counts.p2.paella === 12 && r.rows[0].j.counts_notes === 'Uno celíaco');
await expect('group is now full: a new diner is refused', () => save(share, null, null, 'Tarde', { p1: 'canel', p2: 'paella' }), errMatch(/full/));
await expect('counts beyond pax are refused', () => counts({ p1: { ensal: 23 } }), errMatch(/full/));
await expect('counts with a dish of another course are refused', () => counts({ p1: { paella: 2 } }), errMatch(/invalid/));
await expect('counts for a shared section are refused', () => counts({ pica: { nachos: 2 } }), errMatch(/invalid/));
await expect('counts with zero/negative are refused', () => counts({ p1: { canel: 0 } }), errMatch(/invalid/));
await expect('organizer token cannot save counts on another event', async () => as('anon', null, 'select public.grupo_org_counts($1,$2,$3) j', [other.share_token, '{}', '']), errMatch(/not found/));

await expect('diner deletes own row', () => as('anon', null, 'select public.grupo_persona_delete($1,$2,$3) j', [share, martaId, martaKey]), (r, e) => !e && r.rows[0].j === true);
await expect('owner reads people, intruder none', async () => {
  const a = await as('authenticated', OWNER, 'select name from public.grupo_personas');
  const b = await as('authenticated', INTRUDER, 'select name from public.grupo_personas');
  return { rows: [a.rows.length, b.rows.length] }; }, (r, e) => !e && r.rows[0] === 1 && r.rows[1] === 0);
await expect('staff can add a row directly (RLS, owner)', () => as('authenticated', OWNER,
  `insert into public.grupo_personas (evento_id, owner_id, name, picks, added_by) values ($1, $2, 'Pep', '{"p1":"canel","p2":"lomo"}', 'staff')`, [evId, OWNER]), (r, e) => !e);
await expect('intruder cannot add a row to the owner event', () => as('authenticated', INTRUDER,
  `insert into public.grupo_personas (evento_id, owner_id, name, picks) values ($1, $2, 'X', '{}')`, [evId, INTRUDER]), (r, e) => !!e && /row-level security/.test(e.message));

await expect('locked event refuses diners and counts', async () => {
  await as('authenticated', OWNER, `update public.grupo_eventos set locked = true where id = '${evId}'`);
  return save(share, null, null, 'Late', { p1: 'canel', p2: 'paella' }); }, errMatch(/closed/));
await expect('past deadline closes the group link', async () => {
  await as('authenticated', OWNER, `update public.grupo_eventos set locked = false, deadline = (now() at time zone 'Europe/Madrid')::date - 1 where id = '${evId}'`);
  return shareRead(share); }, (r, e) => !e && r.rows[0].j.open === false);
await expect('deleting the event deletes its people', async () => {
  await as('authenticated', OWNER, `delete from public.grupo_eventos where id = '${evId}'`);
  return db.query(`select count(*) n from public.grupo_personas where evento_id = '${evId}'`); }, (r, e) => !e && Number(r.rows[0].n) === 0);

const bk = (await as('authenticated', OWNER, `insert into public.fiesta_bookings (day, name, adults) values (${future}, 'Fam', 2) returning id`)).rows[0].id;
await expect('intruder cannot attach an order to the owner booking (005 hardening)', () => as('authenticated', INTRUDER,
  `insert into public.fiesta_orders (booking_id, owner_id, items, adults, kids) values ($1, $2, '{}', 2, 0)`, [bk, INTRUDER]), (r, e) => !!e && /row-level security/.test(e.message));
await expect('owner can still write own orders', () => as('authenticated', OWNER,
  `insert into public.fiesta_orders (booking_id, owner_id, items, adults, kids) values ($1, $2, '{}', 2, 0)`, [bk, OWNER]), (r, e) => !e);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
