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
