// Browser regression fixture; loaded only through an intercepted SDK request.
(function () {
  const owner_id = 'test-manager';
  const section = (id,title,dishes) => ({id,title,subtitle:'',mode:'choose_one',dishes});
  const dish = (id,name) => ({id,name});
  const common = {version:1,type:'otro',price:25,price_label:'por persona',drinks:'Agua',notes:'',tags:[],updated_at:'2026-09-06T10:00:00.000Z'};
  const tables = {
    dishes: [{id:101,spanish:'Sopa de verduras',catalan:'Sopa de verdures',category:'primer',owner_id}],
    selected_menu: [], menu_history: [], settings: [],
    menus_cerrados: [
      {...common,id:'es-demo',name:'Menú prueba ES',language:'es',sections:[section('starters','Entrantes',[dish('blank',''),dish('soup','Sopa'),dish('fish','Pescado')])]},
      {...common,id:'ca-demo',parent_id:'es-demo',name:'Menú prova CA',language:'ca',sections:[section('starters','Entrants',[dish('fish','Peix'),dish('soup','Sopa catalana')])]},
      {...common,id:'legacy-es',name:'Menú antiguo ES',language:'es',sections:[section('s-es','Platos',[dish('d-es','Pollo')])]},
      {...common,id:'legacy-ca',parent_id:'legacy-es',name:'Menú antic CA',language:'ca',sections:[section('s-ca','Plats',[dish('d-ca','Pollastre')])]}
    ]
  };
  window.__fixture = { tables, writes: [], rejectWrites: false };
  window.supabase = { createClient() { return {
    auth: {getSession:async()=>({data:{session:{user:{id:owner_id,email:'manager@example.invalid'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from(table) {
      let op='select',payload,single=false,filters=[],options={};
      const q={select(){return q;},order(){return q;},limit(){return q;},abortSignal(){return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},
        insert(v){op='insert';payload=v;return q;},update(v){op='update';payload=v;return q;},upsert(v,o={}){op='upsert';payload=v;options=o;return q;},delete(){op='delete';return q;},
        then(resolve,reject){return Promise.resolve().then(()=>{
          let rows=tables[table]||[];
          if(op!=='select') {
            window.__fixture.writes.push({table,op});
            if(window.__fixture.rejectWrites)return {error:{message:'Simulated rejection'},data:null};
          }
          const match=r=>filters.every(([k,v])=>r[k]===v);
          if(op==='insert'||op==='upsert') {
            const items=Array.isArray(payload)?payload:[payload];
            for(const item of items) {const key=options.onConflict||'id';const i=rows.findIndex(r=>r[key]===item[key]);if(i<0)rows.push(structuredClone(item));else if(op==='upsert')rows[i]={...rows[i],...structuredClone(item)};else return {error:{message:'Duplicate'},data:null};}
            tables[table]=rows;rows=items.map(i=>structuredClone(i));
          } else if(op==='update') {rows=rows.filter(match).map(r=>Object.assign(r,structuredClone(payload)));}
          else if(op==='delete'){tables[table]=rows.filter(r=>!match(r));rows=rows.filter(match);}
          else rows=rows.filter(match);
          return {error:null,data:structuredClone(single?(rows[0]||null):rows)};
        }).then(resolve,reject);}
      };return q;
    }
  };}};
})();
