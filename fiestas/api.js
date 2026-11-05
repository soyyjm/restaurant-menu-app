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
    if (!s.shares) s.shares = [];
    let changed = false;
    for (const b of s.bookings) if (!b.share_token) { b.share_token = newToken(); changed = true; }
    if (changed) save(s);
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
    // Big table (Pere Costa, 8 adults): two companions have already answered through the group link.
    const big = s.bookings.find(x => x.name === 'Pere Costa');
    s.shares = [
      { name: 'Anna (família Costa)', adults: 3, seed: 0 }, { name: 'Jordi i Núria', adults: 2, seed: 2, notes: 'Núria no toma primer plato' }
    ].map((x, i) => ({ id: newToken(), booking_id: big.id, edit_key: newToken(), name: x.name, adults: x.adults, kids: 0,
      items: { adult: Object.fromEntries(F.courses.map((c, j) => [c.id, pick(day.menu[c.id], x.adults, x.seed + j)])) },
      notes: x.notes || null, created_at: new Date(Date.now() - (2 - i) * 3600e3).toISOString(), updated_at: new Date(Date.now() - (2 - i) * 3600e3).toISOString() }));
    return s;
  }
  const isOpen = b => !b.locked && madridToday() < b.day;
  function guestView(s, b) {
    const o = s.orders[b.id];
    return { day: b.day, name: b.name, adults: b.adults, kids: b.kids, open: isOpen(b), share_token: b.share_token,
      shares: s.shares.filter(x => x.booking_id === b.id).map(x => ({ id: x.id, name: x.name, adults: x.adults, kids: x.kids, items: x.items, notes: x.notes, updated_at: x.updated_at })),
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

    // ----- group link (companions of a big table) -----
    async getGroup(share, id, key) {
      if (!/^[0-9a-f]{32}$/.test(share || '')) throw fail('not_found');
      if (DEMO) {
        const s = store(), b = s.bookings.find(x => x.share_token === share); if (!b) throw fail('not_found');
        const others = s.shares.filter(x => x.booking_id === b.id && x.id !== id), mine = s.shares.find(x => x.booking_id === b.id && x.id === id && x.edit_key === key);
        return { day: b.day, host: b.name, adults: b.adults, kids: b.kids, open: isOpen(b),
          taken_adults: others.reduce((a, x) => a + x.adults, 0), taken_kids: others.reduce((a, x) => a + x.kids, 0),
          mine: mine ? { id: mine.id, name: mine.name, adults: mine.adults, kids: mine.kids, items: mine.items, notes: mine.notes, updated_at: mine.updated_at } : null };
      }
      const r = await rpc('fiesta_group', { p_share: share, p_id: id || null, p_key: key || null });
      if (!r) throw fail('not_found');
      return r;
    },
    async submitGroup(share, id, key, name, adults, kids, items, notes) {
      if (DEMO) {
        const s = store(), b = s.bookings.find(x => x.share_token === share);
        if (!b) throw fail('not_found');
        if (!isOpen(b)) throw fail('closed');
        if (!name.trim() || adults + kids < 1 || adults > b.adults || kids > b.kids || !checkGroup(items.adult, adults) || !checkGroup(items.kid, kids)) throw fail('invalid');
        const now = new Date().toISOString();
        if (id) {
          const x = s.shares.find(v => v.id === id && v.booking_id === b.id && v.edit_key === key); if (!x) throw fail('not_found');
          Object.assign(x, { name: name.trim(), adults, kids, items, notes: (notes || '').trim() || null, updated_at: now });
          save(s); return { id: x.id, key: x.edit_key };
        }
        const x = { id: newToken(), booking_id: b.id, edit_key: newToken(), name: name.trim(), adults, kids, items, notes: (notes || '').trim() || null, created_at: now, updated_at: now };
        s.shares.push(x); save(s); return { id: x.id, key: x.edit_key };
      }
      return rpc('fiesta_group_submit', { p_share: share, p_id: id || null, p_key: key || null, p_name: name, p_adults: adults, p_kids: kids, p_items: items, p_notes: notes || '' });
    },
    async deleteGroup(share, id, key) {
      if (DEMO) { const s = store(), b = s.bookings.find(x => x.share_token === share); if (!b) return false; if (!isOpen(b)) throw fail('closed');
        const n = s.shares.length; s.shares = s.shares.filter(x => !(x.id === id && x.booking_id === b.id && x.edit_key === key)); save(s); return n !== s.shares.length; }
      return rpc('fiesta_group_delete', { p_share: share, p_id: id, p_key: key });
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
      if (DEMO) { const s = store(); return s.bookings.map(b => ({ ...b, order: s.orders[b.id] || null, shares: s.shares.filter(x => x.booking_id === b.id) })); }
      const [bs, os, ss] = await Promise.all([
        q(client().from('fiesta_bookings').select('*').order('created_at')),
        q(client().from('fiesta_orders').select('*')),
        // fiesta_shares exists after migration 006; before that, staff pages still work without it.
        client().from('fiesta_shares').select('id,booking_id,name,adults,kids,items,notes,created_at,updated_at').order('created_at')
          .then(r => r.error ? [] : r.data)
      ]);
      const byId = Object.fromEntries(os.map(o => [o.booking_id, o]));
      return bs.map(b => ({ ...b, order: byId[b.id] || null, shares: ss.filter(x => x.booking_id === b.id) }));
    },

    async saveBooking(b) {
      const row = { day: b.day, name: b.name, phone: b.phone || null, adults: b.adults, kids: b.kids,
        table_no: b.table_no || null, notes: b.notes || null };
      if (DEMO) {
        const s = store();
        if (b.id) Object.assign(s.bookings.find(x => x.id === b.id), row);
        else s.bookings.push({ ...row, id: newToken(), token: newToken(), share_token: newToken(), locked: false, sent_at: null, created_at: new Date().toISOString() });
        save(s); return;
      }
      if (b.id) await q(client().from('fiesta_bookings').update(row).eq('id', b.id));
      else await q(client().from('fiesta_bookings').insert(row));
    },
    async deleteBooking(id) {
      if (DEMO) { const s = store(); s.bookings = s.bookings.filter(x => x.id !== id); s.shares = s.shares.filter(x => x.booking_id !== id); delete s.orders[id]; save(s); return; }
      await q(client().from('fiesta_bookings').delete().eq('id', id));
    },
    async markSent(id) {
      const at = new Date().toISOString();
      if (DEMO) { const s = store(); s.bookings.find(x => x.id === id).sent_at = at; save(s); return; }
      await q(client().from('fiesta_bookings').update({ sent_at: at }).eq('id', id));
    },
    // Lock/unlock a list of bookings (a whole day, or one table).
    async setLocked(ids, locked) {
      if (!ids.length) return;
      if (DEMO) { const s = store(); s.bookings.filter(x => ids.includes(x.id)).forEach(x => { x.locked = locked; }); save(s); return; }
      await q(client().from('fiesta_bookings').update({ locked }).in('id', ids));
    },

    // Staff writes the order directly (half portions, skipped course, off-menu dish...).
    // items.staff_at marks it as adjusted by the restaurant; the booking is locked unless keepOpen.
    async saveOrderAsStaff(b, items, allergies, comments, keepOpen) {
      const row = { booking_id: b.id, items: { ...items, staff_at: new Date().toISOString() },
        allergies: (allergies || '').trim() || null, comments: (comments || '').trim() || null,
        adults: b.adults, kids: b.kids, submitted_at: new Date().toISOString() };
      if (DEMO) {
        const s = store(), prev = s.orders[b.id];
        s.orders[b.id] = { ...row, submit_count: prev ? prev.submit_count : 0 };
        s.bookings.find(x => x.id === b.id).locked = !keepOpen;
        save(s); return;
      }
      const { data } = await client().auth.getSession();
      await q(client().from('fiesta_orders').upsert({ ...row, owner_id: data.session.user.id, submit_count: b.order ? b.order.submit_count : 0 }, { onConflict: 'booking_id' }));
      await q(client().from('fiesta_bookings').update({ locked: !keepOpen }).eq('id', b.id));
    },
    resetDemo() { try { localStorage.removeItem(KEY); } catch {} }
  };
})();
