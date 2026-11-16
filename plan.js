/* ROUTA – #026 Planification des voyages (Premium, étiquette seulement pendant les tests).
   Voyages futurs enregistrés sur ce téléphone : destination, étapes, date, et story 9:16 à partager.
   La navigation ordinaire et les étapes restent gratuites. */
(function () {
  'use strict';
  const A = window.ROUTA, X = window.ROUTA_X;
  if (!A || !X) return;
  const { S, esc, el, toast, openSheet, closeSheet, fmtDist, fmtDur, store, chooseDestination, uuid } = A;
  const T = (s, v) => { let o = (A.I18N && A.I18N.t) ? A.I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
  const LANG = () => { const l = (A.I18N && A.I18N.lang) || 'fr'; return l === 'en' ? 'en-GB' : l; };
  const CAL = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  const load = () => store.get('routa.plans', []);
  const save = (l) => store.set('routa.plans', l);
  const fmtDay = (d) => { try { return new Date(d + 'T12:00:00').toLocaleDateString(LANG(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d; } };
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (t) => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const PREM = ' <span class="prem">Premium</span>';

  /* ---------- enregistrer le trajet affiché ---------- */
  X.planSave = (R, dest) => {
    const stops = X.viasFor ? X.viasFor(dest) : [];
    const body = openSheet(T('Planifier ce voyage'),
      '<p class="muted small">' + esc(T('Le voyage est enregistré sur ce téléphone, avec ses étapes. Tu pourras le relancer le jour J ou le partager en story.')) + '</p>' +
      '<label class="field" for="plName"><span>' + esc(T('Nom du voyage')) + '</span><input id="plName" type="text" maxlength="60" value="' + esc(dest.name || '') + '"></label>' +
      '<label class="field" for="plDate"><span>' + esc(T('Date de départ')) + '</span><input id="plDate" type="date" value="' + isoDay(Date.now() + 86400000) + '"></label>' +
      '<div class="card"><div class="grow"><b>' + esc(dest.name || '') + '</b><div class="sub">' + esc([fmtDist(R.total), fmtDur(R.duration || 0), stops.length ? T('{n} étapes', { n: stops.length }) : T('Sans étape')].join(' · ')) + '</div></div></div>' +
      '<button class="btn block" id="plOk">' + esc(T('Enregistrer le voyage')) + '</button>', 'plansave');
    body.querySelector('#plOk').onclick = () => {
      const name = body.querySelector('#plName').value.trim() || dest.name || T('Mon voyage');
      const date = body.querySelector('#plDate').value || isoDay(Date.now());
      const from = S.pos ? { name: T('Départ'), lat: S.pos.lat, lon: S.pos.lon } : null;
      const l = load(); l.push({ id: uuid(), name: name.slice(0, 60), date, from, dest: { name: dest.name, sub: dest.sub || '', lat: dest.lat, lon: dest.lon }, stops, km: R.total, dur: R.duration || 0, at: Date.now() });
      save(l); toast(esc(T('Voyage enregistré : {n}', { n: name })));
      openPlans();
    };
  };

  /* ---------- liste des voyages ---------- */
  function openPlans() {
    const today = isoDay(Date.now());
    const l = load().sort((a, b) => a.date.localeCompare(b.date));
    const next = l.filter((p) => p.date >= today), past = l.filter((p) => p.date < today).reverse();
    const card = (p) => '<button class="card tap" data-id="' + esc(p.id) + '"><span class="ico" style="background:#7C5CFF">' + CAL + '</span><span class="grow"><b>' + esc(p.name) + '</b><span class="sub">' + esc(fmtDay(p.date)) + ' · ' + esc([fmtDist(p.km), p.stops.length ? T('{n} étapes', { n: p.stops.length }) : ''].filter(Boolean).join(' · ')) + '</span></span></button>';
    const body = openSheet(T('Planifier un voyage'),
      '<p class="muted small">' + esc(T('Choisis une destination, ajoute tes étapes, puis touche « Planifier ce voyage » dans l\'aperçu du trajet.')) + '</p>' +
      (next.length ? '<h3>' + esc(T('Prochains voyages')) + '</h3>' + next.map(card).join('') : '<div class="empty">' + esc(T('Aucun voyage prévu pour le moment.')) + '</div>') +
      (past.length ? '<h3>' + esc(T('Voyages passés')) + '</h3>' + past.slice(0, 10).map(card).join('') : '') +
      '<p class="muted small">' + esc(T('Tes voyages restent sur ce téléphone.')) + '</p>', 'plans');
    body.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => openPlan(b.dataset.id); });
  }

  function openPlan(id) {
    const p = load().find((x) => x.id === id); if (!p) { openPlans(); return; }
    const pts = [p.from || { name: T('Départ') }].concat(p.stops, [p.dest]);
    const body = openSheet(p.name,
      '<p class="muted">' + esc(fmtDay(p.date)) + ' · ' + esc(fmtDist(p.km)) + ' · ' + esc(fmtDur(p.dur)) + '</p>' +
      '<div class="planline">' + pts.map((x, i) => '<div class="plstop' + (i === 0 || i === pts.length - 1 ? ' end' : '') + '"><i></i><span>' + esc(i === 0 ? T('Départ') : x.name) + '</span></div>').join('') + '</div>' +
      '<button class="btn primary block" id="plGo">' + esc(T('Afficher l\'itinéraire')) + '</button>' +
      '<button class="btn soft block" id="plStory">' + esc(T('Partager en story')) + '</button>' +
      '<button class="btn ghost block" id="plDel">' + esc(T('Supprimer ce voyage')) + '</button>' +
      '<button class="btn ghost block" id="plBack">' + esc(T('Tous mes voyages')) + '</button>', 'plan');
    body.querySelector('#plGo').onclick = () => { if (X.setVias) X.setVias(p.dest, p.stops); closeSheet(); chooseDestination(p.dest); };
    body.querySelector('#plStory').onclick = () => planStory(p);
    body.querySelector('#plDel').onclick = () => { save(load().filter((x) => x.id !== id)); toast(esc(T('Voyage supprimé.'))); openPlans(); };
    body.querySelector('#plBack').onclick = openPlans;
  }

  /* ---------- story 1080 × 1920 ---------- */
  function fit(c, txt, maxW, size, weight) { let s = size; do { c.font = weight + ' ' + s + 'px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; s -= 2; } while (c.measureText(txt).width > maxW && s > 18); }
  function draw(p) {
    const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.fillStyle = '#0E1116'; c.fillRect(0, 0, W, H);
    let g = c.createRadialGradient(W * 0.85, 140, 40, W * 0.85, 140, 900); g.addColorStop(0, 'rgba(124,92,255,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createRadialGradient(80, H - 220, 20, 80, H - 220, 760); g.addColorStop(0, 'rgba(255,138,61,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    let y = 250;
    const ttl = T('Mon prochain voyage').toUpperCase(); c.fillStyle = '#FF8A3D'; fit(c, ttl, 900, 40, '800'); c.fillText(ttl, 90, y);
    y += 100; c.fillStyle = '#F4F6FA'; fit(c, p.name, 900, 84, '800'); c.fillText(p.name, 90, y);
    y += 70; c.fillStyle = '#9AA3AF'; const day = fmtDay(p.date); fit(c, day, 900, 42, '600'); c.fillText(day, 90, y);
    const pts = [T('Départ')].concat(p.stops.map((s) => s.name), [p.dest.name]);
    const top = y + 110, bottom = H - 520, step = Math.min(170, (bottom - top) / Math.max(1, pts.length - 1));
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 8; c.beginPath(); c.moveTo(130, top); c.lineTo(130, top + step * (pts.length - 1)); c.stroke();
    pts.forEach((n, i) => {
      const yy = top + step * i, end = i === 0 || i === pts.length - 1;
      c.fillStyle = end ? '#FF8A3D' : '#7C5CFF'; c.beginPath(); c.arc(130, yy, end ? 26 : 20, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#F4F6FA'; fit(c, n, 780, end ? 52 : 44, end ? '800' : '600'); c.fillText(n, 190, yy + 16);
    });
    const yb = H - 400;
    const box = (x, label, val) => { c.fillStyle = '#171B22'; c.beginPath(); c.roundRect ? c.roundRect(x, yb, 420, 190, 36) : c.rect(x, yb, 420, 190); c.fill(); c.fillStyle = '#9AA3AF'; fit(c, label, 360, 34, '600'); c.fillText(label, x + 36, yb + 64); c.fillStyle = '#F4F6FA'; fit(c, val, 360, 64, '800'); c.fillText(val, x + 36, yb + 148); };
    box(90, T('Distance'), fmtDist(p.km)); box(570, T('Durée estimée'), fmtDur(p.dur));
    c.fillStyle = '#9AA3AF'; c.font = '600 34px Inter, system-ui, sans-serif'; c.fillText('ROUTA', 90, H - 110);
    c.fillStyle = '#5B6472'; c.font = '500 28px Inter, system-ui, sans-serif'; c.fillText(T('par') + ' ACKFIX', 220, H - 110);
    return cv;
  }
  function planStory(p) {
    const cv = draw(p), url = cv.toDataURL('image/png');
    const body = openSheet(T('Ta story'),
      '<img class="storyimg" alt="" src="' + url + '" style="width:100%;border-radius:16px;display:block">' +
      '<button class="btn primary block" id="psShare">' + esc(T('Partager')) + '</button>' +
      '<button class="btn soft block" id="psDl">' + esc(T('Télécharger')) + '</button>' +
      '<button class="btn ghost block" id="psBack">' + esc(T('Retour')) + '</button>', 'planstory');
    const name = 'routa-voyage-' + p.date + '.png';
    const blob = () => new Promise((res) => cv.toBlob(res, 'image/png'));
    body.querySelector('#psBack').onclick = () => openPlan(p.id);
    body.querySelector('#psShare').onclick = async () => {
      const b = await blob(); const file = b && new File([b], name, { type: 'image/png' });
      try { if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'ROUTA' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      toast(esc(T('Appuie longuement sur l\'image pour l\'enregistrer, puis ajoute-la à ta story Instagram.')));
    };
    body.querySelector('#psDl').onclick = async () => {
      const C = window.Capacitor, native = !!(C && C.isNativePlatform && C.isNativePlatform());
      if (native) {
        try { if (C.Plugins && C.Plugins.RoutaMap) { await C.Plugins.RoutaMap.saveImage({ data: url.split(',')[1], name }); toast(esc(T('Image enregistrée dans tes photos.'))); return; } } catch (e) { /* ancienne version */ }
        const b = await blob(); const file = new File([b], name, { type: 'image/png' });
        try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
        toast(esc(T('Appuie longuement sur l\'image pour l\'enregistrer, puis ajoute-la à ta story Instagram.'))); return;
      }
      const b = await blob(); const u = URL.createObjectURL(b); const a = document.createElement('a');
      a.href = u; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    };
  }

  /* ---------- branchement au menu ---------- */
  const tiles0 = X.tiles;
  X.tiles = () => (tiles0 ? tiles0() : []).concat([['plan', CAL, T('Planifier un voyage')]]);
  const open0 = X.open;
  X.open = (k) => { if (k === 'plan') { openPlans(); return true; } return open0 ? open0(k) : false; };
  X.openPlans = openPlans;
})();
