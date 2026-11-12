/* ROUTA – rappels intelligents, défis et badges, webcams et sécurité au volant. */
(function () {
  'use strict';
  const A = window.ROUTA, X = window.ROUTA_X;
  if (!A || !X) return;
  const { S, CFG, esc, el, toast, openSheet, dist, fmtDist, store } = A;
  const T = (s, v) => { let o = (A.I18N && A.I18N.t) ? A.I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
  const LANG = () => (A.I18N && A.I18N.lang) || 'fr';
  const nf = (n) => (+n || 0).toLocaleString(LANG(), { maximumFractionDigits: 0 });
  const ICO = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const IC = {
    cam: ICO('<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/>'),
    medal: ICO('<circle cx="12" cy="15" r="5"/><path d="M8.5 11L6 3h4l2 5 2-5h4l-2.5 8"/>'),
    shield: ICO('<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>')
  };
  const moving = () => S.speed != null && S.speed * 3.6 > 20;

  /* =========================================================
     SÉCURITÉ : rappel visuel quand on touche l'app en roulant
     ========================================================= */
  let passengerUntil = 0;
  const QUIET = /^(preview|nav|point|place|poi|fav)/;
  function safetyBanner() {
    const body = document.getElementById('sheetBody');
    if (!body || !moving() || Date.now() < passengerUntil || QUIET.test(S.sheetView || '')) return;
    if (body.querySelector('.safetyb')) return;
    const b = el('<div class="banner warnb safetyb">' + IC.shield + '<span><b>' + esc(T('Tu roules : les yeux sur la route.')) + '</b><br>' + esc(T('Laisse ton passager utiliser le téléphone, ou arrête-toi dans un endroit sûr.')) + '<br><button class="btn small soft" id="safePass" style="margin-top:8px">' + esc(T('Je suis passager')) + '</button></span></div>');
    body.insertBefore(b, body.firstChild);
    b.querySelector('#safePass').onclick = () => { passengerUntil = Date.now() + 30 * 60000; b.remove(); document.querySelectorAll('.wcimg[data-src]').forEach(showImg); };
  }
  const sb = document.getElementById('sheetBody');
  if (sb) new MutationObserver(() => safetyBanner()).observe(sb, { childList: true });

  /* =========================================================
     12 · WEBCAMS (OpenStreetMap, et Windy si une clé est configurée)
     ========================================================= */
  const WC = { list: [], at: 0, center: null };
  async function camsOSM(c, km) {
    if (!A.overpass) return [];
    const d = km / 111, e = km / (111 * Math.cos(c.lat * Math.PI / 180));
    const bb = [c.lat - d, c.lon - e, c.lat + d, c.lon + e].map((x) => x.toFixed(3)).join(',');
    const q = '[out:json][timeout:25];(nwr["webcam"](' + bb + ');nwr["contact:webcam"](' + bb + ');nwr["surveillance:type"="webcam"](' + bb + '););out tags center 120;';
    const els = await A.overpass(q);
    return (els || []).map((x) => {
      const t = x.tags || {}, p = x.center || x;
      const url = t.webcam || t['contact:webcam'] || t.url || t.website || '';
      if (!/^https?:\/\//.test(url) || p.lat == null) return null;
      return { id: 'o' + x.id, name: t.name || t['name:' + LANG()] || T('Webcam'), lat: p.lat, lon: p.lon, page: url, img: /\.(jpe?g|png|webp)(\?|$)/i.test(url) ? url : '', src: 'OpenStreetMap' };
    }).filter(Boolean);
  }
  async function camsWindy(c, km) {
    if (!CFG.windyKey) return [];
    const r = await fetch('https://api.windy.com/webcams/api/v3/webcams?' + new URLSearchParams({ nearby: c.lat.toFixed(4) + ',' + c.lon.toFixed(4) + ',' + Math.min(250, km), limit: '50', include: 'images,urls,location', lang: LANG() }).toString(), { headers: { 'x-windy-api-key': CFG.windyKey } });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.webcams || []).map((w) => ({ id: 'w' + w.webcamId, name: w.title || T('Webcam'), lat: w.location && w.location.latitude, lon: w.location && w.location.longitude, page: (w.urls && w.urls.detail) || 'https://www.windy.com/webcams/' + w.webcamId, img: (w.images && w.images.current && (w.images.current.preview || w.images.current.thumbnail)) || '', src: 'Windy.com' })).filter((w) => w.lat != null);
  }
  function showImg(img) { if (moving() && Date.now() >= passengerUntil) return; img.src = img.dataset.src; img.removeAttribute('data-src'); img.hidden = false; }
  async function openCams(km) {
    km = km || 30;
    const c = S.pos || (() => { const m = A.map.getCenter(); return { lat: m.lat, lon: m.lng }; })();
    const body = openSheet(T('Webcams autour'), '<p class="muted">' + esc(T('Recherche des webcams…')) + '</p>', 'webcams');
    let list = [];
    try {
      const [w, o] = await Promise.all([camsWindy(c, km).catch(() => []), camsOSM(c, km).catch(() => [])]);
      list = w.concat(o.filter((x) => !w.some((y) => dist(x, y) < 150)));
    } catch (e) { list = []; }
    if (S.sheetView !== 'webcams') return;
    list.forEach((x) => { x.d = dist(c, x); });
    list.sort((a, b) => a.d - b.d);
    const blocked = moving() && Date.now() >= passengerUntil;
    body.innerHTML = (blocked ? '' : '') +
      (list.length ? list.slice(0, 40).map((x, i) => '<div class="card" style="display:block">' +
        (x.img ? '<img class="wcimg" alt="" loading="lazy" data-src="' + esc(x.img) + '" hidden style="width:100%;border-radius:12px;display:block;margin-bottom:8px;background:#0E1116;min-height:60px">' : '') +
        '<div style="display:flex;align-items:center;gap:10px"><div class="grow"><b>' + esc(x.name) + '</b><div class="sub">' + esc(fmtDist(Math.round(x.d / 100) * 100)) + ' · ' + esc(x.src) + '</div></div>' +
        '<a class="btn small soft" href="' + esc(x.page) + '" target="_blank" rel="noopener">' + esc(T('Voir')) + '</a><button class="iconbtn" data-map="' + i + '" aria-label="' + esc(T('Sur la carte')) + '">' + IC.cam + '</button></div></div>').join('')
        : '<div class="empty">' + esc(T('Aucune webcam trouvée dans ce rayon.')) + '</div>') +
      (km < 120 ? '<button class="btn soft block" id="wcMore">' + esc(T('Chercher plus loin ({d} km)', { d: km * 3 })) + '</button>' : '') +
      '<p class="muted small">' + esc(T('Images publiées par leurs propriétaires, pas toujours à jour. Ne les regarde jamais en conduisant.')) + '</p>';
    safetyBanner();
    body.querySelectorAll('.wcimg[data-src]').forEach(showImg);
    body.querySelectorAll('[data-map]').forEach((b) => { b.onclick = () => { const x = list[+b.dataset.map]; try { A.closeSheet && A.closeSheet(); A.map.flyTo({ center: [x.lon, x.lat], zoom: 13 }); } catch (e) { /* */ } }; });
    const m = body.querySelector('#wcMore'); if (m) m.onclick = () => openCams(km * 3);
  }

  /* =========================================================
     14 · RAPPELS INTELLIGENTS (pneus selon la saison, service au kilométrage)
     ========================================================= */
  const carnet = () => store.get('routa.carnet', { dates: {}, fills: [] });
  function kmEstimate() {
    const c = carnet();
    const f = (c.fills || []).filter((x) => x.km).sort((a, b) => b.date - a.date)[0];
    const base = c.odo && (!f || c.odo.at > f.date) ? { km: c.odo.km, at: c.odo.at } : f ? { km: f.km, at: f.date } : null;
    if (!base) return null;
    const drives = store.get('routa.drives', []).filter((d) => d.s > base.at);
    return Math.round(base.km + drives.reduce((s, d) => s + d.km, 0));
  }
  function smartReminders() {
    const today = new Date().toISOString().slice(0, 10);
    if (store.get('routa.smartCheck', '') === today) return;
    store.set('routa.smartCheck', today);
    const c = carnet(), m = new Date().getMonth() + 1, d = new Date().getDate();
    const wk = 'routa.tyreWarn.' + new Date().getFullYear() + (m >= 9 ? 'h' : 'e');
    const tyres = c.dates && c.dates.tyres ? Date.parse(c.dates.tyres) : 0;
    const recent = tyres && Math.abs(tyres - Date.now()) < 75 * 86400000;
    if (!recent && !store.get(wk, false)) {
      if ((m === 10 && d >= 10) || m === 11) { store.set(wk, true); toast('<b>' + esc(T('Pneus hiver')) + '</b> : ' + esc(T('c\'est la saison. Pense à prendre rendez-vous si ce n\'est pas fait.')), { action: T('Carnet'), onAction: () => X.open && X.open('carnet'), ms: 10000 }); return; }
      if ((m === 3 && d >= 20) || m === 4) { store.set(wk, true); toast('<b>' + esc(T('Pneus été')) + '</b> : ' + esc(T('c\'est la saison. Pense à prendre rendez-vous si ce n\'est pas fait.')), { action: T('Carnet'), onAction: () => X.open && X.open('carnet'), ms: 10000 }); return; }
    }
    if (c.serviceKm) {
      const now = kmEstimate();
      if (now != null && c.serviceKm - now <= 500) toast('<b>' + esc(T('Service')) + '</b> : ' + esc(c.serviceKm - now <= 0 ? T('le kilométrage prévu est atteint.') : T('plus que {k} km environ.', { k: nf(c.serviceKm - now) })), { action: T('Carnet'), onAction: () => X.open && X.open('carnet'), ms: 10000 });
    }
  }
  setTimeout(smartReminders, 12000);
  setInterval(smartReminders, 3 * 3600000);
  /* champs ajoutés dans le carnet : kilométrage actuel et prochain service */
  function carnetExtra() {
    const body = document.getElementById('sheetBody');
    if (!body || S.sheetView !== 'carnet' || body.querySelector('#cxSvc')) return;
    const ref = body.querySelector('#cdIcs'); if (!ref) return;
    const c = carnet(); const est = kmEstimate();
    const box = el('<div><h3>' + esc(T('Kilométrage')) + '</h3><div class="row"><label class="field grow" for="cxOdo">' + esc(T('Compteur actuel (km)')) + '<input id="cxOdo" type="number" inputmode="numeric" placeholder="' + (est != null ? esc(String(est)) : '') + '"></label><label class="field grow" for="cxSvc">' + esc(T('Prochain service à (km)')) + '<input id="cxSvc" type="number" inputmode="numeric" value="' + (c.serviceKm || '') + '"></label></div>' +
      (est != null ? '<p class="muted small">' + esc(T('Estimation actuelle : {k} km (compteur noté + trajets suivis par ROUTA).', { k: nf(est) })) + '</p>' : '') + '</div>');
    ref.parentNode.insertBefore(box, ref.nextSibling);
    box.querySelector('#cxOdo').onchange = (e) => { const v = parseInt(e.target.value, 10); if (v > 0) { const cc = carnet(); cc.odo = { km: v, at: Date.now() }; store.set('routa.carnet', cc); toast(T('Kilométrage enregistré.')); } };
    box.querySelector('#cxSvc').onchange = (e) => { const v = parseInt(e.target.value, 10); const cc = carnet(); cc.serviceKm = v > 0 ? v : null; store.set('routa.carnet', cc); toast(T('Rappel de service enregistré.')); };
  }
  if (sb) new MutationObserver(() => carnetExtra()).observe(sb, { childList: true });

  /* =========================================================
     17 · DÉFIS ET BADGES
     ========================================================= */
  function stats() {
    const dr = store.get('routa.drives', []);
    const v = store.get('routa.voyage', { c: {}, cols: {} });
    const c = carnet();
    let mySpots = 0;
    try { if (S.spots && S.me) S.spots.forEach((s) => { if (s.created_by === S.me.id) mySpots++; }); } catch (e) { /* */ }
    return {
      n: dr.length, km: dr.reduce((s, d) => s + d.km, 0),
      zen: dr.filter((d) => d.km >= 5 && d.score >= 85).length,
      perfect: dr.some((d) => d.km >= 20 && d.score >= 100),
      night: dr.some((d) => { const h = new Date(d.s).getHours(); return h >= 23 || h < 4; }),
      early: dr.some((d) => { const h = new Date(d.s).getHours(); return h >= 4 && h < 6; }),
      long: dr.some((d) => d.km >= 300),
      cols: Object.keys(v.cols || {}).length, countries: Object.keys(v.c || {}).length,
      convoy: !!X.convoy || store.get('routa.badge.convoy', false), spots: mySpots, fills: (c.fills || []).length,
      month: dr.filter((d) => { const t = new Date(d.s), n = new Date(); return t.getMonth() === n.getMonth() && t.getFullYear() === n.getFullYear(); })
    };
  }
  const BADGES = [
    ['first', 'Premier trajet', 'Un premier trajet suivi par ROUTA', (s) => [s.n, 1]],
    ['km100', '100 km', 'Rouler 100 km avec ROUTA', (s) => [s.km, 100]],
    ['km1000', '1 000 km', 'Rouler 1 000 km avec ROUTA', (s) => [s.km, 1000]],
    ['km5000', '5 000 km', 'Rouler 5 000 km avec ROUTA', (s) => [s.km, 5000]],
    ['zen', 'Conduite zen', '5 trajets avec un score de 85 ou plus', (s) => [s.zen, 5]],
    ['perfect', 'Sans faute', 'Un trajet de 20 km ou plus avec 100 sur 100', (s) => [s.perfect ? 1 : 0, 1]],
    ['long', 'Longue route', 'Un trajet de 300 km d\'un coup', (s) => [s.long ? 1 : 0, 1]],
    ['night', 'Oiseau de nuit', 'Un trajet commencé entre 23 h et 4 h', (s) => [s.night ? 1 : 0, 1]],
    ['early', 'Lève-tôt', 'Un trajet commencé entre 4 h et 6 h', (s) => [s.early ? 1 : 0, 1]],
    ['cols3', 'Grimpeur', 'Passer 3 cols ou routes de la liste', (s) => [s.cols, 3]],
    ['cols10', 'Roi des cols', 'Passer 10 cols ou routes de la liste', (s) => [s.cols, 10]],
    ['ctry3', 'Globe-trotteur', 'Rouler dans 3 pays', (s) => [s.countries, 3]],
    ['convoy', 'Esprit d\'équipe', 'Rouler en convoi', (s) => [s.convoy ? 1 : 0, 1]],
    ['spotter', 'Dénicheur', 'Ajouter un spot pour la communauté', (s) => [s.spots, 1]],
    ['carnet', 'Bien entretenue', 'Noter 3 pleins dans le carnet', (s) => [s.fills, 3]]
  ];
  function checkBadges(silent) {
    if (X.convoy) store.set('routa.badge.convoy', true);
    const got = store.get('routa.badges', {}); const s = stats(); let n = 0;
    BADGES.forEach(([id, name, , f]) => { const [v, goal] = f(s); if (v >= goal && !got[id]) { got[id] = Date.now(); n++; if (!silent) toast(IC.medal + ' <b>' + esc(T('Badge débloqué')) + '</b> : ' + esc(T(name)), { action: T('Voir'), onAction: openBadges, ms: 8000 }); } });
    if (n) store.set('routa.badges', got);
  }
  setTimeout(() => checkBadges(!store.get('routa.badges.init', false) && (store.set('routa.badges.init', true), true)), 15000);
  setInterval(() => checkBadges(false), 60000);
  function monthChallenge(s) {
    const km = s.month.reduce((a, d) => a + d.km, 0);
    const sc = km ? Math.round(s.month.reduce((a, d) => a + d.score * d.km, 0) / km) : null;
    return { km, sc, done: km >= 500 && sc != null && sc >= 80 };
  }
  function openBadges() {
    checkBadges(true);
    const got = store.get('routa.badges', {}); const s = stats(); const mc = monthChallenge(s);
    const month = new Date().toLocaleDateString(LANG(), { month: 'long' });
    const bar = (v, g) => '<div style="height:8px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:8px"><i style="display:block;height:100%;width:' + Math.min(100, Math.round(v / g * 100)) + '%;background:var(--accent);border-radius:4px"></i></div>';
    openSheet(T('Défis et badges'),
      '<div class="card" style="display:block"><b>' + esc(T('Défi de {m}', { m: month })) + '</b><div class="sub">' + esc(T('Rouler 500 km avec un score moyen de 80 ou plus.')) + '</div>' + bar(mc.km, 500) +
      '<div class="sub" style="margin-top:6px">' + nf(mc.km) + ' / 500 km · ' + esc(T('score moyen')) + ' ' + (mc.sc == null ? '–' : mc.sc) + (mc.done ? ' · <b style="color:var(--accent)">' + esc(T('Défi réussi')) + '</b>' : '') + '</div></div>' +
      '<h3>' + esc(T('Badges')) + ' · ' + Object.keys(got).length + ' / ' + BADGES.length + '</h3>' +
      '<div class="tiles">' + BADGES.map(([id, name, desc, f]) => { const [v, g] = f(s); const ok = !!got[id]; return '<div class="tile" style="cursor:default;' + (ok ? '' : 'opacity:.55') + '">' + IC.medal.replace('<svg ', '<svg style="stroke:' + (ok ? 'var(--accent)' : 'var(--muted)') + '" ') + '<span><b>' + esc(T(name)) + '</b><br><span class="muted small" style="font-weight:400">' + esc(T(desc)) + '</span>' + (ok ? '' : bar(v, g)) + '</span></div>'; }).join('') + '</div>' +
      '<p class="muted small">' + esc(T('Les badges se débloquent tout seuls quand tu roules avec ROUTA. Ils restent sur ce téléphone.')) + '</p>', 'badges');
  }

  /* ---------- branchement au menu ---------- */
  const tiles0 = X.tiles;
  X.tiles = () => (tiles0 ? tiles0() : []).concat([
    ['webcams', IC.cam, T('Webcams')],
    ['badges', IC.medal, T('Défis et badges')]
  ]);
  const open0 = X.open;
  X.open = (k) => {
    if (k === 'webcams') { openCams(); return true; }
    if (k === 'badges') { openBadges(); return true; }
    return open0 ? open0(k) : false;
  };
})();
