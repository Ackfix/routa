/* ROUTA – prototype (navigation, alertes, conducteurs en direct, spots, essence/recharge/parking) */
(function () {
'use strict';

const CFG = window.ROUTA_CONFIG || {};
const VERSION = '0.9.9';
const I18N = window.ROUTA_I18N || { lang: 'fr', t: (s) => s, speech: 'fr-FR', valhalla: 'fr-FR', langs: { fr: 'Français' }, setLang() {} };
const $ = (id) => document.getElementById(id);

/* ======================= Outils ======================= */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const makeCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
const R_EARTH = 6371000;
const toRad = (d) => d * Math.PI / 180;
function dist(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const angleDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
function fmtDist(m) {
  if (m == null || isNaN(m)) return '–';
  if (m < 1000) return (m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50) + ' m';
  return (m < 10000 ? (Math.round(m / 100) / 10).toFixed(1).replace('.', ',') : Math.round(m / 1000)) + ' km';
}
function fmtDur(s) {
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
}
const fmtClock = (d) => d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
  return 'il y a ' + Math.round(s / 86400) + ' j';
}
const initials = (n) => (n || '?').trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ======================= Icônes ======================= */
const P = {
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trou: '<ellipse cx="12" cy="14" rx="8" ry="4"/><path d="M8 8l2 2M16 8l-2 2"/>',
  objet: '<path d="M4 17l4-8h8l4 8z"/><path d="M3 20h18"/>',
  accident: '<path d="M5 16l2-6h10l2 6z"/><path d="M3 16h18v3H3z"/><path d="M12 3v3M6 5l1.5 2M18 5l-1.5 2"/>',
  travaux: '<path d="M12 3l7 18H5z"/><path d="M7.5 15h9M9.5 10h5"/>',
  bouchon: '<rect x="3" y="9" width="7" height="6" rx="2"/><rect x="14" y="9" width="7" height="6" rx="2"/><path d="M3 19h18"/>',
  arret: '<path d="M5 15l2-6h10l2 6v3H5z"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/>',
  glissant: '<path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/>',
  animal: '<path d="M6 20l1-8 5-3 5 3 1 8"/><path d="M9 6l-2-3M15 6l2-3"/>',
  fuel: '<path d="M4 21V5a2 2 0 012-2h7a2 2 0 012 2v16"/><path d="M3 21h13"/><path d="M15 9h2a2 2 0 012 2v5a1.5 1.5 0 003 0V8l-3-3"/><path d="M7 7h5v4H7z"/>',
  charge: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  parking: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M10 17V7h3.5a3 3 0 010 6H10"/>',
  spot: '<path d="M3 20l6-10 4 6 3-4 5 8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  msg: '<path d="M4 5h16v11H9l-5 4z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  nav: '<path d="M12 2l7 19-7-4-7 4z"/>',
  right: '<path d="M7 21V11a4 4 0 014-4h8"/><path d="M15 3l4 4-4 4"/>',
  left: '<path d="M17 21V11a4 4 0 00-4-4H5"/><path d="M9 3L5 7l4 4"/>',
  straight: '<path d="M12 21V4"/><path d="M7 9l5-5 5 5"/>',
  sright: '<path d="M9 21v-8l8-8"/><path d="M11 5h6v6"/>',
  sleft: '<path d="M15 21v-8L7 5"/><path d="M13 5H7v6"/>',
  uturn: '<path d="M8 21V9a5 5 0 0110 0v4"/><path d="M14 10l4 4 4-4"/>',
  round: '<circle cx="12" cy="10" r="4"/><path d="M12 14v7M16 10h4M18 8l2 2-2 2"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h8"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  food: '<path d="M7 3v8a2 2 0 002 2v8M5 3v5M9 3v5M17 21V3c-2 1-3 4-3 7h3"/>',
  shops: '<path d="M4 8h16l-1 12H5z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  truckstop: '<path d="M2 16V6h11v10M13 9h4l3 4v3h-7"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  car: '<path d="M5 15l2-6h10l2 6v3H5z"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/>',
  ev: '<path d="M5 15l2-6h10l2 6v3H5z"/><path d="M12 10l-2 3h3l-2 3"/>',
  camper: '<path d="M2 17V7h13l4 4h3v6"/><path d="M5 10h4v3H5z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  minibus: '<path d="M3 17V7h14l4 5v5H3z"/><path d="M6 10h3M11 10h3"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M8 18v2M16 18v2"/>',
  truck: '<path d="M2 16V6h11v10M13 9h4l3 4v3h-7"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  sign: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/>',
  feu: '<rect x="8" y="2" width="8" height="20" rx="3"/><circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/><path d="M4 4l16 16"/>',
  contresens: '<path d="M12 21V4"/><path d="M7 9l5-5 5 5"/><path d="M4 4l16 16"/>',
  brouillard: '<path d="M4 8h16M2 12h20M4 16h16M7 20h10"/>',
  fermee: '<circle cx="12" cy="12" r="9"/><path d="M6 12h12"/>'
};
const ic = (n) => '<svg aria-hidden="true" viewBox="0 0 24 24">' + (P[n] || P.pin) + '</svg>';

const ALERT_TYPES = {
  trou: { label: 'Trou', say: 'trou dans la chaussée' },
  objet: { label: 'Objet', say: 'objet sur la route' },
  accident: { label: 'Accident', say: 'accident', cls: 'red' },
  travaux: { label: 'Travaux', say: 'travaux' },
  bouchon: { label: 'Bouchon', say: 'bouchon', cls: 'red' },
  arret: { label: 'Véhicule arrêté', say: 'véhicule arrêté' },
  glissant: { label: 'Route glissante', say: 'route glissante', cls: 'blue' },
  animal: { label: 'Animal', say: 'animal sur la route' },
  feu: { label: 'Feu hors service', say: 'feu tricolore hors service' },
  contresens: { label: 'Contresens', say: 'véhicule à contresens', cls: 'red' },
  brouillard: { label: 'Brouillard', say: 'brouillard, visibilité réduite', cls: 'blue' },
  fermee: { label: 'Route fermée', say: 'route fermée', cls: 'red' }
};
const SPOT_CATS = { route: 'Belle route', vue: 'Point de vue', rdv: 'Rassemblement', nuit: 'Parking de nuit', autre: 'Autre' };
const COLORS = ['#FF8A3D', '#4DA3FF', '#3DDC97', '#C9A2FF', '#FF6B9A', '#FFD34D', '#7FE0C2', '#F2F4F7'];
const QUICK_MSGS = ['On se retrouve au spot ?', "J'arrive dans 10 min", 'Tu es où ?', 'Belle caisse !', 'Bien reçu', 'Attention devant'];

/* ======================= Véhicule ======================= */
const VEHICLES = {
  voiture: { label: 'Voiture', icon: 'car' },
  electrique: { label: 'Électrique', icon: 'ev', ev: true },
  hybride: { label: 'Hybride', icon: 'ev', ev: true },
  camping: { label: 'Camping-car', icon: 'camper', heavy: true, costing: 'truck', dims: { height: 3.2, width: 2.3, length: 7.5, weight: 3.5 } },
  minibus: { label: 'Minibus', icon: 'minibus', heavy: true, costing: 'bus', dims: { height: 2.9, width: 2.1, length: 7, weight: 5 } },
  bus: { label: 'Car / bus', icon: 'bus', heavy: true, costing: 'bus', dims: { height: 3.8, width: 2.55, length: 13.5, weight: 19 } },
  camion: { label: 'Poids lourd', icon: 'truck', heavy: true, costing: 'truck', hgv: true, dims: { height: 4, width: 2.55, length: 16.5, weight: 40 } }
};
const DIM_LABELS = [['height', 'Hauteur', 'm'], ['width', 'Largeur', 'm'], ['length', 'Longueur', 'm'], ['weight', 'Poids total', 't']];

/* ======================= État ======================= */
const S = {
  me: store.get('routa.me', null),
  settings: Object.assign({ voice: false, readMsgs: true, night: 'auto', traffic: true, mapType: 'plan', relief3d: false, navNorth: false, showPlaces: true, googleLinks: true, showLimit: true, speedAlert: true, showTransit: false }, store.get('routa.settings', {})),
  vehicle: Object.assign({ type: 'voiture', dims: {}, hazmat: false }, store.get('routa.vehicle', {})),
  recents: store.get('routa.recents', []),
  lastRead: store.get('routa.lastRead', 0),
  pos: null, prevPos: null, heading: 0, speed: null, acc: null,
  follow: true, watchId: null,
  drivers: new Map(), alerts: new Map(), spots: new Map(), messages: [],
  markers: { me: null, drivers: new Map(), alerts: new Map(), spots: new Map(), pois: [], dest: null },
  nav: null, preview: null,
  prompted: new Set(), alertNearId: null,
  poiCache: {}, wakeLock: null, sheetView: null, online: false
};
const saveMe = () => store.set('routa.me', S.me);
const saveSettings = () => store.set('routa.settings', S.settings);
function veh() {
  const v = VEHICLES[S.vehicle.type] || VEHICLES.voiture;
  const dims = Object.assign({}, v.dims || {}, v.heavy ? (S.vehicle.dims || {}) : {});
  const isHgv = !!v.hgv || (S.vehicle.type === 'camping' && (dims.weight || 0) > 3.5);
  return Object.assign({}, v, { type: S.vehicle.type, dims, hazmat: !!S.vehicle.hazmat && S.vehicle.type === 'camion', isHgv });
}
function vehSummary() {
  const v = veh();
  if (!v.heavy) return v.label;
  const d = v.dims;
  return v.label + ' · ' + String(d.height).replace('.', ',') + ' m · ' + String(d.weight).replace('.', ',') + ' t' + (v.hazmat ? ' · ADR' : '');
}

/* ======================= Données (Supabase ou local) ======================= */
const DB = {
  sb: null,
  async init() {
    if (CFG.supabaseUrl && CFG.supabaseKey && window.supabase) {
      try {
        this.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false } });
        const { error } = await this.sb.from('spots').select('id').limit(1);
        if (error) throw error;
        S.online = true;
      } catch (e) {
        console.warn('Supabase indisponible', e);
        this.sb = null; S.online = false;
        toast('Mode solo : la base partagée ne répond pas. Vérifie la configuration.');
      }
    }
  },
  local(k) { return store.get('routa.local.' + k, []); },
  saveLocal(k, v) { store.set('routa.local.' + k, v); },

  async loadAll() {
    if (!this.sb) {
      this.local('alerts').filter((a) => Date.parse(a.expires_at) > Date.now()).forEach((a) => S.alerts.set(a.id, a));
      this.local('spots').forEach((s) => S.spots.set(s.id, s));
      return;
    }
    const since = new Date(Date.now() - 10 * 60000).toISOString();
    const [d, a, s, m] = await Promise.all([
      this.sb.from('drivers').select('*').gte('updated_at', since).limit(500),
      this.sb.from('alerts').select('*').gt('expires_at', new Date().toISOString()).limit(1000),
      this.sb.from('spots').select('*').limit(1000),
      this.sb.from('messages').select('*').or('to_id.eq.' + S.me.id + ',from_id.eq.' + S.me.id).order('created_at', { ascending: false }).limit(200)
    ]);
    (d.data || []).forEach((r) => S.drivers.set(r.id, r));
    (a.data || []).forEach((r) => S.alerts.set(r.id, r));
    (s.data || []).forEach((r) => S.spots.set(r.id, r));
    S.messages = (m.data || []).reverse();
  },

  subscribe() {
    if (!this.sb) return;
    this.sb.channel('routa-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, (p) => {
        if (p.eventType === 'DELETE') S.drivers.delete(p.old.id); else S.drivers.set(p.new.id, p.new);
        renderDrivers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (p) => {
        if (p.eventType === 'DELETE') S.alerts.delete(p.old.id); else S.alerts.set(p.new.id, p.new);
        renderAlerts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, (p) => {
        if (p.eventType === 'DELETE') S.spots.delete(p.old.id); else S.spots.set(p.new.id, p.new);
        renderSpots();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'to_id=eq.' + S.me.id }, (p) => onIncoming(p.new))
      .subscribe();
  },

  async presence(row) {
    if (!this.sb) return;
    const { error } = await this.sb.from('drivers').upsert(row);
    if (error) console.warn(error);
  },
  async addAlert(a) {
    if (!this.sb) { const all = this.local('alerts'); all.push(a); this.saveLocal('alerts', all); S.alerts.set(a.id, a); renderAlerts(); return true; }
    const { error } = await this.sb.from('alerts').insert(a);
    if (error) { toast("L'alerte n'a pas pu être envoyée. Réessaie."); return false; }
    S.alerts.set(a.id, a); renderAlerts(); return true;
  },
  async updateAlert(id, patch) {
    const a = Object.assign({}, S.alerts.get(id), patch);
    S.alerts.set(id, a); renderAlerts();
    if (!this.sb) { this.saveLocal('alerts', this.local('alerts').map((x) => x.id === id ? a : x)); return; }
    await this.sb.from('alerts').update(patch).eq('id', id);
  },
  async deleteAlert(id) {
    S.alerts.delete(id); renderAlerts();
    if (!this.sb) { this.saveLocal('alerts', this.local('alerts').filter((x) => x.id !== id)); return; }
    await this.sb.from('alerts').delete().eq('id', id);
  },
  async addSpot(s) {
    if (!this.sb) { const all = this.local('spots'); all.push(s); this.saveLocal('spots', all); S.spots.set(s.id, s); renderSpots(); return true; }
    const { error } = await this.sb.from('spots').insert(s);
    if (error) { toast("Le spot n'a pas pu être enregistré. Réessaie."); return false; }
    S.spots.set(s.id, s); renderSpots(); return true;
  },
  async deleteSpot(id) {
    S.spots.delete(id); renderSpots();
    if (!this.sb) { this.saveLocal('spots', this.local('spots').filter((x) => x.id !== id)); return; }
    await this.sb.from('spots').delete().eq('id', id);
  },
  async sendMsg(m) {
    if (!this.sb) { toast('Les messages demandent le mode en ligne.'); return false; }
    const { error } = await this.sb.from('messages').insert(m);
    if (error) { toast("Message non envoyé. Vérifie ta connexion."); return false; }
    S.messages.push(m); return true;
  },
  async ratings(ids) {
    if (!this.sb || !ids.length) return [];
    const out = [];
    for (let i = 0; i < ids.length; i += 80) {
      const { data } = await this.sb.from('place_ratings').select('place_id,stars,comment,pseudo,created_by,created_at').in('place_id', ids.slice(i, i + 80)).limit(1000);
      if (data) out.push(...data);
    }
    return out;
  },
  async rate(row) {
    if (!this.sb) { toast('Les notes demandent le mode en ligne.'); return false; }
    const { error } = await this.sb.from('place_ratings').upsert(row, { onConflict: 'place_id,created_by' });
    if (error) { toast("Ta note n'est pas partie. Réessaie."); return false; }
    return true;
  },
  async sendFeedback(f) {
    if (!this.sb) { toast("Pas de connexion à la base : réessaie quand tu as du réseau."); return false; }
    const { error } = await this.sb.from('feedback').insert(f);
    if (error) { toast("Ton retour n'est pas parti. Vérifie ta connexion et réessaie."); return false; }
    return true;
  },
  async countTesters() {
    if (!this.sb) return null;
    const { count, error } = await this.sb.from('drivers').select('id', { count: 'exact', head: true });
    return error ? null : count;
  },
  async findByCode(code) {
    if (!this.sb) return null;
    const { data } = await this.sb.from('drivers').select('id,pseudo,car,color').eq('code', code).limit(1);
    return data && data[0];
  },
  async prices(ids) {
    if (!this.sb || !ids.length) return [];
    const { data } = await this.sb.from('fuel_prices').select('*').in('station_id', ids).order('created_at', { ascending: false }).limit(500);
    return data || [];
  },
  async addPrice(p) {
    if (!this.sb) { toast('Le partage des prix demande le mode en ligne.'); return false; }
    const { error } = await this.sb.from('fuel_prices').insert(p);
    if (error) { toast("Prix non enregistré. Réessaie."); return false; }
    return true;
  }
};

/* ======================= Voix ======================= */
let frVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  const L = I18N.lang;
  frVoice = vs.find((v) => L === 'fr' && /fr[-_](CH|FR)/i.test(v.lang)) || vs.find((v) => v.lang.replace('_', '-').toLowerCase() === I18N.speech.toLowerCase()) || vs.find((v) => v.lang.toLowerCase().startsWith(L)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text, force) {
  if (!('speechSynthesis' in window)) return;
  if (!force && !S.settings.voice) return;
  try {
    const u = new SpeechSynthesisUtterance(I18N.t(text));
    u.lang = I18N.speech; if (frVoice) u.voice = frVoice; u.rate = 1.02;
    speechSynthesis.speak(u);
  } catch (e) { /* voix indisponible */ }
}
let voiceUnlocked = false;
document.addEventListener('click', () => {
  if (voiceUnlocked || !('speechSynthesis' in window)) return;
  voiceUnlocked = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { /* */ }
}, { capture: true });
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* */ } };

/* ======================= Toasts ======================= */
function toast(html, opts) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<div class="grow">' + html + '</div>';
  if (opts && opts.action) {
    const b = document.createElement('button');
    b.className = 'btn small'; b.textContent = opts.action;
    b.onclick = () => { el.remove(); opts.onAction(); };
    el.appendChild(b);
  }
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), (opts && opts.ms) || 4500);
}

/* ======================= Carte ======================= */
const map = new maplibregl.Map({
  container: 'map',
  style: CFG.mapStyle,
  center: CFG.defaultCenter || [6.6323, 46.5197],
  zoom: CFG.defaultZoom || 11,
  attributionControl: { compact: true },
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  fadeDuration: 0,
  renderWorldCopies: false,
  refreshExpiredTiles: false,
  maxTileCacheSize: 120,
  pitchWithRotate: true,
  dragRotate: true,
  maxPitch: 75
});
map.touchZoomRotate.enableRotation();

map.on('load', () => {
  map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0B3D6E', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6, 16, 16] } });
  map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#4DA3FF', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 16, 10] } });
  map.addSource('done', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'done-line', type: 'line', source: 'done', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#8A94A6', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 16, 10] } });
  map.on('click', (e) => {
    if (e._routaDone || S.placing) return;
    const t = e.originalEvent && e.originalEvent.target;
    if (t && t.closest && t.closest('.maplibregl-marker')) return;
    const open = !$('sheetWrap').hidden || (S.preview && !S.nav) || S.markers.pois.length || S.markers.pin;
    if (!open) return;
    e._routaDone = true;
    if (!$('sheetWrap').hidden) userClose();
    if (S.preview && !S.nav) cancelPreview();
    clearPois(); setPin(null);
  });
  setupPlaces();
  setupMapLayers();
  drawFavs();
});
map.on('error', (e) => console.warn('carte', e && e.error));

const stopFollow = () => { if (S.follow) { S.follow = false; $('btnLocate').classList.remove('active'); updateCompass(); } };
map.on('movestart', (e) => { if (e.originalEvent) { stopFollow(); S.lastTouch = Date.now(); document.body.classList.add('panning'); } });
map.on('moveend', () => { clearTimeout(S.panT); S.panT = setTimeout(() => document.body.classList.remove('panning'), 900); });
function zoomClasses() { const z = map.getZoom(); const c = map.getContainer(); c.classList.toggle('z-low', z < 10); c.classList.toggle('z-mid', z < 13); }
map.on('zoomend', zoomClasses);
map.once('idle', () => { zoomClasses(); const a = document.querySelector('.maplibregl-ctrl-attrib'); if (a) a.classList.remove('maplibregl-compact-show'); });
function updateCompass() {
  const b = map.getBearing();
  const n = $('btnNorth'); n.hidden = S.follow || Math.abs(b) < 2;
  n.querySelector('svg').style.transform = 'rotate(' + (-b) + 'deg)';
  n.classList.toggle('active', !!(S.nav && S.settings.navNorth));
}
map.on('rotate', updateCompass);
map.on('rotatestart', (e) => { if (e.originalEvent) stopFollow(); });

/* Plan, satellite et relief 3D */
const SAT_HIDE = /^(building|building-3d|road_area_pattern|(road|tunnel|bridge)_(path_pedestrian|service_track|major_rail|transit_rail)\w*)$/;
function setupMapLayers() {
  const style = map.getStyle(); if (!style) return;
  const before = (style.layers.find((l) => /^tunnel_|^road_/.test(l.id)) || {}).id;
  map.addSource('sat-world', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Images satellite : Esri, Maxar, Earthstar Geographics' });
  map.addLayer({ id: 'sat-world', type: 'raster', source: 'sat-world', layout: { visibility: 'none' } }, before);
  if (CFG.tomtomKey) {
    const tt = (kind, style) => ['https://api.tomtom.com/traffic/map/4/tile/' + kind + '/' + style + '/{z}/{x}/{y}.png?tileSize=256&key=' + encodeURIComponent(CFG.tomtomKey)];
    const top = map.getLayer('boundary_3') ? 'boundary_3' : undefined;
    map.addSource('traffic', { type: 'raster', tiles: tt('flow', 'relative0'), tileSize: 256, maxzoom: 18, attribution: 'Trafic : TomTom' });
    map.addLayer({ id: 'traffic', type: 'raster', source: 'traffic', minzoom: 9, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85 } }, top);
    map.addSource('incidents', { type: 'raster', tiles: tt('incidents', 's3'), tileSize: 256, maxzoom: 18 });
    map.addLayer({ id: 'incidents', type: 'raster', source: 'incidents', minzoom: 12, layout: { visibility: 'none' } }, top);
    setInterval(() => {
      if (!S.nav || !S.settings.traffic || document.hidden) return;
      const t = '&t=' + Math.floor(Date.now() / 300000);
      ['traffic', 'incidents'].forEach((id) => { const s = map.getSource(id); if (s && s.setTiles) s.setTiles(tt(id === 'traffic' ? 'flow' : 'incidents', id === 'traffic' ? 'relative0' : 's3').map((u) => u + t)); });
    }, 300000);
  }
  map.addSource('dem', { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Relief : Mapzen, AWS Terrain Tiles' });
  applyMapView(false);
}
function applyMapView(animate) {
  if (!map.getSource('dem')) return;
  const sat = S.settings.mapType === 'sat';
  ['sat-world'].forEach((id) => map.setLayoutProperty(id, 'visibility', sat ? 'visible' : 'none'));
  map.getStyle().layers.forEach((l) => { if (SAT_HIDE.test(l.id)) map.setLayoutProperty(l.id, 'visibility', sat ? 'none' : 'visible'); });
  if (map.getLayer('building-3d')) map.setLayoutProperty('building-3d', 'visibility', 'none');
  document.body.classList.toggle('sat', sat);
  ['traffic', 'incidents'].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', S.settings.traffic ? 'visible' : 'none'); });
  try { map.setTerrain(S.settings.relief3d ? { source: 'dem', exaggeration: 1.3 } : null); } catch (e) { console.warn('relief', e); }
  if (animate && !S.nav) map.easeTo({ pitch: S.settings.relief3d ? 60 : 0, duration: 800 });
  if (S.nav) followCam();
  $('btnLayers').classList.toggle('active', sat || S.settings.relief3d);
  updateCompass();
}
function openMapView() {
  const seg = (id, opts, cur) => '<div class="seg" id="' + id + '">' + opts.map(([k, v]) => '<button data-v="' + k + '" class="' + (k === cur ? 'on' : '') + '">' + v + '</button>').join('') + '</div>';
  const body = openSheet('Affichage de la carte',
    '<h3>Type de carte</h3>' + seg('mvType', [['plan', 'Plan'], ['sat', 'Satellite']], S.settings.mapType) +
    '<label class="switch" for="mvTraffic"><span><b>Trafic en direct</b><br><span class="muted small">Vert fluide, orange ralenti, rouge bouchon. Accidents et travaux en zoomant.</span></span><input id="mvTraffic" type="checkbox"' + (S.settings.traffic && CFG.tomtomKey ? ' checked' : '') + (CFG.tomtomKey ? '' : ' disabled') + '></label>' +
    (CFG.tomtomKey ? '' : '<p class="muted small">Trafic en direct bientôt disponible.</p>') +
    '<label class="switch" for="mvTransit"><span><b>Arrêts de bus et de tram</b><br><span class="muted small">Touche un arrêt pour voir les lignes et les prochains départs.</span></span><input id="mvTransit" type="checkbox"' + (S.settings.showTransit ? ' checked' : '') + '></label>' +
    '<label class="switch" for="mvPlaces"><span>Afficher les établissements (restos, magasins…) en zoomant</span><input id="mvPlaces" type="checkbox"' + (S.settings.showPlaces ? ' checked' : '') + '></label>' +
    '<h3>Couleurs</h3>' + seg('mvNight', [['auto', 'Auto'], ['off', 'Jour'], ['on', 'Nuit']], S.settings.night) +
    '<h3>Pendant la navigation</h3>' + seg('mvNav', [['route', 'Dans le sens de la route'], ['north', 'Nord en haut']], S.settings.navNorth ? 'north' : 'route') +
    '<div class="banner">' + ic('info') + '<span><b>Tourner la carte :</b> pose deux doigts et tourne-les (sur ordinateur : clic droit et glisser). <b>Incliner :</b> glisse deux doigts vers le haut ou le bas. La boussole montre le nord : touche-la pour remettre le nord en haut.</span></div>' +
    '<p class="muted small">Images satellite : Esri.</p>', 'mapview');
  body.querySelectorAll('#mvType button').forEach((b) => { b.onclick = () => { S.settings.mapType = b.dataset.v; saveSettings(); body.querySelectorAll('#mvType button').forEach((x) => x.classList.toggle('on', x === b)); applyMapView(true); }; });
  body.querySelector('#mvTraffic').onchange = (e) => { S.settings.traffic = e.target.checked; saveSettings(); applyMapView(false); };
  body.querySelector('#mvTransit').onchange = (e) => { S.settings.showTransit = e.target.checked; saveSettings(); applyTransit(); if (S.settings.showTransit && map.getZoom() < 15) map.easeTo({ zoom: 15.5, duration: 600 }); };
  body.querySelector('#mvPlaces').onchange = (e) => { S.settings.showPlaces = e.target.checked; saveSettings(); applyPlaces(); if (S.settings.showPlaces && map.getZoom() < 15) map.easeTo({ zoom: 15.5, duration: 600 }); };
  body.querySelectorAll('#mvNight button').forEach((b) => { b.onclick = () => { S.settings.night = b.dataset.v; saveSettings(); applyNight(); body.querySelectorAll('#mvNight button').forEach((x) => x.classList.toggle('on', x === b)); }; });
  body.querySelectorAll('#mvNav button').forEach((b) => { b.onclick = () => { S.settings.navNorth = b.dataset.v === 'north'; saveSettings(); body.querySelectorAll('#mvNav button').forEach((x) => x.classList.toggle('on', x === b)); if (S.nav) { S.follow = true; $('btnLocate').classList.add('active'); followCam(); } updateCompass(); }; });
}

function applyNight() {
  const h = new Date().getHours();
  const on = S.settings.night === 'on' || (S.settings.night === 'auto' && (h >= 19 || h < 7));
  document.body.classList.toggle('night', on);
  $('btnNight').classList.toggle('active', S.settings.night === 'on');
}
setInterval(applyNight, 60000);

/* Appui long sur la carte */
(function longPress() {
  let t = null, start = null;
  const cancel = () => { clearTimeout(t); t = null; };
  map.on('touchstart', (e) => {
    if (e.originalEvent.touches.length !== 1) return cancel();
    start = e.point; const ll = e.lngLat;
    t = setTimeout(() => { vibrate(20); openPoint({ lat: ll.lat, lon: ll.lng }); }, 650);
  });
  map.on('touchmove', (e) => { if (start && (Math.abs(e.point.x - start.x) > 10 || Math.abs(e.point.y - start.y) > 10)) cancel(); });
  map.on('touchend', cancel); map.on('touchcancel', cancel); map.on('movestart', (e) => { if (e.originalEvent) cancel(); });
  map.on('contextmenu', (e) => openPoint({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
})();

function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

/* Mon marqueur */
function renderMe() {
  if (!S.pos) return;
  if (!S.markers.me) {
    const e = el('<div class="mk-me"><i>' + '<svg aria-hidden="true" viewBox="0 0 24 24">' + P.nav + '</svg></i></div>');
    S.markers.me = new maplibregl.Marker({ element: e, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([S.pos.lon, S.pos.lat]).addTo(map);
  }
  S.markers.me.setLngLat([S.pos.lon, S.pos.lat]).setRotation(S.heading || 0);
}

/* Conducteurs */
function visibleDriver(d) {
  if (!d || d.id === S.me.id || d.lat == null || d.lon == null) return null;
  if (Date.now() - Date.parse(d.updated_at) > 3 * 60000) return null;
  const isFriend = (Array.isArray(d.friends) && d.friends.includes(S.me.id)) || !!(window.ROUTA_X && ROUTA_X.isMate && ROUTA_X.isMate(d));
  if (d.visibility === 'amis' && !isFriend) return null;
  if (d.visibility === 'invisible') return null;
  if (isFriend) return { lat: d.lat, lon: d.lon, fuzzy: false };
  return { lat: Math.round(d.lat * 100) / 100, lon: Math.round(d.lon * 100) / 100, fuzzy: true };
}
function driversList() {
  const out = [];
  S.drivers.forEach((d) => { const v = visibleDriver(d); if (v) out.push(Object.assign({}, d, { vlat: v.lat, vlon: v.lon, fuzzy: v.fuzzy, dist: S.pos ? dist(S.pos, { lat: v.lat, lon: v.lon }) : null })); });
  return out.sort((a, b) => (a.dist || 0) - (b.dist || 0));
}
function renderDrivers() {
  const seen = new Set();
  driversList().forEach((d) => {
    seen.add(d.id);
    let m = S.markers.drivers.get(d.id);
    const lbl = esc(d.pseudo || 'Conducteur') + (d.car ? ' · ' + esc(d.car) : '');
    if (!m) {
      const e = el('<div class="mk-driver"><div class="av"></div><div class="lbl"></div></div>');
      e.addEventListener('click', (ev) => { ev.stopPropagation(); openDriver(d.id); });
      m = new maplibregl.Marker({ element: e, anchor: 'top' }).setLngLat([d.vlon, d.vlat]).addTo(map);
      S.markers.drivers.set(d.id, m);
    }
    const e = m.getElement();
    const av = e.querySelector('.av');
    av.textContent = initials(d.pseudo); av.style.background = d.color || '#FF8A3D'; av.classList.toggle('fuzzy', d.fuzzy);
    e.querySelector('.lbl').innerHTML = lbl;
    e.setAttribute('aria-label', (d.pseudo || 'Conducteur') + (d.fuzzy ? ' (zone approximative)' : ''));
    m.setLngLat([d.vlon, d.vlat]);
  });
  S.markers.drivers.forEach((m, id) => { if (!seen.has(id)) { m.remove(); S.markers.drivers.delete(id); } });
  if (S.sheetView === 'drivers') openDrivers();
}
setInterval(renderDrivers, 30000);

/* Alertes */
function alertVisible(a) { return a && Date.parse(a.expires_at) > Date.now() && (a.denies || 0) <= (a.confirms || 1); }
function renderAlerts() {
  const seen = new Set();
  S.alerts.forEach((a) => {
    if (!alertVisible(a)) return;
    seen.add(a.id);
    let m = S.markers.alerts.get(a.id);
    if (!m) {
      const t = ALERT_TYPES[a.type] || ALERT_TYPES.objet;
      const e = el('<button class="mk-alert ' + (t.cls || '') + '" aria-label="Alerte : ' + esc(t.label) + '">' + ic(a.type) + '</button>');
      e.addEventListener('click', (ev) => { ev.stopPropagation(); openAlert(a.id); });
      m = new maplibregl.Marker({ element: e }).setLngLat([a.lon, a.lat]).addTo(map);
      S.markers.alerts.set(a.id, m);
    }
  });
  S.markers.alerts.forEach((m, id) => { if (!seen.has(id)) { m.remove(); S.markers.alerts.delete(id); } });
}
setInterval(renderAlerts, 60000);

/* Spots */
function renderSpots() {
  const seen = new Set();
  S.spots.forEach((s) => {
    seen.add(s.id);
    if (S.markers.spots.has(s.id)) return;
    const e = el('<button class="mk-poi spot" aria-label="Spot : ' + esc(s.name) + '">' + ic('spot') + '</button>');
    e.addEventListener('click', (ev) => { ev.stopPropagation(); openSpot(s.id); });
    S.markers.spots.set(s.id, new maplibregl.Marker({ element: e }).setLngLat([s.lon, s.lat]).addTo(map));
  });
  S.markers.spots.forEach((m, id) => { if (!seen.has(id)) { m.remove(); S.markers.spots.delete(id); } });
}

/* Points d'intérêt (essence, recharge, parking) */
function clearPois() { S.markers.pois.forEach((m) => m.remove()); S.markers.pois = []; }
function showPois(list, kind) {
  clearPois();
  list.forEach((p) => {
    const label = kind === 'fuel' ? (p.priceLabel || '') : '';
    const e = el('<button class="mk-poi ' + kind + '" aria-label="' + esc(p.name) + '">' + (label ? esc(label) : ic(kind)) + '</button>');
    if (label) { e.style.width = 'auto'; e.style.padding = '0 8px'; e.style.borderRadius = '12px'; }
    e.addEventListener('click', (ev) => { ev.stopPropagation(); openPoi(p, kind); });
    S.markers.pois.push(new maplibregl.Marker({ element: e }).setLngLat([p.lon, p.lat]).addTo(map));
  });
}

/* ======================= GPS ======================= */
function startGps() {
  if (!('geolocation' in navigator)) { toast("Ce navigateur ne donne pas accès à la position."); return; }
  if (S.watchId != null) return;
  let first = true;
  S.watchId = navigator.geolocation.watchPosition((p) => {
    const c = p.coords;
    const now = { lat: c.latitude, lon: c.longitude, t: p.timestamp };
    S.acc = c.accuracy;
    const raw = (c.speed != null && c.speed >= 0) ? c.speed : (S.pos ? estSpeed(S.pos, now) : null);
    S.speed = raw == null ? null : (S.speed == null ? raw : S.speed * 0.35 + raw * 0.65);
    if (S.speed != null && S.speed < 1.7) S.speed = 0;
    if (c.heading != null && !isNaN(c.heading) && (S.speed || 0) > 1.5) S.heading = c.heading;
    else if (S.pos && dist(S.pos, now) > 8) S.heading = bearing(S.pos, now);
    S.prevPos = S.pos; S.pos = now;
    renderMe();
    updateSpeed();
    speedLimitTick();
    countryTick(false);
    if (first) { first = false; map.jumpTo({ center: [now.lon, now.lat], zoom: 14.5 }); pushPresence(true); }
    else if (S.follow) followCam();
    else if (S.nav && Date.now() - (S.lastTouch || 0) > 12000) { S.follow = true; $('btnLocate').classList.add('active'); followCam(); }
    if (S.nav) navUpdate();
    checkNearAlerts();
    pushPresence(false);
  }, (err) => {
    S.watchId = null;
    if (err.code === 1) toast("Position refusée. Autorise la localisation pour ce site dans les réglages du téléphone (Réglages › Safari › Position sur iPhone), puis recharge la page.", { ms: 9000 });
    else toast("Position GPS introuvable pour le moment. On réessaie…");
    if (err.code !== 1) setTimeout(startGps, 5000);
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
function estSpeed(a, b) { const dt = (b.t - a.t) / 1000; const d = dist(a, b); if (d < Math.max(6, S.acc || 0)) return 0; return dt > 0.5 ? d / dt : S.speed; }
function updateSpeed() {
  const box = $('speedBox');
  if (S.speed == null) { box.hidden = true; $('limitSign').hidden = true; return; }
  box.hidden = false;
  const kmh = S.speed * 3.6 < 6 ? 0 : Math.round(S.speed * 3.6);
  $('speedVal').textContent = kmh;
  const lim = S.settings.showLimit ? S.limit : null;
  const sign = $('limitSign');
  sign.hidden = !lim;
  if (lim) sign.textContent = lim;
  const over = !!lim && kmh > lim + 3;
  box.classList.toggle('over', over);
  if (lim && kmh > lim + 5 && S.settings.speedAlert) {
    S.overCount = (S.overCount || 0) + 1;
    if (S.overCount >= 3 && (Date.now() - (S.lastOverAlert || 0) > 45000 || S.lastOverLimit !== lim)) {
      S.lastOverAlert = Date.now(); S.lastOverLimit = lim;
      vibrate([120, 80, 120]);
      say('Attention, limitation à ' + lim);
    }
  } else S.overCount = 0;
}
/* Limite de vitesse de la route (OpenStreetMap via Valhalla) */
S.trail = []; S.limit = null;
let limitBusy = false, lastLimitAt = 0, lastLimitPos = null;
async function speedLimitTick() {
  if (!S.pos || !S.settings.showLimit) return;
  if (S.nav && S.nav.R && S.nav.R.limits) return;
  const last = S.trail[S.trail.length - 1];
  if (!last || dist(last, S.pos) > 8) { S.trail.push({ lat: S.pos.lat, lon: S.pos.lon }); if (S.trail.length > 6) S.trail.shift(); }
  if (limitBusy || (S.speed || 0) < 2 || S.trail.length < 2) return;
  if (Date.now() - lastLimitAt < 5000 || (lastLimitPos && dist(lastLimitPos, S.pos) < 25)) return;
  limitBusy = true; lastLimitAt = Date.now(); lastLimitPos = S.pos;
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch((CFG.valhallaUrl || 'https://valhalla1.openstreetmap.de') + '/trace_attributes', { method: 'POST', signal: ac.signal, body: JSON.stringify({ shape: S.trail.slice(-4), costing: 'auto', shape_match: 'map_snap', filters: { attributes: ['edge.speed_limit', 'edge.names'], action: 'include' } }) });
    const j = await r.json();
    const edges = j.edges || [];
    let lim = null;
    for (let i = edges.length - 1; i >= 0 && i >= edges.length - 3; i--) { const v = edges[i].speed_limit; if (v && v > 0 && v < 200) { lim = v; break; } }
    S.limit = lim;
    if (lim && !store.get('routa.limitInfo', false)) { store.set('routa.limitInfo', true); toast('Limite de vitesse <b>indicative</b> (données OpenStreetMap). Seuls les panneaux sur place font foi.', { ms: 8000 }); }
    updateSpeed();
  } catch (e) { /* réseau */ } finally { clearTimeout(tm); limitBusy = false; }
}
function followCam() {
  if (!S.pos) return;
  const nowT = Date.now(); if (nowT - (S.camAt || 0) < 900) return; S.camAt = nowT;
  $('btnLocate').classList.add('active');
  const kmh = (S.speed || 0) * 3.6;
  if (kmh >= 12) { S.moving = true; S.slowSince = 0; }
  else if (kmh < 10) { if (!S.slowSince) S.slowSince = nowT; if (nowT - S.slowSince > 4000) S.moving = false; }
  const moving = !!S.moving;
  const zoom = kmh < 30 ? 17.3 : kmh < 55 ? 16.5 : kmh < 90 ? 15.7 : 15;
  const north = S.settings.navNorth;
  const pitch = moving ? (north ? 30 : 58) : 0;
  const bearing = north ? 0 : (moving && S.heading != null ? S.heading : map.getBearing());
  const off = moving ? Math.round(window.innerHeight * 0.28) : 0;
  const c = map.getCenter(), lc = S.lastCam;
  if (!moving && lc && !lc.moving && Math.abs(map.getPitch() - pitch) < 1 && Math.abs(map.getZoom() - zoom) < 0.05 && dist({ lat: c.lat, lon: c.lng }, S.pos) < 3) return;
  S.lastCam = { moving };
  map.easeTo({ center: [S.pos.lon, S.pos.lat], bearing, pitch, zoom, duration: 1000, easing: (t) => t, offset: [0, off], essential: true });
}
setInterval(() => { if (S.follow && S.pos && !document.hidden) followCam(); }, 1500);

/* Envoi de ma position */
let lastPush = 0, lastPushPos = null;
function pushPresence(force) {
  if (!S.online || !S.me) return;
  const now = Date.now();
  const moved = S.pos && lastPushPos ? dist(S.pos, lastPushPos) : Infinity;
  if (!force && !(now - lastPush > 4000 && moved > 15) && now - lastPush < 25000) return;
  lastPush = now; lastPushPos = S.pos;
  const invisible = S.me.vis === 'invisible';
  DB.presence({
    id: S.me.id, code: S.me.code, pseudo: S.me.pseudo, car: S.me.car || null, color: S.me.color,
    visibility: S.me.vis, friends: (S.me.friends || []).map((f) => f.id),
    lat: invisible || !S.pos ? null : S.pos.lat, lon: invisible || !S.pos ? null : S.pos.lon,
    heading: Math.round(S.heading || 0), speed: S.speed == null ? null : Math.round(S.speed * 3.6),
    updated_at: new Date().toISOString()
  });
}
setInterval(() => pushPresence(false), 20000);

/* ======================= Alertes à proximité ======================= */
function checkNearAlerts() {
  if (!S.pos) return;
  let best = null;
  S.alerts.forEach((a) => {
    if (!alertVisible(a) || S.prompted.has(a.id) || a.created_by === S.me.id) return;
    const d = dist(S.pos, a);
    if (d > 600) return;
    const moving = (S.speed || 0) > 3;
    if (moving && d > 60 && angleDiff(S.heading, bearing(S.pos, a)) > 60) return;
    if (!best || d < best.d) best = { a, d };
  });
  if (best) {
    S.prompted.add(best.a.id);
    const t = ALERT_TYPES[best.a.type] || ALERT_TYPES.objet;
    S.alertNearId = best.a.id;
    $('alertNearTitle').textContent = t.label;
    $('alertNearSub').textContent = 'à ' + fmtDist(best.d) + ' · signalé ' + ago(best.a.created_at) + ' · confirmé ' + (best.a.confirms || 1) + ' fois';
    $('alertNear').hidden = false;
    vibrate([60, 40, 60]);
    say('Attention, ' + t.say + ' dans ' + fmtDist(best.d).replace(',', ' virgule '));
    clearTimeout(checkNearAlerts.t);
    checkNearAlerts.t = setTimeout(() => { $('alertNear').hidden = true; }, 20000);
  }
}
function voteAlert(id, yes) {
  const a = S.alerts.get(id); if (!a) return;
  if (yes) DB.updateAlert(id, { confirms: (a.confirms || 1) + 1, expires_at: new Date(Date.now() + 2 * 3600000).toISOString() });
  else DB.updateAlert(id, { denies: (a.denies || 0) + 1 });
  toast(yes ? 'Merci, alerte confirmée.' : 'Merci, on le signale aux autres.');
}
$('alertYes').onclick = () => { $('alertNear').hidden = true; if (S.alertNearId) voteAlert(S.alertNearId, true); };
$('alertNo').onclick = () => { $('alertNear').hidden = true; if (S.alertNearId) voteAlert(S.alertNearId, false); };

/* ======================= Feuille du bas ======================= */
function openSheet(title, html, view) {
  $('sheetTitle').textContent = title;
  $('sheetBody').innerHTML = html;
  $('sheetBody').scrollTop = 0;
  $('sheetWrap').hidden = false;
  S.sheetView = view || null;
  $('sheetWrap').classList.toggle('nomodal', /^(point|preview|place|fav|spot|poi)/.test(S.sheetView || ''));
  return $('sheetBody');
}
function closeSheet() {
  $('sheetWrap').hidden = true; S.sheetView = null;
  setPin(null);
  if (S.placing) cancelPlace();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheetWrap').hidden) userClose(); });

/* Placer un point avec le viseur */
function placePoint(label, cb) {
  closeSheet();
  S.placing = cb;
  $('crosshair').hidden = false;
  const bar = el('<div id="placebar" class="navbar" style="z-index:45"><div class="navbar-info"><b>' + esc(label) + '</b><div class="etadest">Déplace la carte pour viser le bon endroit</div></div><div class="navbar-act"><button class="btn ghost" id="placeCancel">Annuler</button><button class="btn" id="placeOk">Ici</button></div></div>');
  document.body.appendChild(bar);
  $('placeCancel').onclick = cancelPlace;
  $('placeOk').onclick = () => { const c = map.getCenter(); const f = S.placing; cancelPlace(); f({ lat: c.lat, lon: c.lng }); };
}
function cancelPlace() { S.placing = null; $('crosshair').hidden = true; const b = $('placebar'); if (b) b.remove(); }

/* ======================= Recherche ======================= */
const q = $('q');
/* Géocodage : Photon, avec Nominatim en secours */
const GEO = { photonOffUntil: 0 };
const NOMI = 'https://nominatim.openstreetmap.org';
async function fetchJson(url, ms) {
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), ms || 6000);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); } finally { clearTimeout(tm); }
}
async function geoSearch(text, c) {
  if (Date.now() > GEO.photonOffUntil) {
    try {
      const params = new URLSearchParams({ q: text, limit: '7', lang: I18N.lang === 'fr' ? 'fr' : 'en', lat: c.lat.toFixed(4), lon: c.lon.toFixed(4) });
      const j = await fetchJson(CFG.searchUrl + '?' + params.toString(), 5000);
      return (j.features || []).map((f) => {
        const p = f.properties || {};
        const line1 = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || 'Lieu';
        const line2 = [p.name ? [p.street, p.housenumber].filter(Boolean).join(' ') : '', [p.postcode, p.city].filter(Boolean).join(' '), p.country].filter(Boolean).join(', ');
        return { name: line1, sub: line2, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
      });
    } catch (e) { GEO.photonOffUntil = Date.now() + 10 * 60000; }
  }
  const vb = [c.lon - 1.5, c.lat + 1, c.lon + 1.5, c.lat - 1].map((x) => x.toFixed(3)).join(',');
  const j = await fetchJson(NOMI + '/search?format=jsonv2&addressdetails=1&limit=7&accept-language=' + I18N.lang + '&viewbox=' + vb + '&q=' + encodeURIComponent(text), 7000);
  return j.map((x) => {
    const a = x.address || {};
    const city = a.city || a.town || a.village || a.municipality || '';
    const street = [a.road, a.house_number].filter(Boolean).join(' ');
    const name = x.name || street || city || (x.display_name || '').split(',')[0];
    return { name, sub: [x.name ? street : '', [a.postcode, city].filter(Boolean).join(' '), a.country].filter(Boolean).join(', '), lat: +x.lat, lon: +x.lon };
  });
}
async function geoReverse(p) {
  if (Date.now() > GEO.photonOffUntil) {
    try {
      const j = await fetchJson((CFG.searchUrl || 'https://photon.komoot.io/api/').replace(/api\/?$/, 'reverse') + '?lat=' + p.lat + '&lon=' + p.lon + '&lang=' + (I18N.lang === 'fr' ? 'fr' : 'en'), 3500);
      const q = (j.features && j.features[0] && j.features[0].properties) || {};
      return { street: q.osm_key === 'highway' ? q.name : q.street, housenumber: q.housenumber, city: q.city || q.town || q.village, cc: (q.countrycode || '').toUpperCase() };
    } catch (e) { GEO.photonOffUntil = Date.now() + 10 * 60000; }
  }
  try {
    const j = await fetchJson(NOMI + '/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=' + I18N.lang + '&lat=' + p.lat + '&lon=' + p.lon, 4000);
    const a = j.address || {};
    return { street: a.road, housenumber: a.house_number, city: a.city || a.town || a.village, cc: (a.country_code || '').toUpperCase() };
  } catch (e) { return null; }
}
const runSearch = debounce(async (text) => {
  if (text.length < 3) { showRecents(); return; }
  try {
    const c = S.pos || (() => { const m = map.getCenter(); return { lat: m.lat, lon: m.lng }; })();
    const items = await geoSearch(text, c);
    const spotHits = [...S.spots.values()].filter((s) => s.name.toLowerCase().includes(text.toLowerCase())).slice(0, 3).map((s) => ({ name: s.name, sub: 'Spot · ' + (SPOT_CATS[s.category] || ''), lat: s.lat, lon: s.lon, spot: true }));
    showResults(spotHits.concat(items));
  } catch (e) {
    showResults([], 'Recherche indisponible. Vérifie ta connexion.');
  }
}, 500);
function showResults(items, msg) {
  const box = $('results');
  if (!items.length) { box.innerHTML = '<div class="result"><span class="muted">' + esc(msg || 'Aucun résultat.') + '</span></div>'; box.hidden = false; return; }
  box.innerHTML = items.map((it, i) => '<button class="result" data-i="' + i + '">' + ic(it.fav ? 'star' : it.spot ? 'spot' : it.recent ? 'clock' : 'pin') + '<span class="grow"><b>' + esc(it.name) + '</b><small>' + esc(it.sub || '') + (S.pos ? ' · ' + fmtDist(dist(S.pos, it)) : '') + '</small></span></button>').join('');
  box.hidden = false;
  box.querySelectorAll('.result').forEach((b) => { b.onclick = () => { const it = items[+b.dataset.i]; hideResults(); q.blur(); if (S.pickSlot) { const k = S.pickSlot; q.value = ''; saveSlot(k, it); return; } chooseDestination(it); }; });
}
function hideResults() { $('results').hidden = true; }
function showRecents() {
  const favs = S.favs.filter((f) => !f.slot).slice(0, 5).map((f) => ({ name: f.name, sub: f.addr || 'Favori', lat: f.lat, lon: f.lon, fav: true }));
  const rec = S.recents.filter((r) => !r.fav).map((r) => Object.assign({}, r, { recent: true }));
  if (S.pickSlot || (!favs.length && !rec.length)) { hideResults(); return; }
  showResults(favs.concat(rec).slice(0, 10));
}
function enterSearch() {
  document.body.classList.add('searching');
  setTimeout(() => { q.focus(); if (!q.value) showRecents(); }, 30);
}
function exitSearch() {
  document.body.classList.remove('searching');
  hideResults(); q.blur(); q.value = ''; $('qclear').hidden = true;
  if (S.pickSlot) { S.pickSlot = null; q.placeholder = 'Où va-t-on ?'; }
}
const SLOTS = { home: 'Domicile', work: 'Travail' };
const slotFav = (k) => S.favs.find((f) => f.slot === k);
function goSlot(k, edit) {
  const f = slotFav(k);
  if (f && !edit) { chooseDestination({ name: f.name, sub: f.addr || SLOTS[k], lat: f.lat, lon: f.lon, fav: true }); return; }
  S.pickSlot = k; q.value = ''; $('qclear').hidden = true; q.placeholder = 'Adresse : ' + SLOTS[k].toLowerCase();
  enterSearch();
  toast('Tape l\'adresse de ton <b>' + SLOTS[k].toLowerCase() + '</b> puis choisis-la : elle sera enregistrée.', { ms: 7000 });
}
function saveSlot(k, p) {
  S.pickSlot = null; q.placeholder = 'Où va-t-on ?';
  S.favs = S.favs.filter((f) => f.slot !== k);
  S.favs.unshift({ id: uuid(), slot: k, name: SLOTS[k], addr: p.addr || p.sub || p.name || '', lat: p.lat, lon: p.lon, created_at: new Date().toISOString() });
  saveFavs(); drawFavs(); vibrate(15); exitSearch();
  toast('<b>' + SLOTS[k] + '</b> enregistré. Touche « ' + SLOTS[k] + ' » pour y aller en un clic.');
}
q.addEventListener('input', () => { $('qclear').hidden = !q.value; runSearch(q.value.trim()); });
q.addEventListener('focus', () => { if (!q.value) showRecents(); });
q.addEventListener('keydown', (e) => { if (e.key === 'Escape') exitSearch(); });
$('qclear').onclick = () => { q.value = ''; $('qclear').hidden = true; hideResults(); q.focus(); };
map.on('click', (e) => { if (document.body.classList.contains('searching')) { e._routaDone = true; exitSearch(); } });

/* ======================= Itinéraire ======================= */
function decodePoly6(str) {
  let i = 0, lat = 0, lon = 0; const out = [];
  while (i < str.length) {
    let b, s = 0, r = 0;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lat += (r & 1) ? ~(r >> 1) : (r >> 1);
    s = 0; r = 0;
    do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lon += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }
  return out;
}
const VTYPE = { 1: ['depart'], 2: ['depart'], 3: ['depart'], 4: ['arrive'], 5: ['arrive', 'right'], 6: ['arrive', 'left'], 7: ['new name', 'straight'], 8: ['continue', 'straight'], 9: ['turn', 'slight right'], 10: ['turn', 'right'], 11: ['turn', 'sharp right'], 12: ['turn', 'uturn'], 13: ['turn', 'uturn'], 14: ['turn', 'sharp left'], 15: ['turn', 'left'], 16: ['turn', 'slight left'], 17: ['on ramp', 'straight'], 18: ['on ramp', 'right'], 19: ['on ramp', 'left'], 20: ['off ramp', 'right'], 21: ['off ramp', 'left'], 22: ['fork', 'straight'], 23: ['fork', 'slight right'], 24: ['fork', 'slight left'], 25: ['merge', 'straight'], 26: ['roundabout'], 27: ['exit roundabout'], 37: ['merge', 'slight right'], 38: ['merge', 'slight left'] };
async function fetchValhalla(from, to, costing, opts) {
  const body = { locations: [{ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }], costing, directions_options: { language: I18N.valhalla, units: 'kilometers' } };
  if (opts) body.costing_options = { [costing]: opts };
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch((CFG.valhallaUrl || 'https://valhalla1.openstreetmap.de') + '/route', { method: 'POST', signal: ac.signal, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok || !j.trip) throw new Error(j.error || 'valhalla ' + r.status);
    const leg = j.trip.legs[0];
    const coords = decodePoly6(leg.shape);
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + dist(coords[i - 1], coords[i]));
    const total = cum[cum.length - 1];
    const steps = leg.maneuvers.map((m) => { const t = VTYPE[m.type] || ['turn', 'straight']; return { distance: m.length * 1000, name: (m.street_names || [])[0] || '', text: (m.instruction || '').replace(/\.\s*$/, ''), maneuver: { type: t[0], modifier: t[1] }, endIdx: m.end_shape_index }; });
    const stepEnds = steps.map((s) => cum[Math.min(s.endIdx, cum.length - 1)]);
    return { coords, cum, total, duration: j.trip.summary.time, steps, stepEnds, engine: 'valhalla', costing };
  } finally { clearTimeout(tm); }
}
async function fetchRoute(from, to) {
  const v = veh();
  if (v.heavy) {
    const d = v.dims;
    const o = { height: d.height, width: d.width, length: d.length, weight: d.weight };
    if (v.costing === 'truck') { o.hazmat = v.hazmat; if (v.type === 'camping' && !v.isHgv) o.use_highways = 1; }
    try { const R = await fetchValhalla(from, to, v.costing, o); R.vehicle = vehSummary(); return R; }
    catch (e) { console.warn('valhalla', e); const R = await fetchOsrm(from, to); R.fallback = true; return R; }
  }
  if (window.ROUTA_X && ROUTA_X.route) { try { const R = await ROUTA_X.route(from, to); if (R) return R; } catch (e) { console.warn('tomtom', e); } }
  try { return await fetchOsrm(from, to); }
  catch (e) { return await fetchValhalla(from, to, 'auto'); }
}
async function fetchOsrm(from, to) {
  const url = CFG.routingUrl + '/route/v1/driving/' + from.lon + ',' + from.lat + ';' + to.lon + ',' + to.lat + '?overview=full&geometries=geojson&steps=true&alternatives=false';
  const r = await fetch(url);
  if (!r.ok) throw new Error('route ' + r.status);
  const j = await r.json();
  if (!j.routes || !j.routes.length) throw new Error('no route');
  const rt = j.routes[0];
  const coords = rt.geometry.coordinates.map((c) => ({ lon: c[0], lat: c[1] }));
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + dist(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1] || rt.distance;
  const steps = rt.legs[0].steps;
  const stepSum = steps.reduce((s, x) => s + x.distance, 0) || 1;
  const k = total / stepSum;
  const stepEnds = []; let acc = 0;
  steps.forEach((s) => { acc += s.distance * k; stepEnds.push(acc); });
  return { coords, cum, total, duration: rt.duration, steps, stepEnds, raw: rt };
}
function drawRoute(R, doneIdx) {
  const src = map.getSource('route'); const done = map.getSource('done');
  if (!src) return;
  if (!R) { src.setData({ type: 'FeatureCollection', features: [] }); done.setData({ type: 'FeatureCollection', features: [] }); return; }
  const i = doneIdx || 0;
  const ahead = R.coords.slice(i).map((c) => [c.lon, c.lat]);
  const behind = R.coords.slice(0, i + 1).map((c) => [c.lon, c.lat]);
  src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: ahead.length > 1 ? ahead : [] } });
  done.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: behind.length > 1 ? behind : [] } });
}
function setDestMarker(d) {
  if (S.markers.dest) { S.markers.dest.remove(); S.markers.dest = null; }
  if (d) S.markers.dest = new maplibregl.Marker({ element: el('<div class="mk-dest" aria-label="Destination"></div>') }).setLngLat([d.lon, d.lat]).addTo(map);
}
function fitRoute(R) {
  const b = new maplibregl.LngLatBounds();
  R.coords.forEach((c) => b.extend([c.lon, c.lat]));
  map.fitBounds(b, { padding: { top: 140, bottom: Math.round(window.innerHeight * 0.45), left: 40, right: 40 }, duration: 800, bearing: 0, pitch: 0, maxZoom: 16 });
}
function remember(dest) {
  S.recents = [dest].concat(S.recents.filter((r) => Math.abs(r.lat - dest.lat) > 1e-4 || Math.abs(r.lon - dest.lon) > 1e-4)).slice(0, 8)
    .map((r) => ({ name: r.name, sub: r.sub || '', lat: r.lat, lon: r.lon }));
  store.set('routa.recents', S.recents);
}

async function chooseDestination(dest) {
  exitSearch();
  if (!S.pos) { toast("J'attends ta position GPS pour calculer le trajet…"); startGps(); map.flyTo({ center: [dest.lon, dest.lat], zoom: 14 }); return; }
  remember(dest);
  setDestMarker(dest);
  openSheet(dest.name, '<p class="muted">Calcul du trajet…</p>', 'preview');
  try {
    const R = await fetchRoute(S.pos, dest);
    S.preview = { R, dest };
    drawRoute(R, 0); fitRoute(R); stopFollow();
    const arr = new Date(Date.now() + R.duration * 1000);
    const body = openSheet(dest.name,
      '<div class="row"><div class="grow"><div><span class="eta">' + fmtDur(R.duration) + '</span> <span class="etarest">' + fmtDist(R.total) + ' · arrivée ' + fmtClock(arr) + '</span></div>' +
      '<div class="muted small">' + esc(dest.sub || '') + '</div></div></div>' +
      (veh().heavy ? (R.fallback ? '<div class="banner warnb">' + ic('info') + '<span><b>Calcul poids lourd indisponible pour le moment.</b> Trajet voiture affiché : attention aux restrictions de hauteur, de poids et d\'accès.</span></div>'
        : '<div class="banner">' + ic(veh().icon) + '<span>Trajet adapté : <b>' + esc(vehSummary()) + '</b>. Les limites connues de hauteur, poids et accès sont évitées. Respecte toujours la signalisation.</span></div>') : '') +
      '<button class="btn block" id="goNav">' + ic('nav') + 'Démarrer</button>' +
      '<div class="row">' + (veh().type !== 'electrique' ? '<button class="btn soft grow" id="alongFuel">' + ic('fuel') + (veh().isHgv ? 'Carburant PL' : 'Essence') + ' sur le trajet</button>' : '') + (veh().heavy ? '<button class="btn soft grow" id="alongTruck">' + ic('truckstop') + 'Aires sur le trajet</button>' : veh().ev ? '<button class="btn soft grow" id="alongCharge">' + ic('charge') + 'Bornes sur le trajet</button>' : '') + '</div>' +
      '<button class="btn ghost" id="chgVeh">' + ic(veh().icon) + 'Véhicule : ' + esc(vehSummary()) + ' (changer)</button>' +
      '<p class="muted small">Durée calculée sans le trafic en direct.</p>', 'preview');
    body.querySelector('#goNav').onclick = () => { closeSheet(); startNav(R, dest); };
    const ac = body.querySelector('#alongCharge'); if (ac) ac.onclick = () => alongRoute(R, 'charge');
    const at = body.querySelector('#alongTruck'); if (at) at.onclick = () => alongRoute(R, 'truckstop');
    const af = body.querySelector('#alongFuel'); if (af) af.onclick = () => alongRoute(R, 'fuel');
    body.querySelector('#chgVeh').onclick = () => openVehicle(() => chooseDestination(dest));
    routeCountries(R, dest);
    if (window.ROUTA_X && ROUTA_X.preview) ROUTA_X.preview(R, dest, body);
  } catch (e) {
    openSheet(dest.name, '<p>Impossible de calculer le trajet pour le moment. Vérifie ta connexion et réessaie.</p><button class="btn block" id="retryRoute">Réessayer</button>', 'preview')
      .querySelector('#retryRoute').onclick = () => chooseDestination(dest);
  }
}
function cancelPreview() { if (!S.nav) { S.preview = null; drawRoute(null); setDestMarker(null); } }

/* ======================= Navigation ======================= */
const DIRS = { left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite', 'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'demi-tour' };
const ORD = ['', 'première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième'];
function stepText(s) {
  if (s.text) return s.text;
  if (I18N.lang !== 'fr' && I18N.step) return I18N.step(s);
  const m = s.maneuver || {}; const t = m.type; const mod = m.modifier || '';
  const road = s.name ? ' sur ' + s.name : (s.ref ? ' sur ' + s.ref : '');
  const dir = DIRS[mod] || '';
  switch (t) {
    case 'depart': return 'Partez' + road;
    case 'arrive': return 'Vous êtes arrivé' + (mod === 'left' ? ', destination à gauche' : mod === 'right' ? ', destination à droite' : '');
    case 'roundabout': case 'rotary': case 'exit roundabout': case 'exit rotary':
      return m.exit ? 'Au rond-point, prenez la ' + (ORD[m.exit] || m.exit + 'e') + ' sortie' + road : 'Traversez le rond-point' + road;
    case 'roundabout turn': return 'Au rond-point, tournez ' + dir + road;
    case 'merge': return 'Insérez-vous ' + dir + road;
    case 'on ramp': return 'Prenez la bretelle ' + dir + road;
    case 'off ramp': return 'Prenez la sortie ' + dir + road;
    case 'fork': return "À l'embranchement, restez " + dir + road;
    case 'continue': case 'new name': return (!mod || mod === 'straight') ? 'Continuez' + road : 'Continuez ' + dir + road;
    default:
      if (mod === 'uturn') return 'Faites demi-tour' + road;
      if (mod === 'straight') return 'Continuez tout droit' + road;
      return 'Tournez ' + dir + road;
  }
}
function stepIcon(s) {
  const m = s.maneuver || {}; const t = m.type; const mod = m.modifier || '';
  if (t === 'arrive') return 'flag';
  if (/roundabout|rotary/.test(t)) return 'round';
  if (mod === 'uturn') return 'uturn';
  if (mod === 'slight right') return 'sright';
  if (mod === 'slight left') return 'sleft';
  if (/right/.test(mod)) return 'right';
  if (/left/.test(mod)) return 'left';
  return 'straight';
}

function startNav(R, dest) {
  S.preview = null;
  S.nav = { R, dest, along: 0, seg: 0, offCount: 0, lastReroute: 0, spoken: {}, startedAt: Date.now() };
  document.body.classList.add('navigating');
  $('navBanner').hidden = false; $('navBar').hidden = false;
  $('etaDest').textContent = 'Vers ' + dest.name;
  S.follow = true; $('btnLocate').classList.add('active');
  requestWake();
  drawRoute(R, 0);
  const first = R.steps[1] || R.steps[0];
  say("C'est parti. " + stepText(R.steps[0]) + '. Puis, ' + stepText(first).toLowerCase());
  navUpdate();
  followCam();
}
function stopNav(silent) {
  if (!S.nav) return;
  S.nav = null;
  document.body.classList.remove('navigating');
  $('navBanner').hidden = true; $('navBar').hidden = true;
  drawRoute(null); setDestMarker(null);
  releaseWake();
  map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
  updateCompass();
  if (!silent) toast('Navigation arrêtée.');
}
$('btnStop').onclick = () => stopNav();
$('btnOverview').onclick = () => { if (S.nav) { stopFollow(); fitRoute(S.nav.R); } };
$('btnMute').onclick = () => {
  S.settings.voice = !S.settings.voice; saveSettings();
  $('btnMute').classList.toggle('muted', !S.settings.voice);
  $('btnMute').setAttribute('aria-label', S.settings.voice ? 'Couper la voix' : 'Activer la voix');
  toast(S.settings.voice ? 'Voix activée.' : 'Voix coupée.');
};

function project(R, p, from, to) {
  const lat0 = toRad(p.lat), kx = Math.cos(lat0) * 111320, ky = 110540;
  let best = { d: Infinity, along: 0, seg: 0 };
  const a = Math.max(0, from), b = Math.min(R.coords.length - 1, to);
  for (let i = a; i < b; i++) {
    const A = R.coords[i], B = R.coords[i + 1];
    const ax = (A.lon - p.lon) * kx, ay = (A.lat - p.lat) * ky, bx = (B.lon - p.lon) * kx, by = (B.lat - p.lat) * ky;
    const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy;
    let t = L2 ? -(ax * dx + ay * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy; const d = Math.sqrt(px * px + py * py);
    if (d < best.d) best = { d, along: R.cum[i] + t * (R.cum[i + 1] - R.cum[i]), seg: i };
  }
  return best;
}
function navUpdate() {
  const N = S.nav; if (!N || !S.pos) return;
  const R = N.R;
  let pr = project(R, S.pos, N.seg - 3, N.seg + 300);
  if (pr.d > 40) pr = project(R, S.pos, 0, R.coords.length - 1);
  if (pr.d > 55 && (S.acc || 0) < 60) {
    N.offCount++;
    if (N.offCount >= 3 && Date.now() - N.lastReroute > 12000) { reroute(); return; }
  } else N.offCount = 0;
  N.along = pr.along; N.seg = pr.seg;
  drawRoute(R, pr.seg);

  const remaining = Math.max(0, R.total - N.along);
  if (remaining < 30) { arrive(); return; }

  let i = R.stepEnds.findIndex((e) => e > N.along + 3);
  if (i < 0) i = R.steps.length - 1;
  const next = R.steps[i + 1] || R.steps[i];
  const toNext = Math.max(0, R.stepEnds[i] - N.along);
  $('navDist').textContent = fmtDist(toNext);
  $('navInstr').textContent = stepText(next);
  $('navArrow').innerHTML = ic(stepIcon(next));
  const after = R.steps[i + 2];
  if (after && next && next.distance < 200) { $('navThen').hidden = false; $('navThen').innerHTML = 'Puis ' + ic(stepIcon(after)) + '<span>' + esc(stepText(after).replace(/^./, (c) => c.toLowerCase())) + '</span>'; }
  else $('navThen').hidden = true;

  const kmh = (S.speed || 0) * 3.6;
  const key = i + 1; const sp = N.spoken[key] || (N.spoken[key] = {});
  const txt = stepText(next);
  if (!sp.far && kmh > 70 && toNext < 1100 && toNext > 650) { sp.far = true; say('Dans ' + fmtDist(toNext).replace(',', ' virgule ') + ', ' + txt.toLowerCase()); }
  else if (!sp.mid && toNext <= 400 && toNext > 120) { sp.mid = sp.far = true; say('Dans ' + fmtDist(toNext) + ', ' + txt.toLowerCase()); }
  else if (!sp.near && toNext <= 90 && next.maneuver.type !== 'arrive') { sp.near = sp.mid = sp.far = true; say(txt); }

  const remTime = R.duration * (remaining / R.total);
  $('etaMin').textContent = fmtDur(remTime);
  $('etaRest').textContent = fmtDist(remaining) + ' · ' + fmtClock(new Date(Date.now() + remTime * 1000));
  if (S.follow) followCam();
}
async function reroute() {
  const N = S.nav; if (!N) return;
  N.lastReroute = Date.now(); N.offCount = 0;
  $('navInstr').textContent = 'Nouveau calcul…';
  say('Nouveau calcul du trajet');
  try {
    const R = await fetchRoute(S.pos, N.dest);
    if (!S.nav) return;
    Object.assign(S.nav, { R, along: 0, seg: 0, spoken: {} });
    drawRoute(R, 0); navUpdate();
  } catch (e) { toast("Impossible de recalculer pour l'instant. On réessaie."); }
}
function arrive() {
  const name = S.nav.dest.name;
  const arrDest = S.nav.dest;
  say('Vous êtes arrivé.');
  stopNav(true);
  if (window.ROUTA_X && ROUTA_X.arrived) ROUTA_X.arrived(arrDest);
  openSheet('Tu es arrivé', '<p>' + esc(name) + '</p><div class="row"><button class="btn soft grow" id="arrSpot">' + ic('spot') + 'Ajouter en spot</button><button class="btn soft grow" id="arrPark">' + ic('parking') + 'Parkings autour</button></div><button class="btn ghost" id="arrFb">Un souci pendant ce trajet ? Dis-le-nous</button>', 'arrive');
  $('arrFb').onclick = () => openFeedback({ kind: 'bug', page: 'navigation' });
  $('arrSpot').onclick = () => openAddSpot(S.pos);
  $('arrPark').onclick = () => openPoiList('parking');
}

/* Écran allumé pendant la navigation */
async function requestWake() { try { if ('wakeLock' in navigator) S.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* refusé */ } }
function releaseWake() { try { S.wakeLock && S.wakeLock.release(); } catch (e) { /* */ } S.wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.nav) requestWake(); });

/* ======================= Essence / recharge / parking ======================= */
const OVERPASS_FILTER = {
  fuel: ['["amenity"="fuel"]'],
  charge: ['["amenity"="charging_station"]'],
  parking: ['["amenity"="parking"]["access"!~"^(private|no|customers|permissive_no)$"]'],
  food: ['["amenity"~"^(restaurant|fast_food|cafe)$"]'],
  shops: ['["shop"~"^(supermarket|convenience|bakery|kiosk|butcher|deli|mall|department_store|car_parts|car_repair|tyres|hardware|doityourself)$"]'],
  truckstop: ['["amenity"="parking"]["hgv"~"^(yes|designated)$"]', '["highway"~"^(rest_area|services)$"]', '["amenity"="fuel"]["hgv"~"^(yes|designated)$"]']
};
const KIND_LABEL = { fuel: 'Essence', charge: 'Recharge', parking: 'Parking', food: 'Restos', shops: 'Magasins', truckstop: 'Aires poids lourds', place: 'Lieu' };
const KIND_COLOR = { fuel: 'var(--alert)', charge: 'var(--ok)', parking: 'var(--info)', food: '#FF9DA1', shops: '#C9A2FF', truckstop: '#7FE0C2', place: '#F2F4F7' };
const KIND_RADIUS = { fuel: 6000, charge: 6000, parking: 2500, food: 2000, shops: 2500, truckstop: 20000 };
const RATED = { food: 1, shops: 1, truckstop: 1, fuel: 1, parking: 1, charge: 1, place: 1 };
const SHOP_FR = { supermarket: 'Supermarché', convenience: 'Épicerie', bakery: 'Boulangerie', kiosk: 'Kiosque', butcher: 'Boucherie', deli: 'Traiteur', mall: 'Centre commercial', department_store: 'Grand magasin', car_parts: 'Pièces auto', car_repair: 'Garage', tyres: 'Pneus', hardware: 'Quincaillerie', doityourself: 'Bricolage' };
const CUISINE_FR = { pizza: 'Pizza', burger: 'Burger', kebab: 'Kebab', italian: 'Italien', turkish: 'Turc', chinese: 'Chinois', japanese: 'Japonais', sushi: 'Sushi', indian: 'Indien', thai: 'Thaï', french: 'Français', swiss: 'Suisse', regional: 'Régional', asian: 'Asiatique', mexican: 'Mexicain', lebanese: 'Libanais', portuguese: 'Portugais', spanish: 'Espagnol', greek: 'Grec', vietnamese: 'Vietnamien', chicken: 'Poulet', sandwich: 'Sandwichs', coffee_shop: 'Café', ice_cream: 'Glaces', steak_house: 'Grill', seafood: 'Fruits de mer', vegetarian: 'Végétarien', vegan: 'Végan' };
function parseOsm(e, kind) {
  const t = e.tags || {};
  const lat = e.lat != null ? e.lat : e.center && e.center.lat;
  const lon = e.lon != null ? e.lon : e.center && e.center.lon;
  const DEF = { fuel: 'Station-service', charge: 'Borne de recharge', parking: 'Parking', food: 'Restaurant', shops: SHOP_FR[t.shop] || 'Magasin', truckstop: t.highway === 'services' ? 'Aire de service' : t.highway === 'rest_area' ? 'Aire de repos' : t.amenity === 'fuel' ? 'Station poids lourds' : 'Parking poids lourds' };
  let name = t.name || t.brand || t.operator || DEF[kind];
  if (t.brand && t.name && !t.name.toLowerCase().includes(t.brand.toLowerCase())) name = t.brand + ' · ' + t.name;
  const details = [];
  if (kind === 'fuel') {
    if (t.opening_hours === '24/7') details.push('24 h/24');
    if (t.shop === 'convenience' || t['shop']) details.push('Shop');
    if (t['fuel:diesel'] === 'yes') details.push('Diesel');
    if (t['fuel:lpg'] === 'yes') details.push('GPL');
    if (t['fuel:HGV_diesel'] === 'yes' || /yes|designated/.test(t.hgv || '')) details.push('Poids lourds');
    if (t['fuel:adblue'] === 'yes') details.push('AdBlue');
  } else if (kind === 'food') {
    details.push(t.amenity === 'fast_food' ? 'Fast-food' : t.amenity === 'cafe' ? 'Café' : 'Restaurant');
    const cu = (t.cuisine || '').split(';').map((c) => CUISINE_FR[c.trim()]).filter(Boolean).slice(0, 2);
    if (cu.length) details.push(cu.join(', '));
    if (t.takeaway === 'yes') details.push('À emporter');
    if (t.opening_hours === '24/7') details.push('24 h/24');
  } else if (kind === 'shops') {
    if (t.name && SHOP_FR[t.shop]) details.push(SHOP_FR[t.shop]);
    if (t.opening_hours === '24/7') details.push('24 h/24');
  } else if (kind === 'truckstop') {
    if (t.highway === 'services') details.push('Aire de service');
    else if (t.highway === 'rest_area') details.push('Aire de repos');
    else if (t.amenity === 'fuel') details.push('Carburant PL');
    else details.push('Parking PL');
    if (t['capacity:hgv']) details.push(t['capacity:hgv'] + ' places PL');
    else if (t.capacity && t.amenity === 'parking') details.push(t.capacity + ' places');
    if (t.toilets === 'yes') details.push('WC');
    if (t.shower === 'yes') details.push('Douches');
    if (t.fee === 'no') details.push('Gratuit'); else if (t.fee === 'yes') details.push('Payant');
    if (t['fuel:adblue'] === 'yes') details.push('AdBlue');
  } else if (kind === 'charge') {
    const sockets = [];
    if (t['socket:type2_combo']) sockets.push('CCS');
    if (t['socket:chademo']) sockets.push('CHAdeMO');
    if (t['socket:type2']) sockets.push('Type 2');
    if (t['socket:tesla_supercharger'] || /tesla/i.test(t.brand || t.operator || '')) sockets.push('Tesla');
    if (sockets.length) details.push(sockets.join(' · '));
    const power = Object.keys(t).filter((k) => /^socket:.*:output$/.test(k)).map((k) => parseFloat(t[k])).filter((x) => !isNaN(x));
    if (power.length) details.push(Math.max(...power) + ' kW');
    if (t.capacity) details.push(t.capacity + ' points');
    if (t.fee === 'no') details.push('Gratuit');
  } else {
    if (/multi-storey|underground/.test(t.parking || '')) details.push('Couvert');
    if (t.fee === 'no') details.push('Gratuit'); else if (t.fee === 'yes') details.push('Payant');
    if (t.capacity) details.push(t.capacity + ' places');
    if (t.maxstay) details.push('Max ' + t.maxstay);
  }
  return { id: 'osm/' + e.type + '/' + e.id, name, lat, lon, details: [...new Set(details)].join(' · '), hours: t.opening_hours || '', tags: t };
}
const OVERPASS_CH = 'https://overpass.osm.ch/api/interpreter';
const OVERPASS_URLS = [CFG.overpassUrl, 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'].filter((u, i, all) => u && all.indexOf(u) === i);
const inCH = (p) => p && p.lat > 45.8 && p.lat < 47.85 && p.lon > 5.9 && p.lon < 10.55;
let overpassBest = 0;
async function overpass(query, chOnly) {
  let lastErr;
  const urls = [];
  if (chOnly) urls.push(OVERPASS_CH);
  for (let k = 0; k < OVERPASS_URLS.length; k++) urls.push(OVERPASS_URLS[(overpassBest + k) % OVERPASS_URLS.length]);
  for (const u of urls) {
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), u === OVERPASS_CH ? 15000 : 35000);
    try {
      const r = await fetch(u, { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) });
      if (!r.ok) throw new Error('overpass ' + r.status);
      const j = await r.json();
      if (u !== OVERPASS_CH) overpassBest = OVERPASS_URLS.indexOf(u);
      return j.elements || [];
    } catch (e) { lastErr = e; } finally { clearTimeout(timer); }
  }
  throw lastErr || new Error('overpass');
}
function osmQuery(kind, around, limit) {
  const parts = OVERPASS_FILTER[kind].map((f) => 'nwr' + f + '(around:' + around + ');').join('');
  return '[out:json][timeout:40];(' + parts + ');out center tags ' + (limit || 120) + ';';
}
async function poisAround(kind, c, radius) {
  const key = kind + ':' + c.lat.toFixed(2) + ':' + c.lon.toFixed(2) + ':' + radius;
  const cached = S.poiCache[key];
  if (cached && Date.now() - cached.t < 10 * 60000) return cached.list;
  const els = await overpass(osmQuery(kind, radius + ',' + c.lat + ',' + c.lon), inCH(c));
  const list = els.map((e) => parseOsm(e, kind)).filter((p) => p.lat != null);
  S.poiCache[key] = { t: Date.now(), list };
  return list;
}
async function attachPrices(list) {
  const rows = await DB.prices(list.map((p) => p.id));
  const latest = {};
  rows.forEach((r) => { const k = r.station_id + '|' + r.fuel; if (!latest[k]) latest[k] = r; });
  list.forEach((p) => {
    p.prices = ['SP95', 'SP98', 'Diesel'].map((f) => latest[p.id + '|' + f]).filter(Boolean);
    const sp = latest[p.id + '|SP95'] || p.prices[0];
    p.mainPrice = sp ? Number(sp.price) : null;
    p.mainFuel = sp ? sp.fuel : null;
    p.priceAt = sp ? sp.created_at : null;
    p.priceLabel = sp ? Number(sp.price).toFixed(2) : '';
  });
}

async function attachRatings(list) {
  if (!list.length) return;
  const rows = await DB.ratings(list.map((p) => p.id));
  const agg = {};
  rows.forEach((r) => { const a = agg[r.place_id] || (agg[r.place_id] = { sum: 0, n: 0, rows: [] }); a.sum += r.stars; a.n++; a.rows.push(r); });
  list.forEach((p) => { const a = agg[p.id]; p.rating = a ? a.sum / a.n : null; p.ratingCount = a ? a.n : 0; p.reviews = a ? a.rows : []; });
}
const starsTxt = (v) => '★ ' + v.toFixed(1).replace('.', ',');
let poiSort = 'near';
async function openPoiList(kind) {
  hideResults();
  const c = S.pos || (() => { const m = map.getCenter(); return { lat: m.lat, lon: m.lng }; })();
  const body = openSheet(KIND_LABEL[kind] + ' autour de toi', '<p class="muted">Recherche en cours…</p>', 'poi-' + kind);
  let list;
  try {
    list = await poisAround(kind, c, KIND_RADIUS[kind] || 5000);
  } catch (e) {
    body.innerHTML = '<p>Le service de carte ne répond pas. Réessaie dans un instant.</p><button class="btn block" id="poiRetry">Réessayer</button>';
    $('poiRetry').onclick = () => openPoiList(kind); return;
  }
  list.forEach((p) => { p.dist = dist(c, p); });
  if (kind === 'fuel') await attachPrices(list);
  if (RATED[kind]) await attachRatings(list);
  renderPoiList(kind, list, c);
}
function renderPoiList(kind, list, c) {
  if (S.sheetView !== 'poi-' + kind) return;
  let sorted = list.slice();
  if (kind === 'fuel' && poiSort === 'cheap') sorted.sort((a, b) => (a.mainPrice == null) - (b.mainPrice == null) || (a.mainPrice || 0) - (b.mainPrice || 0) || a.dist - b.dist);
  else if (kind !== 'fuel' && poiSort === 'best') sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.ratingCount - a.ratingCount || a.dist - b.dist);
  else sorted.sort((a, b) => a.dist - b.dist);
  sorted = sorted.slice(0, 40);
  showPois(sorted, kind);
  const body = $('sheetBody');
  let html = '';
  if (kind === 'fuel') html += '<div class="seg" role="tablist"><button data-s="near" class="' + (poiSort === 'near' ? 'on' : '') + '">Plus proche</button><button data-s="cheap" class="' + (poiSort === 'cheap' ? 'on' : '') + '">Moins cher</button></div>';
  else if (RATED[kind]) html += '<div class="seg" role="tablist"><button data-s="near" class="' + (poiSort !== 'best' ? 'on' : '') + '">Plus proche</button><button data-s="best" class="' + (poiSort === 'best' ? 'on' : '') + '">Mieux notés</button></div>';
  if (kind === 'truckstop' && !veh().heavy) html += '<div class="banner">' + ic('info') + '<span>Astuce : choisis ton véhicule (bouton en haut de la carte) pour des trajets adaptés poids lourds.</span></div>';
  if (kind === 'fuel' && !S.online) html += '<div class="banner">' + ic('info') + '<span>Les prix sont partagés entre utilisateurs en mode en ligne.</span></div>';
  if (!sorted.length) html += '<div class="empty">Rien trouvé dans ce coin. Déplace la carte et réessaie.</div>';
  html += sorted.map((p, i) => {
    let val = '<div class="val">' + (p.rating != null ? starsTxt(p.rating) + '<small>' + p.ratingCount + ' avis</small>' : '') + '<small>' + fmtDist(p.dist) + '</small></div>';
    if (kind === 'fuel') val = '<div class="val">' + (p.mainPrice != null ? p.mainPrice.toFixed(2) + '<small>' + esc(p.mainFuel) + ' · ' + ago(p.priceAt) + '</small>' : '<small>prix ?</small>') + '<small>' + fmtDist(p.dist) + '</small></div>';
    return '<button class="card tap" data-i="' + i + '"><div class="ico" style="background:' + KIND_COLOR[kind] + '">' + ic(kind) + '</div><div class="grow"><b>' + esc(p.name) + '</b><div class="sub">' + esc(p.details || (p.hours ? 'Horaires : ' + p.hours : '')) + '</div></div>' + val + '</button>';
  }).join('');
  html += '<p class="muted small">Lieux : OpenStreetMap. Notes et avis : laissés par les testeurs de ROUTA.' + (kind === 'charge' ? ' Disponibilité en direct : menu › Bornes libres.' : '') + '</p>';
  body.innerHTML = html;
  body.querySelectorAll('.card').forEach((b) => { b.onclick = () => openPoi(sorted[+b.dataset.i], kind); });
  body.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => { poiSort = b.dataset.s; renderPoiList(kind, list, c); }; });
  S.lastPoiList = { kind, list, c };
}
const OH_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const OH_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
function ohParse(s) {
  if (!s) return null; s = s.trim();
  if (s === '24/7') return { always: true };
  const week = [null, null, null, null, null, null, null];
  for (const raw of s.split(';')) {
    const rule = raw.trim(); if (!rule) continue;
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)(.*)$/);
    const days = m ? m[1] : 'Mo-Su'; const times = (m ? m[2] : rule).trim();
    const idx = [];
    days.split(',').map((x) => x.trim()).filter(Boolean).forEach((d) => {
      if (d === 'PH') return;
      const [x, y] = d.split('-'); const ia = OH_DAYS.indexOf(x), ib = y ? OH_DAYS.indexOf(y) : ia;
      if (ia < 0 || ib < 0) return;
      for (let i = ia, n = 0; n < 7; i = (i + 1) % 7, n++) { idx.push(i); if (i === ib) break; }
    });
    if (!idx.length) continue;
    let ranges = [];
    if (!/^(off|closed)$/i.test(times)) {
      if (times === '24:00' || times === '00:00-24:00') ranges = [[0, 1440]];
      else { const re = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g; let x; while ((x = re.exec(times))) ranges.push([+x[1] * 60 + +x[2], +x[3] * 60 + +x[4]]); }
      if (!ranges.length) return null;
    }
    idx.forEach((i) => { week[i] = ranges; });
  }
  return { week };
}
const hm = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
function ohStatus(o) {
  if (!o) return null;
  if (o.always) return { open: true, txt: 'Ouvert 24 h/24' };
  const now = new Date(); const d = (now.getDay() + 6) % 7; const t = now.getHours() * 60 + now.getMinutes();
  const today = o.week[d] || [], prev = o.week[(d + 6) % 7] || [];
  for (const [a, b] of today) { if ((b > a && t >= a && t < b) || (b <= a && t >= a)) return { open: true, txt: 'Ouvert · ferme à ' + hm(b) }; }
  for (const [a, b] of prev) { if (b <= a && t < b) return { open: true, txt: 'Ouvert · ferme à ' + hm(b) }; }
  for (let k = 0; k < 7; k++) {
    const day = (d + k) % 7; const rs = (o.week[day] || []).map((r) => r[0]).filter((a) => k > 0 || a > t).sort((x, y) => x - y);
    if (rs.length) return { open: false, txt: 'Fermé · ouvre ' + (k === 0 ? 'à ' : k === 1 ? 'demain à ' : OH_FR[day].toLowerCase() + '. à ') + hm(rs[0]) };
  }
  return { open: false, txt: 'Fermé' };
}
function ohLines(o) {
  if (!o) return [];
  if (o.always) return ['Tous les jours 24 h/24'];
  const fmt = (rs) => (rs && rs.length) ? rs.map(([a, b]) => hm(a) + '–' + (b === 1440 ? '24:00' : hm(b))).join(', ') : 'Fermé';
  const lines = []; let i = 0;
  while (i < 7) { let j = i; while (j + 1 < 7 && fmt(o.week[j + 1]) === fmt(o.week[i])) j++; lines.push((j > i ? OH_FR[i] + '–' + OH_FR[j] : OH_FR[i]) + ' : ' + fmt(o.week[i])); i = j + 1; }
  return lines;
}
function placeInfoHtml(p) {
  const t = p.tags || {}; let h = '';
  const ohs = t.opening_hours || p.hours;
  if (ohs) {
    const o = ohParse(ohs); const st = ohStatus(o);
    h += '<div class="card"><div class="grow">' + (st ? '<b class="' + (st.open ? 'oh-open' : 'oh-closed') + '">' + esc(st.txt) + '</b>' : '<b>Horaires</b>') +
      '<div class="sub">' + (o ? ohLines(o).map(esc).join('<br>') : esc(ohs)) + '</div></div></div>';
  }
  const phone = t.phone || t['contact:phone'] || t['contact:mobile'];
  const web = t.website || t['contact:website'] || t.url;
  if (phone || web) {
    h += '<div class="row">' +
      (phone ? '<a class="btn soft grow linkbtn" href="tel:' + esc(phone.split(';')[0].replace(/[^+\d]/g, '')) + '">' + ic('phone') + esc(phone.split(';')[0].trim()) + '</a>' : '') +
      (web ? '<a class="btn soft grow linkbtn" href="' + esc(/^https?:/.test(web) ? web : 'https://' + web) + '" target="_blank" rel="noopener">' + ic('web') + 'Site web</a>' : '') + '</div>';
  }
  if (ohs || phone || web) h += '<p class="muted small">Infos OpenStreetMap, parfois pas à jour.</p>';
  return h;
}
async function fetchPlaceTags(p) {
  if (!p.name) return null;
  const nm = p.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const q = '[out:json][timeout:8];nwr(around:80,' + p.lat + ',' + p.lon + ')["name"="' + nm + '"];out tags 3;';
  try {
    const els = await Promise.race([overpass(q, inCH(p)), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 7000))]);
    return els.length ? els.reduce((acc, e) => Object.assign(acc, e.tags || {}), {}) : null;
  } catch (e) { return null; }
}
function openPoi(p, kind) {
  const d = S.pos ? fmtDist(dist(S.pos, p)) : '';
  let html = '<div class="row"><div class="ico" style="background:' + KIND_COLOR[kind] + '">' + ic(kind) + '</div><div class="grow"><div class="muted small">' + esc(KIND_LABEL[kind]) + (d ? ' · ' + d : '') + '</div><div>' + esc(p.details || '') + '</div>' + '</div></div>' + placeInfoHtml(p);
  if (S.settings.googleLinks) html += '<a class="btn soft block gbtn" href="' + esc(googleUrl(p)) + '" target="_blank" rel="noopener">' + ic('star') + 'Voir les avis Google</a>';
  if (kind === 'fuel') {
    html += '<h3>Prix signalés</h3>' + ((p.prices && p.prices.length) ? p.prices.map((r) => '<div class="card"><div class="grow"><b>' + esc(r.fuel) + '</b><div class="sub">' + ago(r.created_at) + '</div></div><div class="val">' + Number(r.price).toFixed(2) + ' <small>CHF/L</small></div></div>').join('') : '<div class="empty">Aucun prix signalé. Sois le premier !</div>');
    html += '<button class="btn soft block" id="poiPrice">Signaler un prix</button>';
  }
  if (RATED[kind]) {
    html += '<h3>Avis des testeurs</h3>' + (p.rating != null ? '<div class="row"><span class="stars-big">' + starsTxt(p.rating) + '</span><span class="muted">' + p.ratingCount + ' avis</span></div>' : '') +
      ((p.reviews && p.reviews.length) ? p.reviews.slice().sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at)).slice(0, 8).map((r) => '<div class="card"><div class="grow"><b>' + '★'.repeat(r.stars) + '<span class="muted">' + '★'.repeat(5 - r.stars) + '</span></b>' + (r.comment ? '<div>' + esc(r.comment) + '</div>' : '') + '<div class="sub">' + esc(r.pseudo || 'Testeur') + ' · ' + ago(r.created_at) + '</div></div></div>').join('') : '<div class="empty">Pas encore d\'avis. Donne le tien !</div>') +
      '<button class="btn soft block" id="poiRate">' + ic('star') + 'Noter cet endroit</button>';
  }
  html += '<button class="btn block" id="poiGo">' + ic('nav') + 'Y aller</button>';
  html += '<button class="btn soft block" id="poiFav">' + ic('star') + (favAt(p, 25) ? 'Dans tes favoris' : 'Enregistrer en favori') + '</button>';
  const body = openSheet(p.name, html, 'poi');
  const rb = body.querySelector('#poiRate'); if (rb) rb.onclick = () => openRateForm(p, kind);
  body.querySelector('#poiGo').onclick = () => { closeSheet(); chooseDestination({ name: p.name, sub: KIND_LABEL[kind], lat: p.lat, lon: p.lon }); };
  body.querySelector('#poiFav').onclick = () => addFav({ name: p.name, addr: p.addr || '', lat: p.lat, lon: p.lon });
  if (window.ROUTA_X && ROUTA_X.poiExtra) ROUTA_X.poiExtra(p, kind, body);
  const pb = body.querySelector('#poiPrice'); if (pb) pb.onclick = () => openPriceForm(p);
}
/* ======================= Tous les établissements ======================= */
const POI_LAYERS = ['poi_r1', 'poi_r7', 'poi_r20'];
const SUB_FR = { restaurant: 'Restaurant', fast_food: 'Fast-food', cafe: 'Café', bar: 'Bar', pub: 'Pub', beer: 'Bar', ice_cream: 'Glacier', bakery: 'Boulangerie', supermarket: 'Supermarché', grocery: 'Épicerie', convenience: 'Épicerie', butcher: 'Boucherie', pharmacy: 'Pharmacie', bank: 'Banque', atm: 'Bancomat', fuel: 'Station-service', parking: 'Parking', hotel: 'Hôtel', motel: 'Motel', clothes: 'Vêtements', clothing_store: 'Vêtements', shoes: 'Chaussures', hairdresser: 'Coiffeur', beauty: 'Institut de beauté', car_repair: 'Garage', car: 'Concession auto', car_wash: 'Lavage auto', car_parts: 'Pièces auto', tyres: 'Pneus', doctors: 'Médecin', dentist: 'Dentiste', hospital: 'Hôpital', clinic: 'Clinique', post_office: 'Poste', school: 'École', kindergarten: 'Crèche', college: 'Haute école', university: 'Université', place_of_worship: 'Lieu de culte', museum: 'Musée', cinema: 'Cinéma', theatre: 'Théâtre', library: 'Bibliothèque', florist: 'Fleuriste', kiosk: 'Kiosque', mobile_phone: 'Téléphonie', electronics: 'Électronique', computer: 'Informatique', hardware: 'Quincaillerie', doityourself: 'Bricolage', optician: 'Opticien', laundry: 'Laverie', dry_cleaning: 'Pressing', bicycle: 'Vélos', books: 'Librairie', jewelry: 'Bijouterie', alcohol: 'Boissons', alcohol_shop: 'Boissons', beverages: 'Boissons', department_store: 'Grand magasin', mall: 'Centre commercial', furniture: 'Meubles', garden_centre: 'Jardinerie', toys: 'Jouets', sports: 'Sport', pet: 'Animalerie', veterinary: 'Vétérinaire', police: 'Police', townhall: 'Administration', fire_station: 'Pompiers', attraction: 'Attraction', viewpoint: 'Point de vue', gym: 'Salle de sport', fitness_centre: 'Salle de sport', swimming_pool: 'Piscine', stadium: 'Stade', park: 'Parc', playground: 'Place de jeux', charging_station: 'Borne de recharge', tobacco: 'Tabac', deli: 'Traiteur', chemist: 'Droguerie', variety_store: 'Bazar', gift: 'Cadeaux', travel_agency: 'Agence de voyage', estate_agent: 'Immobilier', insurance: 'Assurance', lawyer: 'Avocat', dentist_office: 'Dentiste', parcel_locker: 'Casier à colis', post_box: 'Boîte aux lettres', vending_machine: 'Distributeur', toilets: 'Toilettes', drinking_water: 'Fontaine', recycling: 'Recyclage', bicycle_parking: 'Parking vélos', bicycle_rental: 'Location de vélos', information: 'Information', fountain: 'Fontaine', marketplace: 'Marché', nightclub: 'Discothèque', casino: 'Casino', bus: 'Arrêt de bus', rail: 'Gare', taxi: 'Taxi', car_rental: 'Location de voitures', hostel: 'Auberge', guest_house: 'Maison d\'hôtes', camp_site: 'Camping', caravan_site: 'Aire de camping-cars', motorcycle: 'Motos', music: 'Musique', photo: 'Photo', stationery: 'Papeterie', newsagent: 'Kiosque', pastry: 'Pâtisserie', confectionery: 'Confiserie', cheese: 'Fromagerie', wine: 'Vins', seafood: 'Poissonnerie', greengrocer: 'Primeur', tailor: 'Retouches', massage: 'Massage', tattoo: 'Tatouage', nails: 'Onglerie' };
const FOOD_CLS = /^(restaurant|fast_food|cafe|bar|beer|pub|ice_cream|food_court|biergarten)$/;
const SHOP_CLS = /^(shop|grocery|bakery|butcher|alcohol_shop|clothing_store|jewelry|furniture|hardware|car|bicycle|books|florist|supermarket|convenience|electronics|mobile_phone|shoes|toys|sports|pet|garden_centre|department_store|mall|doityourself|optician|deli|kiosk|gift|variety_store|computer|chemist|beauty|hairdresser|laundry|tobacco)$/;
/* Arrêts de bus et de tram : masqués par défaut, prochains départs au toucher */
const TRANSIT_STOP = ['any', ['==', ['get', 'class'], 'bus'], ['==', ['get', 'subclass'], 'bus_stop'], ['==', ['get', 'subclass'], 'bus_station'], ['==', ['get', 'subclass'], 'tram_stop']];
function setupTransit() {
  try {
    POI_LAYERS.forEach((id) => { if (!map.getLayer(id)) return; const f = map.getFilter(id); map.setFilter(id, f ? ['all', f, ['!', TRANSIT_STOP]] : ['!', TRANSIT_STOP]); });
    const def = (map.getStyle().layers || []).find((l) => l.id === 'poi_transit');
    if (def) {
      const f = def.filter;
      map.setFilter('poi_transit', f ? ['all', f, ['!', TRANSIT_STOP]] : ['!', TRANSIT_STOP]);
      const c = JSON.parse(JSON.stringify(def));
      c.id = 'transit-stops'; c.minzoom = 14.5; c.filter = ['all', ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false], TRANSIT_STOP];
      c.layout = Object.assign({}, c.layout, { visibility: 'none', 'icon-size': 1.45 });
      map.addLayer(c);
    }
  } catch (e) { console.warn('transports', e); }
  applyTransit();
  map.on('click', (e) => {
    if (e._routaDone || S.placing || S.nav) return;
    const layers = ['transit-stops', 'poi_transit'].filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
    if (!layers.length) return;
    const pad = 30;
    const fs = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers }).filter((f) => (f.properties || {}).class !== 'airport');
    fs.sort((a, b) => { const d = (f) => { const p = map.project(f.geometry.coordinates); return Math.hypot(p.x - e.point.x, p.y - e.point.y); }; return d(a) - d(b); });
    if (!fs.length) return;
    e._routaDone = true;
    openStop(fs[0]);
  });
}
function applyTransit() {
  try { if (map.getLayer('transit-stops')) map.setLayoutProperty('transit-stops', 'visibility', S.settings.showTransit ? 'visible' : 'none'); } catch (e) { /* */ }
}
const LINE_ONLY = /^(B|BUS|T|TRAM|M|NFB|NFT|NFO|KB|EXB|BAT|BP|FUN|PB|GB)$/i;
async function openStop(f) {
  const pr = f.properties || {}; const g = f.geometry.coordinates;
  const name = pr['name:fr'] || pr.name || pr['name:latin'] || 'Arrêt';
  const link = '<a class="btn soft block" target="_blank" rel="noopener" href="https://search.ch/fahrplan/?from=' + encodeURIComponent(name) + '">' + ic('clock') + 'Horaires complets</a>';
  openSheet(name, '<p class="muted">Chargement des prochains départs…</p>', 'poistop');
  const token = (S.stopTok = (S.stopTok || 0) + 1);
  const load = async () => {
    let html = '';
    try {
      const loc = await fetch('https://transport.opendata.ch/v1/locations?x=' + g[1] + '&y=' + g[0] + '&type=station').then((r) => r.json());
      const st = (loc.stations || []).filter((x) => x.id).sort((a, b) => (a.distance || 0) - (b.distance || 0))[0];
      if (!st || (st.distance || 0) > 400) throw new Error('loin');
      const sb = await fetch('https://transport.opendata.ch/v1/stationboard?id=' + st.id + '&limit=10').then((r) => r.json());
      const now = Date.now();
      const rows = (sb.stationboard || []).map((d) => {
        const t = d.stop && d.stop.departure ? new Date(d.stop.departure.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) : null;
        if (!t || isNaN(t)) return '';
        const delay = +(d.stop.delay || 0);
        const m = Math.round((t.getTime() + delay * 60000 - now) / 60000);
        if (m < -1) return '';
        const cat = String(d.category || '').trim(); const num = String(d.number || '').trim();
        const train = !LINE_ONLY.test(cat);
        const line = train ? cat + (num && num.length < 4 ? num : '') : (num || cat);
        const hm = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
        const when = m <= 0 ? '<b>maintenant</b>' : m < 60 ? '<b>' + m + ' min</b>' : '<b>' + hm + '</b>';
        return '<li class="dep"><span class="ln' + (train ? ' train' : '') + '">' + esc(line) + '</span><span class="to">' + esc(d.to || '') + (d.stop.platform ? '<small class="muted"> · <span>voie</span> ' + esc(d.stop.platform) + '</small>' : '') + '</span><span class="tm">' + when + (delay > 0 ? '<small class="late">+' + delay + '</small>' : '') + '</span></li>';
      }).filter(Boolean);
      html = (rows.length ? '<h3>Prochains départs</h3><ul class="deps">' + rows.join('') + '</ul>' : '<p class="muted">Aucun départ prévu pour le moment.</p>') + link + '<p class="muted small">Horaires en temps réel : opendata.ch</p>';
    } catch (e) {
      html = '<p class="muted">Horaires en direct indisponibles pour cet arrêt.</p>' + link;
    }
    if (token !== S.stopTok || S.sheetView !== 'poistop') return false;
    $('sheetBody').innerHTML = html;
    return true;
  };
  if (await load()) {
    const iv = setInterval(async () => { if (token !== S.stopTok || S.sheetView !== 'poistop' || $('sheetWrap').hidden || !(await load())) clearInterval(iv); }, 30000);
  }
}
function setupPlaces() {
  setupTransit();
  try { map.setLayerZoomRange('poi_r1', 15, 24); map.setLayerZoomRange('poi_r7', 16, 24); map.setLayerZoomRange('poi_r20', 17, 24); } catch (e) { /* style différent */ }
  POI_LAYERS.forEach((id) => { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'icon-size', 1.4); } catch (e) { /* */ } });
  applyPlaces();
  map.on('click', (e) => {
    if (e._routaDone || S.placing || S.nav || !S.settings.showPlaces) return;
    const layers = POI_LAYERS.filter((id) => map.getLayer(id));
    if (!layers.length) return;
    const pad = 30;
    const fs = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers });
    if (!fs.length) return;
    let best = fs[0], bd = Infinity;
    fs.forEach((f) => { const g = f.geometry && f.geometry.coordinates; if (!g) return; const pt = map.project(g); const d = Math.hypot(pt.x - e.point.x, pt.y - e.point.y); if (d < bd) { bd = d; best = f; } });
    e._routaDone = true;
    openPlace(best);
  });
  POI_LAYERS.forEach((id) => { if (!map.getLayer(id)) return; map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; }); });
}
function applyPlaces() {
  POI_LAYERS.forEach((id) => { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', S.settings.showPlaces ? 'visible' : 'none'); } catch (e) { /* */ } });
  const b = $('btnPlaces'); if (b) { b.classList.toggle('active', !!S.settings.showPlaces); b.setAttribute('aria-label', S.settings.showPlaces ? 'Masquer les établissements' : 'Afficher les établissements'); }
}
function googleUrl(p) {
  const t = p.tags || {};
  const addr = p.addr || [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', ');
  const q = addr ? p.name + ', ' + addr : p.name + ' ' + p.lat.toFixed(5) + ',' + p.lon.toFixed(5);
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}
async function reverseAddr(p) {
  const q = await geoReverse(p);
  return q ? [[q.street, q.housenumber].filter(Boolean).join(' '), q.city].filter(Boolean).join(', ') : '';
}
async function openPlace(f) {
  const pr = f.properties || {}; const g = f.geometry.coordinates;
  const sub = pr.subclass || pr.class || '';
  const label = SUB_FR[sub] || SUB_FR[pr.class] || (sub ? sub.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Lieu');
  const name = pr['name:fr'] || pr.name || pr['name:latin'] || label;
  const kind = FOOD_CLS.test(pr.class) || FOOD_CLS.test(sub) ? 'food' : pr.class === 'fuel' ? 'fuel' : pr.class === 'parking' ? 'parking' : (SHOP_CLS.test(pr.class) || SHOP_CLS.test(sub)) ? 'shops' : 'place';
  const p = { id: 'map/' + name.toLowerCase().replace(/\s+/g, ' ').trim() + '@' + g[1].toFixed(4) + ',' + g[0].toFixed(4), name, lat: g[1], lon: g[0], details: label };
  openSheet(name, '<p class="muted">Chargement…</p>', 'place');
  const [addr, tags] = await Promise.all([reverseAddr(p), fetchPlaceTags(p), attachRatings([p]).catch(() => {})]);
  if (tags) p.tags = tags;
  p.addr = addr;
  if (addr) p.details = label + ' · ' + addr;
  if (S.sheetView === 'place') openPoi(p, kind);
}
function openRateForm(p, kind) {
  const mine = (p.reviews || []).find((r) => r.created_by === S.me.id);
  let stars = mine ? mine.stars : 0;
  const body = openSheet('Noter ' + p.name,
    '<div class="starpick" id="starPick">' + [1, 2, 3, 4, 5].map((n) => '<button data-n="' + n + '" aria-label="' + n + ' étoile' + (n > 1 ? 's' : '') + '">★</button>').join('') + '</div>' +
    '<label class="field" for="rateTxt">Ton avis (facultatif)<textarea id="rateTxt" maxlength="300" placeholder="' + (kind === 'food' ? 'Ex. : bon kebab, service rapide, parking facile' : kind === 'truckstop' ? 'Ex. : place pour 20 camions, douches propres, calme la nuit' : 'Ex. : bien situé, personnel sympa') + '">' + esc(mine && mine.comment || '') + '</textarea></label>' +
    '<button class="btn block" id="rateSend">Envoyer ma note</button>', 'rate');
  const paint = () => body.querySelectorAll('#starPick button').forEach((b) => b.classList.toggle('on', +b.dataset.n <= stars));
  paint();
  body.querySelectorAll('#starPick button').forEach((b) => { b.onclick = () => { stars = +b.dataset.n; paint(); }; });
  body.querySelector('#rateSend').onclick = async () => {
    if (!stars) { toast('Choisis une note de 1 à 5 étoiles.'); return; }
    const ok = await DB.rate({ place_id: p.id, place_name: p.name, kind, stars, comment: $('rateTxt').value.trim() || null, created_by: S.me.id, pseudo: S.me.pseudo, created_at: new Date().toISOString() });
    if (ok) {
      toast('Merci ! Ta note est enregistrée.');
      const row = { place_id: p.id, stars, comment: $('rateTxt').value.trim() || null, created_by: S.me.id, pseudo: S.me.pseudo, created_at: new Date().toISOString() };
      p.reviews = (p.reviews || []).filter((r) => r.created_by !== S.me.id).concat([row]);
      p.ratingCount = p.reviews.length; p.rating = p.reviews.reduce((s, r) => s + r.stars, 0) / p.ratingCount;
      openPoi(p, kind);
    }
  };
}
function openPriceForm(p) {
  const body = openSheet('Prix chez ' + p.name,
    '<div class="seg" id="fuelSeg"><button data-f="SP95" class="on">SP95</button><button data-f="SP98">SP98</button><button data-f="Diesel">Diesel</button></div>' +
    '<label class="field" for="priceIn">Prix au litre (CHF)<input id="priceIn" type="text" inputmode="decimal" placeholder="1.85"></label>' +
    '<button class="btn block" id="priceSend">Envoyer le prix</button>', 'price');
  let fuel = 'SP95';
  body.querySelectorAll('#fuelSeg button').forEach((b) => { b.onclick = () => { fuel = b.dataset.f; body.querySelectorAll('#fuelSeg button').forEach((x) => x.classList.toggle('on', x === b)); }; });
  body.querySelector('#priceSend').onclick = async () => {
    const v = parseFloat(($('priceIn').value || '').replace(',', '.'));
    if (isNaN(v) || v < 0.8 || v > 4) { toast('Entre un prix entre 0.80 et 4.00 CHF, par exemple 1.85.'); return; }
    const ok = await DB.addPrice({ id: uuid(), station_id: p.id, station_name: p.name, fuel, price: Math.round(v * 1000) / 1000, created_by: S.me.id, created_at: new Date().toISOString() });
    if (ok) { toast('Merci ! Prix partagé.'); openPoiList('fuel'); }
  };
}
async function alongRoute(R, kind) {
  const n = Math.min(60, Math.max(8, Math.round(R.total / 3000)));
  const step = Math.max(1, Math.floor(R.coords.length / n));
  const pts = [];
  for (let i = 0; i < R.coords.length; i += step) pts.push(R.coords[i].lat.toFixed(5) + ',' + R.coords[i].lon.toFixed(5));
  const last = R.coords[R.coords.length - 1]; pts.push(last.lat.toFixed(5) + ',' + last.lon.toFixed(5));
  toast('Recherche ' + (kind === 'charge' ? 'des bornes' : kind === 'truckstop' ? 'des aires poids lourds' : 'des stations') + ' le long du trajet…');
  try {
    const a0 = R.coords[0];
    const els = await overpass(osmQuery(kind, '1500,' + pts.join(','), 150), inCH(a0) && inCH(last));
    const list = els.map((e) => parseOsm(e, kind)).filter((p) => p.lat != null);
    list.forEach((p) => { p.dist = S.pos ? dist(S.pos, p) : 0; });
    if (kind === 'fuel') await attachPrices(list);
    if (kind === 'fuel' && veh().isHgv) list.sort((a, b) => (/Poids lourds|AdBlue/.test(b.details) ? 1 : 0) - (/Poids lourds|AdBlue/.test(a.details) ? 1 : 0));
    if (kind === 'charge') list.sort((a, b) => (/CCS|Tesla/.test(b.details) ? 1 : 0) - (/CCS|Tesla/.test(a.details) ? 1 : 0));
    showPois(list.slice(0, 120), kind);
    toast(list.length + ' ' + (kind === 'charge' ? 'bornes' : kind === 'truckstop' ? 'aires' : 'stations') + ' trouvées le long du trajet. Touche une icône pour les détails.');
  } catch (e) { toast('Le service de carte ne répond pas. Réessaie dans un instant.'); }
}

/* ======================= Signaler ======================= */
function openReport(at) {
  let type = null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const body = openSheet('Que se passe-t-il ?',
    '<div class="grid4">' + Object.keys(ALERT_TYPES).map((k) => '<button class="typebtn" data-t="' + k + '">' + ic(k) + esc(ALERT_TYPES[k].label) + '</button>').join('') + '</div>' +
    '<label class="field" for="repComment">Précision (facultatif)<input id="repComment" type="text" maxlength="120" placeholder="Ex. : pneu sur la voie de droite"></label>' +
    '<button class="btn block" id="repSend" disabled>Choisis un type</button>' +
    (at ? '' : '<button class="btn ghost" id="repPlace">Placer sur la carte plutôt qu\'à ma position</button>'), 'report');
  body.querySelectorAll('.typebtn').forEach((b) => {
    b.onclick = () => {
      type = b.dataset.t;
      body.querySelectorAll('.typebtn').forEach((x) => x.classList.toggle('sel', x === b));
      const s = $('repSend'); s.disabled = false; s.textContent = 'Signaler : ' + ALERT_TYPES[type].label;
    };
    b.ondblclick = () => { type = b.dataset.t; send(); };
  });
  const send = async (where) => {
    if (!type) return;
    const p = where || at || S.pos;
    if (!p) { toast("Position inconnue : place l'alerte sur la carte."); placePoint('Où est le problème ?', (pt) => sendAlert(type, pt, '')); return; }
    closeSheet();
    sendAlert(type, p, ($('repComment') && $('repComment').value) || '');
  };
  $('repSend').onclick = () => send();
  const pl = $('repPlace'); if (pl) pl.onclick = () => { if (!type) { toast("Choisis d'abord le type d'alerte."); return; } const t = type, cm = $('repComment').value; placePoint('Où est le problème ?', (pt) => sendAlert(t, pt, cm)); };
  const vb = $('repVoice'); if (vb) vb.onclick = () => voiceReport(SR, at);
}
async function sendAlert(type, p, comment) {
  const a = { id: uuid(), type, lat: p.lat, lon: p.lon, comment: comment || null, created_by: S.me.id, created_name: S.me.pseudo, confirms: 1, denies: 0, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + (type === 'travaux' ? 24 : 2) * 3600000).toISOString() };
  S.prompted.add(a.id);
  if (await DB.addAlert(a)) { vibrate(30); toast('Alerte envoyée : <b>' + esc(ALERT_TYPES[type].label) + '</b>. Merci !'); }
}
function voiceReport(SR, at) {
  const rec = new SR(); rec.lang = I18N.speech; rec.interimResults = false; rec.maxAlternatives = 3;
  $('repVoice').textContent = 'Je t’écoute…';
  rec.onresult = (e) => {
    const text = [...e.results[0]].map((r) => r.transcript.toLowerCase()).join(' ');
    const rules = [['contresens', /contresens|contre-sens|sens interdit/], ['feu', /feu|signalisation|tricolore/], ['brouillard', /brouillard|visibilit/], ['fermee', /ferm[ée]|barr[ée]|bloqu[ée]/], ['accident', /accident|carambolage|collision/], ['bouchon', /bouchon|embouteillage|trafic|ralenti/], ['travaux', /travaux|chantier/], ['trou', /trou|nid/], ['arret', /arr[êe]t|panne|stationn/], ['glissant', /glissant|verglas|neige|pluie|huile|gravier/], ['animal', /animal|chevreuil|cerf|vache|chien|renard|sanglier/], ['objet', /objet|pneu|d[ée]bris|carton|pierre|caillou|chute/]];
    const hit = rules.find(([, re]) => re.test(text));
    if (hit) { closeSheet(); sendAlert(hit[0], at || S.pos, text); say('Alerte ' + ALERT_TYPES[hit[0]].say + ' envoyée'); }
    else { toast('Je n’ai pas compris « ' + esc(text) + ' ». Choisis le type dans la liste.'); $('repVoice').innerHTML = ic('mic') + 'Dire à voix haute'; }
  };
  rec.onerror = () => { toast('Micro indisponible. Choisis le type dans la liste.'); const v = $('repVoice'); if (v) v.innerHTML = ic('mic') + 'Dire à voix haute'; };
  try { rec.start(); } catch (e) { toast('Micro indisponible.'); }
}
$('btnReport').onclick = () => openReport(null);

function openAlert(id) {
  const a = S.alerts.get(id); if (!a) return;
  const t = ALERT_TYPES[a.type] || ALERT_TYPES.objet;
  const mine = a.created_by === S.me.id;
  const body = openSheet(t.label,
    '<div class="row wrap"><span class="pill warn">Signalé ' + ago(a.created_at) + '</span><span class="pill ok">Confirmé ' + (a.confirms || 1) + ' fois</span>' + ((a.denies || 0) ? '<span class="pill">Plus là : ' + a.denies + '</span>' : '') + (S.pos ? '<span class="pill">' + fmtDist(dist(S.pos, a)) + '</span>' : '') + '</div>' +
    (a.comment ? '<p>« ' + esc(a.comment) + ' »</p>' : '') +
    (a.created_name ? '<p class="muted small">Par ' + esc(a.created_name) + '</p>' : '') +
    '<div class="row"><button class="btn grow" id="aYes">Toujours là</button><button class="btn ghost grow" id="aNo">Plus là</button></div>' +
    (mine ? '<button class="btn danger" id="aDel">' + ic('trash') + 'Supprimer mon alerte</button>' : ''), 'alert');
  body.querySelector('#aYes').onclick = () => { closeSheet(); voteAlert(id, true); };
  body.querySelector('#aNo').onclick = () => { closeSheet(); voteAlert(id, false); };
  const del = body.querySelector('#aDel'); if (del) del.onclick = () => { closeSheet(); DB.deleteAlert(id); toast('Alerte supprimée.'); };
}

/* ======================= Point sur la carte ======================= */
function setPin(p) {
  if (S.markers.pin) { S.markers.pin.remove(); S.markers.pin = null; }
  if (p) S.markers.pin = new maplibregl.Marker({ element: el('<div class="mk-pin" aria-hidden="true"><svg viewBox="0 0 24 32"><path d="M12 1C6 1 1.5 5.5 1.5 11.3 1.5 19 12 31 12 31s10.5-12 10.5-19.7C22.5 5.5 18 1 12 1z"/><circle cx="12" cy="11.5" r="4"/></svg></div>'), anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(map);
}
function openPoint(p) {
  const fav = favAt(p, 25);
  if (fav) { openFav(fav.id); return; }
  setPin(p);
  const body = openSheet('Point sur la carte', '<p id="ptAddr"><b>Recherche de l\'adresse…</b></p><p class="muted small">' + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + (S.pos ? ' · à ' + fmtDist(dist(S.pos, p)) : '') + '</p>' +
    '<button class="btn block" id="ptGo">' + ic('nav') + 'Itinéraire jusqu\'ici</button>' +
    '<button class="btn soft block" id="ptFav">' + ic('star') + 'Enregistrer en favori</button>' +
    '<div class="row"><button class="btn soft grow" id="ptRep">' + ic('objet') + 'Signaler ici</button><button class="btn soft grow" id="ptSpot">' + ic('spot') + 'Ajouter un spot</button></div>', 'point');
  setPin(p);
  reverseAddr(p).then((a) => { p.addr = a; const x = $('ptAddr'); if (x && S.sheetView === 'point') x.innerHTML = '<b>' + esc(a || 'Adresse inconnue') + '</b>'; });
  body.querySelector('#ptGo').onclick = () => { closeSheet(); chooseDestination({ name: p.addr || 'Point choisi', sub: p.addr ? 'Point choisi' : p.lat.toFixed(4) + ', ' + p.lon.toFixed(4), lat: p.lat, lon: p.lon }); };
  body.querySelector('#ptFav').onclick = () => addFav({ lat: p.lat, lon: p.lon, addr: p.addr || '' });
  body.querySelector('#ptRep').onclick = () => openReport(p);
  body.querySelector('#ptSpot').onclick = () => openAddSpot(p);
}

/* ======================= Favoris (repères enregistrés sur ce téléphone) ======================= */
S.favs = store.get('routa.favs', []);
const saveFavs = () => store.set('routa.favs', S.favs);
function favAt(p, m) { return S.favs.find((f) => dist(f, p) < (m || 25)); }
function drawFavs() {
  (S.markers.favs || []).forEach((m) => m.remove());
  S.markers.favs = S.favs.map((f) => {
    const e = el('<button class="mk-fav" aria-label="Favori : ' + esc(f.name) + '"><svg viewBox="0 0 24 24">' + '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>' + '</svg><span>' + esc(f.name) + '</span></button>');
    e.onclick = (ev) => { ev.stopPropagation(); openFav(f.id); };
    return new maplibregl.Marker({ element: e, anchor: 'top', offset: [0, -18] }).setLngLat([f.lon, f.lat]).addTo(map);
  });
}
function addFav(p) {
  const old = favAt(p, 25);
  if (old) { openFav(old.id); return; }
  const def = p.name || '';
  const body = openSheet('Enregistrer en favori',
    (p.addr ? '<p class="muted">' + esc(p.addr) + '</p>' : '') +
    '<label class="field" for="fvName">Nom du repère<input id="fvName" type="text" maxlength="40" value="' + esc(def) + '" placeholder="Ex. : Maison, Travail, Garage, Point de vue…"></label>' +
    '<div class="row wrap" id="fvQuick">' + ['Domicile', 'Travail', 'Garage', 'Point de vue'].map((n) => '<button class="pill tap" data-n="' + n + '">' + n + '</button>').join('') + '</div>' +
    '<button class="btn block" id="fvSave">' + ic('star') + 'Enregistrer</button>' +
    '<p class="muted small">Tes favoris restent sur ce téléphone, personne d\'autre ne les voit.</p>', 'favadd');
  body.querySelectorAll('#fvQuick button').forEach((b) => { b.onclick = () => { $('fvName').value = b.dataset.n; }; });
  body.querySelector('#fvSave').onclick = () => {
    const name = $('fvName').value.trim() || p.addr || 'Mon repère';
    const slot = Object.keys(SLOTS).find((k) => SLOTS[k].toLowerCase() === name.toLowerCase());
    if (slot) { closeSheet(); saveSlot(slot, p); return; }
    S.favs.unshift({ id: uuid(), name, addr: p.addr || '', lat: p.lat, lon: p.lon, created_at: new Date().toISOString() });
    saveFavs(); drawFavs(); closeSheet(); vibrate(15);
    toast('<b>' + esc(name) + '</b> ajouté à tes favoris.', { action: 'Voir', onAction: openFavs });
  };
  setTimeout(() => { const i = $('fvName'); if (i && !i.value) i.focus(); }, 300);
}
function openFav(id) {
  const f = S.favs.find((x) => x.id === id); if (!f) return;
  const body = openSheet(f.name,
    '<p>' + esc(f.addr || (f.lat.toFixed(5) + ', ' + f.lon.toFixed(5))) + (S.pos ? '<span class="muted"> · à ' + fmtDist(dist(S.pos, f)) + '</span>' : '') + '</p>' +
    '<button class="btn block" id="fvGo">' + ic('nav') + 'Itinéraire jusqu\'ici</button>' +
    '<label class="field" for="fvRen">Renommer<input id="fvRen" type="text" maxlength="40" value="' + esc(f.name) + '"></label>' +
    '<div class="row"><button class="btn soft grow" id="fvRenOk">Enregistrer le nom</button><button class="btn soft grow danger-t" id="fvDel">Supprimer</button></div>', 'fav');
  body.querySelector('#fvGo').onclick = () => { closeSheet(); chooseDestination({ name: f.name, sub: f.addr || 'Favori', lat: f.lat, lon: f.lon, fav: true }); };
  body.querySelector('#fvRenOk').onclick = () => { const n = $('fvRen').value.trim(); if (!n) return; f.name = n; saveFavs(); drawFavs(); toast('Nom modifié.'); openFav(f.id); };
  body.querySelector('#fvDel').onclick = () => {
    const i = S.favs.indexOf(f); S.favs.splice(i, 1); saveFavs(); drawFavs(); closeSheet();
    toast('<b>' + esc(f.name) + '</b> supprimé.', { action: 'Annuler', onAction: () => { S.favs.splice(i, 0, f); saveFavs(); drawFavs(); }, ms: 7000 });
  };
}
function openFavs() {
  const c = S.pos || (() => { const m = map.getCenter(); return { lat: m.lat, lon: m.lng }; })();
  const list = S.favs.filter((f) => !f.slot).map((f) => Object.assign({ d: dist(c, f) }, f));
  const body = openSheet('Mes favoris',
    Object.keys(SLOTS).map((k) => { const f = slotFav(k); return '<div class="card"><div class="ico" style="background:#4DA3FF">' + ic(k) + '</div><div class="grow"><b>' + SLOTS[k] + '</b><div class="sub">' + (f ? esc(f.addr || 'Enregistré') : 'Pas encore défini') + '</div></div>' + (f ? '<button class="btn small" data-sgo="' + k + '">' + ic('nav') + 'Y aller</button>' : '') + '<button class="btn soft small" data-sedit="' + k + '">' + (f ? 'Modifier' : 'Définir') + '</button></div>'; }).join('') +
    '<h3>Autres favoris</h3>' +
    (list.length ? list.map((f, i) => '<div class="card"><button class="grow tap plain" data-i="' + i + '"><b>' + esc(f.name) + '</b><div class="sub">' + esc(f.addr || 'Repère') + ' · ' + fmtDist(f.d) + '</div></button><button class="btn small" data-go="' + i + '">' + ic('nav') + 'Y aller</button></div>').join('') :
      '<div class="empty">Pas encore de favori. Touche un endroit sur la carte (ou un établissement), puis « Enregistrer en favori ».</div>') +
    '<p class="muted small">Tes favoris apparaissent aussi en haut de la recherche.</p>', 'favs');
  body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { const f = list[+b.dataset.i]; map.easeTo({ center: [f.lon, f.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 }); openFav(f.id); }; });
  body.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => { const f = list[+b.dataset.go]; closeSheet(); chooseDestination({ name: f.name, sub: f.addr || 'Favori', lat: f.lat, lon: f.lon, fav: true }); }; });
  body.querySelectorAll('[data-sgo]').forEach((b) => { b.onclick = () => { closeSheet(); goSlot(b.dataset.sgo); }; });
  body.querySelectorAll('[data-sedit]').forEach((b) => { b.onclick = () => { closeSheet(); goSlot(b.dataset.sedit, true); }; });
}

/* ======================= Spots ======================= */
let spotFilter = 'all';
function openSpots() {
  const c = S.pos || (() => { const m = map.getCenter(); return { lat: m.lat, lon: m.lng }; })();
  const list = [...S.spots.values()].filter((s) => spotFilter === 'all' || s.category === spotFilter).map((s) => Object.assign({}, s, { d: dist(c, s) })).sort((a, b) => a.d - b.d);
  const body = openSheet('Spots, routes et cols',
    '<div class="seg" style="grid-auto-flow:row;grid-template-columns:repeat(3,minmax(0,1fr))">' + [['all', 'Tous']].concat(Object.entries(SPOT_CATS).filter(([k]) => k !== 'autre')).map(([k, v]) => '<button data-c="' + k + '" class="' + (spotFilter === k ? 'on' : '') + '">' + esc(v) + '</button>').join('') + '</div>' +
    '<div class="row"><button class="btn soft grow" id="spotAdd">' + ic('spot') + 'Ajouter un spot</button>' + (window.ROUTA_X ? '<button class="btn soft grow" id="spotCols"><svg viewBox="0 0 24 24"><path d="M3 20l6-11 4 6 3-4 5 9z"/></svg>Cols et météo</button>' : '') + '</div>' +
    (list.length ? list.slice(0, 60).map((s, i) => '<button class="card tap" data-i="' + i + '"><div class="ico" style="background:#fff">' + ic('spot') + '</div><div class="grow"><b>' + esc(s.name) + '</b><div class="sub">' + esc(SPOT_CATS[s.category] || 'Spot') + (s.description ? ' · ' + esc(s.description) : '') + '</div></div><div class="val">' + fmtDist(s.d) + '</div></button>').join('') : '<div class="empty">Aucun spot ici pour le moment. Ajoute le premier avec le bouton au-dessus.</div>'), 'spots');
  body.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => { spotFilter = b.dataset.c; openSpots(); }; });
  body.querySelectorAll('.card').forEach((b) => { b.onclick = () => openSpot(list[+b.dataset.i].id); });
  body.querySelector('#spotAdd').onclick = () => openAddSpot(null);
  const sc = body.querySelector('#spotCols'); if (sc) sc.onclick = () => openK('cols');
}
function openSpot(id) {
  const s = S.spots.get(id); if (!s) return;
  const mine = s.created_by === S.me.id;
  const body = openSheet(s.name,
    '<div class="row wrap"><span class="pill">' + esc(SPOT_CATS[s.category] || 'Spot') + '</span>' + (S.pos ? '<span class="pill">' + fmtDist(dist(S.pos, s)) + '</span>' : '') + (s.created_name ? '<span class="pill">Ajouté par ' + esc(s.created_name) + '</span>' : '') + '</div>' +
    (s.description ? '<p>' + esc(s.description) + '</p>' : '') +
    '<button class="btn block" id="spGo">' + ic('nav') + 'Y aller</button>' +
    '<button class="btn soft block" id="spShow">Voir sur la carte</button>' +
    (mine ? '<button class="btn danger" id="spDel">' + ic('trash') + 'Supprimer ce spot</button>' : ''), 'spot');
  body.querySelector('#spGo').onclick = () => { closeSheet(); chooseDestination({ name: s.name, sub: SPOT_CATS[s.category] || 'Spot', lat: s.lat, lon: s.lon }); };
  body.querySelector('#spShow').onclick = () => { closeSheet(); stopFollow(); map.flyTo({ center: [s.lon, s.lat], zoom: 14 }); };
  const del = body.querySelector('#spDel'); if (del) del.onclick = () => { closeSheet(); DB.deleteSpot(id); toast('Spot supprimé.'); };
  if (window.ROUTA_X && ROUTA_X.spotExtra) ROUTA_X.spotExtra(s, body);
}
function openAddSpot(at) {
  let cat = 'route';
  const body = openSheet('Nouveau spot',
    '<label class="field" for="spName">Nom<input id="spName" type="text" maxlength="60" placeholder="Ex. : Virages du Marchairuz"></label>' +
    '<div class="seg" id="spCat" style="grid-auto-flow:row;grid-template-columns:repeat(3,minmax(0,1fr))">' + Object.entries(SPOT_CATS).map(([k, v]) => '<button data-c="' + k + '" class="' + (k === cat ? 'on' : '') + '">' + esc(v) + '</button>').join('') + '</div>' +
    '<label class="field" for="spDesc">Description (facultatif)<textarea id="spDesc" maxlength="200" placeholder="Pourquoi y aller, meilleur moment…"></textarea></label>' +
    (at ? '<button class="btn block" id="spSave">Enregistrer le spot</button>' : '<div class="row"><button class="btn soft grow" id="spHere"' + (S.pos ? '' : ' disabled') + '>À ma position</button><button class="btn grow" id="spPlace">Choisir sur la carte</button></div>'), 'addspot');
  body.querySelectorAll('#spCat button').forEach((b) => { b.onclick = () => { cat = b.dataset.c; body.querySelectorAll('#spCat button').forEach((x) => x.classList.toggle('on', x === b)); }; });
  const collect = () => { const name = $('spName').value.trim(); if (name.length < 2) { toast('Donne un nom au spot.'); return null; } return { name, desc: $('spDesc').value.trim() }; };
  const save = async (p, f) => {
    const s = { id: uuid(), name: f.name, description: f.desc || null, category: cat, lat: p.lat, lon: p.lon, created_by: S.me.id, created_name: S.me.pseudo, created_at: new Date().toISOString() };
    if (await DB.addSpot(s)) toast('Spot ajouté : <b>' + esc(s.name) + '</b>');
  };
  if (at) body.querySelector('#spSave').onclick = () => { const f = collect(); if (f) { closeSheet(); save(at, f); } };
  else {
    body.querySelector('#spHere').onclick = () => { const f = collect(); if (f && S.pos) { closeSheet(); save(S.pos, f); } };
    body.querySelector('#spPlace').onclick = () => { const f = collect(); if (f) placePoint('Où est le spot ?', (p) => save(p, f)); };
  }
}

/* ======================= Conducteurs & messages ======================= */
function visLabel(v) { return v === 'invisible' ? 'Invisible' : v === 'tous' ? 'Visible · tous' : 'Visible · amis'; }
function setAvatar() {
  const b = $('btnProfile');
  b.firstChild.nodeType === 3 ? (b.firstChild.nodeValue = initials(S.me.pseudo)) : b.insertBefore(document.createTextNode(initials(S.me.pseudo)), b.firstChild);
  b.style.background = S.me.color;
  const m = $('fabMenu'); if (m) { m.textContent = initials(S.me.pseudo); m.style.background = S.me.color; }
}
function updateVisChip() {
  const dot = $('visDot');
  dot.className = 'dot' + (S.me.vis === 'tous' ? ' on' : S.me.vis === 'amis' ? ' friends' : '');
  $('visLabel').textContent = visLabel(S.me.vis);
}
function visSeg(id) {
  return '<div class="seg" id="' + id + '">' + [['invisible', 'Invisible'], ['amis', 'Mes amis'], ['tous', 'Tout le monde']].map(([k, v]) => '<button data-v="' + k + '" class="' + (S.me.vis === k ? 'on' : '') + '">' + v + '</button>').join('') + '</div>';
}
function bindVisSeg(root, id, after) {
  root.querySelectorAll('#' + id + ' button').forEach((b) => {
    b.onclick = () => {
      S.me.vis = b.dataset.v; saveMe(); updateVisChip(); pushPresence(true);
      root.querySelectorAll('#' + id + ' button').forEach((x) => x.classList.toggle('on', x === b));
      toast(S.me.vis === 'invisible' ? 'Tu es invisible.' : S.me.vis === 'amis' ? 'Seuls tes amis te voient.' : 'Tes amis te voient précisément, les autres voient une zone approximative.');
      if (after) after();
    };
  });
}
function openDrivers() {
  const list = driversList();
  const keepScroll = S.sheetView === 'drivers' ? $('sheetBody').scrollTop : 0;
  const body = openSheet('Conducteurs autour', '<h3>Qui me voit ?</h3>' + visSeg('dvVis') +
    (!S.online ? '<div class="banner">' + ic('info') + '<span>Mode solo : active le mode en ligne (voir le guide) pour voir les autres conducteurs.</span></div>' : '') +
    (list.length ? list.map((d, i) => '<div class="card"><div class="ico" style="background:' + esc(d.color || '#FF8A3D') + ';border-radius:22px">' + esc(initials(d.pseudo)) + '</div><button class="grow" data-open="' + i + '" style="background:none;border:0;text-align:left;padding:0"><b>' + esc(d.pseudo) + '</b><div class="sub">' + esc(d.car || 'Voiture inconnue') + ' · ' + (d.dist != null ? (d.fuzzy ? 'env. ' : '') + fmtDist(d.dist) : '') + (d.speed ? ' · ' + d.speed + ' km/h' : '') + '</div></button><button class="btn small" data-bump="' + i + '">Bump</button></div>').join('')
      : '<div class="empty">Personne de visible pour le moment. Partage ton code ami <b class="code" style="font-size:16px">' + esc(S.me.code) + '</b> à tes potes pour qu\'ils t\'ajoutent.</div>'), 'drivers');
  body.scrollTop = keepScroll;
  bindVisSeg(body, 'dvVis');
  body.querySelectorAll('[data-bump]').forEach((b) => { b.onclick = () => bump(list[+b.dataset.bump]); });
  body.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openDriver(list[+b.dataset.open].id); });
}
function openDriver(id) {
  const d = driversList().find((x) => x.id === id); if (!d) { toast("Ce conducteur n'est plus visible."); return; }
  const isFriend = (S.me.friends || []).some((f) => f.id === id);
  const body = openSheet(d.pseudo,
    '<div class="row"><div class="ico" style="background:' + esc(d.color || '#FF8A3D') + ';border-radius:22px">' + esc(initials(d.pseudo)) + '</div><div class="grow"><b>' + esc(d.car || 'Voiture inconnue') + '</b><div class="sub">' + (d.fuzzy ? 'Zone approximative · ' : '') + (d.dist != null ? fmtDist(d.dist) : '') + ' · vu ' + ago(d.updated_at) + '</div></div></div>' +
    '<button class="btn block" id="dBump">Bump</button>' +
    '<button class="btn soft block" id="dJoin">' + ic('nav') + 'Le rejoindre</button>' +
    (isFriend ? '' : '<button class="btn ghost" id="dFriend">Demander en ami</button>'), 'driver');
  body.querySelector('#dBump').onclick = () => bump(d);
  body.querySelector('#dJoin').onclick = () => { closeSheet(); chooseDestination({ name: d.pseudo, sub: d.car || '', lat: d.vlat, lon: d.vlon }); };
  const fr = body.querySelector('#dFriend'); if (fr) fr.onclick = async () => { if (window.ROUTA_X && ROUTA_X.requestFriend) await ROUTA_X.requestFriend(d); else addFriend({ id: d.id, pseudo: d.pseudo }); openDriver(id); };
}
function canBump() {
  const now = Date.now(); const list = store.get('routa.bumps', []).filter((t) => now - t < 15 * 60000);
  if (list.length >= 3) { const wait = Math.ceil((list[0] + 15 * 60000 - now) / 60000); toast('Maximum 3 bumps par quart d\'heure. Prochain bump possible dans ' + wait + ' min.'); return false; }
  list.push(now); store.set('routa.bumps', list); return true;
}
async function bump(d) {
  if (!canBump()) return;
  const ok = await DB.sendMsg({ id: uuid(), from_id: S.me.id, from_name: S.me.pseudo, to_id: d.id, kind: 'bump', body: null, created_at: new Date().toISOString() });
  if (ok) { vibrate(40); toast('Bump envoyé à <b>' + esc(d.pseudo) + '</b>'); }
}
function nameOf(id) {
  const d = S.drivers.get(id); if (d) return d.pseudo;
  const f = (S.me.friends || []).find((x) => x.id === id); if (f) return f.pseudo;
  const m = S.messages.find((x) => x.from_id === id && x.from_name); return m ? m.from_name : 'Conducteur';
}
function onIncoming(m) {
  if (S.messages.some((x) => x.id === m.id)) return;
  if (window.ROUTA_X && ROUTA_X.onMsg && ROUTA_X.onMsg(m)) return;
  S.messages.push(m);
  updateBadge();
  const who = m.from_name || nameOf(m.from_id);
  if (m.kind === 'bump') {
    vibrate([80, 60, 80]);
    toast('<b>' + esc(who) + '</b> t\'a envoyé un bump !', { action: 'Bump en retour', onAction: () => bump({ id: m.from_id, pseudo: who }) });
  }
  if (S.sheetView === 'thread:' + m.from_id) openThread(m.from_id);
  else if (S.sheetView === 'messages') openMessages();
}
function updateBadge() {
  const n = S.messages.filter((m) => m.to_id === S.me.id && Date.parse(m.created_at) > S.lastRead).length;
  $('msgBadge').hidden = !n; $('msgBadge').textContent = n;
  $('menuBadge').hidden = !n; $('menuBadge').textContent = n;
}
function markRead() { S.lastRead = Date.now(); store.set('routa.lastRead', S.lastRead); updateBadge(); }
function openMessages() {
  markRead();
  const convs = new Map();
  S.messages.forEach((m) => { const other = m.from_id === S.me.id ? m.to_id : m.from_id; convs.set(other, m); });
  const list = [...convs.entries()].sort((a, b) => Date.parse(b[1].created_at) - Date.parse(a[1].created_at));
  const body = openSheet('Bumps reçus',
    (!S.online ? '<div class="banner">' + ic('info') + '<span>Les messages demandent le mode en ligne (voir le guide).</span></div>' : '') +
    (list.length ? list.map(([id, m], i) => '<button class="card tap" data-i="' + i + '"><div class="ico" style="background:' + esc((S.drivers.get(id) || {}).color || '#FF8A3D') + ';border-radius:22px">' + esc(initials(nameOf(id))) + '</div><div class="grow"><b>' + esc(nameOf(id)) + '</b><div class="sub">' + (m.from_id === S.me.id ? 'Toi : ' : '') + (m.kind === 'bump' ? 'Bump !' : esc(m.body)) + '</div></div><div class="val"><small>' + ago(m.created_at) + '</small></div></button>').join('')
      : '<div class="empty">Aucun message. Envoie un bump à un conducteur depuis la carte.</div>'), 'messages');
  body.querySelectorAll('.card').forEach((b) => { b.onclick = () => openThread(list[+b.dataset.i][0]); });
}
function openThread(otherId) {
  markRead();
  const msgs = S.messages.filter((m) => (m.from_id === otherId && m.to_id === S.me.id) || (m.from_id === S.me.id && m.to_id === otherId)).slice(-40);
  const body = openSheet(nameOf(otherId),
    '<div style="display:flex;flex-direction:column;gap:8px">' + (msgs.length ? msgs.map((m) => '<div class="msg' + (m.from_id === S.me.id ? ' mine' : '') + '">' + (m.kind === 'bump' ? '<b>Bump !</b>' : esc(m.body)) + '<div class="meta">' + ago(m.created_at) + '</div></div>').join('') : '<div class="empty">Pas encore de message.</div>') + '</div>' +
    '<button class="btn block" id="thBump">Envoyer un bump</button><p class="muted small">Maximum 3 bumps par quart d\'heure.</p>', 'thread:' + otherId);
  body.scrollTop = body.scrollHeight;
  body.querySelector('#thBump').onclick = async () => { await bump({ id: otherId, pseudo: nameOf(otherId) }); openThread(otherId); };
}

/* Amis */
function addFriend(f) {
  S.me.friends = (S.me.friends || []).filter((x) => x.id !== f.id).concat([f]);
  saveMe(); pushPresence(true);
  toast('<b>' + esc(f.pseudo) + '</b> est ton ami : il te voit quand tu es visible.');
}

/* ======================= Mon véhicule ======================= */
function updateVehChip() {
  const v = veh();
  $('vehLabel').textContent = v.label;
  $('vehIco').innerHTML = ic(v.icon);
  document.querySelectorAll('.chip.heavy-only').forEach((c) => { c.hidden = !v.heavy; });
  document.querySelectorAll('.chip.ev-only').forEach((c) => { c.hidden = !v.ev; });
}
function openVehicle(after) {
  let type = S.vehicle.type;
  let dims = Object.assign({}, (VEHICLES[type] || {}).dims || {}, S.vehicle.dims || {});
  let hazmat = !!S.vehicle.hazmat;
  const body = openSheet('Mon véhicule', '<p class="muted small">Le trajet, les alertes et les lieux proposés s\'adaptent à ton véhicule.</p><div class="vehgrid" id="vehGrid">' +
    Object.entries(VEHICLES).map(([k, v]) => '<button class="typebtn' + (k === type ? ' sel' : '') + '" data-v="' + k + '">' + ic(v.icon) + esc(v.label) + '</button>').join('') + '</div><div id="vehDims"></div>' +
    '<button class="btn block" id="vehSave">Enregistrer</button>', 'vehicle');
  const drawDims = () => {
    const v = VEHICLES[type];
    if (!v.heavy) { $('vehDims').innerHTML = ''; return; }
    $('vehDims').innerHTML = '<h3>Dimensions</h3><p class="muted small">Remplis avec les valeurs de ta carte grise ou de ton véhicule chargé.</p><div class="dimgrid">' +
      DIM_LABELS.map(([k, l, u]) => '<label class="field" for="dim_' + k + '">' + l + ' (' + u + ')<input id="dim_' + k + '" type="text" inputmode="decimal" value="' + String(dims[k] != null ? dims[k] : '').replace('.', ',') + '"></label>').join('') + '</div>' +
      (type === 'camion' ? '<label class="switch" for="dimHaz"><span>Matières dangereuses (ADR)</span><input id="dimHaz" type="checkbox"' + (hazmat ? ' checked' : '') + '></label>' : '');
  };
  drawDims();
  body.querySelectorAll('#vehGrid .typebtn').forEach((b) => {
    b.onclick = () => {
      type = b.dataset.v; dims = Object.assign({}, VEHICLES[type].dims || {});
      body.querySelectorAll('#vehGrid .typebtn').forEach((x) => x.classList.toggle('sel', x === b));
      drawDims();
    };
  });
  body.querySelector('#vehSave').onclick = () => {
    const v = VEHICLES[type]; const nd = {};
    if (v.heavy) {
      const lim = { height: [1.5, 5], width: [1.5, 3.5], length: [3, 30], weight: [1, 60] };
      for (const [k, l] of DIM_LABELS) {
        const x = parseFloat(($('dim_' + k).value || '').replace(',', '.'));
        if (isNaN(x) || x < lim[k][0] || x > lim[k][1]) { toast(l + ' : entre une valeur entre ' + lim[k][0] + ' et ' + lim[k][1] + '.'); return; }
        nd[k] = Math.round(x * 100) / 100;
      }
      hazmat = type === 'camion' && $('dimHaz') ? $('dimHaz').checked : false;
    }
    S.vehicle = { type, dims: nd, hazmat };
    store.set('routa.vehicle', S.vehicle);
    updateVehChip();
    toast('Véhicule : <b>' + esc(vehSummary()) + '</b>');
    closeSheet();
    if (after) after();
  };
}
function parseLimit(v, unit) {
  if (!v) return null;
  const s = String(v).toLowerCase().replace(',', '.');
  if (/none|default|unsigned|below_default/.test(s)) return null;
  const ft = s.match(/(\d+)'\s*(\d+)?/);
  if (ft) return Math.round((+ft[1] * 0.3048 + (+(ft[2] || 0)) * 0.0254) * 100) / 100;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (unit === 't' && /kg/.test(s)) return n / 1000;
  return n;
}
async function openRestrictions() {
  const v = veh();
  const c = (() => { const m = map.getCenter(); return { lat: m.lat, lon: m.lng }; })();
  const body = openSheet('Restrictions autour', '<p class="muted">Recherche des limites de hauteur, poids et accès…</p>', 'restrict');
  const ar = '4000,' + c.lat + ',' + c.lon;
  const q = '[out:json][timeout:40];(way["maxheight"](around:' + ar + ');way["maxweight"](around:' + ar + ');way["maxlength"](around:' + ar + ');way["maxwidth"](around:' + ar + ');way["hgv"~"^(no|destination|delivery)$"](around:' + ar + ');way["maxweight:hgv"](around:' + ar + '););out center tags 250;';
  let els;
  try { els = await overpass(q, inCH(c)); } catch (e) { body.innerHTML = '<p>Le service de carte ne répond pas. Réessaie dans un instant.</p>'; return; }
  const d = v.dims; const out = [];
  els.forEach((e) => {
    const t = e.tags || {}; const reasons = [];
    if (!t.highway || /^(service|footway|cycleway|path|pedestrian|steps|track|bridleway|corridor|platform)$/.test(t.highway)) return;
    const mh = parseLimit(t.maxheight, 'm'), mw = parseLimit(t['maxweight:hgv'] || t.maxweight, 't'), ml = parseLimit(t.maxlength, 'm'), mwd = parseLimit(t.maxwidth, 'm');
    if (mh != null && d.height && mh < d.height) reasons.push(['Hauteur max ' + String(mh).replace('.', ',') + ' m', String(mh).replace('.', ',') + ' m']);
    if (mw != null && d.weight && mw < d.weight) reasons.push(['Poids max ' + String(mw).replace('.', ',') + ' t', String(mw).replace('.', ',') + ' t']);
    if (ml != null && d.length && ml < d.length) reasons.push(['Longueur max ' + String(ml).replace('.', ',') + ' m', 'L ' + String(ml).replace('.', ',')]);
    if (mwd != null && d.width && mwd < d.width) reasons.push(['Largeur max ' + String(mwd).replace('.', ',') + ' m', 'l ' + String(mwd).replace('.', ',')]);
    if (v.isHgv && /^(no|destination|delivery)$/.test(t.hgv || '')) reasons.push([t.hgv === 'no' ? 'Interdit aux poids lourds' : 'Poids lourds : livraison / riverains', 'PL']);
    if (!reasons.length || !e.center) return;
    out.push({ lat: e.center.lat, lon: e.center.lon, name: t.name || t.ref || 'Route', reasons, dist: dist(c, { lat: e.center.lat, lon: e.center.lon }) });
  });
  out.sort((a, b) => a.dist - b.dist);
  clearPois();
  out.slice(0, 120).forEach((r) => {
    const e = el('<button class="mk-sign" aria-label="' + esc(r.reasons[0][0]) + '">' + esc(r.reasons[0][1]) + '</button>');
    e.addEventListener('click', (ev) => { ev.stopPropagation(); toast('<b>' + esc(r.name) + '</b> : ' + esc(r.reasons.map((x) => x[0]).join(', '))); });
    S.markers.pois.push(new maplibregl.Marker({ element: e }).setLngLat([r.lon, r.lat]).addTo(map));
  });
  body.innerHTML = '<div class="banner">' + ic(v.icon) + '<span>Limites qui concernent ton véhicule (<b>' + esc(vehSummary()) + '</b>) dans un rayon de 4 km autour du centre de la carte.</span></div>' +
    (out.length ? out.slice(0, 40).map((r, i) => '<button class="card tap" data-i="' + i + '"><div class="ico sign">' + esc(r.reasons[0][1]) + '</div><div class="grow"><b>' + esc(r.name) + '</b><div class="sub">' + esc(r.reasons.map((x) => x[0]).join(' · ')) + '</div></div><div class="val">' + fmtDist(r.dist) + '</div></button>').join('')
      : '<div class="empty">Aucune restriction connue pour ton véhicule ici. Respecte quand même la signalisation sur place.</div>') +
    '<p class="muted small">Données OpenStreetMap, parfois incomplètes. Les trajets calculés pour ton véhicule évitent ces routes.</p>';
  body.querySelectorAll('.card').forEach((b) => { b.onclick = () => { const r = out[+b.dataset.i]; closeSheet(); stopFollow(); map.flyTo({ center: [r.lon, r.lat], zoom: 16 }); }; });
}

/* ======================= Infos pays ======================= */
const CTRY = window.ROUTA_COUNTRIES || {};
S.country = store.get('routa.country', null);
let countryAt = 0, countryPos = null;
function updateCountryChip() {
  const k = CTRY[S.country];
  $('ctryLabel').textContent = k ? k.name : 'Infos pays';
}
async function countryTick(force) {
  if (!S.pos) return;
  if (!force && (Date.now() - countryAt < 90000 || (countryPos && dist(countryPos, S.pos) < 3000))) return;
  countryAt = Date.now(); countryPos = S.pos;
  const q = await geoReverse(S.pos);
  const cc = q && q.cc;
  if (!cc || cc === S.country) return;
  const prev = S.country; S.country = cc; store.set('routa.country', cc); updateCountryChip();
  const k = CTRY[cc];
  if (prev && k) {
    toast('Bienvenue ' + esc(k.in) + ' · urgences <b>' + esc(k.main) + '</b> · ' + esc(k.toll.label), { action: 'Infos', onAction: () => openCountry(cc, 'route'), ms: 10000 });
    say('Bienvenue ' + k.in + '. ' + (k.toll.type === 'vignette' ? 'Attention, vignette obligatoire.' : ''));
  }
}
function openCountry(code, tab) {
  code = code || S.country || 'CH';
  const k = CTRY[code];
  tab = tab || 'sos';
  if (!k) { toast('Pas encore d\'infos pour ce pays.'); code = 'CH'; }
  const c = CTRY[code];
  let h = '<div class="seg" id="ctTabs"><button data-t="sos" class="' + (tab === 'sos' ? 'on' : '') + '">Urgences</button><button data-t="route" class="' + (tab === 'route' ? 'on' : '') + '">Règles</button><button data-t="toll" class="' + (tab === 'toll' ? 'on' : '') + '">Vignette / péage</button></div>';
  if (tab === 'sos') {
    h += '<a class="btn block sosbtn" href="tel:' + esc(c.main) + '">' + ic('phone') + 'Appeler le ' + esc(c.main) + '</a>';
    h += c.sos.map(([l, n]) => '<a class="card tap telrow" href="tel:' + esc(n) + '"><div class="ico" style="background:#FF8F94">' + ic('phone') + '</div><div class="grow"><b>' + esc(l) + '</b></div><div class="val">' + esc(n) + '</div></a>').join('');
    h += '<p class="muted small">' + (/^(112)$/.test(c.main) || c.sos.some((s) => s[1] === '112') ? 'Le 112 fonctionne partout en Europe.' : 'Le 112 n\'est pas forcément disponible ici : utilise les numéros ci-dessus.') + '</p>';
  } else if (tab === 'route') {
    h += '<div class="limgrid">' + [['Ville', c.lim[0]], ['Hors localité', c.lim[1]], ['Autoroute', c.lim[2]]].map(([l, v]) => '<div class="limcell"><div class="limv">' + esc(v) + '</div><div class="sub">' + l + '</div></div>').join('') + '</div>' +
      (/mph/.test(c.lim[0]) ? '' : '<p class="muted small">Vitesses en km/h pour une voiture.</p>');
    if (c.alc) h += '<div class="card"><div class="grow"><b>Alcool</b><div class="sub">' + esc(c.alc) + '</div></div></div>';
    if (c.must.length) h += '<div class="card"><div class="grow"><b>Obligatoire</b><div class="sub">' + c.must.map(esc).join('<br>') + '</div></div></div>';
    if (c.tips.length) h += '<div class="card"><div class="grow"><b>Bon à savoir</b><div class="sub">' + c.tips.map(esc).join('<br>') + '</div></div></div>';
  } else {
    const badge = { vignette: ['Vignette obligatoire', 'warn'], peage: ['Péage', ''], gratuit: ['Gratuit en voiture', 'ok'] }[c.toll.type] || ['', ''];
    h += '<div class="row wrap"><span class="pill ' + badge[1] + '">' + badge[0] + '</span></div><p>' + esc(c.toll.text) + '</p>';
    h += c.toll.links.map(([l, u]) => '<a class="btn soft block linkbtn" href="' + esc(u) + '" target="_blank" rel="noopener">' + ic('web') + esc(l) + '</a>').join('');
    if (c.toll.type === 'vignette') h += '<div class="banner">' + ic('info') + '<span>Achète sur le <b>site officiel</b> : les sites revendeurs facturent souvent des frais en plus.</span></div>';
    if (c.toll.heavy && veh().heavy) h += '<div class="card"><div class="grow"><b>Ton véhicule (' + esc(vehSummary()) + ')</b><div class="sub">' + esc(c.toll.heavy) + '</div></div></div>' + (c.toll.heavyLinks || []).map(([l, u]) => '<a class="btn soft block linkbtn" href="' + esc(u) + '" target="_blank" rel="noopener">' + ic('web') + esc(l) + '</a>').join('');
    h += '<p class="muted small">Prix et règles changent souvent : vérifie toujours sur le site officiel avant de partir.</p>';
  }
  h += '<label class="field" for="ctSel">Autre pays<select id="ctSel">' + Object.entries(CTRY).sort((x, y) => x[1].name.localeCompare(y[1].name, 'fr')).map(([cc, v]) => '<option value="' + cc + '"' + (cc === code ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') + '</select></label>';
  const body = openSheet(c.name + (code === S.country ? ' · ici' : ''), h, 'country');
  body.querySelectorAll('#ctTabs button').forEach((b) => { b.onclick = () => openCountry(code, b.dataset.t); });
  body.querySelector('#ctSel').onchange = (e) => openCountry(e.target.value, tab);
}
async function routeCountries(R, dest) {
  if (!R || R.total < 15000) return;
  const n = Math.min(10, Math.max(3, Math.round(R.total / 40000)));
  const seq = [];
  for (let i = 0; i <= n; i++) {
    const pt = R.coords[Math.min(R.coords.length - 1, Math.round(i * (R.coords.length - 1) / n))];
    const q = await geoReverse(pt);
    if (S.sheetView !== 'preview' || !S.preview || S.preview.R !== R) return;
    if (q && q.cc && seq[seq.length - 1] !== q.cc) seq.push(q.cc);
    await new Promise((r) => setTimeout(r, 1100));
  }
  const list = [...new Set(seq)].filter((cc) => CTRY[cc]);
  if (list.length < 2 && !(list.length === 1 && CTRY[list[0]].toll.type === 'vignette' && R.total > 30000)) return;
  const div = document.createElement('div');
  div.className = 'banner ctryb';
  div.innerHTML = ic('flag') + '<span><b>Pays traversés :</b> ' + list.map((cc) => esc(CTRY[cc].name) + ' (' + esc(CTRY[cc].toll.label) + ')').join(' → ') + '</span>';
  const btn = document.createElement('button'); btn.className = 'btn small'; btn.textContent = 'Infos';
  btn.onclick = () => openCountry(list.find((cc) => CTRY[cc].toll.type === 'vignette') || list[list.length - 1], 'toll');
  div.appendChild(btn);
  const go = $('goNav'); if (go && go.parentNode) go.parentNode.insertBefore(div, go);
}

/* ======================= Retours des testeurs ======================= */
const FB_KINDS = [['bug', 'Un problème'], ['idee', 'Une idée'], ['autre', 'Autre chose']];
function deviceInfo() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Autre';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'Autre';
  const installed = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone ? 'app installée' : 'navigateur';
  return os + ' · ' + browser + ' · ' + installed + ' · ' + window.innerWidth + '×' + window.innerHeight;
}
function protoBanner() {
  return '<div class="banner proto">' + ic('info') + '<span><b>ROUTA est un prototype en test.</b> Des choses peuvent mal marcher : c\'est normal, et c\'est pour ça qu\'on a besoin de toi. Signale chaque bug, chaque truc pas clair et chaque idée avec le bouton « Mon avis ». L\'app est en plein développement et s\'améliore avec vos retours.</span></div>';
}
function shareCard() {
  return '<div class="card"><div class="grow"><b>Partage ROUTA avec tes potes</b><div class="sub">Plus on est nombreux sur la carte, plus les alertes et les spots sont utiles.</div></div><button class="btn small" id="shareApp">Partager</button></div>';
}
async function shareApp() {
  const url = 'https://routa.ackfix.com';
  const text = 'ROUTA, la nouvelle app GPS pour les automobilistes (en développement). Teste-la :';
  try {
    if (navigator.share) { await navigator.share({ title: 'ROUTA', text, url }); return; }
    await navigator.clipboard.writeText(text + ' ' + url); toast('Lien copié, colle-le à tes potes !');
  } catch (e) { if (e && e.name !== 'AbortError') toast('Lien : ' + url); }
}
async function openFeedback(preset) {
  let kind = (preset && preset.kind) || 'bug';
  const body = openSheet('Mon avis sur ROUTA',
    protoBanner() +
    shareCard() +
    '<div class="seg" id="fbKind">' + FB_KINDS.map(([k, v]) => '<button data-k="' + k + '" class="' + (k === kind ? 'on' : '') + '">' + v + '</button>').join('') + '</div>' +
    '<label class="field" for="fbMsg"><span id="fbLabel"></span><textarea id="fbMsg" maxlength="2000" style="height:140px"></textarea></label>' +
    '<label class="switch" for="fbTech"><span>Joindre les infos techniques (modèle de téléphone, navigateur, version). Jamais ta position.</span><input id="fbTech" type="checkbox" checked></label>' +
    '<button class="btn block" id="fbSend">Envoyer mon retour</button>' +
    '<p class="muted small">Chaque retour est lu. Merci de prendre le temps, ça aide vraiment à construire l\'app.</p>', 'feedback');
  const labels = { bug: ['Qu\'est-ce qui ne marche pas ?', 'Ex. : la voix ne parle pas après le rond-point, la carte reste grise sur mon iPhone…'], idee: ['Ton idée ou amélioration', 'Ex. : pouvoir enregistrer mes trajets favoris, voir la météo sur la route…'], autre: ['Ton message', 'Tout ce que tu veux nous dire sur ROUTA'] };
  const setKind = (k) => { kind = k; $('fbLabel').textContent = labels[k][0]; $('fbMsg').placeholder = labels[k][1]; body.querySelectorAll('#fbKind button').forEach((x) => x.classList.toggle('on', x.dataset.k === k)); };
  setKind(kind);
  $('shareApp').onclick = shareApp;
  if (preset && preset.text) $('fbMsg').value = preset.text;
  body.querySelectorAll('#fbKind button').forEach((b) => { b.onclick = () => setKind(b.dataset.k); });
  body.querySelector('#fbSend').onclick = async () => {
    const msg = $('fbMsg').value.trim();
    if (msg.length < 5) { toast('Écris quelques mots pour qu\'on comprenne ton retour.'); return; }
    const btn = $('fbSend'); btn.disabled = true; btn.textContent = 'Envoi…';
    const ok = await DB.sendFeedback({ id: uuid(), kind, message: msg, pseudo: S.me.pseudo, created_by: S.me.id, app_version: VERSION, device: $('fbTech').checked ? deviceInfo() : null, page: preset && preset.page || null, created_at: new Date().toISOString() });
    if (ok) {
      closeSheet();
      store.set('routa.fbCount', (store.get('routa.fbCount', 0) || 0) + 1);
      toast('Merci ! Ton retour est bien arrivé.');
    } else { btn.disabled = false; btn.textContent = 'Envoyer mon retour'; }
  };
}

/* ======================= Profil ======================= */
function profileForm(isNew) {
  let color = S.me.color || COLORS[0];
  return {
    html:
      '<label class="field" for="pfName">Pseudo<input id="pfName" type="text" maxlength="20" value="' + esc(S.me.pseudo || '') + '" placeholder="Ex. : Pilote_GT"></label>' +
      '<label class="field" for="pfCar">Ta voiture<input id="pfCar" type="text" maxlength="30" value="' + esc(S.me.car || '') + '" placeholder="Ex. : Golf 8 GTI"></label>' +
      '<h3>Qui peut me voir sur la carte ?</h3>' + visSeg('pfVis') +
      '<p class="muted small">Tes amis voient ta position exacte. Les autres voient seulement une zone d\'environ 1 km.</p>',
    bind(root) {
      root.querySelectorAll('#pfColors .swatch').forEach((b) => { b.onclick = () => { color = b.dataset.c; root.querySelectorAll('#pfColors .swatch').forEach((x) => x.classList.toggle('sel', x === b)); }; });
      root.querySelectorAll('#pfVis button').forEach((b) => { b.onclick = () => { S.me.vis = b.dataset.v; root.querySelectorAll('#pfVis button').forEach((x) => x.classList.toggle('on', x === b)); }; });
      return () => {
        const name = $('pfName').value.trim();
        if (name.length < 2) { toast('Choisis un pseudo d\'au moins 2 caractères.'); return false; }
        S.me.pseudo = name; S.me.car = $('pfCar').value.trim(); S.me.color = color;
        saveMe(); updateVisChip(); setAvatar();
        pushPresence(true);
        return true;
      };
    }
  };
}
function openProfile() {
  const f = profileForm(false);
  const body = openSheet('Mon profil', f.html +
    '<button class="btn block" id="pfSave">Enregistrer</button>' +
    '<h3>Mon code ami</h3><div class="card"><div class="grow"><div class="code">' + esc(S.me.code) + '</div><div class="sub">Donne-le à tes potes : ils l\'entrent dans « Ajouter un ami ».</div></div><button class="iconbtn small" id="pfCopy" aria-label="Copier le code">' + ic('copy') + '</button></div>' +
    '<h3>Ajouter un ami</h3><form id="frForm" class="row"><label class="field grow" for="frCode"><span class="sr">Code ami</span><input id="frCode" type="text" maxlength="6" placeholder="Code à 6 caractères" autocapitalize="characters" autocomplete="off"></label><button class="btn" type="submit">Ajouter</button></form>' +
    ((S.me.friends || []).length ? (S.me.friends.map((fr, i) => '<div class="card"><div class="grow"><b>' + esc(fr.pseudo) + '</b><div class="sub">Peut te voir quand tu es visible</div></div><button class="iconbtn small" data-rm="' + i + '" aria-label="Retirer ' + esc(fr.pseudo) + '">' + ic('trash') + '</button></div>').join('')) : '<div class="empty">Pas encore d\'amis.</div>') +
    '<button class="btn block" id="pfFeedback">' + ic('msg') + 'Signaler un problème ou une idée</button>' +
    '<a class="btn soft block" href="aide.html" style="text-decoration:none">' + ic('info') + 'Aide et installation (iPhone, Android)</a>' +
    '<button class="btn soft block" id="pfVeh">' + ic(veh().icon) + 'Mon véhicule : ' + esc(vehSummary()) + '</button>' +
    '<h3>Réglages</h3>' +
    '<label class="switch" for="stVoice"><span>Guidage vocal</span><input id="stVoice" type="checkbox"' + (S.settings.voice ? ' checked' : '') + '></label>' +
    '<label class="switch" for="stPlaces"><span>Afficher les établissements sur la carte</span><input id="stPlaces" type="checkbox"' + (S.settings.showPlaces ? ' checked' : '') + '></label>' +
    '<label class="switch" for="stGoogle"><span>Bouton « Voir les avis Google » sur les lieux</span><input id="stGoogle" type="checkbox"' + (S.settings.googleLinks ? ' checked' : '') + '></label>' +
    '<label class="switch" for="stLimit"><span>Afficher la limite de vitesse (indicative)</span><input id="stLimit" type="checkbox"' + (S.settings.showLimit ? ' checked' : '') + '></label>' +
    '<label class="switch" for="stAlert"><span>Alerte vocale si je dépasse la limite</span><input id="stAlert" type="checkbox"' + (S.settings.speedAlert ? ' checked' : '') + '></label>' +
    '<label class="field" for="stNight">Mode nuit de la carte<select id="stNight"><option value="auto"' + (S.settings.night === 'auto' ? ' selected' : '') + '>Automatique (19 h – 7 h)</option><option value="on"' + (S.settings.night === 'on' ? ' selected' : '') + '>Toujours</option><option value="off"' + (S.settings.night === 'off' ? ' selected' : '') + '>Jamais</option></select></label>' +
    '<div class="banner">' + ic('info') + '<span>' + (S.online ? 'Mode en ligne : alertes, spots, conducteurs et messages partagés.' : 'Mode solo : tes alertes et spots restent sur ce téléphone.') + ' Version ' + VERSION + '. Carte © OpenStreetMap, OpenFreeMap. Itinéraires OSRM et Valhalla. Recherche Photon.</span></div>' +
    '<button class="btn ghost" id="pfReset">Réinitialiser mon profil sur ce téléphone</button>', 'profile');
  const save = f.bind(body);
  body.querySelector('#pfSave').onclick = () => { if (save()) { toast('Profil enregistré.'); closeSheet(); } };
  body.querySelector('#pfFeedback').onclick = () => openFeedback();
  body.querySelector('#pfVeh').onclick = () => openVehicle();
  body.querySelector('#pfCopy').onclick = async () => { try { await navigator.clipboard.writeText(S.me.code); toast('Code copié.'); } catch (e) { toast('Ton code : <b>' + esc(S.me.code) + '</b>'); } };
  body.querySelector('#frForm').onsubmit = async (e) => {
    e.preventDefault();
    const code = $('frCode').value.trim().toUpperCase();
    if (code.length !== 6) { toast('Le code fait 6 caractères.'); return; }
    if (code === S.me.code) { toast("C'est ton propre code."); return; }
    if (!S.online) { toast('Ajouter des amis demande le mode en ligne.'); return; }
    const d = await DB.findByCode(code);
    if (!d) { toast('Code introuvable. Ton ami doit avoir ouvert l\'app au moins une fois.'); return; }
    addFriend({ id: d.id, pseudo: d.pseudo }); openProfile();
  };
  body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { S.me.friends.splice(+b.dataset.rm, 1); saveMe(); pushPresence(true); openProfile(); }; });
  body.querySelector('#stVoice').onchange = (e) => { S.settings.voice = e.target.checked; saveSettings(); $('btnMute').classList.toggle('muted', !S.settings.voice); };
  body.querySelector('#stPlaces').onchange = (e) => { S.settings.showPlaces = e.target.checked; saveSettings(); applyPlaces(); };
  body.querySelector('#stGoogle').onchange = (e) => { S.settings.googleLinks = e.target.checked; saveSettings(); };
  body.querySelector('#stLimit').onchange = (e) => { S.settings.showLimit = e.target.checked; saveSettings(); updateSpeed(); };
  body.querySelector('#stAlert').onchange = (e) => { S.settings.speedAlert = e.target.checked; saveSettings(); };
  body.querySelector('#stNight').onchange = (e) => { S.settings.night = e.target.value; saveSettings(); applyNight(); };
  body.querySelector('#pfReset').onclick = () => {
    const b = body.querySelector('#pfReset');
    if (b.dataset.confirm) { try { localStorage.removeItem('routa.me'); } catch (e2) { /* */ } location.reload(); }
    else { b.dataset.confirm = '1'; b.textContent = 'Touche encore pour confirmer (ton code ami changera)'; }
  };
}
function onboarding() {
  S.me = { id: uuid(), code: makeCode(), pseudo: '', car: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], vis: 'tous', friends: [] };
  const f = profileForm(true);
  const body = openSheet('Bienvenue sur ROUTA', langSeg() +
    '<p>La carte des automobilistes : GPS, alertes sur la route, conducteurs autour de toi, spots, essence, recharge et parkings.</p>' + protoBanner() + f.html +
    '<button class="btn block" id="obGo">C\'est parti</button>' +
    '<p class="muted small">Ensuite, ton téléphone te demandera l\'accès à ta position : accepte pour la navigation. <a href="aide.html" style="color:var(--info)">Guide d\'installation</a></p>', 'onboarding');
  $('sheetClose').hidden = true;
  bindLangSeg(body);
  const save = f.bind(body);
  body.querySelector('#obGo').onclick = () => {
    if (!save()) return;
    store.set('routa.protoSeen', true);
    $('sheetClose').hidden = false;
    closeSheet();
    boot();
  };
}

/* ======================= Boutons ======================= */
function openK(k) {
    if (k === 'drivers') openDrivers();
    else if (k === 'spots') openSpots();
    else if (k === 'messages') openMessages();
    else if (k === 'feedback') openFeedback();
    else if (k === 'vehicle') openVehicle(S.preview ? (() => { const d = S.preview.dest; return () => chooseDestination(d); })() : null);
    else if (k === 'restrictions') openRestrictions();
    else if (k === 'country') openCountry(S.country, 'sos');
    else if (k === 'favs') openFavs();
    else if (SLOTS[k]) goSlot(k);
    else if (k === 'mapview') openMapView();
    else if (k === 'profile') openProfile();
    else if (k === 'share') shareApp();
    else if (k === 'help') location.href = 'aide.html';
    else if (window.ROUTA_X && ROUTA_X.open && ROUTA_X.open(k)) { /* nouveautés */ }
    else openPoiList(k);
}
document.querySelectorAll('.chip[data-open]').forEach((b) => { b.onclick = () => { const k = b.dataset.open; if (!SLOTS[k]) exitSearch(); openK(k); }; });
$('fabSearch').onclick = enterSearch;
$('fabMenu').onclick = openMenu;
$('qback').onclick = exitSearch;
function langSeg() {
  return '<div class="seg langseg" id="langSeg" data-notr>' + Object.entries(I18N.langs).map(([k, v]) => '<button data-l="' + k + '" class="' + (k === I18N.lang ? 'on' : '') + '">' + v + '</button>').join('') + '</div>';
}
function bindLangSeg(root) {
  root.querySelectorAll('#langSeg button').forEach((b) => { b.onclick = () => { if (b.dataset.l !== I18N.lang) I18N.setLang(b.dataset.l); }; });
}
function openMenu() {
  const n = +($('msgBadge').hidden ? 0 : $('msgBadge').textContent) || 0;
  const X = window.ROUTA_X || {}; const XI = X.icons || {};
  const fr = X.pendingCount ? X.pendingCount() : 0;
  const v = veh();
  const groups = [
    ['Communauté', [
      ['messages', ic('msg'), 'Bumps' + (n ? ' <span class="badge">' + n + '</span>' : '')],
      X.open && ['friends', XI.users || ic('msg'), 'Amis et conducteurs' + (fr ? ' <span class="badge">' + fr + '</span>' : '')],
      X.open && ['convoy', XI.convoy || ic('car'), X.convoy ? 'Convoi · ' + esc(X.convoy.name) : 'Convoi'],
      X.open && ['events', XI.event || ic('spot'), 'Rassemblements']
    ]],
    ['Carte et routes', [
      ['favs', ic('star'), 'Favoris'],
      ['spots', ic('spot'), 'Spots, routes et cols'],
      v.ev && X.open && ['chargers', XI.plug || ic('charge'), 'Bornes libres'],
      ['mapview', '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>', 'Affichage carte']
    ]],
    ['Ma voiture', [
      ['vehicle', ic(v.icon), 'Véhicule · ' + v.label],
      X.open && ['carnet', XI.book || ic('info'), 'Carnet d\'entretien'],
      X.open && ['parked', XI.park || ic('parking'), 'Stationnement']
    ]]
  ];
  const tile = (t) => '<button class="tile" data-k="' + t[0] + '">' + t[1] + '<span>' + t[2] + '</span></button>';
  const body = openSheet('Menu',
    '<button class="card tap menuprof" data-k="profile"><span class="avatarmini" style="background:' + esc(S.me.color || '#FF8A3D') + '">' + esc(initials(S.me.pseudo || '?')) + '</span><span class="grow"><b>' + esc(S.me.pseudo || 'Mon profil') + '</b><span class="sub">' + esc(visLabel(S.me.vis)) + (S.me.points ? ' · ' + S.me.points + ' pts' : '') + '</span></span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>' +
    '<button class="card tap menusos" data-k="country"><span class="sosdot big">SOS</span><span class="grow"><b>Urgences et infos pays</b><span class="sub">' + ($('ctryLabel').textContent === 'Infos pays' ? 'Numéros d\'urgence, règles, vignettes' : esc($('ctryLabel').textContent)) + '</span></span></button>' +
    groups.map(([g, ts]) => { const list = ts.filter(Boolean); return '<h3 class="menuh">' + g + '</h3><div class="tiles' + (list.length % 3 === 1 ? ' two' : '') + '">' + list.map(tile).join('') + '</div>'; }).join('') +
    '<div class="menulinks">' + (X.canInstall && X.canInstall() ? '<button data-k="install">Installer l\'app</button>' : '') + '<button data-k="share">Partager ROUTA</button><button data-k="feedback">Mon avis</button><button data-k="help">Aide</button></div>' +
    langSeg(), 'menu');
  body.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => openK(b.dataset.k); });
  bindLangSeg(body);
}
$('btnProfile').onclick = openMenu;
$('btnLocate').onclick = () => {
  if (!S.pos) { startGps(); toast('Recherche de ta position…'); return; }
  S.follow = true; $('btnLocate').classList.add('active');
  S.camAt = 0; followCam();
};
$('btnPlaces').onclick = () => {
  S.settings.showPlaces = !S.settings.showPlaces; saveSettings(); applyPlaces();
  toast(S.settings.showPlaces ? 'Établissements affichés. Zoome pour en voir plus et touche-les pour les détails.' : 'Établissements masqués.');
  if (S.settings.showPlaces && map.getZoom() < 15) map.easeTo({ zoom: 15.5, duration: 600 });
};
$('btnNorth').onclick = () => {
  if (S.nav) {
    S.settings.navNorth = !S.settings.navNorth; saveSettings();
    S.follow = true; $('btnLocate').classList.add('active'); followCam(); updateCompass();
    toast(S.settings.navNorth ? 'Navigation : nord en haut.' : 'Navigation : carte dans le sens de la route.');
  } else if (Math.abs(map.getBearing()) > 2) map.easeTo({ bearing: 0, duration: 500 });
  else toast('Pour tourner la carte : deux doigts en rotation (sur ordinateur : clic droit et glisser).', { ms: 6000 });
};
$('btnLayers').onclick = openMapView;
$('btnNight').onclick = () => {
  const isNight = document.body.classList.contains('night');
  S.settings.night = isNight ? 'off' : 'on'; saveSettings(); applyNight();
  toast(isNight ? 'Carte en mode jour.' : 'Carte en mode nuit.');
};
function userClose() { if (S.sheetView === 'onboarding') return; if (S.sheetView === 'preview') cancelPreview(); if (S.sheetView && S.sheetView.startsWith('poi')) clearPois(); closeSheet(); }
$('sheetClose').onclick = userClose;
$('sheetBackdrop').onclick = userClose;

/* ======================= Démarrage ======================= */
async function boot() {
  setAvatar();
  $('btnMute').classList.toggle('muted', !S.settings.voice);
  updateVisChip();
  updateVehChip();
  updateCountryChip();
  updateCompass();
  startGps();
  await DB.init();
  try { await DB.loadAll(); } catch (e) { console.warn(e); }
  const draw = () => { renderAlerts(); renderSpots(); renderDrivers(); updateBadge(); };
  draw();
  DB.subscribe();
  pushPresence(true);
  if (!store.get('routa.protoSeen', false)) {
    store.set('routa.protoSeen', true);
    setTimeout(() => toast('ROUTA est un prototype : ton avis compte !', { action: 'Mon avis', onAction: () => openFeedback(), ms: 9000 }), 2500);
  }
  if (!S.online) toast('Mode solo actif. Le guide explique comment passer en ligne pour partager avec tes potes.', { ms: 6000 });
}

applyNight();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne non disponible */ });
}
if (!store.get('routa.mig096', false)) { S.settings.voice = false; S.settings.relief3d = false; saveSettings(); store.set('routa.mig096', true); }
if (!store.get('routa.mig0913', false)) { S.settings.traffic = true; S.settings.showPlaces = true; S.settings.showTransit = false; saveSettings(); store.set('routa.mig0913', true); }
S.settings.mapType = 'plan';
S.settings.relief3d = false;
window.ROUTA = { updateSpeed, bump, enterSearch, exitSearch, S, DB, map, CFG, I18N, esc, ic, el, toast, openSheet, closeSheet, userClose, say, vibrate, uuid, dist, fmtDist, fmtDur, fmtClock, ago, store, saveMe, pushPresence, addFriend, openThread, chooseDestination, initials, veh, nameOf, openDriver, startNav, openSpot, openK };
if (!S.me || !S.me.pseudo) onboarding(); else boot();

})();
