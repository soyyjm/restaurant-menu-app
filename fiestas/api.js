// Data layer for the festive pre-order pages.
// Real mode: Supabase (tables + RPCs from supabase/005_fiestas_pedidos.sql).
// Demo mode (?demo in the URL): everything lives in this browser's localStorage, so the
// whole flow (staff → link → guest order → kitchen totals) can be tried without the database.
(function () {
  const SUPABASE_URL = 'https://nkteqmgslcrqiglzcsyv.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rdGVxbWdzbGNycWlnbHpjc3l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwMzE4NzMsImV4cCI6MjA3MTYwNzg3M30.XmyXU4LAUYorfwsXjEEjHQsOHDWGa3gESxu2xq3XPm0';
  const DEMO = new URLSearchParams(location.search).has('demo');

  // Errors carry a short code the pages translate: not_found | closed | invalid | network | auth
  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
  const codeFrom = msg => /not found/.test(msg) ? 'not_found' : /closed/.test(msg) ? 'closed'
    : /invalid|too long/.test(msg) ? 'invalid' : /JWT|auth|permission/i.test(msg) ? 'auth' : 'network';

  // ---------- guest (anon, token only) ----------
  async function rpc(fn, body) {
    let r;
    try {
      r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch { throw fail('network'); }
    const data = await r.json().catch(() => null);
    if (!r.ok) throw fail(codeFrom((data && data.message) || ''), data && data.message);
    return data;
  }

  // ---------- demo store ----------
  const KEY = 'fiestas-demo-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const madridToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  function store() {
    let s = load();
    if (!s) { s = seedDemo(); save(s); }
    return s;
  }
  function seedDemo() {
    const F = window.FIESTAS, s = { bookings: [], orders: {} };
    const fam = [['Familia Puig', 4, 2, '1'], ['Marta Soler', 2, 0, '2'], ['Familia Ferrer', 6, 3, '3'], ['Jordi Vidal', 3, 0, '4'],
      ['Familia Roca', 4, 1, '5'], ['Laura Martí', 2, 0, '6'], ['Familia Serra', 5, 2, '7'], ['Pere Costa', 8, 0, '8']];
    const pick = (list, n, seed) => { const o = {}; for (let i = 0; i < n; i++) { const k = list[(i * 7 + seed) % list.length].key; o[k] = (o[k] || 0) + 1; } return o; };
    const day = F.days[0];
    fam.forEach(([name, adults, kids, table], i) => {
      const b = { id: newToken(), day: day.date, name, phone: '6' + String(12345670 + i * 1111).slice(0, 8), adults, kids, table_no: table,
        notes: '', token: newToken(), locked: false, sent_at: i < 6 ? new Date().toISOString() : null, created_at: new Date().toISOString() };
      s.bookings.push(b);
      if (i < 5) {
        const g = (menu, n, seed) => n ? Object.fromEntries(F.courses.map((c, j) => [c.id, pick(menu[c.id], n, seed + j)])) : undefined;
        const items = { adult: g(day.menu, adults, i) };
        if (kids) items.kid = g(F.kids, kids, i + 1);
        s.orders[b.id] = { booking_id: b.id, items, allergies: i === 2 ? 'Un niño celíaco (sin gluten)' : null, comments: i === 0 ? 'Celebramos el cumpleaños de la abuela' : null,
          adults, kids, submit_count: 1, submitted_at: new Date(Date.now() - i * 3600e3).toISOString() };
      }
    });
    return s;
  }
  const isOpen = b => !b.locked && madridToday() < b.day;
  function guestView(s, b) {
    const o = s.orders[b.id];
    return { day: b.day, name: b.name, adults: b.adults, kids: b.kids, open: isOpen(b),
      order: o ? { items: o.items, allergies: o.allergies, comments: o.comments, adults: o.adults, kids: o.kids, submitted_at: o.submitted_at } : null };
  }
  function checkGroup(g, n) {
    if (!n) return !g || !Object.keys(g).length;
    if (!g || Object.keys(g).length !== 3) return false;
    return window.FIESTAS.courses.every(c => {
      const m = g[c.id]; if (!m || typeof m !== 'object') return false;
      let t = 0;
      for (const [k, v] of Object.entries(m)) { if (!k || k.length > 40 || !Number.isInteger(v) || v < 1 || v > n) return false; t += v; }
      return t === n;
    });
  }

  // ---------- public API ----------
  let sb = null;
  const client = () => sb || (sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY));
  const q = async p => { const { data, error } = await p; if (error) throw fail(codeFrom(error.message), error.message); return data; };

  window.FiestasAPI = {
    demo: DEMO,

    async getBooking(token) {
      if (!/^[0-9a-f]{32}$/.test(token || '')) throw fail('not_found');
      if (DEMO) { const s = store(), b = s.bookings.find(x => x.token === token); if (!b) throw fail('not_found'); return guestView(s, b); }
      const r = await rpc('fiesta_booking', { p_token: token });
      if (!r) throw fail('not_found');
      return r;
    },

    async submitOrder(token, items, allergies, comments) {
      if (DEMO) {
        const s = store(), b = s.bookings.find(x => x.token === token);
        if (!b) throw fail('not_found');
        if (!isOpen(b)) throw fail('closed');
        if (Object.keys(items).some(k => k !== 'adult' && k !== 'kid') || !checkGroup(items.adult, b.adults) || !checkGroup(items.kid, b.kids)) throw fail('invalid');
        const prev = s.orders[b.id];
        s.orders[b.id] = { booking_id: b.id, items, allergies: (allergies || '').trim() || null, comments: (comments || '').trim() || null,
          adults: b.adults, kids: b.kids, submit_count: prev ? prev.submit_count + 1 : 1, submitted_at: new Date().toISOString() };
        save(s); return guestView(s, b);
      }
      return rpc('fiesta_submit', { p_token: token, p_items: items, p_allergies: allergies || '', p_comments: comments || '' });
    },

    // ----- staff -----
    async session() {
      if (DEMO) return { email: 'demo' };
      const { data } = await client().auth.getSession();
      return data.session ? { email: data.session.user.email } : null;
    },
    async signIn(email, password) {
      const { error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw fail('auth', error.message);
    },
    async signOut() { if (!DEMO) await client().auth.signOut(); },

    // All bookings (all days) with their order attached as .order (or null).
    async listBookings() {
      if (DEMO) { const s = store(); return s.bookings.map(b => ({ ...b, order: s.orders[b.id] || null })); }
      const [bs, os] = await Promise.all([
        q(client().from('fiesta_bookings').select('*').order('created_at')),
        q(client().from('fiesta_orders').select('*'))
      ]);
      const byId = Object.fromEntries(os.map(o => [o.booking_id, o]));
      return bs.map(b => ({ ...b, order: byId[b.id] || null }));
    },

    async saveBooking(b) {
      const row = { day: b.day, name: b.name, phone: b.phone || null, adults: b.adults, kids: b.kids,
        table_no: b.table_no || null, notes: b.notes || null };
      if (DEMO) {
        const s = store();
        if (b.id) Object.assign(s.bookings.find(x => x.id === b.id), row);
        else s.bookings.push({ ...row, id: newToken(), token: newToken(), locked: false, sent_at: null, created_at: new Date().toISOString() });
        save(s); return;
      }
      if (b.id) await q(client().from('fiesta_bookings').update(row).eq('id', b.id));
      else await q(client().from('fiesta_bookings').insert(row));
    },
    async deleteBooking(id) {
      if (DEMO) { const s = store(); s.bookings = s.bookings.filter(x => x.id !== id); delete s.orders[id]; save(s); return; }
      await q(client().from('fiesta_bookings').delete().eq('id', id));
    },
    async markSent(id) {
      const at = new Date().toISOString();
      if (DEMO) { const s = store(); s.bookings.find(x => x.id === id).sent_at = at; save(s); return; }
      await q(client().from('fiesta_bookings').update({ sent_at: at }).eq('id', id));
    },
    async setLocked(day, locked) {
      if (DEMO) { const s = store(); s.bookings.filter(x => x.day === day).forEach(x => { x.locked = locked; }); save(s); return; }
      await q(client().from('fiesta_bookings').update({ locked }).eq('day', day));
    },
    resetDemo() { try { localStorage.removeItem(KEY); } catch {} }
  };
})();
