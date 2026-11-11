/* ROUTA – amis, convois, rassemblements, points, partage de trajet, navigation TomTom,
   bornes et parkings libres, cols et météo, carnet de la voiture, voiture garée. */
(function () {
'use strict';
const A = window.ROUTA; if (!A) return;
const { S, DB, map, CFG, esc, ic, el, toast, openSheet, closeSheet, say, vibrate, uuid, dist, fmtDist, fmtDur, fmtClock, ago, store, saveMe, pushPresence, addFriend, openThread, chooseDestination, initials } = A;
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
async function getJson(url, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 9000);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); } finally { clearTimeout(t); }
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
function icsDownload(title, start, minutes, lat, lon, desc) {
  const f = (d) => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
  const end = new Date(start.getTime() + (minutes || 120) * 60000);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ROUTA//FR', 'BEGIN:VEVENT', 'UID:' + uuid() + '@routa', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(start), 'DTEND:' + f(end),
    'SUMMARY:' + title.replace(/[,;]/g, ' '), 'DESCRIPTION:' + (desc || '').replace(/\n/g, ' ').replace(/[,;]/g, ' '), lat != null ? 'GEO:' + lat + ';' + lon : '',
    'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:' + title.replace(/[,;]/g, ' '), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'routa.ics'; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
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
async function openRanking(scope) {
  scope = scope || 'all';
  const body = openSheet('Classement', '<p class="muted">Chargement…</p>', 'ranking');
  let rows = [];
  if (DB.sb) {
    const { data } = await DB.sb.from('drivers').select('id,pseudo,color,points,car').gt('points', 0).order('points', { ascending: false }).limit(50);
    rows = data || [];
  }
  if (S.sheetView !== 'ranking') return;
  const friendIds = new Set((S.me.friends || []).map((f) => f.id).concat([S.me.id]));
  if (scope === 'friends') rows = rows.filter((r) => friendIds.has(r.id));
  if (!rows.some((r) => r.id === S.me.id)) rows.push({ id: S.me.id, pseudo: S.me.pseudo, color: S.me.color, points: S.me.points || 0, mine: true });
  rows.sort((a, b) => (b.points || 0) - (a.points || 0));
  const myRank = rows.findIndex((r) => r.id === S.me.id) + 1;
  body.innerHTML = '<div class="seg" id="rkSeg"><button data-s="all" class="' + (scope === 'all' ? 'on' : '') + '">Tout le monde</button><button data-s="friends" class="' + (scope === 'friends' ? 'on' : '') + '">Mes amis</button></div>' +
    '<div class="card"><div class="grow"><b>Toi : ' + (S.me.points || 0) + ' points</b><div class="sub">' + myRank + (myRank === 1 ? 'er' : 'e') + ' du classement</div></div></div>' +
    rows.slice(0, 30).map((r, i) => '<div class="card' + (r.id === S.me.id ? ' meRow' : '') + '"><div class="rank">' + (i + 1) + '</div><div class="ico" style="background:' + esc(r.color || '#FF8A3D') + ';border-radius:22px">' + esc(initials(r.pseudo)) + '</div><div class="grow"><b>' + esc(r.pseudo || 'Conducteur') + '</b>' + (r.car ? '<div class="sub">' + esc(r.car) + '</div>' : '') + '</div><div class="val">' + (r.points || 0) + '</div></div>').join('') +
    '<p class="muted small">Points : alerte signalée +10, alerte confirmée +2, spot ajouté +20, prix signalé +5, avis +3.</p>';
  body.querySelectorAll('#rkSeg button').forEach((b) => { b.onclick = () => openRanking(b.dataset.s); });
}

/* ======================= Amis : demandes depuis la carte ======================= */
const isFriendId = (id) => (S.me.friends || []).some((f) => f.id === id);
let pendingReq = store.get('routa.freq', []);
const saveReq = () => store.set('routa.freq', pendingReq);
X.requestFriend = async (d) => {
  if (isFriendId(d.id)) { toast('Vous êtes déjà amis.'); return; }
  const ok = await DB.sendMsg({ id: uuid(), from_id: S.me.id, from_name: S.me.pseudo, to_id: d.id, kind: 'friend_req', body: S.me.car || null, created_at: nowIso() });
  if (ok) { addFriend({ id: d.id, pseudo: d.pseudo }); toast('Demande envoyée à <b>' + esc(d.pseudo) + '</b>. Dès qu\'il accepte, vous vous voyez sur la carte.'); }
};
async function acceptFriend(r) {
  addFriend({ id: r.id, pseudo: r.pseudo });
  pendingReq = pendingReq.filter((x) => x.id !== r.id); saveReq(); updateTileBadge();
  await DB.sendMsg({ id: uuid(), from_id: S.me.id, from_name: S.me.pseudo, to_id: r.id, kind: 'friend_ok', body: null, created_at: nowIso() });
}
function refuseFriend(r) { pendingReq = pendingReq.filter((x) => x.id !== r.id); saveReq(); updateTileBadge(); }
function handleFriendMsg(m, live) {
  if (m.kind === 'friend_req' && m.to_id === S.me.id) {
    if (isFriendId(m.from_id)) return true;
    if (!pendingReq.some((x) => x.id === m.from_id)) { pendingReq.push({ id: m.from_id, pseudo: m.from_name || 'Conducteur', car: m.body || '', at: m.created_at }); saveReq(); }
    if (live) {
      vibrate([60, 40, 60]);
      const r = pendingReq.find((x) => x.id === m.from_id);
      toast('<b>' + esc(r.pseudo) + '</b> veut t\'ajouter en ami', { action: 'Accepter', onAction: () => { acceptFriend(r); }, ms: 12000 });
    }
    updateTileBadge(); return true;
  }
  if (m.kind === 'friend_ok' && m.to_id === S.me.id) {
    if (!isFriendId(m.from_id)) addFriend({ id: m.from_id, pseudo: m.from_name || 'Conducteur' });
    if (live) toast('<b>' + esc(m.from_name || 'Ton ami') + '</b> a accepté ta demande d\'ami.');
    return true;
  }
  return false;
}
X.onMsg = (m) => {
  if (m.kind === 'friend_req' || m.kind === 'friend_ok') return handleFriendMsg(m, true);
  return false;
};
function sweepMessages() {
  if (!Array.isArray(S.messages)) return;
  const keep = [];
  S.messages.forEach((m) => { if (m.kind === 'friend_req' || m.kind === 'friend_ok') handleFriendMsg(m, false); else keep.push(m); });
  if (keep.length !== S.messages.length) S.messages.splice(0, S.messages.length, ...keep);
}
function openFriends() {
  sweepMessages();
  const fr = S.me.friends || [];
  const body = openSheet('Amis et conducteurs',
    '<div class="row wrap hubrow"><button class="btn soft grow" id="hubDrivers">Conducteurs autour</button><button class="btn soft grow" id="hubRank">' + IC.trophy + 'Classement · ' + (S.me.points || 0) + ' pts</button><button class="btn soft grow" id="hubShare">' + IC.share + ((X.share && X.share.until > Date.now()) ? 'Position partagée' : 'Partager ma position') + '</button></div>' +
    (pendingReq.length ? '<h3>Demandes reçues</h3>' + pendingReq.map((r, i) => '<div class="card"><div class="ico" style="background:#FF8A3D;border-radius:22px">' + esc(initials(r.pseudo)) + '</div><div class="grow"><b>' + esc(r.pseudo) + '</b><div class="sub">' + esc(r.car || '') + '</div></div><button class="btn small" data-ok="' + i + '">Accepter</button><button class="iconbtn small" data-no="' + i + '" aria-label="Refuser">' + ic('trash') + '</button></div>').join('') : '') +
    '<h3>Mes amis</h3>' +
    (fr.length ? fr.map((f, i) => { const d = S.drivers.get(f.id); const on = d && Date.now() - Date.parse(d.updated_at) < 3 * 60000; return '<div class="card"><div class="ico" style="background:' + esc((d && d.color) || '#4DA3FF') + ';border-radius:22px">' + esc(initials(f.pseudo)) + '</div><div class="grow"><b>' + esc(f.pseudo) + '</b><div class="sub">' + (on ? 'En ligne' + (S.pos && d.lat != null ? ' · ' + fmtDist(dist(S.pos, d)) : '') : 'Hors ligne') + '</div></div><button class="btn small" data-msg="' + i + '">Bump</button></div>'; }).join('') : '<div class="empty">Pas encore d\'amis. Touche un conducteur sur la carte puis « Demander en ami », ou entre le code d\'un pote ci-dessous.</div>') +
    '<form id="frCodeF" class="row"><label class="field grow" for="frCode">Code ami<input id="frCode" maxlength="6" autocapitalize="characters" placeholder="Ex. : K7P2QX"></label><button class="btn" type="submit">Ajouter</button></form>' +
    '<p class="muted small">Ton code : <b class="code">' + esc(S.me.code || '') + '</b></p>', 'friends');
  body.querySelector('#hubDrivers').onclick = () => A.openK('drivers');
  body.querySelector('#hubRank').onclick = () => openRanking('all');
  body.querySelector('#hubShare').onclick = openShareSheet;
  body.querySelectorAll('[data-ok]').forEach((b) => { b.onclick = async () => { await acceptFriend(pendingReq[+b.dataset.ok]); openFriends(); }; });
  body.querySelectorAll('[data-no]').forEach((b) => { b.onclick = () => { refuseFriend(pendingReq[+b.dataset.no]); openFriends(); }; });
  body.querySelectorAll('[data-msg]').forEach((b) => { b.onclick = () => A.bump(fr[+b.dataset.msg]); });
  body.querySelector('#frCodeF').onsubmit = async (e) => {
    e.preventDefault();
    const c = $('frCode').value.trim().toUpperCase();
    if (c.length !== 6) { toast('Le code fait 6 caractères.'); return; }
    if (c === S.me.code) { toast('C\'est ton propre code.'); return; }
    const d = await DB.findByCode(c);
    if (!d) { toast('Code introuvable. Ton ami doit avoir ouvert l\'app au moins une fois.'); return; }
    await X.requestFriend(d); openFriends();
  };
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
  X.convoy = data[0]; saveConvoy(); subscribeConvoy(); await loadConvoyMsgs();
  toast('Tu as rejoint le convoi <b>' + esc(X.convoy.name) + '</b>.'); return true;
}
async function createConvoy(name) {
  const c = { id: code6(), name: name || 'Sortie entre potes', owner: S.me.id, owner_name: S.me.pseudo, created_at: nowIso() };
  const { error } = await DB.sb.from('convoys').insert(c);
  if (error) { toast('Le convoi n\'a pas pu être créé. Réessaie.'); return; }
  X.convoy = c; saveConvoy(); subscribeConvoy(); convoyMsgs = [];
  openConvoy();
  shareLink('ROUTA', 'Rejoins mon convoi « ' + c.name + ' » sur ROUTA :', appUrl() + '?convoi=' + c.id);
}
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
    const { data, error } = await DB.sb.rpc('message_send', { m, s: DB.secret() });
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
  body.querySelector('#cvInvite').onclick = () => shareLink('ROUTA', 'Rejoins mon convoi « ' + c.name + ' » sur ROUTA :', appUrl() + '?convoi=' + c.id);
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
    '<div class="row"><button class="btn soft grow" id="evNav">' + ic('nav') + 'Y aller</button><button class="btn soft grow" id="evCal">' + IC.event + 'Calendrier</button></div>' +
    '<button class="btn soft block" id="evShare">' + IC.share + 'Partager</button>' +
    (mine ? '<button class="btn danger" id="evDel">' + ic('trash') + 'Supprimer</button>' : ''), 'event');
  body.querySelector('#evGoing').onclick = async () => {
    if (going) await DB.sb.from('event_rsvp').delete().eq('event_id', e.id).eq('driver_id', S.me.id);
    else await DB.sb.from('event_rsvp').insert({ event_id: e.id, driver_id: S.me.id, pseudo: S.me.pseudo });
    await loadEvents(); openEvent(e.id);
  };
  body.querySelector('#evNav').onclick = () => { closeSheet(); chooseDestination({ name: e.title, sub: 'Rassemblement', lat: e.lat, lon: e.lon }); };
  body.querySelector('#evCal').onclick = () => icsDownload(e.title, new Date(e.starts_at), 120, e.lat, e.lon, e.description);
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
X.via = []; X.viaFor = null; X.addingVia = null; X.altIdx = 0;
let routeCache = null;
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
    steps.push({ maneuver: { type, modifier: mod, exit: x.roundaboutExitNumber || undefined, location: [x.point.longitude, x.point.latitude] }, name, distance: endD - startD, duration: 0 });
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
X.route = async (from, to) => {
  if (!TT) return null;
  if (X.addingVia) return null;
  if (X.via.length && X.viaFor !== keyOf(to)) { X.via = []; X.viaFor = null; }
  const vias = X.via.filter((v) => !v.done && dist(from, v) > 120);
  const locs = [from].concat(vias, [to]).map((p) => p.lat.toFixed(6) + ',' + p.lon.toFixed(6)).join(':');
  const key = locs + '|' + JSON.stringify(X.opts) + '|' + JSON.stringify(A.veh ? [A.veh().type, A.veh().dims, A.veh().hazmat] : '');
  let routes;
  if (routeCache && routeCache.key === key && Date.now() - routeCache.at < 90000) routes = routeCache.routes;
  else {
    const avoid = [];
    if (X.opts.tolls) avoid.push('tollRoads');
    if (X.opts.motorways) avoid.push('motorways');
    const vv = A.veh ? A.veh() : {}, vd = vv.dims || {};
    const vp = {};
    if (vv.heavy) {
      vp.travelMode = vv.costing === 'bus' ? 'bus' : 'truck';
      if (vd.height) vp.vehicleHeight = vd.height; if (vd.width) vp.vehicleWidth = vd.width; if (vd.length) vp.vehicleLength = vd.length;
      if (vd.weight) vp.vehicleWeight = Math.round(vd.weight * 1000);
      vp.vehicleCommercial = vv.type === 'camping' ? 'false' : 'true';
      if (vv.hazmat) vp.vehicleLoadType = 'otherHazmatGeneral';
    }
    let url = tt('/routing/1/calculateRoute/' + locs + '/json', Object.assign({ traffic: 'true', travelMode: 'car', routeType: 'fastest', instructionsType: 'coded', language: LANG, computeTravelTimeFor: 'all', maxAlternatives: vias.length ? '0' : '2', routeRepresentation: 'polyline' }, vp));
    avoid.forEach((a) => { url += '&avoid=' + a; });
    url += '&sectionType=speedLimit&sectionType=lanes';
    if (X.opts.vignette) url += '&avoidVignette=CHE,AUT,SVN,HUN,CZE,SVK,BGR,ROU,MDA';
    const j = await getJson(url, 9000);
    if (!j.routes || !j.routes.length) throw new Error('no route');
    routes = j.routes.map(convertTT);
    routeCache = { key, at: Date.now(), routes };
  }
  const R = routes[Math.min(X.altIdx, routes.length - 1)];
  R.alts = routes.map((r) => ({ duration: r.duration, total: r.total, delay: r.trafficDelay }));
  R.altIdx = Math.min(X.altIdx, routes.length - 1);
  return R;
};
X.preview = (R, dest, body) => {
  if (X.addingVia) {
    const fin = X.addingVia; X.addingVia = null;
    X.via.push({ name: dest.name, lat: dest.lat, lon: dest.lon }); X.viaFor = keyOf(fin); X.altIdx = 0;
    setTimeout(() => chooseDestination(fin), 50); return;
  }
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
    const o = el('<div class="avoid"><label><input type="checkbox" data-o="tolls"' + (X.opts.tolls ? ' checked' : '') + '> Éviter péages</label><label><input type="checkbox" data-o="motorways"' + (X.opts.motorways ? ' checked' : '') + '> Éviter autoroutes</label><label><input type="checkbox" data-o="vignette"' + (X.opts.vignette ? ' checked' : '') + '> Sans vignette</label></div>');
    o.querySelectorAll('input').forEach((c) => { c.onchange = () => { X.opts[c.dataset.o] = c.checked; store.set('routa.ropts', X.opts); X.altIdx = 0; chooseDestination(dest); }; });
    box.appendChild(o);
  }
  if (X.via.length && X.viaFor === keyOf(dest)) {
    box.appendChild(el('<h3>Étapes</h3>'));
    X.via.forEach((v, i) => { const c = el('<div class="card"><div class="ico" style="background:#4DA3FF">' + (i + 1) + '</div><div class="grow"><b>' + esc(v.name) + '</b></div><button class="iconbtn small" aria-label="Retirer">' + ic('trash') + '</button></div>'); c.querySelector('button').onclick = () => { X.via.splice(i, 1); chooseDestination(dest); }; box.appendChild(c); });
  }
  go.parentNode.insertBefore(box, go.nextSibling);
  routeWeather(R, box);
};
setInterval(() => {
  if (!S.nav || !S.pos || !X.via.length) return;
  const v = X.via.find((x) => !x.done);
  if (v && dist(S.pos, v) < 80) { v.done = true; toast('Étape atteinte : <b>' + esc(v.name) + '</b>'); say('Étape atteinte'); }
}, 3000);

/* ======================= Voies à suivre (comme Google Maps / Waze) ======================= */
const LANE_ROT = { STRAIGHT: 0, SLIGHT_RIGHT: 45, RIGHT: 90, SHARP_RIGHT: 135, SLIGHT_LEFT: -45, LEFT: -90, SHARP_LEFT: -135, U_TURN: 180 };
const laneSvg = (dir) => { const r = LANE_ROT[dir] == null ? 0 : LANE_ROT[dir]; return '<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(' + r + ' 12 14)"><path d="M12 21V7"/><path d="M7 11l5-5 5 5"/></g></svg>'; };
let laneEl = null, laneKey = '';
setInterval(() => {
  const N = S.nav, box = $('navBanner');
  if (!laneEl && box) { laneEl = el('<div class="lanebar" id="laneBar" hidden aria-label="' + TRX('Voies à suivre') + '"></div>'); box.insertBefore(laneEl, $('navThen')); }
  if (!laneEl) return;
  if (!N || !N.R || !N.R.lanes) { laneEl.hidden = true; laneKey = ''; return; }
  const along = N.along || 0;
  const sec = N.R.lanes.find((s) => s.e > along && s.s - along < 900);
  if (!sec) { laneEl.hidden = true; laneKey = ''; return; }
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
  if (!N || !N.R || !N.R.limits || !S.settings.showLimit) { box.hidden = true; limShownCur = null; return; }
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
  if (nx && d > 0 && d < 800) {
    box.hidden = false; box.querySelector('.ln-sign').textContent = nx; box.querySelector('.ln-dist').textContent = 'dans ' + fmtDist(Math.round(d / 10) * 10);
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
    box.insertBefore(el(html), box.firstChild);
  } catch (e) { /* météo indisponible */ }
}
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

/* ======================= Parkings libres en direct (ParkenDD) ======================= */
let pkCities = null;
async function openFreeParking() {
  const c = here();
  const body = openSheet('Parkings libres', '<p class="muted">Recherche des parkings en direct…</p>', 'parkfree');
  try {
    if (!pkCities) pkCities = (await getJson('https://api.parkendd.de/', 9000)).cities || {};
    const near = Object.entries(pkCities).filter(([, v]) => v.active_support && v.coords).map(([k, v]) => ({ k, name: v.name, d: dist(c, { lat: v.coords.lat, lon: v.coords.lng }) })).sort((a, b) => a.d - b.d);
    const city = near[0];
    if (!city || city.d > 40000) { body.innerHTML = '<div class="empty">Pas de parkings en direct près d\'ici. Villes couvertes en Suisse : Zurich, Bâle et quelques autres. Utilise « Parking » dans les raccourcis pour voir tous les parkings.</div>'; return; }
    const j = await getJson('https://api.parkendd.de/' + encodeURIComponent(city.k), 9000);
    if (S.sheetView !== 'parkfree') return;
    const lots = (j.lots || []).filter((l) => l.coords).map((l) => Object.assign(l, { d: dist(c, { lat: l.coords.lat, lon: l.coords.lng }) })).sort((a, b) => a.d - b.d).slice(0, 25);
    body.innerHTML = '<p class="muted small">' + esc(city.name) + ' · mis à jour ' + (j.last_updated ? fmtClock(new Date(j.last_updated + 'Z')) : '') + '</p>' +
      lots.map((l, i) => { const open = l.state === 'open'; const ratio = l.total ? l.free / l.total : 0; const cls = !open ? '' : ratio > 0.15 ? 'ok' : 'warn'; return '<button class="card tap" data-i="' + i + '"><div class="ico" style="background:#4DA3FF">' + IC.park + '</div><div class="grow"><b>' + esc(l.name) + '</b><div class="sub">' + fmtDist(l.d) + (l.address ? ' · ' + esc(l.address) : '') + '</div></div><span class="pill ' + cls + '">' + (open ? l.free + ' libres' : 'Fermé') + '</span></button>'; }).join('') +
      '<p class="muted small">Données : ParkenDD, d\'après les systèmes de guidage des villes.</p>';
    body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const l = lots[+b.dataset.i]; closeSheet(); chooseDestination({ name: l.name, sub: 'Parking', lat: l.coords.lat, lon: l.coords.lng }); }; });
  } catch (e) { body.innerHTML = '<div class="empty">Service de parkings indisponible pour le moment.</div>'; }
}

/* ======================= Carnet de la voiture ======================= */
let carnet = store.get('routa.carnet', { dates: {}, fills: [] });
const saveCarnet = () => store.set('routa.carnet', carnet);
const DUE = [['expertise', 'Expertise (contrôle technique)'], ['service', 'Prochain service'], ['tyres', 'Changement de pneus'], ['insurance', 'Assurance'], ['vignette', 'Vignette'], ['other', 'Autre rappel']];
function consumption() {
  const f = carnet.fills.filter((x) => x.km && x.liters).sort((a, b) => a.km - b.km);
  if (f.length < 2) return null;
  const km = f[f.length - 1].km - f[0].km; const l = f.slice(1).reduce((s, x) => s + x.liters, 0);
  return km > 0 ? (l / km * 100) : null;
}
function openCarnet() {
  const cons = consumption();
  const spent = carnet.fills.reduce((s, x) => s + (x.price || 0), 0);
  const body = openSheet('Carnet de la voiture',
    '<h3>Rappels</h3>' + DUE.map(([k, l]) => { const v = carnet.dates[k] || ''; const days = v ? Math.ceil((Date.parse(v) - Date.now()) / 86400000) : null; return '<label class="field" for="cd_' + k + '">' + l + (days != null ? ' <span class="pill ' + (days < 0 ? 'warn' : days <= 30 ? 'warn' : 'ok') + '">' + (days < 0 ? 'dépassé' : 'dans ' + days + ' j') + '</span>' : '') + '<input id="cd_' + k + '" type="date" value="' + esc(v) + '"></label>'; }).join('') +
    '<button class="btn soft block" id="cdIcs">' + IC.event + 'Ajouter les rappels au calendrier</button>' +
    '<h3>Pleins</h3>' +
    '<div class="row"><label class="field grow" for="fKm">Km au compteur<input id="fKm" type="number" inputmode="numeric"></label><label class="field grow" for="fL">Litres<input id="fL" type="number" step="0.01" inputmode="decimal"></label><label class="field grow" for="fP">Prix total<input id="fP" type="number" step="0.05" inputmode="decimal"></label></div>' +
    '<button class="btn block" id="fAdd">Ajouter le plein</button>' +
    (cons ? '<div class="card"><div class="grow"><b>Consommation moyenne : ' + cons.toFixed(1) + ' L/100 km</b><div class="sub">' + carnet.fills.length + ' pleins · ' + spent.toFixed(2) + ' au total</div></div></div>' : '<p class="muted small">Note au moins deux pleins (en faisant le plein complet) pour calculer ta consommation.</p>') +
    carnet.fills.slice(-8).reverse().map((f) => '<div class="card"><div class="grow"><b>' + (f.liters || '?') + ' L · ' + (f.price != null ? f.price.toFixed(2) : '?') + '</b><div class="sub">' + new Date(f.date).toLocaleDateString('fr-CH') + (f.km ? ' · ' + f.km + ' km' : '') + '</div></div></div>').join('') +
    '<p class="muted small">Ton carnet reste sur ce téléphone.</p>', 'carnet');
  DUE.forEach(([k]) => { body.querySelector('#cd_' + k).onchange = (e) => { carnet.dates[k] = e.target.value; saveCarnet(); openCarnet(); }; });
  body.querySelector('#cdIcs').onclick = () => { const k = DUE.find(([x]) => carnet.dates[x]); if (!k) { toast('Choisis d\'abord une date.'); return; } DUE.forEach(([x, l]) => { if (carnet.dates[x]) icsDownload(l, new Date(carnet.dates[x] + 'T09:00:00'), 30, null, null, 'Rappel ROUTA'); }); };
  body.querySelector('#fAdd').onclick = () => {
    const km = parseInt($('fKm').value, 10) || null, liters = parseFloat($('fL').value) || null, price = parseFloat($('fP').value);
    if (!liters) { toast('Indique au moins les litres.'); return; }
    carnet.fills.push({ date: Date.now(), km, liters, price: isNaN(price) ? null : price }); saveCarnet(); toast('Plein ajouté.'); openCarnet();
  };
}
function carnetReminders() {
  const today = new Date().toISOString().slice(0, 10);
  if (store.get('routa.carnetCheck', '') === today) return;
  store.set('routa.carnetCheck', today);
  DUE.forEach(([k, l]) => { const v = carnet.dates[k]; if (!v) return; const days = Math.ceil((Date.parse(v) - Date.now()) / 86400000); if (days <= 14) toast('<b>' + l + '</b> : ' + (days < 0 ? 'date dépassée' : 'dans ' + days + ' jours') + '.', { action: 'Carnet', onAction: openCarnet, ms: 9000 }); });
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
    (parked ? '<div class="card"><div class="ico" style="background:#FFC24D">' + IC.car + '</div><div class="grow"><b>Garée ' + ago(new Date(parked.at).toISOString()) + '</b><div class="sub">' + (S.pos ? 'à ' + fmtDist(dist(S.pos, parked)) : '') + (left != null ? ' · ' + (left > 0 ? 'parking payé encore ' + left + ' min' : 'temps de parking dépassé') : '') + '</div></div></div>' +
      '<div class="row"><button class="btn grow" id="pkGo">' + ic('nav') + 'Y retourner</button><button class="btn soft grow" id="pkShow">Voir</button></div>' : '<p>Aucune position enregistrée. Elle s\'enregistre toute seule à la fin d\'une navigation, ou avec le bouton ci-dessous.</p>') +
    '<button class="btn soft block" id="pkHere">' + IC.car + 'Ma voiture est garée ici</button>' +
    '<button class="btn soft block" id="pkFree">' + IC.park + 'Parkings libres autour (en direct)</button>' +
    '<h3>Rappel de fin de parking</h3><div class="row wrap" id="pkTimer">' + [30, 60, 90, 120, 180].map((m) => '<button class="pill tap" data-m="' + m + '">' + (m < 60 ? m + ' min' : (m / 60) + ' h') + '</button>').join('') + '</div>' +
    (parked ? '<button class="btn danger" id="pkClear">Effacer</button>' : ''), 'parked');
  const g = body.querySelector('#pkGo'); if (g) g.onclick = () => { closeSheet(); chooseDestination({ name: 'Ma voiture', sub: 'Voiture garée', lat: parked.lat, lon: parked.lon }); };
  const sh = body.querySelector('#pkShow'); if (sh) sh.onclick = () => { closeSheet(); map.flyTo({ center: [parked.lon, parked.lat], zoom: 17 }); };
  body.querySelector('#pkFree').onclick = openFreeParking;
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
  if (S.pos) { saveParked(S.pos); setTimeout(() => toast('Position de ta voiture enregistrée.', { action: 'Rappel parking', onAction: openParked, ms: 8000 }), 1500); }
  X.via = []; X.viaFor = null;
};

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
function updateTileBadge() { const b = $('menuBadge'); if (b && pendingReq.length && b.hidden) { b.hidden = false; b.textContent = pendingReq.length; } }
X.tiles = () => [
  ['friends', IC.users, 'Amis' + (pendingReq.length ? ' <span class="badge">' + pendingReq.length + '</span>' : '')],
  ['convoy', IC.convoy, X.convoy ? 'Convoi · ' + esc(X.convoy.name) : 'Convoi'],
  ['events', IC.event, 'Rassemblements'],
  ['ranking', IC.trophy, 'Classement · ' + (S.me.points || 0) + ' pts'],
  ['shareme', IC.share, (X.share && X.share.until > Date.now()) ? 'Position partagée' : 'Partager ma position'],
  ['chargers', IC.plug, 'Bornes libres'],
  ['parkfree', IC.park, 'Parkings libres'],
  ['cols', IC.mount, 'Cols et météo'],
  ['carnet', IC.book, 'Carnet de la voiture'],
  ['parked', IC.car, 'Ma voiture garée']
];
X.icons = IC;
X.pendingCount = () => pendingReq.length;
X.open = (k) => {
  const f = { install: openInstall, friends: openFriends, convoy: openConvoy, events: openEvents, ranking: () => openRanking('all'), shareme: openShareSheet, chargers: openChargers, parkfree: openFreeParking, cols: openCols, carnet: openCarnet, parked: openParked, trips: openTrips, offline: openOffline, pro: openPro }[k];
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

/* ======================= Un ami est tout près ======================= */
const friendSeen = new Map();
function checkFriendsNear() {
  if (!S.pos || !S.me) return;
  S.drivers.forEach((d) => {
    if (!d || !Array.isArray(d.friends) || !d.friends.includes(S.me.id) || d.lat == null) return;
    if (Date.now() - Date.parse(d.updated_at) > 3 * 60000) return;
    const m = dist(S.pos, d);
    const last = friendSeen.get(d.id) || 0;
    if (m <= 2000 && Date.now() - last > 30 * 60000) {
      friendSeen.set(d.id, Date.now());
      toast(TRX('{n} est à {d} de toi', { n: '<b>' + esc(d.pseudo || TRX('Un ami')) + '</b>', d: fmtDist(m) }), { action: TRX('Voir'), onAction: () => A.openDriver && A.openDriver(d.id), ms: 7000 });
    }
  });
}
setInterval(checkFriendsNear, 15000);

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
async function downloadWeb(lat, lon, prog) {
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
  const urls = extra.concat(regionTiles(lat, lon, OFF_KM, 6, 14).map(([z, x, y]) => tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)));
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
async function openOffline() {
  const info = store.get('routa.offline', null);
  const mb = (b) => Math.max(1, Math.round(b / 1048576)) + ' Mo';
  const body = openSheet('Carte hors connexion',
    '<p>Télécharge la carte autour de toi (environ ' + OFF_KM + ' km) pour la garder dans les tunnels, à la montagne ou sans réseau.</p>' +
    (info ? '<div class="card"><div class="grow"><b>Carte enregistrée</b><div class="sub">' + esc(new Date(info.at).toLocaleDateString()) + (info.bytes ? ' · ' + mb(info.bytes) : '') + '</div></div></div>' : '') +
    '<div id="offProg" class="muted small" hidden></div>' +
    '<button class="btn block" id="offGo">' + (info ? 'Mettre à jour avec ma position actuelle' : 'Télécharger ma région') + '</button>' +
    '<p class="muted small">Environ 30 à 60 Mo : utilise le Wi-Fi de préférence.</p>', 'offline');
  body.querySelector('#offGo').onclick = async () => {
    if (!S.pos) { toast('J\'attends ta position GPS…'); return; }
    const b = body.querySelector('#offGo'), p = body.querySelector('#offProg');
    b.disabled = true; p.hidden = false; p.textContent = 'Préparation…';
    try {
      if (nativeMap() && RMAP.downloadRegion) {
        await RMAP.downloadRegion({ lat: S.pos.lat, lon: S.pos.lon, radiusKm: OFF_KM, styleURL: CFG.mapStyle });
        store.set('routa.offline', { at: Date.now(), lat: S.pos.lat, lon: S.pos.lon, km: OFF_KM, native: true });
        const tick = async () => {
          if (S.sheetView !== 'offline') return;
          try {
            const s = await RMAP.regionStatus();
            if (s && s.exists) {
              const pc = s.total ? Math.min(100, Math.round(s.done / s.total * 100)) : 0;
              p.textContent = s.complete ? 'Carte enregistrée sur ce téléphone.' : TRX('Téléchargement…') + ' ' + pc + ' %';
              if (s.complete) { b.disabled = false; return; }
            }
          } catch (e) { /* */ }
          setTimeout(tick, 1500);
        };
        tick();
      } else {
        await downloadWeb(S.pos.lat, S.pos.lon, (d, t, by) => { p.textContent = TRX('Téléchargement…') + ' ' + Math.round(d / t * 100) + ' % · ' + mb(by); });
        p.textContent = 'Carte enregistrée sur ce téléphone.'; b.disabled = false;
      }
    } catch (e) { p.textContent = 'Le téléchargement n\'a pas abouti. Vérifie ta connexion et réessaie.'; b.disabled = false; }
  };
}
X.openTrips = openTrips;
X.openOffline = openOffline;

/* ======================= Mode pro : temps de conduite et de repos (OTR 1 / OTR 2) ======================= */
/* Aide pour les chauffeurs professionnels. Ne remplace ni le tachygraphe ni le livret de travail. */
const TRX = (s, v) => { let o = (window.ROUTA_I18N && ROUTA_I18N.t) ? ROUTA_I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
const PRO = Object.assign({ on: false, regime: null, auto: true, segs: [] }, store.get('routa.pro', {}));
const H = 3600000, MIN = 60000;
const PRO_RULES = {
  otr1: { label: 'OTR 1', sub: 'Transport de marchandises de plus de 3,5 t, et transport de personnes avec plus de 8 places assises sans compter le conducteur (dès 9 places avec lui)', cont: 4.5 * H, day: 9 * H, dayExt: 10 * H, week: 56 * H, twoWeeks: 90 * H, rest: 11 * H, restRed: 9 * H, split1: 15 * MIN },
  otr2: { label: 'OTR 2', sub: 'Transport professionnel de personnes en voiture légère ou de tourisme (taxis, VTC, limousines) : 8 places passagers au maximum', cont: 4.5 * H, day: 9 * H, dayExt: null, week: 45 * H, twoWeeks: null, rest: 11 * H, restRed: 9 * H, split1: 20 * MIN }
};
const ACT = { drive: 'Conduite', break: 'Pause', work: 'Autre travail', rest: 'Repos' };
function proRegime() { if (PRO.regime) return PRO.regime; const t = (A.veh ? A.veh().type : 'voiture'); return (t === 'camion' || t === 'bus' || t === 'minibus') ? 'otr1' : 'otr2'; }
function proSave() { const cut = Date.now() - 15 * 24 * H; PRO.segs = PRO.segs.filter((s) => !s.e || s.e > cut); store.set('routa.pro', PRO); }
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
  const acts = segs.filter((s) => s.a === 'drive' || s.a === 'work');
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
    else if (d >= 45 * MIN) { cont = 0; partial = false; }
    else if (d >= 30 * MIN && partial) { cont = 0; partial = false; }
    else if (d >= R.split1) partial = true;
  });
  const sum = (from, to) => segs.filter((s) => s.a === 'drive').reduce((t, s) => t + segDur(s, from, to), 0);
  const day = sum(shiftStart);
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const monday = d0.getTime() - ((d0.getDay() + 6) % 7) * 24 * H;
  const week = sum(monday), prevWeek = sum(monday - 7 * 24 * H, monday);
  return { R, shiftStart, cont, day, week, two: week + prevWeek, restBy: acts.length && shiftStart < now ? shiftStart + 24 * H - R.rest : null };
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
  if (R.week - st.week <= 2 * H) proWarn('w' + Math.floor(now / (7 * 24 * H)), TRX('Plus que {t} de conduite cette semaine.', { t: '<b>' + hm(R.week - st.week) + '</b>' }));
  const v = A.veh ? A.veh() : {};
  const h = new Date().getHours(), sunday = new Date().getDay() === 0;
  if (v.isHgv && kmh > 8 && (h >= 22 || h < 5 || sunday)) proWarn('ban' + new Date().toDateString() + (h >= 22 || h < 5 ? 'n' : 's'), TRX('Poids lourd : la circulation est interdite en Suisse la nuit (22 h – 5 h) et le dimanche, sauf autorisation.'));
  if (force && S.sheetView === 'pro') openPro();
}
setInterval(() => proTick(false), 5000);

function openPro() {
  const reg = proRegime(), st = PRO.on ? proStats() : null, cur = proCur();
  const bar = (v, max) => '<div class="probar"><i style="width:' + Math.min(100, Math.round(v / max * 100)) + '%"' + (v >= max ? ' class="over"' : v >= max * 0.9 ? ' class="warn"' : '') + '></i></div>';
  const R = PRO_RULES[reg];
  const body = openSheet('Temps de conduite (pro)',
    '<label class="switch" for="proOn"><span><b>Activer le mode pro</b><br><span class="muted small">Compteur de conduite et de pauses sur la carte</span></span><input type="checkbox" id="proOn"' + (PRO.on ? ' checked' : '') + '></label>' +
    '<div class="seg" id="proReg">' + Object.keys(PRO_RULES).map((k) => '<button data-r="' + k + '" class="' + (k === reg ? 'on' : '') + '">' + PRO_RULES[k].label + '</button>').join('') + '</div>' +
    '<p class="muted small">' + esc(TRX(R.sub)) + '</p>' +
    (PRO.on ? (
      '<div class="proacts">' + Object.keys(ACT).map((a) => '<button data-a="' + a + '" class="' + (cur && cur.a === a ? 'on' : '') + '">' + ACT[a] + '</button>').join('') + '</div>' +
      '<label class="switch" for="proAuto"><span><b>Détection automatique</b><br><span class="muted small">Conduite dès 8 km/h, pause après 3 min à l\'arrêt</span></span><input type="checkbox" id="proAuto"' + (PRO.auto ? ' checked' : '') + '></label>' +
      '<div class="procard"><div class="prorow"><b>Conduite continue</b><span>' + hm(st.cont) + ' / 4 h 30</span></div>' + bar(st.cont, R.cont) + '<span class="muted small">' + (reg === 'otr2' ? TRX('Puis pause de 45 min (ou 15 + 30 min, ou 30 min / 2 × 20 min si elle est prise plus tôt).') : TRX('Puis pause de 45 min (ou 15 + 30 min).')) + '</span></div>' +
      '<div class="procard"><div class="prorow"><b>Conduite aujourd\'hui</b><span>' + hm(st.day) + ' / ' + hm(R.day) + '</span></div>' + bar(st.day, R.day) + (R.dayExt ? '<span class="muted small">10 h possibles deux fois par semaine.</span>' : '') + '</div>' +
      '<div class="procard"><div class="prorow"><b>Conduite cette semaine</b><span>' + hm(st.week) + ' / ' + hm(R.week) + '</span></div>' + bar(st.week, R.week) +
        (R.twoWeeks ? '<span class="muted small">' + TRX('Sur deux semaines : {t}', { t: hm(st.two) + ' / ' + hm(R.twoWeeks) }) + '</span>' : '') + '</div>' +
      (st.restBy ? '<div class="procard"><b>' + TRX('Repos journalier') + '</b><span class="muted small">' + TRX('11 h de repos à commencer au plus tard vers {t} (9 h possibles trois fois par semaine).', { t: fmtClock(new Date(st.restBy)) }) + '</span></div>' : '') +
      '<div class="row wrap"><button class="btn soft grow" id="proPark">Parkings proches</button><button class="btn soft grow" id="proLog">Relevé 14 jours</button></div>'
    ) : '') +
    '<p class="muted small">' + TRX('Aide au respect de l\'{r}. Ne remplace ni le tachygraphe ni le livret de travail : en cas de contrôle, seuls ceux-ci font foi.', { r: reg === 'otr1' ? 'OTR 1 (RS 822.221)' : 'OTR 2 (RS 822.222)' }) + '</p>', 'pro');
  body.querySelector('#proOn').onchange = (e) => { PRO.on = e.target.checked; if (!PRO.on) proSet(null); proSave(); proTick(); openPro(); };
  body.querySelectorAll('#proReg button').forEach((b) => { b.onclick = () => { PRO.regime = b.dataset.r; proSave(); proTick(); openPro(); }; });
  body.querySelectorAll('.proacts button').forEach((b) => { b.onclick = () => { PRO.auto = b.dataset.a === 'drive' ? PRO.auto : false; proSet(b.dataset.a); openPro(); }; });
  const au = body.querySelector('#proAuto'); if (au) au.onchange = (e) => { PRO.auto = e.target.checked; proSave(); };
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
    return k + ' – ' + TRX('Conduite') + ' ' + hm(drive) + '\n' + list.map((s) => '  ' + fmtClock(new Date(s.s)) + '–' + (s.e ? fmtClock(new Date(s.e)) : '…') + ' ' + TRX(ACT[s.a])).join('\n');
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
  setTimeout(sweepMessages, 4000); setTimeout(sweepMessages, 12000);
  drawParked(); carnetReminders();
  await loadEvents(); setInterval(loadEvents, 5 * 60000);
  if (X.convoy) { subscribeConvoy(); loadConvoyMsgs(); }
  const qs = new URLSearchParams(location.search);
  if (qs.get('convoi')) { if (await joinConvoy(qs.get('convoi'))) openConvoy(); history.replaceState(null, '', location.pathname); }
  else if (qs.get('event')) { const id = qs.get('event'); history.replaceState(null, '', location.pathname); setTimeout(() => openEvent(id), 800); }
  updateTileBadge();
}
start();
})();
