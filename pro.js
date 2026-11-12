/* ROUTA – suivi de conduite (score, story), tournée de livraisons et interdictions de circuler.
   Le suivi reste uniquement sur ce téléphone. */
(function () {
  'use strict';
  const A = window.ROUTA, X = window.ROUTA_X;
  if (!A || !X) return;
  const { S, CFG, esc, toast, openSheet, closeSheet, dist, fmtDist, fmtDur, store, chooseDestination } = A;
  const T = (s, v) => { let o = (A.I18N && A.I18N.t) ? A.I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
  const LANG = () => (A.I18N && A.I18N.lang) || 'fr';
  const nf = (n, d) => (+n || 0).toLocaleString(LANG(), { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });
  const ICO = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const IC = {
    gauge: ICO('<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>'),
    route: ICO('<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>'),
    ban: ICO('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>')
  };

  /* =========================================================
     1 · SUIVI DE CONDUITE
     ========================================================= */
  const DRIVES = 'routa.drives';
  const loadDrives = () => store.get(DRIVES, []);
  const saveDrives = (d) => store.set(DRIVES, d.slice(-400));
  const CFGD = Object.assign({ cons: 7, price: null }, store.get('routa.drivecfg', {}));
  const saveCfg = () => store.set('routa.drivecfg', CFGD);
  const curr = () => ((S.country || 'CH') === 'CH' ? 'CHF' : 'EUR');
  const priceL = () => CFGD.price || (curr() === 'CHF' ? 1.85 : 1.75);

  function scoreOf(d) {
    const km = Math.max(d.km, 1);
    const br = d.br / km * 100, ac = d.ac / km * 100;
    const spd = d.lim > 30 ? d.sp / d.lim * 100 : 0;
    const pen = Math.min(30, br * 3) + Math.min(20, ac * 2) + Math.min(40, spd * 1.2);
    return Math.max(0, Math.min(100, Math.round(100 - pen)));
  }
  const scoreLabel = (s) => s >= 90 ? T('Excellent') : s >= 75 ? T('Très bien') : s >= 60 ? T('Bien') : T('À améliorer');

  /* enregistrement automatique des trajets (pendant que l'app est ouverte) */
  let cur = null, lastP = null, lastV = null, lastT = 0, stopSince = 0, lastBr = 0, lastAc = 0;
  function finish() {
    if (!cur) return;
    const d = cur; cur = null;
    if (d.km < 0.5 || d.mv < 120) return;
    d.e = d.le || Date.now();
    d.score = scoreOf(d);
    const all = loadDrives(); all.push(d); saveDrives(all);
  }
  setInterval(() => {
    const now = Date.now();
    const v = S.speed;
    if (document.hidden || v == null || !S.pos) { if (cur && now - (cur.le || now) > 15 * 60000) finish(); lastT = 0; return; }
    const dt = lastT ? (now - lastT) / 1000 : 0; lastT = now;
    if (!cur && v > 3) { cur = { s: now, le: now, km: 0, mv: 0, max: 0, br: 0, ac: 0, sp: 0, lim: 0, nm: '' }; lastP = { lat: S.pos.lat, lon: S.pos.lon }; lastV = v; stopSince = 0; return; }
    if (!cur) return;
    if (dt > 0 && dt < 10) {
      if (v > 1.5) {
        cur.mv += dt; cur.le = now; stopSince = 0;
        const d = dist(lastP, S.pos);
        if (d < 600) cur.km += d / 1000;
        cur.max = Math.max(cur.max, v * 3.6);
        if (S.limit) { cur.lim += dt; if (v * 3.6 > S.limit + 5) cur.sp += dt; }
      } else if (!stopSince) stopSince = now;
      if (lastV != null && v > 5) {
        const a = (v - lastV) / dt;
        if (a < -3.2 && now - lastBr > 6000) { cur.br++; lastBr = now; }
        if (a > 2.8 && now - lastAc > 6000) { cur.ac++; lastAc = now; }
      }
      if (S.nav && S.nav.dest && S.nav.dest.name) cur.nm = S.nav.dest.name;
    }
    lastP = { lat: S.pos.lat, lon: S.pos.lon }; lastV = v;
    if (stopSince && now - stopSince > 8 * 60000) finish();
  }, 1000);
  window.addEventListener('pagehide', () => { if (cur && cur.km >= 0.5) { const d = Object.assign({}, cur, { e: cur.le, score: scoreOf(cur) }); const all = loadDrives(); all.push(d); saveDrives(all); cur = null; } });

  function aggregate(list) {
    const a = { n: list.length, km: 0, mv: 0, max: 0, br: 0, ac: 0, sp: 0, lim: 0 };
    list.forEach((d) => { a.km += d.km; a.mv += d.mv; a.max = Math.max(a.max, d.max); a.br += d.br; a.ac += d.ac; a.sp += d.sp; a.lim += d.lim; });
    a.avg = a.mv > 60 ? a.km / (a.mv / 3600) : 0;
    a.score = a.n ? scoreOf(a) : null;
    a.litres = a.km * CFGD.cons / 100;
    a.cost = a.litres * priceL();
    return a;
  }
  const PER = [['24h', '24 h', 86400000], ['7d', '7 jours', 7 * 86400000], ['30d', '30 jours', 30 * 86400000], ['trips', 'Par trajet', 0]];
  let per = '7d';

  function ring(score, size) {
    const r = size / 2 - 7, c = 2 * Math.PI * r, f = score == null ? 0 : score / 100;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true" style="flex-shrink:0;width:' + size + 'px;height:' + size + 'px"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-size="' + Math.round(size * 0.3) + '" font-weight="800">' + (score == null ? '–' : score) + '</text></svg>';
  }
  const stat = (v, l) => '<div class="limcell"><div class="limv" style="font-size:20px">' + v + '</div><div class="sub">' + esc(l) + '</div></div>';

  function statsHtml(a, title) {
    return '<div class="card" style="display:flex;align-items:center;gap:16px">' + ring(a.score, 92) + '<div class="grow"><div class="sub">' + esc(T('Score de conduite')) + '</div><b style="font-size:20px">' + (a.score == null ? esc(T('Pas encore de trajet')) : esc(scoreLabel(a.score))) + '</b><div class="sub">' + esc(title) + '</div></div></div>' +
      '<div class="limgrid">' + stat(nf(a.km, a.km < 100 ? 1 : 0) + ' km', T('Distance')) + stat(fmtDur(a.mv), T('Temps de conduite')) + stat(nf(a.avg) + ' km/h', T('Vitesse moyenne')) + '</div>' +
      '<div class="limgrid">' + stat(nf(a.max) + ' km/h', T('Vitesse max')) + stat(a.n, T('Trajets')) + stat(curr() + ' ' + nf(a.cost), T('Carburant estimé')) + '</div>' +
      (a.km >= 1 ? '<div class="card"><div class="grow"><b>' + esc(T('Ce qui compte dans ton score')) + '</b><div class="sub">' +
        esc(T('Freinages brusques')) + ' : ' + a.br + ' · ' + esc(T('Accélérations brusques')) + ' : ' + a.ac + ' · ' + esc(T('Au-dessus de la limite')) + ' : ' + (a.lim > 30 ? Math.round(a.sp / a.lim * 100) + ' %' : '–') + '</div></div></div>' : '');
  }

  function openDrive(view) {
    if (view) per = view;
    const all = loadDrives();
    const tabs = '<div class="seg">' + PER.map(([k, l]) => '<button data-p="' + k + '" class="' + (k === per ? 'on' : '') + '">' + esc(T(l)) + '</button>').join('') + '</div>';
    let html = tabs, agg = null, label = '';
    if (per === 'trips') {
      const list = all.slice().reverse().slice(0, 60);
      html += list.length ? list.map((d, i) => '<button class="card tap" data-t="' + (all.length - 1 - i) + '"><div class="grow"><b>' + esc(d.nm || T('Trajet')) + '</b><div class="sub">' + esc(new Date(d.s).toLocaleDateString(LANG(), { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + esc(new Date(d.s).toLocaleTimeString(LANG(), { hour: '2-digit', minute: '2-digit' })) + ' · ' + nf(d.km, 1) + ' km · ' + esc(fmtDur(d.mv)) + '</div></div><span class="pill">' + d.score + '</span></button>').join('')
        : '<div class="empty">' + esc(T('Tes trajets s\'enregistrent ici tout seuls quand tu roules avec ROUTA ouvert.')) + '</div>';
    } else {
      const p = PER.find((x) => x[0] === per);
      agg = aggregate(all.filter((d) => d.s > Date.now() - p[2]));
      label = per === '24h' ? T('Dernières 24 h') : per === '7d' ? T('7 derniers jours') : T('30 derniers jours');
      html += statsHtml(agg, label) + (agg.n ? '<button class="btn primary block" id="drStory">' + esc(T('Partager en story')) + '</button>' : '');
    }
    html += '<details class="card" style="display:block"><summary style="cursor:pointer;font-weight:700">' + esc(T('Réglages du calcul de carburant')) + '</summary>' +
      '<div class="row" style="margin-top:10px"><label class="field grow" for="drCons">' + esc(T('Consommation (l/100 km)')) + '<input id="drCons" type="number" inputmode="decimal" step="0.1" min="2" max="60" value="' + CFGD.cons + '"></label>' +
      '<label class="field grow" for="drPrice">' + esc(T('Prix du litre ({c})', { c: curr() })) + '<input id="drPrice" type="number" inputmode="decimal" step="0.01" min="0.5" max="5" value="' + priceL().toFixed(2) + '"></label></div></details>' +
      '<p class="muted small">' + esc(T('Le suivi fonctionne quand ROUTA est ouvert pendant que tu roules. Tout reste sur ce téléphone.')) + '</p>';
    const body = openSheet(T('Suivi de conduite'), html, 'drive');
    body.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => openDrive(b.dataset.p); });
    body.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => openTrip(+b.dataset.t); });
    const st = body.querySelector('#drStory'); if (st) st.onclick = () => story(agg, label);
    const c = body.querySelector('#drCons'), pr = body.querySelector('#drPrice');
    const sv = () => { const a = parseFloat(String(c.value).replace(',', '.')), b = parseFloat(String(pr.value).replace(',', '.')); if (a > 1 && a < 80) CFGD.cons = a; if (b > 0.3 && b < 6) CFGD.price = b; saveCfg(); };
    c.onchange = () => { sv(); openDrive(); }; pr.onchange = () => { sv(); openDrive(); };
  }

  function openTrip(i) {
    const all = loadDrives(); const d = all[i]; if (!d) return;
    const a = aggregate([d]);
    const day = new Date(d.s).toLocaleDateString(LANG(), { day: 'numeric', month: 'long', year: 'numeric' });
    const hm = (t) => new Date(t).toLocaleTimeString(LANG(), { hour: '2-digit', minute: '2-digit' });
    const body = openSheet(T('Détails du trajet'),
      '<h3 style="margin:0">' + esc(day) + '</h3><p class="muted small" style="margin:2px 0 8px">' + esc(d.nm || T('Trajet')) + ' · ' + esc(hm(d.s)) + ' → ' + esc(hm(d.e || d.le)) + '</p>' +
      statsHtml(a, d.nm || T('Ce trajet')) +
      '<div class="card"><div class="grow"><b>' + esc(T('Carburant')) + '</b><div class="sub">' + nf(a.litres, 1) + ' l · ' + curr() + ' ' + nf(priceL(), 2) + '/l · ' + esc(T('{c} l/100 km', { c: nf(CFGD.cons, 1) })) + '</div></div><b>' + curr() + ' ' + nf(a.cost) + '</b></div>' +
      '<button class="btn primary block" id="trStory">' + esc(T('Partager en story')) + '</button>' +
      '<div class="row"><button class="btn ghost grow" id="trBack">' + esc(T('Retour')) + '</button><button class="btn ghost grow" id="trDel">' + esc(T('Supprimer ce trajet')) + '</button></div>', 'drive');
    body.querySelector('#trStory').onclick = () => story(a, day + (d.nm ? ' · ' + d.nm : ''));
    body.querySelector('#trBack').onclick = () => openDrive('trips');
    let arm = 0;
    body.querySelector('#trDel').onclick = (e) => { if (Date.now() - arm > 4000) { arm = Date.now(); e.target.textContent = T('Touche encore pour supprimer'); return; } all.splice(i, 1); saveDrives(all); openDrive('trips'); };
  }

  /* ---------- story 1080 × 1920 aux couleurs de ROUTA ---------- */
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function fit(c, txt, maxW, size, weight) { let s = size; do { c.font = weight + ' ' + s + 'px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; s -= 2; } while (c.measureText(txt).width > maxW && s > 18); }
  function loadImg(src) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
  async function story(a, label) {
    const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = '#0E1116'; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W * 0.85, 120, 40, W * 0.85, 120, 900); g.addColorStop(0, 'rgba(255,138,61,.35)'); g.addColorStop(1, 'rgba(255,138,61,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const g2 = c.createRadialGradient(80, H - 200, 20, 80, H - 200, 700); g2.addColorStop(0, 'rgba(79,168,255,.18)'); g2.addColorStop(1, 'rgba(79,168,255,0)'); c.fillStyle = g2; c.fillRect(0, 0, W, H);
    const logo = await loadImg('icons/icon-512.png');
    if (logo) { c.save(); rr(c, 90, 150, 120, 120, 30); c.clip(); c.drawImage(logo, 90, 150, 120, 120); c.restore(); }
    c.fillStyle = '#F4F6FA'; fit(c, 'ROUTA', 600, 64, '800'); c.fillText('ROUTA', 240, 228);
    c.fillStyle = '#FF8A3D'; fit(c, T('Mon suivi de conduite').toUpperCase(), 900, 34, '800'); c.fillText(T('Mon suivi de conduite').toUpperCase(), 90, 380);
    c.fillStyle = '#9AA3AF'; fit(c, label, 900, 40, '600'); c.fillText(label, 90, 440);
    /* anneau du score */
    const cx = W / 2, cy = 760, R = 230;
    c.lineWidth = 34; c.lineCap = 'round'; c.strokeStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    const sc = a.score == null ? 0 : a.score;
    const gr = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R); gr.addColorStop(0, '#FFC531'); gr.addColorStop(1, '#FF8A3D');
    c.strokeStyle = gr; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sc / 100); c.stroke();
    c.textAlign = 'center'; c.fillStyle = '#F4F6FA'; c.font = '800 190px Inter, system-ui, -apple-system, sans-serif'; c.fillText(String(a.score == null ? '–' : sc), cx, cy + 62);
    c.fillStyle = '#9AA3AF'; fit(c, T('Score de conduite'), 400, 34, '600'); c.fillText(T('Score de conduite'), cx, cy + 120);
    c.fillStyle = '#FF8A3D'; fit(c, a.score == null ? '' : scoreLabel(sc), 700, 54, '800'); c.fillText(a.score == null ? '' : scoreLabel(sc), cx, cy + R + 110);
    c.textAlign = 'left';
    /* cartes */
    const cards = [[nf(a.km, a.km < 100 ? 1 : 0) + ' km', T('Distance')], [fmtDur(a.mv), T('Temps de conduite')], [nf(a.avg) + ' km/h', T('Vitesse moyenne')], [nf(a.max) + ' km/h', T('Vitesse max')]];
    const cw = 435, ch = 190, x0 = 90, y0 = 1180, gap = 30;
    cards.forEach(([v, l], i) => {
      const x = x0 + (i % 2) * (cw + gap), y = y0 + Math.floor(i / 2) * (ch + gap);
      c.fillStyle = '#171B22'; rr(c, x, y, cw, ch, 36); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 2; rr(c, x, y, cw, ch, 36); c.stroke();
      c.fillStyle = '#F4F6FA'; fit(c, v, cw - 70, 64, '800'); c.fillText(v, x + 36, y + 96);
      c.fillStyle = '#9AA3AF'; fit(c, l, cw - 70, 30, '600'); c.fillText(l, x + 36, y + 148);
    });
    c.fillStyle = '#FF8A3D'; rr(c, 90, 1640, W - 180, 120, 60); c.fill();
    c.fillStyle = '#1A1205'; c.textAlign = 'center'; fit(c, T('Roule avec ROUTA') + ' · routa.ackfix.com', W - 260, 40, '800'); c.fillText(T('Roule avec ROUTA') + ' · routa.ackfix.com', W / 2, 1714);
    c.textAlign = 'left';
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const file = blob && new File([blob], 'routa-story.png', { type: 'image/png' });
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'ROUTA' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = cv.toDataURL('image/png');
    const body = openSheet(T('Ta story'), '<img src="' + url + '" alt="" style="width:100%;border-radius:18px;display:block">' +
      '<p class="muted small">' + esc(T('Appuie longuement sur l\'image pour l\'enregistrer, puis ajoute-la à ta story Instagram.')) + '</p>' +
      '<a class="btn primary block" download="routa-story.png" href="' + url + '">' + esc(T('Télécharger l\'image')) + '</a>' +
      '<button class="btn ghost block" id="stBack">' + esc(T('Retour')) + '</button>', 'drive');
    body.querySelector('#stBack').onclick = () => openDrive();
  }

  /* =========================================================
     2 · TOURNÉE DE LIVRAISONS (meilleur ordre de passage)
     ========================================================= */
  const TOUR = Object.assign({ stops: [], ret: false, order: null, sum: null }, store.get('routa.tour', {}));
  const saveTour = () => store.set('routa.tour', TOUR);
  let searchT = 0;
  async function placeSearch(q) {
    const c = S.pos || { lat: 46.52, lon: 6.63 };
    const p = new URLSearchParams({ q, limit: '6', lang: /^(fr|de|it)$/.test(LANG()) ? LANG() : 'en', lat: c.lat.toFixed(4), lon: c.lon.toFixed(4) });
    const r = await fetch((CFG.searchUrl || 'https://photon.komoot.io/api/') + '?' + p.toString());
    const j = await r.json();
    return (j.features || []).map((f) => { const pr = f.properties || {}; return { name: pr.name || [pr.street, pr.housenumber].filter(Boolean).join(' ') || pr.city || T('Adresse'), sub: [pr.name ? [pr.street, pr.housenumber].filter(Boolean).join(' ') : '', [pr.postcode, pr.city].filter(Boolean).join(' ')].filter(Boolean).join(', '), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }; });
  }
  async function optimize() {
    if (!S.pos) { toast(T('Position introuvable. Active la localisation.')); return; }
    const st = TOUR.stops.filter((s) => !s.done);
    if (st.length < 2) { toast(T('Ajoute au moins deux adresses.')); return; }
    if (!CFG.tomtomKey) { toast(T('Calcul indisponible pour le moment.')); return; }
    toast(T('Calcul du meilleur ordre…'));
    const o = { lat: S.pos.lat, lon: S.pos.lon };
    let dest, mids;
    if (TOUR.ret) { dest = o; mids = st; } else { const far = st.reduce((b, s) => dist(o, s) > dist(o, b) ? s : b, st[0]); dest = far; mids = st.filter((s) => s !== far); }
    const pts = [o].concat(mids, [dest]).map((p) => p.lat.toFixed(6) + ',' + p.lon.toFixed(6)).join(':');
    const v = A.veh ? A.veh() : {};
    const q = new URLSearchParams({ key: CFG.tomtomKey, computeBestOrder: 'true', traffic: 'true', routeRepresentation: 'none', travelMode: v.heavy ? (v.costing === 'bus' ? 'bus' : v.costing === 'auto' ? 'car' : 'truck') : 'car' });
    try {
      const r = await fetch('https://api.tomtom.com/routing/1/calculateRoute/' + pts + '/json?' + q.toString());
      const j = await r.json();
      const R = j.routes && j.routes[0]; if (!R) throw new Error('route');
      const ow = (j.optimizedWaypoints || []).slice().sort((x, y) => x.optimizedIndex - y.optimizedIndex).map((w) => mids[w.providedIndex]);
      const ordered = (ow.length ? ow : mids).concat(TOUR.ret ? [] : [dest]);
      let t = 0; const eta = [];
      (R.legs || []).forEach((l, i) => { t += l.summary.travelTimeInSeconds; if (i < ordered.length) eta.push(t); });
      TOUR.order = ordered.map((s, i) => ({ id: s.id, eta: eta[i] || null }));
      TOUR.sum = { km: R.summary.lengthInMeters / 1000, s: R.summary.travelTimeInSeconds, at: Date.now() };
      saveTour(); openTour();
    } catch (e) { toast(T('Calcul impossible pour le moment. Réessaie.')); }
  }
  function orderedStops() {
    if (!TOUR.order) return TOUR.stops.map((s) => ({ s, eta: null }));
    const byId = new Map(TOUR.stops.map((s) => [s.id, s]));
    const out = TOUR.order.map((o) => ({ s: byId.get(o.id), eta: o.eta })).filter((x) => x.s);
    TOUR.stops.forEach((s) => { if (!out.some((x) => x.s === s)) out.push({ s, eta: null }); });
    return out;
  }
  function openTour() {
    const list = orderedStops();
    const next = list.find((x) => !x.s.done);
    const body = openSheet(T('Tournée de livraisons'),
      '<p class="muted small" style="margin-top:0">' + esc(T('Ajoute tes adresses, ROUTA calcule l\'ordre le plus rapide avec le trafic.')) + '</p>' +
      '<label class="field" for="tourQ">' + esc(T('Ajouter une adresse')) + '<input id="tourQ" type="search" autocomplete="off" placeholder="' + esc(T('Rue, numéro, ville')) + '"></label>' +
      '<div id="tourRes"></div>' +
      (list.length ? list.map((x, i) => '<div class="card"><span class="pill" style="min-width:30px;text-align:center">' + (x.s.done ? '✓' : (i + 1)) + '</span><div class="grow"' + (x.s.done ? ' style="opacity:.5"' : '') + '><b>' + esc(x.s.name) + '</b><div class="sub">' + esc(x.s.sub || '') + (x.eta ? ' · ' + esc(T('vers {t}', { t: new Date((TOUR.sum ? TOUR.sum.at : Date.now()) + x.eta * 1000).toLocaleTimeString(LANG(), { hour: '2-digit', minute: '2-digit' }) })) : '') + '</div></div>' +
        '<button class="btn small soft" data-done="' + esc(x.s.id) + '">' + esc(x.s.done ? T('Annuler') : T('Fait')) + '</button><button class="iconbtn" data-del="' + esc(x.s.id) + '" aria-label="' + esc(T('Retirer')) + '">×</button></div>').join('')
        : '<div class="empty">' + esc(T('Aucune adresse pour l\'instant.')) + '</div>') +
      (TOUR.sum ? '<div class="banner">' + IC.route + '<span>' + esc(T('Tournée optimisée : {d} · {t}', { d: nf(TOUR.sum.km, 1) + ' km', t: fmtDur(TOUR.sum.s) })) + '</span></div>' : '') +
      '<label class="switch" for="tourRet"><span><b>' + esc(T('Retour au point de départ')) + '</b></span><input id="tourRet" type="checkbox"' + (TOUR.ret ? ' checked' : '') + '></label>' +
      '<div class="row wrap"><button class="btn soft grow" id="tourOpt"' + (list.filter((x) => !x.s.done).length < 2 ? ' disabled' : '') + '>' + esc(T('Calculer le meilleur ordre')) + '</button>' +
      (next ? '<button class="btn primary grow" id="tourGo">' + esc(T('Aller à : {n}', { n: next.s.name })) + '</button>' : '') + '</div>' +
      (list.length ? '<button class="btn ghost block" id="tourClear">' + esc(T('Vider la tournée')) + '</button>' : ''), 'tour');
    const q = body.querySelector('#tourQ'), res = body.querySelector('#tourRes');
    q.oninput = () => {
      clearTimeout(searchT); const v = q.value.trim();
      if (v.length < 3) { res.innerHTML = ''; return; }
      searchT = setTimeout(async () => {
        try {
          const r = await placeSearch(v);
          res.innerHTML = r.map((p, i) => '<button class="card tap" data-add="' + i + '"><div class="grow"><b>' + esc(p.name) + '</b><div class="sub">' + esc(p.sub) + '</div></div><span class="pill">+</span></button>').join('');
          res.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => { if (TOUR.stops.length >= 25) { toast(T('25 adresses au maximum.')); return; } const p = r[+b.dataset.add]; TOUR.stops.push({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: p.name, sub: p.sub, lat: p.lat, lon: p.lon, done: false }); TOUR.order = null; TOUR.sum = null; saveTour(); openTour(); }; });
        } catch (e) { res.innerHTML = ''; }
      }, 350);
    };
    body.querySelectorAll('[data-done]').forEach((b) => { b.onclick = () => { const s = TOUR.stops.find((x) => x.id === b.dataset.done); if (s) { s.done = !s.done; saveTour(); openTour(); } }; });
    body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { TOUR.stops = TOUR.stops.filter((x) => x.id !== b.dataset.del); TOUR.order = null; TOUR.sum = null; saveTour(); openTour(); }; });
    body.querySelector('#tourRet').onchange = (e) => { TOUR.ret = e.target.checked; TOUR.order = null; TOUR.sum = null; saveTour(); openTour(); };
    const op = body.querySelector('#tourOpt'); if (op) op.onclick = optimize;
    const go = body.querySelector('#tourGo'); if (go) go.onclick = () => { closeSheet(); chooseDestination({ name: next.s.name, sub: next.s.sub || '', lat: next.s.lat, lon: next.s.lon }); };
    const cl = body.querySelector('#tourClear'); let arm = 0;
    if (cl) cl.onclick = (e) => { if (Date.now() - arm > 4000) { arm = Date.now(); e.target.textContent = T('Touche encore pour tout effacer'); return; } TOUR.stops = []; TOUR.order = null; TOUR.sum = null; saveTour(); openTour(); };
  }

  /* =========================================================
     3 · INTERDICTIONS DE CIRCULER (poids lourds)
     ========================================================= */
  const BANS = [
    ['CH', 'Suisse', 'Camions de plus de 3,5 t, semi-remorques de plus de 5 t, remorques de plus de 3,5 t', [
      ['Nuit', 'tous les jours de 22 h à 5 h'],
      ['Dimanche et jours fériés', 'toute la journée (fériés fédéraux : 1er janvier, Vendredi saint, lundi de Pâques, Ascension, lundi de Pentecôte, 1er août, 25 et 26 décembre)']]],
    ['FR', 'France', 'Poids lourds de plus de 7,5 t', [
      ['Week-end', 'du samedi 22 h au dimanche 22 h'],
      ['Jours fériés', 'de la veille 22 h au jour férié 22 h'],
      ['Été', 'certains samedis de juillet et août, en journée']]],
    ['DE', 'Allemagne', 'Camions de plus de 7,5 t et camions avec remorque', [
      ['Dimanche et jours fériés', 'de 0 h à 22 h'],
      ['Été', 'samedis de juillet et août de 7 h à 20 h sur certaines autoroutes']]],
    ['AT', 'Autriche', 'Camions de plus de 7,5 t, ou plus de 3,5 t avec remorque', [
      ['Samedi', 'de 15 h à 24 h'],
      ['Dimanche et jours fériés', 'de 0 h à 22 h'],
      ['Nuit', 'de 22 h à 5 h (sauf camions certifiés silencieux, limités à 60 km/h)']]],
    ['IT', 'Italie', 'Poids lourds de plus de 7,5 t', [
      ['Dimanche et jours fériés', 'en journée jusqu\'à 22 h (le début varie selon le mois)'],
      ['Été', 'plusieurs samedis et vendredis supplémentaires selon le calendrier officiel']]]
  ];
  function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451); return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1); }
  function chHoliday(d) {
    const md = (d.getMonth() + 1) * 100 + d.getDate();
    if ([101, 801, 1225, 1226].includes(md)) return true;
    const e = easter(d.getFullYear());
    return [-2, 1, 39, 50].some((n) => { const x = new Date(e); x.setDate(x.getDate() + n); return x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); });
  }
  function chBan(now) { const h = now.getHours(); return h >= 22 || h < 5 || now.getDay() === 0 || chHoliday(now); }
  function openBans() {
    const cc = S.country || 'CH';
    const flag = (c) => String.fromCodePoint(...[...c].map((x) => 0x1F1E6 + x.charCodeAt(0) - 65));
    const now = new Date();
    const live = (c) => c === 'CH' ? chBan(now) : null;
    const order = BANS.slice().sort((a, b) => (a[0] === cc ? -1 : b[0] === cc ? 1 : 0));
    const body = openSheet(T('Interdictions de circuler'),
      '<p class="muted small" style="margin-top:0">' + esc(T('Règles générales pour les poids lourds. Des exceptions existent (marchandises périssables, autorisations).')) + '</p>' +
      order.map(([c, n, who, rows]) => {
        const l = live(c);
        return '<div class="card" style="display:block"><div style="display:flex;align-items:center;gap:10px"><span style="font-size:26px">' + flag(c) + '</span><b style="font-size:17px" class="grow">' + esc(T(n)) + '</b>' +
          (l != null && c === cc ? '<span class="pill" style="' + (l ? 'background:#3A1D22;color:#FF8F94' : 'background:rgba(61,214,140,.15);color:#3DD68C') + '">' + esc(l ? T('Interdit en ce moment') : T('Autorisé en ce moment')) + '</span>' : '') + '</div>' +
          '<div class="sub" style="margin:6px 0 8px">' + esc(T(who)) + '</div>' +
          rows.map(([k, v]) => '<div style="display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line, rgba(255,255,255,.08))"><b style="min-width:110px">' + esc(T(k)) + '</b><span class="sub" style="margin:0">' + esc(T(v)) + '</span></div>').join('') + '</div>';
      }).join('') +
      '<p class="muted small">' + esc(T('Les calendriers changent chaque année et certaines régions ajoutent leurs propres jours : vérifie toujours les informations officielles avant de partir.')) + '</p>', 'bans');
    void body;
  }

  /* ---------- branchement au menu ---------- */
  const tiles0 = X.tiles;
  X.tiles = () => (tiles0 ? tiles0() : []).concat([
    ['drive', IC.gauge, T('Suivi de conduite')],
    ['tour', IC.route, T('Tournée de livraisons')],
    ['bans', IC.ban, T('Interdictions de circuler')]
  ]);
  const open0 = X.open;
  X.open = (k) => {
    if (k === 'drive') { openDrive(); return true; }
    if (k === 'tour') { openTour(); return true; }
    if (k === 'bans') { openBans(); return true; }
    return open0 ? open0(k) : false;
  };
})();
