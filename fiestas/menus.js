// Festive menus 2026/27 — the single source of truth for the guest page (pedido.html)
// and the staff page (fiestas.html). DRAFT: replace dishes when the final menus are set.
// Dish keys are stored in orders, so do not rename a key once guests have started ordering.
// Photos: fiestas/img/<key>.jpg (missing photo → text card).
window.FIESTAS = {
  restaurant: 'Restaurant Sol',
  courses: [
    { id: 'primero', es: 'Primer plato', ca: 'Primer plat', zh: '头道' },
    { id: 'segundo', es: 'Segundo plato', ca: 'Segon plat', zh: '主菜' },
    { id: 'postre',  es: 'Postre',        ca: 'Postres',    zh: '甜点' }
  ],
  tags: {
    firma: { es: 'Del chef', ca: 'Del xef' },
    veg:   { es: 'Vegetariano', ca: 'Vegetarià' },
    sup:   { es: 'Suplemento', ca: 'Suplement' }
  },
  days: [
    {
      date: '2026-12-25', name: 'Navidad', ca: 'Nadal', zh: '圣诞节', price: 55.5, kidsPrice: 22,
      deadline: '2026-12-10', theme: 'navidad',
      pica: { key: 'pica25b', items: [
        { es: 'Tabla de embutidos ibéricos y queso', plate: true },
        { es: 'Langostinos cocidos con mayonesa de cítricos', perPerson: 1 },
        { es: 'Torreznos de Soria con salsa agridulce y pico de gallo', plate: true },
        { es: 'Pan de coca con tomate y aceite de oliva virgen extra', perPerson: 2 }
      ] },
      menu: {
        primero: [
          { key: 'alca25', es: 'Corazón de alcachofa confitada con setas de temporada y salsa romesco' },
          { key: 'escu25', es: "Escudella i carn d'olla tradicional de Navidad" },
          { key: 'lasa25', es: 'Lasaña de cochinillo con bechamel trufada' },
          { key: 'tart25', es: 'Steak tartar de ternera cortado a cuchillo, alcaparras y tostas' }
        ],
        segundo: [
          { key: 'cabr25', es: 'Pierna de cabrito al horno con patatas panaderas y su jugo al romero' },
          { key: 'melo25', es: 'Meloso de ternera asado 18 horas, deshuesado, con gratinado de patata y salsa demi‑glace al vino tinto' },
          { key: 'seny25', es: 'Arroz del senyoret con vieiras' },
          { key: 'roda25', es: 'Lomo de rodaballo con salsa de cava y azafrán y espinacas a la catalana' }
        ],
        postre: [
          { key: 'qpis25', es: 'Tarta de queso donostiarra de pistacho' },
          { key: 'bola25', es: 'Bola de Navidad', tags: ['firma'] },
          { key: 'coul25', es: 'Coulant de chocolate con helado de vainilla' },
          { key: 'tira25', es: 'Tiramisú casero' }
        ]
      }
    },
    {
      date: '2026-12-26', name: 'Sant Esteve', ca: 'Sant Esteve', zh: '圣斯德望节', price: 55.5, kidsPrice: 22,
      deadline: '2026-12-10', theme: 'esteve',
      pica: { key: 'pica26b', items: [
        { es: 'Tabla de embutidos ibéricos y quesos artesanos', plate: true },
        { es: 'Fritura de pescado', plate: true },
        { es: 'Mini berenjenas rellenas de carne, gratinadas', perPerson: 1 },
        { es: 'Pan de payés con tomate y aceite de oliva virgen extra', perPerson: 2 }
      ] },
      menu: {
        primero: [
          { key: 'burr26', es: 'Ensalada de burrata con tomates cherry, rúcula, pipas de calabaza y salsa de albahaca' },
          { key: 'cane26', es: 'Canelones XXL de carne con bechamel trufada y parmesano gratinado', tags: ['firma'] },
          { key: 'escu26', es: "Escudella i carn d'olla tradicional de Sant Esteve" },
          { key: 'zamb26', es: 'Zamburiñas gratinadas con gambas, mejillones y gulas' }
        ],
        segundo: [
          { key: 'cord26', es: 'Paletilla de cordero al horno con finas hierbas, patatas aromatizadas y salsa de su jugo' },
          { key: 'bacm26', es: 'Lomo de bacalao a la muselina de ajo con patatas panaderas' },
          { key: 'paes26', es: 'Paella del señorito con gambas rojas' },
          { key: 'coch26', es: 'Cochinillo asado deshuesado con piel crujiente, compota de manzana reineta y su jugo' }
        ],
        postre: [
          { key: 'redv26', es: 'Tarta red velvet' },
          { key: 'tron26', es: 'Tronco de Navidad' },
          { key: 'ques26', es: 'Tarta de queso casera con salsa de frutos rojos' },
          { key: 'truf26', es: 'Trufa de chocolate con helado de turrón' }
        ]
      }
    },
    {
      date: '2027-01-01', name: 'Año Nuevo', ca: 'Any Nou', zh: '元旦', price: 55.5, kidsPrice: 22,
      deadline: '2026-12-27', theme: 'nuevo',
      pica: { key: 'pica1b', items: [
        { es: 'Tabla de embutidos selectos de Galicia y queso de tetilla con tostas de pan', plate: true },
        { es: 'Croquetas caseras variadas (jamón ibérico, boletus y pollo rustido)', perPerson: 2 },
        { es: 'Gambas al ajillo con guindilla', plate: true },
        { es: 'Pan de coca con tomate y aceite de oliva virgen extra', perPerson: 2 }
      ] },
      menu: {
        primero: [
          { key: 'cabr1', es: 'Ensalada de queso de cabra gratinado con brotes tiernos, manzana, nueces y vinagreta de miel' },
          { key: 'mari1', es: 'Crema de marisco con vieira a la plancha y picatostes' },
          { key: 'pulp1', es: 'Pulpo a la brasa sobre parmentier de patata con pimentón de la Vera y aceite de oliva' },
          { key: 'cane1', es: 'Canelón negro XL de rape y gambas gratinado con bechamel' }
        ],
        segundo: [
          { key: 'carr1', es: 'Carrillera de ternera estofada al vino tinto con puré de boniato y setas salteadas' },
          { key: 'salm1', es: 'Lomo de salmón a la plancha con salsa de cava, espárragos trigueros y patata panadera' },
          { key: 'arrb1', es: 'Arroz meloso de marisco con bogavante' },
          { key: 'pato1', es: 'Confit de pato con salsa de frutos rojos, patatas gajo, zanahorias baby y costillas de maíz a la brasa' }
        ],
        postre: [
          { key: 'tira1', es: 'Tiramisú casero al estilo tradicional' },
          { key: 'torr1', es: 'Torrija de brioche caramelizada con helado de canela' },
          { key: 'coub1', es: 'Coulant de chocolate blanco con helado de frambuesa' },
          { key: 'coco1', es: 'Helado de coco sobre crema catalana caramelizada' }
        ]
      }
    },
    {
      date: '2027-01-06', name: 'Reyes', ca: 'Reis', zh: '三王节', price: 40, kidsPrice: 22,
      deadline: '2027-01-02', theme: 'reyes',
      pica: { key: 'pica6', items: ['Pan de coca con tomate', 'Croquetas de pollo rustido', { es: 'Calamares a la andaluza', plate: true }, { es: 'Bravas “corona”', plate: true }] },
      menu: {
        primero: [
          { key: 'huev6', es: 'Huevo a baja temperatura, parmentier, setas y jamón', tags: ['firma'] },
          { key: 'mari6', es: 'Crema de marisco con picatostes' },
          { key: 'cabr6', es: 'Ensalada de queso de cabra, granada y nueces', tags: ['veg'] }
        ],
        segundo: [
          { key: 'carr6', es: 'Carrillera ibérica al vino tinto, puré trufado', tags: ['firma'] },
          { key: 'merl6', es: 'Merluza al horno con patata panadera y ajada' },
          { key: 'poll6', es: 'Pollo de corral asado al tomillo' }
        ],
        postre: [
          { key: 'tort6', es: 'Mini tortell de Reyes', tags: ['firma'] },
          { key: 'brow6', es: 'Brownie con helado de vainilla' },
          { key: 'sorm6', es: 'Sorbete de mandarina' }
        ]
      }
    }
  ],
  // Menú infantil, same for the four days (price per day above).
  kids: {
    primero: [
      { key: 'kmac', es: 'Macarrones a la boloñesa' },
      { key: 'kcro', es: 'Croquetas caseras de jamón con patatas chips' }
    ],
    segundo: [
      { key: 'kesc', es: 'Escalopa de pollo con patatas fritas' },
      { key: 'kmer', es: 'Merluza rebozada con puré de patata' }
    ],
    postre: [
      { key: 'khel', es: 'Helado de chocolate y vainilla' },
      { key: 'kbro', es: 'Brownie de chocolate' }
    ]
  }
};

// Shared helpers (both pages).
// Price as written in Spain: 55 → "55", 55.5 → "55,50".
window.FIESTAS.eur = n => Number.isInteger(+n) ? String(+n) : (+n).toFixed(2).replace('.', ',');
window.FIESTAS.dayOf = date => window.FIESTAS.days.find(d => d.date === date);
// Doneness (dishes with punto: true, e.g. the chuletón): the guest picks it per diner, so the order
// stores one key per doneness, <key>~p1 / ~p2 / ~p3, counted like any dish (no DB change needed).
window.FIESTAS.puntos = [
  { id: 'p1', es: 'Poco hecho', ca: 'Poc fet', zh: '偏生（三分）' },
  { id: 'p2', es: 'Al punto', ca: 'Al punt', zh: '适中（五分）' },
  { id: 'p3', es: 'Muy hecho', ca: 'Molt fet', zh: '全熟' }
];
// Menu list as ordered: a punto dish becomes its doneness variants (same order as the menu).
window.FIESTAS.expand = list => list.flatMap(d => !d.punto ? [d] : window.FIESTAS.puntos.map(p => ({
  ...d, key: `${d.key}~${p.id}`, base: d.key, punto: p, es: `${d.es} — ${p.es.toUpperCase()}`,
  ca: `${d.es} — ${p.ca.toUpperCase()}`, zh: `${d.es} — ${p.zh}` })));
window.FIESTAS.dishIndex = (() => {
  const idx = {};
  for (const d of window.FIESTAS.days)
    for (const c of window.FIESTAS.courses) for (const x of [...d.menu[c.id], ...window.FIESTAS.expand(d.menu[c.id])]) idx[x.key] = x;
  for (const c of window.FIESTAS.courses) for (const x of window.FIESTAS.kids[c.id]) idx[x.key] = x;
  return idx;
})();

// Special order lines (stored as keys next to normal dish keys, counted like dishes):
//   otro        guest: "other request", described in the notes; staff resolves it
//   none        staff: this diner skips the course
//   <key>~h     staff: half portion of <key>
//   x~<name>    staff: off-menu dish, free text
window.FIESTAS.OTHER = 'otro';
window.FIESTAS.line = key => {
  const F = window.FIESTAS;
  if (key === 'otro') return { kind: 'otro', es: 'Otra opción (a confirmar con el restaurante)', ca: 'Una altra opció (a confirmar amb el restaurant)', zh: '其他需求（待员工确认）' };
  if (key === 'none') return { kind: 'none', es: 'Sin este plato', ca: 'Sense aquest plat', zh: '不要这道' };
  if (key.startsWith('x~')) { const n = key.slice(2); return { kind: 'custom', es: n, ca: n, zh: n }; }
  const half = key.endsWith('~h'), base = half ? key.slice(0, -2) : key, d = F.dishIndex[base];
  const es = d ? d.es : base + ' (?)', ca = (d && d.ca) || es, zh = (d && d.zh) || es;
  return half ? { kind: 'half', base, es: `½ ${es}`, ca: `½ ${ca}`, zh: `½ ${zh}（半份）` }
              : { kind: 'dish', base, es, ca, zh, sup: d && d.sup };
};

// Pica-pica (shared starter): one plate per ~4 people, never ordered by guests.
//   plates = round(people / 4) (0.5 rounds up, at least 1); people are spread as evenly as
//   possible, bigger plates first: 5 → [5], 6 → [3,3], 7 → [4,3], 9 → [5,4], 10 → [4,3,3].
//   Items are counted two ways (keep it simple):
//     'Croquetas de …'                       → by pieces: perPerson pieces per person (pieces = people × perPerson)
//     { es: 'Langostinos …', perPerson: 2 }  → by pieces, with its own pieces per person
//     { es: 'Calamares …', plate: true }     → by plate: one serving per pica-pica plate, sized like the plate
//                                             (a 4-person plate gets a 4-person serving), no piece count
window.FIESTAS.picaRules = { countKids: true, perPerson: 1 };
// Drinks included (same every day): one drink per menu, adults and kids alike; a bottle of wine
// counts as 4 drinks. 8 menus → 8 drinks, or 2 bottles, or 1 bottle + 4 drinks. Coffee and extra drinks are charged.
window.FIESTAS.drinks = {
  es: 'Bebida incluida: una bebida por menú (agua, refresco o cerveza); una botella de vino (blanco o tinto) cuenta como 4 bebidas. El café y el resto de bebidas se cobran aparte.',
  ca: 'Beguda inclosa: una beguda per menú (aigua, refresc o cervesa); una ampolla de vi (blanc o negre) compta com a 4 begudes. El cafè i la resta de begudes es cobren a part.'
};
window.FIESTAS.drinksFor = b => { const n = b.adults + b.kids; return { n, bottles: Math.floor(n / 4) }; };
window.FIESTAS.picaItem = it => {
  const pp = window.FIESTAS.picaRules.perPerson;
  return typeof it === 'string' ? { es: it, plate: false, pp } : { es: it.es, plate: !!it.plate, pp: it.perPerson || pp };
};
window.FIESTAS.picaPeople = b => b.adults + (window.FIESTAS.picaRules.countKids ? b.kids : 0);
window.FIESTAS.picaSplit = n => {
  if (n <= 0) return [];
  const plates = Math.max(1, Math.floor(n / 4 + 0.5)), base = Math.floor(n / plates), extra = n % plates;
  return Array.from({ length: plates }, (_, i) => base + (i < extra ? 1 : 0));
};
