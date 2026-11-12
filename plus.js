/* ROUTA – fonctions en plus : radar de pluie, sur le trajet (ZFE, travaux, faune), pauses,
   verglas pendant la navigation, carnet de voyage et trajets habituels. Tout reste discret et visuel. */
(function () {
  'use strict';
  const A = window.ROUTA, X = window.ROUTA_X;
  if (!A || !X) return;
  const { S, map, CFG, esc, el, toast, openSheet, closeSheet, dist, fmtDist, fmtDur, store, chooseDestination } = A;
  const T = (s, v) => { let o = (A.I18N && A.I18N.t) ? A.I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
  const TT = CFG.tomtomKey || '';
  const $ = (id) => document.getElementById(id);
  const saveSettings = () => store.set('routa.settings', S.settings);
  async function getJson(u, ms) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 9000);
    try { const r = await fetch(u, { signal: ac.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); } finally { clearTimeout(t); }
  }
  const tt = (p, q) => 'https://api.tomtom.com' + p + '?' + new URLSearchParams(Object.assign({ key: TT }, q || {})).toString();
  const ICO = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const IC = {
    rain: ICO('<path d="M7 15a4 4 0 1 1 .6-8A5 5 0 0 1 17 8a3.5 3.5 0 0 1 0 7z"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/>'),
    work: ICO('<path d="M3 20h18"/><path d="M6 20l5-14h2l5 14"/><path d="M8 14h8"/>'),
    deer: ICO('<path d="M8 3l1 3-2 1M16 3l-1 3 2 1"/><path d="M9 7h6l1 4-2 2v6h-4v-6l-2-2z"/>'),
    leaf: ICO('<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19l7-7"/>'),
    globe: ICO('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
    cup: ICO('<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v3M12 3v3"/>'),
    ice: ICO('<path d="M12 2v20M4 6l16 12M20 6L4 18"/>')
  };

  /* ---------- outils sur le trajet ---------- */
  function sample(R, step, maxM) {
    const out = []; let next = 0;
    for (let i = 0; i < R.coords.length; i++) {
      const c = R.cum[i];
      if (maxM && c > maxM) break;
      if (c >= next) { out.push({ lat: R.coords[i].lat, lon: R.coords[i].lon, along: c }); next = c + step; }
    }
    return out;
  }
  function nearRoute(pts, p, maxD) {
    let best = null, bd = Infinity;
    for (const q of pts) { const d = dist(q, p); if (d < bd) { bd = d; best = q; } }
    return bd <= maxD ? { along: best.along, d: bd } : null;
  }
  const alongNow = () => (S.nav && S.nav.along) || 0;

  /* ---------- 39 · radar de pluie ---------- */
  let rainT = 0, rainUrl = '';
  function firstSymbol() { try { const l = map.getStyle().layers.find((x) => x.type === 'symbol'); return l && l.id; } catch (e) { return undefined; } }
  async function rainApply(refresh) {
    try {
      if (!map.getStyle()) return;
      const on = !!S.settings.rain;
      if (!on) { if (map.getLayer('rain')) map.removeLayer('rain'); if (map.getSource('rain')) map.removeSource('rain'); clearInterval(rainT); rainT = 0; return; }
      if (refresh || !rainUrl) {
        const j = await getJson('https://api.rainviewer.com/public/weather-maps.json', 8000);
        const fr = j.radar && j.radar.past && j.radar.past[j.radar.past.length - 1];
        if (!fr) return;
        rainUrl = j.host + fr.path + '/256/{z}/{x}/{y}/2/1_1.png';
      }
      if (map.getLayer('rain')) map.removeLayer('rain');
      if (map.getSource('rain')) map.removeSource('rain');
      map.addSource('rain', { type: 'raster', tiles: [rainUrl], tileSize: 256, maxzoom: 7, attribution: 'Pluie : <a href="https://www.rainviewer.com" target="_blank" rel="noopener">RainViewer</a>' });
      map.addLayer({ id: 'rain', type: 'raster', source: 'rain', paint: { 'raster-opacity': 0.6 } }, firstSymbol());
      if (!rainT) rainT = setInterval(() => rainApply(true), 600000);
    } catch (e) { /* radar indisponible */ }
  }
  let rainStyleT = 0;
  map.on('styledata', () => { if (!S.settings.rain) return; clearTimeout(rainStyleT); rainStyleT = setTimeout(() => { if (!map.getLayer('rain')) rainApply(false); }, 600); });
  if (S.settings.rain) { if (map.isStyleLoaded && map.isStyleLoaded()) rainApply(true); else map.once('load', () => rainApply(true)); }

  /* ---------- réglages ajoutés dans « Affichage de la carte » ---------- */
  function onSheet() {
    const body = $('sheetBody'); if (!body) return;
    if (S.sheetView === 'mapview' && !body.querySelector('#mvRain')) {
      const after = body.querySelector('label[for="mvTransit"]') || body.querySelector('label[for="mvTraffic"]');
      if (!after) return;
      const lab = el('<label class="switch" for="mvRain"><span><b>' + esc(T('Radar de pluie')) + '</b><br><span class="muted small">' + esc(T('Pluie et neige en direct, mises à jour toutes les 10 minutes.')) + '</span></span><input id="mvRain" type="checkbox"' + (S.settings.rain ? ' checked' : '') + '></label>');
      after.parentNode.insertBefore(lab, after.nextSibling);
      lab.querySelector('input').onchange = (e) => { S.settings.rain = e.target.checked; saveSettings(); rainApply(true); if (e.target.checked) toast(T('Radar de pluie activé. Dézoome pour voir les nuages de pluie autour de toi.')); };
    }
  }
  const sb = $('sheetBody');
  if (sb) new MutationObserver(onSheet).observe(sb, { childList: true });

  /* ---------- 2 · zones à faibles émissions (France) ---------- */
  function inRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > p.lat) !== (yj > p.lat)) && (p.lon < (xj - xi) * (p.lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  const zfeBox = (z) => { if (z.b) return z.b; let a = 180, b = 90, c = -180, d = -90; z.r.forEach((r) => r.forEach(([x, y]) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); })); return (z.b = [a, b, c, d]); };
  function zfeCrossed(R) {
    const Z = window.ROUTA_ZFE || [];
    if (!Z.length) return [];
    const pts = sample(R, 250);
    const out = [];
    Z.forEach((z) => {
      const [a, b, c, d] = zfeBox(z);
      const hit = pts.find((p) => p.lon >= a && p.lon <= c && p.lat >= b && p.lat <= d && z.r.some((r) => inRing(p, r)));
      if (hit) out.push(Object.assign({ along: hit.along }, z));
    });
    return out.sort((x, y) => x.along - y.along);
  }

  /* ---------- 20 · travaux et routes fermées (TomTom) ---------- */
  async function worksOnRoute(R) {
    if (!TT || !R || R.total < 1500) return [];
    const pts = sample(R, 100, 400000);
    const boxes = []; let cur = null;
    pts.forEach((p) => {
      if (!cur) { cur = [p.lon, p.lat, p.lon, p.lat]; return; }
      const nb = [Math.min(cur[0], p.lon), Math.min(cur[1], p.lat), Math.max(cur[2], p.lon), Math.max(cur[3], p.lat)];
      if (nb[2] - nb[0] > 0.45 || nb[3] - nb[1] > 0.45) { boxes.push(cur); cur = [p.lon, p.lat, p.lon, p.lat]; } else cur = nb;
    });
    if (cur) boxes.push(cur);
    const found = new Map();
    for (const bx of boxes.slice(0, 8)) {
      const bbox = [bx[0] - 0.01, bx[1] - 0.01, bx[2] + 0.01, bx[3] + 0.01].map((x) => x.toFixed(4)).join(',');
      try {
        const j = await getJson(tt('/traffic/services/5/incidentDetails', { bbox, fields: '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,delay,events{description},from,to,roadNumbers}}}', language: (A.I18N && A.I18N.lang === 'fr') ? 'fr-FR' : 'en-GB', categoryFilter: '8,9', timeValidityFilter: 'present' }), 9000);
        (j.incidents || []).forEach((x) => {
          const pr = x.properties || {}; const g = x.geometry || {};
          const first = g.type === 'Point' ? g.coordinates : (g.coordinates && g.coordinates[0]);
          if (!first || found.has(pr.id)) return;
          const hit = nearRoute(pts, { lon: first[0], lat: first[1] }, 120);
          if (!hit) return;
          found.set(pr.id, { id: pr.id, cat: pr.iconCategory, along: hit.along, lat: first[1], lon: first[0], where: [pr.from, pr.to].filter(Boolean).join(' → '), road: (pr.roadNumbers || [])[0] || '', delay: pr.delay || 0, desc: pr.events && pr.events[0] && pr.events[0].description });
        });
      } catch (e) { /* trafic indisponible */ }
    }
    return [...found.values()].sort((a, b) => a.along - b.along);
  }

  /* ---------- 40 · passages d'animaux sauvages (OpenStreetMap) ---------- */
  async function animalsOnRoute(R) {
    if (!A.overpass || !R || R.total < 3000) return [];
    const pts = sample(R, 400, 150000);
    if (pts.length < 2) return [];
    const line = pts.map((p) => p.lat.toFixed(5) + ',' + p.lon.toFixed(5)).join(',');
    const q = '[out:json][timeout:25];(node["hazard"~"animal_crossing|deer|wild_animals|horse_crossing|cattle"](around:40,' + line + ');node["traffic_sign"~"(^|;)(FR:A15b|CH:1\\.27|DE:142-10|IT:146)"](around:40,' + line + '););out 200;';
    try {
      const els = await A.overpass(q);
      const fine = sample(R, 60, 150000);
      return (els || []).map((e) => { const h = nearRoute(fine, { lat: e.lat, lon: e.lon }, 80); return h ? { lat: e.lat, lon: e.lon, along: h.along } : null; }).filter(Boolean).sort((a, b) => a.along - b.along);
    } catch (e) { return []; }
  }

  /* ---------- aires de repos sur la suite du trajet (pour les pauses) ---------- */
  async function restAreas(R) {
    if (!A.overpass || !R || R.total < 20000) return [];
    const pts = sample(R, 1500, 600000);
    const line = pts.map((p) => p.lat.toFixed(4) + ',' + p.lon.toFixed(4)).join(',');
    const q = '[out:json][timeout:25];(nwr["highway"~"^(rest_area|services)$"](around:300,' + line + '););out center 200;';
    try {
      const els = await A.overpass(q);
      const fine = sample(R, 200, 600000);
      return (els || []).map((e) => { const c = e.center || e; const h = nearRoute(fine, { lat: c.lat, lon: c.lon }, 350); return h ? { name: (e.tags && (e.tags.name || (e.tags.highway === 'services' ? T('Aire de service') : T('Aire de repos')))) || T('Aire de repos'), lat: c.lat, lon: c.lon, along: h.along } : null; }).filter(Boolean).sort((a, b) => a.along - b.along);
    } catch (e) { return []; }
  }

  /* ---------- aperçu du trajet : ZFE, travaux, faune ---------- */
  const P = { R: null, works: [], animals: [], rest: [], restFor: null, warned: {} };
  function banner(icon, html, warn) { return el('<div class="banner' + (warn ? ' warnb' : '') + '">' + icon + '<span>' + html + '</span></div>'); }
  async function routeExtras(R, dest, body) {
    const go = body.querySelector('#goNav'); if (!go || !R || !R.coords) return;
    let box = body.querySelector('.routex2');
    if (!box) { box = el('<div class="routex2" style="display:flex;flex-direction:column;gap:8px"></div>'); const ref = body.querySelector('.routex') || go; ref.parentNode.insertBefore(box, ref.nextSibling); }
    P.R = R; P.works = []; P.animals = []; P.warned = {};
    const v = A.veh ? A.veh() : {};
    zfeCrossed(R).forEach((z) => {
      const head = '<b>' + esc(T('Zone à faibles émissions')) + ' : ' + esc(z.n) + '</b> · ';
      const txt = v.type === 'electrique' ? T('accès autorisé avec la vignette Crit\'Air verte.') : z.nc ? T('vignette Crit\'Air recommandée, pas de restriction annoncée pour les voitures.') : T('vignette Crit\'Air obligatoire, les véhicules les plus anciens y sont interdits.');
      const b = banner(IC.leaf, head + esc(txt) + (z.u ? ' <a href="' + esc(z.u) + '" target="_blank" rel="noopener" style="color:var(--info)">' + esc(T('Règles officielles')) + '</a>' : ''), !z.nc && v.type !== 'electrique');
      box.appendChild(b);
    });
    const [works, animals] = await Promise.all([worksOnRoute(R), animalsOnRoute(R)]);
    if (P.R !== R || !box.isConnected) return;
    P.works = works; P.animals = animals;
    if (works.length) {
      const closed = works.filter((w) => w.cat === 8).length;
      const lines = works.slice(0, 4).map((w) => '<br>· ' + esc(fmtDist(Math.round(w.along / 100) * 100)) + ' : ' + esc(w.cat === 8 ? T('route fermée') : T('travaux')) + (w.road ? ' ' + esc(w.road) : '') + (w.where ? ' (' + esc(w.where) + ')' : '') + (w.delay > 60 ? ' · +' + esc(fmtDur(w.delay)) : '')).join('');
      box.appendChild(banner(IC.work, '<b>' + esc(T(closed ? 'Travaux et fermetures sur le trajet' : 'Travaux sur le trajet')) + ' : ' + works.length + '</b>' + lines, closed > 0));
    }
    if (animals.length) box.appendChild(banner(IC.deer, esc(T('{n} passages d\'animaux sauvages signalés sur le trajet. Prudence surtout la nuit.', { n: animals.length }))));
  }
  const prevPreview = X.preview;
  X.preview = (R, dest, body) => {
    if (prevPreview) prevPreview(R, dest, body);
    try { routeExtras(R, dest, body); } catch (e) { /* */ }
  };

  /* ---------- soleil (pour la faune la nuit) ---------- */
  function sunElev(lat, lon, d) {
    const rad = Math.PI / 180, day = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000;
    const g = 2 * Math.PI / 365 * (day - 1 + (d.getUTCHours() - 12) / 24);
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const tst = d.getUTCHours() * 60 + d.getUTCMinutes() + eq + 4 * lon;
    const ha = (tst / 4 - 180) * rad;
    const el2 = Math.asin(Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha));
    return el2 / rad;
  }
  const isDark = () => S.pos ? sunElev(S.pos.lat, S.pos.lon, new Date()) < -2 : (new Date().getHours() >= 18 || new Date().getHours() < 7);

  /* ---------- pendant la navigation : pauses, fatigue, faune, travaux, verglas ---------- */
  const D = { driveMs: 0, stopMs: 0, last: Date.now(), nextPause: 2 * 3600000, nightAt: 0, iceAt: 0, iceWarnAt: 0 };
  async function ensureRest() {
    const N = S.nav; if (!N || !N.R) return;
    if (P.restFor === N.R) return;
    P.restFor = N.R; P.rest = [];
    P.rest = await restAreas(N.R);
  }
  function nextRest() {
    const a = alongNow();
    return (P.rest || []).find((r) => r.along > a + 1500 && r.along < a + 60000);
  }
  function pauseToast(msg) {
    const r = nextRest();
    toast(esc(msg) + (r ? '<br>' + esc(T('Prochaine aire : {n} dans {d}', { n: r.name, d: fmtDist(Math.round((r.along - alongNow()) / 100) * 100) })) : ''), r ? { action: T('Voir'), onAction: () => { try { map.flyTo({ center: [r.lon, r.lat], zoom: 14 }); } catch (e) { /* */ } }, ms: 12000 } : { ms: 10000 });
  }
  async function iceCheck() {
    const N = S.nav; if (!N || !N.R || !S.pos) return;
    const a = alongNow() + 12000;
    let i = N.R.cum.findIndex((c) => c >= a); if (i < 0) i = N.R.coords.length - 1;
    const p = N.R.coords[i];
    try {
      const j = await getJson('https://api.open-meteo.com/v1/forecast?latitude=' + p.lat.toFixed(3) + '&longitude=' + p.lon.toFixed(3) + '&current=temperature_2m,relative_humidity_2m,precipitation,snowfall&past_hours=3&hourly=precipitation&forecast_hours=1', 8000);
      const c = j.current || {}; const wet = (c.precipitation || 0) > 0 || (c.snowfall || 0) > 0 || (c.relative_humidity_2m || 0) >= 92 || ((j.hourly && j.hourly.precipitation) || []).some((x) => x > 0);
      if (c.temperature_2m != null && c.temperature_2m <= 1 && wet && Date.now() - D.iceWarnAt > 45 * 60000) {
        D.iceWarnAt = Date.now();
        toast('<b>' + esc(T('Risque de verglas')) + '</b> ' + esc(T('sur la suite du trajet ({t}°). Garde tes distances.', { t: Math.round(c.temperature_2m) })), { ms: 10000 });
      }
    } catch (e) { /* météo indisponible */ }
  }
  setInterval(() => {
    const now = Date.now(), dt = Math.min(now - D.last, 15000); D.last = now;
    const moving = S.speed != null && S.speed > 2.5;
    if (moving) { D.driveMs += dt; D.stopMs = 0; } else { D.stopMs += dt; if (D.stopMs > 12 * 60000) { D.driveMs = 0; D.nextPause = 2 * 3600000; } }
    const N = S.nav;
    if (!N) return;
    ensureRest();
    /* 6 · pause conseillée toutes les 2 h */
    if (D.driveMs >= D.nextPause) {
      D.nextPause += 2 * 3600000;
      pauseToast(T('{h} de route : une pause de 15 minutes te ferait du bien.', { h: fmtDur(D.driveMs / 1000) }));
    }
    /* 19 · fatigue la nuit */
    const h = new Date().getHours();
    if ((h >= 23 || h < 5) && D.driveMs > 45 * 60000 && now - D.nightAt > 60 * 60000) {
      D.nightAt = now;
      pauseToast(T('Il est tard et tu roules depuis un moment. Au moindre bâillement, fais une pause.'));
    }
    const a = alongNow();
    /* 40 · faune : la nuit, 600 m avant */
    if (moving && isDark()) {
      const an = (P.R === N.R ? P.animals : []).find((x) => x.along > a && x.along - a < 600 && !P.warned['a' + x.along]);
      if (an) { P.warned['a' + an.along] = 1; toast(IC.deer + ' ' + esc(T('Passage d\'animaux sauvages dans {d}. Ralentis et surveille les bas-côtés.', { d: fmtDist(Math.round((an.along - a) / 50) * 50) })), { ms: 8000 }); }
    }
    /* 20 · travaux : 1,5 km avant */
    const wk = (P.R === N.R ? P.works : []).find((x) => x.along > a && x.along - a < 1500 && !P.warned['w' + x.id]);
    if (wk) { P.warned['w' + wk.id] = 1; toast(IC.work + ' ' + esc(T(wk.cat === 8 ? 'Route fermée dans {d}' : 'Travaux dans {d}', { d: fmtDist(Math.round((wk.along - a) / 100) * 100) })) + (wk.where ? '<br><span class="muted small">' + esc(wk.where) + '</span>' : ''), { ms: 8000 }); }
    /* 5 · verglas : toutes les 15 min en hiver */
    if (now - D.iceAt > 15 * 60000) { D.iceAt = now; const m = new Date().getMonth(); if (m >= 9 || m <= 4) iceCheck(); }
  }, 5000);

  /* ---------- 25 · carnet de voyage ---------- */
  const V = Object.assign({ c: {}, cols: {}, km: 0, since: Date.now() }, store.get('routa.voyage', {}));
  let vLast = null, vSaveAt = 0;
  const vSave = () => store.set('routa.voyage', V);
  setInterval(() => {
    let ch = false;
    if (S.country && !V.c[S.country]) { V.c[S.country] = Date.now(); ch = true; }
    if (S.pos) {
      if (vLast && S.speed != null && S.speed > 2) { const d = dist(vLast, S.pos); if (d < 2000) { V.km += d / 1000; ch = Date.now() - vSaveAt > 60000 || ch; } }
      vLast = { lat: S.pos.lat, lon: S.pos.lon };
      if (S.speed != null && S.speed > 2 && S.spots) {
        S.spots.forEach((s) => {
          if ((s.category === 'route' || s.category === 'vue') && !V.cols[s.id] && dist(S.pos, s) < 300) {
            V.cols[s.id] = { n: s.name, at: Date.now(), lat: s.lat, lon: s.lon }; ch = true;
            toast(IC.globe + ' ' + esc(T('{n} ajouté à ton carnet de voyage.', { n: s.name })), { ms: 6000 });
          }
        });
      }
    }
    if (ch) { vSaveAt = Date.now(); vSave(); }
  }, 10000);
  const flag = (cc) => /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1F1E6 + c.charCodeAt(0) - 65)) : '';
  let resetArm = 0;
  function openVoyage() {
    const C = window.ROUTA_COUNTRIES || {};
    const cs = Object.entries(V.c).sort((a, b) => a[1] - b[1]);
    const cols = Object.entries(V.cols).sort((a, b) => b[1].at - a[1].at);
    const body = openSheet(T('Carnet de voyage'),
      '<div class="limgrid">' + [[cs.length, T('pays')], [cols.length, T('cols et routes')], [Math.round(V.km), 'km']].map(([n, l]) => '<div class="limcell"><div class="limv">' + n + '</div><div class="sub">' + esc(l) + '</div></div>').join('') + '</div>' +
      '<h3>' + esc(T('Pays traversés')) + '</h3>' +
      (cs.length ? '<div class="row wrap">' + cs.map(([cc]) => '<span class="pill">' + flag(cc) + ' ' + esc(T((C[cc] && C[cc].name) || cc)) + '</span>').join('') + '</div>' : '<p class="muted small">' + esc(T('Les pays où tu roules avec ROUTA s\'ajoutent ici tout seuls.')) + '</p>') +
      '<h3>' + esc(T('Cols, routes et points de vue')) + '</h3>' +
      (cols.length ? cols.slice(0, 40).map(([id, c]) => '<button class="card tap" data-id="' + esc(id) + '"><div class="ico" style="background:#8EC5FF">' + IC.globe + '</div><div class="grow"><b>' + esc(c.n) + '</b><div class="sub">' + esc(new Date(c.at).toLocaleDateString(A.I18N && A.I18N.lang ? A.I18N.lang : 'fr')) + '</div></div></button>').join('') : '<p class="muted small">' + esc(T('Passe par un col ou une belle route de la liste « Spots » : elle s\'ajoute ici.')) + '</p>') +
      (cols.length ? '<button class="btn soft block" id="vyMap">' + esc(T('Voir sur la carte')) + '</button>' : '') +
      '<button class="btn ghost" id="vyReset">' + esc(T('Remettre le carnet à zéro')) + '</button>' +
      '<p class="muted small">' + esc(T('Ton carnet reste sur ce téléphone.')) + '</p>', 'voyage');
    body.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => { if (A.openSpot && S.spots && S.spots.get(b.dataset.id)) A.openSpot(b.dataset.id); }; });
    const vm = body.querySelector('#vyMap');
    if (vm) vm.onclick = () => { try { const bb = new window.maplibregl.LngLatBounds(); cols.forEach(([, c]) => bb.extend([c.lon, c.lat])); closeSheet(); map.fitBounds(bb, { padding: 80, maxZoom: 12, duration: 800 }); } catch (e) { /* */ } };
    body.querySelector('#vyReset').onclick = (e) => {
      if (Date.now() - resetArm > 4000) { resetArm = Date.now(); e.target.textContent = T('Touche encore pour tout effacer'); return; }
      V.c = {}; V.cols = {}; V.km = 0; V.since = Date.now(); vSave(); openVoyage();
    };
  }
  const tiles0 = X.tiles;
  X.tiles = () => (tiles0 ? tiles0() : []).concat([['voyage', IC.globe, T('Carnet de voyage')]]);
  const open0 = X.open;
  X.open = (k) => { if (k === 'voyage') { openVoyage(); return true; } return open0 ? open0(k) : false; };

  /* ---------- 36 · trajets habituels (maison ↔ travail) ---------- */
  async function commuteCheck() {
    try {
      if (!TT || !X.route || S.nav || S.preview || !S.pos || document.hidden) return;
      const d = new Date(), day = d.getDay(), h = d.getHours() + d.getMinutes() / 60;
      if (day === 0 || day === 6) return;
      const fav = (slot) => (S.favs || []).find((f) => f.slot === slot);
      const home = fav('home'), work = fav('work');
      if (!home || !work) return;
      let from = null, to = null, label = '';
      if (h >= 5.5 && h <= 10 && dist(S.pos, home) < 1500) { from = home; to = work; label = 'Vers Travail'; }
      else if (h >= 15.5 && h <= 20 && dist(S.pos, work) < 1500) { from = work; to = home; label = 'Vers Maison'; }
      if (!to || dist(from, to) < 2000) return;
      const key = 'routa.commute.' + d.toDateString() + '.' + label;
      if (store.get(key, false)) return;
      const R = await X.route(S.pos, to);
      if (!R || S.nav || S.preview) return;
      store.set(key, true);
      const delay = R.trafficDelay || 0;
      toast('<b>' + esc(T(label)) + '</b> : ' + esc(fmtDur(R.duration)) + ' · ' + esc(delay > 120 ? T('bouchons +{t}', { t: fmtDur(delay) }) : T('trafic fluide')), { action: T('Y aller'), onAction: () => chooseDestination({ name: to.name, sub: to.addr || '', lat: to.lat, lon: to.lon, fav: true }), ms: 12000 });
    } catch (e) { /* trafic indisponible */ }
  }
  setTimeout(commuteCheck, 9000);
  setInterval(commuteCheck, 5 * 60000);
})();
