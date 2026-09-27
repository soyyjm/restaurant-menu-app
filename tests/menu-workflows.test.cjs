const test=require('node:test');
const assert=require('node:assert/strict');
const W=require('../menu-workflows.js');
const base=()=>({id:'root',language:'es',version:1,sections:[{id:'starter',title:'Entrantes',dishes:[{id:'soup',name:'Sopa'},{id:'fish',name:'Pescado'}]}]});
const ca=()=>({id:'ca',parent_id:'root',language:'ca',version:1,sections:[{id:'starter',title:'Entrants',dishes:[{id:'fish',name:'Peix'},{id:'soup',name:'Sopa CA'}]}]});
test('translation survives dish and section reordering',()=>{
 const m=base(), t=ca();t.sections.unshift({id:'other',title:'Altres',dishes:[{id:'otherDish',name:'Altres'}]});
 assert.equal(W.translatedField(m,[m,t],'ca',0,0,'name'),'Sopa CA');
 assert.equal(W.translatedField(m,[m,t],'ca',0,null,'title'),'Entrants');
});
test('blank row does not shift translated dish identity',()=>{
 const m=base(),t=ca();m.sections[0].dishes.unshift({id:'empty',name:''});
 assert.equal(W.translatedField(m,[t],'ca',0,1,'name'),'Sopa CA');
});
test('unrelated IDs and unrelated versions never fall back to position',()=>{
 const m=base(),t=ca();t.sections[0].dishes[1].id='legacy-other';
 assert.equal(W.translatedField(m,[t],'ca',0,0,'name'),'');
 t.sections[0].dishes[1].id='soup';t.version=2;
 assert.equal(W.translatedField(m,[t],'ca',0,0,'name'),'');
});
test('ambiguous same-version translations are not arbitrarily selected',()=>{
 const m=base(),t=ca(),other={...W.clone(t),id:'another-ca'};
 assert.equal(W.translatedField(m,[t,other],'ca',0,0,'name'),'');
});
test('manual mapping binds explicit target and becomes invalid after text changes',()=>{
 const m=base(),t=ca(),source=m.sections[0].dishes[0],target=t.sections[0].dishes[1];target.id='legacy';
 source.language_links={'ca:name':{menuId:'ca',itemId:'legacy',sourceText:'Sopa',targetText:'Sopa CA'}};
 assert.equal(W.translatedField(m,[t],'ca',0,0,'name'),'Sopa CA');target.name='Nueva sopa';
 assert.equal(W.translatedField(m,[t],'ca',0,0,'name'),'');
});
test('changing source text invalidates generated translation but not native text',()=>{
 const m=base(),t=ca();t.sections[0].dishes[1].translation_source={language:'es',name:'Sopa'};
 m.sections[0].dishes[0]=W.editTranslatedItem(m.sections[0].dishes[0],{name:'Sopa de pollo'});
 assert.equal(W.translatedField(m,[t],'ca',0,0,'name'),'');
 assert.equal(W.translatedField(m,[t],'es',0,0,'name'),'Sopa de pollo');
});
test('editing a legacy item invalidates old inline and sibling translations',()=>{
 const m=base(),t=ca();m.sections[0].dishes[0].name_ca='Old inline';
 m.sections[0].dishes[0]=W.editTranslatedItem(m.sections[0].dishes[0],{name:'Nueva sopa'});
 assert.equal(W.translatedField(m,[t],'ca',0,0,'name'),'');
});
test('inline translation wins over siblings and goes stale when source text changes',()=>{
 const m=base(),t=ca();m.sections[0].dishes[0].translations={ca:{name:{text:'Sopa inline',source:'Sopa'}}};
 assert.equal(W.translatedField(m,[t],'ca',0,0,'name'),'Sopa inline');
 m.sections[0].dishes[0]=W.editTranslatedItem(m.sections[0].dishes[0],{name:'Sopa de pollo'});
 assert.equal(W.translatedField(m,[t],'ca',0,0,'name'),'');
 assert.equal(W.translatedField(m,[t],'en',0,0,'name'),'');
});
test('batch parser trims, supports bilingual lines and removes duplicates',()=>{
 const rows=W.parseBatch(' Sopa | Sopa CA\n\nSOPA | otra\r\nPollo\tPollastre','segundo');
 assert.equal(rows.length,2);assert.equal(rows[0].spanish,'Sopa');assert.equal(rows[1].catalan,'Pollastre');
 assert.equal(rows[1].category,'segundo');
 assert.throws(()=>W.parseBatch('x\n'.repeat(51),'primer'),/50/);
 assert.throws(()=>W.parseBatch('x | y | z','primer'),/Línea 1/);
});
test('favorites rank first and usage counts each menu only once',()=>{
 const library=[{id:1,spanish:'Sopa',category:'primer'},{id:2,spanish:'Pollo',category:'segundo'}];
 const history={'2026-09-06':{primer:[{spanish:'Sopa'},{spanish:'Sopa'}]}};
 const ranked=W.frequentDishes(library,history,['2']);
 assert.equal(ranked[0].id,2);assert.equal(ranked[1].uses,1);
});
test('lost-response recovery compares content regardless of JSON object key order',()=>{
 assert.equal(W.savedMatches({id:'1',sections:[{b:2,a:1}],updated_at:'later'},{sections:[{a:1,b:2}],id:'1',updated_at:'earlier'}),true);
 assert.equal(W.savedMatches({id:'1',name:'Someone else edit'},{id:'1',name:'My edit'}),false);
});
const backup=()=>({format:'menu-daily-backup',version:1,library:[{id:99,spanish:'Sopa',catalan:'Sopa CA',category:'primer',owner_id:'synthetic-owner',token:'synthetic-excluded'}],favorites:['primer:sopa'],menus:[{date:'2026-09-05',price:'21,50 €',dishes:{primer:[{spanish:'Sopa',catalan:'Sopa CA'}],segundo:[],postre:[]}}]});
test('portable backup preserves dishes and prices but excludes identifiers and unknown fields',()=>{
 const b=backup();b.session='synthetic-excluded';
 const clean=W.dailyBackup(b);
 assert.equal(clean.menus[0].price,'21,50 €');
 assert.equal(JSON.stringify(clean).includes('synthetic'),false);
 assert.equal(clean.library[0].id,undefined);
 assert.deepEqual(W.dailyBackup(clean),clean);
});
test('backup validation rejects unsupported versions, impossible dates and malformed nested records',()=>{
 for(const change of [b=>b.version=2,b=>b.menus[0].date='2026-02-30',b=>b.menus.push(b.menus[0]),b=>b.library[0].spanish={},b=>b.menus[0].dishes.primer={},b=>b.menus[0].price='Infinity',b=>b.library[0].category='unknown']) {
  const b=backup();change(b);assert.throws(()=>W.dailyBackup(b),/válida/);
 }
});
test('import merges missing records, gives new IDs and remains idempotent without replacing current date',()=>{
 let id=100;const state={library:[],history:{},metadata:{},favorites:[],activeDate:'2026-09-06'};
 const first=W.planDailyImport(backup(),state,()=>++id);
 assert.equal(first.addedDishes,1);assert.equal(first.addedMenus,1);assert.deepEqual(first.favorites,['101']);
 assert.notEqual(first.library[0].id,first.history['2026-09-05'].primer[0].id);
 const second=W.planDailyImport(backup(),{...first,activeDate:state.activeDate},()=>++id);
 assert.equal(second.addedDishes,0);assert.equal(second.addedMenus,0);
 const active=W.planDailyImport(backup(),{...state,activeDate:'2026-09-05'},()=>++id);
 assert.equal(active.addedMenus,0);
 assert.deepEqual(state.library,[]);
});
test('large imports avoid ID collisions even when the generator repeats a value',()=>{
 const state={library:[{id:100,spanish:'Existing',category:'primer'}],history:{},metadata:{},favorites:[],activeDate:'2026-09-06'};
 const result=W.planDailyImport(backup(),state,()=>100);
 assert.equal(result.library[1].id,101);
 assert.equal(result.history['2026-09-05'].primer[0].id,102);
});
test('closed backup keeps menu columns and drafts but drops owner and session fields',()=>{
 const cloud={...base(),name:'Grupos',owner_id:'user-1',updated_at:'2026-09-01T00:00:00Z'};
 const draft={...base(),id:'new',name:'Borrador',_isNew:true,_baseUpdatedAt:'x'};
 const b=W.closedBackup([cloud,null,{id:''}],[draft],{exportedAt:'2026-09-26T20:00:00Z',source:'cloud'});
 assert.equal(b.format,'menus-cerrados-backup');assert.equal(b.source,'cloud');
 assert.equal(b.menus.length,1);assert.equal(b.menus[0].owner_id,undefined);
 assert.equal(b.menus[0].sections[0].dishes[0].name,'Sopa');
 assert.equal(b.drafts[0].name,'Borrador');assert.equal(b.drafts[0]._isNew,undefined);
 b.menus[0].sections[0].title='changed';assert.equal(cloud.sections[0].title,'Entrantes');
});
const cm=(id,extra={})=>({id,name:'Menu '+id.slice(0,4),type:'grupos',language:'es',version:1,updated_at:'2026-09-01T00:00:00Z',sections:[{id:'s',title:'Entrantes',dishes:[{id:'d',name:'Sopa'}]}],...extra});
const U=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
const file=(menus,drafts=[])=>({format:'menus-cerrados-backup',version:1,source:'cloud',menus,drafts});
test('closed restore adds only missing menus and never replaces existing cloud rows or local drafts',()=>{
 const f=file([cm(U(1)),cm(U(2),{name:'Backup name'})],[cm(U(2),{name:'Unsaved edit'}),cm(U(3),{name:'New draft'}),cm(U(4)),cm(U(5))]);
 const cloud=[cm(U(2),{name:'Cloud name'}),cm(U(4))];
 const plan=W.planClosedRestore(f,cloud,{[U(5)]:cm(U(5),{name:'Local draft'})});
 assert.deepEqual(plan.insert.map(m=>m.id),[U(1)]);assert.equal(plan.existing,1);
 assert.deepEqual(plan.drafts.map(d=>[d.id,d._isNew||false,d._baseUpdatedAt||null]),[[U(2),false,'2026-09-01T00:00:00Z'],[U(3),true,null]]);
 assert.deepEqual(plan.skippedDrafts.map(d=>d.id),[U(4),U(5)]);
 const again=W.planClosedRestore(f,[...cloud,...plan.insert],{[U(5)]:{},...Object.fromEntries(plan.drafts.map(d=>[d.id,d]))});
 assert.equal(again.insert.length,0);assert.equal(again.drafts.length,0);
});
test('closed restore rejects wrong format, bad ids, duplicates and malformed sections',()=>{
 assert.throws(()=>W.parseClosedBackup({format:'menu-daily-backup',version:1,menus:[]}));
 assert.throws(()=>W.parseClosedBackup(file([cm('not-a-uuid')])));
 assert.throws(()=>W.parseClosedBackup(file([cm(U(1)),cm(U(1))])));
 assert.throws(()=>W.parseClosedBackup(file([cm(U(1),{sections:[{title:'x',dishes:[null]}]})])));
 assert.throws(()=>W.parseClosedBackup(file([cm(U(1),{price:-5})])));
 const ok=W.parseClosedBackup(file([cm(U(1),{owner_id:'someone',_isNew:true})]));
 assert.equal(ok.menus[0].owner_id,undefined);assert.equal(ok.menus[0]._isNew,undefined);
});
test('dish price is split from a single trailing price and formatted for the carta',()=>{
 assert.deepEqual(W.splitDishPrice('Brocheta de pollo con salsa de teriyaki – 8.50€​'),{name:'Brocheta de pollo con salsa de teriyaki',price:'8.50'});
 assert.deepEqual(W.splitDishPrice('Salmon tartar €12,95'),{name:'Salmon tartar',price:'12.95'});
 assert.equal(W.splitDishPrice('Chuletón 350g – 19.95€ / 500g – 29.95€'),null);
 assert.equal(W.splitDishPrice('Menú de 25€ para grupos'),null);
 assert.equal(W.splitDishPrice('Croquetas caseras'),null);
 assert.equal(W.formatDishPrice('8.5'),'8.50 €');
 assert.equal(W.formatDishPrice('19,95 / 29.95 €'),'19.95 € / 29.95 €');
 assert.equal(W.formatDishPrice('S/M'),'S/M');
 assert.equal(W.formatDishPrice(''),'');
});

test('library duplicates group same dish ignoring case, spaces, accents, surcharges and trailing dots; favorite is kept', () => {
  const lib = [
    { id: 1, spanish: 'Macarrones a la boloñesa', catalan: 'Macarrons', category: 'primer', created_at: '2026-01-01' },
    { id: 2, spanish: 'macarrones  a la bolonesa.', catalan: 'Macarrons', category: 'primer', created_at: '2025-01-01' },
    { id: 4, spanish: 'Flan', catalan: 'Flam', category: 'postre' },
    { id: 5, spanish: 'Gambas al ajillo (+3.50€)', catalan: 'Gambes', category: 'primer' },
    { id: 6, spanish: 'Gambas al ajillo(+3.50€)', catalan: 'Gambes', category: 'primer' },
    { id: 7, spanish: 'Costillas de cabrito (+4.00€)', catalan: 'Costelles', category: 'segundo' },
    { id: 8, spanish: 'Costillas de cabrito (+ 3,50 €)', catalan: 'Costelles', category: 'segundo' },
    { id: 9, spanish: 'Pan (integral)', catalan: 'Pa', category: 'primer' }
  ];
  let groups = W.libraryDuplicates(lib, []);
  assert.deepEqual(groups.map(g => g.dishes.map(d => d.id)), [[1, 2], [5, 6], [7, 8]]);
  assert.equal(groups[0].keepId, 2); // oldest
  assert.equal(groups.some(g => g.crossCategory), false);
  groups = W.libraryDuplicates(lib, ['1']);
  assert.equal(groups[0].keepId, 1); // favorite wins
  const merged = W.mergeLibraryDuplicates(lib, ['2'], [{ dishes: groups[0].dishes, keepId: 1 }]);
  assert.deepEqual(merged.library.map(d => d.id), [1, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(merged.removedIds, [2]);
  assert.deepEqual(merged.favorites, ['1']);
});

test('same dish in different categories is reported, and "not duplicates" hides a group until it changes', () => {
  const lib = [
    { id: 1, spanish: 'Dorada a la espalda', catalan: 'Orada', category: 'primer' },
    { id: 2, spanish: 'Dorada a la espalda', catalan: 'Orada', category: 'segundo' }
  ];
  const [group] = W.libraryDuplicates(lib);
  assert.equal(group.crossCategory, true);
  assert.deepEqual(group.categories, ['primer', 'segundo']);
  assert.equal(W.libraryDuplicates(lib, [], [group.ignoreKey]).length, 0);
  const grown = [...lib, { id: 3, spanish: 'dorada a la espalda', catalan: 'Orada', category: 'segundo' }];
  assert.equal(W.libraryDuplicates(grown, [], [group.ignoreKey]).length, 1);
});

test('cloud library merge keeps unsynced local edits and drops a dish another device already saved', () => {
  const cloud = [{ id: 10, spanish: 'Sopa', catalan: 'Sopa', category: 'primer' }, { id: 11, spanish: 'Pollo', catalan: 'Pollastre', category: 'segundo' }];
  const local = [{ id: 20, spanish: ' sopa ', catalan: 'Sopa', category: 'primer' }, { id: 21, spanish: 'Lomo', catalan: 'Llom', category: 'segundo' }, { id: 11, spanish: 'Pollo asado', catalan: 'Pollastre rostit', category: 'segundo' }];
  const r = W.mergeCloudLibrary(cloud, local, { localPending: true, deletes: [10] });
  assert.equal(r.dropped, 0); // the cloud Sopa is being deleted here, so the local one stays
  assert.deepEqual(r.library.map(d => d.id), [20, 21, 11]);
  const r2 = W.mergeCloudLibrary(cloud, local, { localPending: true });
  assert.equal(r2.dropped, 1);
  assert.deepEqual(r2.library.map(d => d.id), [21, 10, 11]);
  assert.equal(r2.library.find(d => d.id === 11).spanish, 'Pollo asado');
  assert.deepEqual(W.mergeCloudLibrary(cloud, local).library.map(d => d.id), [10, 11]);
});
