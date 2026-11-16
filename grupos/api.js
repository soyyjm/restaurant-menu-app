// Data layer for group menus (menú cerrado / menú para grupos).
// Real mode: Supabase (tables + RPCs from supabase/006_grupos.sql).
// Demo mode (?demo in the URL): localStorage only, seeded with an example 24-person group.
(function () {
  const SUPABASE_URL = 'https://nkteqmgslcrqiglzcsyv.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rdGVxbWdzbGNycWlnbHpjc3l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwMzE4NzMsImV4cCI6MjA3MTYwNzg3M30.XmyXU4LAUYorfwsXjEEjHQsOHDWGa3gESxu2xq3XPm0';
  const DEMO = new URLSearchParams(location.search).has('demo');
  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
  const codeFrom = m => /not found/.test(m) ? 'not_found' : /closed/.test(m) ? 'closed' : /full/.test(m) ? 'full'
    : /invalid/.test(m) ? 'invalid' : /JWT|auth|permission/i.test(m) ? 'auth' : 'network';

  // ---------- menu helpers (shared by both pages) ----------
  const ALLERGENS = {
    gluten: ['Gluten', 'Gluten'], crustaceos: ['Crustáceos', 'Crustacis'], huevos: ['Huevos', 'Ous'], pescado: ['Pescado', 'Peix'],
    cacahuetes: ['Cacahuetes', 'Cacauets'], soja: ['Soja', 'Soja'], lacteos: ['Lácteos', 'Lactis'], frutos_cascara: ['Frutos de cáscara', 'Fruits de closca'],
    apio: ['Apio', 'Api'], mostaza: ['Mostaza', 'Mostassa'], sesamo: ['Sésamo', 'Sèsam'], sulfitos: ['Sulfitos', 'Sulfits'],
    altramuces: ['Altramuces', 'Tramussos'], moluscos: ['Moluscos', 'Mol·luscs']
  };
  const M = {
    choice: menu => (menu.sections || []).filter(s => s.mode === 'choose_one'),
    // Same label as the main app's version chips: "ES", "ES v2", "CA v3"…
    variant: m => `${(m.language || 'es').toUpperCase()}${Number(m.version) > 1 ? ` v${m.version}` : ''}`,
    archived: m => (m.tags || []).includes('status:archivado'),
    other: menu => (menu.sections || []).filter(s => s.mode !== 'choose_one'),
    tr: (obj, field, lang) => (lang === 'ca' && obj.ca && obj.ca[field]) || obj[field] || '',
    dish: (menu, sid, did) => { const s = (menu.sections || []).find(x => x.id === sid); return s && (s.dishes || []).find(d => d.id === did); },
    allergens: (d, lang) => (d.allergens || []).filter(a => ALLERGENS[a]).map(a => ALLERGENS[a][lang === 'ca' ? 1 : 0]),
    // Totals per choose_one section: people rows + organizer counts.
    totals(ev) {
      const t = {};
      for (const s of M.choice(ev.menu)) t[s.id] = {};
      for (const p of ev.personas || []) for (const [sid, did] of Object.entries(p.picks || {})) if (t[sid]) t[sid][did] = (t[sid][did] || 0) + 1;
      for (const [sid, m] of Object.entries(ev.counts || {})) if (t[sid]) for (const [did, n] of Object.entries(m)) t[sid][did] = (t[sid][did] || 0) + n;
      return t;
    },
    countsPeople: counts => Math.max(0, ...Object.values(counts || {}).map(m => Object.values(m).reduce((a, b) => a + b, 0))),
    accounted: ev => (ev.personas || []).length + M.countsPeople(ev.counts),
    supplements(ev) {
      let s = 0; const t = M.totals(ev);
      for (const [sid, m] of Object.entries(t)) for (const [did, n] of Object.entries(m)) s += (Number((M.dish(ev.menu, sid, did) || {}).supplement) || 0) * n;
      return s;
    },
    // Snapshot of a menus_cerrados row (staff side), with Catalan from inline translations or sibling rows.
    snapshot(row, all) {
      const W = window.MenuWorkflows, ca = (si, di, f) => { try { return W ? W.translatedField(row, all || [], 'ca', si, di, f) : ''; } catch { return ''; } };
      // Catalan copy of the same family and the same version (versions are separate rows with parent_id).
      const fam = m => m.parent_id || m.id, ver = m => Number(m.version) || 1;
      const caRow = (all || []).find(m => m.id !== row.id && fam(m) === fam(row) && ver(m) === ver(row) && m.language === 'ca');
      return {
        name: row.name, type: row.type || null, version: ver(row), variant: M.variant(row), price: row.price != null ? Number(row.price) : null,
        price_label: row.price_label || 'por persona (IVA incluido)', drinks: row.drinks || '', notes: row.notes || '',
        ca: caRow ? { name: caRow.name, price_label: caRow.price_label, drinks: caRow.drinks } : null,
        sections: (row.sections || []).map((s, si) => ({
          id: s.id, title: s.title || '', subtitle: s.subtitle || '', mode: s.mode || 'choose_one',
          ca: ca(si, null, 'title') ? { title: ca(si, null, 'title') } : null,
          dishes: (s.dishes || []).filter(d => (d.name || '').trim()).map((d, di) => ({
            id: d.id, name: d.name.trim(), supplement: d.supplement ? Number(d.supplement) : null,
            allergens: Array.isArray(d.allergens) ? d.allergens : undefined,
            ca: ca(si, di, 'name') ? { name: ca(si, di, 'name') } : null
          }))
        }))
      };
    }
  };

  // ---------- demo store ----------
  const KEY = 'grupos-demo-v3';
  const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  const madridToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const isOpen = e => !e.locked && madridToday() < e.date && (!e.deadline || madridToday() <= e.deadline);

  // The example group (a real booking, without contact details): Menú Degustación for 24 people,
  // Friday 11 December 2026 at 15:00, organizer Ana. If that date has passed, it moves 12 days ahead.
  const EXAMPLE_MENU_ROW = {
    id: 'demo-degustacion-v2', parent_id: 'demo-degustacion', version: 2, name: 'Menú Degustación', type: 'degustacion', price: 27, price_label: 'por persona (IVA incluido)', language: 'es',
    drinks: 'Incluido la bebida (una botella de vino para 4) y el postre', notes: '',
    sections: [
      { id: 's-pica', title: 'Pica pica', mode: 'shared', dishes: [{ id: 'd-nachos', name: 'Nachos Sol (cheddar, pico de gallo, guacamole, jalapeños, carne picada)', allergens: ['gluten', 'lacteos'] }] },
      { id: 's-primero', title: 'Primer plato', mode: 'choose_one', dishes: [
        { id: 'd-ensalada', name: 'Ensalada de Queso de Cabra Gratinado, Bouquet de Frutos Secos y mermelada de tomate', allergens: ['lacteos', 'frutos_cascara'] },
        { id: 'd-canelones', name: 'Canelones Tradicionales con Bechamel', allergens: ['gluten', 'lacteos', 'huevos'] },
        { id: 'd-huevos', name: 'Huevos rotos con jamón y patatas paja', allergens: ['huevos'] },
        { id: 'd-fritura', name: 'Fritura de pescados', allergens: ['pescado', 'gluten'] },
        { id: 'd-pulpo', name: 'Pulpo a la parrilla con parmentier de patatas', supplement: 4.5, allergens: ['moluscos', 'lacteos'] }] },
      { id: 's-segundo', title: 'Segundo plato', mode: 'choose_one', dishes: [
        { id: 'd-bacalao', name: 'Bacalao a la Muselina de Ajo con Patatas Panaderas', allergens: ['pescado', 'huevos'] },
        { id: 'd-cabrito', name: 'Costillas de cabrito a la milanesa con patatas fritas y pimientos de padrón', allergens: ['gluten', 'huevos'] },
        { id: 'd-paella', name: 'Paella de marisco con vieira al momento', allergens: ['crustaceos', 'moluscos', 'pescado'] },
        { id: 'd-lomo', name: 'Lomo Alto de Vaca a la Parrilla con patata gajo y Verduras de Temporada', allergens: [] },
        { id: 'd-chuleton', name: 'Chuletón de ternera 350 g con su guarnición', supplement: 5.5, allergens: [] }] }
    ]
  };
  // Version 1 of the same family (older dishes and price), like in the real library.
  const EXAMPLE_MENU_V1 = {
    id: 'demo-degustacion', version: 1, name: 'Menú Degustación', type: 'degustacion', price: 26.5, price_label: 'por persona (IVA incluido)', language: 'es',
    drinks: 'Incluido la bebida y el postre',
    sections: [
      { id: 'v1-pica', title: 'Pica pica', mode: 'shared', dishes: [{ id: 'v1-bravas', name: 'Patatas bravas' }] },
      { id: 'v1-pri', title: 'Primer plato', mode: 'choose_one', dishes: [{ id: 'v1-sopa', name: 'Sopa de pescado' }, { id: 'v1-ens', name: 'Ensalada César' }] },
      { id: 'v1-seg', title: 'Segundo plato', mode: 'choose_one', dishes: [{ id: 'v1-pollo', name: 'Pollo asado' }, { id: 'v1-merluza', name: 'Merluza a la romana' }] }
    ]
  };
  const EXAMPLE_MENU_ROW_2 = {
    id: 'demo-grupos', name: 'Menú Grupos', type: 'grupos', price: 32, price_label: 'por persona (IVA incluido)', language: 'es', drinks: 'Agua, vino de la casa y café',
    sections: [
      { id: 'g-ent', title: 'Entrantes', mode: 'shared', dishes: [{ id: 'g-jamon', name: 'Jamón ibérico' }, { id: 'g-croq', name: 'Croquetas caseras' }] },
      { id: 'g-pri', title: 'Principal', mode: 'choose_one', dishes: [{ id: 'g-entrecot', name: 'Entrecot a la brasa' }, { id: 'g-lubina', name: 'Lubina a la espalda' }, { id: 'g-risotto', name: 'Risotto de setas' }] },
      { id: 'g-pos', title: 'Postre', mode: 'choose_one', dishes: [{ id: 'g-crema', name: 'Crema catalana' }, { id: 'g-coulant', name: 'Coulant de chocolate' }] }
    ]
  };
  function seed() {
    const date = madridToday() < '2026-12-11' ? '2026-12-11' : addDays(madridToday(), 12), menu = M.snapshot(EXAMPLE_MENU_ROW, []);
    const ev = { id: newToken(), date, time: '15:00', title: 'Comida de grupo · Ana', organizer: 'Ana', phone: '', email: '', pax: 24,
      menu, menu_id: EXAMPLE_MENU_ROW.id, deadline: addDays(date, -2), notes: 'Señal 20 € (Bizum)', counts: {}, counts_notes: null, counts_at: null,
      token: newToken(), share_token: newToken(), locked: false, sent_at: null, created_at: new Date().toISOString() };
    const P = ['d-ensalada', 'd-canelones', 'd-huevos', 'd-fritura', 'd-pulpo'], S = ['d-bacalao', 'd-cabrito', 'd-paella', 'd-lomo', 'd-chuleton'];
    const names = ['Ana', 'Marc', 'Laia', 'Jordi', 'Núria', 'Pau', 'Marta', 'Carles', 'Sílvia'];
    const personas = names.map((name, i) => ({ id: newToken(), evento_id: ev.id, name, picks: { 's-primero': P[(i * 3) % 5], 's-segundo': S[(i * 2 + 1) % 5] },
      notes: i === 4 ? 'Sin gluten' : null, added_by: i === 0 ? 'organizer' : 'self', edit_key: newToken(),
      created_at: new Date(Date.now() - (9 - i) * 3600e3).toISOString(), updated_at: new Date(Date.now() - (9 - i) * 3600e3).toISOString() }));
    return { events: [ev], personas, menus: [EXAMPLE_MENU_V1, EXAMPLE_MENU_ROW, EXAMPLE_MENU_ROW_2] };
  }
  const store = () => { let s = load(); if (!s) { s = seed(); save(s); } return s; };
  const pub = p => ({ id: p.id, name: p.name, picks: p.picks, notes: p.notes, added_by: p.added_by, updated_at: p.updated_at });
  function orgView(s, e) {
    return { date: e.date, time: e.time, title: e.title, organizer: e.organizer, pax: e.pax, menu: e.menu, deadline: e.deadline, open: isOpen(e),
      share_token: e.share_token, counts: e.counts, counts_notes: e.counts_notes, counts_at: e.counts_at,
      personas: s.personas.filter(p => p.evento_id === e.id).map(pub) };
  }
  const checkPicks = (menu, picks) => picks && typeof picks === 'object' && Object.keys(picks).length === M.choice(menu).length
    && M.choice(menu).every(sec => typeof picks[sec.id] === 'string' && sec.dishes.some(d => d.id === picks[sec.id]));
  const checkCounts = (menu, counts) => counts && typeof counts === 'object' && Object.entries(counts).every(([sid, m]) => {
    const sec = M.choice(menu).find(x => x.id === sid);
    return sec && m && typeof m === 'object' && Object.entries(m).every(([did, n]) => sec.dishes.some(d => d.id === did) && Number.isInteger(n) && n >= 1 && n <= 300);
  });

  // ---------- Supabase ----------
  async function rpc(fn, body) {
    let r;
    try {
      r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw fail('network'); }
    const data = await r.json().catch(() => null);
    if (!r.ok) throw fail(codeFrom((data && data.message) || ''), data && data.message);
    return data;
  }
  let sb = null;
  const client = () => sb || (sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY));
  const q = async p => { const { data, error } = await p; if (error) throw fail(codeFrom(error.message), error.message); return data; };
  const tokenOk = t => /^[0-9a-f]{32}$/.test(t || '');

  window.GruposAPI = {
    demo: DEMO, M,

    // ----- organizer link -----
    async getOrg(token) {
      if (!tokenOk(token)) throw fail('not_found');
      if (DEMO) { const s = store(), e = s.events.find(x => x.token === token); if (!e) throw fail('not_found'); return orgView(s, e); }
      const r = await rpc('grupo_org', { p_token: token }); if (!r) throw fail('not_found'); return r;
    },
    async saveCounts(token, counts, notes) {
      if (DEMO) {
        const s = store(), e = s.events.find(x => x.token === token); if (!e) throw fail('not_found');
        if (!isOpen(e)) throw fail('closed');
        if (!checkCounts(e.menu, counts)) throw fail('invalid');
        if (s.personas.filter(p => p.evento_id === e.id).length + M.countsPeople(counts) > e.pax) throw fail('full');
        Object.assign(e, { counts, counts_notes: (notes || '').trim() || null, counts_at: new Date().toISOString() }); save(s); return orgView(s, e);
      }
      return rpc('grupo_org_counts', { p_token: token, p_counts: counts, p_notes: notes || '' });
    },

    // ----- group link -----
    async getShare(share, id, key) {
      if (!tokenOk(share)) throw fail('not_found');
      if (DEMO) {
        const s = store(), e = s.events.find(x => x.share_token === share); if (!e) throw fail('not_found');
        const mine = s.personas.find(p => p.evento_id === e.id && p.id === id && p.edit_key === key);
        return { date: e.date, time: e.time, title: e.title, organizer: e.organizer, pax: e.pax, menu: e.menu, deadline: e.deadline, open: isOpen(e),
          taken: s.personas.filter(p => p.evento_id === e.id).length + M.countsPeople(e.counts), mine: mine ? pub(mine) : null };
      }
      const r = await rpc('grupo_share', { p_share: share, p_id: id || null, p_key: key || null }); if (!r) throw fail('not_found'); return r;
    },

    // tok = organizer token or group token
    async savePerson(tok, id, key, name, picks, notes) {
      if (DEMO) {
        const s = store(), e = s.events.find(x => x.token === tok || x.share_token === tok); if (!e) throw fail('not_found');
        const org = e.token === tok;
        if (!isOpen(e)) throw fail('closed');
        if (!(name || '').trim() || name.trim().length > 60 || (notes || '').length > 300 || !checkPicks(e.menu, picks)) throw fail('invalid');
        const now = new Date().toISOString();
        if (id) {
          const p = s.personas.find(x => x.id === id && x.evento_id === e.id && (org || x.edit_key === key)); if (!p) throw fail('not_found');
          Object.assign(p, { name: name.trim(), picks, notes: (notes || '').trim() || null, updated_at: now }); save(s); return { id: p.id, key: p.edit_key };
        }
        if (s.personas.filter(p => p.evento_id === e.id).length + M.countsPeople(e.counts) >= e.pax) throw fail('full');
        const p = { id: newToken(), evento_id: e.id, name: name.trim(), picks, notes: (notes || '').trim() || null, added_by: org ? 'organizer' : 'self', edit_key: newToken(), created_at: now, updated_at: now };
        s.personas.push(p); save(s); return { id: p.id, key: p.edit_key };
      }
      return rpc('grupo_persona_save', { p_token: tok, p_id: id || null, p_key: key || null, p_name: name, p_picks: picks, p_notes: notes || '' });
    },
    async deletePerson(tok, id, key) {
      if (DEMO) {
        const s = store(), e = s.events.find(x => x.token === tok || x.share_token === tok); if (!e) return false;
        if (!isOpen(e)) throw fail('closed');
        const n = s.personas.length; s.personas = s.personas.filter(p => !(p.id === id && p.evento_id === e.id && (e.token === tok || p.edit_key === key)));
        save(s); return n !== s.personas.length;
      }
      return rpc('grupo_persona_delete', { p_token: tok, p_id: id, p_key: key || null });
    },

    // ----- staff -----
    async session() {
      if (DEMO) return { email: 'demo' };
      const { data } = await client().auth.getSession(); return data.session ? { email: data.session.user.email, id: data.session.user.id } : null;
    },
    async signIn(email, password) { const { error } = await client().auth.signInWithPassword({ email, password }); if (error) throw fail('auth', error.message); },
    async signOut() { if (!DEMO) await client().auth.signOut(); },
    async listMenus() {
      if (DEMO) return store().menus;
      return q(client().from('menus_cerrados').select('*').order('updated_at', { ascending: false }));
    },
    async listEvents() {
      if (DEMO) { const s = store(); return s.events.map(e => ({ ...e, personas: s.personas.filter(p => p.evento_id === e.id) })); }
      const [es, ps] = await Promise.all([
        q(client().from('grupo_eventos').select('*').order('date')),
        q(client().from('grupo_personas').select('id,evento_id,name,picks,notes,added_by,created_at,updated_at').order('created_at'))
      ]);
      return es.map(e => ({ ...e, personas: ps.filter(p => p.evento_id === e.id) }));
    },
    async saveEvent(ev) {
      const row = { date: ev.date, time: ev.time || null, title: ev.title, organizer: ev.organizer || null, phone: ev.phone || null, email: ev.email || null,
        pax: ev.pax, deadline: ev.deadline || null, notes: ev.notes || null };
      if (ev.menu) { row.menu = ev.menu; row.menu_id = ev.menu_id || null; }
      if (DEMO) {
        const s = store();
        if (ev.id) Object.assign(s.events.find(x => x.id === ev.id), row);
        else s.events.push({ ...row, id: newToken(), counts: {}, counts_notes: null, counts_at: null, token: newToken(), share_token: newToken(), locked: false, sent_at: null, created_at: new Date().toISOString() });
        save(s); return;
      }
      if (ev.id) await q(client().from('grupo_eventos').update(row).eq('id', ev.id));
      else await q(client().from('grupo_eventos').insert(row));
    },
    async deleteEvent(id) {
      if (DEMO) { const s = store(); s.events = s.events.filter(e => e.id !== id); s.personas = s.personas.filter(p => p.evento_id !== id); save(s); return; }
      await q(client().from('grupo_eventos').delete().eq('id', id));
    },
    async patchEvent(id, patch) {
      if (DEMO) { const s = store(); Object.assign(s.events.find(e => e.id === id), patch); save(s); return; }
      await q(client().from('grupo_eventos').update(patch).eq('id', id));
    },
    async staffSavePerson(ev, p) {
      const row = { name: p.name.trim(), picks: p.picks, notes: (p.notes || '').trim() || null };
      if (DEMO) {
        const s = store(), now = new Date().toISOString();
        if (p.id) Object.assign(s.personas.find(x => x.id === p.id), row, { updated_at: now });
        else s.personas.push({ ...row, id: newToken(), evento_id: ev.id, added_by: 'staff', edit_key: newToken(), created_at: now, updated_at: now });
        save(s); return;
      }
      if (p.id) await q(client().from('grupo_personas').update(row).eq('id', p.id));
      else { const me = await this.session(); await q(client().from('grupo_personas').insert({ ...row, evento_id: ev.id, owner_id: me.id, added_by: 'staff' })); }
    },
    async staffDeletePerson(id) {
      if (DEMO) { const s = store(); s.personas = s.personas.filter(p => p.id !== id); save(s); return; }
      await q(client().from('grupo_personas').delete().eq('id', id));
    },
    resetDemo() { try { localStorage.removeItem(KEY); } catch {} }
  };
})();
