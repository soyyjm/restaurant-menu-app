/* Shared menu operations. No network or browser storage. */
(function (root) {
  'use strict';
  const key = (name, category) => `${category}:${String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')}`;
  const family = menu => menu.parent_id || menu.id;
  const version = menu => Number(menu.version) || 1;
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonical = value => JSON.stringify(sortValue(value));
  function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortValue(value[k])]));
    return value;
  }
  function savedMatches(actual, expected) {
    return !!actual && Object.keys(expected).filter(k=>!['created_at','updated_at','_isNew','_baseUpdatedAt'].includes(k)).every(k=>canonical(actual[k])===canonical(expected[k]));
  }
  const content = menu => {
    if (!menu) return '';
    const { updated_at, created_at, _isNew, _baseUpdatedAt, ...fields } = menu;
    return canonical(fields);
  };
  function translatedField(menu, menus, lang, si, di, field) {
    const sourceLang = menu.language || 'es';
    const section = menu.sections?.[si];
    const item = di == null ? section : section?.dishes?.[di];
    if (!item) return '';
    if (lang === sourceLang) return item[field] || '';
    // Inline translations are only valid for the exact source text they were written for.
    const inline = item.translations?.[lang]?.[field];
    if (inline?.text && inline.source === item[field]) return inline.text;
    const candidates = menus.filter(m => m.id !== menu.id && family(m) === family(menu) && version(m) === version(menu) && (m.language || 'es') === lang);
    const items = candidates.flatMap(m => (m.sections || []).flatMap(s =>
      (di == null ? [s] : (s.dishes || [])).map(i => ({ menu: m, item: i }))));
    const link = item.language_links?.[`${lang}:${field}`];
    if (link && link.sourceText === item[field]) {
      const matches = items.filter(x => x.menu.id === link.menuId && x.item.id === link.itemId && x.item[field] === link.targetText);
      if (matches.length === 1) return matches[0].item[field] || '';
    }
    const matches = item.id ? items.filter(x => x.item.id === item.id) : [];
    if (matches.length === 1) {
      const target = matches[0].item;
      if (target.translation_source?.language === sourceLang) {
        if (target.translation_source[field] === item[field]) return target[field] || '';
      } else if (item.translation_source?.language === lang) {
        if (item.translation_source[field] === target[field]) return target[field] || '';
      } else if (!item.translation_changed?.includes(field) && !target.translation_changed?.includes(field)) {
        return target[field] || '';
      }
    }
    if (!item.translation_changed?.includes(field)) return item[field === 'name' ? `name_${lang}` : `${field}_${lang}`] || '';
    return '';
  }
  function editTranslatedItem(previous, fields) {
    const result = { ...previous, ...fields };
    const changed = new Set(previous?.translation_changed || []);
    for (const field of ['name', 'title', 'subtitle']) {
      if (Object.hasOwn(fields, field) && previous?.[field] !== undefined && fields[field] !== previous[field]) changed.add(field);
    }
    if (changed.size) result.translation_changed = [...changed];
    return result;
  }
  function parseBatch(text, category) {
    const lines = String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length > 50) throw new Error('Máximo 50 platos por lote.');
    const seen = new Set();
    return lines.map((line, index) => {
      const parts = line.split(/[|\t]/).map(s => s.trim());
      if (parts.length > 2 || !parts[0]) throw new Error(`Línea ${index + 1}: usa Español | Català.`);
      const dishKey = key(parts[0], category);
      if (seen.has(dishKey)) return null;
      seen.add(dishKey);
      return { spanish: parts[0], catalan: parts[1] || '', category, selected: true, status: parts[1] ? 'Revisar' : 'Falta traducción' };
    }).filter(Boolean);
  }
  function frequentDishes(library, history, favorites, limit = 8) {
    const counts = new Map();
    for (const date of Object.keys(history).sort().reverse().slice(0, 30)) {
      const used = new Set(Object.entries(history[date] || {}).flatMap(([cat, list]) => Array.isArray(list) ? list.map(d=>key(d.spanish,cat)) : []));
      used.forEach(k => counts.set(k, (counts.get(k) || 0) + 1));
    }
    const pinned = new Set((favorites || []).map(String));
    return library.map(d => ({ ...d, favorite: pinned.has(String(d.id)), uses: counts.get(key(d.spanish,d.category)) || 0 }))
      .filter(d => d.favorite || d.uses)
      .sort((a,b) => Number(b.favorite)-Number(a.favorite) || b.uses-a.uses || a.spanish.localeCompare(b.spanish,'es'))
      .slice(0,limit);
  }
  // Portable daily-menu files contain explicit business fields only, never session/storage data.
  function dailyBackup(input) {
    const fail = () => { throw new Error('Copia no válida: revisa el formato, las fechas y los platos.'); };
    const cats = ['primer', 'segundo', 'postre'];
    const string = (v, max=500) => typeof v === 'string' && v.length <= max ? v : fail();
    const list = (v, max) => Array.isArray(v) && v.length <= max ? v : fail();
    const dish = (d, category=d?.category) => {
      if (!d || !cats.includes(category)) return fail();
      const spanish = string(d.spanish).trim(), catalan = string(d.catalan).trim();
      if (!spanish) return fail();
      return {spanish, catalan, category};
    };
    if (!input || input.format !== 'menu-daily-backup' || input.version !== 1) return fail();
    const library = list(input.library, 10000).map(d=>dish(d));
    const dates = new Set();
    const menus = list(input.menus, 5000).map(m=>{
      const date = string(m?.date,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || dates.has(date)) return fail();
      dates.add(date);
      const price = string(m.price,30);
      const amount=price.replace(/\s*€$/, '').trim();
      if (price && (!/^\d+(?:[.,]\d{1,2})?$/.test(amount) || Number(amount.replace(',','.')) > 100000)) return fail();
      return {date,price,dishes:Object.fromEntries(cats.map(cat=>[cat,list(m.dishes?.[cat],500).map(d=>dish(d,cat))]))};
    });
    const available = new Set(library.map(d=>key(d.spanish,d.category)));
    const favorites = [...new Set(list(input.favorites || [],10000).map(v=>string(v,600)))].filter(k=>available.has(k));
    return {format:'menu-daily-backup',version:1,library,menus,favorites};
  }
  // Closed-menu backups keep only the table's business columns (no owner/session fields).
  const CLOSED_FIELDS = ['id','name','type','occasion','price','price_label','min_people','notes','sections','drinks','language','parent_id','version','tags','created_at','updated_at'];
  function closedBackup(menus, drafts, meta) {
    const pick = m => Object.fromEntries(CLOSED_FIELDS.filter(k => m[k] !== undefined).map(k => [k, clone(m[k])]));
    const valid = m => !!m && typeof m.id === 'string' && m.id && Array.isArray(m.sections || []);
    return {
      format: 'menus-cerrados-backup', version: 1,
      exported_at: meta.exportedAt, source: meta.source,
      menus: (menus || []).filter(valid).map(pick),
      drafts: (drafts || []).filter(valid).map(pick)
    };
  }
  // "Pollo al horno – 8.50€" -> { name: 'Pollo al horno', price: '8.50' }. Only a single trailing price is moved.
  function splitDishPrice(name) {
    const text = String(name || '').replace(/[​ ]/g, ' ').trim();
    const matches = [...text.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*€|€\s*(\d+(?:[.,]\d{1,2})?)/g)];
    if (matches.length !== 1) return null;
    const m = matches[0];
    if (text.slice(m.index + m[0].length).trim()) return null;
    const clean = text.slice(0, m.index).replace(/[\s–—:-]+$/, '').trim();
    return clean ? { name: clean, price: (m[1] || m[2]).replace(',', '.') } : null;
  }
  // "8.5" -> "8.50 €", "19.95 / 29.95" -> "19.95 € / 29.95 €"; anything else (e.g. "S/M") is kept as written.
  function formatDishPrice(raw) {
    const text = String(raw || '').trim();
    const parts = text.split('/').map(p => p.replace(/€/g, '').trim());
    if (!text || !parts.every(p => /^\d+(?:[.,]\d{1,2})?$/.test(p))) return text;
    return parts.map(p => `${Number(p.replace(',', '.')).toFixed(2)} €`).join(' / ');
  }
  function parseClosedBackup(input) {
    const fail = () => { throw new Error('Copia no válida: no es una copia de menús cerrados o está dañada.'); };
    const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const text = (v, max) => v == null || (typeof v === 'string' && v.length <= max);
    const list = (v, max) => Array.isArray(v) && v.length <= max;
    const menu = m => {
      if (!m || typeof m !== 'object' || !uuid(m.id) || !text(m.name, 200) || !text(m.type, 40)) return fail();
      if (!text(m.notes, 5000) || !text(m.drinks, 5000) || !text(m.occasion, 500) || !text(m.price_label, 200)) return fail();
      if (m.parent_id != null && !uuid(m.parent_id)) return fail();
      if (m.language != null && !['es', 'ca', 'en'].includes(m.language)) return fail();
      if (m.price != null && !(Number(m.price) >= 0 && Number(m.price) <= 100000)) return fail();
      if (m.min_people != null && !(Number.isInteger(Number(m.min_people)) && Number(m.min_people) > 0)) return fail();
      if (m.version != null && !(Number.isInteger(Number(m.version)) && Number(m.version) >= 1 && Number(m.version) <= 1000)) return fail();
      if (m.tags != null && !(list(m.tags, 100) && m.tags.every(t => text(t, 1000)))) return fail();
      if (!list(m.sections || [], 100)) return fail();
      for (const s of m.sections || []) {
        if (!s || typeof s !== 'object' || !text(s.title, 300) || !text(s.subtitle, 300) || !list(s.dishes || [], 300)) return fail();
        if ((s.dishes || []).some(d => !d || typeof d !== 'object' || !text(d.name, 500))) return fail();
      }
      return Object.fromEntries(CLOSED_FIELDS.filter(k => m[k] !== undefined).map(k => [k, clone(m[k])]));
    };
    const unique = rows => {
      const ids = new Set();
      return rows.map(menu).map(m => { if (ids.has(m.id)) fail(); ids.add(m.id); return m; });
    };
    if (!input || input.format !== 'menus-cerrados-backup' || input.version !== 1) return fail();
    if (!list(input.menus, 2000) || !list(input.drafts || [], 2000)) return fail();
    return { format: input.format, version: 1, exported_at: String(input.exported_at || ''), source: input.source === 'cloud' ? 'cloud' : 'local', menus: unique(input.menus), drafts: unique(input.drafts || []) };
  }
  // Restore only adds what is missing: existing cloud menus and local drafts are never replaced.
  // A backed-up draft goes back on top of its backed-up cloud version, so the usual
  // conflict check flags it if the cloud has changed since.
  function planClosedRestore(input, cloudMenus, localDrafts) {
    const backup = parseClosedBackup(input);
    const cloudIds = new Set((cloudMenus || []).map(m => m.id));
    const draftIds = new Set(Object.keys(localDrafts || {}));
    const insert = backup.menus.filter(m => !cloudIds.has(m.id));
    const bases = new Map(backup.menus.map(m => [m.id, m]));
    const drafts = [], skippedDrafts = [];
    for (const d of backup.drafts) {
      const base = bases.get(d.id);
      if (draftIds.has(d.id)) skippedDrafts.push(d);
      else if (base) drafts.push({ ...d, _baseUpdatedAt: base.updated_at });
      else if (!cloudIds.has(d.id)) drafts.push({ ...d, _isNew: true });
      else skippedDrafts.push(d);
    }
    return { backup, insert, existing: backup.menus.length - insert.length, drafts, skippedDrafts };
  }
  function planDailyImport(file, state, nextId) {
    const backup = dailyBackup(file);
    const library = clone(state.library), history = clone(state.history), metadata = clone(state.metadata);
    const favorites = new Set((state.favorites || []).map(String));
    const known = new Map(library.map(d=>[key(d.spanish,d.category),d]));
    const favoriteKeys = new Set(backup.favorites);
    const usedIds = new Set(library.map(d=>String(d.id)));
    for (const menu of Object.values(history)) for (const rows of Object.values(menu)) {
      if (Array.isArray(rows)) rows.forEach(d=>usedIds.add(String(d.id)));
    }
    const allocateId = () => {
      let id=nextId();
      if (!Number.isSafeInteger(id) || id<0) throw new Error('No se pudo asignar un identificador.');
      while (usedIds.has(String(id))) id++;
      if (!Number.isSafeInteger(id)) throw new Error('No se pudo asignar un identificador.');
      usedIds.add(String(id)); return id;
    };
    let addedDishes=0, skippedDishes=0, addedMenus=0, skippedMenus=0;
    const packets = {};
    for (const d of backup.library) {
      const k=key(d.spanish,d.category);
      if (known.has(k)) { skippedDishes++; continue; }
      const item={...d,id:allocateId()}; library.push(item); known.set(k,item); addedDishes++;
      if (favoriteKeys.has(k)) favorites.add(String(item.id));
    }
    for (const m of backup.menus) {
      if (m.date===state.activeDate || Object.hasOwn(history,m.date)) { skippedMenus++; continue; }
      const dishes=Object.fromEntries(Object.entries(m.dishes).map(([cat,rows])=>[cat,rows.map(d=>({...d,id:allocateId()}))]));
      history[m.date]=dishes; metadata[m.date]={date:m.date,price:m.price};
      packets[m.date]={...dishes,_meta:metadata[m.date]}; addedMenus++;
    }
    return {library,history,metadata,favorites:[...favorites],packets,addedDishes,skippedDishes,addedMenus,skippedMenus};
  }
  // Looser than key(): also ignores accents and trailing dots, to surface near-identical library entries.
  const looseKey = (name, category) => `${category}:${String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\s]+$/, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')}`;
  // Groups of library dishes that look the same. keepId: favorite first, then the oldest entry.
  function libraryDuplicates(library, favorites = []) {
    const fav = new Set(favorites.map(String));
    const groups = new Map();
    for (const d of library) {
      const k = looseKey(d.spanish, d.category);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    }
    return [...groups.entries()].filter(([, dishes]) => dishes.length > 1).map(([k, dishes]) => {
      const ranked = [...dishes].sort((a, b) => (fav.has(String(b.id)) - fav.has(String(a.id)))
        || String(a.created_at || '9999').localeCompare(String(b.created_at || '9999')) || (Number(a.id) - Number(b.id)));
      return { key: k, category: dishes[0].category, dishes, keepId: ranked[0].id };
    });
  }
  // Keep one dish per group; a removed favorite passes its star to the kept dish.
  function mergeLibraryDuplicates(library, favorites, choices) {
    const fav = new Set(favorites.map(String));
    const remove = new Set();
    for (const { keepId, dishes } of choices) {
      for (const d of dishes) {
        if (String(d.id) === String(keepId)) continue;
        remove.add(String(d.id));
        if (fav.delete(String(d.id))) fav.add(String(keepId));
      }
    }
    return { library: library.filter(d => !remove.has(String(d.id))), favorites: [...fav], removedIds: library.filter(d => remove.has(String(d.id))).map(d => d.id) };
  }
  // Cloud library plus this device's unsynced changes. A dish added here that another device already saved is dropped.
  function mergeCloudLibrary(cloud, local, { localPending = false, deletes = [] } = {}) {
    const deleted = new Set(deletes.map(String));
    const byId = new Map(cloud.filter(d => !deleted.has(String(d.id))).map(d => [String(d.id), d]));
    const cloudKeys = new Set([...byId.values()].map(d => key(d.spanish, d.category)));
    const added = [];
    let dropped = 0;
    if (localPending) for (const d of local) {
      const id = String(d.id);
      if (deleted.has(id)) continue;
      if (byId.has(id)) { byId.set(id, d); continue; }
      if (cloudKeys.has(key(d.spanish, d.category))) { dropped++; continue; }
      added.push(d);
    }
    return { library: [...added, ...byId.values()], dropped };
  }
  const api = { looseKey, libraryDuplicates, mergeLibraryDuplicates, mergeCloudLibrary, dailyBackup, closedBackup, splitDishPrice, formatDishPrice, parseClosedBackup, planClosedRestore, planDailyImport, savedMatches, key, family, version, clone, content, translatedField, editTranslatedItem, parseBatch, frequentDishes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MenuWorkflows = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
