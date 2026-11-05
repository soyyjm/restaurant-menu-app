// Simulates Supabase roles in PGlite, runs 004 then 005 (twice), and checks guest/staff access.
// Usage: node supabase/005_simulation.mjs <repo>   (needs @electric-sql/pglite@0.2.17 installed nearby)
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
await db.exec(sql('005_fiestas_pedidos.sql')); // idempotent

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
const okRows = n => (r, e) => !e && r.rows.length === n;
const errMatch = re => (r, e) => !!e && re.test(e.message);
const ok = (r, e) => !e;

const future = "(now() at time zone 'Europe/Madrid')::date + 20";
const ins = await expect('owner inserts a booking (owner_id from trigger)',
  () => as('authenticated', OWNER, `insert into public.fiesta_bookings (day,name,phone,adults,kids,table_no)
     values (${future},'Familia Puig','612345678',3,2,'7') returning id, token, owner_id`),
  (r, e) => !e && r.rows[0].owner_id === OWNER && r.rows[0].token.length === 32);
const { id, token } = ins.rows[0];
await as('authenticated', OWNER, `insert into public.fiesta_bookings (day,name,adults) values (current_date,'Hoy',2)`);
await as('authenticated', OWNER, `insert into public.fiesta_bookings (day,name,adults,locked) values (${future},'Cerrada',2,true)`);
const today = (await db.query(`select token from public.fiesta_bookings where name='Hoy'`)).rows[0].token;
const lockedTok = (await db.query(`select token from public.fiesta_bookings where name='Cerrada'`)).rows[0].token;

await expect('anon cannot select bookings', () => as('anon', null, 'select * from public.fiesta_bookings'), denied);
await expect('anon cannot select orders', () => as('anon', null, 'select * from public.fiesta_orders'), denied);
await expect('anon cannot insert orders', () => as('anon', null,
  `insert into public.fiesta_orders (booking_id, owner_id, items, adults, kids) values ('${id}','${OWNER}','{}',1,0)`), denied);
await expect('intruder sees no bookings', () => as('authenticated', INTRUDER, 'select * from public.fiesta_bookings'), okRows(0));
await expect('intruder cannot update bookings', () => as('authenticated', INTRUDER,
  `update public.fiesta_bookings set name='x' where id='${id}'`), (r, e) => !e && r.affectedRows === 0);

const read = await expect('anon reads booking by token', () => as('anon', null, 'select public.fiesta_booking($1) j', [token]),
  (r, e) => !e && r.rows[0].j.name === 'Familia Puig' && r.rows[0].j.open === true && r.rows[0].j.order === null && !('phone' in r.rows[0].j));
await expect('wrong token returns null', () => as('anon', null, 'select public.fiesta_booking($1) j', ['0'.repeat(32)]),
  (r, e) => !e && r.rows[0].j === null);

const good = {
  adult: { primero: { sopa25: 2, cast25: 1 }, segundo: { pula25: 3 }, postre: { bola25: 1, ques25: 1, sorm: 1 } },
  kid: { primero: { k_mac: 2 }, segundo: { k_poll: 1, k_merl: 1 }, postre: { k_hel: 2 } }
};
const submit = (tok, items, a = 'Sin gluten (1 niño)', c = '') =>
  as('anon', null, 'select public.fiesta_submit($1,$2,$3,$4) j', [tok, JSON.stringify(items), a, c]);

await expect('valid order is saved', () => submit(token, good),
  (r, e) => !e && r.rows[0].j.order.items.adult.segundo.pula25 === 3 && r.rows[0].j.order.allergies === 'Sin gluten (1 niño)');
await expect('resubmit updates (submit_count 2)', async () => { await submit(token, good, ''); return as('authenticated', OWNER,
  `select submit_count, allergies from public.fiesta_orders where booking_id='${id}'`); },
  (r, e) => !e && r.rows[0].submit_count === 2 && r.rows[0].allergies === null);

const bad = (label, items) => expect(`rejects ${label}`, () => submit(token, items), errMatch(/invalid order/));
await bad('wrong adult total', { ...good, adult: { ...good.adult, segundo: { pula25: 2 } } });
await bad('missing kid group', { adult: good.adult });
await bad('missing course', { ...good, adult: { primero: good.adult.primero, segundo: good.adult.segundo } });
await bad('extra course', { ...good, adult: { ...good.adult, extra: { a: 3 } } });
await bad('negative count', { ...good, adult: { ...good.adult, segundo: { pula25: 4, pato25: -1 } } });
await bad('fractional count', { ...good, adult: { ...good.adult, segundo: { pula25: 2.5, pato25: 0.5 } } });
await bad('string count', { ...good, adult: { ...good.adult, segundo: { pula25: '3' } } });
await bad('unknown group', { ...good, staff: {} });
await bad('long key', { ...good, adult: { ...good.adult, segundo: { ['x'.repeat(41)]: 3 } } });
await expect('rejects unknown token', () => submit('f'.repeat(32), good), errMatch(/not found/));
await expect('rejects booking for today', () => submit(today, { adult: { primero: { a: 2 }, segundo: { b: 2 }, postre: { c: 2 } } }), errMatch(/closed/));
await expect('rejects locked booking', () => submit(lockedTok, { adult: { primero: { a: 2 }, segundo: { b: 2 }, postre: { c: 2 } } }), errMatch(/closed/));
await expect('rejects 1001-char allergies', () => submit(token, good, 'x'.repeat(1001)), errMatch(/too long/));

await expect('owner reads the order', () => as('authenticated', OWNER, 'select * from public.fiesta_orders'), okRows(1));
await expect('intruder reads no orders', () => as('authenticated', INTRUDER, 'select * from public.fiesta_orders'), okRows(0));
await expect('anon cannot call the check helper', () => as('anon', null, `select public.fiesta_check_group('{}', 0)`), denied);
await expect('guest can pick the "otro" line', () => submit(token, { ...good, adult: { ...good.adult, primero: { sopa25: 2, otro: 1 } } }, 'La abuela no toma primero'),
  (r, e) => !e && r.rows[0].j.order.items.adult.primero.otro === 1);
await expect('owner upserts a staff-adjusted order (half, none, off-menu)', () => as('authenticated', OWNER,
  `insert into public.fiesta_orders (booking_id, owner_id, items, adults, kids) values ($1, $2, $3, 3, 2)
   on conflict (booking_id) do update set items = excluded.items returning items`,
  [id, OWNER, JSON.stringify({ ...good, staff_at: '2026-12-01T10:00:00Z', adult: { ...good.adult, primero: { sopa25: 2, none: 1 }, segundo: { 'pula25~h': 1, pula25: 1, 'x~Verduras a la brasa': 1 } } })]),
  (r, e) => !e && r.rows[0].items.adult.primero.none === 1);
await expect('intruder cannot upsert into owner order', () => as('authenticated', INTRUDER,
  `insert into public.fiesta_orders (booking_id, owner_id, items, adults, kids) values ($1, $2, '{}', 3, 2)
   on conflict (booking_id) do update set items = excluded.items`, [id, INTRUDER]), (r, e) => !!e);
await expect('guest sees staff lines (summary) via token', () => as('anon', null, 'select public.fiesta_booking($1) j', [token]),
  (r, e) => !e && r.rows[0].j.order.items.staff_at && r.rows[0].j.order.items.adult.segundo['x~Verduras a la brasa'] === 1);
await expect('owner can lock; guest sees open=false', async () => {
  await as('authenticated', OWNER, `update public.fiesta_bookings set locked=true where id='${id}'`);
  return as('anon', null, 'select public.fiesta_booking($1) j', [token]); },
  (r, e) => !e && r.rows[0].j.open === false && r.rows[0].j.order !== null);
await expect('deleting a booking deletes its order', async () => {
  await as('authenticated', OWNER, `delete from public.fiesta_bookings where id='${id}'`);
  return as('authenticated', OWNER, 'select * from public.fiesta_orders'); }, okRows(0));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
