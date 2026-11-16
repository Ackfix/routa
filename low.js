/* ROUTA – priorités basses du cahier des charges, regroupées dans « Explorer autour » et quelques outils.
   Données réelles uniquement (OpenStreetMap, Open-Meteo, Wikipédia) ; rien n'est inventé. Premium = étiquette seulement. */
(function () {
  'use strict';
  const A = window.ROUTA, X = window.ROUTA_X;
  if (!A || !X) return;
  const { S, esc, el, toast, openSheet, closeSheet, dist, fmtDist, fmtDur, store, chooseDestination } = A;
  const T = (s, v) => { let o = (A.I18N && A.I18N.t) ? A.I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
  const LANG = () => { const l = (A.I18N && A.I18N.lang) || 'fr'; return l === 'en' ? 'en-GB' : l === 'sr' ? 'sr-Latn' : l; };
  const ICO = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const IC = {
    compass: ICO('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
    tree: ICO('<path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/>'),
    sun: ICO('<circle cx="12" cy="14" r="4"/><path d="M3 18h18M12 5v3M5.6 8.6l2 2M18.4 8.6l-2 2"/>'),
    cloud: ICO('<path d="M7 18a4 4 0 1 1 .6-8A5 5 0 0 1 17 9a3.5 3.5 0 0 1 0 9z"/>'),
    dog: ICO('<path d="M5 11l2-5 3 2h4l3-2 2 5-2 2v5h-3v-3h-4v3H7v-5z"/><circle cx="10" cy="11" r=".6"/><circle cx="14" cy="11" r=".6"/>'),
    mount: ICO('<path d="M3 20l6-10 4 6 3-4 5 8z"/>'),
    walk: ICO('<circle cx="13" cy="4.5" r="2"/><path d="M9 21l2-6 3 3v4M9 10l3-2 3 4 3 1M9 10l-2 4"/>'),
    loop: ICO('<path d="M17 7a7 7 0 1 0 2 5"/><path d="M19 3v4h-4"/>'),
    dice: ICO('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>'),
    wrench: ICO('<path d="M14 6a4 4 0 0 0 5 5l-8 8a2 2 0 0 1-3-3z"/>'),
    list: ICO('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'),
    key: ICO('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M15 8l2 2"/>'),
    sos: ICO('<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>'),
    city: ICO('<path d="M4 21V10l5-3v14M9 21V4l6 3v14M15 21v-9l5 2v7"/>'),
    book: ICO('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>')
  };
  const PREM = ''; // Explorer autour : gratuit
  const here = () => S.pos || (() => { const m = A.map.getCenter(); return { lat: m.lat, lon: m.lng }; })();
  async function getJson(u, ms) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 10000); try { const r = await fetch(u, { signal: ac.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); } finally { clearTimeout(t); } }
  async function osm(filters, radius, c, limit) {
    const q = '[out:json][timeout:20];(' + filters.map((f) => 'nwr' + f + '(around:' + radius + ',' + c.lat.toFixed(5) + ',' + c.lon.toFixed(5) + ');').join('') + ');out center tags ' + (limit || 80) + ';';
    return Promise.race([A.overpass(q, A.inCH && A.inCH(c)), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 30000))]);
  }
  const pt = (e) => ({ lat: e.lat != null ? e.lat : e.center && e.center.lat, lon: e.lon != null ? e.lon : e.center && e.center.lon, t: e.tags || {} });
  function listSheet(title, view, intro, items, opts) {
    opts = opts || {};
    const body = openSheet(title, (intro ? '<p class="muted small">' + intro + '</p>' : '') + (items.length ? items.map((x, i) => '<button class="card tap" data-i="' + i + '"><span class="ico" style="background:' + (x.color || '#4DA3FF') + '">' + (x.icon || IC.compass) + '</span><span class="grow"><b>' + esc(x.name) + '</b><span class="sub">' + esc(x.sub || '') + '</span></span>' + (x.val ? '<span class="val small">' + esc(x.val) + '</span>' : '') + '</button>').join('') : '<div class="empty">' + esc(opts.empty || T('Rien trouvé autour de toi pour le moment.')) + '</div>') + (opts.foot ? '<p class="muted small">' + opts.foot + '</p>' : ''), view);
    body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const x = items[+b.dataset.i]; if (x.go) x.go(); else { closeSheet(); chooseDestination({ name: x.name, sub: x.sub || '', lat: x.lat, lon: x.lon }); } }; });
    return body;
  }
  const loading = (title, view) => openSheet(title, '<p class="muted">' + esc(T('Recherche en cours…')) + '</p>', view);
  const fail = (view) => { if (S.sheetView === view) { const b = document.getElementById('sheetBody'); if (b) b.innerHTML = '<p class="muted">' + esc(T('Données indisponibles pour le moment. Réessaie plus tard.')) + '</p>'; } };

  /* ---------- #044 lieux à découvrir autour ---------- */
  const DISC = { viewpoint: 'Point de vue', attraction: 'Attraction', museum: 'Musée', castle: 'Château', monument: 'Monument', ruins: 'Ruines', waterfall: 'Cascade', park: 'Parc', nature_reserve: 'Réserve naturelle', zoo: 'Zoo', artwork: 'Œuvre d\'art', church: 'Église', peak: 'Sommet' };
  const discKind = (t) => t.tourism === 'viewpoint' ? 'viewpoint' : t.tourism === 'museum' ? 'museum' : t.historic === 'castle' ? 'castle' : t.historic === 'ruins' ? 'ruins' : t.historic === 'monument' || t.historic === 'memorial' ? 'monument' : t.waterway === 'waterfall' ? 'waterfall' : t.leisure === 'nature_reserve' ? 'nature_reserve' : t.tourism === 'zoo' ? 'zoo' : t.tourism === 'artwork' ? 'artwork' : t.leisure === 'park' ? 'park' : t.natural === 'peak' ? 'peak' : 'attraction';
  async function openDiscover() {
    const view = 'xdisc', title = T('Lieux à découvrir'); loading(title, view);
    const c = here();
    let els; try { els = await osm(['["tourism"~"^(viewpoint|attraction|museum|zoo|artwork)$"]["name"]', '["historic"~"^(castle|ruins|monument|memorial)$"]["name"]', '["waterway"="waterfall"]["name"]', '["leisure"="nature_reserve"]["name"]'], 8000, c, 120); } catch (e) { fail(view); return; }
    if (S.sheetView !== view) return;
    const items = els.map(pt).filter((x) => x.lat != null && x.t.name).map((x) => { const k = discKind(x.t); return { name: x.t.name, lat: x.lat, lon: x.lon, d: dist(c, x), sub: T(DISC[k]) + ' · ' + fmtDist(dist(c, x)), color: '#2E7D5B', icon: k === 'viewpoint' ? IC.mount : IC.compass }; })
      .sort((a, b) => a.d - b.d).filter((x, i, arr) => arr.findIndex((y) => y.name === x.name) === i).slice(0, 40);
    listSheet(title, view, esc(T('Points de vue, musées, châteaux, cascades et autres lieux à moins de 8 km.')), items, { foot: esc(T('Source : OpenStreetMap.')) });
  }

  /* ---------- #062 pique-nique et détente (Premium) ---------- */
  async function openPicnic() {
    const view = 'xpic', title = T('Pique-nique et détente'); loading(title, view);
    const c = here();
    let els; try { els = await osm(['["tourism"="picnic_site"]', '["leisure"="picnic_table"]', '["amenity"="bbq"]', '["leisure"="park"]["name"]', '["leisure"="beach_resort"]', '["natural"="beach"]["name"]'], 6000, c, 150); } catch (e) { fail(view); return; }
    if (S.sheetView !== view) return;
    const lab = (t) => t.amenity === 'bbq' ? T('Place de grillade') : t.tourism === 'picnic_site' ? T('Aire de pique-nique') : t.leisure === 'picnic_table' ? T('Table de pique-nique') : t.leisure === 'park' ? T('Parc') : T('Plage');
    const items = els.map(pt).filter((x) => x.lat != null).map((x) => ({ name: x.t.name || lab(x.t), lat: x.lat, lon: x.lon, d: dist(c, x), sub: [lab(x.t), fmtDist(dist(c, x)), x.t.covered === 'yes' ? T('couvert') : '', x.t.fireplace === 'yes' || x.t.amenity === 'bbq' ? T('foyer') : ''].filter(Boolean).join(' · '), color: '#16A05A', icon: IC.tree, r: x.t.tourism === 'picnic_site' || x.t.amenity === 'bbq' ? 0 : x.t.name ? 1 : 2 }))
      .sort((a, b) => a.r - b.r || a.d - b.d).filter((x, i, arr) => i === 0 || dist(x, arr[i - 1]) > 60).slice(0, 40);
    listSheet(title, view, esc(T('Aires de pique-nique, grillades, parcs et plages à moins de 6 km.')), items, { foot: esc(T('Source : OpenStreetMap. Vérifie les règles sur place (feu, horaires).')) });
    document.getElementById('sheetTitle').innerHTML = esc(title) + PREM;
  }

  /* ---------- #056 golden hour (Premium) et #051 bon moment pour sortir (Premium) ---------- */
  const hm = (t) => new Date(t * 1000).toLocaleTimeString(LANG(), { hour: '2-digit', minute: '2-digit' });
  async function openGolden() {
    const view = 'xgold', title = T('Golden hour'); loading(title, view);
    const c = here();
    let w, els = [];
    try { w = await getJson('https://api.open-meteo.com/v1/forecast?latitude=' + c.lat.toFixed(3) + '&longitude=' + c.lon.toFixed(3) + '&daily=sunrise,sunset&hourly=cloud_cover&forecast_days=2&timeformat=unixtime&timezone=auto'); } catch (e) { fail(view); return; }
    try { els = await osm(['["tourism"="viewpoint"]'], 12000, c, 60); } catch (e) { els = []; }
    if (S.sheetView !== view) return;
    const now = Date.now() / 1000, d = w.daily, H = w.hourly;
    const cloudAt = (t) => { let j = 0, b = Infinity; H.time.forEach((x, i) => { const dd = Math.abs(x - t); if (dd < b) { b = dd; j = i; } }); return H.cloud_cover[j]; };
    const slots = [];
    for (let i = 0; i < d.time.length; i++) { slots.push({ k: T('Lever du soleil'), s: d.sunrise[i], a: d.sunrise[i], b: d.sunrise[i] + 3600 }); slots.push({ k: T('Coucher du soleil'), s: d.sunset[i], a: d.sunset[i] - 3600, b: d.sunset[i] }); }
    const next = slots.filter((x) => x.b > now).slice(0, 3);
    const vp = els.map(pt).filter((x) => x.lat != null).map((x) => ({ name: x.t.name || T('Point de vue'), lat: x.lat, lon: x.lon, d: dist(c, x), sub: fmtDist(dist(c, x)) + (x.t.direction ? ' · ' + T('orienté {d}', { d: x.t.direction }) : ''), color: '#E8590C', icon: IC.mount })).sort((a, b) => a.d - b.d).slice(0, 20);
    const body = listSheet(title, view, '', vp, { empty: T('Aucun point de vue connu à moins de 12 km.'), foot: esc(T('Heures du soleil et nuages : Open-Meteo. Golden hour ≈ la première heure après le lever et la dernière avant le coucher. Points de vue : OpenStreetMap.')) });
    document.getElementById('sheetTitle').innerHTML = esc(title) + PREM;
    body.insertBefore(el('<div>' + next.map((x) => '<div class="card"><div class="grow"><b>' + esc(x.k) + ' · ' + esc(new Date(x.s * 1000).toLocaleDateString(LANG(), { weekday: 'long' })) + '</b><div class="sub">' + esc(T('Golden hour {a} – {b}', { a: hm(x.a), b: hm(x.b) })) + ' · ' + esc(T('Nuages : {p} %', { p: Math.round(cloudAt((x.a + x.b) / 2)) })) + '</div></div></div>').join('') + '<h3>' + esc(T('Points de vue proches')) + '</h3></div>'), body.firstChild);
  }
  async function openGoodTime() {
    const view = 'xtime', title = T('Bon moment pour sortir');
    const body = loading(title, view); document.getElementById('sheetTitle').innerHTML = esc(title) + PREM;
    const c = here();
    let w; try { w = await getJson('https://api.open-meteo.com/v1/forecast?latitude=' + c.lat.toFixed(3) + '&longitude=' + c.lon.toFixed(3) + '&hourly=temperature_2m,precipitation_probability,weather_code,wind_gusts_10m,is_day&forecast_days=2&timeformat=unixtime&timezone=auto'); } catch (e) { fail(view); return; }
    if (S.sheetView !== view) return;
    const H = w.hourly, now = Date.now() / 1000, rows = [];
    for (let i = 0; i < H.time.length; i++) if (H.time[i] >= now - 1800 && H.time[i] < now + 36 * 3600) rows.push({ t: H.time[i], tmp: H.temperature_2m[i], pp: H.precipitation_probability[i], g: H.wind_gusts_10m[i], day: H.is_day[i], code: H.weather_code[i] });
    const good = (r) => r.day && r.pp != null && r.pp <= 20 && r.g < 50 && r.code < 60;
    const wins = []; let cur = null;
    rows.forEach((r) => { if (good(r)) { if (!cur) cur = { a: r.t, b: r.t + 3600, n: 1, tmin: r.tmp, tmax: r.tmp }; else { cur.b = r.t + 3600; cur.n++; cur.tmin = Math.min(cur.tmin, r.tmp); cur.tmax = Math.max(cur.tmax, r.tmp); } } else if (cur) { wins.push(cur); cur = null; } });
    if (cur) wins.push(cur);
    const best = wins.filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 3).sort((a, b) => a.a - b.a);
    const day = (t) => new Date(t * 1000).toLocaleDateString(LANG(), { weekday: 'long' });
    body.innerHTML = '<p class="muted small">' + esc(T('Créneaux de jour avec peu de risque de pluie (20 % ou moins) et sans vent fort, sur les 36 prochaines heures.')) + '</p>' +
      (best.length ? best.map((x) => '<div class="card"><span class="ico" style="background:#F5C542">' + IC.sun + '</span><div class="grow"><b>' + esc(day(x.a)) + ' · ' + hm(x.a) + ' – ' + hm(x.b) + '</b><div class="sub">' + Math.round(x.tmin) + '° – ' + Math.round(x.tmax) + '°</div></div></div>').join('') : '<div class="empty">' + esc(T('Pas de créneau vraiment sec en journée d\'ici demain soir.')) + '</div>') +
      '<p class="muted small">' + esc(T('Prévisions Open-Meteo pour ta position. Elles peuvent changer.')) + '</p>';
  }

  /* ---------- #050 promenades avec chien ---------- */
  async function openDog() {
    const view = 'xdog', title = T('Promenade avec chien'); loading(title, view);
    const c = here();
    let els; try { els = await osm(['["leisure"="dog_park"]', '["leisure"="park"]["dog"~"^(yes|leashed|designated)$"]', '["amenity"="dog_toilet"]', '["vending"="excrement_bags"]'], 5000, c, 120); } catch (e) { fail(view); return; }
    if (S.sheetView !== view) return;
    const lab = (t) => t.leisure === 'dog_park' ? T('Parc à chiens') : t.amenity === 'dog_toilet' ? T('Toilettes pour chiens') : t.vending ? T('Distributeur de sacs') : T('Parc où les chiens sont admis');
    const leash = (t) => t.dog === 'leashed' ? T('en laisse') : t.dog === 'yes' ? T('chiens admis') : '';
    const items = els.map(pt).filter((x) => x.lat != null).map((x) => ({ name: x.t.name || lab(x.t), lat: x.lat, lon: x.lon, d: dist(c, x), sub: [lab(x.t), leash(x.t), fmtDist(dist(c, x))].filter(Boolean).join(' · '), color: '#B07A3E', icon: IC.dog, r: x.t.leisure === 'dog_park' ? 0 : x.t.leisure === 'park' ? 1 : 2 })).sort((a, b) => a.r - b.r || a.d - b.d).filter((x, i, arr) => x.r < 2 || arr.slice(0, i).filter((y) => y.r === 2).length < 5).slice(0, 40);
    listSheet(title, view, esc(T('Parcs à chiens et lieux équipés à moins de 5 km. La règle de laisse n\'est affichée que si elle est indiquée pour le lieu.')), items, { foot: esc(T('Source : OpenStreetMap. Les règles locales peuvent varier : respecte les panneaux.')) });
  }

  /* ---------- #059 randonnée (Premium) ---------- */
  const SAC = { hiking: 'T1 · randonnée', mountain_hiking: 'T2 · randonnée en montagne', demanding_mountain_hiking: 'T3 · montagne exigeante', alpine_hiking: 'T4 · randonnée alpine', demanding_alpine_hiking: 'T5 · alpine exigeante', difficult_alpine_hiking: 'T6 · alpine difficile' };
  async function openHike() {
    const view = 'xhike', title = T('Randonnée'); const body = loading(title, view); document.getElementById('sheetTitle').innerHTML = esc(title) + PREM;
    const c = here();
    let els;
    try { els = await Promise.race([A.overpass('[out:json][timeout:25];relation["route"="hiking"]["name"](around:6000,' + c.lat.toFixed(4) + ',' + c.lon.toFixed(4) + ');out tags center 40;', A.inCH && A.inCH(c)), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 30000))]); } catch (e) { fail(view); return; }
    if (S.sheetView !== view) return;
    const items = els.map((e) => ({ name: e.tags.name, lat: e.center && e.center.lat, lon: e.center && e.center.lon, t: e.tags })).filter((x) => x.lat != null)
      .map((x) => ({ name: x.name, lat: x.lat, lon: x.lon, d: dist(c, x), sub: [x.t.distance ? x.t.distance + ' km' : '', x.t.ascent ? '↑ ' + x.t.ascent + ' m' : '', x.t.sac_scale && SAC[x.t.sac_scale] ? T(SAC[x.t.sac_scale]) : '', x.t.network === 'nwn' ? T('national') : x.t.network === 'rwn' ? T('régional') : x.t.network === 'lwn' ? T('local') : ''].filter(Boolean).join(' · ') || T('Itinéraire balisé'), color: '#2E7D5B', icon: IC.mount }))
      .sort((a, b) => a.d - b.d).slice(0, 30);
    listSheet(title, view, esc(T('Itinéraires de randonnée balisés autour de toi. Touche-en un pour y aller ; ensuite, tu peux suivre ton activité dans « Mes activités ».')), items, { foot: esc(T('Source : OpenStreetMap. Distance, dénivelé et difficulté seulement quand ils sont indiqués. Vérifie la météo et l\'état des sentiers avant de partir.')) });
    document.getElementById('sheetTitle').innerHTML = esc(title) + PREM;
  }

  /* ---------- #064 visite guidée à pied (Premium) et #045 boucle (Premium) ---------- */
  function routeVia(stops, back, mode) {
    const c = here();
    S.mode = mode; store.set('routa.mode', mode);
    const dest = back ? { name: T('Retour au départ'), lat: c.lat + 0.00005, lon: c.lon + 0.00005 } : stops[stops.length - 1];
    const vias = back ? stops : stops.slice(0, -1);
    if (X.setVias) X.setVias(dest, vias);
    closeSheet(); chooseDestination(dest);
  }
  async function openTour() {
    const view = 'xtour', title = T('Visite guidée à pied'); loading(title, view); document.getElementById('sheetTitle').innerHTML = esc(title) + PREM;
    const c = here();
    let els; try { els = await osm(['["tourism"~"^(attraction|museum|artwork|viewpoint)$"]["name"]', '["historic"~"^(castle|monument|memorial|church|building|city_gate|fountain)$"]["name"]', '["amenity"="fountain"]["name"]'], 1500, c, 120); } catch (e) { fail(view); return; }
    if (S.sheetView !== view) return;
    let pool = els.map(pt).filter((x) => x.lat != null && x.t.name).filter((x, i, arr) => arr.findIndex((y) => y.t.name === x.t.name) === i);
    if (pool.length < 3) { document.getElementById('sheetBody').innerHTML = '<div class="empty">' + esc(T('Pas assez de lieux intéressants connus à pied d\'ici pour composer une visite.')) + '</div>'; return; }
    // parcours glouton du plus proche, 6 étapes au plus, en restant à moins de 1,5 km
    const stops = []; let cur = c;
    while (stops.length < 6 && pool.length) { pool.sort((a, b) => dist(cur, a) - dist(cur, b)); const n = pool.shift(); if (dist(c, n) > 1500) break; stops.push({ name: n.t.name, lat: n.lat, lon: n.lon }); cur = n; }
    const total = stops.reduce((s, x, i) => s + dist(i ? stops[i - 1] : c, x), 0) + dist(stops[stops.length - 1], c);
    const body = openSheet(title, '<p class="muted small">' + esc(T('Une boucle à pied qui passe par les lieux connus les plus proches, puis revient au départ.')) + '</p>' +
      '<div class="planline">' + [T('Départ')].concat(stops.map((s) => s.name), [T('Retour au départ')]).map((n, i, a) => '<div class="plstop' + (i === 0 || i === a.length - 1 ? ' end' : '') + '"><i></i><span>' + esc(n) + '</span></div>').join('') + '</div>' +
      '<p class="muted">' + esc(T('Environ {d} à vol d\'oiseau, un peu plus à pied.', { d: fmtDist(Math.round(total / 100) * 100) })) + '</p>' +
      '<button class="btn primary block" id="tourGo">' + esc(T('Calculer la visite')) + '</button><p class="muted small">' + esc(T('Source : OpenStreetMap.')) + '</p>', view);
    document.getElementById('sheetTitle').innerHTML = esc(title) + PREM;
    body.querySelector('#tourGo').onclick = () => routeVia(stops, true, 'walk');
  }
  function openLoop() {
    const view = 'xloop', title = T('Parcours en boucle');
    const body = openSheet(title, '<p class="muted small">' + esc(T('Choisis l\'activité et la distance : ROUTA calcule une boucle qui revient à ton point de départ.')) + '</p>' +
      '<div class="seg" id="lpMode"><button data-m="walk" class="on">' + esc(T('À pied')) + '</button><button data-m="bike">' + esc(T('Vélo')) + '</button></div>' +
      '<div class="seg" id="lpKm" style="margin-top:8px"></div>' +
      '<div class="seg" id="lpDir" style="margin-top:8px">' + [['N', 'Nord'], ['E', 'Est'], ['S', 'Sud'], ['W', 'Ouest'], ['?', 'Au hasard']].map(([k, n], i) => '<button data-d="' + k + '"' + (i === 4 ? ' class="on"' : '') + '>' + esc(T(n)) + '</button>').join('') + '</div>' +
      '<button class="btn primary block" id="lpGo" style="margin-top:10px">' + esc(T('Calculer la boucle')) + '</button><p class="muted small">' + esc(T('La longueur réelle dépend des chemins disponibles : elle s\'affiche dans l\'aperçu avant de partir.')) + '</p>', view);
    document.getElementById('sheetTitle').innerHTML = esc(title) + PREM;
    const KM = { walk: [3, 5, 8, 12], bike: [10, 20, 35, 50] };
    const drawKm = (m) => { body.querySelector('#lpKm').innerHTML = KM[m].map((k, i) => '<button data-k="' + k + '"' + (i === 1 ? ' class="on"' : '') + '>' + k + ' km</button>').join(''); body.querySelectorAll('#lpKm button').forEach((b) => { b.onclick = () => body.querySelectorAll('#lpKm button').forEach((x) => x.classList.toggle('on', x === b)); }); };
    drawKm('walk');
    body.querySelectorAll('#lpMode button').forEach((b) => { b.onclick = () => { body.querySelectorAll('#lpMode button').forEach((x) => x.classList.toggle('on', x === b)); drawKm(b.dataset.m); }; });
    body.querySelectorAll('#lpDir button').forEach((b) => { b.onclick = () => body.querySelectorAll('#lpDir button').forEach((x) => x.classList.toggle('on', x === b)); });
    body.querySelector('#lpGo').onclick = () => {
      const m = body.querySelector('#lpMode .on').dataset.m, km = +body.querySelector('#lpKm .on').dataset.k, dsel = body.querySelector('#lpDir .on').dataset.d;
      const c = here(), deg = dsel === 'N' ? 0 : dsel === 'E' ? 90 : dsel === 'S' ? 180 : dsel === 'W' ? 270 : Math.random() * 360;
      // triangle équilatéral : périmètre ≈ km × 0,75 en ligne droite (les chemins rallongent)
      const side = km * 1000 * 0.75 / 3, R = 6371000;
      const off = (p, brg, d) => { const b = brg * Math.PI / 180, la = p.lat * Math.PI / 180, lo = p.lon * Math.PI / 180, dr = d / R; const la2 = Math.asin(Math.sin(la) * Math.cos(dr) + Math.cos(la) * Math.sin(dr) * Math.cos(b)); const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(la), Math.cos(dr) - Math.sin(la) * Math.sin(la2)); return { lat: la2 * 180 / Math.PI, lon: lo2 * 180 / Math.PI }; };
      const p1 = off(c, deg - 30, side), p2 = off(c, deg + 30, side);
      routeVia([Object.assign(p1, { name: T('Boucle · point 1') }), Object.assign(p2, { name: T('Boucle · point 2') })], true, m);
    };
  }

  /* ---------- #035 destination surprise ---------- */
  function openSurprise() {
    const view = 'xsurp', title = T('Destination surprise');
    const body = openSheet(title, '<p class="muted small">' + esc(T('ROUTA tire au sort un spot ou un col de la carte, à la distance que tu choisis.')) + '</p>' +
      '<div class="seg" id="spKm">' + [[20, '< 20 km'], [50, '20 – 50 km'], [120, '50 – 120 km']].map(([k, n], i) => '<button data-k="' + k + '"' + (i === 1 ? ' class="on"' : '') + '>' + n + '</button>').join('') + '</div>' +
      '<button class="btn primary block" id="spGo" style="margin-top:10px">' + esc(T('Surprends-moi')) + '</button><div id="spOut"></div>', view);
    body.querySelectorAll('#spKm button').forEach((b) => { b.onclick = () => body.querySelectorAll('#spKm button').forEach((x) => x.classList.toggle('on', x === b)); });
    body.querySelector('#spGo').onclick = () => {
      const k = +body.querySelector('#spKm .on').dataset.k, lo = k === 20 ? 0 : k === 50 ? 20000 : 50000, hi = k * 1000, c = here();
      const pool = [...S.spots.values()].filter((s) => s.lat != null && s.category !== 'danger').filter((s) => { const d = dist(c, s); return d >= lo && d <= hi; });
      const out = body.querySelector('#spOut');
      if (!pool.length) { out.innerHTML = '<div class="empty">' + esc(T('Aucun spot à cette distance pour le moment.')) + '</div>'; return; }
      const s = pool[Math.floor(Math.random() * pool.length)];
      out.innerHTML = '<div class="card"><span class="ico" style="background:#7C5CFF">' + IC.dice + '</span><div class="grow"><b>' + esc(s.name) + '</b><div class="sub">' + esc(fmtDist(dist(c, s))) + (s.description ? ' · ' + esc(String(s.description).slice(0, 90)) : '') + '</div></div></div><div class="row"><button class="btn soft grow" id="spAgain">' + esc(T('Autre idée')) + '</button><button class="btn grow" id="spLet">' + esc(T('On y va')) + '</button></div>';
      out.querySelector('#spAgain').onclick = () => body.querySelector('#spGo').onclick();
      out.querySelector('#spLet').onclick = () => { closeSheet(); chooseDestination({ name: s.name, lat: s.lat, lon: s.lon }); };
    };
  }

  /* ---------- hub « Explorer autour » ---------- */
  const HUB = [
    ['disc', IC.compass, 'Lieux à découvrir', 'Points de vue, musées, châteaux, cascades', openDiscover, 0],
    ['surp', IC.dice, 'Destination surprise', 'Un spot tiré au sort selon la distance', openSurprise, 0],
    ['dog', IC.dog, 'Promenade avec chien', 'Parcs à chiens et lieux équipés', openDog, 0],
    ['pic', IC.tree, 'Pique-nique et détente', 'Aires, grillades, parcs et plages', openPicnic, 1],
    ['gold', IC.sun, 'Golden hour', 'Heures de lumière dorée et points de vue', openGolden, 1],
    ['time', IC.cloud, 'Bon moment pour sortir', 'Créneaux secs selon la météo', openGoodTime, 1],
    ['hike', IC.mount, 'Randonnée', 'Itinéraires balisés, distance, dénivelé, difficulté', openHike, 1],
    ['tour', IC.walk, 'Visite guidée à pied', 'Boucle par les lieux connus proches', openTour, 1],
    ['loop', IC.loop, 'Parcours en boucle', 'À pied ou à vélo, retour au départ', openLoop, 1]
  ];
  function openExplore() {
    const body = openSheet(T('Explorer autour'), HUB.map(([k, ic, n, s, , p]) => '<button class="card tap" data-x="' + k + '"><span class="ico" style="background:#2B3340">' + ic + '</span><span class="grow"><b>' + esc(T(n)) + (p ? PREM : '') + '</b><span class="sub">' + esc(T(s)) + '</span></span></button>').join(''), 'explore');
    body.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => HUB.find((h) => h[0] === b.dataset.x)[4](); });
  }

  /* ---------- #055 garages et équipement selon le véhicule ---------- */
  async function openRepair() {
    const v = A.veh ? A.veh() : {}, type = (S.vehicle && S.vehicle.type) || '';
    const view = 'xrep', title = T('Garages et équipement'); loading(title, view);
    const c = here();
    const bike = /velo|bike/.test(type), moto = /moto|scooter/.test(type);
    const F = bike ? ['["shop"="bicycle"]', '["amenity"="bicycle_repair_station"]'] : moto ? ['["shop"="motorcycle"]', '["shop"="motorcycle_repair"]', '["shop"="car_repair"]'] : v.heavy ? ['["shop"="truck_repair"]', '["shop"="car_repair"]["service:vehicle:truck"="yes"]', '["shop"="tyres"]'] : ['["shop"="car_repair"]', '["shop"="tyres"]', '["shop"="car_parts"]', '["amenity"="car_wash"]'].concat(v.ev ? ['["amenity"="charging_station"]'] : []);
    let els; try { els = await osm(F, bike ? 5000 : 10000, c, 120); } catch (e) { fail(view); return; }
    if (S.sheetView !== view) return;
    const lab = (t) => ({ car_repair: 'Garage', tyres: 'Pneus', car_parts: 'Pièces auto', truck_repair: 'Garage poids lourds', bicycle: 'Magasin de vélos', motorcycle: 'Moto', motorcycle_repair: 'Garage moto' })[t.shop] || (t.amenity === 'car_wash' ? 'Lavage' : t.amenity === 'bicycle_repair_station' ? 'Station de réparation vélo' : t.amenity === 'charging_station' ? 'Borne de recharge' : 'Garage');
    const favs = store.get('routa.favGarages', []);
    const isFav = (x) => favs.some((f) => dist(f, x) < 40);
    const items = els.map(pt).filter((x) => x.lat != null).map((x) => { const st = x.t.opening_hours && A.ohStatus(A.ohParse(x.t.opening_hours)); return { name: x.t.name || T(lab(x.t)), lat: x.lat, lon: x.lon, d: dist(c, x), sub: [T(lab(x.t)), fmtDist(dist(c, x)), st ? st.txt : ''].filter(Boolean).join(' · '), phone: x.t.phone || x.t['contact:phone'] || '' }; }).filter((x) => !isFav(x)).sort((a, b) => a.d - b.d).slice(0, 40);
    const card = (x, i, fav) => '<div class="card favrow"><button class="grow tapzone" data-go="' + i + '"><b>' + esc(x.name) + '</b><span class="sub">' + esc(fav ? T('Mon garage') + ' · ' + fmtDist(dist(c, x)) : x.sub) + '</span></button>' + (x.phone ? '<a class="iconbtn small" href="tel:' + esc(String(x.phone).split(';')[0].replace(/[^+\d]/g, '')) + '" aria-label="' + esc(T('Appeler')) + '">' + A.ic('phone') + '</a>' : '') + '<button class="iconbtn small favstar' + (fav ? ' on' : '') + '" data-fav="' + i + '" aria-label="' + esc(fav ? T('Retirer de mes garages') : T('Ajouter à mes garages')) + '" aria-pressed="' + (fav ? 'true' : 'false') + '">' + (fav ? '★' : '☆') + '</button></div>';
    const all = favs.map((f) => Object.assign({ fav: true }, f)).concat(items);
    const body = openSheet(title, '<p class="muted small">' + esc(T('Adapté à ton véhicule actif. Touche l\'étoile pour garder ton garage en haut de la liste.')) + '</p>' +
      (favs.length ? '<h3>' + esc(T('Mes garages')) + '</h3>' + favs.map((f, i) => card(f, i, true)).join('') + '<h3>' + esc(T('Autour de toi')) + '</h3>' : '') +
      (items.length ? items.map((x, i) => card(x, favs.length + i, false)).join('') : '<div class="empty">' + esc(T('Rien trouvé autour de toi pour le moment.')) + '</div>') +
      '<p class="muted small">' + esc(T('Source : OpenStreetMap. Appelle avant de passer pour vérifier les horaires.')) + '</p>', view);
    body.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => { const x = all[+b.dataset.go]; closeSheet(); chooseDestination({ name: x.name, lat: x.lat, lon: x.lon }); }; });
    body.querySelectorAll('[data-fav]').forEach((b) => { b.onclick = () => { const x = all[+b.dataset.fav]; let F = store.get('routa.favGarages', []); if (x.fav) F = F.filter((f) => dist(f, x) >= 40); else F.push({ name: x.name, lat: x.lat, lon: x.lon, phone: x.phone || '' }); store.set('routa.favGarages', F.slice(-5)); openRepair(); }; });
  }

  /* ---------- #029 assistance en panne ---------- */
  function openBreakdown() {
    const c = S.pos, CT = window.ROUTA_COUNTRIES || {}, k = CT[S.country] || CT.CH || null;
    const sos = k ? k.sos.filter(([l]) => /dépann|panne|TCS|ADAC|ACI|ACI|police|Police|Polizia/i.test(l)) : [];
    const link = c ? 'https://www.openstreetmap.org/?mlat=' + c.lat.toFixed(5) + '&mlon=' + c.lon.toFixed(5) + '#map=17/' + c.lat.toFixed(5) + '/' + c.lon.toFixed(5) : '';
    const body = openSheet(T('En panne'),
      '<div class="banner warnb">' + IC.sos + '<span>' + esc(T('En cas de danger ou de blessé, appelle les secours : ROUTA ne les contacte pas automatiquement.')) + '</span></div>' +
      assistHtml() +
      (k ? '<a class="btn block sosbtn" href="tel:' + esc(k.main) + '">' + esc(T('Appeler le {n}', { n: k.main })) + '</a>' + sos.map(([l, n]) => '<a class="card tap telrow" href="tel:' + esc(n) + '"><div class="grow"><b>' + esc(T(l)) + '</b></div><div class="val">' + esc(n) + '</div></a>').join('') : '') +
      '<h3>' + esc(T('Sécurise-toi')) + '</h3><div class="card"><div class="grow"><div class="sub">' + esc(T('Feux de détresse, gilet avant de sortir, triangle derrière le véhicule, puis attends derrière la glissière si tu es sur autoroute.')) + (k && k.must && k.must.length ? '<br>' + esc(T('Obligatoire ici')) + ' : ' + k.must.map((m) => esc(T(m))).join(', ') : '') + '</div></div></div>' +
      (c ? '<h3>' + esc(T('Ma position')) + '</h3><div class="card"><div class="grow"><b>' + c.lat.toFixed(5) + ', ' + c.lon.toFixed(5) + '</b><div class="sub">' + esc(T('À donner au dépanneur ou aux secours.')) + '</div></div></div><button class="btn soft block" id="bdShare">' + esc(T('Partager ma position')) + '</button>' : '<p class="muted">' + esc(T('Position inconnue pour le moment.')) + '</p>') +
      '<button class="btn soft block" id="bdGar">' + esc(T('Garages et dépanneurs proches')) + '</button>', 'breakdown');
    const sh = body.querySelector('#bdShare'); if (sh) sh.onclick = async () => { const txt = T('Je suis en panne ici : {u}', { u: link }); try { if (navigator.share) { await navigator.share({ title: 'ROUTA', text: txt }); return; } } catch (e) { if (e && e.name === 'AbortError') return; } try { await navigator.clipboard.writeText(txt); toast(esc(T('Position copiée.'))); } catch (e) { toast(esc(link)); } };
    body.querySelector('#bdGar').onclick = openRepair;
    bindAssist(body);
  }
  /* Mon assistance / assurance dépannage : gardée sur ce téléphone, toujours en haut de « En panne » */
  function assistHtml() {
    const L = store.get('routa.assist', []);
    return (L.length ? L.map((a, i) => '<div class="card favrow"><a class="grow tapzone" href="tel:' + esc(a.tel.replace(/[^+\d]/g, '')) + '"><b>' + esc(a.name) + '</b><span class="sub">' + esc(T('Mon assistance')) + ' · ' + esc(a.tel) + (a.ref ? ' · ' + esc(T('N° de contrat')) + ' ' + esc(a.ref) : '') + '</span></a><button class="iconbtn small" data-asdel="' + i + '" aria-label="' + esc(T('Retirer')) + '">×</button></div>').join('') : '') +
      '<details class="card" style="display:block"' + (L.length ? '' : ' open') + '><summary style="cursor:pointer;font-weight:700">' + esc(L.length ? T('Ajouter une autre assistance') : T('Ajoute ton assistance dépannage ou ton assurance')) + '</summary>' +
      '<form id="asForm"><label class="field" for="asName"><span>' + esc(T('Nom (ex. : ton assurance, TCS, assistance du constructeur)')) + '</span><input id="asName" type="text" maxlength="40" required></label>' +
      '<label class="field" for="asTel"><span>' + esc(T('Numéro de dépannage')) + '</span><input id="asTel" type="tel" maxlength="24" required></label>' +
      '<label class="field" for="asRef"><span>' + esc(T('N° de contrat (facultatif)')) + '</span><input id="asRef" type="text" maxlength="30"></label>' +
      '<button class="btn block" type="submit">' + esc(T('Enregistrer')) + '</button><p class="muted small">' + esc(T('Reste uniquement sur ce téléphone.')) + '</p></form></details>';
  }
  function bindAssist(body) {
    const f = body.querySelector('#asForm'); if (f) f.onsubmit = (e) => { e.preventDefault(); const name = body.querySelector('#asName').value.trim(), tel = body.querySelector('#asTel').value.trim(); if (!name || !/\d{3,}/.test(tel)) { toast(esc(T('Indique un nom et un numéro.'))); return; } const L = store.get('routa.assist', []); L.unshift({ name, tel, ref: body.querySelector('#asRef').value.trim() }); store.set('routa.assist', L.slice(0, 4)); openBreakdown(); };
    body.querySelectorAll('[data-asdel]').forEach((b) => { b.onclick = () => { const L = store.get('routa.assist', []); L.splice(+b.dataset.asdel, 1); store.set('routa.assist', L); openBreakdown(); }; });
  }

  /* ---------- #054 checklists de voyage (Premium) ---------- */
  const CL_TPL = { trip: ['Permis et papiers du véhicule', 'Pièce d\'identité', 'Vignette ou badge de péage', 'Gilet et triangle', 'Chargeur de téléphone', 'Eau et en-cas', 'Lunettes de soleil'], winter: ['Pneus d\'hiver', 'Raclette et balai à neige', 'Lave-glace antigel', 'Chaînes si la route l\'exige', 'Couverture'], abroad: ['Assurance valable à l\'étranger', 'Vignettes des pays traversés', 'Équipement obligatoire du pays', 'Carte bancaire et un peu d\'espèces', 'Numéros d\'urgence notés'] };
  const CL_N = { trip: 'Départ en voyage', winter: 'Route en hiver', abroad: 'Voyage à l\'étranger' };
  function openChecklists() {
    const L = store.get('routa.checklists', null) || Object.keys(CL_TPL).map((k) => ({ id: k, name: CL_N[k], items: CL_TPL[k].map((t) => ({ t, ok: false })) }));
    const saveL = () => store.set('routa.checklists', L);
    const body = openSheet(T('Checklists de voyage'), '', 'checklists');
    document.getElementById('sheetTitle').innerHTML = esc(T('Checklists de voyage')) + PREM;
    const draw = () => {
      body.innerHTML = L.map((l, i) => '<details class="card" style="display:block"' + (i === 0 ? ' open' : '') + '><summary style="cursor:pointer;font-weight:700">' + esc(T(l.name)) + ' · ' + l.items.filter((x) => x.ok).length + '/' + l.items.length + '</summary>' +
        l.items.map((x, j) => '<label class="clrow"><input type="checkbox" data-l="' + i + '" data-j="' + j + '"' + (x.ok ? ' checked' : '') + '><span>' + esc(T(x.t)) + '</span><button class="iconbtn small" data-del="' + i + ',' + j + '" aria-label="' + esc(T('Retirer')) + '">×</button></label>').join('') +
        '<form class="row" data-add="' + i + '" style="margin-top:8px"><label class="field grow"><span class="sr">' + esc(T('Ajouter un élément')) + '</span><input type="text" maxlength="60" placeholder="' + esc(T('Ajouter un élément')) + '"></label><button class="btn small" type="submit">+</button></form>' +
        '<button class="btn ghost small" data-reset="' + i + '">' + esc(T('Tout décocher')) + '</button></details>').join('') + '<p class="muted small">' + esc(T('Tes listes restent sur ce téléphone. Ajoute ou retire ce que tu veux.')) + '</p>';
      body.querySelectorAll('input[type=checkbox]').forEach((c) => { c.onchange = () => { L[+c.dataset.l].items[+c.dataset.j].ok = c.checked; saveL(); draw(); }; });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = (e) => { e.preventDefault(); const [i, j] = b.dataset.del.split(',').map(Number); L[i].items.splice(j, 1); saveL(); draw(); }; });
      body.querySelectorAll('[data-add]').forEach((f) => { f.onsubmit = (e) => { e.preventDefault(); const v = f.querySelector('input').value.trim(); if (!v) return; L[+f.dataset.add].items.push({ t: v, ok: false }); saveL(); draw(); }; });
      body.querySelectorAll('[data-reset]').forEach((b) => { b.onclick = () => { L[+b.dataset.reset].items.forEach((x) => { x.ok = false; }); saveL(); draw(); }; });
    };
    draw();
  }

  /* ---------- #068 villes-étapes (Premium) dans l'aperçu des longs trajets ---------- */
  X.cityStops = async (R, dest) => {
    const view = 'xcity', title = T('Villes-étapes'); loading(title, view); document.getElementById('sheetTitle').innerHTML = esc(title) + PREM;
    const C = R.coords, cum = [0]; for (let i = 1; i < C.length; i++) cum.push(cum[i - 1] + dist(C[i - 1], C[i]));
    const tot = cum[cum.length - 1] || 1, pts = [];
    for (let t = 3 * 3600; t < R.duration - 1800; t += 3 * 3600) { const target = tot * t / R.duration; let i = cum.findIndex((d) => d >= target); if (i < 0) i = C.length - 1; pts.push({ t, p: C[i] }); }
    const out = [];
    for (const x of pts) {
      let towns = [];
      try { const els = await osm(['["place"~"^(city|town)$"]["name"]'], 15000, x.p, 40); towns = els.map(pt).filter((y) => y.lat != null).map((y) => ({ name: y.t.name, lat: y.lat, lon: y.lon, d: dist(x.p, y), pop: +y.t.population || 0, city: y.t.place === 'city' })).sort((a, b) => (b.city - a.city) || (a.d - b.d)).slice(0, 3); } catch (e) { towns = []; }
      out.push({ t: x.t, towns });
    }
    if (S.sheetView !== view) return;
    const list = [];
    const body = document.getElementById('sheetBody');
    body.innerHTML = '<p class="muted small">' + esc(T('Une étape environ toutes les 3 heures de route, dans des villes proches du trajet.')) + '</p>' + out.map((o) => '<h3>' + esc(T('Après environ {t} de route', { t: fmtDur(o.t) })) + '</h3>' + (o.towns.length ? o.towns.map((c) => { list.push(c); return '<button class="card tap" data-i="' + (list.length - 1) + '"><span class="ico" style="background:#4DA3FF">' + IC.city + '</span><span class="grow"><b>' + esc(c.name) + '</b><span class="sub">' + esc(T('{d} du trajet', { d: fmtDist(c.d) })) + '</span></span><span class="val small">' + esc(T('Ajouter')) + '</span></button>'; }).join('') : '<p class="muted small">' + esc(T('Pas de ville connue près de ce point.')) + '</p>')).join('') + '<p class="muted small">' + esc(T('Source : OpenStreetMap.')) + '</p>';
    body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const c = list[+b.dataset.i]; X.addVia({ name: c.name, lat: c.lat, lon: c.lon }, dest); }; });
  };


  /* ---------- #023 conseils discrets (gratuit) et #069 conseils personnalisés (Premium) : visuels, rares, désactivables ---------- */
  async function tipTick() {
    if (S.settings.tips === false || S.nav || !S.pos || document.hidden) return;
    if (Date.now() - store.get('routa.tipAt', 0) < 36 * 3600000) return;
    const c = S.pos, m = new Date().getMonth(), h = new Date().getHours();
    let msg = null, act = null;
    try {
      const w = await getJson('https://api.open-meteo.com/v1/forecast?latitude=' + c.lat.toFixed(3) + '&longitude=' + c.lon.toFixed(3) + '&current=temperature_2m&hourly=precipitation_probability&forecast_hours=2&timeformat=unixtime');
      const t = w.current && w.current.temperature_2m, pp = Math.max(...((w.hourly && w.hourly.precipitation_probability) || [0]));
      if (t != null && t <= 2 && (m >= 9 || m <= 3)) msg = T('Il fait {t}° : attention au verglas, surtout sur les ponts et à l\'ombre.', { t: Math.round(t) });
      else if (pp >= 70) msg = T('Pluie probable dans l\'heure près de toi : garde plus de distance.');
    } catch (e) { /* météo indisponible */ }
    if (!msg) {
      const D = store.get('routa.drives', []).filter((d) => d.s > Date.now() - 60 * 86400000 && d.p1 && d.c1);
      const wd = new Date().getDay();
      const same = D.filter((d) => { const x = new Date(d.s); return x.getDay() === wd && Math.abs(x.getHours() - h) <= 1; });
      const cnt = {}; same.forEach((d) => { cnt[d.c1] = (cnt[d.c1] || []).concat([d.p1]); });
      const top = Object.entries(cnt).sort((a, b) => b[1].length - a[1].length)[0];
      if (top && top[1].length >= 3 && dist(c, top[1][0]) > 2000) {
        msg = T('Tu vas souvent à {c} à cette heure-ci.', { c: top[0] }) + ' <span class="prem">PRO</span>';
        act = () => chooseDestination({ name: top[0], lat: top[1][0].lat, lon: top[1][0].lon });
      }
    }
    if (!msg) return;
    store.set('routa.tipAt', Date.now());
    toast(msg.indexOf('<span') > 0 ? esc(msg.split(' <span')[0]) + ' <span class="prem">PRO</span>' : esc(msg), act ? { action: T('Itinéraire'), onAction: act, ms: 9000 } : { ms: 8000 });
  }
  setTimeout(tipTick, 25000); setInterval(tipTick, 30 * 60000);


  /* ---------- #061 derniers mètres : entrée connue du bâtiment (OpenStreetMap), jamais inventée ---------- */
  const ENT_LBL = { main: 'Entrée principale', yes: 'Entrée', service: 'Entrée de service', garage: 'Entrée du garage', staircase: 'Entrée d\'immeuble', emergency: 'Entrée des urgences' };
  async function entranceNear(d) {
    const q = '[out:json][timeout:10];node["entrance"~"^(main|yes|staircase|emergency)$"](around:70,' + d.lat.toFixed(6) + ',' + d.lon.toFixed(6) + ');out 20;';
    const els = await Promise.race([A.overpass(q, A.inCH && A.inCH(d)), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 15000))]);
    const L = (els || []).filter((e) => e.lat != null).map((e) => ({ lat: e.lat, lon: e.lon, t: e.tags || {}, d: dist(d, e) }));
    if (!L.length) return null;
    const rank = (x) => (x.t.entrance === 'main' ? 0 : x.t.entrance === 'emergency' && /h[oô]pital|hospital|spital|urgence/i.test(d.name || '') ? 0 : 1);
    L.sort((a, b) => rank(a) - rank(b) || a.d - b.d);
    const e = L[0]; if (e.d > 70 || (rank(e) && L.length > 3)) return null;
    return e;
  }
  const prevPreview = X.preview;
  X.preview = (R, dest, body) => {
    if (prevPreview) prevPreview(R, dest, body);
    if (!dest || dest.entrance || /^(Entrée|Entrance)/.test(dest.name || '')) return;
    entranceNear(dest).then((e) => {
      const go = body.querySelector('#goNav'); if (!e || !go || !body.isConnected) return;
      const lbl = T(ENT_LBL[e.t.entrance] || 'Entrée') + (e.t.name ? ' · ' + e.t.name : e.t.ref ? ' ' + e.t.ref : '');
      const b = el('<div class="banner"><span>' + IC.compass + '</span><span><b>' + esc(lbl) + '</b> ' + esc(T('repérée à {d} du point choisi.', { d: fmtDist(Math.max(5, Math.round(e.d / 5) * 5)) })) + ' <button class="linkbtn wxmore" type="button">' + esc(T('Aller jusqu\'à l\'entrée')) + '</button></span></div>');
      b.querySelector('button').onclick = () => chooseDestination({ name: lbl, sub: dest.name, lat: e.lat, lon: e.lon, entrance: true });
      go.parentNode.insertBefore(b, go);
    }).catch(() => { /* pas d'info d'entrée */ });
  };


  /* ---------- #033 ROUTA Moments : une anecdote locale à l'arrivée, seulement si activé (Wikipédia, source citée) ---------- */
  async function moment(p) {
    if (!S.settings.moments || !p) return;
    const lg = /^(fr|en|de|it|pt|es|tr|sq|sr)$/.test(A.I18N.lang) ? A.I18N.lang : 'fr';
    try {
      const g = await getJson('https://' + lg + '.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=' + p.lat.toFixed(5) + '|' + p.lon.toFixed(5) + '&gsradius=1500&gslimit=8&format=json&origin=*', 8000);
      const L = ((g.query && g.query.geosearch) || []).filter((x) => !/^(Gare|Liste|Bahnhof|Stazione|Station)\b/i.test(x.title));
      if (!L.length) return;
      const pick = L[0];
      const ex = await getJson('https://' + lg + '.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=3&pageids=' + pick.pageid + '&format=json&origin=*', 8000);
      const pg = ex.query && ex.query.pages && ex.query.pages[pick.pageid]; const txt = pg && pg.extract; if (!txt) return;
      const url = 'https://' + lg + '.wikipedia.org/?curid=' + pick.pageid;
      toast('<b>' + esc(T('ROUTA Moments')) + '</b> · ' + esc(pick.title) + ' (' + esc(fmtDist(pick.dist)) + ')', { action: T('Lire'), ms: 12000, onAction: () => {
        openSheet(pick.title, '<p>' + esc(txt) + '</p><p class="muted small">' + esc(T('Extrait de Wikipédia (licence CC BY-SA).')) + ' <a href="' + esc(url) + '" target="_blank" rel="noopener" style="color:var(--info)">' + esc(T('Lire l\'article')) + '</a></p>', 'xmoment');
      } });
    } catch (e) { /* rien à raconter */ }
  }
  const arr0 = X.arrived;
  X.arrived = (d) => { if (arr0) arr0(d); setTimeout(() => moment(S.pos || d), 4000); };
  X.moment = moment;

  /* ---------- branchement au menu ---------- */
  const tiles0 = X.tiles;
  X.tiles = () => (tiles0 ? tiles0() : []).concat([['explore', IC.compass, T('Explorer autour')], ['repair', IC.wrench, T('Garages et équipement')], ['breakdown', IC.sos, T('En panne')], ['checklists', IC.list, T('Checklists de voyage')]]);
  const open0 = X.open;
  const MAP = { explore: openExplore, repair: openRepair, breakdown: openBreakdown, checklists: openChecklists };
  X.open = (k) => { if (MAP[k]) { MAP[k](); return true; } return open0 ? open0(k) : false; };
  X.openExplore = openExplore; X.openBreakdown = openBreakdown;
})();
