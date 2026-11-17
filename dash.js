/* ROUTA – Cadran de conduite personnalisable (étiquette PRO seulement pendant les tests).
   Plein écran à la place de la carte, ou devant la carte au centre. Styles, couleurs, échelle et infos au choix.
   Vitesse GPS et forces G du téléphone : valeurs indicatives, jamais homologuées. */
(function () {
  'use strict';
  const A = window.ROUTA, X = window.ROUTA_X;
  if (!A || !X) return;
  const { S, esc, el, toast, openSheet, closeSheet, store, fmtDist } = A;
  const T = (s, v) => { let o = (A.I18N && A.I18N.t) ? A.I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
  const ICO = '<svg viewBox="0 0 24 24"><path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.4"/></svg>';
  const STYLES = [['sport', 'Sport'], ['classic', 'Classique'], ['digital', 'Numérique'], ['neon', 'Néon'], ['minimal', 'Épuré'], ['race', 'Piste']];
  const COLORS = (A.CUR_COLORS || [['#FF8A3D', 'Orange'], ['#E5484D', 'Rouge'], ['#F5C542', 'Jaune'], ['#3DDC97', 'Vert'], ['#4DA3FF', 'Bleu'], ['#FFFFFF', 'Blanc']]).map((x) => x[0]);
  const CNAME = {}; (A.CUR_COLORS || []).forEach((x) => { CNAME[x[0]] = x[1]; });
  const WIDGETS = [['g', 'Forces G'], ['max', 'Vitesse max'], ['avg', 'Vitesse moyenne'], ['trip', 'Distance'], ['chrono', 'Chrono'], ['alt', 'Altitude'], ['head', 'Cap (boussole)'], ['drive', 'Temps de conduite'], ['climb', 'Dénivelé'], ['clock', 'Heure'], ['limit', 'Limitation']];
  const CFG = Object.assign({ style: 'sport', color: '#FF8A3D', mode: 'full', scale: 'auto', w: { g: 1, max: 1, trip: 1, drive: 1, chrono: 1, limit: 1 } }, store.get('routa.dash', {}));
  if (!store.get('routa.dash', null) && A.veh && A.veh().heavy) CFG.w = { g: 0, max: 1, avg: 1, trip: 1, drive: 1, chrono: 1, clock: 1, limit: 1 }; // véhicules pros : durée de conduite, moyenne, heure
  const save = () => store.set('routa.dash', CFG);

  /* ---------- mesures ---------- */
  const M = { on: false, t0: 0, km: 0, climb: 0, alt0: null, max: 0, mv: 0, last: null, shown: 0, g: { x: 0, y: 0 }, gMax: 0, base: null, motion: false };
  function reset() { M.t0 = Date.now(); M.km = 0; M.climb = 0; M.alt0 = null; M.max = 0; M.mv = 0; M.last = null; M.gMax = 0; }
  function sample() {
    const v = S.speed != null ? S.speed * 3.6 : 0, p = S.pos;
    if (v > M.max) M.max = v;
    if (p && M.last) { const d = A.dist(M.last, p); if (d > 3 && d < 500 && v > 3) { M.km += d / 1000; M.mv += 1; } }
    if (p) M.last = p;
    if (p && p.alt != null) { if (M.alt0 == null) M.alt0 = p.alt; else if (Math.abs(p.alt - M.alt0) > 2) { if (p.alt > M.alt0) M.climb += p.alt - M.alt0; M.alt0 = p.alt; } }
  }
  function onMotion(e) {
    const a = e.acceleration && e.acceleration.x != null ? e.acceleration : null; if (!a) return;
    // axes du téléphone : x = gauche/droite, y = haut/bas de l'écran ; on suppose le téléphone tenu en portrait sur le support
    const gx = (a.x || 0) / 9.81, gy = (a.z || 0) / 9.81;
    const bx = M.base ? M.base.x : 0, by = M.base ? M.base.y : 0;
    M.g.x = M.g.x * 0.8 + (gx - bx) * 0.2; M.g.y = M.g.y * 0.8 + (gy - by) * 0.2;
    const mag = Math.hypot(M.g.x, M.g.y); if (mag > M.gMax && mag < 2) M.gMax = mag;
    M.motion = true;
  }
  async function startMotion() {
    try { if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') { const r = await DeviceMotionEvent.requestPermission(); if (r !== 'granted') return; } window.addEventListener('devicemotion', onMotion); } catch (e) { /* capteur indisponible */ }
  }

  /* ---------- dessin ---------- */
  const scaleMax = () => { if (CFG.scale !== 'auto') return +CFG.scale; const v = A.veh ? A.veh() : {}; return v.cyclo ? 60 : (v.hgv || v.type === 'bus' || v.type === 'minibus') ? 120 : v.heavy ? 140 : (v.two ? 240 : 220); };
  const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
  function arc(cx, cy, r, a, b) { const [x0, y0] = polar(cx, cy, r, a), [x1, y1] = polar(cx, cy, r, b); return 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + 'A' + r + ' ' + r + ' 0 ' + (b - a > Math.PI ? 1 : 0) + ' 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1); }
  function gaugeSvg() {
    const st = CFG.style, c = CFG.color, max = scaleMax(), step = max <= 60 ? 10 : max <= 140 ? 20 : 20;
    let ticks = '';
    if (st !== 'digital' && st !== 'minimal') {
      for (let v = 0; v <= max; v += step / 2) {
        const a = A0 + (A1 - A0) * v / max, big = v % step === 0;
        const [x0, y0] = polar(150, 150, big ? 112 : 118, a), [x1, y1] = polar(150, 150, 128, a);
        ticks += '<line x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) + '" x2="' + x1.toFixed(1) + '" y2="' + y1.toFixed(1) + '" class="dk-tick' + (big ? ' big' : '') + '"/>';
        if (big && (st === 'classic' || st === 'race' || st === 'sport')) { const [tx, ty] = polar(150, 150, 96, a); ticks += '<text x="' + tx.toFixed(1) + '" y="' + (ty + 5).toFixed(1) + '" class="dk-num">' + v + '</text>'; }
      }
    }
    const track = st === 'digital' || st === 'minimal' ? '' : '<path d="' + arc(150, 150, 128, A0, A1) + '" class="dk-track"/>';
    const fill = st === 'classic' || st === 'minimal' ? '' : '<path id="dkFill" d="" class="dk-fill" style="stroke:' + c + '"/>';
    const needle = st === 'classic' || st === 'race' ? '<g id="dkNeedle"><line x1="150" y1="150" x2="150" y2="40" class="dk-needle" style="stroke:' + c + '"/><circle cx="150" cy="150" r="9" class="dk-hub" style="fill:' + c + '"/></g>' : '';
    const digitsY = st === 'classic' || st === 'race' ? 222 : 168, size = st === 'digital' ? 96 : st === 'minimal' ? 110 : st === 'classic' || st === 'race' ? 40 : 78;
    const glow = st === 'neon' ? '<defs><filter id="dkGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' : '';
    const bar = st === 'digital' ? '<rect x="40" y="200" width="220" height="12" rx="6" class="dk-trackbar"/><rect id="dkBar" x="40" y="200" width="0" height="12" rx="6" style="fill:' + c + '"/>' : '';
    return '<svg viewBox="0 0 300 260" class="dk-svg dk-' + st + '"' + (st === 'neon' ? ' style="--dkc:' + c + '"' : '') + '>' + glow + track + ticks + fill + bar + needle +
      '<text id="dkSpeed" x="150" y="' + digitsY + '" class="dk-speed" style="font-size:' + size + 'px' + (st === 'neon' ? ';fill:' + c + ';filter:url(#dkGlow)' : '') + '">0</text>' +
      '<text x="150" y="' + (digitsY + (st === 'classic' || st === 'race' ? 22 : 30)) + '" class="dk-unit">km/h</text></svg>';
  }

  /* ---------- chrono : démarrer / pause, tours, remise à zéro (mémorisé, même si on ferme le cadran) ---------- */
  const CH = Object.assign({ run: false, t0: 0, acc: 0, laps: [] }, store.get('routa.chrono', {}));
  const chSave = () => store.set('routa.chrono', CH);
  const chMs = () => CH.acc + (CH.run ? Date.now() - CH.t0 : 0);
  const fmtT = (ms) => { ms = Math.max(0, Math.round(ms)); const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000) % 60, h = Math.floor(ms / 3600000); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0'); };
  const fmtD = (ms) => (ms < 0 ? '−' : '+') + (Math.abs(ms) / 1000).toFixed(2).replace('.', ',');
  const chBest = () => CH.laps.length ? Math.min.apply(null, CH.laps.map((l) => l.t)) : null;
  function chronoHtml() {
    return '<div class="dk-w dk-ch" data-w="chrono"><div class="dk-chhead"><span class="dk-wl">' + esc(T('Chrono')) + '</span><span class="dk-chlap" id="dkChLap"></span></div>' +
      '<div class="dk-chtime" id="dkChTime">0:00.00</div><div class="dk-chsub" id="dkChSub"></div>' +
      '<div class="dk-chbtns"><button class="dk-cb" id="dkChReset">' + esc(T('Zéro')) + '</button><button class="dk-cb" id="dkChLapBtn">' + esc(T('Tour')) + '</button><button class="dk-cb go" id="dkChGo">' + esc(T('Démarrer')) + '</button></div>' +
      '<div class="dk-chlaps" id="dkChLaps"></div></div>';
  }
  function chLapsHtml() {
    const best = chBest();
    return CH.laps.map((l, i) => '<div class="dk-lap' + (l.t === best && CH.laps.length > 1 ? ' best' : '') + '"><span>' + esc(T('Tour')) + ' ' + (CH.laps.length - i) + '</span><b>' + fmtT(l.t) + '</b><em>' + (CH.laps.length > 1 && l.t !== best ? fmtD(l.t - best) : (CH.laps.length > 1 ? esc(T('Meilleur')) : '')) + '</em></div>').join('');
  }
  function chronoSync() {
    const q = (id) => document.getElementById(id); if (!q('dkChGo')) return;
    const ms = chMs();
    q('dkChTime').textContent = fmtT(ms);
    const lastEnd = CH.laps.length ? CH.laps[0].at : 0;
    q('dkChLap').textContent = ms > 0 ? T('Tour') + ' ' + (CH.laps.length + 1) + ' · ' + fmtT(ms - lastEnd) : '';
    q('dkChSub').textContent = CH.laps.length ? T('Dernier') + ' ' + fmtT(CH.laps[0].t) + ' · ' + T('Meilleur') + ' ' + fmtT(chBest()) : '';
    q('dkChGo').textContent = CH.run ? T('Pause') : (ms > 0 ? T('Reprendre') : T('Démarrer'));
    q('dkChGo').classList.toggle('on', CH.run);
    q('dkChReset').disabled = CH.run || ms === 0;
    q('dkChLapBtn').disabled = !CH.run;
  }
  function chronoBind(d) {
    const q = (id) => d.querySelector('#' + id); if (!q('dkChGo')) return;
    const vib = (n) => { try { A.vibrate && A.vibrate(n); } catch (e) { /* */ } };
    q('dkChGo').onclick = () => { if (CH.run) { CH.acc += Date.now() - CH.t0; CH.run = false; } else { CH.t0 = Date.now(); CH.run = true; } vib(20); chSave(); chronoSync(); };
    q('dkChLapBtn').onclick = () => { if (!CH.run) return; const ms = chMs(), lastEnd = CH.laps.length ? CH.laps[0].at : 0; CH.laps.unshift({ t: ms - lastEnd, at: ms }); if (CH.laps.length > 200) CH.laps.pop(); vib(30); chSave(); q('dkChLaps').innerHTML = chLapsHtml(); chronoSync(); };
    q('dkChReset').onclick = () => { if (CH.run) return; CH.acc = 0; CH.t0 = 0; CH.laps = []; vib(20); chSave(); q('dkChLaps').innerHTML = ''; chronoSync(); };
    q('dkChLaps').innerHTML = chLapsHtml(); chronoSync();
  }
  const fmtHM = (sec) => { sec = Math.floor(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60; return h ? h + ' h ' + String(m).padStart(2, '0') : m + ' min'; };
  const W = (k, label, id) => '<div class="dk-w" data-w="' + k + '"><div class="dk-wv" id="' + id + '">–</div><div class="dk-wl">' + esc(T(label)) + '</div></div>';
  function render() {
    let d = document.getElementById('dashOv');
    if (!d) { d = el('<div id="dashOv" class="dashov" hidden></div>'); document.body.appendChild(d); }
    const w = CFG.w || {};
    d.className = 'dashov dm-full ds-' + CFG.style;
    d.style.setProperty('--dkc', CFG.color); if (CFG.numc) d.style.setProperty('--dkn', CFG.numc); else d.style.removeProperty('--dkn');
    const gcard = w.g ? '<div class="dk-w dk-gw" data-w="g"><svg viewBox="0 0 80 80" class="dk-gsvg"><circle cx="40" cy="40" r="36" class="dk-gring"/><circle cx="40" cy="40" r="18" class="dk-gring"/><line x1="4" y1="40" x2="76" y2="40" class="dk-gring"/><line x1="40" y1="4" x2="40" y2="76" class="dk-gring"/><circle id="dkGdot" cx="40" cy="40" r="6" style="fill:var(--dkc)"/></svg><div class="dk-wv" id="dkG">–</div><div class="dk-wl" id="dkGm">' + esc(T('Forces G')) + '</div></div>' : '';
    d.innerHTML = '<div class="dk-top"><button class="dk-btn" id="dkShare" aria-label="' + esc(T('Partager en story')) + '">' + '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/></svg>' + '</button><button class="dk-btn" id="dkSet" aria-label="' + esc(T('Personnaliser le cadran')) + '">' + A.ic('gear') + '</button><button class="dk-btn" id="dkClose" aria-label="' + esc(T('Fermer')) + '"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="dk-main">' + gaugeSvg() + (w.limit ? '<div class="dk-limit" id="dkLimit" hidden></div>' : '') + '</div>' +
      '<div class="dk-ws">' + gcard +
      (w.max ? W('max', 'Vitesse max', 'dkMax') : '') + (w.avg ? W('avg', 'Vitesse moyenne', 'dkAvg') : '') + (w.trip ? W('trip', 'Distance', 'dkTrip') : '') + (w.drive ? W('drive', 'Temps de conduite', 'dkDrive') : '') +
      (w.alt ? W('alt', 'Altitude', 'dkAlt') : '') + (w.climb ? W('climb', 'Dénivelé', 'dkClimb') : '') + (w.head ? W('head', 'Cap (boussole)', 'dkHead') : '') + (w.clock ? W('clock', 'Heure', 'dkClock') : '') +
      (w.chrono ? chronoHtml() : '') + '</div>';
    d.querySelector('#dkClose').onclick = hide;
    chronoBind(d);
    d.querySelector('#dkSet').onclick = openDashSettings;
    d.querySelector('#dkShare').onclick = openStory;
    return d;
  }
  /* La page garde en haut le bandeau de guidage et en bas la barre de trajet : le cadran occupe le reste */
  function layout() {
    const d = document.getElementById('dashOv'); if (!d || d.hidden) return;
    const W = window.innerWidth, H = window.innerHeight, cx = W / 2;
    let top = 0, bot = H, left = 0;
    const nb = document.getElementById('navBanner'); if (nb && !nb.hidden && nb.offsetHeight) { const r = nb.getBoundingClientRect(); if (r.left < cx && r.right > cx) top = Math.max(top, r.bottom); else if (r.right < cx + 40 && r.bottom > H * 0.5) left = Math.max(left, r.right); }
    const bar = document.getElementById('navBar'); if (bar && !bar.hidden && bar.offsetHeight) { const r = bar.getBoundingClientRect(); if (r.left < cx && r.right > cx) bot = Math.min(bot, r.top); else if (r.right < cx + 40) left = Math.max(left, r.right); }
    d.style.setProperty('--dkT', Math.round(top) + 'px'); d.style.setProperty('--dkB', Math.round(H - bot) + 'px'); d.style.setProperty('--dkL', Math.round(left) + 'px'); d.style.setProperty('--dkH', Math.round(bot - top) + 'px'); d.style.setProperty('--dkW', Math.round(W - left) + 'px');
  }
  window.addEventListener('resize', layout);
  setInterval(layout, 1000);
  let raf = 0, tick = 0;
  function frame() {
    const d = document.getElementById('dashOv'); if (!d || d.hidden) { raf = 0; return; }
    const kmh = S.speed != null && S.speed * 3.6 >= 3 ? S.speed * 3.6 : 0;
    M.shown += (kmh - M.shown) * 0.18;
    const max = scaleMax(), f = Math.max(0, Math.min(1, M.shown / max)), a = A0 + (A1 - A0) * f;
    const sp = document.getElementById('dkSpeed'); if (sp) sp.textContent = Math.round(kmh);
    const fl = document.getElementById('dkFill'); if (fl) fl.setAttribute('d', f > 0.003 ? arc(150, 150, 128, A0, a) : '');
    const nd = document.getElementById('dkNeedle'); if (nd) nd.setAttribute('transform', 'rotate(' + ((a - Math.PI * 1.5) * 180 / Math.PI).toFixed(2) + ' 150 150)');
    const br = document.getElementById('dkBar'); if (br) br.setAttribute('width', (220 * f).toFixed(1));
    if (tick % 2 === 0 && CH.run) chronoSync();
    if (++tick % 6 === 0) {
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      const lim = A.capLimit ? A.capLimit(S.limit) : S.limit;
      const le = document.getElementById('dkLimit'); if (le) { const ov = !!lim && kmh > lim + 3; le.hidden = !(lim && (S.settings.showLimit || (ov && S.settings.overSign !== false))); if (lim) { le.textContent = lim; le.classList.toggle('over', kmh > lim + 3); } }
      d.classList.toggle('isover', !!lim && kmh > lim + 3);
      set('dkMax', Math.round(M.max) + ' km/h');
      const hrs = M.mv / 3600; set('dkAvg', hrs > 0.005 ? Math.round(M.km / hrs) + ' km/h' : '–');
      set('dkTrip', M.km < 10 ? M.km.toFixed(2).replace('.', ',') + ' km' : Math.round(M.km) + ' km');
      set('dkAlt', S.pos && S.pos.alt != null ? Math.round(S.pos.alt) + ' m' : '–');
      const h = S.heading; set('dkHead', h != null ? ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(h / 45) % 8] + ' · ' + Math.round(h) + '°' : '–');
      set('dkClock', new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }));
      const gm = Math.hypot(M.g.x, M.g.y); set('dkG', M.motion ? gm.toFixed(2).replace('.', ',') + ' g' : '–'); set('dkGm', M.motion ? T('Forces G') + ' · max ' + M.gMax.toFixed(2).replace('.', ',') : T('Forces G'));
      set('dkDrive', fmtHM(M.mv)); set('dkClimb', '+' + Math.round(M.climb) + ' m');
      const gd = document.getElementById('dkGdot'); if (gd) { gd.setAttribute('cx', (40 + Math.max(-1, Math.min(1, M.g.x)) * 34).toFixed(1)); gd.setAttribute('cy', (40 - Math.max(-1, Math.min(1, M.g.y)) * 34).toFixed(1)); }
    }
    raf = requestAnimationFrame(frame);
  }
  let sampler = 0;
  function show() {
    const d = render(); d.hidden = false; document.body.classList.add('dashon'); layout();
    if (!M.t0) reset();
    if (CFG.w && CFG.w.g) startMotion();
    if (!sampler) sampler = setInterval(sample, 1000);
    if (!raf) raf = requestAnimationFrame(frame);
    store.set('routa.dashOn', true);
  }
  function hide() { const d = document.getElementById('dashOv'); if (d) d.hidden = true; document.body.classList.remove('dashon'); store.set('routa.dashOn', false); }


  /* ---------- story 1080 × 1920 : la session en un coup d'œil, à partager ou à enregistrer dans les photos ---------- */
  const SK = [['avg', 'Vitesse moyenne', 1], ['trip', 'Distance', 1], ['drive', 'Temps de conduite', 1], ['climb', 'Dénivelé', 0], ['chrono', 'Chrono', 1], ['best', 'Meilleur tour', 1]];
  const SC = Object.assign({ style: 'dark' }, ...SK.map(([k, , on]) => ({ [k]: !!on })), store.get('routa.dashstory', {}));
  const SPAL = {
    dark: { bg: '#0E1116', glow: 'rgba(255,138,61,.30)', ink: '#F4F6FA', muted: '#9AA3AF', card: '#171B22', line: 'rgba(255,255,255,.07)', track: 'rgba(255,255,255,.09)' },
    light: { bg: '#F5F6F8', glow: 'rgba(255,138,61,.20)', ink: '#0E1116', muted: '#5B6472', card: '#FFFFFF', line: 'rgba(14,17,22,.08)', track: 'rgba(14,17,22,.09)' },
    orange: { bg: '#FF9A4A', bg2: '#FF5F1F', glow: 'rgba(255,224,150,.5)', ink: '#1A1205', muted: 'rgba(26,18,5,.62)', card: 'rgba(255,255,255,.24)', line: 'rgba(255,255,255,.32)', track: 'rgba(26,18,5,.16)', fill: '#1A1205' }
  };
  const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const dlang = () => (A.I18N && A.I18N.speech) || 'fr-FR';
  const storyStats = () => {
    const hrs = M.mv / 3600, ms = chMs(), best = chBest();
    const all = { avg: [T('Vitesse moyenne'), hrs > 0.005 ? Math.round(M.km / hrs) + ' km/h' : null], trip: [T('Distance'), M.km >= 0.05 ? (M.km < 10 ? M.km.toFixed(1).replace('.', ',') : String(Math.round(M.km))) + ' km' : null],
      drive: [T('Temps de conduite'), M.mv >= 60 ? fmtHM(M.mv) : null], climb: [T('Dénivelé'), M.climb >= 5 ? '+' + Math.round(M.climb) + ' m' : null],
      chrono: [T('Chrono'), ms > 0 ? fmtT(ms) : null], best: [T('Meilleur tour'), best != null && CH.laps.length > 1 ? fmtT(best) : null] };
    return SK.filter(([k]) => SC[k] && all[k][1]).map(([k]) => all[k]);
  };
  async function drawStory() {
    const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), K = SPAL[SC.style] || SPAL.dark, acc = K.fill || CFG.color;
    if (K.bg2) { const lg = c.createLinearGradient(0, 0, W, H); lg.addColorStop(0, K.bg); lg.addColorStop(1, K.bg2); c.fillStyle = lg; } else c.fillStyle = K.bg;
    c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W * 0.5, 640, 40, W * 0.5, 640, 880); g.addColorStop(0, K.glow); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const st = storyStats(), rows = Math.ceil(st.length / 2), gap = 26, top = 1110, ch = Math.min(180, rows ? (1690 - top - gap * (rows - 1)) / rows : 180);
    const shift = Math.max(0, Math.min(170, Math.round((1700 - (top + rows * ch + Math.max(0, rows - 1) * gap)) / 2 - 40)));
    c.save(); c.translate(0, shift);
    const d = new Date();
    c.fillStyle = acc; c.font = '800 36px ' + FONT; c.fillText((T('Ma session')).toUpperCase().split('').join(' '), W / 2, 210);
    c.fillStyle = K.muted; c.font = '600 40px ' + FONT; c.fillText(d.toLocaleDateString(dlang(), { day: 'numeric', month: 'long' }) + ' · ' + d.toLocaleTimeString(dlang(), { hour: '2-digit', minute: '2-digit' }), W / 2, 280);
    // cadran : arc de 270° rempli jusqu'à la vitesse max
    const cx = W / 2, cy = 700, R = 340, max = Math.max(scaleMax(), Math.ceil(M.max / 20) * 20), f = Math.max(0, Math.min(1, M.max / max));
    c.lineCap = 'round'; c.lineWidth = 46; c.strokeStyle = K.track; c.beginPath(); c.arc(cx, cy, R, A0, A1); c.stroke();
    if (f > 0.004) { c.strokeStyle = acc; c.beginPath(); c.arc(cx, cy, R, A0, A0 + (A1 - A0) * f); c.stroke(); }
    c.fillStyle = K.ink; c.font = '800 300px ' + FONT; c.fillText(String(Math.round(M.max)), cx, cy + 105);
    c.fillStyle = K.muted; c.font = '700 44px ' + FONT; c.fillText('km/h', cx, cy + 180);
    c.fillStyle = acc; c.font = '800 34px ' + FONT; c.fillText(T('Vitesse max').toUpperCase().split('').join(' '), cx, cy - 215);
    // cartes : jamais de case vide (la dernière prend toute la largeur si le nombre est impair)
    st.forEach(([lab, val], i) => {
      const r = Math.floor(i / 2), last = i === st.length - 1 && st.length % 2 === 1, w = last ? 900 : 437, x = last ? 90 : 90 + (i % 2) * (437 + 26), y = top + r * (ch + gap);
      c.fillStyle = K.card; rr(c, x, y, w, ch, 36); c.fill(); c.strokeStyle = K.line; c.lineWidth = 2; rr(c, x, y, w, ch, 36); c.stroke();
      c.fillStyle = K.ink; c.font = '800 ' + Math.round(ch * 0.34) + 'px ' + FONT; let fs = Math.round(ch * 0.34); while (c.measureText(val).width > w - 50 && fs > 24) { fs -= 2; c.font = '800 ' + fs + 'px ' + FONT; }
      c.fillText(val, x + w / 2, y + ch * 0.55); c.fillStyle = K.muted; c.font = '600 ' + Math.round(ch * 0.19) + 'px ' + FONT; c.fillText(lab, x + w / 2, y + ch * 0.82);
    });
    c.restore();
    // logo au centre, en bas
    const logo = await loadImg('icons/icon-512.png');
    if (logo) { c.save(); c.globalAlpha = 0.96; rr(c, W / 2 - 44, 1740, 88, 88, 24); c.clip(); c.drawImage(logo, W / 2 - 44, 1740, 88, 88); c.restore(); }
    c.fillStyle = K.muted; c.font = '800 28px ' + FONT; c.fillText('R O U T A', W / 2, 1876);
    return cv;
  }
  async function openStory() {
    let blob = null, url = '', ver = 0;
    const opts = SK.filter(([k]) => !(k === 'best' && CH.laps.length < 2) && !(k === 'chrono' && chMs() <= 0));
    const body = openSheet(T('Ma story'),
      '<div style="text-align:center"><img id="dsImg" alt="" style="max-width:100%;max-height:46vh;aspect-ratio:9/16;border-radius:18px;background:#0E1116;display:inline-block"></div>' +
      '<div class="seg" id="dsStyle" style="margin-top:12px">' + [['dark', 'Sombre'], ['orange', 'Orange'], ['light', 'Clair']].map(([k, l]) => '<button data-st="' + k + '" class="' + (SC.style === k ? 'on' : '') + '">' + esc(T(l)) + '</button>').join('') + '</div>' +
      '<p class="muted small" style="margin:10px 0 6px">' + esc(T('Touche les éléments pour les afficher ou les cacher.')) + '</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' + opts.map(([k, l]) => '<button class="btn small soft" data-k="' + k + '" style="min-height:40px">' + esc(T(l)) + '</button>').join('') + '</div>' +
      '<button class="btn primary block" id="dsShare" style="margin-top:14px">' + esc(T('Partager')) + '</button>' +
      '<button class="btn soft block" id="dsSave">' + esc(T('Enregistrer dans les photos')) + '</button>' +
      '<button class="btn ghost block" id="dsBack">' + esc(T('Retour')) + '</button>', 'dashstory');
    const img = body.querySelector('#dsImg');
    const paint = (b) => { const on = SC[b.dataset.k]; b.setAttribute('aria-pressed', String(!!on)); b.style.background = on ? 'var(--accent)' : ''; b.style.color = on ? '#1A1205' : ''; b.style.borderColor = on ? 'var(--accent)' : ''; };
    const render = async () => { const v = ++ver; const cv = await drawStory(); if (v !== ver) return; url = cv.toDataURL('image/png'); img.src = url; cv.toBlob((b) => { if (v === ver) blob = b; }, 'image/png'); };
    body.querySelectorAll('[data-k]').forEach((b) => { paint(b); b.onclick = () => { SC[b.dataset.k] = !SC[b.dataset.k]; store.set('routa.dashstory', SC); paint(b); render(); }; });
    body.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { SC.style = b.dataset.st; store.set('routa.dashstory', SC); body.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b)); render(); }; });
    body.querySelector('#dsBack').onclick = closeSheet;
    body.querySelector('#dsShare').onclick = async () => {
      const file = blob && new File([blob], 'routa-story.png', { type: 'image/png' });
      try { if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'ROUTA' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      toast(esc(T('Appuie longuement sur l\'image pour l\'enregistrer, puis ajoute-la à ta story Instagram.')));
    };
    body.querySelector('#dsSave').onclick = async () => {
      let b = blob; if (!b && url) { try { b = await (await fetch(url)).blob(); } catch (e) { /* */ } }
      if (!b) return;
      const name = 'routa-cadran-' + new Date().toISOString().slice(0, 10) + '.png';
      const C = window.Capacitor, native = !!(C && C.isNativePlatform && C.isNativePlatform());
      if (native) {
        try { if (C.Plugins && C.Plugins.RoutaMap) { await C.Plugins.RoutaMap.saveImage({ data: url.split(',')[1], name }); toast(esc(T('Image enregistrée dans tes photos.'))); return; } } catch (e) { /* ancienne version de l'app */ }
        const file = new File([b], name, { type: 'image/png' });
        try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
        const P = C.Plugins || {};
        if (P.Filesystem && P.Share) { try { const w = await P.Filesystem.writeFile({ path: name, data: url.split(',')[1], directory: 'CACHE' }); await P.Share.share({ title: 'ROUTA', files: [w.uri] }); return; } catch (e) { if (e && /cancel/i.test(e.message || '')) return; } }
        toast(esc(T('Appuie longuement sur l\'image pour l\'enregistrer, puis ajoute-la à ta story Instagram.')));
        return;
      }
      const u = URL.createObjectURL(b), a2 = document.createElement('a'); a2.href = u; a2.download = name; a2.rel = 'noopener'; document.body.appendChild(a2); a2.click(); a2.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    };
    await render();
  }

  /* ---------- personnalisation ---------- */
  function openDashSettings() {
    const prev = (st) => { const c0 = CFG.style; CFG.style = st; const s = gaugeSvg(); CFG.style = c0; return s; };
    const body = openSheet(T('Cadran de conduite'),
      '<div class="dk-preview ds-' + CFG.style + '" style="--dkc:' + CFG.color + '">' + gaugeSvg() + '</div>' +
      '<h3>' + esc(T('Style')) + '</h3><div class="dk-styles">' + STYLES.map(([k, n]) => '<button class="dk-sty' + (CFG.style === k ? ' on' : '') + '" data-st="' + k + '"><span class="ds-' + k + '" style="--dkc:' + CFG.color + '">' + prev(k) + '</span><b>' + esc(T(n)) + '</b></button>').join('') + '</div>' +
      '<h3>' + esc(T('Couleur')) + '</h3><div class="dk-cols">' + COLORS.map((c) => '<button class="dk-col' + (CFG.color === c ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '" aria-label="' + esc(T(CNAME[c] || c)) + '"></button>').join('') + '</div>' +
      '<h3>' + esc(T('Couleur des chiffres')) + '</h3><div class="dk-cols" id="dkNums"><button class="dk-col auto' + (!CFG.numc ? ' on' : '') + '" data-n="" aria-label="' + esc(T('Auto')) + '">' + esc(T('Auto')) + '</button>' + COLORS.map((c) => '<button class="dk-col' + (CFG.numc === c ? ' on' : '') + '" data-n="' + c + '" style="background:' + c + '" aria-label="' + esc(T(CNAME[c] || c)) + '"></button>').join('') + '</div>' +
      '<h3>' + esc(T('Échelle')) + '</h3><div class="seg" id="dkScale">' + [['auto', 'Auto'], ['60', '60'], ['140', '140'], ['220', '220'], ['300', '300']].map(([k, n]) => '<button data-s="' + k + '"' + (String(CFG.scale) === k ? ' class="on"' : '') + '>' + esc(k === 'auto' ? T('Auto') : n) + '</button>').join('') + '</div>' +
      '<h3>' + esc(T('Infos affichées')) + '</h3>' + WIDGETS.map(([k, n]) => '<label class="switch" for="dkw_' + k + '"><span>' + esc(T(n)) + '</span><input id="dkw_' + k + '" type="checkbox"' + ((CFG.w || {})[k] ? ' checked' : '') + '></label>').join('') +
      '<p class="muted small">' + esc(T('Valeurs indicatives (GPS et capteurs du téléphone). Le compteur du véhicule fait foi.')) + '</p>' +
      '<p class="muted small">' + esc(T('Forces G : téléphone fixé sur un support, écran face à toi. Touche ↺ à l\'arrêt pour calibrer.')) + '</p>' +
      '<button class="btn soft block" id="dkRst">' + esc(T('Remettre les compteurs à zéro')) + '</button>' +
      '<button class="btn primary block" id="dkShow">' + esc(T('Afficher le cadran')) + '</button>', 'dashset');
    document.getElementById('sheetTitle').innerHTML = esc(T('Cadran de conduite')) + ' <span class="prem">PRO</span>';
    const re = () => { save(); const pv = body.querySelector('.dk-preview'); pv.className = 'dk-preview ds-' + CFG.style; pv.style.setProperty('--dkc', CFG.color); pv.innerHTML = gaugeSvg(); const d = document.getElementById('dashOv'); if (d && !d.hidden) { render(); d.hidden = false; } };
    body.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { CFG.style = b.dataset.st; body.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b)); re(); }; });
    body.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { CFG.color = b.dataset.c; body.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); body.querySelectorAll('.dk-sty > span').forEach((s) => s.style.setProperty('--dkc', CFG.color)); re(); }; });
    body.querySelectorAll('#dkScale button').forEach((b) => { b.onclick = () => { CFG.scale = b.dataset.s; body.querySelectorAll('#dkScale button').forEach((x) => x.classList.toggle('on', x === b)); re(); }; });
    WIDGETS.forEach(([k]) => { const c = body.querySelector('#dkw_' + k); c.onchange = () => { CFG.w = CFG.w || {}; CFG.w[k] = c.checked ? 1 : 0; re(); }; });
    body.querySelectorAll('#dkNums [data-n]').forEach((b) => { b.onclick = () => { CFG.numc = b.dataset.n; body.querySelectorAll('#dkNums [data-n]').forEach((x) => x.classList.toggle('on', x === b)); re(); }; });
    body.querySelector('#dkRst').onclick = () => { reset(); M.base = M.motion ? { x: M.g.x + (M.base ? M.base.x : 0), y: M.g.y + (M.base ? M.base.y : 0) } : null; toast(esc(T('Compteurs remis à zéro.'))); };
    body.querySelector('#dkShow').onclick = () => { closeSheet(); show(); };
  }

  /* ---------- branchement ---------- */
  const tiles0 = X.tiles;
  X.tiles = () => (tiles0 ? tiles0() : []).concat([['dash', ICO, T('Cadran de conduite')]]);
  const open0 = X.open;
  X.open = (k) => { if (k === 'dash') { openDashSettings(); return true; } return open0 ? open0(k) : false; };
  X.dashShow = show; X.dashHide = hide; X.openDash = openDashSettings;
  // toucher le compteur de vitesse ouvre le cadran
  const sb = document.getElementById('speedBox'); if (sb) { sb.style.cursor = 'pointer'; sb.addEventListener('click', () => show()); }
  if (store.get('routa.dashOn', false)) setTimeout(show, 1500);
})();
