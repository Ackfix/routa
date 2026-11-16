/* ROUTA – #066 Suivi des activités (Premium, étiquette seulement pendant les tests).
   Marche, randonnée, course et vélo : distance, durée, vitesse ou allure, dénivelé positif (si le téléphone donne l'altitude).
   Le suivi de conduite (#009) n'est pas touché. Tout reste sur ce téléphone. */
(function () {
  'use strict';
  const A = window.ROUTA, X = window.ROUTA_X;
  if (!A || !X) return;
  const { S, esc, el, toast, openSheet, fmtDist, fmtDur, store, dist } = A;
  const T = (s, v) => { let o = (A.I18N && A.I18N.t) ? A.I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
  const LANG = () => { const l = (A.I18N && A.I18N.lang) || 'fr'; return l === 'en' ? 'en-GB' : l === 'sr' ? 'sr-Latn' : l; };
  const nf = (n, d) => (+n || 0).toLocaleString(LANG(), { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });
  const ICO = '<svg viewBox="0 0 24 24"><circle cx="14" cy="4.5" r="2"/><path d="M8 21l3-6 3 2v4M10 9l4-1 3 4 3 1M10 9l-3 4M14 8l-2 7"/></svg>';
  const TYPES = [['walk', 'Marche'], ['hike', 'Randonnée'], ['run', 'Course'], ['bike', 'Vélo']];
  const KEY = 'routa.acts';
  const load = () => store.get(KEY, []);
  const save = (l) => store.set(KEY, l.slice(-200));
  let cur = store.get('routa.actcur', null), timer = null, lastP = null, lastAlt = null;
  const persist = () => store.set('routa.actcur', cur);
  const elapsed = (a) => (a.mv || 0) + (a.run && a.resumed ? (Date.now() - a.resumed) / 1000 : 0);
  const speedTxt = (a) => {
    const t = elapsed(a); if (t < 30 || a.km < 0.05) return '–';
    if (a.type === 'bike') return nf(a.km / (t / 3600), 1) + ' km/h';
    const pace = t / 60 / a.km; const m = Math.floor(pace), s = Math.round((pace - m) * 60);
    return m + ':' + String(s === 60 ? 0 : s).padStart(2, '0') + ' /km';
  };
  function tick() {
    if (!cur || !cur.run || !S.pos) return;
    const p = S.pos, acc = p.acc || S.acc || 30;
    if (acc > 50 || Date.now() - (S.fixAt || 0) > 15000) return;
    if (lastP) {
      const d = dist(lastP, p);
      if (d >= Math.max(5, acc / 2) && d < 400) { cur.km += d / 1000; cur.pts.push([+p.lat.toFixed(5), +p.lon.toFixed(5)]); if (cur.pts.length > 3000) cur.pts = cur.pts.filter((_, i) => i % 2 === 0); lastP = p; }
      else if (d >= 400) lastP = p;
    } else { lastP = p; cur.pts.push([+p.lat.toFixed(5), +p.lon.toFixed(5)]); }
    if (p.alt != null) {
      if (lastAlt == null) lastAlt = p.alt;
      const dz = p.alt - lastAlt;
      if (dz >= 4) { cur.up += dz; lastAlt = p.alt; } else if (dz <= -4) { cur.down += -dz; lastAlt = p.alt; }
    }
    persist();
    if (S.sheetView === 'activity') render();
  }
  function start(type) {
    cur = { id: Date.now(), type, s: Date.now(), km: 0, mv: 0, up: 0, down: 0, run: true, resumed: Date.now(), pts: [] };
    lastP = null; lastAlt = null; persist(); loop(); openAct();
  }
  function pause() { if (!cur || !cur.run) return; cur.mv = elapsed(cur); cur.run = false; cur.resumed = 0; persist(); openAct(); }
  function resume() { if (!cur || cur.run) return; cur.run = true; cur.resumed = Date.now(); lastP = null; persist(); loop(); openAct(); }
  function stop() {
    if (!cur) return;
    cur.mv = elapsed(cur); cur.run = false; cur.e = Date.now();
    const a = cur; cur = null; store.set('routa.actcur', null); if (timer) { clearInterval(timer); timer = null; }
    if (a.km >= 0.05 && a.mv >= 60) { const l = load(); l.push(a); save(l); toast(esc(T('Activité enregistrée : {d}', { d: nf(a.km, 2) + ' km' }))); openDetail(a.id); }
    else { toast(esc(T('Activité trop courte : rien n\'a été enregistré.'))); openAct(); }
  }
  function loop() { if (!timer) timer = setInterval(tick, 4000); }
  if (cur && cur.run) loop();
  const typeName = (k) => T((TYPES.find((t) => t[0] === k) || TYPES[0])[1]);
  function statsGrid(a) {
    return '<div class="actgrid">' +
      [[T('Distance'), nf(a.km, 2) + ' km'], [T('Durée'), fmtDur(elapsed(a))], [a.type === 'bike' ? T('Vitesse moyenne') : T('Allure moyenne'), speedTxt(a)], [T('Dénivelé positif'), a.up ? Math.round(a.up) + ' m' : '–']]
        .map(([l, v]) => '<div class="actcell"><div class="actv">' + esc(v) + '</div><div class="sub">' + esc(l) + '</div></div>').join('') + '</div>';
  }
  let body = null;
  function render() {
    if (!body || !cur) return;
    const g = body.querySelector('#actLive'); if (g) g.innerHTML = statsGrid(cur);
  }
  function openAct() {
    const l = load().slice().reverse();
    const week = load().filter((a) => a.s > Date.now() - 7 * 86400000);
    let h = '';
    if (cur) {
      h += '<div class="card" style="display:block"><b>' + esc(typeName(cur.type)) + ' · ' + esc(cur.run ? T('en cours') : T('en pause')) + '</b><div id="actLive">' + statsGrid(cur) + '</div></div>' +
        '<div class="row">' + (cur.run ? '<button class="btn soft grow" id="actPause">' + esc(T('Pause')) + '</button>' : '<button class="btn soft grow" id="actResume">' + esc(T('Reprendre')) + '</button>') + '<button class="btn grow" id="actStop">' + esc(T('Terminer')) + '</button></div>' +
        '<p class="muted small">' + esc(T('Garde ROUTA ouvert pendant l\'activité : le suivi s\'arrête si l\'app est fermée.')) + '</p>';
    } else {
      h += '<h3>' + esc(T('Nouvelle activité')) + '</h3><div class="seg" id="actType">' + TYPES.map(([k, n], i) => '<button data-k="' + k + '"' + (i === 0 ? ' class="on"' : '') + '>' + esc(T(n)) + '</button>').join('') + '</div>' +
        '<button class="btn primary block" id="actGo">' + esc(T('Démarrer')) + '</button>';
    }
    if (week.length) {
      const km = week.reduce((s, a) => s + a.km, 0), t = week.reduce((s, a) => s + a.mv, 0), up = week.reduce((s, a) => s + (a.up || 0), 0);
      h += '<h3>' + esc(T('7 derniers jours')) + '</h3><div class="card"><div class="grow"><b>' + nf(km, 1) + ' km · ' + esc(fmtDur(t)) + '</b><div class="sub">' + esc(T('{n} activités', { n: week.length })) + (up ? ' · ' + Math.round(up) + ' m D+' : '') + '</div></div></div>';
    }
    if (l.length) h += '<h3>' + esc(T('Historique')) + '</h3>' + l.slice(0, 30).map((a) => '<button class="card tap" data-id="' + a.id + '"><span class="ico" style="background:#16A05A">' + ICO + '</span><span class="grow"><b>' + esc(typeName(a.type)) + ' · ' + nf(a.km, 2) + ' km</b><span class="sub">' + esc(new Date(a.s).toLocaleDateString(LANG(), { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + esc(fmtDur(a.mv)) + ' · ' + esc(speedTxt(a)) + '</span></span></button>').join('');
    h += '<p class="muted small">' + esc(T('Tes activités restent sur ce téléphone. Le suivi de conduite reste séparé.')) + '</p>';
    body = openSheet(T('Mes activités'), h, 'activity');
    const tb = body.querySelectorAll('#actType button'); tb.forEach((b) => { b.onclick = () => tb.forEach((x) => x.classList.toggle('on', x === b)); });
    const go = body.querySelector('#actGo'); if (go) go.onclick = () => { const on = body.querySelector('#actType button.on'); start(on ? on.dataset.k : 'walk'); };
    const pa = body.querySelector('#actPause'); if (pa) pa.onclick = pause;
    const re = body.querySelector('#actResume'); if (re) re.onclick = resume;
    const st = body.querySelector('#actStop'); if (st) st.onclick = stop;
    body.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => openDetail(+b.dataset.id); });
  }
  function traceSvg(pts) {
    if (!pts || pts.length < 2) return '';
    const la = pts.map((p) => p[0]), lo = pts.map((p) => p[1]);
    const mnA = Math.min(...la), mxA = Math.max(...la), mnO = Math.min(...lo), mxO = Math.max(...lo);
    const k = Math.cos(((mnA + mxA) / 2) * Math.PI / 180), w = (mxO - mnO) * k || 1e-6, hh = (mxA - mnA) || 1e-6, sc = 300 / Math.max(w, hh);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + (10 + (p[1] - mnO) * k * sc).toFixed(1) + ' ' + (10 + (mxA - p[0]) * sc).toFixed(1)).join('');
    return '<svg class="acttrace" viewBox="0 0 ' + Math.round(20 + w * sc) + ' ' + Math.round(20 + hh * sc) + '" preserveAspectRatio="xMidYMid meet"><path d="' + d + '"/></svg>';
  }
  function openDetail(id) {
    const a = load().find((x) => x.id === id); if (!a) { openAct(); return; }
    const b = openSheet(typeName(a.type),
      '<p class="muted">' + esc(new Date(a.s).toLocaleString(LANG(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) + '</p>' + statsGrid(a) +
      (a.down ? '<p class="muted small">' + esc(T('Dénivelé négatif')) + ' : ' + Math.round(a.down) + ' m</p>' : '') + traceSvg(a.pts) +
      '<button class="btn ghost block" id="adDel">' + esc(T('Supprimer')) + '</button><button class="btn ghost block" id="adBack">' + esc(T('Retour')) + '</button>' +
      '<p class="muted small">' + esc(T('Le dénivelé vient de l\'altitude GPS du téléphone : c\'est une estimation.')) + '</p>', 'actdetail');
    b.querySelector('#adBack').onclick = openAct;
    b.querySelector('#adDel').onclick = () => { save(load().filter((x) => x.id !== id)); openAct(); };
  }
  const tiles0 = X.tiles;
  X.tiles = () => (tiles0 ? tiles0() : []).concat([['activity', ICO, cur ? T('Activité en cours') : T('Mes activités')]]);
  const open0 = X.open;
  X.open = (k) => { if (k === 'activity') { openAct(); return true; } return open0 ? open0(k) : false; };
  X.openActivities = openAct;
})();
