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
  const api = { dailyBackup, planDailyImport, savedMatches, key, family, version, clone, content, translatedField, editTranslatedItem, parseBatch, frequentDishes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MenuWorkflows = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
