const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function saveMenu'));
const startup = 'init();\nmcInitTabs();';
assert(inline.includes(startup));

function harness({ user = true, fail = false, storage, response } = {}) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, placeholder: '', classList: { add() {}, remove() {}, toggle() {} }, focus() {} });
    return elements.get(id);
  };
  el('menuDate').value = '2026-09-06';
  el('menuPrice').value = '21.50 €';
  const saved = storage || new Map();
  const writes = [];
  let failing = fail;
  const cloud = { from(table) {
    let op = 'select', payload;
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; }, maybeSingle() { return q; }, eq(field,value) { (q.filters ||= []).push([field,value]); return q; }, single() { return q; }, abortSignal() { return q; },
      upsert(data) { op = 'upsert'; payload = JSON.parse(JSON.stringify(data)); return q; },
      delete() { op = 'delete'; return q; },
      insert(data) { op='insert';payload=JSON.parse(JSON.stringify(data));return q; },
      update(data) { op='update';payload=JSON.parse(JSON.stringify(data));return q; },
      then(resolve, reject) {
        return (async () => {
          if (op !== 'select') writes.push({ table, op, payload, filters:q.filters });
          if (response) return response({ table, op, payload });
          return { error: failing ? { message: 'simulated rejection' } : null, data: op === 'select' ? (['dishes','menu_history'].includes(table) ? [] : null) : null };
        })().then(resolve, reject);
      }
    };
    return q;
  } };
  const context = { MenuWorkflows: require('../menu-workflows.js'), Intl, Date, AbortSignal, setTimeout, clearTimeout, console: { warn() {}, error() {} },
    document: { getElementById: el, createElement: () => ({ className: '', textContent: '', remove() {} }) },
    localStorage: { getItem: k => saved.get(k) ?? null, setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k) },
    window: {}, alert: () => {}, confirm: () => true, fetch: async () => { throw Error('offline'); }, cloud };
  vm.createContext(context);
  vm.runInContext(inline.replace(startup, `globalThis.api = {
    copyRelativeMenu, reviewDailyBackup, restoreDailyBackup, mcPersistCurrent, mcRestoreDrafts, mcSaveMenu, mcSelectMenuById, mcRenderPreview, addBatch, translateBatch, prepareBatch, localDate, changeMenuDate, saveMenu, saveLibrary, saveSettings, deleteFromCloud, syncPending, loadAll, stageMenu, unpackMenu, doTranslate, addToMenu, clearMenu, restoreUndo, loadFromHistory, mcTranslateOneDish,
    state: () => ({ todayMenu, menuHistory, menuMetadata, pendingSaves, printSettings, cacheOwner, mcDrafts, mcCurrentMenu, mcCurrentId, mcMenus, batchDraft, library, dishPreferences }),
    setMenu: m => todayMenu = m,
    setBatch: b => batchDraft = b,
    setClosed: (menu, menus=[]) => { mcCurrentMenu=menu; mcCurrentId=menu?.id;mcMenus=menus;
      mcGatherFromEditor=()=>({}); mcRenderLibrary=()=>{}; mcRenderEditor=()=>{}; mcRenderDraftStatus=()=>{};
    },
    setLibrary: m => library = m,
    setTranslate: fn => translateText = fn,
    bumpTranslation: () => translationRevision++,
    bumpAuth: () => authGeneration++,
    setUser: id => currentUser = id ? {id} : null,
    setup: u => { supabase = globalThis.cloud; isCloud = true; currentUser = u ? { id: 'manager-test' } : null; cacheOwner = u ? 'manager-test' : 'local';
      renderAll = () => {}; renderMenuBuilder = () => {}; renderPreview = () => {}; renderLibrary = () => {}; renderBatch=()=>{}; toast = () => {};
      syncUI = (status, message) => { globalThis.status = { status, message }; };
    }
  };`), context);
  context.api.setup(user);
  return { api: context.api, el, saved, writes, context, setFail: value => failing = value };
}
const menu = name => ({ primer: [{ id: 1, spanish: name, catalan: name, category: 'primer' }], segundo: [], postre: [] });
const plain = value => JSON.parse(JSON.stringify(value));

test('Madrid business date crosses midnight independently of UTC and DST', () => {
  const {api} = harness();
  assert.equal(api.localDate(new Date('2026-09-05T23:00:00Z')), '2026-09-06');
  assert.equal(api.localDate(new Date('2026-01-01T23:30:00Z')), '2026-01-02');
});

test('rejected cloud save stays pending, with complete price/date, then retries successfully', async () => {
  const h = harness({fail:true}); h.api.setMenu(menu('Soup'));
  assert.equal(await h.api.saveMenu(), false);
  assert.equal(h.context.status.status, 'error');
  assert.match(h.context.status.message, /pendiente/);
  assert.equal(h.api.state().pendingSaves.menus['2026-09-06']._meta.price, '21.50 €');
  h.setFail(false); assert.equal(await h.api.syncPending(), true);
  assert.equal(Object.keys(h.api.state().pendingSaves.menus).length, 0);
  assert.deepEqual(Object.keys(h.writes.find(x=>x.table==='selected_menu').payload.dishes), ['primer','segundo','postre']);
  assert.equal(h.writes.find(x=>x.table==='settings').payload.print_settings.menu_state_v1.date, '2026-09-06');
});

test('local edits survive reload and stale cloud reads, with pending history on multiple dates', async () => {
  const h = harness({fail:true}); h.api.setMenu(menu('Local A')); await h.api.saveMenu();
  h.el('menuDate').value='2026-09-07'; h.api.setMenu(menu('Local B')); h.el('menuPrice').value='18.00 €'; await h.api.saveMenu();
  const reloaded = harness({storage:h.saved, response: ({table}) => ({error:null,data:table==='selected_menu'?{dishes:menu('Stale cloud')}:table==='menu_history'?[]:table==='dishes'?[]:null})});
  await reloaded.api.loadAll();
  assert.equal(reloaded.api.state().todayMenu.primer[0].spanish,'Local B');
  assert.equal(reloaded.el('menuDate').value,'2026-09-07');
  assert.equal(reloaded.el('menuPrice').value,'18.00 €');
  assert.deepEqual(Object.keys(reloaded.api.state().pendingSaves.menus).sort(),['2026-09-06','2026-09-07']);
});

test('clearing stores an empty history consistently and undo restores exact content and price', async () => {
  const h = harness({user:false}); h.api.setMenu(menu('Original')); await h.api.saveMenu();
  await h.api.clearMenu();
  assert.equal(h.api.state().menuHistory['2026-09-06'].primer.length,0);
  assert.equal(h.api.state().pendingSaves.menus['2026-09-06'].primer.length,0);
  await h.api.restoreUndo();
  assert.equal(h.api.state().todayMenu.primer[0].spanish,'Original');
  assert.equal(h.el('menuPrice').value,'21.50 €');
});

test('history copy keeps target price/date; restore brings back original price/date', async () => {
  const h = harness({user:false}); h.api.setMenu(menu('Sunday')); await h.api.saveMenu();
  h.el('menuDate').value='2026-09-07'; h.el('menuPrice').value='14.50 €'; h.api.setMenu(menu('Monday')); await h.api.saveMenu();
  await h.api.loadFromHistory('2026-09-06');
  assert.equal(h.el('menuDate').value,'2026-09-07'); assert.equal(h.el('menuPrice').value,'14.50 €');
  await h.api.loadFromHistory('2026-09-06',true);
  assert.equal(h.el('menuDate').value,'2026-09-06'); assert.equal(h.el('menuPrice').value,'21.50 €');
});

test('different accounts do not inherit menu drafts, including when cloud is empty', async () => {
  const h=harness({fail:true}); h.api.setMenu(menu('Account A')); await h.api.saveMenu();
  h.api.setUser('manager-b'); await h.api.loadAll();
  assert.equal(h.api.state().todayMenu.primer.length,0);
  assert.equal(Object.keys(h.api.state().pendingSaves.menus).length,0);
  h.api.setUser('manager-test'); await h.api.loadAll();
  assert.equal(h.api.state().todayMenu.primer[0].spanish,'Account A');
});

test('translation cannot insert loading text or overwrite newer user input', async () => {
  const h=harness({user:false}); let finish;
  h.api.setTranslate(()=>new Promise(resolve=>finish=resolve));
  h.el('inputEs').value='Soup'; h.el('inputCategory').value='primer';
  const pending=h.api.doTranslate();
  assert.equal(h.el('inputCa').value,''); assert.equal(h.el('btnBoth').disabled,true);
  await h.api.addToMenu(); assert.equal(h.api.state().todayMenu.primer.length,0);
  h.el('inputEs').value='Fish'; h.api.bumpTranslation();
  finish({catalan:'Sopa',correctedSpanish:'Soup',provider:'gemini'});
  assert.equal(await pending,false); assert.equal(h.el('inputEs').value,'Fish');
  assert.equal(h.el('inputCa').value,''); assert.equal(h.el('btnBoth').disabled,false);
});

test('closed-menu translation failure rejects instead of treating original as translated',async()=>{
  const h=harness(); await assert.rejects(h.api.mcTranslateOneDish('Pollo al horno','en'));
});

test('failed local storage never claims a local save',async()=>{
  const h=harness({user:false}); h.api.setMenu(menu('Soup'));
  h.context.localStorage.setItem=()=>{throw Error('quota');};
  assert.equal(await h.api.saveMenu(),false);
  assert.match(h.context.status.message,/No se pudo guardar/);
});

test('a second edit arriving during a cloud write is retained and synchronized last',async()=>{
  let release, first=true;
  const h=harness({response:async({op})=>{if(op==='upsert'&&first){first=false;await new Promise(r=>release=r);}return {error:null};}});
  h.api.setMenu(menu('First')); const saving=h.api.saveMenu();
  await new Promise(r=>setImmediate(r));
  h.api.setMenu(menu('Second')); const next=h.api.saveMenu(); release(); await Promise.all([saving,next]);
  const last=h.writes.filter(w=>w.table==='selected_menu').at(-1);
  assert.equal(last.payload.dishes.primer[0].spanish,'Second');
  assert.equal(Object.keys(h.api.state().pendingSaves.menus).length,0);
});

test('new-device load restores cloud date, price and historical price without changing dish JSON shape',async()=>{
  const h=harness({response:({table})=>({error:null,data:table==='selected_menu'?{dishes:menu('Cloud menu')}:table==='settings'?{print_settings:{mainEs:19,menu_state_v1:{date:'2026-09-07',price:'19.00 €',history:{'2026-09-07':{date:'2026-09-07',price:'19.00 €'}}}}}:table==='menu_history'?[{date:'2026-09-07',dishes:menu('Cloud menu')}]:[]})});
  await h.api.loadAll();
  assert.equal(h.el('menuDate').value,'2026-09-07');
  assert.equal(h.el('menuPrice').value,'19.00 €');
  assert.equal(h.api.state().menuMetadata['2026-09-07'].price,'19.00 €');
  assert.equal(h.api.state().printSettings.mainEs,19);
  assert.deepEqual(Object.keys(h.api.state().todayMenu),['primer','segundo','postre']);
});

test('a partial multi-table failure never clears the pending record',async()=>{
  let rejectSettings=true;
  const h=harness({response:({table,op})=>({error:rejectSettings&&table==='settings'&&op==='upsert'?{message:'settings rejected'}:null})});
  h.api.setMenu(menu('Soup')); assert.equal(await h.api.saveMenu(),false);
  assert.equal(Object.keys(h.api.state().pendingSaves.menus).length,1);
  rejectSettings=false; assert.equal(await h.api.syncPending(),true);
  assert.equal(h.context.status.status,'ok');
});

test('library deletion is retained on rejection and retried after reload',async()=>{
  const h=harness({fail:true}); assert.equal(await h.api.deleteFromCloud(123),false);
  const reloaded=harness({storage:h.saved}); await reloaded.api.loadAll();
  assert.deepEqual(plain(reloaded.api.state().pendingSaves.deletes),[123]);
  await reloaded.api.syncPending(); assert.equal(reloaded.writes.filter(w=>w.op==='delete').length,1);
  assert.equal(reloaded.api.state().pendingSaves.deletes.length,0);
});

test('price input is durable before blur or any cloud write',async()=>{
  const h=harness({user:false}); h.api.setMenu(menu('Soup')); h.el('menuPrice').value='22.50 €'; h.api.stageMenu();
  const reloaded=harness({user:false,storage:h.saved});await reloaded.api.loadAll();
  assert.equal(reloaded.el('menuPrice').value,'22.50 €');
  assert.equal(reloaded.api.state().pendingSaves.menus['2026-09-06']._meta.price,'22.50 €');
  assert.equal(h.writes.length,0);
});

test('session changes stop remaining writes and preserve the old account pending copy',async()=>{
  let release;
  const h=harness({response:async()=>{await new Promise(r=>release=r);return {error:null};}});
  h.api.setMenu(menu('Private draft')); const saving=h.api.saveMenu(); await new Promise(r=>setImmediate(r));
  h.api.bumpAuth(); release(); assert.equal(await saving,false);
  assert.equal(h.writes.length,1); assert.equal(Object.keys(h.api.state().pendingSaves.menus).length,1);
});

test('switching date opens that date menu instead of overwriting it with the current menu',async()=>{
  const h=harness({user:false}); h.api.setMenu(menu('Sunday')); await h.api.saveMenu();
  h.el('menuDate').value='2026-09-07'; await h.api.changeMenuDate();
  assert.equal(h.api.state().todayMenu.primer.length,0);
  h.api.setMenu(menu('Monday')); h.el('menuPrice').value='17.50 €'; await h.api.saveMenu();
  h.el('menuDate').value='2026-09-06'; await h.api.changeMenuDate();
  assert.equal(h.api.state().todayMenu.primer[0].spanish,'Sunday');
  assert.equal(h.el('menuPrice').value,'21.50 €');
  assert.equal(h.api.state().menuHistory['2026-09-07'].primer[0].spanish,'Monday');
  await h.api.restoreUndo();
  assert.equal(h.el('menuDate').value,'2026-09-07');
  assert.equal(h.api.state().todayMenu.primer[0].spanish,'Monday');
});
const closedMenu=()=>({id:'closed-1',name:'Menu prueba',language:'es',version:1,type:'otro',price:25,drinks:'Agua',updated_at:'2026-09-06T10:00:00Z',sections:[{id:'sec',title:'Entrantes',dishes:[{id:'dish',name:'Sopa'}]}]});
test('closed drafts survive reload with all metadata and original cloud timestamp',()=>{
 const h=harness(),original=closedMenu(),draft={...plain(original),name:'Modified',notes:'New notes',price:30};
 h.api.setClosed(draft,[original]);assert.equal(h.api.mcPersistCurrent(),true);
 const reloaded=harness({storage:h.saved});reloaded.api.mcRestoreDrafts();
 assert.equal(reloaded.api.state().mcCurrentMenu.name,'Modified');
 assert.equal(reloaded.api.state().mcCurrentMenu.price,30);
 assert.equal(reloaded.api.state().mcCurrentMenu._baseUpdatedAt,original.updated_at);
});
test('switching closed menus preserves each unsaved draft separately',()=>{
 const h=harness(),a=closedMenu(),b={...closedMenu(),id:'closed-2',name:'Second'};
 h.api.setClosed({...plain(a),name:'Unsaved A'},[a,b]);h.api.mcSelectMenuById(b.id);
 h.api.state().mcCurrentMenu.name='Unsaved B';h.api.mcSelectMenuById(a.id);
 assert.equal(h.api.state().mcCurrentMenu.name,'Unsaved A');
 assert.equal(h.api.state().mcDrafts[b.id].name,'Unsaved B');
});
test('failed closed save preserves draft and sends optimistic timestamp filter',async()=>{
 const h=harness({fail:true}),m=closedMenu();h.api.setClosed({...plain(m),name:'Changed'},[m]);
 await h.api.mcSaveMenu();assert.equal(h.api.state().mcDrafts[m.id].name,'Changed');
 assert(h.writes[0].filters.some(([field,value])=>field==='updated_at'&&value===m.updated_at));
 assert.equal(h.writes[0].payload._baseUpdatedAt,undefined);
});
test('successful closed save preserves edits arriving while request is pending',async()=>{
 let finish;const h=harness({response:({payload})=>new Promise(resolve=>finish=()=>resolve({error:null,data:{...payload,updated_at:'new-timestamp'}}))});
 const m=closedMenu();h.api.setClosed({...plain(m),name:'First edit'},[m]);const saving=h.api.mcSaveMenu();await new Promise(r=>setImmediate(r));
 h.api.state().mcCurrentMenu.name='Later edit';finish();await saving;
 assert.equal(h.api.state().mcDrafts[m.id].name,'Later edit');assert.equal(h.api.state().mcDrafts[m.id]._baseUpdatedAt,'new-timestamp');
 assert.equal(h.api.state().mcMenus[0].name,'First edit');
});
test('batch commit skips duplicates, saves requested library entries and retains unchecked rows',async()=>{
 const h=harness({user:false});h.api.setMenu(menu('Sopa'));
 h.api.setBatch({text:'',category:'primer',rows:[{spanish:'Sopa',catalan:'Sopa CA',category:'primer',selected:true},{spanish:'Pollo',catalan:'Pollastre',category:'primer',selected:true},{spanish:'Other',catalan:'',category:'primer',selected:false}]});
 h.el('batchSaveLibrary').checked=true;await h.api.addBatch();
 assert.equal(h.api.state().todayMenu.primer.length,2);assert.equal(h.api.state().library.length,2);
 assert.equal(h.api.state().batchDraft.rows.length,1);assert.equal(h.api.state().batchDraft.rows[0].spanish,'Other');
});
test('batch refuses partially untranslated selected rows without modifying menu',async()=>{
 const h=harness({user:false});h.api.setBatch({text:'',category:'primer',rows:[{spanish:'Soup',catalan:'',category:'primer',selected:true}]});
 await h.api.addBatch();assert.equal(h.api.state().todayMenu.primer.length,0);assert.equal(h.api.state().batchDraft.rows.length,1);
});
test('uncertain closed save is confirmed by identical server content without overwriting a conflict',async()=>{
 const m=closedMenu(),draft={...plain(m),name:'Confirmed edit'};
 const h=harness({response:({op})=>op==='update'?{error:{message:'response lost'},data:null}:{error:null,data:{...draft,updated_at:'server-timestamp'}}});
 h.api.setClosed(draft,[m]);await h.api.mcSaveMenu();
 assert.equal(h.api.state().mcDrafts[m.id],undefined);assert.equal(h.api.state().mcMenus[0].name,'Confirmed edit');
 assert.equal(h.writes.length,1);
});
const importFile = () => ({size:500,text:async()=>JSON.stringify({format:'menu-daily-backup',version:1,library:[{spanish:'Imported',catalan:'Importat',category:'primer'}],favorites:[],menus:[{date:'2026-09-01',price:'19.50 €',dishes:menu('Historical')} ]})});
test('confirmed import retains active menu, persists history and stays retryable on cloud rejection',async()=>{
 const h=harness({fail:true});h.api.setMenu(menu('Open draft'));
 await h.api.reviewDailyBackup(importFile());assert.equal(h.el('restoreDailyBackup').hidden,false);
 h.api.restoreDailyBackup();await h.api.syncPending();
 assert.equal(h.api.state().todayMenu.primer[0].spanish,'Open draft');
 assert.equal(h.api.state().menuHistory['2026-09-01'].primer[0].spanish,'Historical');
 assert.equal(h.api.state().pendingSaves.menus['2026-09-01']._meta.price,'19.50 €');
 assert.ok(h.saved.get('menu_v3_manager-test_snapshot'));
});
test('import storage failure rolls back all changes and makes no cloud writes',async()=>{
 const h=harness();h.api.setMenu(menu('Open'));
 await h.api.reviewDailyBackup(importFile());
 h.context.localStorage.setItem=()=>{throw Error('quota');};
 const before=plain(h.api.state());h.api.restoreDailyBackup();
 assert.deepEqual(plain(h.api.state()),before);assert.equal(h.writes.length,0);
 assert.match(h.el('dailyBackupSummary').textContent,/no se ha aplicado/);
});
test('import reviewed under another auth generation cannot be applied',async()=>{
 const h=harness();await h.api.reviewDailyBackup(importFile());h.api.bumpAuth();h.api.restoreDailyBackup();
 assert.equal(h.api.state().library.length,0);assert.equal(h.writes.length,0);
});
test('late file reads cannot replace the latest import review',async()=>{
 const h=harness();let finish;const older=h.api.reviewDailyBackup({size:1,text:()=>new Promise(r=>finish=r)});
 await h.api.reviewDailyBackup({size:1,text:async()=>'{invalid'});
 finish(await importFile().text());await older;
 assert.equal(h.el('restoreDailyBackup').hidden,true);h.api.restoreDailyBackup();assert.equal(h.writes.length,0);
});

for (const [target,source,days] of [['2026-01-01','2025-12-31',1],['2026-03-30','2026-03-23',7],['2026-10-26','2026-10-25',1]]) {
 test(`relative copy ${days} days from ${target} keeps target price and supports undo`,async()=>{
  const h=harness({user:false});h.el('menuDate').value=source;h.api.setMenu(menu('Source'));await h.api.saveMenu();
  h.el('menuDate').value=target;h.el('menuPrice').value='30.00 €';h.api.setMenu(menu('Target'));
  await h.api.copyRelativeMenu(days);
  assert.equal(h.api.state().todayMenu.primer[0].spanish,'Source');
  assert.equal(h.el('menuDate').value,target);assert.equal(h.el('menuPrice').value,'30.00 €');
  assert.equal(h.api.state().menuHistory[source].primer[0].spanish,'Source');
  await h.api.restoreUndo();assert.equal(h.api.state().todayMenu.primer[0].spanish,'Target');
 });
}
test('relative copy missing history or cancelled replacement preserves current menu',async()=>{
 const h=harness({user:false});h.api.setMenu(menu('Keep'));await h.api.copyRelativeMenu(1);
 assert.equal(h.api.state().todayMenu.primer[0].spanish,'Keep');assert.equal(h.writes.length,0);
 h.el('menuDate').value='2026-09-05';h.api.setMenu(menu('Source'));await h.api.saveMenu();
 h.el('menuDate').value='2026-09-06';h.api.setMenu(menu('Keep'));h.context.confirm=()=>false;
 await h.api.copyRelativeMenu(1);assert.equal(h.api.state().todayMenu.primer[0].spanish,'Keep');
});
