/* ROUTA – convois, rassemblements, points, partage de trajet, navigation TomTom,
   bornes et parkings libres, cols et météo, carnet de la voiture, voiture garée. */
(function () {
'use strict';
const A = window.ROUTA; if (!A) return;
const { S, DB, map, CFG, esc, ic, el, toast, openSheet, closeSheet, say, vibrate, uuid, dist, fmtDist, fmtDur, fmtClock, ago, store, saveMe, pushPresence, chooseDestination, initials } = A;
const BANNED_CTRL = /(radar|blitz|flash[ée]?|contr[ôo]le|kontroll|controll|polic|polizei|polizia|pol[ií]cia|flics?\b|keufs?\b|cond[ée]s?\b|gendarm|bullen|schmier|laser|r[ée]p[ée]titeur)/i;
const ctrlBlocked = (...t) => t.some((x) => x && BANNED_CTRL.test(x));
const ctrlSafe = (x) => (x && !BANNED_CTRL.test(x) ? x : '');
const $ = (id) => document.getElementById(id);
const X = window.ROUTA_X = {};
const TT = CFG.tomtomKey || '';
const LANG = (window.ROUTA_I18N && window.ROUTA_I18N.valhalla) || 'fr-FR';
const sv = (p) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
const IC = {
  users: sv('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c3 .2 5.5 1.9 5.5 5"/>'),
  convoy: sv('<path d="M3 16V9l2-4h6l2 4v7z"/><path d="M13 16v-5h5l3 3v2z"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>'),
  event: sv('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  trophy: sv('<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H4a3 3 0 003 4M16 6h4a3 3 0 01-3 4M12 13v4M8 21h8M10 17h4v4h-4z"/>'),
  share: sv('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  mount: sv('<path d="M3 20l6-11 4 6 3-4 5 9z"/><path d="M8 11l1.5 1.5L11 11"/>'),
  book: sv('<path d="M4 4h11a3 3 0 013 3v13H7a3 3 0 01-3-3z"/><path d="M8 8h6M8 12h6"/>'),
  car: sv('<path d="M5 15l2-6h10l2 6v3H5z"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/>'),
  plug: sv('<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0zM12 17v4"/>'),
  park: sv('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M10 17V7h3a3 3 0 010 6h-3"/>'),
  flag: sv('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>')
};
const nowIso = () => new Date().toISOString();
async function getJson(url, ms, body) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 9000);
  try {
    const r = await fetch(url, body ? { signal: ac.signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { signal: ac.signal });
    if (!r.ok) throw new Error('http ' + r.status); return await r.json();
  } finally { clearTimeout(t); }
}
const tt = (path, params) => 'https://api.tomtom.com' + path + '?' + new URLSearchParams(Object.assign({ key: TT }, params || {})).toString();
const here = () => S.pos || (() => { const c = map.getCenter(); return { lat: c.lat, lon: c.lng }; })();
const pad = (n) => String(n).padStart(2, '0');
const code6 = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
const appUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');
async function shareLink(title, text, url) {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return; }
    await navigator.clipboard.writeText(text + ' ' + url); toast('Lien copié, colle-le à tes potes !');
  } catch (e) { if (e && e.name !== 'AbortError') toast('Lien : ' + esc(url)); }
}

/* ======================= Points et classement ======================= */
const PTS = { addAlert: 10, addSpot: 20, addPrice: 5, rate: 3 };
function addPoints(n) {
  S.me.points = (S.me.points || 0) + n; saveMe(); pushPresence(true);
  const b = el('<div class="ptsfly">+' + n + ' pts</div>'); document.body.appendChild(b); setTimeout(() => b.remove(), 1600);
}
Object.keys(PTS).forEach((k) => {
  const orig = DB[k] && DB[k].bind(DB); if (!orig) return;
  DB[k] = async (...a) => { const ok = await orig(...a); if (ok) addPoints(PTS[k]); return ok; };
});
const origUpd = DB.updateAlert.bind(DB);
DB.updateAlert = async (id, patch) => { const r = await origUpd(id, patch); if (patch && (patch.confirms || patch.denies)) addPoints(2); return r; };
/* Classement : on y apparaît à partir de 100 points ; en dessous, on voit sa progression (les points restent acquis) */
const RANK_MIN = 100;
async function openRanking(scope) {
  scope = scope || 'all';
  const body = openSheet('Classement', '<p class="muted">Chargement…</p>', 'ranking');
  let rows = [], myRank = null, failed = false;
  const mine = S.me.points || 0;
  if (DB.sb) {
    try {
      let q = DB.sb.from('drivers').select('id,pseudo,color,points,car').gte('points', RANK_MIN).order('points', { ascending: false }).limit(50);
      const { data, error } = await q; if (error) throw error;
      rows = data || [];
      if (mine >= RANK_MIN) {
        let cq = DB.sb.from('drivers').select('id', { count: 'exact', head: true }).gt('points', mine);
        const { count } = await cq; if (typeof count === 'number') myRank = count + 1;
      }
    } catch (e) { failed = true; }
  }
  if (S.sheetView !== 'ranking') return;
  if (mine >= RANK_MIN && !rows.some((r) => r.id === S.me.id)) rows.push({ id: S.me.id, pseudo: S.me.pseudo, color: S.me.color, points: mine, car: S.me.car, rank: myRank });
  rows.sort((a, b) => (b.points || 0) - (a.points || 0));
  if (mine >= RANK_MIN && myRank == null) myRank = rows.findIndex((r) => r.id === S.me.id) + 1;
  const pct = Math.min(100, Math.round(mine / RANK_MIN * 100));
  const meCard = mine >= RANK_MIN
    ? '<div class="card"><div class="grow"><b>' + esc(TRX('Toi : {n} points', { n: mine })) + '</b><div class="sub">' + esc(TRX('{r} du classement', { r: myRank + (((window.ROUTA_I18N && ROUTA_I18N.lang) || 'fr') === 'fr' ? (myRank === 1 ? 'er' : 'e') : '.') })) + '</div></div></div>'
    : '<div class="card" style="display:block"><b>' + esc(TRX('Toi : {n} points', { n: mine })) + '</b><div class="sub">' + esc(TRX('Encore {n} points pour apparaître dans le classement.', { n: RANK_MIN - mine })) + '</div><div style="height:8px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:8px"><i style="display:block;height:100%;width:' + pct + '%;background:var(--accent);border-radius:4px"></i></div></div>';
  body.innerHTML = meCard +
    (failed ? '<div class="empty">' + esc(TRX('Le classement n\'est pas disponible pour le moment. Réessaie plus tard.')) + '</div>'
      : rows.length ? rows.slice(0, 50).map((r, i) => '<div class="card' + (r.id === S.me.id ? ' meRow' : '') + '"><div class="rank">' + (r.rank || i + 1) + '</div><div class="ico" style="background:' + esc(r.color || '#FF8A3D') + ';border-radius:22px">' + esc(initials(r.pseudo)) + '</div><div class="grow"><b>' + esc(r.pseudo || 'Conducteur') + '</b>' + (r.car ? '<div class="sub">' + esc(r.car) + '</div>' : '') + '</div><div class="val">' + (r.points || 0) + '</div></div>').join('')
      : '<div class="empty">' + esc(TRX('Personne n\'a encore 100 points ici.')) + '</div>') +
    '<p class="muted small">' + esc(TRX('On apparaît dans le classement à partir de 100 points.')) + ' Points : alerte signalée +10, alerte confirmée +2, spot ajouté +20, prix signalé +5, avis +3.</p>';
  body.querySelectorAll('#rkSeg button').forEach((b) => { b.onclick = () => openRanking(b.dataset.s); });
}

/* ======================= Partager mon trajet en direct ======================= */
X.share = store.get('routa.share', null);
if (X.share && X.share.until < Date.now()) X.share = null;
function shareInfo() {
  if (!X.share || X.share.until < Date.now()) return null;
  const n = S.nav;
  let eta = null, name = null, lat = null, lon = null;
  if (n && n.R) {
    const left = Math.max(0, (n.R.total || 0) - (n.along || 0));
    eta = new Date(Date.now() + (n.R.duration || 0) * (left / Math.max(1, n.R.total || 1)) * 1000).toISOString();
    name = n.dest.name; lat = n.dest.lat; lon = n.dest.lon;
  }
  return { share_until: new Date(X.share.until).toISOString(), nav_name: name, nav_lat: lat, nav_lon: lon, nav_eta: eta };
}
async function startShare(hours) {
  if (!DB.sb) { toast('Le partage demande le mode en ligne.'); return; }
  X.share = { until: Date.now() + (hours || 2) * 3600000 }; store.set('routa.share', X.share);
  pushPresence(true); updateShareBtn();
  shareLink('ROUTA', (S.me.pseudo || 'Un ami') + ' partage son trajet en direct avec toi :', appUrl() + 'suivi.html?id=' + encodeURIComponent(S.me.id));
}
function stopShare() { X.share = null; store.set('routa.share', null); pushPresence(true); updateShareBtn(); toast('Partage de position arrêté.'); }
function openShareSheet() {
  const on = X.share && X.share.until > Date.now();
  const body = openSheet('Partager ma position',
    '<p>Envoie un lien : la personne voit où tu es en direct sur une carte, et ton heure d\'arrivée si tu es en navigation. Elle n\'a pas besoin de l\'app.</p>' +
    (on ? '<div class="banner">' + ic('info') + '<span>Partage actif jusqu\'à <b>' + fmtClock(new Date(X.share.until)) + '</b>.</span></div><button class="btn block" id="shAgain">' + IC.share + 'Renvoyer le lien</button><button class="btn danger" id="shStop">Arrêter le partage</button>'
      : '<div class="row"><button class="btn grow" data-h="1">1 heure</button><button class="btn grow" data-h="3">3 heures</button><button class="btn soft grow" data-h="8">8 heures</button></div>') +
    '<p class="muted small">Le lien s\'arrête tout seul à la fin du temps choisi.</p>', 'share');
  body.querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => { closeSheet(); startShare(+b.dataset.h); }; });
  const a = body.querySelector('#shAgain'); if (a) a.onclick = () => shareLink('ROUTA', (S.me.pseudo || 'Un ami') + ' partage son trajet en direct avec toi :', appUrl() + 'suivi.html?id=' + encodeURIComponent(S.me.id));
  const s = body.querySelector('#shStop'); if (s) s.onclick = () => { closeSheet(); stopShare(); };
}
function updateShareBtn() { const b = $('btnShareTrip'); if (b) b.classList.toggle('active', !!(X.share && X.share.until > Date.now())); }
(function navShareButton() {
  const act = document.querySelector('#navBar .navbar-act'); if (!act) return;
  const b = el('<button id="btnShareTrip" class="iconbtn" aria-label="Partager mon trajet">' + IC.share + '</button>');
  b.onclick = () => (X.share && X.share.until > Date.now()) ? openShareSheet() : startShare(3);
  act.insertBefore(b, act.firstChild); updateShareBtn();
})();

/* ======================= Présence : champs en plus ======================= */
const origPresence = DB.presence.bind(DB);
DB.presence = (row) => {
  row.points = S.me.points || 0;
  row.convoy = X.convoy ? X.convoy.id : null;
  const si = shareInfo();
  Object.assign(row, si || { share_until: null, nav_name: null, nav_lat: null, nav_lon: null, nav_eta: null });
  if (si && row.lat == null && S.pos) { row.lat = S.pos.lat; row.lon = S.pos.lon; }
  return origPresence(row);
};

/* ======================= Convoi ======================= */
X.convoy = store.get('routa.convoy', null);
let convoyMsgs = [], convoyChan = null;
X.isMate = (d) => !!(X.convoy && d && d.convoy === X.convoy.id);
function saveConvoy() { store.set('routa.convoy', X.convoy); pushPresence(true); }
function subscribeConvoy() {
  if (!DB.sb || !X.convoy) return;
  if (convoyChan) { DB.sb.removeChannel(convoyChan); convoyChan = null; }
  const to = 'convoy:' + X.convoy.id;
  convoyChan = DB.sb.channel('routa-convoy-' + X.convoy.id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'convoys', filter: 'id=eq.' + X.convoy.id }, (p) => {
      const old = X.convoy.dest_name; Object.assign(X.convoy, p.new); store.set('routa.convoy', X.convoy);
      if (p.new.dest_name && p.new.dest_name !== old && p.new.owner !== S.me.id) toast('Destination du convoi : <b>' + esc(p.new.dest_name) + '</b>', { action: 'Y aller', onAction: () => chooseDestination({ name: p.new.dest_name, sub: 'Convoi ' + X.convoy.name, lat: p.new.dest_lat, lon: p.new.dest_lon }), ms: 12000 });
      if (S.sheetView === 'convoy') openConvoy();
    })
    .subscribe();
}
async function loadConvoyMsgs() {
  if (!DB.sb || !X.convoy) return;
  const { data } = await DB.sb.rpc('messages_convoy', { me: S.me.id, s: DB.secret(), cid: X.convoy.id });
  convoyMsgs = (Array.isArray(data) ? data : []).reverse();
}
/* Chat du convoi : seuls les membres du convoi peuvent le lire */
async function pollConvoy() {
  if (!DB.sb || !X.convoy || document.hidden) return;
  const last = convoyMsgs.length ? convoyMsgs[convoyMsgs.length - 1].created_at : null;
  const { data } = await DB.sb.rpc('messages_convoy', { me: S.me.id, s: DB.secret(), cid: X.convoy.id, since: last });
  if (!Array.isArray(data) || !data.length) return;
  let fresh = false;
  data.slice().reverse().forEach((m) => {
    if (convoyMsgs.some((x) => x.id === m.id)) return;
    convoyMsgs.push(m); fresh = true;
    if (m.from_id !== S.me.id) { vibrate(50); toast('<b>' + esc(X.convoy.name) + '</b> · ' + esc(m.from_name || '') + ' : ' + esc(m.body || ''), { action: 'Ouvrir', onAction: openConvoy, ms: 7000 }); }
  });
  if (fresh && S.sheetView === 'convoy') openConvoy();
}
setInterval(pollConvoy, 5000);
async function joinConvoy(code) {
  if (!DB.sb) { toast('Le convoi demande le mode en ligne.'); return false; }
  const { data } = await DB.sb.from('convoys').select('*').eq('id', code.toUpperCase()).limit(1);
  if (!data || !data[0]) { toast('Convoi introuvable. Vérifie le code.'); return false; }
  X.convoy = data[0]; saveConvoy(); subscribeConvoy(); await new Promise((r) => setTimeout(r, 1500)); await loadConvoyMsgs();
  toast('Tu as rejoint le convoi <b>' + esc(X.convoy.name) + '</b>.'); return true;
}
async function createConvoy(name) {
  const c = { id: code6(), name: name || 'Sortie entre potes', owner: S.me.id, owner_name: S.me.pseudo, created_at: nowIso() };
  const { error } = await DB.sb.from('convoys').insert(c);
  if (error) { toast('Le convoi n\'a pas pu être créé. Réessaie.'); return; }
  X.convoy = c; saveConvoy(); subscribeConvoy(); convoyMsgs = [];
  openConvoy();
  shareLink('ROUTA', convoyInvite(c), appUrl() + '?convoi=' + c.id);
}
function convoyInvite(c) { return TRX('Rejoins mon convoi « {n} » sur ROUTA. Dans l\'app : Menu › Convoi › Rejoindre, code {c}. Ou ouvre ce lien :', { n: c.name, c: c.id }); }
function leaveConvoy() {
  if (convoyChan && DB.sb) DB.sb.removeChannel(convoyChan); convoyChan = null;
  X.convoy = null; saveConvoy(); closeSheet(); toast('Tu as quitté le convoi.');
}
async function convoyMembers() {
  if (!DB.sb || !X.convoy) return [];
  await DB.liveDrivers();
  const out = [];
  S.drivers.forEach((d) => { if (d.convoy === X.convoy.id) out.push(d); });
  if (S.me) out.push({ id: S.me.id, pseudo: S.me.pseudo, color: S.me.color, car: S.me.car, lat: S.pos ? S.pos.lat : null, lon: S.pos ? S.pos.lon : null, updated_at: new Date().toISOString() });
  return out;
}
async function openConvoy() {
  if (!X.convoy) {
    const body = openSheet('Convoi',
      '<p>Roulez à plusieurs : chaque membre voit les autres précisément sur la carte, la destination est partagée et vous avez un chat de groupe.</p>' +
      '<form id="cvNew"><label class="field" for="cvName">Nom de la sortie<input id="cvName" maxlength="40" placeholder="Ex. : Balade col du Pillon"></label><button class="btn block" type="submit">' + IC.convoy + 'Créer un convoi</button></form>' +
      '<form id="cvJoin" class="row"><label class="field grow" for="cvCode">Code du convoi<input id="cvCode" maxlength="6" autocapitalize="characters" placeholder="Ex. : K7P2QX"></label><button class="btn soft" type="submit">Rejoindre</button></form>', 'convoy');
    body.querySelector('#cvNew').onsubmit = (e) => { e.preventDefault(); if (!DB.sb) { toast('Le convoi demande le mode en ligne.'); return; } if (ctrlBlocked($('cvName').value)) { toast('Pas de mention de contrôles de police ou de radars : c\'est interdit en Suisse.'); return; } createConvoy($('cvName').value.trim()); };
    body.querySelector('#cvJoin').onsubmit = async (e) => { e.preventDefault(); if (await joinConvoy($('cvCode').value.trim())) openConvoy(); };
    return;
  }
  const c = X.convoy;
  const body = openSheet(c.name, '<p class="muted">Chargement…</p>', 'convoy');
  const mem = await convoyMembers();
  if (S.sheetView !== 'convoy') return;
  const owner = c.owner === S.me.id;
  const myDest = S.nav ? S.nav.dest : (S.preview ? S.preview.dest : null);
  body.innerHTML =
    '<div class="row wrap"><span class="pill">Code <b class="code">' + esc(c.id) + '</b></span><span class="pill">' + mem.length + ' membre' + (mem.length > 1 ? 's' : '') + '</span></div>' +
    (c.dest_name ? '<div class="card"><div class="ico" style="background:#3DDC97">' + IC.flag + '</div><div class="grow"><b>' + esc(c.dest_name) + '</b><div class="sub">Destination du convoi</div></div><button class="btn small" id="cvGo">Y aller</button></div>' : '<p class="muted small">Pas encore de destination commune.</p>') +
    (owner && myDest ? '<button class="btn soft block" id="cvSetDest">Choisir « ' + esc(myDest.name) + ' » comme destination du convoi</button>' : '') +
    '<h3>Membres</h3>' + mem.map((d) => { const on = Date.now() - Date.parse(d.updated_at) < 3 * 60000; return '<div class="card"><div class="ico" style="background:' + esc(d.color || '#FF8A3D') + ';border-radius:22px">' + esc(initials(d.pseudo)) + '</div><div class="grow"><b>' + esc(d.pseudo) + (d.id === c.owner ? ' · chef' : '') + '</b><div class="sub">' + (on && d.lat != null && S.pos && d.id !== S.me.id ? fmtDist(dist(S.pos, d)) : on ? 'En ligne' : 'Hors ligne') + '</div></div></div>'; }).join('') +
    '<h3>Chat du convoi</h3><div class="cvchat">' + (convoyMsgs.length ? convoyMsgs.slice(-30).map((m) => '<div class="msg' + (m.from_id === S.me.id ? ' mine' : '') + '"><b>' + esc(m.from_name || '') + '</b> ' + esc(m.body || '') + '<div class="meta">' + ago(m.created_at) + '</div></div>').join('') : '<div class="empty">Pas encore de message.</div>') + '</div>' +
    '<div class="quick">' + ['On part !', 'Pause dans 10 min', 'Je suis derrière', 'Attention devant', 'On se retrouve à l\'arrivée'].map((t) => '<button data-q="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>' +
    '<div class="row"><button class="btn soft grow" id="cvInvite">' + IC.share + 'Inviter</button><button class="btn danger grow" id="cvLeave">Quitter</button></div>';
  const send = async (t) => {
    t = (t || '').trim(); if (!t) return;
    const m = { id: uuid(), from_id: S.me.id, from_name: S.me.pseudo, to_id: 'convoy:' + c.id, kind: 'text', body: t, created_at: nowIso() };
    let { data, error } = await DB.sb.rpc('message_send', { m, s: DB.secret() });
    if (error || data === false) { pushPresence(true); await new Promise((r) => setTimeout(r, 2000)); ({ data, error } = await DB.sb.rpc('message_send', { m, s: DB.secret() })); }
    if (error || data === false) { toast('Message non envoyé. Vérifie ta connexion.'); return; }
    if (!convoyMsgs.some((x) => x.id === m.id)) convoyMsgs.push(m); openConvoy();
  };
  const go = body.querySelector('#cvGo'); if (go) go.onclick = () => { closeSheet(); chooseDestination({ name: c.dest_name, sub: 'Convoi ' + c.name, lat: c.dest_lat, lon: c.dest_lon }); };
  const sd = body.querySelector('#cvSetDest'); if (sd) sd.onclick = async () => {
    const { error } = await DB.sb.from('convoys').update({ dest_name: myDest.name, dest_lat: myDest.lat, dest_lon: myDest.lon }).eq('id', c.id);
    if (error) { toast('Erreur, réessaie.'); return; }
    Object.assign(c, { dest_name: myDest.name, dest_lat: myDest.lat, dest_lon: myDest.lon }); store.set('routa.convoy', c);
    await send('Destination : ' + myDest.name); toast('Destination partagée avec le convoi.');
  };
  body.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => send(b.dataset.q); });
  body.querySelector('#cvInvite').onclick = () => shareLink('ROUTA', convoyInvite(c), appUrl() + '?convoi=' + c.id);
  body.querySelector('#cvLeave').onclick = leaveConvoy;
  const chat = body.querySelector('.cvchat'); if (chat) chat.scrollTop = chat.scrollHeight;
}
setInterval(() => { S.markers.drivers.forEach((m, id) => { const d = S.drivers.get(id); m.getElement().classList.toggle('mate', X.isMate(d)); }); }, 3000);

/* ======================= Rassemblements ======================= */
let events = [], evMarkers = [];
async function loadEvents() {
  if (!DB.sb) return;
  const from = new Date(Date.now() - 4 * 3600000).toISOString(), to = new Date(Date.now() + 45 * 86400000).toISOString();
  const [{ data: ev }, { data: rs }] = await Promise.all([
    DB.sb.from('events').select('*').gte('starts_at', from).lte('starts_at', to).order('starts_at').limit(200),
    DB.sb.from('event_rsvp').select('event_id,driver_id,pseudo').limit(2000)
  ]);
  events = (ev || []).map((e) => Object.assign(e, { going: (rs || []).filter((r) => r.event_id === e.id) }));
  drawEvents();
}
function drawEvents() {
  evMarkers.forEach((m) => m.remove()); evMarkers = [];
  events.forEach((e) => {
    const b = el('<button class="mk-event" aria-label="Rassemblement : ' + esc(e.title) + '">' + IC.event + '</button>');
    b.onclick = (ev) => { ev.stopPropagation(); openEvent(e.id); };
    evMarkers.push(new maplibregl.Marker({ element: b }).setLngLat([e.lon, e.lat]).addTo(map));
  });
}
const fmtWhen = (iso) => { const d = new Date(iso); return d.toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + fmtClock(d); };
function openEvents() {
  const c = here();
  const list = events.slice().sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const body = openSheet('Rassemblements',
    '<button class="btn block" id="evNew">' + IC.event + 'Créer un rassemblement</button>' +
    (list.length ? list.map((e, i) => '<button class="card tap" data-i="' + i + '"><div class="ico" style="background:#C9A2FF">' + IC.event + '</div><div class="grow"><b>' + esc(e.title) + '</b><div class="sub">' + fmtWhen(e.starts_at) + ' · ' + fmtDist(dist(c, e)) + ' · ' + e.going.length + ' participant' + (e.going.length > 1 ? 's' : '') + '</div></div></button>').join('') : '<div class="empty">Aucun rassemblement prévu. Crée le premier !</div>'), 'events');
  body.querySelector('#evNew').onclick = openNewEvent;
  body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => openEvent(list[+b.dataset.i].id); });
}
function openNewEvent() {
  if (!DB.sb) { toast('Les rassemblements demandent le mode en ligne.'); return; }
  const d = new Date(Date.now() + 86400000); d.setHours(20, 0, 0, 0);
  const local = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const body = openSheet('Nouveau rassemblement',
    '<label class="field" for="evT">Titre<input id="evT" maxlength="60" placeholder="Ex. : Meet GTI au bord du lac"></label>' +
    '<label class="field" for="evD">Date et heure<input id="evD" type="datetime-local" value="' + local + '"></label>' +
    '<label class="field" for="evDesc">Description<textarea id="evDesc" maxlength="400" placeholder="Type de voitures, ambiance, consignes…" style="height:90px"></textarea></label>' +
    '<div class="seg" id="evWhere"><button data-w="here" class="on">À ma position</button><button data-w="center">Au centre de la carte</button></div>' +
    '<button class="btn block" id="evSave">Publier le rassemblement</button>' +
    '<p class="muted small">Il apparaît sur la carte de tous les utilisateurs. Pour un autre lieu, ferme cette fenêtre, place la carte sur l\'endroit, puis reviens et choisis « Au centre de la carte ».</p>', 'events');
  let where = S.pos ? 'here' : 'center';
  const segBtns = body.querySelectorAll('#evWhere button');
  segBtns.forEach((b) => { b.classList.toggle('on', b.dataset.w === where); b.onclick = () => { where = b.dataset.w; segBtns.forEach((x) => x.classList.toggle('on', x === b)); }; });
  body.querySelector('#evSave').onclick = async () => {
    const title = $('evT').value.trim(); const when = new Date($('evD').value);
    if (title.length < 3) { toast('Donne un titre au rassemblement.'); return; }
    if (ctrlBlocked(title, $('evDesc').value)) { toast('Pas de mention de contrôles de police ou de radars : c\'est interdit en Suisse.'); return; }
    if (isNaN(when) || when.getTime() < Date.now() - 3600000) { toast('Choisis une date à venir.'); return; }
    const p = where === 'here' && S.pos ? S.pos : (() => { const c = map.getCenter(); return { lat: c.lat, lon: c.lng }; })();
    const e = { id: uuid(), title, description: $('evDesc').value.trim() || null, lat: p.lat, lon: p.lon, starts_at: when.toISOString(), created_by: S.me.id, created_name: S.me.pseudo, created_at: nowIso() };
    const { error } = await DB.sb.from('events').insert(e);
    if (error) { toast('Le rassemblement n\'a pas pu être publié. Réessaie.'); return; }
    await DB.sb.from('event_rsvp').insert({ event_id: e.id, driver_id: S.me.id, pseudo: S.me.pseudo });
    addPoints(15); await loadEvents(); openEvent(e.id);
  };
}
function openEvent(id) {
  const e = events.find((x) => x.id === id); if (!e) return;
  const going = e.going.some((r) => r.driver_id === S.me.id);
  const mine = e.created_by === S.me.id;
  const body = openSheet(e.title,
    '<div class="row wrap"><span class="pill">' + fmtWhen(e.starts_at) + '</span>' + (S.pos ? '<span class="pill">' + fmtDist(dist(S.pos, e)) + '</span>' : '') + '<span class="pill">Par ' + esc(e.created_name || '?') + '</span></div>' +
    (ctrlSafe(e.description) ? '<p>' + esc(e.description) + '</p>' : '') +
    '<p><b>' + e.going.length + ' participant' + (e.going.length > 1 ? 's' : '') + '</b>' + (e.going.length ? ' : ' + e.going.slice(0, 12).map((r) => esc(r.pseudo || '?')).join(', ') : '') + '</p>' +
    '<button class="btn block" id="evGoing">' + (going ? 'Je ne viens plus' : 'Je viens') + '</button>' +
    '<button class="btn soft block" id="evNav">' + ic('nav') + 'Y aller</button>' +
    '<button class="btn soft block" id="evShare">' + IC.share + 'Partager</button>' +
    (mine ? '<button class="btn danger" id="evDel">' + ic('trash') + 'Supprimer</button>' : ''), 'event');
  body.querySelector('#evGoing').onclick = async () => {
    if (going) await DB.sb.from('event_rsvp').delete().eq('event_id', e.id).eq('driver_id', S.me.id);
    else await DB.sb.from('event_rsvp').insert({ event_id: e.id, driver_id: S.me.id, pseudo: S.me.pseudo });
    await loadEvents(); openEvent(e.id);
  };
  body.querySelector('#evNav').onclick = () => { closeSheet(); chooseDestination({ name: e.title, sub: 'Rassemblement', lat: e.lat, lon: e.lon }); };
  body.querySelector('#evShare').onclick = () => shareLink('ROUTA', 'Rassemblement « ' + e.title + ' » le ' + fmtWhen(e.starts_at) + ' :', appUrl() + '?event=' + e.id);
  const del = body.querySelector('#evDel'); if (del) del.onclick = async () => { await DB.sb.from('events').delete().eq('id', e.id); closeSheet(); await loadEvents(); toast('Rassemblement supprimé.'); };
}
setInterval(() => {
  events.forEach((e) => {
    if (!e.going.some((r) => r.driver_id === S.me.id)) return;
    const mins = (Date.parse(e.starts_at) - Date.now()) / 60000;
    const k = 'routa.evrem.' + e.id;
    if (mins > 0 && mins <= 60 && !store.get(k, false)) { store.set(k, true); vibrate([100, 60, 100]); toast('Rassemblement <b>' + esc(e.title) + '</b> dans ' + Math.round(mins) + ' min.', { action: 'Y aller', onAction: () => chooseDestination({ name: e.title, sub: 'Rassemblement', lat: e.lat, lon: e.lon }), ms: 15000 }); }
  });
}, 60000);

/* ======================= Navigation TomTom : trafic, alternatives, évitements, étapes ======================= */
X.opts = store.get('routa.ropts', { tolls: false, motorways: false, vignette: false });
X.via = []; X.viaFor = null; X.altIdx = 0;
const routeCache = new Map();
const keyOf = (p) => p ? p.lat.toFixed(4) + ',' + p.lon.toFixed(4) : '';
const MAN = {
  STRAIGHT: ['continue', 'straight'], KEEP_RIGHT: ['fork', 'slight right'], KEEP_LEFT: ['fork', 'slight left'], BEAR_RIGHT: ['turn', 'slight right'], BEAR_LEFT: ['turn', 'slight left'],
  TURN_RIGHT: ['turn', 'right'], TURN_LEFT: ['turn', 'left'], SHARP_RIGHT: ['turn', 'sharp right'], SHARP_LEFT: ['turn', 'sharp left'], MAKE_UTURN: ['turn', 'uturn'], TRY_MAKE_UTURN: ['turn', 'uturn'],
  ENTER_MOTORWAY: ['on ramp', 'right'], ENTER_FREEWAY: ['on ramp', 'right'], ENTER_HIGHWAY: ['on ramp', 'right'], TAKE_EXIT: ['off ramp', 'right'], MOTORWAY_EXIT_LEFT: ['off ramp', 'left'], MOTORWAY_EXIT_RIGHT: ['off ramp', 'right'],
  SWITCH_PARALLEL_ROAD: ['continue', 'straight'], SWITCH_MAIN_ROAD: ['continue', 'straight'], FOLLOW: ['continue', 'straight'], TAKE_FERRY: ['continue', 'straight'], ENTRANCE_RAMP: ['on ramp', 'right'],
  ROUNDABOUT_CROSS: ['roundabout', 'straight'], ROUNDABOUT_RIGHT: ['roundabout', 'right'], ROUNDABOUT_LEFT: ['roundabout', 'left'], ROUNDABOUT_BACK: ['roundabout', 'uturn'],
  WAYPOINT_REACHED: ['continue', 'straight'], WAYPOINT_LEFT: ['continue', 'straight'], WAYPOINT_RIGHT: ['continue', 'straight'], DEPART: ['depart', ''], ARRIVE: ['arrive', ''], ARRIVE_LEFT: ['arrive', 'left'], ARRIVE_RIGHT: ['arrive', 'right']
};
function convertTT(rt) {
  const raw = []; rt.legs.forEach((l) => l.points.forEach((p) => raw.push(p)));
  const rawLim = new Array(raw.length).fill(null);
  (rt.sections || []).filter((x) => x.sectionType === 'SPEED_LIMIT' && x.maxSpeedLimitInKmh).forEach((x) => { for (let i = x.startPointIndex; i < x.endPointIndex && i < raw.length; i++) rawLim[i] = x.maxSpeedLimitInKmh; });
  const coords = [], limits = [], rawIdx = [];
  raw.forEach((p, i) => { const c = { lat: p.latitude, lon: p.longitude }; const last = coords[coords.length - 1]; if (!last || last.lat !== c.lat || last.lon !== c.lon) { coords.push(c); limits.push(rawLim[i]); } rawIdx.push(coords.length - 1); });
  const cum = [0]; for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + dist(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1] || rt.summary.lengthInMeters;
  const k = total / Math.max(1, rt.summary.lengthInMeters);
  const ins = ((rt.guidance && rt.guidance.instructions) || []).filter((x) => x.maneuver);
  const steps = [], stepEnds = [];
  ins.forEach((x, i) => {
    let [type, mod] = MAN[x.maneuver] || ['turn', x.turnAngleInDecimalDegrees > 0 ? 'right' : x.turnAngleInDecimalDegrees < 0 ? 'left' : 'straight'];
    if (type === 'off ramp' && x.maneuver === 'TAKE_EXIT' && x.turnAngleInDecimalDegrees < 0) mod = 'left';
    if (i === 0) type = 'depart';
    const name = x.street || (x.roadNumbers && x.roadNumbers.join(' / ')) || '';
    const next = ins[i + 1];
    const startD = x.routeOffsetInMeters * k, endD = next ? next.routeOffsetInMeters * k : total;
    steps.push({ maneuver: { type, modifier: mod, exit: x.roundaboutExitNumber || undefined, angle: type === 'roundabout' && typeof x.turnAngleInDecimalDegrees === 'number' ? x.turnAngleInDecimalDegrees : undefined, location: [x.point.longitude, x.point.latitude] }, name, distance: endD - startD, duration: 0 });
    stepEnds.push(endD);
  });
  if (!steps.length) { steps.push({ maneuver: { type: 'depart' }, name: '', distance: total }); stepEnds.push(total); }
  const lanes = (rt.sections || []).filter((s) => s.sectionType === 'LANES' && Array.isArray(s.lanes) && s.lanes.length > 1).map((s) => ({
    s: cum[rawIdx[Math.min(s.startPointIndex, rawIdx.length - 1)]] || 0,
    e: cum[rawIdx[Math.min(s.endPointIndex, rawIdx.length - 1)]] || 0,
    lanes: s.lanes.map((l) => ({ dirs: l.directions || [], follow: l.follow || null }))
  })).filter((s) => s.lanes.some((l) => l.follow));
  return { lanes: lanes.length ? lanes : null, coords, cum, total, duration: rt.summary.travelTimeInSeconds, steps, stepEnds, limits: limits.some(Boolean) ? limits : null, tomtom: true, trafficDelay: rt.summary.trafficDelayInSeconds || 0, noTraffic: rt.summary.noTrafficTravelTimeInSeconds };
}
/* Zones à éviter pour un trajet (#057 travaux et fermetures, #037 ZFE) : choisies par la personne, jamais inventées */
X.avoid = { for: null, rects: [] };
function avoidFor(to) { return X.avoid.for && to && X.avoid.for === keyOf(to) ? X.avoid.rects : []; }
X.avoidAdd = (to, rect) => {
  if (X.avoid.for !== keyOf(to)) X.avoid = { for: keyOf(to), rects: [] };
  const inR = (p) => p && p.lat >= rect.s && p.lat <= rect.n && p.lon >= rect.w && p.lon <= rect.e;
  if (inR(to) || inR(S.pos)) return 'inside';
  if (X.avoid.rects.some((r) => r.id === rect.id)) return 'dup';
  if (X.avoid.rects.length >= 10) return 'full';
  X.avoid.rects.push(rect); X.altIdx = 0; return 'ok';
};
X.avoidClear = (to) => { if (!to || X.avoid.for === keyOf(to)) X.avoid = { for: null, rects: [] }; };
X.avoidList = (to) => avoidFor(to);
X.recalc = (d) => viaChanged(d);
async function ttRoutes(from, to, vias) {
  const locs = [from].concat(vias, [to]).map((p) => p.lat.toFixed(6) + ',' + p.lon.toFixed(6)).join(':');
  const rects = avoidFor(to);
  const key = locs + '|' + JSON.stringify(X.opts) + '|' + JSON.stringify(A.veh ? [A.veh().type, A.veh().dims, A.veh().hazmat] : '') + '|' + JSON.stringify(rects);
  let routes;
  const hit = routeCache.get(key);
  if (hit && Date.now() - hit.at < 90000) routes = hit.routes;
  else {
    const avoid = [];
    if (X.opts.tolls) avoid.push('tollRoads');
    if (X.opts.motorways) avoid.push('motorways');
    const vv = A.veh ? A.veh() : {}, vd = vv.dims || {};
    const vp = {};
    if (from.hd != null) vp.vehicleHeading = from.hd; // recalcul : on part dans le sens où roule la voiture
    if (vv.two) { vp.travelMode = 'motorcycle'; if (vv.cyclo) { vp.vehicleMaxSpeed = 45; if (!avoid.includes('motorways')) avoid.push('motorways'); } } // #005 : moto et scooter 45 km/h (sans autoroute)
    if (vv.heavy) {
      vp.travelMode = vv.costing === 'bus' ? 'bus' : vv.costing === 'auto' ? 'car' : 'truck';
      if (vd.height) vp.vehicleHeight = vd.height; if (vd.width) vp.vehicleWidth = vd.width; if (vd.length) vp.vehicleLength = vd.length;
      if (vd.weight) vp.vehicleWeight = Math.round(vd.weight * 1000);
      vp.vehicleCommercial = (vv.type === 'camping' || vv.type === 'remorque') ? 'false' : 'true';
      if (vv.hazmat) vp.vehicleLoadType = 'otherHazmatGeneral';
    }
    let url = tt('/routing/1/calculateRoute/' + locs + '/json', Object.assign({ traffic: 'true', travelMode: 'car', routeType: 'fastest', instructionsType: 'coded', language: LANG, computeTravelTimeFor: 'all', maxAlternatives: vias.length ? '0' : '2', routeRepresentation: 'polyline' }, vp));
    if (X.opts.fun && !vv.heavy) url = url.replace('routeType=fastest', 'routeType=thrilling') + '&hilliness=normal&windingness=high';
    avoid.forEach((a) => { url += '&avoid=' + a; });
    url += '&sectionType=speedLimit&sectionType=lanes';
    if (X.opts.vignette) url += '&avoidVignette=CHE,AUT,SVN,HUN,CZE,SVK,BGR,ROU,MDA';
    // zones à éviter (route fermée, travaux, ZFE) : rectangles envoyés à TomTom
    const body = rects.length ? { avoidAreas: { rectangles: rects.slice(0, 10).map((r) => ({ southWestCorner: { latitude: r.s, longitude: r.w }, northEastCorner: { latitude: r.n, longitude: r.e } })) } } : null;
    const j = await getJson(url, 9000, body);
    if (!j.routes || !j.routes.length) throw new Error('no route');
    routes = j.routes.map(convertTT);
    routeCache.set(key, { at: Date.now(), routes });
    if (routeCache.size > 8) routeCache.delete(routeCache.keys().next().value);
  }
  return routes;
}
X.route = async (from, to) => {
  if (!TT) return null;
  if (X.via.length && X.viaFor !== keyOf(to)) { X.via = []; X.viaFor = null; }
  const vias = X.via.filter((v) => !v.done && dist(from, v) > 120);
  const routes = await ttRoutes(from, to, vias);
  const R = routes[Math.min(X.altIdx, routes.length - 1)];
  R.alts = routes.map((r) => ({ duration: r.duration, total: r.total, delay: r.trafficDelay }));
  R.altIdx = Math.min(X.altIdx, routes.length - 1);
  R.viaCount = vias.length;
  R.avoidN = avoidFor(to).length;
  return R;
};
X.preview = (R, dest, body) => {
  const go = body.querySelector('#goNav'); if (!go) return;
  const box = el('<div class="routex"></div>');
  if (R.tomtom) {
    const m = [...body.querySelectorAll('p.muted.small')].find((p) => /trafic/.test(p.textContent)); if (m) m.textContent = 'Durée calculée avec le trafic en direct (TomTom).';
    if (R.trafficDelay > 90) box.appendChild(el('<div class="banner warnb">' + ic('info') + '<span>Bouchons sur le trajet : <b>+' + fmtDur(R.trafficDelay) + '</b>.</span></div>'));
  }
  if (R.alts && R.alts.length > 1) {
    const seg = el('<div class="altlist"></div>');
    R.alts.forEach((a, i) => {
      const b = el('<button class="altbtn' + (i === R.altIdx ? ' on' : '') + '"><b>' + fmtDur(a.duration) + '</b><span>' + fmtDist(a.total) + (a.delay > 90 ? ' · +' + fmtDur(a.delay) + ' bouchons' : '') + '</span></button>');
      b.onclick = () => { X.altIdx = i; chooseDestination(dest); };
      seg.appendChild(b);
    });
    box.appendChild(el('<h3>Itinéraires</h3>')); box.appendChild(seg);
  }
  if (TT) {
    const opt = (k, t) => '<label class="avoidchip"><input type="checkbox" data-o="' + k + '"' + (X.opts[k] ? ' checked' : '') + '><span>' + esc(TRX(t)) + '</span></label>';
    const o = el('<div class="avoid">' + opt('tolls', 'Éviter péages') + opt('motorways', 'Éviter autoroutes') + opt('vignette', 'Sans vignette') + (!(A.veh && A.veh().heavy) ? opt('fun', 'Route plaisir (virages, sans autoroute)') : '') + '</div>');
    o.querySelectorAll('input').forEach((c) => { c.onchange = () => { X.opts[c.dataset.o] = c.checked; store.set('routa.ropts', X.opts); X.altIdx = 0; chooseDestination(dest); }; });
    box.appendChild(o);
  }
  box.appendChild(viaBox(dest, R));
  if (!/parking/i.test(dest.sub || '')) { const pb = el('<button class="btn soft block">' + ic('parking') + esc(TRX('Parkings près de la destination')) + '</button>'); pb.onclick = () => X.parkingsNear(dest); box.appendChild(pb); }
  if (R.total > 30000 && (!R.mode || R.mode === 'car')) { const rb = el('<button class="btn soft block">' + ic(A.veh && A.veh().ev ? 'charge' : 'fuel') + esc(TRX('Autonomie sur ce trajet')) + ' <span class="prem">PRO</span></button>'); rb.onclick = () => X.rangeAssist(R, dest); box.appendChild(rb); }
  if (X.cityStops && (R.duration || 0) > 18000 && (!R.mode || R.mode === 'car')) { const cb = el('<button class="btn soft block">' + esc(TRX('Villes-étapes')) + ' <span class="prem">PRO</span></button>'); cb.onclick = () => X.cityStops(R, dest); box.appendChild(cb); }
  if (X.planSave) { const pb2 = el('<button class="btn soft block">' + '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>' + esc(TRX('Planifier ce voyage')) + ' <span class="prem">PRO</span></button>'); pb2.onclick = () => X.planSave(R, dest); box.appendChild(pb2); }
  if ((R.duration || 0) > 7200 && (!R.mode || R.mode === 'car')) { const bb = el('<button class="btn soft block">' + ic('truckstop') + esc(TRX('Pauses conseillées sur le trajet')) + ' <span class="prem">PRO</span></button>'); bb.onclick = () => X.smartBreaks(R, dest); box.appendChild(bb); }
  if (X.borderCheck && (!R.mode || R.mode === 'car')) X.borderCheck(R, dest, box);
  go.parentNode.insertBefore(box, go.nextSibling);
};
/* #028 (Premium, étiquette seulement) : autonomie selon le niveau actuel et l'autonomie à plein indiqués par l'utilisateur (aucune consommation inventée) */
X.rangeAssist = (R, dest) => {
  const ev = !!(A.veh && A.veh().ev), vid = store.get('routa.vehicleId', 'v'), key = 'routa.range.' + vid;
  const cfg = store.get(key, { full: '', level: '' });
  const body = openSheet(TRX('Autonomie sur ce trajet'),
    '<p class="muted small">' + esc(ev ? TRX('Indique la charge actuelle et l\'autonomie réelle de ton véhicule à 100 % (celle que tu constates, pas celle du catalogue).') : TRX('Indique le niveau actuel du réservoir et l\'autonomie réelle de ton véhicule avec le plein (celle que tu constates, pas celle du catalogue).')) + '</p>' +
    '<label class="field" for="rgLevel"><span>' + esc(ev ? TRX('Charge actuelle (%)') : TRX('Niveau du réservoir (%)')) + '</span><input id="rgLevel" type="number" inputmode="numeric" min="1" max="100" value="' + esc(cfg.level) + '"></label>' +
    '<label class="field" for="rgFull"><span>' + esc(ev ? TRX('Autonomie à 100 % (km)') : TRX('Autonomie avec le plein (km)')) + '</span><input id="rgFull" type="number" inputmode="numeric" min="20" max="3000" value="' + esc(cfg.full) + '"></label>' +
    '<button class="btn block" id="rgCalc">' + esc(TRX('Calculer')) + '</button><div id="rgOut"></div>', 'range');
  const out = body.querySelector('#rgOut');
  const calc = async () => {
    const level = +body.querySelector('#rgLevel').value, full = +body.querySelector('#rgFull').value;
    if (!(level > 0 && level <= 100 && full >= 20)) { out.innerHTML = '<p class="muted">' + esc(TRX('Remplis les deux champs.')) + '</p>'; return; }
    store.set(key, { full, level });
    const avail = full * level / 100, need = R.total / 1000, reserve = full * (ev ? 0.15 : 0.1), left = avail - need;
    if (left >= reserve) { out.innerHTML = '<div class="banner">' + ic('flag') + '<span>' + esc(TRX('Ça passe : il devrait te rester environ {k} km à l\'arrivée.', { k: Math.round(left) })) + '</span></div><p class="muted small">' + esc(TRX('Estimation simple : autoroute, froid, relief, charge et climatisation peuvent réduire l\'autonomie.')) + '</p>'; return; }
    const stopKm = Math.max(5, avail - reserve);
    const C = R.coords; let acc = 0, idx = C.length - 1;
    for (let i = 1; i < C.length; i++) { acc += dist(C[i - 1], C[i]); if (acc / 1000 >= stopKm) { idx = i; break; } }
    const pt = C[idx];
    out.innerHTML = '<div class="banner warnb">' + ic('info') + '<span>' + esc(left < 0 ? TRX('Pas assez pour arriver : il manque environ {k} km.', { k: Math.round(-left) }) : TRX('Tu arriverais presque à vide.')) + ' ' + esc(TRX('Arrêt conseillé avant le km {k}.', { k: Math.round(stopKm) })) + '</span></div><p class="muted">' + esc(TRX('Recherche des stations…')) + '</p>';
    let res = [];
    try { const j = await getJson(tt('/search/2/nearbySearch/.json', { lat: pt.lat, lon: pt.lon, radius: 10000, categorySet: ev ? '7309' : '7311', limit: 20, language: LANG }), 9000); res = (j.results || []).map((r) => ({ name: (r.poi && r.poi.name) || (ev ? TRX('Borne') : TRX('Station')), lat: r.position.lat, lon: r.position.lon })); } catch (e) { res = []; }
    if (S.sheetView !== 'range') return;
    const back = C.slice(Math.max(0, idx - 600), idx + 1);
    res = res.map((x) => Object.assign(x, { off: Math.min(...back.filter((_, k) => k % 3 === 0).map((c) => dist(x, c))) })).filter((x) => x.off < 2000).sort((a, b) => a.off - b.off).slice(0, 5);
    out.querySelector('p.muted').outerHTML = res.length ? res.map((x, i) => '<button class="card tap" data-i="' + i + '"><span class="ico" style="background:' + (ev ? '#2E7D5B' : '#E8590C') + '">' + ic(ev ? 'charge' : 'fuel') + '</span><span class="grow"><b>' + esc(x.name) + '</b><span class="sub">' + esc(TRX('{d} du trajet', { d: fmtDist(x.off) })) + '</span></span><span class="val small">' + esc(TRX('Ajouter')) + '</span></button>').join('') : '<p class="muted small">' + esc(TRX('Aucune station trouvée près de ce point : cherche plus tôt sur le trajet.')) + '</p>';
    out.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const x = res[+b.dataset.i]; X.addVia({ name: x.name, lat: x.lat, lon: x.lon }, dest); }; });
    out.appendChild(el('<p class="muted small">' + esc(TRX('Estimation simple : autoroute, froid, relief, charge et climatisation peuvent réduire l\'autonomie.')) + '</p>'));
  };
  body.querySelector('#rgCalc').onclick = calc;
  if (cfg.full && cfg.level) calc();
};
/* #041 (Premium, étiquette seulement) : pauses environ toutes les 2 h de conduite (conseil TCS), aires réelles OSM ajoutables comme étape */
X.smartBreaks = async (R, dest) => {
  const body = openSheet(TRX('Pauses conseillées'), '<p class="muted">' + esc(TRX('Recherche des aires sur ton trajet…')) + '</p>', 'breaks');
  const C = R.coords, cum = [0];
  for (let i = 1; i < C.length; i++) cum.push(cum[i - 1] + dist(C[i - 1], C[i]));
  const tot = cum[cum.length - 1] || 1, dur = R.duration, stops = [];
  for (let t = 7200; t < dur - 1200; t += 7200) { const target = tot * t / dur; let i = cum.findIndex((d) => d >= target); if (i < 0) i = C.length - 1; stops.push({ t, i, lat: C[i].lat, lon: C[i].lon }); }
  if (!stops.length) { body.innerHTML = '<p class="muted">' + esc(TRX('Trajet court : pas de pause particulière à prévoir.')) + '</p>'; return; }
  const v = A.veh ? A.veh() : {}, ev = !!v.ev;
  const around = (k) => stops.map((p) => k + '(around:9000,' + p.lat.toFixed(4) + ',' + p.lon.toFixed(4) + ');').join('');
  const q = '[out:json][timeout:25];(' + around('nwr["highway"~"^(services|rest_area)$"]') + ');out center tags 200;';
  let items = null, src = 'OpenStreetMap';
  if (TT) {
    try {
      const rs = await Promise.all(stops.map((p) => getJson(tt('/search/2/nearbySearch/.json', { lat: p.lat, lon: p.lon, radius: 12000, categorySet: '7395', limit: 25, language: LANG }), 9000).catch(() => ({ results: [] }))));
      items = [].concat(...rs.map((j) => (j.results || []).map((r) => ({ lat: r.position.lat, lon: r.position.lon, name: (r.poi && r.poi.name) || TRX('Aire de repos'), t: { highway: /service|raststätte|autogrill|area di servizio/i.test((r.poi && r.poi.name) || '') ? 'services' : 'rest_area' } }))));
      if (items.length) src = 'TomTom'; else items = null;
    } catch (e) { items = null; }
  }
  if (!items) {
    let els = null;
    try { els = await Promise.race([A.overpass(q, stops.every((p) => A.inCH && A.inCH(p))), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 30000))]); } catch (e) { els = null; }
    if (els) items = els.map((e) => { const c = e.center || e; const t = e.tags || {}; return { lat: c.lat, lon: c.lon, t, name: t.name || (t.highway === 'services' ? TRX('Aire de service') : TRX('Aire de repos')) }; }).filter((x) => x.lat != null);
  }
  if (S.sheetView !== 'breaks') return;
  if (!items) { body.innerHTML = '<p class="muted">' + esc(TRX('Données indisponibles pour le moment. Réessaie plus tard.')) + '</p>'; return; }
  const per = stops.map((p) => {
    const near = items.map((x) => Object.assign({}, x, { d: dist(x, p), onRoute: (() => { let m = Infinity; for (let j = Math.max(0, p.i - 400); j < Math.min(C.length, p.i + 400); j += 3) m = Math.min(m, dist(x, C[j])); return m; })() }))
      .filter((x) => x.onRoute < 1500).sort((a, b) => (b.t.highway === 'services') - (a.t.highway === 'services') || a.d - b.d);
    const seen = new Set(); return near.filter((x) => { const k = x.name + Math.round(x.lat * 100); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
  });
  const fmtT = (sec) => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : ''); };
  const feat = (t) => [t.highway === 'services' ? TRX('Restauration et carburant') : '', t.toilets === 'yes' || t.amenity === 'toilets' ? TRX('Toilettes') : '', ev && t['charging_station'] === 'yes' ? TRX('Recharge') : ''].filter(Boolean).join(' · ');
  const list = [];
  body.innerHTML = '<p class="muted small">' + esc(TRX('Le TCS conseille de ne pas conduire plus de 2 heures d\'affilée et de s\'arrêter dès les premiers signes de fatigue.')) + '</p>' + stops.map((p, k) => '<h3>' + esc(TRX('Pause vers {t} de route', { t: fmtT(p.t) })) + ' · km ' + Math.round(R.total * p.t / dur / 1000) + '</h3>' +
    (per[k].length ? per[k].map((x) => { list.push(x); return '<button class="card tap" data-i="' + (list.length - 1) + '"><span class="ico" style="background:#2E7D5B">' + ic('truckstop') + '</span><span class="grow"><b>' + esc(x.name) + '</b><span class="sub">' + esc([fmtDist(x.d) + ' ' + TRX('du point de pause'), feat(x.t)].filter(Boolean).join(' · ')) + '</span></span><span class="val small">' + esc(TRX('Ajouter')) + '</span></button>'; }).join('') : '<p class="muted small">' + esc(TRX('Aucune aire connue près de ce point : prévois un arrêt dans une localité proche.')) + '</p>')).join('') +
    '<p class="muted small">' + esc(TRX('Source : OpenStreetMap. Les équipements peuvent être incomplets.')).replace('OpenStreetMap', src) + '</p>';
  body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const x = list[+b.dataset.i]; X.addVia({ name: x.name, lat: x.lat, lon: x.lon }, dest); }; });
};
setInterval(() => {
  if (!S.nav || !S.pos || !X.via.length) return;
  const v = X.via.find((x) => !x.done);
  if (v && dist(S.pos, v) < 80) { v.done = true; toast('Étape atteinte : <b>' + esc(v.name) + '</b>'); say('Étape atteinte'); }
}, 3000);

/* ======================= Étapes : restos, essence ou adresse sur le trajet, ordre, détour ======================= */
const MAX_VIA = 5;
const routeDest = () => (S.nav && S.nav.dest) || (S.preview && S.preview.dest) || null;
const curRoute = () => (S.nav && S.nav.R) || (S.preview && S.preview.R) || null;
const openVias = (d) => (d && X.via.length && X.viaFor === keyOf(d) ? X.via.filter((v) => !v.done) : []);
X.viasFor = (d) => openVias(d).map((v) => ({ name: v.name, lat: v.lat, lon: v.lon }));
X.setVias = (d, list) => { X.via = (list || []).map((v) => ({ name: v.name, lat: v.lat, lon: v.lon })); X.viaFor = keyOf(d); X.altIdx = 0; };
function nearIdx(R, p) { let b = 0, bd = Infinity; for (let i = 0; i < R.coords.length; i += 2) { const x = dist(R.coords[i], p); if (x < bd) { bd = x; b = i; } } return b; }
function viaChanged(d) {
  X.altIdx = 0;
  if (S.nav) { A.saveActiveNav(); A.reroute(); } else chooseDestination(d);
}
X.addVia = (p, fin) => {
  const d = fin || routeDest(); if (!d || !p || p.lat == null) return;
  if (X.viaFor !== keyOf(d)) { X.via = []; X.viaFor = keyOf(d); }
  X.via = X.via.filter((v) => !v.done);
  if (X.via.length >= MAX_VIA) { toast(esc(TRX('{n} étapes au maximum.', { n: MAX_VIA }))); return; }
  if (dist(p, d) < 60 || X.via.some((v) => dist(v, p) < 40)) { toast(esc(TRX('Cette étape est déjà sur le trajet.'))); return; }
  const v = { name: String(p.name || TRX('Point choisi')).slice(0, 60), lat: p.lat, lon: p.lon };
  const R = curRoute();
  let at = X.via.length;
  if (R && R.coords && R.coords.length > 1 && X.via.length) { const k = nearIdx(R, v); const j = X.via.findIndex((x) => nearIdx(R, x) > k); if (j >= 0) at = j; }
  X.via.splice(at, 0, v);
  closeSheet(); A.clearPois();
  toast(TRX('Étape ajoutée : {n}', { n: '<b>' + esc(v.name) + '</b>' }));
  viaChanged(d);
};
function viaList(d, onChange) {
  const vv = openVias(d);
  const wrap = el('<div class="vialist"></div>');
  if (!vv.length) { wrap.appendChild(el('<p class="muted small">' + esc(TRX('Aucune étape pour le moment.')) + '</p>')); return wrap; }
  vv.forEach((v, i) => {
    const c = el('<div class="card"><div class="ico" style="background:#4DA3FF">' + (i + 1) + '</div><div class="grow"><b>' + esc(v.name) + '</b></div>' +
      '<button class="iconbtn small" data-a="up" aria-label="' + esc(TRX('Monter')) + '"' + (i === 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>' +
      '<button class="iconbtn small" data-a="down" aria-label="' + esc(TRX('Descendre')) + '"' + (i === vv.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>' +
      '<button class="iconbtn small" data-a="rm" aria-label="' + esc(TRX('Retirer')) + '">' + ic('trash') + '</button></div>');
    c.querySelectorAll('button').forEach((b) => { b.onclick = () => {
      const list = X.via.filter((x) => !x.done); const k = list.indexOf(v);
      if (b.dataset.a === 'rm') list.splice(k, 1);
      else { const j = b.dataset.a === 'up' ? k - 1 : k + 1; if (j < 0 || j >= list.length) return; list[k] = list[j]; list[j] = v; }
      X.via = list; onChange();
    }; });
    wrap.appendChild(c);
  });
  return wrap;
}
function aheadRoute() {
  const N = S.nav; const R = N && N.R; if (!R) return curRoute();
  const i = Math.max(0, Math.min((N.seg || 0), R.coords.length - 2));
  return { coords: R.coords.slice(i), total: Math.max(1000, R.total - (N.along || 0)) };
}
function viaActions(d) {
  const v = A.veh ? A.veh() : {};
  // une seule rangée de recherches sur le trajet (restos, carburant ou bornes, aires PL) : pas de doublon avec l'aperçu
  const bt = (k, icon, t) => '<button class="btn soft" data-k="' + k + '">' + ic(icon) + '<span>' + esc(TRX(t)) + '</span></button>';
  const row = el('<div class="viaact">' + bt('food', 'food', 'Restos sur le trajet') +
    (v.type !== 'electrique' ? bt('fuel', 'fuel', v.isHgv ? 'Carburant PL sur le trajet' : 'Essence sur le trajet') : '') +
    (v.ev ? bt('charge', 'charge', 'Bornes sur le trajet') : '') +
    (v.heavy ? bt('truckstop', 'truckstop', 'Aires sur le trajet') : '') + '</div>');
  row.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { const R = S.nav ? aheadRoute() : curRoute(); if (!R) return; if (S.nav) closeSheet(); A.alongRoute(R, b.dataset.k); }; });
  const add = el('<button class="btn soft block">' + ic('plus') + esc(TRX('Ajouter une adresse')) + '</button>');
  add.onclick = () => { if (X.via.filter((x) => !x.done && X.viaFor === keyOf(d)).length >= MAX_VIA) { toast(esc(TRX('{n} étapes au maximum.', { n: MAX_VIA }))); return; } A.pickVia(d); };
  const f = el('<div class="viaactwrap"></div>'); f.appendChild(row); f.appendChild(add);
  return f;
}
async function showDetour(R, d, line) {
  try {
    if (!TT || !S.pos || !R.viaCount) return;
    const base = (await ttRoutes(S.pos, d, []))[0];
    const dt = R.duration - base.duration, dd = R.total - base.total;
    // distance affichée seulement si elle compte vraiment (au moins 500 m de plus) ; sinon seulement le temps
    line.textContent = dt < 60 && dd < 500 ? TRX('Détour négligeable') : dd >= 500 ? TRX('Détour : +{t} · +{d}', { t: fmtDur(Math.max(60, dt)), d: fmtDist(dd) }) : TRX('Détour : +{t}', { t: fmtDur(Math.max(60, dt)) });
    line.hidden = false;
  } catch (e) { /* détour inconnu : on n'affiche rien plutôt qu'un chiffre faux */ }
}
function viaBox(dest, R) {
  const box = el('<div class="viabox"><h3>' + esc(TRX('Étapes')) + '</h3></div>');
  const vv = openVias(dest);
  if (vv.length && !R.viaCount) box.appendChild(el('<div class="banner warnb">' + ic('info') + '<span>' + esc(TRX('Les étapes n\'ont pas pu être prises en compte pour ce calcul. Réessaie dans un instant.')) + '</span></div>'));
  box.appendChild(viaList(dest, () => chooseDestination(dest)));
  if (vv.length) { const line = el('<p class="muted small" hidden></p>'); box.appendChild(line); showDetour(R, dest, line); }
  box.appendChild(viaActions(dest));
  return box;
}
/* Pendant la navigation : la barre du bas ouvre le trajet (étapes, restos et essence sur la route) */
X.openTrip = () => {
  const N = S.nav; if (!N || (N.mode && N.mode !== 'car')) return;
  const d = N.dest;
  const moving = (S.speed || 0) * 3.6 > 15;
  const body = openSheet(TRX('Trajet'),
    (moving ? '<div class="banner proto">' + ic('info') + '<span>' + esc(TRX('Au volant, ne touche pas ton téléphone : demande à un passager, utilise le micro ou arrête-toi.')) + '</span></div>' : '') +
    '<div class="card"><div class="ico" style="background:#FF8A3D">' + IC.flag + '</div><div class="grow"><b>' + esc(d.name) + '</b><div class="sub">' + esc(($('etaMin') || {}).textContent || '') + ' ' + esc(($('etaRest') || {}).textContent || '') + '</div></div></div>' +
    '<h3>' + esc(TRX('Étapes')) + '</h3><div id="tripVias"></div>', 'trip');
  const draw = () => { const h = body.querySelector('#tripVias'); if (!h) return; h.innerHTML = ''; h.appendChild(viaList(d, () => { viaChanged(d); draw(); })); };
  draw();
  body.appendChild(viaActions(d));
};
setTimeout(function tripHook() {
  const info = document.querySelector('#navBar .navbar-info'); if (!info) return;
  info.classList.add('tripinfo'); info.setAttribute('role', 'button'); info.tabIndex = 0;
  info.appendChild(el('<div class="tripchip">' + ic('plus') + '<span>' + esc(TRX('Étape')) + '</span></div>'));
  info.addEventListener('click', () => X.openTrip());
  info.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); X.openTrip(); } });
}, 0);
X.poiVia = (p, body) => {
  const d = routeDest(); const go = body.querySelector('#poiGo');
  if (!d || !go || dist(p, d) < 60) return;
  const b = el('<button class="btn soft block" id="poiVia">' + ic('plus') + esc(TRX('Ajouter comme étape')) + '</button>');
  b.onclick = () => X.addVia({ name: p.name, lat: p.lat, lon: p.lon }, d);
  go.parentNode.insertBefore(b, go.nextSibling);
};

/* ======================= Voies à suivre (comme Google Maps / Waze) ======================= */
const LANE_P = {
  STRAIGHT: '<path d="M12 21V5"/><path d="M7 10l5-5 5 5"/>',
  SLIGHT: '<path d="M10 21v-6l6-8"/><path d="M11 6.5l5.2.3.3 5.2"/>',
  TURN: '<path d="M8 21v-8a4 4 0 0 1 4-4h7"/><path d="M15 5l4 4-4 4"/>',
  SHARP: '<path d="M9 3v8l8 8"/><path d="M11 19.5h6.5V13"/>',
  U: '<path d="M16 21V10a4 4 0 0 0-8 0v5"/><path d="M4 11l4 4 4-4"/>'
};
const laneSvg = (dir) => {
  const d = dir || 'STRAIGHT', left = /LEFT/.test(d);
  const k = d === 'STRAIGHT' ? 'STRAIGHT' : /SLIGHT/.test(d) ? 'SLIGHT' : /SHARP/.test(d) ? 'SHARP' : /U_TURN/.test(d) ? 'U' : /LEFT|RIGHT/.test(d) ? 'TURN' : 'STRAIGHT';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><g' + (left ? ' transform="translate(24 0) scale(-1 1)"' : '') + '>' + LANE_P[k] + '</g></svg>';
};
// côté de la manœuvre annoncée dans le bandeau
const sideOf = (m) => { const x = (m && m.modifier) || ''; return /left/.test(x) ? 'L' : /right/.test(x) ? 'R' : 'S'; };
const sideDir = (d) => (/LEFT/.test(d || '') ? 'L' : /RIGHT/.test(d || '') ? 'R' : 'S');
let laneEl = null, laneKey = '';
setInterval(() => {
  const N = S.nav, box = $('navBanner');
  if (!laneEl && box) { laneEl = el('<div class="lanebar" id="laneBar" hidden aria-label="' + TRX('Voies à suivre') + '"></div>'); (box.querySelector('.navmain') || box).appendChild(laneEl); }
  if (!laneEl) return;
  const hide = () => { laneEl.hidden = true; laneKey = ''; };
  if (!N || !N.R || !N.R.lanes || !N.R.stepEnds) return hide();
  const R = N.R, along = N.along || 0;
  // seulement les voies de la PROCHAINE manœuvre affichée dans le bandeau, à moins de 700 m
  let i = R.stepEnds.findIndex((e) => e > along + 3); if (i < 0) return hide();
  const mpos = R.stepEnds[i], next = R.steps[i + 1];
  if (!next || mpos - along > 700) return hide();
  const sec = R.lanes.find((s) => s.s <= mpos + 30 && s.e >= mpos - 120 && s.e > along);
  if (!sec) return hide();
  // les voies conseillées doivent aller du même côté que la flèche du bandeau, sinon on n'affiche rien (pas d'info contradictoire)
  const side = sideOf(next.maneuver);
  const follow = sec.lanes.filter((l) => l.follow);
  if (!follow.length || follow.length === sec.lanes.length) return hide();
  if (follow.some((l) => sideDir(l.follow) !== side && !(side === 'S' && sideDir(l.follow) !== 'S' && /SLIGHT/.test(l.follow)))) return hide();
  const key = sec.s + '|' + sec.e;
  if (key !== laneKey) {
    laneKey = key;
    laneEl.innerHTML = sec.lanes.map((l) => { const on = !!l.follow; const d = on ? l.follow : (l.dirs[0] || 'STRAIGHT'); return '<span class="lane' + (on ? ' on' : '') + '">' + laneSvg(d) + '</span>'; }).join('');
  }
  laneEl.hidden = false;
}, 1000);

/* ======================= Limites de vitesse sur tout le trajet ======================= */
let limNextEl = null, limSaidFor = -1, limShownCur = null;
function limNextBox() {
  if (limNextEl) return limNextEl;
  limNextEl = el('<div id="limitNext" class="limitnext" hidden><span class="ln-sign"></span><span class="ln-dist"></span></div>');
  document.body.appendChild(limNextEl); return limNextEl;
}
setInterval(() => {
  const N = S.nav, box = limNextBox();
  const wantLim = S.settings.showLimit || S.settings.overSign !== false || S.settings.limitAhead !== false;
  if (!N || !N.R || !N.R.limits || !wantLim) { box.hidden = true; limShownCur = null; return; }
  const L = N.R.limits, i = Math.max(0, Math.min(N.seg || 0, L.length - 1));
  let cur = L[i];
  if (cur == null) { for (let k = i; k >= 0 && k > i - 20; k--) if (L[k]) { cur = L[k]; break; } }
  if (cur !== S.limit) { S.limit = cur; if (A.updateSpeed) A.updateSpeed(); }
  const vc = window.ROUTA_VCAP ? window.ROUTA_VCAP() : null;
  const cap = (l) => (l && vc ? Math.min(l, vc) : l);
  const ccur = cap(cur);
  if (ccur && limShownCur && ccur !== limShownCur && ccur < limShownCur) vibrate(40);
  limShownCur = ccur;
  let j = i; while (j < L.length && (cap(L[j]) === ccur || L[j] == null)) j++;
  const d = j < L.length ? N.R.cum[j] - (N.along || 0) : Infinity;
  const nx = j < L.length ? cap(L[j]) : null;
  // baisse de limitation à venir : affichée assez tôt selon la vitesse (environ 12 s avant), sans nouveau son
  const ahead = Math.max(200, Math.min(900, (S.speed || 0) * 12));
  if (S.settings.limitAhead !== false && nx && ccur && nx < ccur && d > 0 && d < ahead) {
    box.hidden = false; box.querySelector('.ln-sign').textContent = nx; box.querySelector('.ln-dist').textContent = TRX('dans {d}', { d: fmtDist(Math.round(d / 10) * 10) });
    if (ccur && nx < ccur && d < 350 && limSaidFor !== j && S.settings.speedAlert) { limSaidFor = j; say('Limitation à ' + nx + ' dans ' + (d < 100 ? 'quelques mètres' : Math.round(d / 50) * 50 + ' mètres')); }
  } else box.hidden = true;
}, 1000);

/* ======================= Météo sur le trajet et cols ======================= */
const WMO = (c) => c === 0 ? 'Ciel clair' : c <= 2 ? 'Peu nuageux' : c === 3 ? 'Couvert' : c <= 48 ? 'Brouillard' : c <= 57 ? 'Bruine' : c <= 67 ? 'Pluie' : c <= 77 ? 'Neige' : c <= 82 ? 'Averses' : c <= 86 ? 'Averses de neige' : 'Orage';
async function meteo(points) {
  const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + points.map((p) => p.lat.toFixed(3)).join(',') + '&longitude=' + points.map((p) => p.lon.toFixed(3)).join(',') + '&current=temperature_2m,weather_code,snowfall,precipitation,wind_speed_10m&daily=snowfall_sum,temperature_2m_min&forecast_days=1&timezone=auto';
  const j = await getJson(u, 8000);
  return Array.isArray(j) ? j : [j];
}
async function routeWeather(R, box) {
  if (!R || !R.coords || R.total < 8000) return;
  const n = 4, pts = [];
  for (let i = 0; i <= n; i++) pts.push(R.coords[Math.round(i * (R.coords.length - 1) / n)]);
  try {
    const w = await meteo(pts);
    const temps = w.map((x) => x.current.temperature_2m); const min = Math.min(...temps), max = Math.max(...temps);
    const snow = w.some((x) => (x.current.snowfall || 0) > 0 || /Neige/.test(WMO(x.current.weather_code)));
    const ice = min <= 1;
    const html = '<div class="banner' + (snow || ice ? ' warnb' : '') + '">' + IC.mount + '<span><b>Météo sur le trajet :</b> ' + Math.round(min) + '° à ' + Math.round(max) + '°, ' + WMO(w[w.length - 1].current.weather_code).toLowerCase() + ' à l\'arrivée.' + (snow ? ' <b>Neige sur une partie du trajet.</b>' : ice ? ' <b>Risque de verglas.</b>' : '') + '</span></div>';
    const node = el(html); const more = el('<button class="linkbtn wxmore">' + esc(TRX('Météo détaillée aux heures de passage')) + ' <span class="prem">PRO</span></button>');
    more.onclick = () => X.routeWeatherDetail(R); node.querySelector('span').appendChild(more);
    box.insertBefore(node, box.firstChild);
  } catch (e) { /* météo indisponible */ }
}
/* #030 (Premium, étiquette seulement) : prévision horaire aux lieux et heures de passage, avec probabilité de pluie */
X.routeWeatherDetail = async (R, offH) => {
  offH = offH || 0;
  const body = openSheet(TRX('Météo sur le trajet'), '<p class="muted">' + esc(TRX('Chargement…')) + '</p>', 'wxroute');
  const C = R.coords, cum = [0];
  for (let i = 1; i < C.length; i++) cum.push(cum[i - 1] + dist(C[i - 1], C[i]));
  const tot = cum[cum.length - 1] || 1, n = R.total > 150000 ? 7 : 5, pts = [];
  for (let k = 0; k <= n; k++) { const target = tot * k / n; let i = cum.findIndex((d) => d >= target); if (i < 0) i = C.length - 1; pts.push({ lat: C[i].lat, lon: C[i].lon, km: R.total * k / n, t: Date.now() + offH * 3600000 + (R.duration || 0) * 1000 * k / n }); }
  let w;
  try {
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + pts.map((p) => p.lat.toFixed(3)).join(',') + '&longitude=' + pts.map((p) => p.lon.toFixed(3)).join(',') + '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m,snowfall&forecast_days=3&timeformat=unixtime';
    w = await getJson(u, 10000); if (!Array.isArray(w)) w = [w];
  } catch (e) { w = null; }
  if (S.sheetView !== 'wxroute') return;
  const seg = '<div class="seg" id="wxOff">' + [0, 1, 3, 6].map((h) => '<button data-h="' + h + '"' + (h === offH ? ' class="on"' : '') + '>' + esc(h ? TRX('Départ dans {h} h', { h }) : TRX('Départ maintenant')) + '</button>').join('') + '</div>';
  if (!w) { body.innerHTML = seg + '<p class="muted">' + esc(TRX('Données indisponibles pour le moment. Réessaie plus tard.')) + '</p>'; }
  else {
    body.innerHTML = seg + pts.map((p, k) => {
      const h = w[k] && w[k].hourly; if (!h) return '';
      const ts = p.t / 1000; let j = 0, best = Infinity; h.time.forEach((t, i) => { const d = Math.abs(t - ts); if (d < best) { best = d; j = i; } });
      const code = h.weather_code[j], pp = h.precipitation_probability[j], gust = h.wind_gusts_10m[j], tmp = h.temperature_2m[j], snow = h.snowfall[j] > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86;
      const warn = snow || tmp <= 1 || gust >= 70 || code >= 95;
      const when = new Date(p.t).toLocaleTimeString(A.I18N.lang === 'en' ? 'en-GB' : A.I18N.lang === 'sr' ? 'sr-Latn' : A.I18N.lang, { hour: '2-digit', minute: '2-digit' });
      return '<div class="card' + (warn ? ' wxwarn' : '') + '"><div class="grow"><b>' + (k === 0 ? esc(TRX('Départ')) : k === n ? esc(TRX('Arrivée')) : 'km ' + Math.round(p.km / 1000)) + ' · ' + when + '</b><div class="sub">' + esc(TRX(WMO(code))) + ' · ' + esc(TRX('Pluie : {p} % de probabilité', { p: pp == null ? '?' : pp })) + ' · ' + esc(TRX('Rafales {v} km/h', { v: Math.round(gust || 0) })) + (snow ? ' · <b>' + esc(TRX('Neige')) + '</b>' : tmp <= 1 ? ' · <b>' + esc(TRX('Risque de verglas')) + '</b>' : '') + '</div></div><div class="val">' + Math.round(tmp) + '°</div></div>';
    }).join('') + '<p class="muted small">' + esc(TRX('Prévisions Open-Meteo, heure par heure. Plus l\'heure de passage est lointaine, plus la prévision est incertaine. Les heures de passage sont estimées à partir de la durée du trajet.')) + '</p>';
  }
  body.querySelectorAll('#wxOff button').forEach((b) => { b.onclick = () => X.routeWeatherDetail(R, +b.dataset.h); });
};
async function closureNear(p) {
  if (!TT) return null;
  const d = 0.03;
  const bbox = [p.lon - d, p.lat - d, p.lon + d, p.lat + d].map((x) => x.toFixed(4)).join(',');
  const u = tt('/traffic/services/5/incidentDetails', { bbox, fields: '{incidents{properties{iconCategory,events{description},from,to}}}', language: LANG, timeValidityFilter: 'present' });
  const j = await getJson(u, 8000);
  const inc = (j.incidents || []).filter((x) => x.properties && x.properties.iconCategory === 8);
  return inc.length ? inc[0].properties : false;
}
async function openCols() {
  const cols = [...S.spots.values()].filter((s) => s.category === 'route' && /^\d{3,4} m/.test(s.description || ''));
  const c = here();
  cols.sort((a, b) => dist(c, a) - dist(c, b));
  const body = openSheet('Cols et météo', '<p class="muted">Chargement…</p>', 'cols');
  let w = [];
  try { for (let i = 0; i < cols.length; i += 40) w = w.concat(await meteo(cols.slice(i, i + 40))); } catch (e) { /* */ }
  if (S.sheetView !== 'cols') return;
  body.innerHTML = cols.map((s, i) => { const m = w[i]; const alt = (s.description.match(/^(\d{3,4}) m/) || [])[1]; const winter = /Fermé en hiver/.test(s.description); return '<button class="card tap" data-i="' + i + '"><div class="ico" style="background:#8EC5FF">' + IC.mount + '</div><div class="grow"><b>' + esc(s.name) + '</b><div class="sub">' + alt + ' m · ' + fmtDist(dist(c, s)) + (winter ? ' · fermé en hiver' : '') + '</div></div><div class="val">' + (m ? Math.round(m.current.temperature_2m) + '°<small> ' + WMO(m.current.weather_code) + '</small>' : '') + '</div></button>'; }).join('') +
    '<p class="muted small">Météo : Open-Meteo. Touche un col pour vérifier s\'il est fermé (trafic TomTom). Avant de partir en hiver, vérifie aussi l\'état officiel des routes.</p>';
  body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => A.openSpot ? A.openSpot(cols[+b.dataset.i].id) : chooseDestination({ name: cols[+b.dataset.i].name, lat: cols[+b.dataset.i].lat, lon: cols[+b.dataset.i].lon }); });
}
X.spotExtra = async (s, body) => {
  if (s.category !== 'route' && s.category !== 'vue') return;
  const box = el('<div class="card"><div class="grow"><b>Météo et état</b><div class="sub">Chargement…</div></div></div>');
  const sp = body.querySelector('#spGo'); if (sp) sp.parentNode.insertBefore(box, sp); else body.appendChild(box);
  try {
    const [w, cl] = await Promise.all([meteo([s]).then((x) => x[0]).catch(() => null), closureNear(s).catch(() => null)]);
    const parts = [];
    if (w) parts.push(Math.round(w.current.temperature_2m) + '°, ' + WMO(w.current.weather_code).toLowerCase() + (w.daily && w.daily.snowfall_sum && w.daily.snowfall_sum[0] > 0 ? ', ' + w.daily.snowfall_sum[0] + ' cm de neige prévus aujourd\'hui' : ''));
    if (cl) parts.push('<b style="color:var(--danger)">Route fermée</b>' + (cl.events && cl.events[0] ? ' (' + esc(cl.events[0].description) + ')' : ''));
    else if (cl === false) parts.push('Aucune fermeture signalée en ce moment');
    box.querySelector('.sub').innerHTML = parts.join('<br>') || 'Infos indisponibles.';
  } catch (e) { box.querySelector('.sub').textContent = 'Infos indisponibles.'; }
};

/* ======================= Bornes libres en direct (TomTom) ======================= */
async function evNearby(p, radius, limit) {
  const j = await getJson(tt('/search/2/nearbySearch/.json', { lat: p.lat, lon: p.lon, radius: radius || 8000, categorySet: '7309', limit: limit || 20, language: LANG }), 9000);
  return (j.results || []).map((r) => ({ id: r.id, name: (r.poi && r.poi.name) || 'Borne', addr: r.address && r.address.freeformAddress, lat: r.position.lat, lon: r.position.lon, avId: r.dataSources && r.dataSources.chargingAvailability && r.dataSources.chargingAvailability.id, connectors: (r.chargingPark && r.chargingPark.connectors) || [] }));
}
async function evAvail(avId) {
  const j = await getJson(tt('/search/2/chargingAvailability.json', { chargingAvailability: avId }), 8000);
  let av = 0, tot = 0, max = 0;
  (j.connectors || []).forEach((c) => { const cur = (c.availability && c.availability.current) || {}; av += cur.available || 0; tot += c.total || 0; (c.availability && c.availability.perPowerLevel || []).forEach((p) => { max = Math.max(max, p.powerKW || 0); }); });
  return { av, tot, max };
}
async function openChargers() {
  if (!TT) { toast('Disponibilité des bornes bientôt disponible.'); return; }
  const c = here();
  const body = openSheet('Bornes libres', '<p class="muted">Recherche des bornes et de leur disponibilité…</p>', 'chargers');
  try {
    const list = (await evNearby(c, 10000, 25)).map((b) => Object.assign(b, { d: dist(c, b) })).sort((a, b) => a.d - b.d).slice(0, 15);
    await Promise.all(list.map(async (b) => { if (b.avId) { try { b.st = await evAvail(b.avId); } catch (e) { /* */ } } }));
    if (S.sheetView !== 'chargers') return;
    body.innerHTML = list.length ? list.map((b, i) => { const st = b.st; const free = st && st.tot ? st.av + '/' + st.tot + ' libres' : 'Dispo inconnue'; const cls = st && st.tot ? (st.av > 0 ? 'ok' : 'warn') : ''; const kw = st && st.max ? st.max + ' kW' : (b.connectors[0] && b.connectors[0].ratedPowerKW ? b.connectors[0].ratedPowerKW + ' kW' : ''); return '<button class="card tap" data-i="' + i + '"><div class="ico" style="background:#3DDC97">' + IC.plug + '</div><div class="grow"><b>' + esc(b.name) + '</b><div class="sub">' + fmtDist(b.d) + (kw ? ' · ' + kw : '') + (b.addr ? ' · ' + esc(b.addr) : '') + '</div></div><span class="pill ' + cls + '">' + free + '</span></button>'; }).join('') + '<p class="muted small">Disponibilité en direct : TomTom (pas encore connue pour toutes les bornes).</p>'
      : '<div class="empty">Aucune borne trouvée dans ce coin.</div>';
    body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const x = list[+b.dataset.i]; closeSheet(); chooseDestination({ name: x.name, sub: 'Borne de recharge', lat: x.lat, lon: x.lon }); }; });
  } catch (e) { body.innerHTML = '<div class="empty">Service de bornes indisponible pour le moment.</div>'; }
}
X.poiExtra = async (p, kind, body) => {
  X.poiVia(p, body);
  if (kind !== 'charge' || !TT) return;
  const box = el('<div class="card"><div class="grow"><b>Disponibilité</b><div class="sub">Recherche…</div></div></div>');
  const go = body.querySelector('#poiGo'); if (go) go.parentNode.insertBefore(box, go); else body.appendChild(box);
  try {
    const near = (await evNearby(p, 200, 5)).filter((b) => dist(p, b) < 150 && b.avId);
    if (!near.length) { box.querySelector('.sub').textContent = 'Pas de données en direct pour cette borne.'; return; }
    const st = await evAvail(near[0].avId);
    box.querySelector('.sub').innerHTML = st.tot ? '<b>' + st.av + ' sur ' + st.tot + ' libres</b> en ce moment' + (st.max ? ' · jusqu\'à ' + st.max + ' kW' : '') : 'Disponibilité inconnue.';
  } catch (e) { box.querySelector('.sub').textContent = 'Pas de données en direct pour cette borne.'; }
};

/* ======================= Carnet de la voiture ======================= */
let carnet = store.get('routa.carnet', { dates: {}, fills: [] });
const saveCarnet = () => store.set('routa.carnet', carnet);
const DUE = [['expertise', 'Expertise (contrôle technique)'], ['service', 'Prochain service'], ['tyres', 'Changement de pneus'], ['battery', 'Batterie 12 V (contrôle ou remplacement)'], ['insurance', 'Assurance'], ['vignette', 'Vignette'], ['other', 'Autre rappel']];
function consumption() {
  const f = carnet.fills.filter((x) => x.km && x.liters).sort((a, b) => a.km - b.km);
  if (f.length < 2) return null;
  const km = f[f.length - 1].km - f[0].km; const l = f.slice(1).reduce((s, x) => s + x.liters, 0);
  return km > 0 ? (l / km * 100) : null;
}
/* Entretien et suivi : affiché directement dans « Mon véhicule » (plus d'écran séparé) */
function carnetInto(root) {
  if (!root) return;
  const cons = consumption();
  const spent = carnet.fills.reduce((s, x) => s + (x.price || 0), 0);
  const LG = () => { const l = (window.ROUTA_I18N && ROUTA_I18N.lang) || 'fr'; return l === 'en' ? 'en-GB' : l === 'sr' ? 'sr-Latn' : l; };
  const daysTo = (v) => Math.ceil((Date.parse(v + 'T12:00') - Date.now()) / 86400000);
  const state = (v) => { if (!v) return '<span class="muted">' + esc(TRX('Pas de date')) + '</span>'; const d = daysTo(v); return '<span class="pill ' + (d <= 30 ? 'warn' : 'ok') + '">' + esc(d < 0 ? TRX('dépassé') : TRX('dans {n} j', { n: d })) + '</span>'; };
  const hasAny = () => DUE.some(([k]) => carnet.dates[k]);
  root.innerHTML = '<h3>' + esc(TRX('Entretien et suivi')) + '</h3>' +
    '<p class="muted small" style="margin:0">' + esc(TRX('Touche une date pour la changer. Tout est enregistré tout de suite.')) + '</p>' +
    DUE.map(([k, l]) => '<div class="card remrow"><div class="grow"><b>' + esc(TRX(l)) + '</b><div class="sub" id="rs_' + k + '">' + state(carnet.dates[k] || '') + '</div></div>' +
      '<input class="remdate" id="cd_' + k + '" type="date" value="' + esc(carnet.dates[k] || '') + '" aria-label="' + esc(TRX(l)) + '">' +
      '</div>').join('') +
    '<div id="cdIcs" hidden></div>' +
    '<h3>' + esc(TRX('Pleins')) + '</h3>' +
    '<div class="row"><label class="field grow" for="fKm">' + esc(TRX('Km au compteur')) + '<input id="fKm" type="number" inputmode="numeric"></label><label class="field grow" for="fL">' + esc(TRX('Litres')) + '<input id="fL" type="number" step="0.01" inputmode="decimal"></label><label class="field grow" for="fP">' + esc(TRX('Prix total')) + '<input id="fP" type="number" step="0.05" inputmode="decimal"></label></div>' +
    '<button class="btn block" id="fAdd">' + esc(TRX('Ajouter le plein')) + '</button>' +
    (cons ? '<div class="card"><div class="grow"><b>' + esc(TRX('Consommation moyenne : {c} L/100 km', { c: cons.toFixed(1) })) + '</b><div class="sub">' + esc(TRX('{n} pleins', { n: carnet.fills.length })) + ' · ' + spent.toFixed(2) + '</div></div></div>' : '<p class="muted small">' + esc(TRX('Note au moins deux pleins (en faisant le plein complet) pour calculer ta consommation.')) + '</p>') +
    carnet.fills.slice(-8).reverse().map((f) => '<div class="card"><div class="grow"><b>' + (f.liters || '?') + ' L · ' + (f.price != null ? f.price.toFixed(2) : '?') + '</b><div class="sub">' + esc(new Date(f.date).toLocaleDateString(LG())) + (f.km ? ' · ' + f.km + ' km' : '') + '</div></div><button class="iconbtn small" data-fdel="' + f.date + '" aria-label="' + esc(TRX('Supprimer')) + '">' + ic('trash') + '</button></div>').join('') +
    '<p class="muted small">' + esc(TRX('Ces informations restent sur ce téléphone.')) + '</p>';
  const body = root;
  // date : enregistrée sans redessiner l'écran (le sélecteur de date reste ouvert, rien ne se ferme)
  DUE.forEach(([k]) => {
    const inp = body.querySelector('#cd_' + k);
    const save = () => {
      const v = inp.value || '';
      if ((carnet.dates[k] || '') === v) return;
      if (v) carnet.dates[k] = v; else delete carnet.dates[k];
      saveCarnet();
      body.querySelector('#rs_' + k).innerHTML = state(v);
    };
    inp.addEventListener('change', save); inp.addEventListener('blur', save);
  });
  body.querySelector('#fAdd').onclick = () => {
    const km = parseInt(body.querySelector('#fKm').value, 10) || null, liters = parseFloat(String(body.querySelector('#fL').value).replace(',', '.')) || null, price = parseFloat(String(body.querySelector('#fP').value).replace(',', '.'));
    if (!liters) { toast(esc(TRX('Indique au moins les litres.'))); return; }
    carnet.fills.push({ date: Date.now(), km, liters, price: isNaN(price) ? null : price }); saveCarnet(); toast(esc(TRX('Plein ajouté.'))); carnetInto(root);
  };
  body.querySelectorAll('[data-fdel]').forEach((b) => { b.onclick = () => { carnet.fills = carnet.fills.filter((f) => String(f.date) !== b.dataset.fdel); saveCarnet(); carnetInto(root); }; });
  if (X.onCarnet) X.onCarnet(root);
}
X.carnetInto = carnetInto;
function openCarnet() {
  A.openK('vehicle');
  setTimeout(() => { const c = document.getElementById('vehCarnet'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
}
function carnetReminders() {
  const today = new Date().toISOString().slice(0, 10);
  if (store.get('routa.carnetCheck', '') === today) return;
  store.set('routa.carnetCheck', today);
  DUE.forEach(([k, l]) => { const v = carnet.dates[k]; if (!v) return; const days = Math.ceil((Date.parse(v) - Date.now()) / 86400000); if (days <= 14) toast('<b>' + esc(TRX(l)) + '</b> : ' + esc(days < 0 ? TRX('dépassé') : TRX('dans {n} j', { n: days })), { action: TRX('Mon véhicule'), onAction: openCarnet, ms: 9000 }); });
}

/* ======================= Ma voiture garée ======================= */
let parked = store.get('routa.parked', null), parkedMk = null;
function drawParked() {
  if (parkedMk) { parkedMk.remove(); parkedMk = null; }
  if (!parked) return;
  const b = el('<button class="mk-parked" aria-label="Ma voiture garée">' + IC.car + '</button>');
  b.onclick = (e) => { e.stopPropagation(); openParked(); };
  parkedMk = new maplibregl.Marker({ element: b }).setLngLat([parked.lon, parked.lat]).addTo(map);
}
function saveParked(p, until) { parked = { lat: p.lat, lon: p.lon, at: Date.now(), until: until || null, warned: false }; store.set('routa.parked', parked); drawParked(); }
function openParked() {
  const left = parked && parked.until ? Math.round((parked.until - Date.now()) / 60000) : null;
  const body = openSheet('Stationnement',
    (parked ? '<div class="card"><div class="ico" style="background:var(--accent)">' + IC.car + '</div><div class="grow"><b>Garée ' + ago(new Date(parked.at).toISOString()) + '</b><div class="sub">' + (S.pos ? 'à ' + fmtDist(dist(S.pos, parked)) : '') + (left != null ? ' · ' + (left > 0 ? 'parking payé encore ' + left + ' min' : 'temps de parking dépassé') : '') + '</div></div></div>' +
      '<div class="row"><button class="btn grow" id="pkGo">' + ic('nav') + 'Y retourner</button><button class="btn soft grow" id="pkShow">Voir</button></div>' : '<p>Aucune position enregistrée. Elle s\'enregistre toute seule à la fin d\'une navigation, ou avec le bouton ci-dessous.</p>') +
    '<button class="btn soft block" id="pkHere">' + IC.car + 'Ma voiture est garée ici</button>' +
    '<h3>Rappel de fin de parking</h3><div class="row wrap" id="pkTimer">' + [30, 60, 90, 120, 180].map((m) => '<button class="pill tap" data-m="' + m + '">' + (m < 60 ? m + ' min' : (m / 60) + ' h') + '</button>').join('') + '</div>' +
    (parked ? '<button class="btn danger" id="pkClear">Effacer</button>' : ''), 'parked');
  const g = body.querySelector('#pkGo'); if (g) g.onclick = () => { closeSheet(); chooseDestination({ name: 'Ma voiture', sub: 'Voiture garée', lat: parked.lat, lon: parked.lon }); };
  const sh = body.querySelector('#pkShow'); if (sh) sh.onclick = () => { closeSheet(); map.flyTo({ center: [parked.lon, parked.lat], zoom: 17 }); };
  body.querySelector('#pkHere').onclick = () => { if (!S.pos) { toast('Recherche de ta position…'); return; } saveParked(S.pos); toast('Position de ta voiture enregistrée.'); openParked(); };
  body.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { if (!parked) { if (!S.pos) return; saveParked(S.pos); } parked.until = Date.now() + (+b.dataset.m) * 60000; parked.warned = false; store.set('routa.parked', parked); toast('Rappel 10 min avant la fin du parking.'); try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* */ } openParked(); }; });
  const cl = body.querySelector('#pkClear'); if (cl) cl.onclick = () => { parked = null; store.set('routa.parked', null); drawParked(); closeSheet(); };
}
setInterval(() => {
  if (!parked || !parked.until || parked.warned) return;
  const left = (parked.until - Date.now()) / 60000;
  if (left <= 10) {
    parked.warned = true; store.set('routa.parked', parked);
    vibrate([200, 100, 200]); say('Ton parking se termine dans ' + Math.max(0, Math.round(left)) + ' minutes');
    toast('<b>Parking :</b> fin dans ' + Math.max(0, Math.round(left)) + ' min.', { action: 'Voir', onAction: openParked, ms: 15000 });
    try { if (window.Notification && Notification.permission === 'granted') new Notification('ROUTA', { body: 'Ton parking se termine dans ' + Math.max(0, Math.round(left)) + ' min.' }); } catch (e) { /* */ }
  }
}, 30000);
X.arrived = (dest) => {
  // voiture garée seulement après un trajet en voiture (pas à pied ni à vélo)
  if (S.pos && (!dest || !dest.mode || dest.mode === 'car')) { saveParked(S.pos); setTimeout(() => toast('Position de ta voiture enregistrée.', { action: 'Rappel parking', onAction: openParked, ms: 8000 }), 1500); }
  X.via = []; X.viaFor = null; X.avoidClear();
};

/* ======================= #048 Parkings près de la destination (OpenStreetMap, sans inventer de prix ni de places) ======================= */
X.parkingsNear = async (dest) => {
  const body = openSheet(TRX('Parkings près de la destination'), '<p class="muted">' + esc(TRX('Recherche des parkings…')) + '</p>', 'parkdest');
  let els = [];
  try { els = await Promise.race([A.overpass('[out:json][timeout:20];nwr["amenity"="parking"]["access"!~"private|customers|no"](around:700,' + dest.lat.toFixed(5) + ',' + dest.lon.toFixed(5) + ');out center 60;', !!(A.inCH && A.inCH(dest))), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 25000))]); } catch (e) { els = null; }
  if (S.sheetView !== 'parkdest') return;
  if (!els) { body.innerHTML = '<p class="muted">' + esc(TRX('Données indisponibles pour le moment. Réessaie plus tard.')) + '</p>'; return; }
  const list = els.map((e) => { const c = e.center || e; const t = e.tags || {}; return { name: t.name || (t.parking === 'underground' ? TRX('Parking souterrain') : t.parking === 'multi-storey' ? TRX('Parking couvert') : TRX('Parking')), lat: c.lat, lon: c.lon, t }; })
    .filter((p) => p.lat != null && !/street_side|lane|on_street/.test(p.t.parking || '') && (p.t.name || p.t.parking === 'underground' || p.t.parking === 'multi-storey' || !(+p.t.capacity > 0 && +p.t.capacity < 8)))
    .map((p) => Object.assign(p, { d: dist(p, dest), big: !!(p.t.name || p.t.parking === 'underground' || p.t.parking === 'multi-storey' || +p.t.capacity >= 30) }))
    .filter((p, i, all) => !p.t.name || all.findIndex((q) => q.t.name === p.t.name) === i)
    .sort((a, b) => (b.big - a.big) || (a.d - b.d)).slice(0, 12);
  if (!list.length) { body.innerHTML = '<p class="muted">' + esc(TRX('Aucun parking public connu à moins de 700 m.')) + '</p>'; return; }
  body.innerHTML = list.map((p, i) => {
    const t = p.t, info = [];
    if (t.fee === 'yes') info.push(TRX('Payant')); else if (t.fee === 'no') info.push(TRX('Gratuit'));
    if (t.capacity && /^\d+$/.test(t.capacity)) info.push(TRX('{n} places', { n: t.capacity }));
    if (t['capacity:disabled'] && t['capacity:disabled'] !== 'no') info.push(TRX('Places PMR'));
    if (t.maxstay) info.push(TRX('Durée max : {d}', { d: t.maxstay }));
    return '<button class="card tap" data-i="' + i + '"><span class="ico" style="background:#1E4FD8">' + ic('parking') + '</span><span class="grow"><b>' + esc(p.name) + '</b><span class="sub">' + esc(TRX('{m} min à pied de la destination', { m: Math.max(1, Math.round(p.d / 75)) })) + (info.length ? ' · ' + esc(info.join(' · ')) : '') + '</span></span></button>';
  }).join('') + '<p class="muted small">' + esc(TRX('Source : OpenStreetMap. Vérifie les tarifs et horaires sur place.')) + '</p>';
  body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const p = list[+b.dataset.i]; chooseDestination({ name: p.name, sub: TRX('Parking près de {d}', { d: dest.name }), lat: p.lat, lon: p.lon }); }; });
};
/* En voiture, à l'approche de la destination : proposer une seule fois les parkings proches (visuel, sans son) */
setInterval(() => {
  const N = S.nav; if (!N || (N.mode && N.mode !== 'car') || N.parkHint || !N.R || !S.pos) return;
  const left = N.R.total - (N.along || 0);
  if (left > 0 && left < 900 && !/parking/i.test(N.dest.sub || '')) { N.parkHint = true; toast(esc(TRX('Bientôt arrivé : parkings près de ta destination ?')), { action: TRX('Voir'), onAction: () => X.parkingsNear(N.dest), ms: 10000 }); }
}, 5000);

/* ======================= Installer l'app sur l'écran d'accueil ======================= */
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
const isStandalone = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
X.canInstall = () => !isStandalone();
function openInstall() {
  const ios = isIOS();
  const shareIco = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 11v9h14v-9"/></svg>';
  const steps = ios ? [
    ['Ouvre ce site dans <b>Safari</b>', 'Si tu es dans une autre app (Instagram, WhatsApp…), touche « Ouvrir dans Safari ».'],
    ['Touche le bouton <b>Partager</b> ' + shareIco, 'En bas de l\'écran (ou en haut sur iPad).'],
    ['Choisis <b>« Sur l\'écran d\'accueil »</b> puis <b>Ajouter</b>', 'Fais défiler la liste si tu ne le vois pas.']
  ] : [
    ['Ouvre ce site dans <b>Chrome</b>', 'Si tu es dans une autre app, touche « Ouvrir dans Chrome ».'],
    ['Touche le menu <b>⋮</b>', 'En haut à droite de Chrome.'],
    ['Choisis <b>« Installer l\'application »</b> ou <b>« Ajouter à l\'écran d\'accueil »</b>', 'Puis confirme.']
  ];
  const body = openSheet('Installer ROUTA',
    '<p>Ajoute ROUTA sur ton écran d\'accueil : elle s\'ouvre en plein écran, comme une vraie app, en un seul appui.</p>' +
    (installEvt ? '<button class="btn block" id="instNow">Installer maintenant</button><p class="muted small">Ou à la main :</p>' : '') +
    steps.map((st, i) => '<div class="card"><div class="ico" style="background:#FF8A3D;border-radius:22px;color:#0E1116;font-weight:800">' + (i + 1) + '</div><div class="grow"><b>' + st[0] + '</b><div class="sub">' + st[1] + '</div></div></div>').join('') +
    '<button class="btn soft block" id="instLater">Plus tard</button>', 'install');
  const n = body.querySelector('#instNow'); if (n) n.onclick = async () => { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { /* */ } installEvt = null; closeSheet(); };
  body.querySelector('#instLater').onclick = closeSheet;
}
setTimeout(() => {
  if (isStandalone() || store.get('routa.installSeen', false) || !S.me || !S.me.pseudo || S.nav || !$('sheetWrap').hidden) return;
  store.set('routa.installSeen', true); openInstall();
}, 25000);

/* ======================= Menu ======================= */
X.tiles = () => [
  ['convoy', IC.convoy, X.convoy ? 'Convoi · ' + esc(X.convoy.name) : 'Convoi'],
  ['events', IC.event, 'Rassemblements'],
  ['ranking', IC.trophy, 'Classement · ' + (S.me.points || 0) + ' pts'],
  ['shareme', IC.share, (X.share && X.share.until > Date.now()) ? 'Position partagée' : 'Partager ma position'],
  ['chargers', IC.plug, 'Bornes libres'],
  ['cols', IC.mount, 'Cols et météo'],
  ['parked', IC.car, 'Ma voiture garée']
];
X.icons = IC;
X.open = (k) => {
  const f = { install: openInstall, convoy: openConvoy, events: openEvents, ranking: () => openRanking('all'), shareme: openShareSheet, chargers: openChargers, cols: openCols, carnet: openCarnet, parked: openParked, trips: openTrips, offline: openOffline, pro: openPro }[k];
  if (f) { f(); return true; }
  return false;
};

/* ======================= Mes trajets (gardés seulement sur ce téléphone) ======================= */
function openTrips() {
  const t = store.get('routa.trips', []);
  const body = openSheet('Mes trajets',
    (t.length ? t.map((r, i) => '<div class="card"><div class="grow"><b>' + esc(r.name || 'Destination') + '</b><div class="sub">' +
      esc(new Date(r.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + fmtClock(new Date(r.at)) +
      ' · ' + (r.km || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' km · ' + (r.min || 0) + ' min' + (r.done ? '' : ' · interrompu') +
      '</div></div><button class="btn small soft" data-go="' + i + '">Y retourner</button></div>').join('') +
      '<button class="btn ghost block" id="tripsClear">Effacer l\'historique</button>'
      : '<div class="empty">Aucun trajet pour l\'instant. Tes trajets guidés apparaîtront ici.</div>') +
    '<p class="muted small">L\'historique reste uniquement sur ce téléphone.</p>', 'trips');
  body.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => { const r = t[+b.dataset.go]; closeSheet(); chooseDestination({ name: r.name, sub: r.sub || '', lat: r.lat, lon: r.lon }); }; });
  const c = body.querySelector('#tripsClear'); if (c) c.onclick = () => { store.set('routa.trips', []); openTrips(); };
}

/* ======================= Dangers sur ma route (alerte visuelle discrète) ======================= */
const hz = el('<div class="hazchip" id="hazChip" hidden role="status" aria-live="polite"></div>');
document.body.appendChild(hz);
function routeHazard() {
  const N = S.nav; if (!N || !N.R || !N.R.cum || !S.pos) { hz.hidden = true; return; }
  const R = N.R, from = Math.max(0, (N.seg || 0) - 1);
  let best = null;
  S.alerts.forEach((a) => {
    if (!a || Date.parse(a.expires_at) <= Date.now() || (a.denies || 0) > (a.confirms || 1)) return;
    if (dist(S.pos, a) > 6000) return;
    let bi = -1, bd = 45;
    for (let i = from; i < R.coords.length; i++) {
      const ahead = R.cum[i] - N.along;
      if (ahead > 5000) break;
      const d = dist(R.coords[i], a);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0) return;
    const ahead = R.cum[bi] - N.along;
    if (ahead < 40 || ahead > 3000) return;
    if (!best || ahead < best.ahead) best = { a, ahead };
  });
  if (!best) { hz.hidden = true; return; }
  const T = window.ROUTA_ALERT_TYPES || {};
  const lab = (T[best.a.type] && T[best.a.type].label) || 'Danger signalé';
  hz.innerHTML = '<span class="hzdot"></span><span>' + esc(A.I18N ? A.I18N.t(lab) : lab) + ' · ' + fmtDist(best.ahead) + '</span>';
  hz.hidden = false;
}
setInterval(routeHazard, 3000);

/* ======================= Carte hors connexion de ma région ======================= */
const RMAP = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.RoutaMap;
const nativeMap = () => !!(RMAP && document.documentElement.classList.contains('native-map'));
const OFF_KM = 20;
function tileXY(lat, lon, z) {
  const n = Math.pow(2, z), x = Math.floor((lon + 180) / 360 * n);
  const r = lat * Math.PI / 180, y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
  return [Math.max(0, Math.min(n - 1, x)), Math.max(0, Math.min(n - 1, y))];
}
function regionTiles(lat, lon, km, zmin, zmax) {
  const dLat = km / 111, dLon = km / (111 * Math.cos(lat * Math.PI / 180));
  const out = [];
  for (let z = zmin; z <= zmax; z++) {
    const [x0, y0] = tileXY(lat + dLat, lon - dLon, z), [x1, y1] = tileXY(lat - dLat, lon + dLon, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  }
  return out;
}
async function downloadWeb(lat, lon, prog, km, zmax) {
  if (!('caches' in window)) throw new Error('cache');
  const cache = await caches.open('routa-map');
  const st = map.getStyle() || {};
  const extra = [CFG.mapStyle];
  let tpl = null;
  Object.keys(st.sources || {}).forEach((id) => {
    const s = st.sources[id]; if (s.type !== 'vector') return;
    if (s.url) extra.push(s.url);
    const src = map.getSource(id); const t = (src && src.tiles) || s.tiles; if (t && t[0] && !tpl) tpl = t[0];
  });
  if (!tpl) throw new Error('tiles');
  if (st.sprite && typeof st.sprite === 'string') ['.json', '.png', '@2x.json', '@2x.png'].forEach((e) => extra.push(st.sprite + e));
  const fonts = new Set();
  (st.layers || []).forEach((l) => { const f = l.layout && l.layout['text-font']; if (Array.isArray(f) && f.every((v) => typeof v === 'string')) fonts.add(f.join(',')); });
  if (st.glyphs) fonts.forEach((f) => ['0-255', '256-511', '8192-8447'].forEach((r) => extra.push(st.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', r))));
  const urls = extra.concat(regionTiles(lat, lon, km || OFF_KM, 6, zmax || 14).map(([z, x, y]) => tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)));
  let done = 0, bytes = 0, i = 0;
  const work = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) { const b = await r.clone().arrayBuffer(); bytes += b.byteLength; await cache.put(u, r); } } catch (e) { /* on continue */ }
      done++; if (done % 10 === 0 || done === urls.length) prog(done, urls.length, bytes);
    }
  };
  await Promise.all([work(), work(), work(), work(), work(), work()]);
  store.set('routa.offline', { at: Date.now(), lat, lon, km: OFF_KM, bytes, web: true });
}
/* Carte hors connexion : autour de moi, la zone affichée, un lieu choisi ou tout un pays, avec un rayon réglable. Plusieurs zones possibles. */
const OFF_COUNTRIES = { CH: [46.80, 8.23, 180], FR: [46.6, 2.4, 560], DE: [51.1, 10.4, 450], IT: [42.5, 12.6, 600], AT: [47.6, 13.3, 290], BE: [50.6, 4.6, 150], LU: [49.8, 6.1, 45], LI: [47.15, 9.55, 15], PT: [39.6, -8.0, 330], ES: [40.3, -3.7, 560], NL: [52.2, 5.3, 170] };
const offZones = () => store.get('routa.offzones', []);
const saveOffZones = (l) => store.set('routa.offzones', l);
const offTiles = (lat, km, zmax) => { let n = 0; const dLatDeg = km / 111; for (let z = 6; z <= zmax; z++) { const t = Math.pow(2, z); const side = (2 * dLatDeg / 360) * t / Math.cos(lat * Math.PI / 180) + 1; n += Math.ceil(side) * Math.ceil(2 * dLatDeg / 360 * t + 1); } return n; };
const offZmax = (km) => (km <= 60 ? 14 : km <= 150 ? 13 : 12); // grandes zones : routes et villes, moins de petits détails (sinon plusieurs Go)
async function offDelete(zn) {
  try {
    if (zn.native && nativeMap() && RMAP.deleteRegion) await RMAP.deleteRegion({ name: zn.id });
    else if ('caches' in window) {
      const cache = await caches.open('routa-map'); const st = map.getStyle() || {}; let tpl = null;
      Object.keys(st.sources || {}).forEach((id) => { const src = map.getSource(id); const t = src && src.tiles; if (st.sources[id].type === 'vector' && t && t[0] && !tpl) tpl = t[0]; });
      const keep = offZones().filter((x) => x.id !== zn.id);
      if (tpl) for (const [z, x, y] of regionTiles(zn.lat, zn.lon, zn.km, 6, zn.zmax)) {
        if (keep.some((k) => z <= k.zmax && dist(k, { lat: zn.lat, lon: zn.lon }) < (k.km + zn.km) * 1000)) continue; // tuile partagée avec une autre zone : gardée
        cache.delete(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)).catch(() => {});
      }
    }
  } catch (e) { /* */ }
  saveOffZones(offZones().filter((x) => x.id !== zn.id));
}
async function openOffline(st) {
  st = Object.assign({ mode: 'me', km: 25, place: null }, st || {});
  const mb = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' Go' : Math.max(1, Math.round(b / 1048576)) + ' Mo');
  const C = window.ROUTA_COUNTRIES || {};
  const cc = S.country && OFF_COUNTRIES[S.country] ? S.country : 'CH';
  const center = () => st.mode === 'me' ? S.pos : st.mode === 'view' ? (() => { const c = map.getCenter(); return { lat: c.lat, lon: c.lng }; })() : st.mode === 'place' ? st.place : { lat: OFF_COUNTRIES[st.cc || cc][0], lon: OFF_COUNTRIES[st.cc || cc][1] };
  const km = st.mode === 'country' ? OFF_COUNTRIES[st.cc || cc][2] : st.km;
  const zmax = offZmax(km);
  const c0 = center();
  const est = c0 ? offTiles(c0.lat, km, zmax) * 30 * 1024 : 0; // ~30 Ko par morceau de carte (estimation)
  const zones = offZones();
  const KMS = [10, 25, 50, 100, 150];
  const body = openSheet(TRX('Carte hors connexion'),
    '<p class="muted small" style="margin:0">' + esc(TRX('Garde la carte sans réseau : tunnels, montagne, étranger.')) + '</p>' +
    '<h3>' + esc(TRX('Quelle zone ?')) + '</h3><div class="seg wrap2" id="offMode">' + [['me', 'Autour de moi'], ['view', 'Zone affichée'], ['place', 'Un lieu'], ['country', 'Tout un pays']].map(([k, l]) => '<button data-m="' + k + '" class="' + (st.mode === k ? 'on' : '') + '">' + esc(TRX(l)) + '</button>').join('') + '</div>' +
    (st.mode === 'place' ? '<form id="offPlaceF" class="row"><label class="field grow" for="offPlace"><span class="sr">' + esc(TRX('Lieu')) + '</span><input id="offPlace" type="text" placeholder="' + esc(TRX('Ville, col, lieu…')) + '" value="' + esc(st.place ? st.place.name : '') + '"></label><button class="btn" type="submit">' + esc(TRX('Chercher')) + '</button></form><div id="offRes"></div>' : '') +
    (st.mode === 'country' ? '<label class="field" for="offCc">' + esc(TRX('Pays')) + '<select id="offCc">' + Object.keys(OFF_COUNTRIES).map((k) => '<option value="' + k + '"' + ((st.cc || cc) === k ? ' selected' : '') + '>' + esc(TRX((C[k] && C[k].name) || k)) + '</option>').join('') + '</select></label>'
      : '<h3>' + esc(TRX('Rayon')) + '</h3><div class="seg" id="offKm">' + KMS.map((k) => '<button data-k="' + k + '" class="' + (st.km === k ? 'on' : '') + '">' + k + ' km</button>').join('') + '</div>') +
    (c0 ? '<div class="card"><div class="grow"><b>' + esc(st.mode === 'place' && st.place ? st.place.name : st.mode === 'country' ? TRX((C[st.cc || cc] && C[st.cc || cc].name) || (st.cc || cc)) : st.mode === 'view' ? TRX('Zone affichée') : TRX('Autour de moi')) + (st.mode === 'country' ? '' : ' · ' + km + ' km') + '</b><div class="sub">' + esc(TRX('Environ {s}', { s: mb(est) })) + (zmax < 14 ? ' · ' + esc(TRX('routes et villes (moins de petits détails)')) : '') + '</div></div></div>' : '<p class="muted small">' + esc(st.mode === 'me' ? TRX('J\'attends ta position GPS…') : TRX('Choisis un lieu.')) + '</p>') +
    '<div id="offProg" class="muted small" hidden></div>' +
    '<button class="btn block" id="offGo"' + (c0 ? '' : ' disabled') + '>' + esc(TRX('Télécharger cette zone')) + '</button>' +
    (est > 400 * 1048576 ? '<p class="muted small">' + esc(TRX('Grande zone : utilise le Wi-Fi et garde ROUTA ouvert pendant le téléchargement.')) + '</p>' : '<p class="muted small">' + esc(TRX('Utilise le Wi-Fi de préférence.')) + '</p>') +
    (zones.length ? '<h3>' + esc(TRX('Zones enregistrées')) + '</h3>' + zones.map((z) => '<div class="card"><div class="grow"><b>' + esc(z.name) + '</b><div class="sub">' + esc(new Date(z.at).toLocaleDateString()) + ' · ' + z.km + ' km</div></div><button class="iconbtn small" data-del="' + esc(z.id) + '" aria-label="' + esc(TRX('Supprimer')) + '">' + ic('trash') + '</button></div>').join('') : '') +
    '<p class="muted small">' + esc(TRX('La carte de ta région se télécharge aussi toute seule, en arrière-plan.')) + '</p>', 'offline');
  body.querySelectorAll('#offMode button').forEach((b) => { b.onclick = () => openOffline(Object.assign(st, { mode: b.dataset.m })); });
  body.querySelectorAll('#offKm button').forEach((b) => { b.onclick = () => openOffline(Object.assign(st, { km: +b.dataset.k })); });
  const ccS = body.querySelector('#offCc'); if (ccS) ccS.onchange = () => openOffline(Object.assign(st, { cc: ccS.value }));
  body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { const z = offZones().find((x) => x.id === b.dataset.del); if (z) await offDelete(z); openOffline(st); }; });
  const pf = body.querySelector('#offPlaceF');
  if (pf) pf.onsubmit = async (e) => {
    e.preventDefault(); const q = body.querySelector('#offPlace').value.trim(); if (q.length < 2) return;
    const out = body.querySelector('#offRes'); out.innerHTML = '<p class="muted small">' + esc(TRX('Chargement…')) + '</p>';
    let r = []; try { const mc = map.getCenter(); r = (A.geoSearch ? await A.geoSearch(q, S.pos || { lat: mc.lat, lon: mc.lng }, true) : []) || []; } catch (e2) { /* */ }
    out.innerHTML = r.length ? r.slice(0, 5).map((x, i) => '<button class="card tap" data-pi="' + i + '"><span class="grow"><b>' + esc(x.name) + '</b><span class="sub">' + esc(x.sub || '') + '</span></span></button>').join('') : '<div class="empty">' + esc(TRX('Aucun résultat.')) + '</div>';
    out.querySelectorAll('[data-pi]').forEach((b) => { b.onclick = () => { const x = r[+b.dataset.pi]; openOffline(Object.assign(st, { place: { name: x.name, lat: x.lat, lon: x.lon } })); }; });
  };
  body.querySelector('#offGo').onclick = async () => {
    const c = center(); if (!c) return;
    const b = body.querySelector('#offGo'), p = body.querySelector('#offProg');
    b.disabled = true; p.hidden = false; p.textContent = TRX('Préparation…');
    const name = st.mode === 'place' && st.place ? st.place.name : st.mode === 'country' ? TRX((C[st.cc || cc] && C[st.cc || cc].name) || (st.cc || cc)) : st.mode === 'view' ? TRX('Zone affichée') : TRX('Autour de moi');
    const zn = { id: 'z' + Date.now(), name, lat: c.lat, lon: c.lon, km, zmax, at: Date.now() };
    try {
      if (nativeMap() && RMAP.downloadRegion) {
        await RMAP.downloadRegion({ lat: c.lat, lon: c.lon, radiusKm: km, maxZoom: zmax, styleURL: CFG.mapStyle, name: zn.id });
        zn.native = true; saveOffZones(offZones().concat([zn]));
        const tick = async () => {
          if (S.sheetView !== 'offline') return;
          try {
            const s2 = await RMAP.regionStatus({ name: zn.id });
            if (s2 && s2.exists) {
              const pc = s2.total ? Math.min(100, Math.round(s2.done / s2.total * 100)) : 0;
              p.textContent = s2.complete ? TRX('Carte enregistrée sur ce téléphone.') : TRX('Téléchargement…') + ' ' + pc + ' %';
              if (s2.complete) { b.disabled = false; return; }
            }
          } catch (e) { /* */ }
          setTimeout(tick, 1500);
        };
        tick();
      } else {
        await downloadWeb(c.lat, c.lon, (d, t, by) => { p.textContent = TRX('Téléchargement…') + ' ' + Math.round(d / t * 100) + ' % · ' + mb(by); }, km, zmax);
        saveOffZones(offZones().concat([zn]));
        p.textContent = TRX('Carte enregistrée sur ce téléphone.'); b.disabled = false;
        setTimeout(() => { if (S.sheetView === 'offline') openOffline(st); }, 1200);
      }
    } catch (e) { p.textContent = TRX('Le téléchargement n\'a pas abouti. Vérifie ta connexion et réessaie.'); b.disabled = false; }
  };
}
X.openTrips = openTrips;
X.openOffline = openOffline;
/* Carte de ma région téléchargée automatiquement (une fois), puis de nouveau si on s'éloigne de plus de 60 km :
   la carte reste affichée même avec un réseau faible. Silencieux, en arrière-plan. */
let autoOffBusy = false;
async function autoOffline() {
  if (autoOffBusy || !S.pos || S.nav) return;
  const info = store.get('routa.offline', null);
  if (info && dist(info, S.pos) < 60000 && Date.now() - info.at < 30 * 86400000) return;
  const cn = navigator.connection; if (cn && (cn.saveData || /2g/.test(cn.effectiveType || ''))) return;
  autoOffBusy = true;
  try {
    if (nativeMap() && RMAP.downloadRegion) { await RMAP.downloadRegion({ lat: S.pos.lat, lon: S.pos.lon, radiusKm: OFF_KM, styleURL: CFG.mapStyle, name: 'routa-region' }); store.set('routa.offline', { at: Date.now(), lat: S.pos.lat, lon: S.pos.lon, km: OFF_KM, native: true, auto: true }); }
    else if (map.isStyleLoaded()) await downloadWeb(S.pos.lat, S.pos.lon, () => {});
  } catch (e) { /* on réessaiera plus tard */ }
  autoOffBusy = false;
}
setTimeout(autoOffline, 20000); setInterval(autoOffline, 10 * 60000);

/* ======================= Mode pro : temps de conduite et de repos (OTR 1 / OTR 2) ======================= */
/* Aide pour les chauffeurs professionnels. Ne remplace ni le tachygraphe ni le livret de travail. */
const TRX = (s, v) => { let o = (window.ROUTA_I18N && ROUTA_I18N.t) ? ROUTA_I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
const PRO = Object.assign({ on: false, regime: null, segs: [] }, store.get('routa.pro', {}));
PRO.auto = false; // pas de détection automatique : un bouchon ou un arrêt au feu la tromperait
const H = 3600000, MIN = 60000;
const PRO_RULES = {
  otr1: { label: 'OTR 1', sub: 'Transport de marchandises de plus de 3,5 t, et transport de personnes avec plus de 8 places assises sans compter le conducteur (dès 9 places avec lui)', cont: 4.5 * H, day: 9 * H, dayExt: 10 * H, week: 56 * H, twoWeeks: 90 * H, rest: 11 * H, restRed: 9 * H, split1: 15 * MIN, workCont: 6 * H, wbreak: 15 * MIN, wweek: 60 * H, avail: true },
  ue: { label: 'UE 561', sub: 'Règlement (CE) 561/2006 (France et Union européenne) : transport de marchandises de plus de 3,5 t, et transport de plus de 9 personnes conducteur compris', cont: 4.5 * H, day: 9 * H, dayExt: 10 * H, week: 56 * H, twoWeeks: 90 * H, rest: 11 * H, restRed: 9 * H, split1: 15 * MIN, workCont: 6 * H, wbreak: 15 * MIN, wweek: 60 * H, avail: true },
  otr2: { label: 'OTR 2', sub: 'Transport professionnel de personnes en voiture légère ou de tourisme (taxis, VTC, limousines) : 8 places passagers au maximum', cont: 4.5 * H, day: 9 * H, dayExt: null, week: 45 * H, twoWeeks: null, rest: 11 * H, restRed: 9 * H, split1: 20 * MIN, workCont: 5.5 * H, wbreak: 20 * MIN, wweek: 48 * H, avail: false }
};
const ACT = { drive: 'Conduite', work: 'Travail', avail: 'Disponibilité', break: 'Pause', rest: 'Repos' };
/* boutons : symboles officiels du tachygraphe (volant, marteaux croisés, carré barré, lit). Une longue pause compte comme repos. */
const actBtns = (R) => R.avail ? ['drive', 'work', 'avail', 'break'] : ['drive', 'work', 'break'];
function proRegime() { if (PRO.regime && PRO_RULES[PRO.regime]) return PRO.regime; const t = (A.veh ? A.veh().type : 'voiture'); const ch = !A.S.country || A.S.country === 'CH'; return (t === 'camion' || t === 'bus' || t === 'minibus') ? (ch ? 'otr1' : 'ue') : 'otr2'; }
/* jours fériés nationaux en France (pour l'interdiction poids lourds du week-end) */
function frHoliday(d) {
  const y = d.getFullYear(), md = (d.getMonth() + 1) * 100 + d.getDate();
  if ([101, 501, 508, 714, 815, 1101, 1111, 1225].includes(md)) return true;
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  return [1, 39, 50].some((n) => { const x = new Date(easter); x.setDate(x.getDate() + n); return x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); });
}
function frHgvBan(now) {
  const h = now.getHours(), dow = now.getDay(), next = new Date(now); next.setDate(next.getDate() + 1);
  const offDay = dow === 0 || frHoliday(now), offNext = next.getDay() === 0 || frHoliday(next);
  return (offDay && h < 22) || (offNext && h >= 22);
}
function proSave() { const cut = Date.now() - 15 * 24 * H; PRO.segs = PRO.segs.filter((s) => !s.e || s.e > cut); store.set('routa.pro', PRO); }
const PA_ICO = {
  drive: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M12 3.5v6.5M4 13.5l6.2-.8M20 13.5l-6.2-.8"/></svg>',
  work: '<svg viewBox="0 0 24 24"><path d="M5 19L15.5 8.5M19 19L8.5 8.5"/><path d="M12.5 5.5l3-3 4 4-3 3zM11.5 5.5l-3-3-4 4 3 3z"/></svg>',
  avail: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 20L20 4"/></svg>',
  break: '<svg viewBox="0 0 24 24"><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/></svg>',
  rest: '<svg viewBox="0 0 24 24"><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/></svg>'
};
function proFavs() { const f = (PRO.favs || []).filter((k) => PRO_RULES[k]); return f.length ? f : Object.keys(PRO_RULES); }
/* App fermée pendant la conduite automatique : on ne compte pas le temps où ROUTA ne voyait rien comme de la conduite */
(function proResume() {
  const c = PRO.segs[PRO.segs.length - 1];
  if (PRO.on && PRO.auto && c && !c.e && c.a === 'drive' && PRO.lastTick && Date.now() - PRO.lastTick > 5 * MIN) { c.e = PRO.lastTick; PRO.segs.push({ a: 'break', s: PRO.lastTick, e: null }); store.set('routa.pro', PRO); }
})();
function proCur() { const s = PRO.segs[PRO.segs.length - 1]; return s && !s.e ? s : null; }
function proSet(a, at) {
  at = at || Date.now();
  const c = proCur();
  if (c && c.a === a) return;
  if (c) c.e = at;
  if (a) PRO.segs.push({ a, s: at, e: null });
  proSave(); proTick(true);
}
const segDur = (s, from, to) => Math.max(0, Math.min(s.e || Date.now(), to || Date.now()) - Math.max(s.s, from || 0));
function proStats() {
  const R = PRO_RULES[proRegime()], now = Date.now(), segs = PRO.segs;
  /* début de la journée de travail : après le dernier repos d'au moins 9 h sans conduite ni travail */
  const acts = segs.filter((s) => s.a === 'drive' || s.a === 'work' || s.a === 'avail');
  let shiftStart = acts.length ? acts[0].s : now;
  for (let i = 1; i < acts.length; i++) { if (acts[i].s - (acts[i - 1].e || now) >= R.restRed) shiftStart = acts[i].s; }
  const lastEnd = acts.length ? (acts[acts.length - 1].e || now) : 0;
  if (!acts.length || now - lastEnd >= R.restRed) shiftStart = now;
  /* conduite continue depuis la dernière pause valable (45 min, ou en 2 fois) */
  let cont = 0, partial = false;
  segs.forEach((s) => {
    if ((s.e || now) < shiftStart) return;
    const d = segDur(s, shiftStart);
    if (s.a === 'drive') cont += d;
    else if (s.a !== 'break' && s.a !== 'rest') return; // le travail et la disponibilité ne sont pas des pauses
    else if (d >= 45 * MIN) { cont = 0; partial = false; }
    else if (d >= 30 * MIN && partial) { cont = 0; partial = false; }
    else if (d >= R.split1) partial = true;
  });
  const sum = (from, to) => segs.filter((s) => s.a === 'drive').reduce((t, s) => t + segDur(s, from, to), 0);
  const day = sum(shiftStart);
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const monday = d0.getTime() - ((d0.getDay() + 6) % 7) * 24 * H;
  const week = sum(monday), prevWeek = sum(monday - 7 * 24 * H, monday);
  /* temps de travail = conduite + travail (la disponibilité et les pauses n'en font pas partie) */
  const wsum = (from, to) => segs.filter((s) => s.a === 'drive' || s.a === 'work').reduce((t, s) => t + segDur(s, from, to), 0);
  const work = wsum(shiftStart), wweek = wsum(monday);
  let wcont = 0;
  segs.forEach((s) => {
    if ((s.e || now) < shiftStart) return;
    const d = segDur(s, shiftStart);
    if (s.a === 'drive' || s.a === 'work') wcont += d;
    else if (s.a === 'break' && d >= R.wbreak) wcont = 0;
  });
  const amp = acts.length && shiftStart < now ? now - shiftStart : 0;
  return { R, shiftStart, cont, day, week, two: week + prevWeek, work, wweek, wcont, amp, restBy: acts.length && shiftStart < now ? shiftStart + 24 * H - R.rest : null };
}
const hm = (ms) => { const m = Math.max(0, Math.round(ms / MIN)); return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); };

/* petit compteur sur la carte */
const proChip = el('<button class="prochip" id="proChip" hidden aria-label="' + TRX('Temps de conduite') + '"><span class="pcdot"></span><span class="pctxt"></span></button>');
document.body.appendChild(proChip);
proChip.onclick = () => openPro();
let stopSince = 0;
const proWarned = {};
function proWarn(key, msg) { if (proWarned[key]) return; proWarned[key] = true; vibrate([80, 60, 80]); toast(msg, { action: TRX('Parkings proches'), onAction: () => A.openK && A.openK('parking'), ms: 10000 }); }
function proTick(force) {
  if (!PRO.on) { proChip.hidden = true; return; }
  const kmh = (S.speed || 0) * 3.6, now = Date.now();
  if (PRO.auto && S.pos) {
    const c = proCur();
    if (kmh > 8) { stopSince = 0; if (!c || c.a !== 'drive') proSet('drive'); }
    else if (c && c.a === 'drive') { if (!stopSince) stopSince = now; if (now - stopSince > 3 * MIN) proSet('break', stopSince); }
  }
  const st = proStats(), R = st.R, cur = proCur();
  const left = R.cont - st.cont;
  proChip.hidden = false;
  proChip.querySelector('.pctxt').textContent = (cur && cur.a === 'drive' ? '' : (cur ? ACT[cur.a] + ' · ' : '')) + hm(st.cont) + ' / 4 h 30';
  proChip.classList.toggle('warn', left < 30 * MIN && left > 0);
  proChip.classList.toggle('over', left <= 0);
  const k = Math.floor(st.shiftStart / MIN);
  if (st.cont < 10 * MIN) { delete proWarned.c30; delete proWarned.c0; }
  if (left <= 30 * MIN && left > 0) proWarn('c30', TRX('Pause obligatoire dans {t} (45 min après 4 h 30 de conduite).', { t: '<b>' + hm(left) + '</b>' }));
  if (left <= 0) proWarn('c0', '<b>' + TRX('Pause obligatoire : 4 h 30 de conduite atteintes. Arrête-toi 45 minutes.') + '</b>');
  if (R.day - st.day <= 30 * MIN) proWarn('d' + k, TRX('Plus que {t} de conduite aujourd\'hui (limite {l}).', { t: '<b>' + hm(R.day - st.day) + '</b>', l: hm(R.day) }));
  if (st.wcont < 10 * MIN) { delete proWarned.w30; delete proWarned.w0; }
  if (R.workCont - st.wcont <= 30 * MIN && R.workCont - st.wcont > 0) proWarn('w30', TRX('Pause de travail obligatoire dans {t} ({l} de travail au maximum sans pause).', { t: '<b>' + hm(R.workCont - st.wcont) + '</b>', l: hm(R.workCont) }));
  if (st.wcont >= R.workCont) proWarn('w0', '<b>' + TRX('Pause obligatoire : {l} de travail sans pause atteintes.', { l: hm(R.workCont) }) + '</b>');
  if (st.amp >= 24 * H - R.rest - 30 * MIN) proWarn('a' + k, TRX('Ta journée arrive à {t} : avec 11 h de repos, elle ne peut pas dépasser 13 h (15 h avec un repos réduit de 9 h).', { t: '<b>' + hm(st.amp) + '</b>' }));
  if (R.week - st.week <= 2 * H) proWarn('w' + Math.floor(now / (7 * 24 * H)), TRX('Plus que {t} de conduite cette semaine.', { t: '<b>' + hm(R.week - st.week) + '</b>' }));
  const v = A.veh ? A.veh() : {};
  const h = new Date().getHours(), sunday = new Date().getDay() === 0, cc = A.S.country || 'CH';
  if (cc === 'FR' && v.type === 'camion' && ((v.dims && v.dims.weight) || 0) > 7.5 && kmh > 8 && frHgvBan(new Date())) proWarn('banfr' + new Date().toDateString() + (h >= 22 ? 'n' : ''), TRX('Poids lourd de plus de 7,5 t : en France, la circulation est interdite du samedi 22 h au dimanche 22 h et la veille des jours fériés dès 22 h, sauf dérogation.'));
  if (cc === 'CH' && v.isHgv && kmh > 8 && (h >= 22 || h < 5 || sunday)) proWarn('ban' + new Date().toDateString() + (h >= 22 || h < 5 ? 'n' : 's'), TRX('Poids lourd : la circulation est interdite en Suisse la nuit (22 h – 5 h) et le dimanche, sauf autorisation.'));
  if (force && S.sheetView === 'pro') openPro();
}
setInterval(() => { proTick(false); if (PRO.on) { PRO.lastTick = Date.now(); store.set('routa.pro', PRO); } }, 5000);

function openPro() {
  const reg = proRegime(), st = PRO.on ? proStats() : null, cur = proCur();
  const bar = (v, max) => '<div class="probar"><i style="width:' + Math.min(100, Math.round(v / max * 100)) + '%"' + (v >= max ? ' class="over"' : v >= max * 0.9 ? ' class="warn"' : '') + '></i></div>';
  const R = PRO_RULES[reg];
  const body = openSheet('Temps de conduite (pro)',
    '<label class="switch" for="proOn"><span><b>Activer le mode pro</b><br><span class="muted small">Compteur de conduite et de pauses sur la carte</span></span><input type="checkbox" id="proOn"' + (PRO.on ? ' checked' : '') + '></label>' +
    (PRO.on && cur ? '<div class="prostatus pa-' + cur.a + '"><span class="psl">' + esc(TRX('En ce moment')) + '</span><b>' + esc(TRX(ACT[cur.a])) + '</b><span>' + esc(TRX('depuis {t}', { t: fmtClock(new Date(cur.s)) })) + ' · ' + hm(Date.now() - cur.s) + '</span></div>' : '') +
    '<label class="field" for="proRegSel"><span>' + esc(TRX('Mode de règles')) + '</span><select id="proRegSel">' + proFavs().map((k) => '<option value="' + k + '"' + (k === reg ? ' selected' : '') + '>' + esc(PRO_RULES[k].label) + '</option>').join('') + '</select></label>' +
    '<details class="proedit"><summary>' + esc(TRX('Personnaliser la liste des modes')) + '</summary>' + Object.keys(PRO_RULES).map((k) => '<label class="switch" for="prf_' + k + '"><span><b>' + esc(PRO_RULES[k].label) + '</b></span><input type="checkbox" id="prf_' + k + '"' + (proFavs().includes(k) ? ' checked' : '') + '></label>').join('') + '</details>' +
    '<p class="muted small">' + esc(TRX(R.sub)) + '</p>' +
    (PRO.on ? (
      '<div class="proacts big n' + actBtns(R).length + '">' + actBtns(R).map((a) => '<button data-a="' + a + '" class="pa-' + a + (cur && cur.a === a ? ' on' : '') + '" aria-pressed="' + (cur && cur.a === a ? 'true' : 'false') + '"><span class="paico">' + PA_ICO[a] + '</span>' + esc(TRX(ACT[a])) + '</button>').join('') + '</div>' +
      '<p class="muted small">' + esc(TRX(R.avail ? 'Travail : attente du client, chargement, déchargement, nettoyage… Disponibilité : attente dont la durée est connue d\'avance, sans être au poste de travail.' : 'Travail : attente du client, chargement, nettoyage… L\'attente compte comme du travail.')) + '</p>' +
      '<div class="procard"><div class="prorow"><b>' + esc(TRX('Travail aujourd\'hui')) + '</b><span>' + hm(st.work) + '</span></div><span class="muted small">' + esc(TRX('Conduite + travail, sans les pauses ni la disponibilité.')) + '</span>' +
        '<div class="prorow"><span>' + esc(TRX('Depuis la dernière pause')) + '</span><span>' + hm(st.wcont) + ' / ' + hm(R.workCont) + '</span></div>' + bar(st.wcont, R.workCont) +
        '<span class="muted small">' + esc(TRX(reg === 'otr2' ? 'Pause d\'au moins 20 min jusqu\'à 7 h de travail, 30 min jusqu\'à 9 h, 1 h au-delà (en blocs de 20 min possible).' : 'Pause d\'au moins 30 min si la journée compte 6 à 9 h de travail, 45 min au-delà de 9 h (en blocs de 15 min possible).')) + '</span></div>' +
      (st.amp ? '<div class="procard"><div class="prorow"><b>' + esc(TRX('Durée de la journée')) + '</b><span>' + hm(st.amp) + ' / 13 h 00</span></div>' + bar(st.amp, 13 * H) + '<span class="muted small">' + esc(TRX('Depuis la fin du dernier repos. Le repos de 11 h (9 h trois fois par semaine) doit tenir dans les 24 h : la journée dure donc au plus 13 h, ou 15 h avec un repos réduit.')) + '</span></div>' : '') +
      '<div class="procard"><div class="prorow"><b>' + esc(TRX('Travail cette semaine')) + '</b><span>' + hm(st.wweek) + ' / ' + hm(R.wweek) + '</span></div>' + bar(st.wweek, R.wweek) + '<span class="muted small">' + esc(TRX(reg === 'otr1' ? '48 h en moyenne sur 26 semaines, 60 h au maximum en une semaine.' : reg === 'ue' ? '48 h en moyenne sur 4 mois, 60 h au maximum en une semaine (directive 2002/15/CE).' : '48 h par semaine (53 h dans les entreprises de taxis), heures supplémentaires limitées.')) + '</span></div>' +
      '<div class="procard"><div class="prorow"><b>Conduite continue</b><span>' + hm(st.cont) + ' / 4 h 30</span></div>' + bar(st.cont, R.cont) + '<span class="muted small">' + (reg === 'otr2' ? TRX('Puis pause de 45 min (ou 15 + 30 min, ou 30 min / 2 × 20 min si elle est prise plus tôt).') : TRX('Puis pause de 45 min (ou 15 + 30 min).')) + '</span></div>' +
      '<div class="procard"><div class="prorow"><b>Conduite aujourd\'hui</b><span>' + hm(st.day) + ' / ' + hm(R.day) + '</span></div>' + bar(st.day, R.day) + (R.dayExt ? '<span class="muted small">10 h possibles deux fois par semaine.</span>' : '') + '</div>' +
      '<div class="procard"><div class="prorow"><b>Conduite cette semaine</b><span>' + hm(st.week) + ' / ' + hm(R.week) + '</span></div>' + bar(st.week, R.week) +
        (R.twoWeeks ? '<span class="muted small">' + TRX('Sur deux semaines : {t}', { t: hm(st.two) + ' / ' + hm(R.twoWeeks) }) + '</span>' : '') + '</div>' +
      (st.restBy ? '<div class="procard"><b>' + TRX('Repos journalier') + '</b><span class="muted small">' + TRX('11 h de repos à commencer au plus tard vers {t} (9 h possibles trois fois par semaine).', { t: fmtClock(new Date(st.restBy)) }) + '</span></div>' : '') +
      '<div class="row wrap"><button class="btn soft grow" id="proPark">Parkings proches</button><button class="btn soft grow" id="proLog">Relevé 14 jours</button></div>' +
      '<p class="muted small">' + esc(TRX('Tout est gardé sur ce téléphone, même après la fermeture de l\'app : mode, temps de conduite, pauses et réglages.')) + '</p><button class="btn ghost block" id="proReset">' + esc(TRX('Remettre les compteurs à zéro')) + '</button>'
    ) : '') +
    '<p class="muted small">' + (reg === 'ue' ? TRX('Aide au respect du règlement (CE) 561/2006. Ne remplace pas le tachygraphe : en cas de contrôle, seul celui-ci fait foi.') : TRX('Aide au respect de l\'{r}. Ne remplace ni le tachygraphe ni le livret de travail : en cas de contrôle, seuls ceux-ci font foi.', { r: reg === 'otr1' ? 'OTR 1 (RS 822.221)' : 'OTR 2 (RS 822.222)' })) + '</p>' +
    '<p class="muted small">' + esc(TRX('Sources')) + (document.documentElement.lang === 'fr' ? ' : ' : ': ') + esc(reg === 'otr1' ? 'OTR 1 (RS 822.221), art. 2, 5, 6, 8, 9' : reg === 'ue' ? 'Règlement (CE) 561/2006, art. 6 à 8 ; directive 2002/15/CE, art. 3 à 5' : 'OTR 2 (RS 822.222), art. 2, 5, 7, 8, 9') + '</p>', 'pro');
  body.querySelector('#proOn').onchange = (e) => { PRO.on = e.target.checked; if (!PRO.on) proSet(null); proSave(); proTick(); openPro(); };
  body.querySelector('#proRegSel').onchange = (e) => { PRO.regime = e.target.value; proSave(); proTick(); openPro(); };
  Object.keys(PRO_RULES).forEach((k) => { const c = body.querySelector('#prf_' + k); if (c) c.onchange = () => { let f = proFavs().filter((x) => x !== k); if (c.checked) f.push(k); f = Object.keys(PRO_RULES).filter((x) => f.includes(x)); if (!f.length) { c.checked = true; return; } PRO.favs = f; if (!f.includes(proRegime())) PRO.regime = f[0]; proSave(); openPro(); }; });
  const rs = body.querySelector('#proReset'); if (rs) rs.onclick = () => { if (rs.dataset.sure) { PRO.segs = []; proSave(); proTick(); toast(esc(TRX('Compteurs remis à zéro.'))); openPro(); } else { rs.dataset.sure = '1'; rs.textContent = TRX('Touche encore pour confirmer : tout sera effacé'); rs.classList.add('danger'); } };
  body.querySelectorAll('.proacts button').forEach((b) => { b.onclick = () => { PRO.auto = b.dataset.a === 'drive' ? PRO.auto : false; proSet(b.dataset.a); openPro(); }; });
  const pk = body.querySelector('#proPark'); if (pk) pk.onclick = () => A.openK && A.openK('parking');
  const lg = body.querySelector('#proLog'); if (lg) lg.onclick = openProLog;
}
function proLogText() {
  const days = {};
  PRO.segs.forEach((s) => {
    const k = new Date(s.s).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' });
    (days[k] = days[k] || []).push(s);
  });
  return Object.keys(days).map((k) => {
    const list = days[k];
    const drive = list.filter((s) => s.a === 'drive').reduce((t, s) => t + segDur(s), 0);
    const wk = list.filter((s) => s.a === 'drive' || s.a === 'work').reduce((t, s) => t + segDur(s), 0);
    return k + ' – ' + TRX('Conduite') + ' ' + hm(drive) + ' · ' + TRX('Travail') + ' ' + hm(wk) + '\n' + list.map((s) => '  ' + fmtClock(new Date(s.s)) + '–' + (s.e ? fmtClock(new Date(s.e)) : '…') + ' ' + TRX(ACT[s.a])).join('\n');
  }).reverse().join('\n\n');
}
function openProLog() {
  const t = proLogText();
  const body = openSheet('Relevé des 14 derniers jours',
    (t ? '<pre class="prolog">' + esc(t) + '</pre><button class="btn block" id="proShare">Partager le relevé</button>' : '<div class="empty">Aucune activité enregistrée.</div>') +
    '<p class="muted small">Relevé indicatif tenu par ROUTA, gardé uniquement sur ce téléphone.</p>', 'prolog');
  const b = body.querySelector('#proShare');
  if (b) b.onclick = async () => { try { if (navigator.share) await navigator.share({ title: TRX('Relevé de conduite'), text: t }); else { await navigator.clipboard.writeText(t); toast(TRX('Relevé copié.')); } } catch (e) { /* annulé */ } };
}
X.openPro = openPro;
X.openProLog = openProLog;

/* ======================= Ponts, tunnels et passages limités (hauteur, largeur, poids) ======================= */
const parseDim = (v) => {
  if (!v) return null; v = String(v).trim().toLowerCase();
  if (/default|none|unsigned|^no$|below/.test(v)) return null;
  let m = v.match(/^(\d+(?:[.,]\d+)?)\s*(m|t|st)?$/); if (m) return parseFloat(m[1].replace(',', '.'));
  m = v.match(/^(\d+)\s*'\s*(\d+)?/); if (m) return (+m[1]) * 0.3048 + (+(m[2] || 0)) * 0.0254;
  return null;
};
const brg = (a, b) => { const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r), x2 = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r); return (Math.atan2(y, x2) / r + 360) % 360; };
const adiff = (p, q) => { const d = Math.abs(p - q) % 360; return d > 180 ? 360 - d : d; };
const lowChip = el('<div class="lowchip" id="lowChip" hidden role="alert"></div>');
document.body.appendChild(lowChip);
let lowBusy = false, lowAt = 0, lowPos = null, lowList = [];
const lowWarned = {};
const nb = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
async function lowCheck() {
  const v = A.veh ? A.veh() : null;
  if (!v || !v.heavy || !S.pos || !A.overpass) { lowChip.hidden = true; return; }
  const d = v.dims || {};
  if (!lowBusy && (!lowPos || dist(lowPos, S.pos) > 700) && Date.now() - lowAt > 20000) {
    lowBusy = true; lowAt = Date.now(); lowPos = S.pos;
    try {
      const q = '[out:json][timeout:20];way(around:1500,' + S.pos.lat.toFixed(5) + ',' + S.pos.lon.toFixed(5) + ')[highway][highway!~"^(service|footway|cycleway|path|track|pedestrian|steps|bridleway|construction|proposed)$"][~"^(maxheight|maxheight:physical|maxwidth|maxwidth:physical|maxweight)$"~"."];out tags center 300;';
      const els = await A.overpass(q, true);
      lowList = els.filter((e) => e.center).map((e) => ({
        id: e.id, lat: e.center.lat, lon: e.center.lon, name: e.tags.name || e.tags.ref || '',
        h: parseDim(e.tags['maxheight:physical'] || e.tags.maxheight), w: parseDim(e.tags['maxwidth:physical'] || e.tags.maxwidth), t: parseDim(e.tags.maxweight)
      }));
    } catch (e) { /* réseau */ } finally { lowBusy = false; }
  }
  let best = null;
  lowList.forEach((x) => {
    const why = (x.h && d.height && x.h < d.height + 0.05) ? [TRX('Hauteur limitée à {v} m', { v: nb(x.h) }), TRX('ton véhicule : {v}', { v: nb(d.height) + ' m' })]
      : (x.w && d.width && x.w < d.width) ? [TRX('Largeur limitée à {v} m', { v: nb(x.w) }), TRX('ton véhicule : {v}', { v: nb(d.width) + ' m' })]
      : (x.t && d.weight && x.t < d.weight) ? [TRX('Poids limité à {v} t', { v: nb(x.t) }), TRX('ton véhicule : {v}', { v: nb(d.weight) + ' t' })] : null;
    if (!why) return;
    const m = dist(S.pos, x); if (m > 800 || m < 10) return;
    if (S.heading != null && (S.speed || 0) > 2 && adiff(S.heading, brg(S.pos, x)) > 55) return;
    if (!best || m < best.m) best = { x, m, why };
  });
  if (!best) { lowChip.hidden = true; return; }
  lowChip.innerHTML = '<b>' + esc(best.why[0]) + '</b><span>' + fmtDist(Math.round(best.m / 10) * 10) + (best.x.name ? ' · ' + esc(best.x.name) : '') + ' · ' + esc(best.why[1]) + '</span>';
  lowChip.hidden = false;
  if (!lowWarned[best.x.id]) { lowWarned[best.x.id] = true; vibrate([120, 80, 120]); toast(TRX('Attention : {w} dans {d} ({v}).', { w: esc(best.why[0]), d: fmtDist(Math.round(best.m / 10) * 10), v: esc(best.why[1]) }), { ms: 9000 }); }
}
setInterval(lowCheck, 4000);

/* ======================= Hauteur réelle de la barre de navigation ======================= */
/* La vitesse, les panneaux et les boutons se placent toujours au-dessus, quelle que soit la taille du téléphone */
(function () {
  const bar = $('navBar'); if (!bar) return;
  const set = () => { const h = bar.hidden ? 0 : Math.round(bar.getBoundingClientRect().height); if (h) document.documentElement.style.setProperty('--navH', h + 'px'); };
  if (window.ResizeObserver) new ResizeObserver(set).observe(bar);
  new MutationObserver(set).observe(bar, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', set);
  set();
})();

/* ======================= Démarrage ======================= */
async function start() {
  for (let i = 0; i < 40 && !(S.me && S.me.pseudo && DB.sb); i++) await new Promise((r) => setTimeout(r, 500));
  if (!S.me || !S.me.pseudo) { setTimeout(start, 3000); return; }
  drawParked(); carnetReminders();
  await loadEvents(); setInterval(loadEvents, 5 * 60000);
  if (X.convoy) { subscribeConvoy(); loadConvoyMsgs(); }
  const qs = new URLSearchParams(location.search);
  if (qs.get('convoi')) { if (await joinConvoy(qs.get('convoi'))) openConvoy(); history.replaceState(null, '', location.pathname); }
  else if (qs.get('event')) { const id = qs.get('event'); history.replaceState(null, '', location.pathname); setTimeout(() => openEvent(id), 800); }
}
start();
})();
