/* ROUTA – Cadran de conduite personnalisable (Premium, étiquette seulement pendant les tests).
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
  const COLORS = ['#FF8A3D', '#E5484D', '#F5C542', '#3DDC84', '#4DA3FF', '#7C5CFF', '#FF5FA2', '#FFFFFF'];
  const WIDGETS = [['g', 'Forces G'], ['max', 'Vitesse max'], ['avg', 'Vitesse moyenne'], ['trip', 'Distance'], ['chrono', 'Chrono'], ['alt', 'Altitude'], ['head', 'Cap (boussole)'], ['clock', 'Heure'], ['limit', 'Limitation']];
  const CFG = Object.assign({ style: 'sport', color: '#FF8A3D', mode: 'full', scale: 'auto', w: { g: 1, max: 1, trip: 1, chrono: 1, limit: 1 } }, store.get('routa.dash', {}));
  const save = () => store.set('routa.dash', CFG);

  /* ---------- mesures ---------- */
  const M = { on: false, t0: 0, km: 0, max: 0, mv: 0, last: null, shown: 0, g: { x: 0, y: 0 }, gMax: 0, base: null, motion: false };
  function reset() { M.t0 = Date.now(); M.km = 0; M.max = 0; M.mv = 0; M.last = null; M.gMax = 0; }
  function sample() {
    const v = S.speed != null ? S.speed * 3.6 : 0, p = S.pos;
    if (v > M.max) M.max = v;
    if (p && M.last) { const d = A.dist(M.last, p); if (d > 3 && d < 500 && v > 3) { M.km += d / 1000; M.mv += 1; } }
    if (p) M.last = p;
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
  const scaleMax = () => { if (CFG.scale !== 'auto') return +CFG.scale; const v = A.veh ? A.veh() : {}; return v.cyclo ? 60 : v.heavy ? 140 : (v.two ? 240 : 220); };
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
  const W = (k, label, id) => '<div class="dk-w" data-w="' + k + '"><div class="dk-wv" id="' + id + '">–</div><div class="dk-wl">' + esc(T(label)) + '</div></div>';
  function render() {
    let d = document.getElementById('dashOv');
    if (!d) { d = el('<div id="dashOv" class="dashov" hidden></div>'); document.body.appendChild(d); }
    const w = CFG.w || {};
    d.className = 'dashov dm-full ds-' + CFG.style;
    d.style.setProperty('--dkc', CFG.color);
    d.innerHTML = '<div class="dk-top"><button class="dk-btn" id="dkSet" aria-label="' + esc(T('Personnaliser le cadran')) + '"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg></button><button class="dk-btn" id="dkClose" aria-label="' + esc(T('Fermer')) + '"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="dk-main">' + gaugeSvg() + (w.limit ? '<div class="dk-limit" id="dkLimit" hidden></div>' : '') + '</div>' +
      '<div class="dk-ws">' + (w.g ? '<div class="dk-w dk-gw" data-w="g"><svg viewBox="0 0 80 80" class="dk-gsvg"><circle cx="40" cy="40" r="36" class="dk-gring"/><circle cx="40" cy="40" r="18" class="dk-gring"/><line x1="4" y1="40" x2="76" y2="40" class="dk-gring"/><line x1="40" y1="4" x2="40" y2="76" class="dk-gring"/><circle id="dkGdot" cx="40" cy="40" r="6" style="fill:' + CFG.color + '"/></svg><div class="dk-wv" id="dkG">0,00 g</div><div class="dk-wl">' + esc(T('Forces G')) + '</div></div>' : '') +
      (w.max ? W('max', 'Vitesse max', 'dkMax') : '') + (w.avg ? W('avg', 'Vitesse moyenne', 'dkAvg') : '') + (w.trip ? W('trip', 'Distance', 'dkTrip') : '') + (w.chrono ? W('chrono', 'Chrono', 'dkChrono') : '') +
      (w.alt ? W('alt', 'Altitude', 'dkAlt') : '') + (w.head ? W('head', 'Cap (boussole)', 'dkHead') : '') + (w.clock ? W('clock', 'Heure', 'dkClock') : '') + '</div>' +
      '<p class="dk-note">' + esc(T('Valeurs indicatives (GPS et capteurs du téléphone). Le compteur du véhicule fait foi.')) + '</p>';
    d.querySelector('#dkClose').onclick = hide;
    d.querySelector('#dkSet').onclick = openDashSettings;
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
    if (++tick % 6 === 0) {
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      const lim = A.capLimit ? A.capLimit(S.limit) : S.limit;
      const le = document.getElementById('dkLimit'); if (le) { const ov = !!lim && kmh > lim + 3; le.hidden = !(lim && (S.settings.showLimit || (ov && S.settings.overSign !== false))); if (lim) { le.textContent = lim; le.classList.toggle('over', kmh > lim + 3); } }
      d.classList.toggle('isover', !!lim && kmh > lim + 3);
      set('dkMax', Math.round(M.max) + ' km/h');
      const hrs = M.mv / 3600; set('dkAvg', hrs > 0.005 ? Math.round(M.km / hrs) + ' km/h' : '–');
      set('dkTrip', M.km < 10 ? M.km.toFixed(2).replace('.', ',') + ' km' : Math.round(M.km) + ' km');
      const s = Math.floor((Date.now() - M.t0) / 1000); set('dkChrono', Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'));
      set('dkAlt', S.pos && S.pos.alt != null ? Math.round(S.pos.alt) + ' m' : '–');
      const h = S.heading; set('dkHead', h != null ? ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(h / 45) % 8] + ' · ' + Math.round(h) + '°' : '–');
      set('dkClock', new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }));
      const gm = Math.hypot(M.g.x, M.g.y); set('dkG', M.motion ? gm.toFixed(2).replace('.', ',') + ' g · max ' + M.gMax.toFixed(2).replace('.', ',') : T('Capteur indisponible'));
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

  /* ---------- personnalisation ---------- */
  function openDashSettings() {
    const prev = (st) => { const c0 = CFG.style; CFG.style = st; const s = gaugeSvg(); CFG.style = c0; return s; };
    const body = openSheet(T('Cadran de conduite'),
      '<div class="dk-preview ds-' + CFG.style + '" style="--dkc:' + CFG.color + '">' + gaugeSvg() + '</div>' +
      '<h3>' + esc(T('Style')) + '</h3><div class="dk-styles">' + STYLES.map(([k, n]) => '<button class="dk-sty' + (CFG.style === k ? ' on' : '') + '" data-st="' + k + '"><span class="ds-' + k + '" style="--dkc:' + CFG.color + '">' + prev(k) + '</span><b>' + esc(T(n)) + '</b></button>').join('') + '</div>' +
      '<h3>' + esc(T('Couleur')) + '</h3><div class="dk-cols">' + COLORS.map((c) => '<button class="dk-col' + (CFG.color === c ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('') + '</div>' +
      '<h3>' + esc(T('Échelle')) + '</h3><div class="seg" id="dkScale">' + [['auto', 'Auto'], ['60', '60'], ['140', '140'], ['220', '220'], ['300', '300']].map(([k, n]) => '<button data-s="' + k + '"' + (String(CFG.scale) === k ? ' class="on"' : '') + '>' + esc(k === 'auto' ? T('Auto') : n) + '</button>').join('') + '</div>' +
      '<h3>' + esc(T('Infos affichées')) + '</h3>' + WIDGETS.map(([k, n]) => '<label class="switch" for="dkw_' + k + '"><span>' + esc(T(n)) + '</span><input id="dkw_' + k + '" type="checkbox"' + ((CFG.w || {})[k] ? ' checked' : '') + '></label>').join('') +
      '<p class="muted small">' + esc(T('Forces G : téléphone fixé sur un support, écran face à toi. Touche ↺ à l\'arrêt pour calibrer.')) + '</p>' +
      '<button class="btn soft block" id="dkRst">' + esc(T('Remettre les compteurs à zéro')) + '</button>' +
      '<button class="btn primary block" id="dkShow">' + esc(T('Afficher le cadran')) + '</button>', 'dashset');
    document.getElementById('sheetTitle').innerHTML = esc(T('Cadran de conduite')) + ' <span class="prem">Premium</span>';
    const re = () => { save(); const pv = body.querySelector('.dk-preview'); pv.className = 'dk-preview ds-' + CFG.style; pv.style.setProperty('--dkc', CFG.color); pv.innerHTML = gaugeSvg(); const d = document.getElementById('dashOv'); if (d && !d.hidden) { render(); d.hidden = false; } };
    body.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { CFG.style = b.dataset.st; body.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b)); re(); }; });
    body.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { CFG.color = b.dataset.c; body.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); body.querySelectorAll('.dk-sty > span').forEach((s) => s.style.setProperty('--dkc', CFG.color)); re(); }; });
    body.querySelectorAll('#dkScale button').forEach((b) => { b.onclick = () => { CFG.scale = b.dataset.s; body.querySelectorAll('#dkScale button').forEach((x) => x.classList.toggle('on', x === b)); re(); }; });
    WIDGETS.forEach(([k]) => { const c = body.querySelector('#dkw_' + k); c.onchange = () => { CFG.w = CFG.w || {}; CFG.w[k] = c.checked ? 1 : 0; re(); }; });
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
