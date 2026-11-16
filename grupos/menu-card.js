// Draws a group menu (text only, like the printed Menú cerrado) as an image the organizer can
// send to the group, or save as a PDF. Used by grupo.html (organizer) and grupos.html (staff).
(function () {
  const M = window.GruposAPI.M;
  const W = 1080, PAD = 90;
  const C = { bg: '#faf8f3', ink: '#1f1b16', muted: '#7d7468', gold: '#a8834a', line: '#e3dccf' };
  const SERIF = '"Cormorant Garamond", Georgia, serif', SANS = 'Jost, "Helvetica Neue", Arial, sans-serif';
  const T = {
    es: { pp: 'por persona (IVA incluido)', choose: 'A elegir uno', shared: 'Para compartir', drinks: 'Bebidas incluidas', allergens: 'Alérgenos',
      tell: o => `Elige un plato de cada apartado y díselo a ${o}.`, tellNo: 'Elige un plato de cada apartado.', locale: 'es-ES' },
    ca: { pp: 'per persona (IVA inclòs)', choose: 'A triar un', shared: 'Per compartir', drinks: 'Begudes incloses', allergens: 'Al·lèrgens',
      tell: o => `Tria un plat de cada apartat i digues-ho a ${o}.`, tellNo: 'Tria un plat de cada apartat.', locale: 'ca-ES' }
  };
  function wrap(ctx, text, maxW) {
    const out = []; let cur = '';
    for (const w of String(text).split(/\s+/)) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur); return out;
  }

  // ev: { menu, date, time, organizer, title }, opts: { lang }
  async function render(ev, opts = {}) {
    const lang = opts.lang === 'ca' ? 'ca' : 'es', L = T[lang], menu = ev.menu;
    try { await Promise.all([`600 80px ${SERIF}`, `400 34px ${SERIF}`, `italic 500 30px ${SERIF}`, `500 24px ${SANS}`].map(f => document.fonts.load(f))); } catch {}
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    // Build a list of draw operations first so the canvas height is exact.
    const ops = []; let y = 0;
    const add = (h, fn) => { const y0 = y; ops.push(() => fn(y0)); y += h; };
    const center = (font, color, text, size, gap = 0, spacing = 0) => {
      ctx.font = font; const lines = wrap(ctx, text, W - PAD * 2);
      lines.forEach(l => add(size, y0 => { ctx.font = font; ctx.fillStyle = color; ctx.letterSpacing = spacing + 'px'; ctx.fillText(l, W / 2, y0 + size * 0.8); ctx.letterSpacing = '0px'; }));
      y += gap;
    };
    const rule = (w, gap) => { add(2, y0 => { ctx.fillStyle = C.line; ctx.fillRect(W / 2 - w / 2, y0, w, 2); }); y += gap; };

    y = 90;
    center(`500 24px ${SANS}`, C.muted, 'RESTAURANTE SOL', 30, 26, 7);
    center(`600 84px ${SERIF}`, C.ink, M.tr(menu, 'name', lang) || menu.name, 90, 10);
    if (ev.date) {
      const d = new Intl.DateTimeFormat(L.locale, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ev.date + 'T12:00:00Z'));
      center(`italic 500 34px ${SERIF}`, C.gold, (d.charAt(0).toUpperCase() + d.slice(1)) + (ev.time ? ` · ${ev.time}` : ''), 40, 20);
    }
    rule(160, 34);
    if (menu.price != null) {
      center(`600 64px ${SERIF}`, C.ink, `${Number(menu.price).toFixed(2)}€`, 66, 4);
      center(`400 24px ${SANS}`, C.muted, (lang === 'ca' && menu.ca && menu.ca.price_label) || menu.price_label || L.pp, 30, 40);
    }
    const allergenUse = new Set();
    for (const s of menu.sections || []) {
      if (!(s.dishes || []).length) continue;
      center(`600 26px ${SANS}`, C.gold, (M.tr(s, 'title', lang) || '').toUpperCase(), 32, 6, 6);
      rule(70, 12);
      const sub = s.mode === 'choose_one' ? L.choose : s.mode === 'shared' ? L.shared : '';
      if (sub) center(`italic 500 28px ${SERIF}`, C.muted, sub, 34, 14);
      for (const d of s.dishes) {
        ctx.font = `400 36px ${SERIF}`;
        const name = M.tr(d, 'name', lang), sup = d.supplement ? `  +${Number(d.supplement).toFixed(2)}€` : '';
        const lines = wrap(ctx, name, W - PAD * 2 - (sup ? 120 : 0));
        lines.forEach((l, i) => add(44, y0 => {
          ctx.font = `400 36px ${SERIF}`; ctx.fillStyle = C.ink;
          const last = i === lines.length - 1, tw = ctx.measureText(l).width;
          ctx.font = `600 22px ${SANS}`; const sw = last && sup ? ctx.measureText(sup).width : 0;
          const x0 = W / 2 - (tw + sw) / 2;
          ctx.font = `400 36px ${SERIF}`; ctx.textAlign = 'left'; ctx.fillText(l, x0, y0 + 34);
          if (last && sup) { ctx.font = `600 22px ${SANS}`; ctx.fillStyle = C.gold; ctx.fillText(sup, x0 + tw, y0 + 30); }
          ctx.textAlign = 'center';
        }));
        const al = M.allergens(d, lang);
        if (al.length) { al.forEach(a => allergenUse.add(a)); center(`400 20px ${SANS}`, C.muted, al.join(' · '), 26, 0); }
        y += 14;
      }
      y += 34;
    }
    const drinks = (lang === 'ca' && menu.ca && menu.ca.drinks) || menu.drinks;
    if (drinks) {
      rule(W - PAD * 4, 30);
      center(`600 24px ${SANS}`, C.gold, L.drinks.toUpperCase(), 30, 8, 6);
      center(`italic 500 32px ${SERIF}`, C.ink, drinks, 40, 20);
    }
    if (ev.organizer !== undefined) {
      y += 10;
      center(`italic 500 32px ${SERIF}`, C.ink, ev.organizer ? L.tell(ev.organizer) : L.tellNo, 40, 10);
    }
    y += 30; rule(W - PAD * 2, 26);
    center(`500 22px ${SANS}`, C.muted, 'RESTAURANTE SOL · BARCELONA', 28, 70, 5);

    cv.width = W; cv.height = Math.ceil(y);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, cv.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (const op of ops) op();
    return cv;
  }

  const fileName = (ev, ext) => `Menu-${(ev.menu.name || 'grupo').replace(/[^\w]+/g, '-')}-${ev.date || ''}.${ext}`.replace(/-+\./, '.');
  const toBlob = cv => new Promise(r => cv.toBlob(r, 'image/jpeg', 0.88));
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  let jsPdf = null;
  const loadJsPdf = () => jsPdf || (jsPdf = new Promise((res, rej) => {
    if (window.jspdf) return res(window.jspdf);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf); s.onerror = () => { jsPdf = null; rej(new Error('jsPDF')); }; document.head.appendChild(s);
  }));

  window.GruposMenuCard = {
    render,
    async shareImage(ev, opts, text) {
      const blob = await toBlob(await render(ev, opts)), file = new File([blob], fileName(ev, 'jpg'), { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
      }
      download(blob, file.name); return 'downloaded';
    },
    async downloadImage(ev, opts) { download(await toBlob(await render(ev, opts)), fileName(ev, 'jpg')); },
    // One A4 page, the menu scaled to fit (like the printed Menú cerrado).
    async downloadPdf(ev, opts) {
      const [cv, lib] = await Promise.all([render(ev, opts), loadJsPdf()]);
      const pdf = new lib.jsPDF({ unit: 'mm', format: 'a4' }), pw = 210, ph = 297;
      const scale = Math.min(pw / cv.width, ph / cv.height), w = cv.width * scale, h = cv.height * scale;
      pdf.setFillColor(250, 248, 243); pdf.rect(0, 0, pw, ph, 'F');
      pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
      pdf.save(fileName(ev, 'pdf'));
    }
  };
})();
