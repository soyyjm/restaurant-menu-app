// Draws one day's festive menu (with dish photos) as a tall image the host can send to the
// rest of the table by WhatsApp, or save as a PDF. Everyone looks, tells the host what they
// want, and the host enters the totals. Used by pedido.html (host) and fiestas.html (staff).
(function () {
  const F = window.FIESTAS;
  const W = 1080, PAD = 64, GAP = 32, COL = (W - PAD * 2 - GAP) / 2, PH = 330;
  const ACCENT = { navidad: '#9e2a2b', esteve: '#2f5d46', nuevo: '#1f3557', reyes: '#5b3474' };
  const C = { bg: '#f7f2ea', card: '#fffdf9', ink: '#2a211b', muted: '#7a6c60', line: '#e6dccd', gold: '#b8893b', warn: '#a2561a' };
  const SERIF = '"Cormorant Garamond", Georgia, serif', SANS = 'Jost, "Helvetica Neue", Arial, sans-serif';
  const TXT = {
    es: { menu: 'Menú de', perAdult: 'por adulto', kids: 'Menú infantil', pica: 'Para compartir', picaNote: 'Pica-pica de bienvenida, una tabla por cada 4 personas, con pan',
      choose: 'elige uno', tellHost: h => `Elige un primero, un segundo y un postre y díselo a ${h}.`, tell: 'Elige un primero, un segundo y un postre.',
      closed: 'Menú cerrado: el precio es el mismo aunque alguien tome media ración o no tome algún plato.', locale: 'es-ES' },
    ca: { menu: 'Menú de', perAdult: 'per adult', kids: 'Menú infantil', pica: 'Per compartir', picaNote: 'Pica-pica de benvinguda, una taula per cada 4 persones, amb pa',
      choose: 'tria’n un', tellHost: h => `Tria un primer, un segon i unes postres i digues-ho a ${h}.`, tell: 'Tria un primer, un segon i unes postres.',
      closed: 'Menú tancat: el preu és el mateix encara que algú prengui mitja ració o no prengui algun plat.', locale: 'ca-ES' }
  };

  const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/), lines = [];
    let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function cover(ctx, img, x, y, w, h, r) {
    ctx.save(); rrect(ctx, x, y, w, h, r); ctx.clip();
    if (img) { const s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s; ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); }
    else { ctx.fillStyle = C.line; ctx.fillRect(x, y, w, h); }
    ctx.restore();
  }

  // opts: { lang: 'es'|'ca', kids: bool, host: string|null }
  async function render(date, opts = {}) {
    const day = F.dayOf(date), L = TXT[opts.lang] || TXT.es, accent = ACCENT[day.theme] || ACCENT.navidad;
    try { await Promise.all([`600 80px ${SERIF}`, `500 30px ${SANS}`, `600 30px ${SANS}`, `italic 500 40px ${SERIF}`].map(f => document.fonts.load(f))); } catch {}
    const sections = F.courses.map(c => ({ title: c[opts.lang === 'ca' ? 'ca' : 'es'], dishes: day.menu[c.id] }));
    if (opts.kids) for (const c of F.courses) sections.push({ title: `${L.kids} · ${c[opts.lang === 'ca' ? 'ca' : 'es']}`, dishes: F.kids[c.id], small: true });
    const keys = [day.pica.key, ...sections.flatMap(s => s.dishes.map(d => d.key))];
    const imgs = Object.fromEntries(await Promise.all(keys.map(async k => [k, await loadImg(`/fiestas/img/${k}.jpg`)])));

    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    // Measure pass: card heights depend on wrapped names.
    ctx.font = `500 32px ${SANS}`;
    const cardH = (d, small) => (small ? 240 : PH) + 24 + wrap(ctx, d.es, COL - 40).length * 40 + ((d.tags || []).length ? 46 : 0) + 34;
    ctx.font = `italic 500 40px ${SERIF}`;
    const intro = wrap(ctx, opts.host ? L.tellHost(opts.host) : L.tell, W - PAD * 2);
    let H = 360 + 40 + intro.length * 50 + 300;   // header, intro, pica
    for (const s of sections) {
      H += 110;
      for (let i = 0; i < s.dishes.length; i += 2) H += Math.max(...s.dishes.slice(i, i + 2).map(d => cardH(d, s.small))) + GAP;
    }
    H += 170;   // footer
    cv.width = W; cv.height = H;

    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // Header
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 360);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `500 26px ${SANS}`; ctx.letterSpacing = '8px'; ctx.fillText(F.restaurant.toUpperCase(), W / 2, 82); ctx.letterSpacing = '0px';
    ctx.font = `600 84px ${SERIF}`; ctx.fillText(`${L.menu} ${opts.lang === 'ca' ? day.ca : day.name}`, W / 2, 180);
    const when = new Intl.DateTimeFormat(L.locale, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(day.date + 'T12:00:00Z'));
    ctx.font = `400 32px ${SANS}`; ctx.fillText(when.charAt(0).toUpperCase() + when.slice(1), W / 2, 236);
    ctx.font = `600 36px ${SANS}`; ctx.fillText(`${day.price} € ${L.perAdult}${opts.kids ? `  ·  ${L.kids} ${day.kidsPrice} €` : ''}`, W / 2, 308);

    // Intro
    let y = 360 + 62;
    ctx.fillStyle = C.ink; ctx.font = `italic 500 40px ${SERIF}`;
    intro.forEach((l, k) => ctx.fillText(l, W / 2, y + k * 50));
    ctx.textAlign = 'left';

    // Pica-pica
    y += (intro.length - 1) * 50 + 40;
    ctx.fillStyle = C.card; rrect(ctx, PAD, y, W - PAD * 2, 250, 22); ctx.fill();
    cover(ctx, imgs[day.pica.key], PAD + 20, y + 20, 210, 210, 16);
    ctx.fillStyle = C.ink; ctx.font = `600 44px ${SERIF}`; ctx.fillText(L.pica, PAD + 260, y + 66);
    ctx.fillStyle = C.muted; ctx.font = `400 24px ${SANS}`; ctx.fillText(L.picaNote, PAD + 260, y + 102);
    ctx.fillStyle = C.ink; ctx.font = `400 27px ${SANS}`;
    day.pica.items.forEach((it, i) => ctx.fillText('·  ' + F.picaItem(it).es, PAD + 260, y + 146 + i * 30));
    y += 250 + 10;

    // Courses
    for (const s of sections) {
      y += 90;
      ctx.fillStyle = C.ink; ctx.font = `600 54px ${SERIF}`; ctx.fillText(s.title, PAD, y);
      const tw = ctx.measureText(s.title).width;
      ctx.fillStyle = C.gold; ctx.font = `600 24px ${SANS}`; ctx.letterSpacing = '3px'; ctx.fillText(L.choose.toUpperCase(), PAD + tw + 24, y - 6); ctx.letterSpacing = '0px';
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y + 18); ctx.lineTo(W - PAD, y + 18); ctx.stroke();
      y += 20;
      for (let i = 0; i < s.dishes.length; i += 2) {
        const pair = s.dishes.slice(i, i + 2), rowH = Math.max(...pair.map(d => cardH(d, s.small)));
        pair.forEach((d, j) => {
          const x = PAD + j * (COL + GAP), ph = s.small ? 240 : PH;
          ctx.fillStyle = C.card; rrect(ctx, x, y, COL, rowH, 22); ctx.fill();
          cover(ctx, imgs[d.key], x, y, COL, ph, 22);
          ctx.fillStyle = C.card; ctx.fillRect(x, y + ph - 22, COL, 22);   // square off the photo's bottom corners
          ctx.fillStyle = C.ink; ctx.font = `500 32px ${SANS}`;
          const lines = wrap(ctx, d.es, COL - 40);
          lines.forEach((l, k) => ctx.fillText(l, x + 20, y + ph + 50 + k * 40));
          let tx = x + 20; const ty = y + ph + 50 + lines.length * 40 + 2;
          for (const tg of d.tags || []) {
            const label = tg === 'sup' ? `+${d.sup} €` : F.tags[tg][opts.lang === 'ca' ? 'ca' : 'es'];
            ctx.font = `500 22px ${SANS}`; const w = ctx.measureText(label).width + 28;
            ctx.strokeStyle = tg === 'firma' ? C.gold : tg === 'sup' ? C.warn : C.muted; ctx.lineWidth = 2;
            rrect(ctx, tx, ty, w, 36, 18); ctx.stroke();
            ctx.fillStyle = ctx.strokeStyle; ctx.fillText(label, tx + 14, ty + 26); tx += w + 10;
          }
        });
        y += rowH + GAP;
      }
    }

    // Footer
    y += 40;
    ctx.fillStyle = C.muted; ctx.font = `400 26px ${SANS}`; ctx.textAlign = 'center';
    wrap(ctx, L.closed, W - PAD * 2).forEach((l, k) => ctx.fillText(l, W / 2, y + k * 34));
    ctx.fillStyle = accent; ctx.font = `600 30px ${SERIF}`; ctx.fillText(F.restaurant, W / 2, H - 40);
    return cv;
  }

  const fileName = (date, ext) => `Menu-${F.dayOf(date).name.replace(/\s+/g, '-')}-${F.restaurant.replace(/\s+/g, '-')}.${ext}`;
  const toBlob = cv => new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  let jsPdfLoading = null;
  const loadJsPdf = () => jsPdfLoading || (jsPdfLoading = new Promise((res, rej) => {
    if (window.jspdf) return res(window.jspdf);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf); s.onerror = () => { jsPdfLoading = null; rej(new Error('jsPDF')); };
    document.head.appendChild(s);
  }));

  window.FiestasMenuImage = {
    render,
    // Share as an image (phone share sheet → WhatsApp); falls back to downloading the JPG.
    async shareImage(date, opts, text) {
      const blob = await toBlob(await render(date, opts)), file = new File([blob], fileName(date, 'jpg'), { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text }); return 'shared'; }
        catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
      }
      download(blob, file.name); return 'downloaded';
    },
    async downloadImage(date, opts) { download(await toBlob(await render(date, opts)), fileName(date, 'jpg')); },
    // One long page, same proportions as the image (reads well on a phone, prints fine).
    async downloadPdf(date, opts) {
      const [cv, lib] = await Promise.all([render(date, opts), loadJsPdf()]);
      const w = 210, h = w * cv.height / cv.width;
      const pdf = new lib.jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait' });
      pdf.addImage(cv.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, w, h);
      pdf.save(fileName(date, 'pdf'));
    }
  };
})();
