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
/* Loi suisse (art. 98a LCR) : aucun avertissement public des contrôles de police ou radars dans les textes partagés */
const BANNED_CTRL = /(radar|blitz|flash[ée]?|contr[ôo]le|kontroll|controll|polic|polizei|polizia|pol[ií]cia|flics?\b|keufs?\b|cond[ée]s?\b|gendarm|bullen|schmier|laser|r[ée]p[ée]titeur)/i;
const ctrlBlocked = (...t) => t.some((x) => x && BANNED_CTRL.test(x));
const ctrlSafe = (x) => (x && !BANNED_CTRL.test(x) ? x : '');
/* Pseudos et textes publics : pas d'insultes (9 langues), pas d'adresse e-mail ni de numéro de téléphone */
const RUDE_LONG = ['connard', 'connasse', 'salope', 'encule', 'batard', 'niquer', 'nique', 'pede', 'tapette', 'negre', 'bougnoul', 'youpin', 'couille', 'putain', 'fuck', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'asshole', 'motherf', 'arschloch', 'hurensohn', 'fotze', 'schwuchtel', 'wichser', 'hitler', 'cazzo', 'stronzo', 'puttana', 'vaffanculo', 'frocio', 'troia', 'coglion', 'caralho', 'viado', 'cuzao', 'mierda', 'cabron', 'maricon', 'gilipolla', 'pendejo', 'orospu', 'siktir', 'yarrak', 'yarak', 'ibne', 'qifsha', 'pidhi', 'jebem', 'jebote', 'kurac', 'picka', 'govno', 'pizda'];
const RUDE_SHORT = ['pd', 'fdp', 'ntm', 'amk', 'aq', 'pute', 'puta', 'shit', 'slut', 'dick', 'nazi', 'kurva', 'kurv', 'peder', 'merde', 'bite', 'chatte', 'coño', 'cono', 'foda'];
function rudeText(x) {
  if (!x) return false;
  const raw = String(x);
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(raw) || /(\+|00)?\d[\d\s./-]{7,}\d/.test(raw)) return true;
  const n = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4|@/g, 'a').replace(/5|\$/g, 's').replace(/7/g, 't');
  const flat = n.replace(/[^a-z]/g, '');
  if (RUDE_LONG.some((w) => flat.includes(w))) return true;
  const toks = n.split(/[^a-z]+/).filter(Boolean);
  return toks.some((t) => RUDE_SHORT.includes(t));
}

/* ======================= Icônes ======================= */
const P = {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
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
  hospital: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7.5v9M7.5 12h9"/>',
  pharmacy: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
  wc: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><text x="12" y="15.6" font-size="9" font-weight="800" font-family="Arial,Helvetica,sans-serif" text-anchor="middle" fill="currentColor" stroke="none">WC</text>',
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
  motoi: '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M5.5 16.5l4-6h5l4 6M9.5 10.5L8 7H5.5M14.5 10.5l1.5-3.5h2.5"/><path d="M10 14h4"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8l-1-2H7M12 16l3-8"/>',
  ebike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M12 16l3-8"/><path d="M11 3l-2 3h3l-2 3"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="M11 21l2-6-3-3 1-5 4 3 3 1M10 12l-2 4"/>',
  transit: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4"/><circle cx="9" cy="14" r=".8"/><circle cx="15" cy="14" r=".8"/>',
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

const ALERT_TYPES = window.ROUTA_ALERT_TYPES = {
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
/* #032 Fiabilité des signalements : durée de vie selon le type, prolongée par les confirmations, raccourcie par les « plus là » */
/* Règle : tout signalement disparaît tout seul au bout d'1 h maximum (les confirmations ne prolongent plus) */
const ALERT_TTL_H = { contresens: 0.5 };
const ALERT_MAX = 3600000;
const alertTtl = (type) => (ALERT_TTL_H[type] || 1) * 3600000;
function alertReliability(a) {
  const c = a.confirms || 1, d = a.denies || 0, ageH = (Date.now() - Date.parse(a.created_at || 0)) / 3600000;
  if (c >= 3 && d === 0) return ['ok', 'Fiabilité élevée'];
  if (d >= c || (ageH > 6 && c < 2)) return ['', 'Fiabilité faible'];
  return ['warn', 'Fiabilité moyenne'];
}
const votedAlerts = new Set(store.get('routa.voted', []));
const SPOT_CATS = { route: 'Belle route', vue: 'Point de vue', rdv: 'Rassemblement', nuit: 'Parking de nuit', autre: 'Autre' };
const COLORS = ['#FF8A3D', '#4DA3FF', '#3DDC97', '#C9A2FF', '#FF6B9A', '#FFD34D', '#7FE0C2', '#F2F4F7'];
const QUICK_MSGS = ['On se retrouve au spot ?', "J'arrive dans 10 min", 'Tu es où ?', 'Belle caisse !', 'Bien reçu', 'Attention devant'];

/* ======================= Véhicule ======================= */
const VEHICLES = {
  voiture: { label: 'Voiture', icon: 'car' },
  electrique: { label: 'Électrique', icon: 'ev', ev: true },
  hybride: { label: 'Hybride', icon: 'ev', ev: true },
  moto: { label: 'Moto ou scooter', icon: 'motoi', two: true, tt: 'motorcycle' },
  cyclo: { label: 'Scooter ou cyclomoteur 45 km/h', icon: 'motoi', two: true, cyclo: true },
  camping: { label: 'Camping-car', icon: 'camper', heavy: true, costing: 'truck', dims: { height: 3.2, width: 2.3, length: 7.5, weight: 3.5 } },
  remorque: { label: 'Voiture + caravane ou remorque', icon: 'camper', heavy: true, costing: 'auto', dims: { height: 2.6, width: 2.5, length: 12, weight: 3.5 } },
  minibus: { label: 'Minibus', icon: 'minibus', heavy: true, costing: 'bus', dims: { height: 2.9, width: 2.1, length: 7, weight: 5 } },
  bus: { label: 'Car / bus', icon: 'bus', heavy: true, costing: 'bus', dims: { height: 3.8, width: 2.55, length: 13.5, weight: 19 } },
  camion: { label: 'Poids lourd', icon: 'truck', heavy: true, costing: 'truck', hgv: true, dims: { height: 4, width: 2.55, length: 16.5, weight: 40 } }
};
/* Marques par type de véhicule (constructeurs réels) : la liste ne montre que celles du type choisi ; modèle libre */
const TYPE_BRANDS = {
  moto: ['Aprilia', 'BMW', 'Ducati', 'Harley-Davidson', 'Honda', 'Husqvarna', 'Kawasaki', 'KTM', 'Kymco', 'Moto Guzzi', 'Peugeot', 'Piaggio', 'Royal Enfield', 'Suzuki', 'SYM', 'Triumph', 'Vespa', 'Yamaha'],
  cyclo: ['Aprilia', 'Honda', 'Kymco', 'MBK', 'NIU', 'Peugeot', 'Piaggio', 'Silence', 'SYM', 'Vespa', 'Yamaha'],
  camping: ['Adria', 'Bürstner', 'Carthago', 'Challenger', 'Chausson', 'Dethleffs', 'Frankia', 'Hobby', 'Hymer', 'Knaus', 'Laika', 'LMC', 'Malibu', 'Morelo', 'Pilote', 'Pössl', 'Rapido', 'Sunlight', 'Weinsberg', 'Westfalia'],
  remorque: ['Adria', 'Bürstner', 'Caravelair', 'Dethleffs', 'Eriba', 'Fendt', 'Hobby', 'Knaus', 'LMC', 'Sterckeman', 'Tabbert', 'Weinsberg'],
  minibus: ['Citroën', 'Fiat', 'Ford', 'Iveco', 'Mercedes-Benz', 'Opel', 'Peugeot', 'Renault', 'Toyota', 'Volkswagen'],
  bus: ['Irizar', 'Iveco Bus', 'MAN', 'Mercedes-Benz', 'Neoplan', 'Otokar', 'Scania', 'Setra', 'Solaris', 'Temsa', 'Van Hool', 'VDL', 'Volvo'],
  camion: ['DAF', 'Fuso', 'Hino', 'Isuzu', 'Iveco', 'MAN', 'Mercedes-Benz', 'Renault Trucks', 'Scania', 'Tatra', 'Volvo']
};
const DIM_LABELS = [['height', 'Hauteur', 'm'], ['width', 'Largeur', 'm'], ['length', 'Longueur', 'm'], ['weight', 'Poids total', 't']];

/* ======================= État ======================= */
const S = {
  me: store.get('routa.me', null),
  settings: Object.assign({ voice: false, readMsgs: true, night: 'auto', traffic: true, mapType: 'plan', relief3d: false, navNorth: false, showPlaces: true, googleLinks: true, showLimit: true, speedAlert: true, showTransit: false, showStreets: true }, store.get('routa.settings', {})),
  vehicle: Object.assign({ type: 'voiture', dims: {}, hazmat: false }, (store.get('routa.vehicles', []) || []).find((x) => x.id === store.get('routa.vehicleId', '')) || store.get('routa.vehicle', {})),
  recents: store.get('routa.recents', []),
  lastRead: store.get('routa.lastRead', 0),
  pos: null, prevPos: null, heading: 0, speed: null, acc: null,
  follow: true, watchId: null,
  drivers: new Map(), alerts: new Map(), spots: new Map(), closed: new Map(), messages: [],
  markers: { me: null, drivers: new Map(), alerts: new Map(), spots: new Map(), pois: [], dest: null },
  nav: null, preview: null,
  prompted: new Set(), alertNearId: null,
  poiCache: {}, wakeLock: null, sheetView: null, online: false
};
const saveMe = () => store.set('routa.me', S.me);
// Réglages fixés (options retirées) : limite seulement en cas de dépassement, compteur toujours affiché,
// pas de panneau d'avance, pas de feux, pas de conseils, pas de Moments, pas de lecture des messages à voix haute
Object.assign(S.settings, { showLimit: false, overSign: true, limitAhead: false, showSpeedo: true, showSignals: false, tips: false, moments: false, readMsgs: false });
const saveSettings = () => store.set('routa.settings', S.settings);
// taille unique (normale) : plus de réglage, pour que tout reste aligné sur tous les écrans
const applyUi = () => { try { document.documentElement.style.setProperty('--ui', '1'); } catch (e) { /* */ } };
applyUi();
/* #036 : interface de conduite simplifiée (moins de boutons pendant la navigation, l'essentiel reste) */
const applyLite = () => document.body.classList.remove('navlite');
applyLite();
function veh() {
  const v = VEHICLES[S.vehicle.type] || VEHICLES.voiture;
  const dims = Object.assign({}, v.dims || {}, v.heavy ? (S.vehicle.dims || {}) : {});
  const isHgv = !!v.hgv || (S.vehicle.type === 'camping' && (dims.weight || 0) > 3.5);
  return Object.assign({}, v, { type: S.vehicle.type, dims, hazmat: !!S.vehicle.hazmat && S.vehicle.type === 'camion', isHgv });
}
/* Vitesse maximale propre au véhicule (Suisse) : poids lourds 80 km/h, cars, minibus et camping-cars de plus de 3,5 t 100 km/h */
function vehLimits(cc) {
  const v = veh(), T = window.ROUTA_VLIM || {}, c = T[cc || S.country || 'CH'];
  if (!c || !v.heavy) return null;
  const k = v.type === 'minibus' ? 'bus' : v.type, f = c[k];
  const r = f ? f(v.dims.weight || 0) : null;
  return r ? { lim: r, src: c.src, pro: c.pro } : null;
}
/* Plafond = vitesse la plus haute permise à ce véhicule dans le pays (jamais plus bas que la loi). Pays non vérifié : pas de plafond. */
function vehCap() {
  if (veh().cyclo) return 45; // #005 : un cyclomoteur ou scooter 45 km/h ne peut pas aller plus vite
  const L = vehLimits(); if (!L) return null;
  const n = L.lim.join(' ').match(/\d+/g); return n ? Math.max(...n.map(Number)) : null;
}
window.ROUTA_VCAP = vehCap;
const capLimit = (l) => { const c = vehCap(); return l && c ? Math.min(l, c) : l; };
function vehSummary() {
  const v = veh();
  const nm = [S.vehicle.brand, S.vehicle.model].filter(Boolean).join(' ');
  if (!v.heavy) return nm || v.label;
  const d = v.dims;
  return (nm || v.label) + ' · ' + String(d.height).replace('.', ',') + ' m · ' + String(d.weight).replace('.', ',') + ' t' + (v.hazmat ? ' · ADR' : '');
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
  /* Secret propre à cet appareil : lui seul peut modifier ou effacer sa fiche conducteur */
  secret() {
    let s = store.get('routa.secret', null);
    if (!s) { const b = new Uint8Array(24); crypto.getRandomValues(b); s = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); store.set('routa.secret', s); }
    return s;
  },
  /* Messages reçus : seuls l'expéditeur et le destinataire peuvent les lire */
  async pollMsgs() {
    if (!this.sb || !S.me) return;
    const since = this.msgSince || new Date(Date.now() - 10 * 60000).toISOString();
    const { data, error } = await this.sb.rpc('messages_mine', { me: S.me.id, s: this.secret(), since });
    if (error || !Array.isArray(data)) return;
    data.slice().reverse().forEach((m) => {
      if (!this.msgSince || m.created_at > this.msgSince) this.msgSince = m.created_at;
      if (m.to_id === S.me.id) onIncoming(m);
    });
  },
  /* Conducteurs autour : le serveur ne donne la position exacte qu'aux amis et au convoi */
  async liveDrivers() {
    if (!this.sb || !S.me) return;
    const { data, error } = await this.sb.rpc('drivers_live', { me: S.me.id, s: this.secret() });
    if (error || !Array.isArray(data)) return;
    S.drivers.clear(); data.forEach((r) => S.drivers.set(r.id, r));
  },
  local(k) { return store.get('routa.local.' + k, []); },
  saveLocal(k, v) { store.set('routa.local.' + k, v); },

  async loadAll() {
    if (!this.sb) {
      this.local('alerts').filter((a) => Date.parse(a.expires_at) > Date.now()).forEach(putAlert);
      this.local('spots').forEach((s) => S.spots.set(s.id, s));
      return;
    }
    const since = new Date(Date.now() - 10 * 60000).toISOString();
    const [d, a, s, m] = await Promise.all([
      this.sb.rpc('drivers_live', { me: S.me.id, s: this.secret() }),
      this.sb.from('alerts').select('*').gt('expires_at', new Date().toISOString()).limit(1000),
      this.sb.from('spots').select('*').limit(1000),
      this.sb.rpc('messages_mine', { me: S.me.id, s: this.secret() })
    ]);
    (d.data || []).forEach((r) => S.drivers.set(r.id, r));
    (a.data || []).forEach(putAlert);
    (s.data || []).forEach((r) => S.spots.set(r.id, r));
    S.messages = (Array.isArray(m.data) ? m.data : []).reverse();
    S.messages.forEach((x) => { if (!this.msgSince || x.created_at > this.msgSince) this.msgSince = x.created_at; });
  },

  subscribe() {
    if (!this.sb) return;
    setInterval(async () => { if (document.hidden) return; await this.liveDrivers(); renderDrivers(); await this.pollMsgs(); }, 5000);
    this.sb.channel('routa-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (p) => {
        if (p.eventType === 'DELETE') { S.alerts.delete(p.old.id); S.closed.delete(p.old.id); } else putAlert(p.new);
        renderAlerts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, (p) => {
        if (p.eventType === 'DELETE') S.spots.delete(p.old.id); else S.spots.set(p.new.id, p.new);
        renderSpots();
      })
      .subscribe();
  },

  async presence(row) {
    if (!this.sb) return;
    const { error } = await this.sb.rpc('driver_upsert', { p: row, s: this.secret() });
    if (error) console.warn(error);
  },
  /* #067 lieux fermés temporairement : même table, type « lieu_ferme », jamais affichés comme alertes de route */
  async addClosed(a) {
    if (!this.sb) { const all = this.local('alerts'); all.push(a); this.saveLocal('alerts', all); S.closed.set(a.id, a); return true; }
    const { error } = await this.sb.from('alerts').insert(a);
    if (error) return false;
    S.closed.set(a.id, a); return true;
  },
  async updateClosed(id, patch) {
    const a = Object.assign({}, S.closed.get(id), patch);
    S.closed.set(id, a);
    if (!this.sb) { this.saveLocal('alerts', this.local('alerts').map((x) => x.id === id ? a : x)); return; }
    await this.sb.from('alerts').update(patch).eq('id', id);
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
    const { data, error } = await this.sb.rpc('message_send', { m, s: this.secret() });
    if (error || data === false) { toast("Message non envoyé. Vérifie ta connexion."); return false; }
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
    const { data } = await this.sb.rpc('driver_by_code', { c: code });
    return Array.isArray(data) && data[0];
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
    // dans l'app : la musique est baissée le temps de l'annonce, puis revient (jamais coupée)
    u.onstart = () => nativeDuck(true);
    u.onend = u.onerror = () => setTimeout(() => { if (!speechSynthesis.speaking && !speechSynthesis.pending) nativeDuck(false); }, 250);
    speechSynthesis.speak(u);
  } catch (e) { /* voix indisponible */ }
}
const RMP = () => { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.RoutaMap; };
let duckOn = false;
function nativeDuck(on) {
  const R = RMP(); if (!R || duckOn === on) return;
  duckOn = on;
  try { R.duck({ on }).catch(() => { /* ancienne version de l'app */ }); } catch (e) { /* */ }
}
let voiceUnlocked = false;
document.addEventListener('click', () => {
  if (S.settings.voice) unlockVoice();
}, { capture: true });
function unlockVoice() {
  if (voiceUnlocked || !('speechSynthesis' in window)) return;
  voiceUnlocked = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { /* */ }
}
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
  const box = $('toasts'); while (box.children.length) box.firstChild.remove(); // un seul message à la fois, jamais d'empilement
  box.appendChild(el);
  setTimeout(() => el.remove(), (opts && opts.ms) || 4500);
}

/* ======================= Carte ======================= */
const map = new maplibregl.Map({
  container: 'map',
  style: CFG.mapStyle,
  center: CFG.defaultCenter || [6.6323, 46.5197],
  zoom: CFG.defaultZoom || 11,
  attributionControl: false, // crédits : dans le menu (Crédits de la carte), rien sur la carte
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  fadeDuration: 0,
  renderWorldCopies: false,
  refreshExpiredTiles: false,
  maxTileCacheSize: 120,
  // carte toujours à plat (2D) : pas d'inclinaison au doigt
  pitchWithRotate: false,
  touchPitch: false,
  dragRotate: true,
  maxPitch: 0
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
// Morceaux de carte qui n'ont pas pu charger (réseau faible, tunnel) : on les redemande automatiquement, sans rien faire de la part de l'utilisateur
let mapRetryT = 0;
const mapRetry = () => {
  if (mapRetryT) return; // au plus une relance toutes les 5 s
  mapRetryT = setTimeout(() => {
    mapRetryT = 0;
    try {
      const caches = (map.style && map.style.sourceCaches) || {};
      let n = 0;
      Object.keys(caches).forEach((id) => {
        const sc = caches[id]; if (!sc || !sc._tiles || typeof sc._removeTile !== 'function') return;
        Object.keys(sc._tiles).forEach((k) => { if (sc._tiles[k] && sc._tiles[k].state === 'errored') { sc._removeTile(k); n++; } });
      });
      if (n) { if (typeof map._update === 'function') map._update(true); else map.triggerRepaint(); }
    } catch (e) { /* */ }
  }, 5000);
};
map.on('error', (e) => { if (e && (e.tile || e.sourceId)) mapRetry(); });
window.addEventListener('online', mapRetry);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') mapRetry(); });

const stopFollow = () => { if (S.follow) { S.follow = false; $('btnLocate').classList.remove('active'); updateCompass(); if (S.pos) renderMe(); } };
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
map.on('rotate', () => meOnRotate());
map.on('rotatestart', (e) => { if (e.originalEvent) stopFollow(); });

/* Plan, satellite et relief 3D */
const SAT_HIDE = /^(building|building-3d|road_area_pattern|(road|tunnel|bridge)_(path_pedestrian|service_track|major_rail|transit_rail)\w*)$/;
function setupMapLayers() {
  const style = map.getStyle(); if (!style) return;
  const before = (style.layers.find((l) => /^tunnel_|^road_/.test(l.id)) || {}).id;
  map.addSource('sat-world', { type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 15, attribution: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> – EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)' });
  map.addLayer({ id: 'sat-world', type: 'raster', source: 'sat-world', layout: { visibility: 'none' } }, before);
  map.addSource('sat-fr', { type: 'raster', tiles: ['https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true'], tileSize: 256, minzoom: 10, maxzoom: 19, bounds: [-5.3, 41.3, 9.7, 51.2], attribution: '© <a href="https://www.ign.fr" target="_blank" rel="noopener">IGN</a>' });
  map.addLayer({ id: 'sat-fr', type: 'raster', source: 'sat-fr', minzoom: 10, layout: { visibility: 'none' } }, before);
  map.addSource('sat-ch', { type: 'raster', tiles: ['https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg'], tileSize: 256, minzoom: 8, maxzoom: 20, bounds: [5.95, 45.81, 10.5, 47.81], attribution: '© <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>' });
  map.addLayer({ id: 'sat-ch', type: 'raster', source: 'sat-ch', minzoom: 8, layout: { visibility: 'none' } }, before);
  if (CFG.tomtomKey) {
    const tt = (kind, style) => ['https://api.tomtom.com/traffic/map/4/tile/' + kind + '/' + style + '/{z}/{x}/{y}.png?tileSize=512&key=' + encodeURIComponent(CFG.tomtomKey)];
    const top = map.getLayer('boundary_3') ? 'boundary_3' : undefined;
    map.addSource('traffic', { type: 'raster', tiles: tt('flow', 'relative0'), tileSize: 512, maxzoom: 17, attribution: 'Trafic : TomTom' });
    map.addLayer({ id: 'traffic', type: 'raster', source: 'traffic', minzoom: 9, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85 } }, top);
    map.addSource('incidents', { type: 'raster', tiles: tt('incidents', 's3'), tileSize: 512, maxzoom: 17 });
    map.addLayer({ id: 'incidents', type: 'raster', source: 'incidents', minzoom: 12, layout: { visibility: 'none' } }, top);
    map.addSource('jam', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'jam-case', type: 'line', source: 'jam', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7A1F22', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 7, 16, 16, 19, 26] } });
    map.addLayer({ id: 'jam-line', type: 'line', source: 'jam', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#E5484D', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 10, 19, 17] } });
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
  ['sat-world', 'sat-fr', 'sat-ch'].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', sat ? 'visible' : 'none'); });
  map.getStyle().layers.forEach((l) => { if (SAT_HIDE.test(l.id)) map.setLayoutProperty(l.id, 'visibility', sat ? 'none' : 'visible'); });
  if (map.getLayer('building-3d')) map.setLayoutProperty('building-3d', 'visibility', 'none');
  document.body.classList.toggle('sat', sat);
  ['traffic', 'incidents'].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', S.settings.traffic ? 'visible' : 'none'); });
  applyStreets();
  try { map.setTerrain(S.settings.relief3d ? { source: 'dem', exaggeration: 1.3 } : null); } catch (e) { console.warn('relief', e); }
  if (animate && !S.nav) map.easeTo({ pitch: S.settings.relief3d ? 60 : 0, duration: 800 });
  if (S.nav) followCam();
  $('btnLayers').classList.toggle('active', sat || S.settings.relief3d);
  updateCompass();
}
const STREET_LAYERS = ['highway-name-minor', 'highway-name-path'];
function applyStreets() { STREET_LAYERS.forEach((id) => { try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', S.settings.showStreets === false ? 'none' : 'visible'); } catch (e) { /* */ } }); }
function openMapView() {
  const seg = (id, opts, cur) => '<div class="seg" id="' + id + '">' + opts.map(([k, v]) => '<button data-v="' + k + '" class="' + (k === cur ? 'on' : '') + '">' + v + '</button>').join('') + '</div>';
  const body = openSheet('Affichage de la carte',
    '<h3>Type de carte</h3>' + seg('mvType', [['plan', 'Plan'], ['sat', 'Satellite']], S.settings.mapType) +
    '<label class="switch" for="mvTraffic"><span><b>Trafic en direct</b><br><span class="muted small">Vert fluide, orange ralenti, rouge bouchon. Accidents et travaux en zoomant.</span></span><input id="mvTraffic" type="checkbox"' + (S.settings.traffic && CFG.tomtomKey ? ' checked' : '') + (CFG.tomtomKey ? '' : ' disabled') + '></label>' +
    (CFG.tomtomKey ? '' : '<p class="muted small">Trafic en direct bientôt disponible.</p>') +
    '<label class="switch" for="mvTransit"><span><b>Transports publics</b><br><span class="muted small">Arrêts de bus, tram, métro et gares. Touche un arrêt pour voir les lignes et les prochains départs.</span></span><input id="mvTransit" type="checkbox"' + (S.settings.showTransit ? ' checked' : '') + '></label>' +
    '<label class="switch" for="mvPlaces"><span>Afficher les établissements (restos, magasins…) en zoomant</span><input id="mvPlaces" type="checkbox"' + (S.settings.showPlaces ? ' checked' : '') + '></label>' +
    '<label class="switch" for="mvStreets"><span><b>Noms des rues</b><br><span class="muted small">Les grands axes et les villes restent toujours affichés.</span></span><input id="mvStreets" type="checkbox"' + (S.settings.showStreets === false ? '' : ' checked') + '></label>' +
    '<h3>Couleurs</h3>' + seg('mvNight', [['auto', I18N.t('Automatique')], ['off', 'Jour'], ['on', 'Nuit']], S.settings.night) +
    '<h3>Pendant la navigation</h3>' + seg('mvNav', [['route', 'Dans le sens de la route'], ['north', 'Nord en haut']], S.settings.navNorth ? 'north' : 'route') +
    '<div class="banner">' + ic('info') + '<span><b>Tourner la carte :</b> pose deux doigts et tourne-les (sur ordinateur : clic droit et glisser). <b>Incliner :</b> glisse deux doigts vers le haut ou le bas. La boussole montre le nord : touche-la pour remettre le nord en haut.</span></div>' +
    '<p class="muted small">Images satellite : swisstopo (Suisse), IGN (France), Sentinel-2 cloudless – EOX (monde).</p>', 'mapview');
  body.querySelectorAll('#mvType button').forEach((b) => { b.onclick = () => { S.settings.mapType = b.dataset.v; saveSettings(); body.querySelectorAll('#mvType button').forEach((x) => x.classList.toggle('on', x === b)); applyMapView(true); }; });
  body.querySelector('#mvTraffic').onchange = (e) => { S.settings.traffic = e.target.checked; saveSettings(); applyMapView(false); };
  body.querySelector('#mvStreets').onchange = (e) => { S.settings.showStreets = e.target.checked; saveSettings(); applyStreets(); };
  body.querySelector('#mvTransit').onchange = (e) => { S.settings.showTransit = e.target.checked; saveSettings(); applyTransit(); if (S.settings.showTransit && map.getZoom() < 15) map.easeTo({ zoom: 15.5, duration: 600 }); };
  body.querySelector('#mvPlaces').onchange = (e) => { S.settings.showPlaces = e.target.checked; saveSettings(); applyPlaces(); if (S.settings.showPlaces && map.getZoom() < 15) map.easeTo({ zoom: 15.5, duration: 600 }); };
  body.querySelectorAll('#mvNight button').forEach((b) => { b.onclick = () => { S.settings.night = b.dataset.v; saveSettings(); applyNight(); body.querySelectorAll('#mvNight button').forEach((x) => x.classList.toggle('on', x === b)); }; });
  body.querySelectorAll('#mvNav button').forEach((b) => { b.onclick = () => { S.settings.navNorth = b.dataset.v === 'north'; saveSettings(); body.querySelectorAll('#mvNav button').forEach((x) => x.classList.toggle('on', x === b)); if (S.nav) { S.follow = true; $('btnLocate').classList.add('active'); followCam(); } updateCompass(); }; });
}

function applyNight() {
  // « auto » suit le thème clair/sombre du téléphone ; sans préférence connue, on se base sur l'heure
  const h = new Date().getHours();
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const sys = mq && (mq.matches || matchMedia('(prefers-color-scheme: light)').matches) ? mq.matches : (h >= 19 || h < 7);
  const on = S.settings.night === 'on' || (S.settings.night === 'auto' && sys);
  document.body.classList.toggle('night', on);
  if (document.documentElement.classList.contains('web')) { document.documentElement.classList.toggle('night-bg', on); const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = on ? '#26282C' : '#F8F4F0'; }
  $('btnNight').classList.toggle('active', S.settings.night === 'on');
}
setInterval(applyNight, 60000);
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyNight); } catch (e) { /* */ }

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

/* Cap lissé : un relevé isolé qui part dans tous les sens est ignoré (vue de côté) */
function smoothHeading(old, nw) {
  if (old == null || isNaN(old)) { S.hdJump = 0; return nw; }
  const d = ((nw - old + 540) % 360) - 180;
  if (Math.abs(d) > 100) { S.hdJump = (S.hdJump || 0) + 1; if (S.hdJump < 2) return old; }
  S.hdJump = 0;
  return (old + d * 0.55 + 360) % 360;
}
/* En navigation : position et direction calées sur la route (comme Waze ou Google Maps) */
/* Anticipation : le GPS arrive avec ~1 s de retard et la caméra glisse pendant ~1 s.
   On place donc le curseur là où la voiture EST (et sera à la fin du glissement), le long de la route. */
function myView(ahead) {
  const N = S.nav;
  const spd = S.speed || 0;
  const age = S.fixAt ? Math.max(0, Math.min(2.5, (Date.now() - S.fixAt) / 1000)) + 0.35 : 0;
  const go = spd > 2 ? spd * Math.min(3.5, age + (ahead || 0)) : 0;
  if (N && N.snap && Date.now() - N.snap.t < 4000) {
    if (!go || N.along == null || !N.R) return { lat: N.snap.lat, lon: N.snap.lon, heading: N.snap.heading };
    const P0 = pointAt(N.R, N.along + go), P1 = pointAt(N.R, N.along + go + 40);
    const H0 = pointAt(N.R, N.along + Math.min(go, spd * 0.8)), H1 = pointAt(N.R, N.along + Math.min(go, spd * 0.8) + 30);
    return { lat: P0.lat, lon: P0.lon, heading: dist(H0, H1) > 5 ? bearing(H0, H1) : N.snap.heading };
  }
  const so = S.snapOff && Date.now() - S.snapOff.t < 12000 ? S.snapOff : null;
  const bl = S.pos.lat + (so ? so.dLat : 0), bo = S.pos.lon + (so ? so.dLon : 0);
  if (go && S.heading != null && S.moving) {
    const m = Math.min(go, 70), h = toRad(S.heading);
    return { lat: bl + (m * Math.cos(h)) / 111320, lon: bo + (m * Math.sin(h)) / (111320 * Math.cos(toRad(S.pos.lat))), heading: S.heading };
  }
  return { lat: bl, lon: bo, heading: S.heading };
}
/* Mon marqueur */
/* En suivi, le curseur reste fixe à l'écran (la carte glisse dessous) : il ne disparaît plus et reste calé sur la route.
   Hors suivi, c'est un marqueur posé sur la carte. */
/* Curseur GPS personnalisable (Réglages › Carte › Curseur GPS) : forme, couleur, taille, halo — étiquette Premium */
const CUR_COLORS = [
  ['#4DA3FF', 'Bleu'], ['#38BDF8', 'Ciel'], ['#22D3EE', 'Cyan'], ['#14B8A6', 'Turquoise'], ['#3DDC97', 'Vert'], ['#84CC16', 'Vert pomme'],
  ['#15803D', 'Vert foncé'], ['#F5C542', 'Jaune'], ['#FF8A3D', 'Orange'], ['#E5484D', 'Rouge'], ['#9F1239', 'Bordeaux'], ['#F472B6', 'Rose'],
  ['#A78BFA', 'Violet'], ['#4F46E5', 'Indigo'], ['#1E3A8A', 'Bleu marine'], ['#92400E', 'Marron'], ['#C8A165', 'Beige'], ['#FFFFFF', 'Blanc'],
  ['#C0C6CF', 'Argent'], ['#6B7280', 'Gris'], ['#111111', 'Noir']
];
const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
const hexA = (h, a) => 'rgba(' + [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',') + ',' + a + ')';
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const curColor = () => (isHex(S.settings.cursorColor) ? S.settings.cursorColor : '#4DA3FF');
/* Formes vues du dessus, pointe vers l'avant (en haut) : elles tournent avec la direction */
let CDK = 'rgba(0,0,0,.42)'; // détails (vitres, lignes) : foncés sur une couleur claire, clairs sur une couleur sombre
const MIR = (c, k, l, r, y) => '<path fill="' + c + '" stroke="' + k + '" stroke-width="1.1" d="M' + l + ' ' + y + 'l-1.6.5v1l1.6.2zM' + r + ' ' + y + 'l1.6.5v1l-1.6.2z"/>';
const TOP = {
  car: (c, k) => '<path fill="' + c + '" stroke="' + k + '" stroke-width="1.2" d="M5.4 8.3l-1.7.5v1.1l1.8.2zM18.6 8.3l1.7.5v1.1l-1.8.2z"/>' +
    '<path fill="' + c + '" stroke="' + k + '" stroke-width="1.5" d="M12 1.8c3.6 0 5.4 1.2 5.6 3.8l.3 6.4-.2 7.2c-.1 2-1.7 3.1-5.7 3.1s-5.6-1.1-5.7-3.1L6.1 12l.3-6.4C6.6 3 8.4 1.8 12 1.8z"/>' +
    '<path fill="' + CDK + '" d="M7.6 8.9c2.9-1.1 5.9-1.1 8.8 0l-.9 2.9c-2.3-.5-4.7-.5-7 0zM8.6 16.6c2.3.4 4.5.4 6.8 0l.6 2.3c-2.6.7-5.4.7-8 0zM7.1 12.4l.9-.3v4.3l-.9.3zM16.9 12.4l-.9-.3v4.3l.9.3z"/>' +
    '<path fill="rgba(255,255,255,.85)" d="M7.4 3.9c.6-.6 1.4-1 2.3-1.2v.8c-.8.2-1.5.5-2 .9zM16.6 3.9c-.6-.6-1.4-1-2.3-1.2v.8c.8.2 1.5.5 2 .9z"/>',
  sport: (c, k) => MIR(c, k, 6.6,17.4,8.4) + '<path fill="' + c + '" stroke="' + k + '" stroke-width="1.4" d="M12 2c2.6 0 4.6 1.6 5 4.5l.8 7.5-.3 6c-.1 1.4-1.2 2.5-2.6 2.5H9.1c-1.4 0-2.5-1.1-2.6-2.5l-.3-6L7 6.5C7.4 3.6 9.4 2 12 2z"/><path fill="' + CDK + '" d="M8.6 9.2c2.2-.9 4.6-.9 6.8 0l-.6 3H9.2z"/><path fill="' + CDK + '" d="M9.4 17h5.2l.4 1.6c-2 .5-4 .5-6 0z"/><path fill="none" stroke="' + k + '" stroke-width="1.3" d="M6.6 20.8h10.8"/>',
  suv: (c, k) => MIR(c, k, 5.6,18.4,7.4) + '<rect x="5.5" y="2" width="13" height="20" rx="2.6" fill="' + c + '" stroke="' + k + '" stroke-width="1.5"/><path fill="' + CDK + '" d="M7.6 6.6c2.9-1 5.9-1 8.8 0l-.7 3.2H8.3z"/><path fill="none" stroke="' + CDK + '" stroke-width="1.2" d="M8.6 11.5v6M15.4 11.5v6"/><path fill="' + CDK + '" d="M8 19h8v1.2H8z"/>',
  van: (c, k) => MIR(c, k, 6.1,17.9,6.6) + '<rect x="6" y="1.5" width="12" height="21" rx="2.4" fill="' + c + '" stroke="' + k + '" stroke-width="1.5"/><path fill="' + CDK + '" d="M7.7 4.8c2.9-.8 5.7-.8 8.6 0l-.6 2.6H8.3z"/><path fill="none" stroke="' + CDK + '" stroke-width="1" d="M8 10h8M8 14h8M8 18h8"/>',
  truck: (c, k) => '<rect x="7" y="1.5" width="10" height="5.6" rx="1.8" fill="' + c + '" stroke="' + k + '" stroke-width="1.4"/><path fill="' + CDK + '" d="M8.3 3.2h7.4l-.4 1.7H8.7z"/><rect x="6.3" y="8.1" width="11.4" height="14.4" rx="1" fill="' + c + '" stroke="' + k + '" stroke-width="1.4"/><path fill="none" stroke="' + CDK + '" stroke-width="1" d="M8.2 11h7.6M8.2 15h7.6M8.2 19h7.6"/>',
  bus: (c, k) => MIR(c, k, 6.6,17.4,4.4) + '<rect x="6.5" y="1.5" width="11" height="21" rx="2.2" fill="' + c + '" stroke="' + k + '" stroke-width="1.4"/><path fill="' + CDK + '" d="M7.9 3.6h8.2v2.2H7.9z"/><path fill="' + CDK + '" d="M9.3 9h5.4v2.6H9.3zM9.3 15h5.4v2.6H9.3z"/>',
  camper: (c, k) => MIR(c, k, 5.7,18.3,6.4) + '<rect x="5.6" y="1.5" width="12.8" height="21" rx="3" fill="' + c + '" stroke="' + k + '" stroke-width="1.5"/><path fill="' + CDK + '" d="M7.6 4.4c2.9-.9 5.9-.9 8.8 0l-.6 2.6H8.2z"/><rect x="9" y="11" width="6" height="4.4" rx="1" fill="' + CDK + '"/><path fill="none" stroke="' + CDK + '" stroke-width="1" d="M7.6 8.6h8.8"/>',
};
/* Formes « badge » : un rond de couleur avec un symbole */
const BADGE = {
  arrow: (k) => '<path fill="' + k + '" d="M12 2l7 18-7-4-7 4z"/>',
  chevron: (k) => '<path fill="none" stroke="' + k + '" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-8 7 8"/>',
  dot: () => '',
  walk: (k) => '<g fill="none" stroke="' + k + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="1.6" fill="' + k + '"/><path d="M11 21l2-6-3-3 1-5 4 3 3 1M10 12l-2 4"/></g>',
  star: (k) => '<path fill="' + k + '" d="M12 2.5l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8 6.2 20l1.4-6.4-4.9-4.4 6.5-.7z"/>',
  /* deux-roues vus de profil : le dessin reste droit à l'écran, la petite flèche du cercle indique la direction */
  moto: (k) => '<g fill="none" stroke="' + k + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="16" r="3.3"/><circle cx="18.5" cy="16" r="3.3"/><path d="M5.5 16l3.2-4.6h6.1l3.7 4.6"/><path d="M8.2 11.4h-2.6M14.8 11.4l1.6-3.4h2.4"/><path d="M9.5 9.2h4.4l1 2.2" /></g>',
  bike: (k) => '<g fill="none" stroke="' + k + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="16" r="3.4"/><circle cx="18.5" cy="16" r="3.4"/><path d="M5.5 16l3.9-7h6.2l2.9 7M9.4 9l3.1 7H5.5M15.6 9l-1-3h-2M8 6.5h3"/></g>'
};
const CUR_GROUPS = [
  ['Flèches et points', [['arrow', 'Flèche'], ['chevron', 'Chevron'], ['dot', 'Point'], ['star', 'Étoile']]],
  ['Voitures', [['car', 'Berline'], ['sport', 'Sportive'], ['suv', 'SUV / 4x4'], ['van', 'Utilitaire']]],
  ['Grands véhicules', [['truck', 'Camion'], ['bus', 'Bus / car'], ['camper', 'Camping-car']]],
  ['Deux-roues et à pied', [['moto', 'Moto'], ['bike', 'Vélo'], ['walk', 'Piéton']]]
];
const CUR_SIZES = [['0.85', 'Petit'], ['1', 'Normal'], ['1.2', 'Grand']];
function meHtml(shape, color, size, halo) {
  let st = shape || S.settings.cursor || 'arrow'; if (!TOP[st] && !BADGE[st]) st = 'arrow';
  const c = isHex(color) ? color : curColor();
  const sz = +(size || S.settings.cursorSize || 1) || 1;
  const hl = false; // halo retiré
  const ink = lum(c) > 0.72 ? '#111111' : '#FFFFFF';      // symbole lisible sur un curseur clair (blanc, argent, jaune)
  const edge = lum(c) > 0.72 ? '#1F2937' : '#FFFFFF';     // contour des véhicules : foncé si la couleur est claire
  CDK = lum(c) < 0.3 ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.42)';
  const wrap = ' style="background:' + (hl ? hexA(c, 0.22) : 'transparent') + '"';
  const sc = sz !== 1 ? ' style="transform:scale(' + sz + ')"' : '';
  if (TOP[st]) return '<div class="mk-me cur-top cur-' + st + '"' + wrap + '><i' + sc + '><svg aria-hidden="true" viewBox="0 0 24 24" style="width:100%;height:100%">' + TOP[st](c, edge) + '</svg></i></div>';
  const up = st === 'moto' || st === 'bike';
  return '<div class="mk-me cur-' + st + (up ? ' cur-up' : '') + '"' + wrap + '>' + (up ? '<b class="cur-ptr" style="border-bottom-color:' + c + '"></b>' : '') + '<i style="background:' + c + (lum(c) > 0.72 ? ';border-color:#1F2937' : '') + (sz !== 1 ? ';transform:scale(' + sz + ')' : '') + '">' + (st === 'dot' ? '' : '<svg aria-hidden="true" viewBox="0 0 24 24"' + (up ? ' class="upr"' : '') + '>' + BADGE[st](ink) + '</svg>') + '</i></div>';
}
/* Page de personnalisation complète du curseur */
function openCursor() {
  const cur = () => S.settings.cursor || 'arrow';
  const body = openSheet(I18N.t('Mon curseur GPS'),
    '<div class="curhead"><div class="curprev" id="curPrev"></div><div><p class="muted small">' + esc(I18N.t('Choisis la forme, la couleur et la taille de ton curseur sur la carte.')) + '</p></div></div>' +
    CUR_GROUPS.map(([g, list]) => '<h3>' + esc(I18N.t(g)) + '</h3><div class="curpick">' + list.map(([k, l]) => '<button data-v="' + k + '" aria-label="' + esc(I18N.t(l)) + '"><span class="cp"></span><span>' + esc(I18N.t(l)) + '</span></button>').join('') + '</div>').join('') +
    '<h3>' + esc(I18N.t('Couleur')) + '</h3><div class="curcols" id="curCols">' + CUR_COLORS.map(([c, l]) => { const n = I18N.t(l + ' (couleur)').replace(/ \(couleur\)$/, ''); return '<button data-c="' + c + '" style="background:' + c + '" aria-label="' + esc(n) + '" title="' + esc(n) + '"></button>'; }).join('') +
    '</div>' +
    '<h3>' + esc(I18N.t('Taille')) + '</h3><div class="seg" id="curSize">' + CUR_SIZES.map(([v, l]) => '<button data-v="' + v + '">' + esc(I18N.t(l)) + '</button>').join('') + '</div>' +
    '<button class="btn block" id="curDone">' + esc(I18N.t('Terminé')) + '</button>' +
    '<button class="btn ghost" id="curReset">' + esc(I18N.t('Revenir au curseur d\'origine')) + '</button>', 'cursor');
  body.querySelector('#curDone').onclick = () => openSettings();
  const draw = () => {
    body.querySelector('#curPrev').innerHTML = meHtml();
    body.querySelectorAll('.curpick button').forEach((b) => { b.classList.toggle('on', b.dataset.v === cur()); b.querySelector('.cp').innerHTML = meHtml(b.dataset.v); });
    body.querySelectorAll('#curCols button').forEach((b) => b.classList.toggle('on', b.dataset.c.toLowerCase() === curColor().toLowerCase()));
    body.querySelectorAll('#curSize button').forEach((b) => b.classList.toggle('on', +b.dataset.v === (+S.settings.cursorSize || 1)));
  };
  const save = () => { saveSettings(); draw(); applyCursor(); };
  body.querySelectorAll('.curpick button').forEach((b) => { b.onclick = () => { S.settings.cursor = b.dataset.v; save(); }; });
  body.querySelectorAll('#curCols button').forEach((b) => { b.onclick = () => { S.settings.cursorColor = b.dataset.c; save(); }; });
  body.querySelectorAll('#curSize button').forEach((b) => { b.onclick = () => { S.settings.cursorSize = +b.dataset.v; save(); }; });
  body.querySelector('#curReset').onclick = () => { delete S.settings.cursor; delete S.settings.cursorColor; delete S.settings.cursorSize; delete S.settings.cursorHalo; save(); };
  draw();
}
function applyCursor() {
  try { setAvatar(); } catch (e) { /* */ }
  const pk = $('mePuck'); if (pk) pk.remove();
  if (S.markers.me) { S.markers.me.remove(); S.markers.me = null; }
  renderMe();
}
function puckEl() {
  let p = $('mePuck');
  if (!p) { p = el('<div id="mePuck" class="mepuck" hidden aria-hidden="true">' + meHtml() + '</div>'); document.body.appendChild(p); }
  return p;
}
var meRaf = 0;
function meOnRotate() { if (meRaf || !S.follow || !S.camOff) return; meRaf = requestAnimationFrame(() => { meRaf = 0; try { renderMe(); } catch (e) { /* */ } }); }
function renderMe() {
  if (!S.pos) return;
  const v = myView();
  const fixed = S.follow && S.camOff && Date.now() >= (S.puckAt || 0);
  const pk = puckEl();
  if (fixed) {
    if (S.markers.me) { S.markers.me.remove(); S.markers.me = null; }
    const r = map.getContainer().getBoundingClientRect();
    pk.style.left = Math.round(r.left + r.width / 2 + S.camOff[0]) + 'px';
    pk.style.top = Math.round(r.top + r.height / 2 + S.camOff[1]) + 'px';
    const rot = S.settings.navNorth ? (v.heading || 0) : ((v.heading || 0) - map.getBearing() + 360) % 360; // cap du véhicule moins rotation actuelle de la carte : le curseur reste aligné sur la route, même pendant que la carte tourne dans un virage
    pk.firstChild.style.transform = 'rotate(' + Math.round(rot) + 'deg)';
    const u1 = pk.querySelector('svg.upr'); if (u1) u1.style.transform = 'rotate(' + (-Math.round(rot)) + 'deg)';
    pk.hidden = false;
    return;
  }
  pk.hidden = true;
  if (!S.markers.me) {
    const e = el(meHtml());
    S.markers.me = new maplibregl.Marker({ element: e, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([v.lon, v.lat]).addTo(map);
  }
  S.markers.me.setLngLat([v.lon, v.lat]).setRotation(v.heading || 0);
  const u2 = S.markers.me.getElement().querySelector('svg.upr'); if (u2) u2.style.transform = 'rotate(' + Math.round(-((v.heading || 0) - map.getBearing())) + 'deg)';
}


/* Conducteurs */
function visibleDriver(d) {
  if (!d || d.id === S.me.id || d.lat == null || d.lon == null) return null;
  if (Date.now() - Date.parse(d.updated_at) > 3 * 60000) return null;
  const isFriend = !!(window.ROUTA_X && ROUTA_X.isMate && ROUTA_X.isMate(d)); // membres du même convoi
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
    const lbl = esc(rudeText(d.pseudo) ? I18N.t('Conducteur') : (d.pseudo || 'Conducteur')) + (d.car && !rudeText(d.car) ? ' · ' + esc(d.car) : '');
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
}
setInterval(() => { if (!document.hidden) renderDrivers(); }, 30000);

/* Alertes */
/* Modes de déplacement (#042 vélo et vélo électrique, #043 à pied et transports publics, #063 trajets plus sûrs et agréables).
   À pied et en transports publics, aucun véhicule n'est nécessaire. */
const MODES = [['car', 'car', 'Véhicule'], ['bike', 'bike', 'Vélo'], ['walk', 'walk', 'À pied'], ['transit', 'transit', 'Transports']];
S.mode = MODES.some((m) => m[0] === store.get('routa.mode', 'car')) ? store.get('routa.mode', 'car') : 'car';
const softMode = () => S.mode === 'bike' || S.mode === 'ebike' || S.mode === 'walk';
const navSoft = () => !!(S.nav && S.nav.mode && S.nav.mode !== 'car');
function modeSeg(dest) {
  const w = el('<div class="modeseg" role="tablist">' + MODES.map(([k, icon, l]) => '<button role="tab" data-m="' + k + '" class="' + (S.mode === k ? 'on' : '') + '" aria-label="' + esc(I18N.t(l)) + '">' + ic(k === 'car' ? veh().icon : icon) + '<span>' + esc(I18N.t(k === 'car' ? veh().label : l)) + '</span></button>').join('') + '</div>');
  w.querySelectorAll('button').forEach((b) => { b.onclick = () => { if (S.mode === b.dataset.m) return; S.mode = b.dataset.m; store.set('routa.mode', S.mode); chooseDestination(dest); }; });
  return w;
}
function softOpts() {
  const h = new Date().getHours(), dark = h >= 18 || h < 7;
  // vélo : pistes et rues calmes d'abord, mauvais revêtements évités ; à pied : trottoirs et chemins, rues éclairées le soir
  if (S.mode === 'bike') return ['bicycle', { bicycle_type: 'Hybrid', cycling_speed: 16, use_roads: 0.2, use_hills: 0.3, avoid_bad_surfaces: 0.4, use_living_streets: 0.7, use_ferry: 0.5 }];
  if (S.mode === 'ebike') return ['bicycle', { bicycle_type: 'Hybrid', cycling_speed: 22, use_roads: 0.3, use_hills: 0.8, avoid_bad_surfaces: 0.35, use_living_streets: 0.6, use_ferry: 0.5 }];
  // #049 fauteuil roulant : profil « wheelchair » de Valhalla (évite marches et fortes pentes connues)
  if (S.settings.wheelchair) return ['pedestrian', { type: 'wheelchair', walking_speed: 4, step_penalty: 600, use_lit: dark ? 1 : 0.3, use_ferry: 0.3 }];
  return ['pedestrian', { walking_speed: 5, walkway_factor: 0.8, sidewalk_factor: 0.8, alley_factor: 2, driveway_factor: 5, step_penalty: 10, use_lit: dark ? 1 : 0.3, max_hiking_difficulty: 1, use_ferry: 0.5 }];
}
function putAlert(r) { if (!r || !r.id) return; if (r.type === 'lieu_ferme') S.closed.set(r.id, r); else S.alerts.set(r.id, r); }
function alertVisible(a) { return a && Date.parse(a.expires_at) > Date.now() && (!a.created_at || Date.parse(a.created_at) + ALERT_MAX > Date.now()) && (a.denies || 0) <= (a.confirms || 1); }
function renderAlerts() {
  const seen = new Set();
  S.alerts.forEach((a) => {
    if (!alertVisible(a)) return;
    if (a.type === 'bouchon' && S.jamSeg && S.jamSeg.get(a.id) && S.jamSeg.get(a.id).length > 1) return; // la route rouge remplace l'icône
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
  updateJams();
}
/* Bouchon signalé : la route passe en rouge sur ~150 m à l'endroit du signalement */
S.jamSeg = S.jamSeg || new Map();
function cutAround(shape, pt, half) {
  const cosL = Math.cos(toRad(pt.lat)), X = (p) => (p.lon - pt.lon) * 111320 * cosL, Y = (p) => (p.lat - pt.lat) * 111320;
  let bi = 0, bd = 1e12, bt = 0;
  for (let i = 0; i < shape.length - 1; i++) {
    const ax = X(shape[i]), ay = Y(shape[i]), bx = X(shape[i + 1]), by = Y(shape[i + 1]), dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)), px = ax + dx * t, py = ay + dy * t, d = px * px + py * py;
    if (d < bd) { bd = d; bi = i; bt = t; }
  }
  const start = { lat: shape[bi].lat + (shape[bi + 1].lat - shape[bi].lat) * bt, lon: shape[bi].lon + (shape[bi + 1].lon - shape[bi].lon) * bt };
  const walk = (dir) => { const out = []; let rem = half, cur = start, i = dir > 0 ? bi + 1 : bi;
    while (rem > 0 && i >= 0 && i < shape.length) { const d = dist(cur, shape[i]); if (d >= rem) { const f = rem / (d || 1); out.push([cur.lon + (shape[i].lon - cur.lon) * f, cur.lat + (shape[i].lat - cur.lat) * f]); rem = 0; } else { out.push([shape[i].lon, shape[i].lat]); rem -= d; cur = shape[i]; i += dir; } }
    return out; };
  return [...walk(-1).reverse(), [start.lon, start.lat], ...walk(1)];
}
async function loadJam(a) {
  if (S.jamSeg.has(a.id)) return; S.jamSeg.set(a.id, null);
  try {
    const r = await fetch((CFG.valhallaUrl || 'https://valhalla1.openstreetmap.de') + '/locate', { method: 'POST', body: JSON.stringify({ locations: [{ lat: a.lat, lon: a.lon }], costing: 'auto', verbose: true }) });
    const j = await r.json();
    const e = (((j || [])[0] || {}).edges || []).filter((x) => x.edge_info && x.edge_info.shape).sort((x, y) => (x.distance || 0) - (y.distance || 0))[0];
    const shape = e ? decodePoly6(e.edge_info.shape) : null;
    S.jamSeg.set(a.id, shape && shape.length > 1 ? cutAround(shape, a, 60) : [[a.lon, a.lat]]);
  } catch (err) { S.jamSeg.delete(a.id); return; }
  renderAlerts();
}
function updateJams() {
  const src = map.getSource && map.getSource('jam'); if (!src) return;
  const f = [];
  S.alerts.forEach((a) => {
    if (a.type !== 'bouchon' || !alertVisible(a)) return;
    const g = S.jamSeg.get(a.id);
    if (g === undefined) loadJam(a);
    else if (g && g.length > 1) f.push({ type: 'Feature', properties: { id: a.id }, geometry: { type: 'LineString', coordinates: g } });
  });
  src.setData({ type: 'FeatureCollection', features: f });
  if (!S.jamClick && map.getLayer('jam-line')) { S.jamClick = true; map.on('click', 'jam-line', (ev) => { const id = ev.features && ev.features[0] && ev.features[0].properties.id; if (id) openAlert(id); }); }
}
setInterval(() => { if (!document.hidden) renderAlerts(); }, 60000);

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
/* État de la position : un petit bandeau discret (jamais de grande fenêtre) quand quelque chose ne va pas */
const isNative = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
const platform = () => (window.Capacitor && Capacitor.getPlatform) ? Capacitor.getPlatform() : (/android/i.test(navigator.userAgent) ? 'android-web' : /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios-web' : 'web');
S.geoState = 'idle';
function setGeoState(st) {
  if (S.geoState === st) return;
  S.geoState = st;
  let c = $('geoChip');
  if (!c) { c = el('<button id="geoChip" class="geochip" hidden></button>'); c.onclick = openGeoHelp; document.body.appendChild(c); }
  const T = { denied: ['Position désactivée pour ROUTA', 'Touche ici pour l\'activer'], off: ['Position du téléphone coupée', 'Touche ici pour l\'activer'], weak: ['Signal GPS faible', 'Recherche de ta position…'], approx: ['Position approximative', 'Active la position exacte'] }[st];
  if (!T) { c.hidden = true; return; }
  c.innerHTML = ic('info') + '<span><b>' + esc(I18N.t(T[0])) + '</b><small><br>' + esc(I18N.t(T[1])) + '</small></span>';
  c.hidden = false;
}
function openGeoHelp() {
  const pf = platform(), st = S.geoState;
  const steps = pf === 'ios' ? ['Ouvre Réglages sur l\'iPhone', 'Touche ROUTA, puis Position', 'Choisis « Lorsque l\'app est active » et active « Position exacte »']
    : pf === 'android' ? ['Ouvre les Paramètres du téléphone', 'Applications › ROUTA › Autorisations › Position', 'Choisis « Autoriser seulement si l\'appli est en cours d\'utilisation » et active « Utiliser la position exacte »']
    : pf === 'ios-web' ? ['Ouvre Réglages sur l\'iPhone', 'Confidentialité et sécurité › Service de localisation › Safari', 'Choisis « Lorsque l\'app est active », puis recharge la page']
    : ['Touche le cadenas à côté de l\'adresse du site', 'Autorise « Position »', 'Recharge la page'];
  const offTxt = st === 'off' ? '<p>' + esc(I18N.t('La localisation du téléphone est coupée. Active-la dans le centre de contrôle ou les réglages rapides.')) + '</p>' : '';
  const body = openSheet(I18N.t('Activer la position'),
    '<p>' + esc(I18N.t('ROUTA a besoin de ta position pour te guider et afficher ta vitesse. Tu choisis dans ton profil qui peut la voir.')) + '</p>' + offTxt +
    steps.map((x, i) => '<div class="card"><div class="ico" style="background:var(--info);border-radius:22px;color:#0E1116;font-weight:800">' + (i + 1) + '</div><div class="grow">' + esc(I18N.t(x)) + '</div></div>').join('') +
    '<button class="btn block" id="geoRetry">' + esc(I18N.t('Réessayer')) + '</button>', 'geohelp');
  body.querySelector('#geoRetry').onclick = () => { closeSheet(); startGps(true); };
}
let gpsRetryT = 0, gpsRetryN = 0, gpsWeakT = 0;
function startGps(force) {
  if (!('geolocation' in navigator)) { setGeoState('denied'); return; }
  if (S.watchId != null && !force) return;
  if (S.watchId != null) { try { navigator.geolocation.clearWatch(S.watchId); } catch (e) { /* */ } S.watchId = null; }
  clearTimeout(gpsRetryT);
  let first = !S.pos;
  clearTimeout(gpsWeakT);
  gpsWeakT = setTimeout(() => { if (!S.fixAt || Date.now() - S.fixAt > 15000) setGeoState('weak'); }, 15000);
  S.watchId = navigator.geolocation.watchPosition((p) => {
    const c = p.coords;
    const now = { lat: c.latitude, lon: c.longitude, t: p.timestamp, alt: c.altitude != null && !isNaN(c.altitude) ? c.altitude : null, acc: c.accuracy };
    S.acc = c.accuracy;
    S.fixAt = Date.now();
    gpsRetryN = 0;
    setGeoState(c.accuracy > 1500 ? 'approx' : 'ok');
    S.speed = filterSpeed(c, now);
    let hd = null;
    if (c.heading != null && !isNaN(c.heading) && c.heading >= 0 && (S.speed || 0) > 2.5) hd = c.heading;
    else if (S.pos && (S.speed || 0) > 2.5 && dist(S.pos, now) > Math.max(12, c.accuracy || 10)) hd = bearing(S.pos, now);
    if (hd != null) S.heading = smoothHeading(S.heading, hd);
    S.prevPos = S.pos; S.pos = now;
    renderMe();
    updateSpeed();
    speedLimitTick();
    countryTick(false);
    if (first) { first = false; map.jumpTo({ center: [now.lon, now.lat], zoom: 14.5 }); pushPresence(true); }
    else if (S.follow) { if (!S.nav) followCam(); }
    else if ((S.nav || (S.moving && (S.speed || 0) * 3.6 > 25)) && Date.now() - (S.lastTouch || 0) > 12000) { S.follow = true; S.puckAt = Date.now() + 1100; $('btnLocate').classList.add('active'); followCam(); }
    if (S.nav) navUpdate();
    checkNearAlerts();
    pushPresence(false);
  }, (err) => {
    if (err.code === 1) {
      try { navigator.geolocation.clearWatch(S.watchId); } catch (e) { /* */ }
      S.watchId = null; S.geoAskAt = Date.now(); setGeoState('denied'); return;
    }
    // délai dépassé ou signal introuvable : la surveillance continue d'elle-même ; on relance doucement seulement si elle s'arrête
    if (err.code === 2) setGeoState(S.pos ? 'weak' : 'off');
    clearTimeout(gpsRetryT);
    gpsRetryT = setTimeout(() => { if (!S.fixAt || Date.now() - S.fixAt > 20000) { gpsRetryN++; startGps(true); } }, Math.min(60000, 8000 * Math.pow(2, gpsRetryN)));
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
/* Retour dans l'app (après les réglages) : on reprend la position automatiquement */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (S.geoState === 'denied') {
    const go = () => { if (Date.now() - (S.geoAskAt || 0) > 600000) { S.geoAskAt = Date.now(); startGps(true); } };
    if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'geolocation' }).then((ps) => { if (ps.state === 'granted') startGps(true); else if (ps.state !== 'denied') go(); }).catch(go);
    else go();
  } else if (S.geoState === 'off' || S.watchId == null) startGps(true);
});
if (navigator.permissions && navigator.permissions.query) {
  navigator.permissions.query({ name: 'geolocation' }).then((ps) => { ps.onchange = () => { if (ps.state === 'granted') startGps(true); else if (ps.state === 'denied') setGeoState('denied'); }; }).catch(() => {});
}
function estSpeedH(H, now) {
  // sur toute la fenêtre (jusqu'à 10 s) : le déplacement doit dépasser nettement l'imprécision des positions,
  // sinon c'est la position qui saute (intérieur, Wi-Fi) et pas le téléphone qui bouge
  const o = H[0], tN = H[H.length - 1].t, span = (tN - o.t) / 1000;
  if (span < 3) return null;
  const accMax = Math.max(...H.map((h) => h.acc || 0));
  const d = dist(o, now);
  if (d < Math.max(15, accMax * 2.5)) return 0;
  // en roulant, les positions avancent dans le même sens : le chemin parcouru point à point reste proche du déplacement total.
  // Une position qui saute dans tous les sens fait un long chemin pour un petit déplacement : ce n'est pas un mouvement.
  let path = 0; for (let i = 1; i < H.length; i++) path += dist(H[i - 1], H[i]);
  if (path > 0 && d / path < 0.6) return 0;
  return d / span;
}
function estSpeed(a, b) { const dt = (b.t - a.t) / 1000; const d = dist(a, b); if (dt < 0.8 || d < Math.max(15, 2 * (S.acc || 0))) return 0; return d / dt; }
/* Vitesse fiable : pas de vitesse « fantôme » à l'arrêt (relevés figés, GPS qui saute sur place) */
function filterSpeed(c, now) {
  const H = S.fixHist || (S.fixHist = []);
  if (H.length) { const iv = Date.now() - H[H.length - 1].t; if (iv > 200 && iv < 20000) S.fixIv = S.fixIv ? S.fixIv * 0.7 + iv * 0.3 : iv; }
  H.push({ lat: now.lat, lon: now.lon, t: Date.now(), acc: c.accuracy || 0 });
  while (H.length > 2 && Date.now() - H[0].t > 10000) H.shift();
  // sans vitesse donnée par le téléphone (ou -1 sur iPhone), on la calcule sur les 2,5 à 10 dernières secondes :
  // entre deux relevés à 1 s d'intervalle on ne bouge que de quelques mètres, ce qui donnait 0 km/h à basse vitesse
  const acc = c.accuracy || 0;
  // position trop imprécise (intérieur, Wi-Fi, antennes) : impossible de mesurer une vitesse, on affiche 0
  let raw = acc > 40 ? 0 : (c.speed != null && c.speed >= 0) ? c.speed : estSpeedH(H, now);
  if (raw == null) return S.speed == null ? null : S.speed;
  if (raw > 70) raw = S.speed || 0; // saut de position (GPS retrouvé) : pas une vraie vitesse
  if (raw > 0 && H.length >= 3) {
    let o = H[0]; for (let i = H.length - 1; i >= 0; i--) if (Date.now() - H[i].t >= 2000) { o = H[i]; break; }
    const span = (Date.now() - o.t) / 1000, moved = dist(o, now);
    // la voiture aurait dû avancer : si elle est restée sur place, c'est du bruit
    if (span >= 2 && moved < Math.max(6, (c.accuracy || 0) * 0.6) && moved < raw * span * 0.35) raw = 0;
  }
  // basse vitesse (< 30 km/h) : le GPS qui « dérive » à l'arrêt (couché, à l'intérieur) donne de faux 5 à 15 km/h.
  // On exige un vrai déplacement net sur 4 à 8 s, dans une direction suivie (pas des allers-retours sur place).
  if (raw > 0 && raw < 8) {
    let i0 = 0; while (i0 < H.length - 1 && Date.now() - H[i0].t > 8000) i0++;
    const o = H[i0], span = (Date.now() - o.t) / 1000;
    let path = 0; for (let i = i0 + 1; i < H.length; i++) path += dist(H[i - 1], H[i]);
    const net = dist(o, now);
    if (span < 4) { if (!(S.speed > 1.1)) raw = 0; }
    else if (net < Math.max(10, acc * 0.8, raw * span * 0.5) || (path > 0 && net / path < 0.6)) raw = 0;
  }
  // il faut 2 relevés de suite en mouvement pour quitter le 0 (un saut isolé ne fait plus monter le compteur)
  if (raw > 1.1 && !(S.speed > 1.1)) { S.mvN = (S.mvN || 0) + 1; if (S.mvN < 2) raw = 0; } else if (raw <= 1.1) S.mvN = 0;
  let v = S.speed == null ? raw : S.speed * 0.35 + raw * 0.65;
  if (v < 1.1) v = 0;
  return v;
}
/* Plus de relevé depuis 3 s : on est arrêté (l'iPhone n'envoie plus rien quand on ne bouge pas) */
setInterval(() => {
  // délai adapté au rythme réel du GPS (Android envoie parfois une position toutes les 3 à 5 s) : on ne passe pas à 0 entre deux relevés
  if (S.speed && S.fixAt && Date.now() - S.fixAt > Math.max(4000, Math.min(12000, (S.fixIv || 1000) * 2.5))) { S.speed = 0; S.moving = false; updateSpeed(); }
}, 1000);
function updateSpeed() {
  const box = $('speedBox');
  if (S.speed == null) { box.hidden = false; $('speedVal').textContent = '0'; $('limitSign').hidden = true; return; }
  box.hidden = false;
  const kmh = S.speed * 3.6 < 4 ? 0 : Math.round(S.speed * 3.6);
  $('speedVal').textContent = kmh;
  const lim = navSoft() ? null : capLimit(S.limit);
  const over = !!lim && kmh > lim + 3;
  // panneau affiché si on le demande, et toujours (réglable) quand on dépasse
  const showSign = !!lim && (S.settings.showLimit || (over && S.settings.overSign !== false));
  const sign = $('limitSign');
  sign.hidden = !showSign;
  if (showSign) sign.textContent = lim;
  sign.classList.toggle('over', over);
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
  if (!S.pos || !(S.settings.showLimit || S.settings.overSign !== false)) return;
  if (S.nav && S.nav.R && S.nav.R.limits) return;
  const last = S.trail[S.trail.length - 1];
  if (!last || dist(last, S.pos) > 8) { S.trail.push({ lat: S.pos.lat, lon: S.pos.lon }); if (S.trail.length > 6) S.trail.shift(); }
  if (limitBusy || (S.speed || 0) < 2 || S.trail.length < 2) return;
  if (Date.now() - lastLimitAt < 5000 || (lastLimitPos && dist(lastLimitPos, S.pos) < 25)) return;
  limitBusy = true; lastLimitAt = Date.now(); lastLimitPos = S.pos;
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch((CFG.valhallaUrl || 'https://valhalla1.openstreetmap.de') + '/trace_attributes', { method: 'POST', signal: ac.signal, body: JSON.stringify({ shape: S.trail.slice(-4), costing: 'auto', shape_match: 'map_snap', filters: { attributes: ['edge.speed_limit', 'edge.names', 'matched.point', 'matched.type', 'matched.distance_from_trace_point'], action: 'include' } }) });
    const j = await r.json();
    const edges = j.edges || [];
    /* Recalage sur la route (hors navigation) : décalage entre le GPS et le point de route le plus proche */
    try { const mp = (j.matched_points || []).slice(-1)[0], tp = S.trail.slice(-4).slice(-1)[0]; S.snapOff = (mp && mp.type === 'matched' && tp && (mp.distance_from_trace_point || 0) < 30) ? { dLat: mp.lat - tp.lat, dLon: mp.lon - tp.lon, t: Date.now() } : null; } catch (e2) { S.snapOff = null; }
    let lim = null;
    for (let i = edges.length - 1; i >= 0 && i >= edges.length - 3; i--) { const v = edges[i].speed_limit; if (v && v > 0 && v < 200) { lim = v; break; } }
    S.limit = lim;
    if (lim && !store.get('routa.limitInfo', false)) { store.set('routa.limitInfo', true); toast('Limite de vitesse <b>indicative</b> (données OpenStreetMap). Seuls les panneaux sur place font foi.', { ms: 8000 }); }
    updateSpeed();
  } catch (e) { /* réseau */ } finally { clearTimeout(tm); limitBusy = false; }
}
/* bas du bandeau de navigation : les messages s'affichent dessous, jamais par-dessus */
try { new ResizeObserver(() => { const b = $('navBanner'); document.documentElement.style.setProperty('--nbB', (b.hidden ? 0 : Math.round(b.getBoundingClientRect().bottom)) + 'px'); }).observe($('navBanner')); } catch (e) { /* */ }
/* Partie de l'écran vraiment libre (sans le bandeau, la barre du bas, ni le panneau de gauche en paysage) */
function freeArea() {
  const r = map.getContainer().getBoundingClientRect();
  let top = 0, bot = r.height, left = 0;
  const cx = r.width / 2;
  const nb = $('navBanner'); if (nb && !nb.hidden) { const b = nb.getBoundingClientRect(); if (b.left < cx && b.right > cx) top = Math.max(top, b.bottom - r.top); else if (b.right < cx + 40 && b.bottom > r.height * 0.5) left = Math.max(left, b.right - r.left); }
  const bar = $('navBar'); if (bar && !bar.hidden) { const b = bar.getBoundingClientRect(); if (b.height && b.left < cx && b.right > cx) bot = Math.min(bot, b.top - r.top); else if (b.height && b.right < cx + 40) left = Math.max(left, b.right - r.left); }
  return { w: r.width, h: r.height, top, bot, left };
}
/* Caméra de conduite : 2D, voiture en bas au centre, route visible devant, cap et zoom sans à-coups */
function followCam() {
  if (!S.pos) return;
  const nowT = Date.now(); if (nowT - (S.camAt || 0) < 900) return; S.camAt = nowT;
  $('btnLocate').classList.add('active');
  const kmh = (S.speed || 0) * 3.6;
  if (kmh >= 12) { S.moving = true; S.slowSince = 0; }
  else if (kmh < 10) { if (!S.slowSince) S.slowSince = nowT; if (nowT - S.slowSince > 4000) S.moving = false; }
  const moving = !!S.moving || !!S.nav;
  // zoom continu selon la vitesse, changé seulement par petites marches
  const zt = Math.max(15, Math.min(17.3, 17.6 - Math.max(0, kmh - 20) * 0.022));
  if (S.camZoom == null || Math.abs(zt - S.camZoom) > 0.5 || !moving) S.camZoom = moving ? Math.round(zt * 5) / 5 : Math.max(map.getZoom(), 16); // le zoom bouge par paliers plus larges : la carte ne « pompe » plus quand la vitesse varie
  const zoom = moving ? S.camZoom : (S.lastCam && !S.lastCam.moving ? map.getZoom() : 16.5);
  const north = S.settings.navNorth;
  const DUR = 1100;
  const v = myView(moving ? DUR / 1000 : 0); // la caméra arrive sur la vraie position à la fin du glissement
  const live = S.moving || (S.nav && S.nav.snap);
  let bearing = north ? 0 : (live && v.heading != null ? v.heading : map.getBearing());
  const turn = Math.abs(((bearing - map.getBearing()) % 360 + 540) % 360 - 180);
  if (!north && turn < 4) bearing = map.getBearing(); // petits écarts de cap : on ne fait pas tourner la carte
  const A = freeArea();
  const off = moving
    ? [Math.round(A.left / 2), Math.round(A.top + (A.bot - A.top) * 0.74 - A.h / 2)]
    : [Math.round(A.left / 2), Math.round((A.top + A.bot) / 2 - A.h / 2)];
  S.camOff = off;
  const c = map.getCenter(), lc = S.lastCam;
  if (!moving && lc && !lc.moving && Math.abs(map.getPitch()) < 1 && dist({ lat: c.lat, lon: c.lng }, v) < 3) { renderMe(); return; }
  if (S.puckAt == null) S.puckAt = 0;
  if (lc && lc.moving !== moving) S.puckAt = nowT + 1000;
  S.lastCam = { moving };
  map.easeTo({ center: [v.lon, v.lat], bearing, pitch: 0, zoom, duration: DUR, easing: (t) => t, offset: off, essential: true });
  renderMe();
}
setInterval(() => { if (S.follow && S.pos && !document.hidden) followCam(); }, 1000);

/* Envoi de ma position */
let lastPush = 0, lastPushPos = null;
function pushPresence(force) {
  if (!S.online || !S.me) return;
  const now = Date.now();
  const moved = S.pos && lastPushPos ? dist(S.pos, lastPushPos) : Infinity;
  if (!force && !(now - lastPush > 4000 && moved > 15) && now - lastPush < 25000) return;
  // #074 économie de batterie : app en arrière-plan sans navigation → présence envoyée au plus toutes les 2 min
  if (!force && document.hidden && !S.nav && now - lastPush < 120000) return;
  lastPush = now; lastPushPos = S.pos;
  const invisible = S.me.vis === 'invisible';
  DB.presence({
    id: S.me.id, code: S.me.code, pseudo: S.me.pseudo, car: S.me.car || null, color: S.me.color,
    visibility: S.me.vis, friends: [],
    lat: invisible || !S.pos ? null : S.pos.lat, lon: invisible || !S.pos ? null : S.pos.lon,
    heading: Math.round(S.heading || 0), speed: S.speed == null ? null : Math.round(S.speed * 3.6),
    updated_at: new Date().toISOString()
  });
}
setInterval(() => pushPresence(false), 20000);

/* ======================= Alertes à proximité ======================= */
function checkNearAlerts() {
  if (!S.pos || (S.nav && S.nav.mode === 'walk')) return;
  let best = null;
  S.alerts.forEach((a) => {
    if (!alertVisible(a) || S.prompted.has(a.id) || votedAlerts.has(a.id) || a.created_by === S.me.id) return;
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
    $('alertNearSub').textContent = I18N.t('à {d} · signalé {t} · confirmé {n} fois').replace('{d}', fmtDist(best.d)).replace('{t}', I18N.t(ago(best.a.created_at))).replace('{n}', best.a.confirms || 1);
    $('alertNear').hidden = false;
    vibrate([60, 40, 60]);
    clearTimeout(checkNearAlerts.t);
    checkNearAlerts.t = setTimeout(() => { $('alertNear').hidden = true; }, 20000);
  }
}
function voteAlert(id, yes, quiet) {
  const a = S.alerts.get(id); if (!a) return;
  // un seul vote par alerte et par téléphone, jamais sur sa propre alerte
  if (a.created_by === S.me.id || votedAlerts.has(id)) { if (!quiet) toast(I18N.t('Tu as déjà donné ton avis sur cette alerte.')); return; }
  votedAlerts.add(id); store.set('routa.voted', [...votedAlerts].slice(-300));
  if (yes) {
    // une confirmation prolonge l'alerte (jamais plus courte qu'avant)
    const exp = Math.min(Date.parse(a.expires_at) || 0, (Date.parse(a.created_at) || Date.now()) + ALERT_MAX);
    DB.updateAlert(id, { confirms: (a.confirms || 1) + 1, expires_at: new Date(exp).toISOString() });
  } else {
    const d = (a.denies || 0) + 1, c = a.confirms || 1;
    // deux « plus là » de plus que de confirmations : l'alerte disparaît pour tout le monde
    DB.updateAlert(id, d >= 2 && d >= c + 1 ? { denies: d, expires_at: new Date().toISOString() } : { denies: d });
  }
  if (!quiet) toast(yes ? 'Merci, alerte confirmée.' : 'Merci, on le signale aux autres.');
}
$('alertYes').onclick = () => { $('alertNear').hidden = true; if (S.alertNearId) voteAlert(S.alertNearId, true); };
$('alertNo').onclick = () => { $('alertNear').hidden = true; if (S.alertNearId) voteAlert(S.alertNearId, false); };

/* ======================= Feuille du bas ======================= */
const DISCLAIM = 'Tout est indicatif (lieux, limitations, vignettes, météo, pannes, conseils…). Fie-toi toujours à la réalité sur place : panneaux, loi, police, avis. ACKFIX décline toute responsabilité : tu restes seul responsable de tes choix.';
/* Avertissement unique au premier lancement : ROUTA informe, chacun décide */
function openNotice(force) {
  if (!force && store.get('routa.notice1', false)) return;
  const b = openSheet(I18N.t('À savoir avant de rouler'),
    '<p>' + esc(I18N.t('ROUTA donne des informations indicatives (distances, lieux, garages, parkings, aires, météo, limitations, suggestions). Elles viennent de sources publiques et peuvent être fausses ou dépassées.')) + '</p>' +
    '<p>' + esc(I18N.t('Ce ne sont pas des recommandations : vérifie les avis, la loi et les panneaux sur place (feu, accès, stationnement…). La signalisation et la police font toujours foi.')) + '</p>' +
    '<p><b>' + esc(I18N.t('Tu restes seul responsable de tes choix et de ta conduite.')) + '</b></p>' +
    '<p>' + esc(I18N.t('ACKFIX décline toute responsabilité dans les limites permises par la loi.')) + '</p>' +
    '<p class="muted small"><a href="confidentialite.html" style="color:var(--info)">' + esc(I18N.t('Règles d\'utilisation complètes')) + '</a></p>' +
    '<button class="btn primary block" id="ntOk">' + esc(I18N.t('J\'ai compris')) + '</button>', 'notice');
  b.querySelector('#ntOk').onclick = () => { store.set('routa.notice1', true); closeSheet(); };
}
setTimeout(() => { if (S.me && S.me.pseudo && !S.nav && $('sheetWrap').hidden) openNotice(); }, 3500);
function openSheet(title, html, view) {
  $('sheetTitle').textContent = title;
  $('sheetBody').innerHTML = html;
  $('sheetBody').scrollTop = 0;
  $('sheetWrap').hidden = false;
  S.sheetView = view || null;
  $('sheetWrap').classList.toggle('nomodal', /^(point|preview|place|fav|spot|poi)/.test(S.sheetView || ''));
  // Mention « infos indicatives » sous toutes les listes de lieux et les suggestions (gardée même quand le contenu se recharge)
  const nt = $('sheetNote');
  if (nt) { const on = false && !!S.sheetView && !/^(menu|settings|profile|onboarding|notice|messages|thread|friends|vehicle|licence|feedback|cursor|plansave|planstory|story|lang|install|ranking|badges|checklists|actdetail)/.test(S.sheetView); nt.hidden = !on; if (on) nt.textContent = I18N.t(DISCLAIM); }
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
const KEY_PLACES = /^(hospital|clinic|pharmacy|police|fire_station|doctors)$/;
async function nomiImportant(text, c) {
  if (Date.now() - (GEO.nomiAt || 0) < 1100) return [];
  GEO.nomiAt = Date.now();
  try {
    const vb = [c.lon - 1.5, c.lat + 1, c.lon + 1.5, c.lat - 1].map((x) => x.toFixed(3)).join(',');
    const j = await fetchJson(NOMI + '/search?format=jsonv2&addressdetails=1&limit=5&bounded=1&accept-language=' + I18N.lang + '&viewbox=' + vb + '&q=' + encodeURIComponent(text), 4000);
    return (j || []).filter((x) => KEY_PLACES.test(x.type)).map((x) => {
      const a = x.address || {};
      const city = a.city || a.town || a.village || a.municipality || '';
      const street = [a.road, a.house_number].filter(Boolean).join(' ');
      const kind = I18N.t(SUB_FR[x.type] || '');
      return { name: x.name || (x.display_name || '').split(',')[0], sub: [kind, street, [a.postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(' · '), lat: +x.lat, lon: +x.lon, key: true };
    });
  } catch (e) { return []; }
}
async function geoSearch(text, c, full) {
  const imp = full ? nomiImportant(text, c) : Promise.resolve([]);
  const base = await geoSearchBase(text, c, full).catch(() => []);
  const top = await imp;
  if (!top.length) return base;
  return top.concat(base.filter((b) => !top.some((t) => dist(t, b) < 150))).slice(0, 8);
}
async function geoSearchBase(text, c, full) {
  if (Date.now() > GEO.photonOffUntil) {
    try {
      const params = new URLSearchParams({ q: text, limit: '7', lang: (/^(fr|de|it)$/.test(I18N.lang) ? I18N.lang : 'en'), lat: c.lat.toFixed(4), lon: c.lon.toFixed(4) });
      const j = await fetchJson(CFG.searchUrl + '?' + params.toString(), 5000);
      return (j.features || []).map((f) => {
        const p = f.properties || {};
        const line1 = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || 'Lieu';
        const line2 = [p.name ? [p.street, p.housenumber].filter(Boolean).join(' ') : '', [p.postcode, p.city].filter(Boolean).join(' '), p.country].filter(Boolean).join(', ');
        const kind = SUB_FR[p.osm_value] && p.osm_key !== 'place' && p.osm_key !== 'highway' ? I18N.t(SUB_FR[p.osm_value]) : (p.osm_key === 'highway' && p.osm_value === 'bus_stop' ? I18N.t('Arrêt de bus') : '');
        return { name: line1, sub: [kind, line2].filter(Boolean).join(' · '), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
      });
    } catch (e) { GEO.photonOffUntil = Date.now() + 10 * 60000; }
  }
  if (!full) return [];
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
      const j = await fetchJson((CFG.searchUrl || 'https://photon.komoot.io/api/').replace(/api\/?$/, 'reverse') + '?lat=' + p.lat + '&lon=' + p.lon + '&lang=' + ((/^(fr|de|it)$/.test(I18N.lang) ? I18N.lang : 'en')), 3500);
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
const runSearch = debounce(async (text, full) => {
  if (text.length < 3) { showRecents(); return; }
  try {
    const c = S.pos || (() => { const m = map.getCenter(); return { lat: m.lat, lon: m.lng }; })();
    const items = await geoSearch(text, c, full);
    const ack = []; // #017 : plus de publicité de réparation informatique dans la recherche
    const spotHits = [...S.spots.values()].filter((s) => s.name.toLowerCase().includes(text.toLowerCase())).slice(0, 3).map((s) => ({ name: s.name, sub: 'Spot · ' + (SPOT_CATS[s.category] || ''), lat: s.lat, lon: s.lon, spot: true }));
    showResults(ack.concat(spotHits, items));
  } catch (e) {
    showResults([], 'Recherche indisponible. Vérifie ta connexion.');
  }
}, 500);
function showResults(items, msg) {
  const box = $('results');
  if (!items.length) { box.innerHTML = '<div class="result"><span class="muted">' + esc(msg || 'Aucun résultat.') + '</span></div>'; box.hidden = false; return; }
  box.innerHTML = items.map((it, i) => '<button class="result" data-i="' + i + '">' + (it.ackfix ? '<span class="ackico">A</span>' : ic(it.fav ? 'star' : it.spot ? 'spot' : it.recent ? 'clock' : 'pin')) + '<span class="grow"><b>' + esc(it.name) + '</b><small>' + esc(it.sub || '') + (S.pos && !it.nodist ? (it.sub ? ' · ' : '') + fmtDist(dist(S.pos, it)) : '') + '</small></span></button>').join('');
  box.hidden = false;
  box.querySelectorAll('.result').forEach((b) => { b.onclick = () => { const it = items[+b.dataset.i]; hideResults(); q.blur(); if (it.ackfix) { openAckfix(); return; } if (S.pickSlot) { const k = S.pickSlot; q.value = ''; saveSlot(k, it); return; } if (S.pickVia) { const fin = S.pickVia; exitSearch(); if (window.ROUTA_X && ROUTA_X.addVia) ROUTA_X.addVia(it, fin); return; } chooseDestination(it); }; });
}
function openAckfix() {
  openSheet('ACKFIX', '<div class="banner"><span class="ackico">A</span><span><b>Informatique, simplement.</b><br>Dépannage, réparation et maintenance PC et Mac, PC sur mesure. On récupère ton ordinateur et on te le ramène, partout dans le Canton de Vaud.</span></div>' +
    '<a class="btn block" href="https://ackfix.com" target="_blank" rel="noopener">' + ic('web') + 'Voir ackfix.com</a>' +
    '<p class="muted small">ROUTA est développé par ACKFIX.</p>', 'ackfix');
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
  if (S.pickVia) { S.pickVia = null; q.placeholder = I18N.t('Où va-t-on ?'); }
}
/* Choisir une étape dans la recherche (avant ou pendant la navigation) */
function pickVia(fin) {
  closeSheet();
  S.pickVia = fin; q.value = ''; $('qclear').hidden = true; q.placeholder = I18N.t('Ajouter une étape');
  enterSearch();
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
q.addEventListener('keydown', (e) => { if (e.key === 'Escape') exitSearch(); if (e.key === 'Enter') { e.preventDefault(); runSearch(q.value.trim(), true); } });
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
  const body = { locations: [Object.assign({ lat: from.lat, lon: from.lon }, from.hd != null ? { heading: from.hd, heading_tolerance: 60 } : {}), { lat: to.lat, lon: to.lon }], costing, directions_options: { language: I18N.valhalla, units: 'kilometers' } };
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
  if ((S.nav ? navSoft() : softMode())) {
    if (S.nav) S.mode = S.nav.mode;
    const [costing, o] = softOpts();
    const R = await fetchValhalla(from, to, costing, o); R.mode = S.mode; return R;
  }
  const v = veh();
  if (v.heavy && window.ROUTA_X && ROUTA_X.route) { try { const R = await ROUTA_X.route(from, to); if (R) { R.vehicle = vehSummary(); return R; } } catch (e) { console.warn('tomtom poids lourd', e); } }
  if (v.heavy) {
    const d = v.dims;
    const o = { height: d.height, width: d.width, length: d.length, weight: d.weight };
    if (v.costing === 'truck') { o.hazmat = v.hazmat; if (v.type === 'camping' && !v.isHgv) o.use_highways = 1; }
    try { const R = await fetchValhalla(from, to, v.costing, o); R.vehicle = vehSummary(); return R; }
    catch (e) { console.warn('valhalla', e); const R = await fetchOsrm(from, to); R.fallback = true; return R; }
  }
  if (window.ROUTA_X && ROUTA_X.route) { try { const R = await ROUTA_X.route(from, to); if (R) { if (v.two) R.vehicle = vehSummary(); return R; } } catch (e) { console.warn('tomtom', e); } }
  // #005 : secours sans TomTom — cyclomoteur / scooter 45 km/h sans autoroute (Valhalla « motor_scooter »), moto (« motorcycle »)
  if (v.two) { try { const R = await fetchValhalla(from, to, v.cyclo ? 'motor_scooter' : 'motorcycle', v.cyclo ? { top_speed: 45 } : undefined); R.vehicle = vehSummary(); return R; } catch (e) { console.warn('valhalla deux-roues', e); } }
  try { return await fetchOsrm(from, to); }
  catch (e) { return await fetchValhalla(from, to, 'auto'); }
}
async function fetchOsrm(from, to) {
  const url = CFG.routingUrl + '/route/v1/driving/' + from.lon + ',' + from.lat + ';' + to.lon + ',' + to.lat + '?overview=full&geometries=geojson&steps=true&alternatives=false' + (from.hd != null ? '&bearings=' + from.hd + ',60;' : '');
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
  steps.forEach((s) => { const m = s.maneuver; if (m && isRb(m) && m.bearing_before != null && m.bearing_after != null && m.angle == null) m.angle = ((m.bearing_after - m.bearing_before + 540) % 360) - 180; });
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

/* #043 Transports publics : horaires officiels suisses (transport.opendata.ch), retards en direct ; ailleurs, on renvoie vers une appli d'horaires */
const tpTime = (iso) => { if (!iso) return null; const d = new Date(String(iso).replace(/([+-]\d\d)(\d\d)$/, '$1:$2')); return isNaN(d) ? null : d; };
const hhmm = (d) => ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
async function tpNearest(p) {
  const r = await fetch('https://transport.opendata.ch/v1/locations?x=' + p.lat.toFixed(5) + '&y=' + p.lon.toFixed(5) + '&type=station');
  const j = await r.json();
  return (j.stations || []).filter((x) => x.id && x.coordinate && x.coordinate.x).sort((a, b) => (a.distance || 0) - (b.distance || 0))[0] || null;
}
async function transitPreview(dest) {
  const tok = (S.tpTok = (S.tpTok || 0) + 1);
  const body0 = openSheet(dest.name, '<p class="muted">' + esc(I18N.t('Recherche des correspondances…')) + '</p>', 'preview');
  body0.insertBefore(modeSeg(dest), body0.firstChild);
  S.preview = null; drawRoute(null);
  const gUrl = 'https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=' + S.pos.lat.toFixed(5) + ',' + S.pos.lon.toFixed(5) + '&destination=' + dest.lat.toFixed(5) + ',' + dest.lon.toFixed(5);
  const other = '<a class="btn soft block" target="_blank" rel="noopener" href="' + esc(gUrl) + '">' + ic('transit') + esc(I18N.t('Voir dans Google Maps')) + '</a>';
  let html = '';
  try {
    const [a, b] = await Promise.all([tpNearest(S.pos), tpNearest(dest)]);
    if (!a || !b || (a.distance || 0) > 2500 || (b.distance || 0) > 2500) throw new Error('loin');
    if (a.id === b.id) throw new Error('meme');
    const r = await fetch('https://transport.opendata.ch/v1/connections?from=' + encodeURIComponent(a.id) + '&to=' + encodeURIComponent(b.id) + '&limit=5');
    const j = await r.json();
    const cons = (j.connections || []).filter((c) => c.from && c.to);
    if (!cons.length) throw new Error('aucune');
    const walkA = Math.max(1, Math.round((a.distance || 0) / 75)), walkB = Math.max(1, Math.round((b.distance || 0) / 75));
    html = '<p class="muted small">' + esc(I18N.t('Départ : {a} (environ {m} min à pied)').replace('{a}', a.name).replace('{m}', walkA)) + '<br>' + esc(I18N.t('Arrivée : {b}, puis environ {m} min à pied').replace('{b}', b.name).replace('{m}', walkB)) + '</p>' +
      cons.map((c, i) => {
        const d = tpTime(c.from.prognosis && c.from.prognosis.departure || c.from.departure), ar = tpTime(c.to.prognosis && c.to.prognosis.arrival || c.to.arrival);
        const delay = +(c.from.delay || 0);
        const lines = (c.sections || []).filter((x) => x.journey).map((x) => { const cat = String(x.journey.category || '').trim(), num = String(x.journey.number || '').trim(); const train = !LINE_ONLY.test(cat); return '<span class="ln' + (train ? ' train' : '') + '">' + esc(train ? cat + (num && num.length < 4 ? num : '') : (num || cat)) + '</span>'; }).join(' ');
        const dur = d && ar ? Math.round((ar - d) / 60000) : null;
        return '<button class="card tap tpcon" data-i="' + i + '"><div class="grow"><b>' + (d ? hhmm(d) : '–') + ' → ' + (ar ? hhmm(ar) : '–') + '</b>' + (delay > 0 ? ' <span class="tpdelay">+' + delay + ' min</span>' : '') +
          '<div class="sub">' + (dur != null ? esc(fmtDur(dur * 60)) + ' · ' : '') + esc(I18N.t(c.transfers ? '{n} changement(s)' : 'Direct').replace('{n}', c.transfers)) + (c.from.platform ? ' · ' + esc(I18N.t('voie')) + ' ' + esc(c.from.platform) : '') + '</div><div class="tplines">' + lines + '</div></div></button>' +
          '<div class="tpdetail" data-d="' + i + '" hidden>' + (c.sections || []).map((x) => {
            if (x.walk) return '<div class="tpsec walk">' + ic('walk') + '<span>' + esc(I18N.t('Marche')) + '</span></div>';
            if (!x.journey) return '';
            const sd = tpTime(x.departure.prognosis && x.departure.prognosis.departure || x.departure.departure), sa = tpTime(x.arrival.prognosis && x.arrival.prognosis.arrival || x.arrival.arrival);
            return '<div class="tpsec">' + ic('transit') + '<span><b>' + esc(String(x.journey.category || '') + ' ' + String(x.journey.number || '')) + '</b> ' + esc(I18N.t('direction {d}').replace('{d}', x.journey.to || '')) + '<br>' + (sd ? hhmm(sd) : '') + ' ' + esc(x.departure.station && x.departure.station.name || '') + (x.departure.platform ? ' (' + esc(I18N.t('voie')) + ' ' + esc(x.departure.platform) + ')' : '') + '<br>' + (sa ? hhmm(sa) : '') + ' ' + esc(x.arrival.station && x.arrival.station.name || '') + '</span></div>';
          }).join('') + '</div>';
      }).join('') +
      '<button class="btn soft block" id="tpWalk">' + ic('walk') + esc(I18N.t('Me guider à pied jusqu\'à {a}').replace('{a}', a.name)) + '</button>' +
      '<p class="muted small">' + esc(I18N.t('Horaires et retards en direct : transport.opendata.ch (Suisse).')) + '</p>' + other;
    if (tok !== S.tpTok || S.sheetView !== 'preview') return;
    const body = openSheet(dest.name, html, 'preview');
    body.insertBefore(modeSeg(dest), body.firstChild);
    body.querySelectorAll('.tpcon').forEach((bt) => { bt.onclick = () => { const dd = body.querySelector('[data-d="' + bt.dataset.i + '"]'); if (dd) dd.hidden = !dd.hidden; }; });
    body.querySelector('#tpWalk').onclick = () => { S.mode = 'walk'; store.set('routa.mode', 'walk'); chooseDestination({ name: a.name, sub: I18N.t('Arrêt de transports publics'), lat: a.coordinate.x, lon: a.coordinate.y }); };
    try { const bb = new maplibregl.LngLatBounds(); [S.pos, dest].forEach((p) => bb.extend([p.lon, p.lat])); map.fitBounds(bb, { padding: { top: 140, bottom: Math.round(window.innerHeight * 0.5), left: 40, right: 40 }, maxZoom: 15, duration: 600 }); } catch (e) { /* */ }
  } catch (e) {
    console.warn('transports publics', e);
    if (tok !== S.tpTok || S.sheetView !== 'preview') return;
    const body = openSheet(dest.name, '<p class="muted">' + esc(I18N.t(String(e.message) === 'meme' ? 'Le même arrêt est le plus proche au départ et à l\'arrivée : le trajet se fait à pied.' : 'Horaires de transports publics indisponibles pour ce trajet (disponibles en Suisse pour le moment).')) + '</p>' + other, 'preview');
    body.insertBefore(modeSeg(dest), body.firstChild);
  }
}
async function chooseDestination(dest) {
  exitSearch();
  if (!S.pos) { toast("J'attends ta position GPS pour calculer le trajet…"); startGps(); map.flyTo({ center: [dest.lon, dest.lat], zoom: 14 }); return; }
  remember(dest);
  setDestMarker(dest);
  if (S.mode === 'transit') { transitPreview(dest); return; }
  openSheet(dest.name, '<p class="muted">Calcul du trajet…</p>', 'preview');
  try {
    const R = await fetchRoute(S.pos, dest);
    S.preview = { R, dest };
    drawRoute(R, 0); fitRoute(R); stopFollow();
    const arr = new Date(Date.now() + R.duration * 1000);
    const body = openSheet(dest.name,
      '<div class="row"><div class="grow"><div><span class="eta">' + fmtDur(R.duration) + '</span> <span class="etarest">' + fmtDist(R.total) + ' · arrivée ' + fmtClock(arr) + '</span></div>' +
      '<div class="muted small">' + esc(dest.sub || '') + '</div></div></div>' +
      (softMode() ? '' : veh().heavy ? (R.fallback ? '<div class="banner warnb">' + ic('info') + '<span><b>Calcul poids lourd indisponible pour le moment.</b> Trajet voiture affiché : attention aux restrictions de hauteur, de poids et d\'accès.</span></div>'
        : '<div class="banner">' + ic(veh().icon) + '<span>Trajet adapté : <b>' + esc(vehSummary()) + '</b>. Les limites connues de hauteur, poids et accès sont évitées. Respecte toujours la signalisation.</span></div>') : '') +
      '<button class="btn block" id="goNav">' + ic('nav') + 'Démarrer</button>' +
      (softMode() ? '<p class="muted small">' + esc(I18N.t(S.mode === 'walk' ? 'Trajet à pied : trottoirs et chemins d\'abord, rues éclairées le soir. Durée estimée à 5 km/h.' : 'Trajet à vélo : pistes cyclables et rues calmes d\'abord, mauvais revêtements évités. Respecte toujours la signalisation.')) + '</p>'
        : '<button class="btn ghost" id="chgVeh">' + ic(veh().icon) + 'Véhicule : ' + esc(vehSummary()) + ' (changer)</button>' +
      '<p class="muted small">Durée calculée sans le trafic en direct.</p>'), 'preview');
    body.insertBefore(modeSeg(dest), body.firstChild);
    body.querySelector('#goNav').onclick = () => { closeSheet(); startNav(R, dest); };
    const cv = body.querySelector('#chgVeh'); if (cv) cv.onclick = () => openVehicle(() => chooseDestination(dest));
    if (S.mode === 'walk') {
      const wc = el('<div><label class="switch" for="pvWheel"><span><b>' + esc(I18N.t('Accessible en fauteuil roulant')) + '</b><br><span class="muted small">' + esc(I18N.t('Évite les marches et les fortes pentes connues. Les données d\'accessibilité peuvent être incomplètes : vérifie sur place.')) + '</span></span><input id="pvWheel" type="checkbox"' + (S.settings.wheelchair ? ' checked' : '') + '></label></div>');
      body.appendChild(wc);
      wc.querySelector('#pvWheel').onchange = (e) => { S.settings.wheelchair = e.target.checked; saveSettings(); chooseDestination(dest); };
    }
    if (softMode()) return;
    routeCountries(R, dest);
    if (window.ROUTA_X && ROUTA_X.preview) ROUTA_X.preview(R, dest, body);
  } catch (e) {
    const eb = openSheet(dest.name, '<p>Impossible de calculer le trajet pour le moment. Vérifie ta connexion et réessaie.</p><button class="btn block" id="retryRoute">Réessayer</button>', 'preview');
    eb.querySelector('#retryRoute').onclick = () => chooseDestination(dest);
    eb.insertBefore(modeSeg(dest), eb.firstChild);
  }
}
function cancelPreview() { if (!S.nav) { S.preview = null; drawRoute(null); setDestMarker(null); } }

/* ======================= Navigation ======================= */
const DIRS = { left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite', 'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'demi-tour' };
const ORD = ['', 'première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième'];
/* Ronds-points : sens de sortie tiré du tracé, et phrase sans numéro quand les sources ne sont pas d'accord */
const RB_TXT = {
  fr: { right: 'Au rond-point, prenez la sortie à droite', straight: 'Au rond-point, continuez tout droit', left: 'Au rond-point, prenez la sortie à gauche', back: 'Au rond-point, faites demi-tour', on: ' sur ' },
  en: { right: 'At the roundabout, take the exit on the right', straight: 'At the roundabout, go straight ahead', left: 'At the roundabout, take the exit on the left', back: 'At the roundabout, make a U-turn', on: ' onto ' },
  tr: { right: 'Dönelde sağdaki çıkışı alın', straight: 'Dönelde düz devam edin', left: 'Dönelde soldaki çıkışı alın', back: 'Dönelde geri dönün', on: ', ' },
  de: { right: 'Nimm im Kreisel die Ausfahrt rechts', straight: 'Fahre im Kreisel geradeaus', left: 'Nimm im Kreisel die Ausfahrt links', back: 'Wende im Kreisel', on: ', ' },
  it: { right: 'Alla rotonda, prendi l\'uscita a destra', straight: 'Alla rotonda, prosegui dritto', left: 'Alla rotonda, prendi l\'uscita a sinistra', back: 'Alla rotonda, torna indietro', on: ', ' },
  pt: { right: 'Na rotunda, sai à direita', straight: 'Na rotunda, segue em frente', left: 'Na rotunda, sai à esquerda', back: 'Na rotunda, inverte o sentido', on: ', ' },
  es: { right: 'En la rotonda, toma la salida a la derecha', straight: 'En la rotonda, sigue recto', left: 'En la rotonda, toma la salida a la izquierda', back: 'En la rotonda, da la vuelta', on: ', ' },
  sq: { right: 'Në rrethrrotullim, merr daljen djathtas', straight: 'Në rrethrrotullim, vazhdo drejt', left: 'Në rrethrrotullim, merr daljen majtas', back: 'Në rrethrrotullim, kthehu prapa', on: ', ' },
  sr: { right: 'Na kružnom toku, izađi desno', straight: 'Na kružnom toku, nastavi pravo', left: 'Na kružnom toku, izađi levo', back: 'Na kružnom toku, okreni se nazad', on: ', ' }
};
const isRb = (m) => /roundabout|rotary/.test((m && m.type) || '');
function rbSide(a) { return a == null ? null : Math.abs(a) <= 30 ? 'straight' : a > 30 && a <= 150 ? 'right' : a < -30 && a >= -150 ? 'left' : 'back'; }
function rbIcon(a) {
  // vue du dessus, circulation à droite : on entre par le bas et on tourne dans le sens inverse des aiguilles d'une montre
  const cx = 12, cy = 11, r = 5.2;
  if (a > 165) a -= 360; // demi-tour : on fait tout le tour
  let span = 180 - a; if (span < 25) span = 25; if (span > 340) span = 340;
  const pt = (phi, rad) => [cx + rad * Math.sin(phi * Math.PI / 180), cy - rad * Math.cos(phi * Math.PI / 180)];
  const e = 180 - span, [x0, y0] = pt(180, r), [x1, y1] = pt(e, r), [x2, y2] = pt(e, r + 5.5);
  const ux = (x2 - x1) / 5.5, uy = (y2 - y1) / 5.5, hx = x2 - ux * 2.6, hy = y2 - uy * 2.6;
  const f = (n) => n.toFixed(2);
  return '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" opacity=".35"/><path d="M12 23V' + f(y0) + 'A' + r + ' ' + r + ' 0 ' + (span > 180 ? 1 : 0) + ' 0 ' + f(x1) + ' ' + f(y1) + 'L' + f(x2) + ' ' + f(y2) + '"/><path d="M' + f(hx - uy * 2.4) + ' ' + f(hy + ux * 2.4) + 'L' + f(x2) + ' ' + f(y2) + 'L' + f(hx + uy * 2.4) + ' ' + f(hy - ux * 2.4) + '"/></svg>';
}
function stepArrow(s) { const m = s && s.maneuver; return m && isRb(m) && m.angle != null ? rbIcon(m.angle) : ic(stepIcon(s)); }
function stepText(s) {
  const mm = s.maneuver || {};
  if (isRb(mm) && mm.uncertain && rbSide(mm.angle)) { const L = RB_TXT[I18N.lang] || RB_TXT.fr; return L[rbSide(mm.angle)] + (s.name ? L.on + s.name : ''); }
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

/* Deuxième avis sur le numéro de sortie (OpenStreetMap via Valhalla, sur le tracé exact) : en cas de désaccord, on annonce le sens sans numéro */
async function checkRoundabouts(R) {
  try {
    if (!R || R.engine === 'valhalla' || R.rbChecked) return;
    const rb = R.steps.map((s, i) => [s, i]).filter(([s]) => isRb(s.maneuver) && s.maneuver.exit && s.maneuver.location);
    if (!rb.length) return;
    R.rbChecked = true;
    const lim = Math.min(R.coords.length, (R.cum.findIndex((c) => c > 60000) + 1) || R.coords.length);
    const shape = []; let last = null;
    for (let i = 0; i < lim; i++) { const c = R.coords[i]; if (!last || dist(last, c) > 4 || i === lim - 1) { shape.push({ lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6) }); last = c; } }
    if (shape.length < 2 || shape.length > 6000) return;
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 12000);
    const r = await fetch((CFG.valhallaUrl || 'https://valhalla1.openstreetmap.de') + '/trace_route', { method: 'POST', signal: ac.signal, body: JSON.stringify({ shape, costing: 'auto', shape_match: 'map_snap', directions_options: { units: 'kilometers' } }) });
    clearTimeout(tm);
    const j = await r.json(); const leg = j && j.trip && j.trip.legs && j.trip.legs[0]; if (!leg) return;
    const sh = decodePoly6(leg.shape);
    const v = leg.maneuvers.filter((m) => m.type === 26 && m.roundabout_exit_count).map((m) => ({ p: sh[Math.min(m.begin_shape_index, sh.length - 1)], n: m.roundabout_exit_count }));
    rb.forEach(([s]) => {
      const m = s.maneuver, at = { lat: m.location[1], lon: m.location[0] };
      const hit = v.filter((x) => dist(x.p, at) < 45).sort((a, b) => dist(a.p, at) - dist(b.p, at))[0];
      if (hit && hit.n !== m.exit) { m.uncertain = true; m.altExit = hit.n; }
    });
    if (S.nav && S.nav.R === R) navUpdate();
  } catch (e) { /* deuxième avis indisponible : on garde l'annonce d'origine */ }
}
function startNav(R, dest) {
  S.preview = null;
  S.nav = { R, dest, along: 0, seg: 0, offCount: 0, lastReroute: 0, spoken: {}, startedAt: Date.now(), mode: R.mode || 'car' };
  { const tb = $('toasts'); if (tb) tb.innerHTML = ''; } // aucun ancien message (ex. « Reprendre ») ne reste au démarrage
  // #065 : point de départ gardé pour proposer le retour
  document.body.classList.toggle('navsoft', !!R.mode && R.mode !== 'car');
  document.body.classList.add('navigating');
  $('navBanner').hidden = false; $('navBar').hidden = false;
  $('etaDest').textContent = 'Vers ' + dest.name;
  S.follow = true; S.puckAt = Date.now() + 1100; S.lastCam = null; $('btnLocate').classList.add('active');
  requestWake();
  drawRoute(R, 0);
  checkRoundabouts(R);
  saveActiveNav();
  const first = R.steps[1] || R.steps[0];
  say("C'est parti. " + stepText(R.steps[0]) + '. Puis, ' + stepText(first).toLowerCase());
  navUpdate();
  followCam();
  carSync(true);
}
function saveTrip(N) {
  try {
    const km = (N.trav || 0) / 1000;
    if (km < 0.3 || !N.dest) return;
    const t = store.get('routa.trips', []);
    t.unshift({ name: N.dest.name, sub: N.dest.sub || '', lat: N.dest.lat, lon: N.dest.lon, at: N.startedAt, min: Math.max(1, Math.round((Date.now() - N.startedAt) / 60000)), km: Math.round(km * 10) / 10, done: !!N.arrived });
    store.set('routa.trips', t.slice(0, 50));
  } catch (e) { /* */ }
}
/* Reprise d'un trajet interrompu (app fermée, téléphone redémarré…) */
function saveActiveNav() {
  const N = S.nav; if (!N) return;
  const X = window.ROUTA_X;
  store.set('routa.activeNav', { dest: N.dest, mode: N.mode || 'car', via: X && X.via ? X.via.filter((v) => !v.done).map((v) => ({ name: v.name, lat: v.lat, lon: v.lon })) : [], at: Date.now() });
}
setInterval(() => { if (S.nav) saveActiveNav(); }, 30000);
function offerResume() {
  const a = store.get('routa.activeNav', null);
  if (!a || !a.dest || S.nav || document.body.classList.contains('navigating') || Date.now() - a.at > 3 * 3600000) { if (a) store.set('routa.activeNav', null); return; }
  if (S.pos && dist(S.pos, a.dest) < 150) { store.set('routa.activeNav', null); return; }
  toast(esc(I18N.t('Trajet interrompu vers {d}').replace('{d}', a.dest.name || '')), { action: I18N.t('Reprendre'), ms: 20000, onAction: () => resumeNav(a) });
}
async function resumeNav(a) {
  if (!S.pos) { toast(I18N.t('Recherche de ta position…')); setTimeout(() => resumeNav(a), 3000); return; }
  const X = window.ROUTA_X;
  if (X && a.via && a.via.length) { X.via = a.via.map((v) => Object.assign({}, v)); X.viaFor = a.dest.lat.toFixed(4) + ',' + a.dest.lon.toFixed(4); X.altIdx = 0; }
  if (a.mode && a.mode !== 'transit' && MODES.some((m) => m[0] === a.mode)) S.mode = a.mode;
  try { setDestMarker(a.dest); const R = await fetchRoute(S.pos, a.dest); closeSheet(); startNav(R, a.dest); }
  catch (e) { toast('Impossible de calculer le trajet pour le moment. Vérifie ta connexion et réessaie.'); }
}
function stopNav(silent) {
  if (!S.nav) return;
  store.set('routa.activeNav', null);
  saveTrip(S.nav);
  S.nav = null;
  document.body.classList.remove('navigating', 'navsoft');
  $('navBanner').hidden = true; $('navBar').hidden = true;
  drawRoute(null); setDestMarker(null);
  releaseWake();
  map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
  updateCompass();
  if (!silent) toast('Navigation arrêtée.');
  carSync(true);
}

/* ======================= CarPlay ======================= */
/* L'écran de la voiture est piloté depuis ici : on lui envoie le trajet, la prochaine manœuvre et les destinations. */
const CAR = (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.RoutaCar) || null;
const CAR_ALERTS = ['accident', 'bouchon', 'travaux', 'objet', 'arret', 'glissant', 'animal', 'fermee'];
let carLast = 0, carSentRoute = null, carOn = false;
function carPlaces() {
  const out = [];
  ['home', 'work'].forEach((k) => { const f = slotFav(k); if (f) out.push({ name: I18N.t(SLOTS[k]), sub: f.addr || '', lat: f.lat, lon: f.lon, icon: k === 'home' ? 'house.fill' : 'briefcase.fill' }); });
  S.favs.filter((f) => !f.slot).slice(0, 6).forEach((f) => out.push({ name: f.name, sub: f.addr || '', lat: f.lat, lon: f.lon, icon: 'star.fill' }));
  S.recents.slice(0, 6).forEach((r) => { if (!out.some((o) => Math.abs(o.lat - r.lat) < 1e-4 && Math.abs(o.lon - r.lon) < 1e-4)) out.push({ name: r.name, sub: r.sub || '', lat: r.lat, lon: r.lon, icon: 'clock.fill' }); });
  return out;
}
function carSync(force) {
  if (!CAR || !carOn) return;
  const now = Date.now(); if (!force && now - carLast < 900) return; carLast = now;
  const t = (x) => I18N.t(x);
  const st = {
    navigating: !!S.nav, tomtomKey: CFG.tomtomKey || '', traffic: !!S.settings.traffic,
    labels: { dest: t('Destinations'), report: t('Signaler'), stop: t('Arrêter'), empty: t('Aucune destination enregistrée : ajoute des favoris sur ton téléphone.') },
    alerts: CAR_ALERTS.map((k) => ({ k, label: t(ALERT_TYPES[k].label) })),
    places: carPlaces()
  };
  if (S.nav) {
    Object.assign(st, S.nav.car || {}, { destName: S.nav.dest.name, destLat: S.nav.dest.lat, destLon: S.nav.dest.lon });
    if (carSentRoute !== S.nav.R) { carSentRoute = S.nav.R; st.routeId = uuid(); st.route = S.nav.R.coords.map((c) => [+c.lon.toFixed(6), +c.lat.toFixed(6)]); }
  } else if (carSentRoute) { carSentRoute = null; st.routeId = ''; st.route = []; }
  CAR.update(st).catch(() => {});
}
if (CAR) {
  CAR.addListener('carConnected', (e) => { carOn = !!(e && e.connected); carSentRoute = null; carSync(true); });
  CAR.status().then((r) => { carOn = !!(r && r.connected); carSync(true); }).catch(() => {});
  CAR.addListener('carAction', async (a) => {
    if (!a) return;
    if (a.action === 'stop') { stopNav(); return; }
    if (a.action === 'alert') { if (S.pos && ALERT_TYPES[a.type]) { sendAlert(a.type, S.pos); say(I18N.t('Alerte envoyée')); } return; }
    if (a.action === 'go') {
      const dest = { name: a.name || '', sub: a.sub || '', lat: +a.lat, lon: +a.lon };
      if (!S.pos) { toast("J'attends ta position GPS pour calculer le trajet…"); return; }
      try { remember(dest); setDestMarker(dest); if (S.nav) stopNav(true); const R = await fetchRoute(S.pos, dest); closeSheet(); startNav(R, dest); }
      catch (e) { toast('Impossible de calculer le trajet pour le moment. Vérifie ta connexion et réessaie.'); }
    }
  });
}
$('btnStop').onclick = () => stopNav();
/* Barre du bas : si les boutons ne tiennent pas (petit écran, grande taille de texte, langue longue), « Arrêter » devient une croix */
function fitNavbar() {
  const n = $('navBar'); if (!n || n.hidden) return;
  n.classList.remove('tight', 'wrapb');
  const over = () => n.scrollWidth > n.clientWidth + 1 || [...n.querySelectorAll('button')].some((b) => b.getBoundingClientRect().right > window.innerWidth - 2);
  if (over()) n.classList.add('tight');
  if (over()) n.classList.add('wrapb');
}
try { new ResizeObserver(fitNavbar).observe($('navBar')); } catch (e) { /* */ }
window.addEventListener('resize', () => setTimeout(fitNavbar, 50));
new MutationObserver(() => setTimeout(fitNavbar, 30)).observe($('navBar'), { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });
$('btnOverview').onclick = () => { if (S.nav) { stopFollow(); fitRoute(S.nav.R); } };
$('btnMute').onclick = () => {
  S.settings.voice = !S.settings.voice; saveSettings();
  if (S.settings.voice) unlockVoice();
  $('btnMute').classList.toggle('muted', !S.settings.voice);
  $('btnMute').setAttribute('aria-label', S.settings.voice ? 'Couper la voix' : 'Activer la voix');
  toast(S.settings.voice ? 'Voix activée.' : 'Voix coupée.');
};

function pointAt(R, along) {
  const c = R.cum, n = R.coords.length;
  if (along <= 0) return R.coords[0];
  if (along >= c[n - 1]) return R.coords[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= along) lo = m; else hi = m; }
  const t = (along - c[lo]) / ((c[hi] - c[lo]) || 1), A = R.coords[lo], B = R.coords[hi];
  return { lat: A.lat + (B.lat - A.lat) * t, lon: A.lon + (B.lon - A.lon) * t };
}
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
  if (N.lastP) { const dd = dist(N.lastP, S.pos); if (dd < 500) N.trav = (N.trav || 0) + dd; }
  N.lastP = S.pos;
  const R = N.R;
  let pr = project(R, S.pos, N.seg - 3, N.seg + 300);
  if (pr.d > 40) pr = project(R, S.pos, 0, R.coords.length - 1);
  if (pr.d > 55 && (S.acc || 0) < 60) {
    N.offCount++;
    if (N.offCount >= 3 && Date.now() - N.lastReroute > 12000) { reroute(); return; }
  } else N.offCount = 0;
  N.along = pr.along; N.seg = pr.seg;
  if (pr.d < 30 && (S.acc || 0) < 60) {
    const P0 = pointAt(R, N.along), P1 = pointAt(R, N.along + 40);
    N.snap = { lat: P0.lat, lon: P0.lon, heading: dist(P0, P1) > 5 ? bearing(P0, P1) : S.heading, t: Date.now() };
  } else N.snap = null;
  renderMe();
  drawRoute(R, pr.seg);

  const remaining = Math.max(0, R.total - N.along);
  if (remaining < 30) { arrive(); return; }

  let i = R.stepEnds.findIndex((e) => e > N.along + 3);
  if (i < 0) i = R.steps.length - 1;
  const next = R.steps[i + 1] || R.steps[i];
  const toNext = Math.max(0, R.stepEnds[i] - N.along);
  $('navDist').textContent = fmtDist(toNext);
  $('navInstr').textContent = stepText(next);
  $('navArrow').innerHTML = stepArrow(next);
  const after = R.steps[i + 2];
  if (after && next && next.distance < 200) { $('navThen').hidden = false; $('navThen').innerHTML = esc(I18N.t('Puis')) + ' ' + stepArrow(after) + '<span>' + esc(stepText(after).replace(/^./, (c) => c.toLowerCase())) + '</span>'; }
  else $('navThen').hidden = true;

  const kmh = (S.speed || 0) * 3.6;
  const key = i + 1; const sp = N.spoken[key] || (N.spoken[key] = {});
  const txt = stepText(next);
  if (!sp.far && kmh > 70 && toNext < 1100 && toNext > 650) { sp.far = true; say('Dans ' + fmtDist(toNext).replace(',', ' virgule ') + ', ' + txt.toLowerCase()); }
  else if (!sp.mid && toNext <= 400 && toNext > 120) { sp.mid = sp.far = true; say('Dans ' + fmtDist(toNext) + ', ' + txt.toLowerCase()); }
  else if (!sp.near && toNext <= 90 && next.maneuver.type !== 'arrive') { sp.near = sp.mid = sp.far = true; say(txt); }

  const remTime = R.duration * (remaining / R.total);
  N.car = { instr: stepText(next), icon: stepIcon(next), dist: Math.round(toNext), stepKey: String(i + 1), remaining: Math.round(remaining), remTime: Math.round(remTime) };
  carSync(false);
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
    const hd = S.heading != null && (S.speed || 0) > 2.5 ? Math.round(S.heading) : null; // le nouveau calcul part dans le sens où roule la voiture (pas de demi-tour inutile)
    const R = await fetchRoute(Object.assign({}, S.pos, { hd }), N.dest);
    if (!S.nav) return;
    Object.assign(S.nav, { R, along: 0, seg: 0, spoken: {}, snap: null, offCount: 0 });
    drawRoute(R, 0); checkRoundabouts(R); navUpdate();
  } catch (e) { toast("Impossible de recalculer pour l'instant. On réessaie."); }
}
function arrive() {
  const name = S.nav.dest.name;
  const arrDest = Object.assign({}, S.nav.dest, { mode: S.nav.mode || 'car' });
  say('Vous êtes arrivé.');
  S.nav.arrived = true;
  stopNav(true);
  if (window.ROUTA_X && ROUTA_X.arrived) ROUTA_X.arrived(arrDest);
  openSheet(I18N.t('Destination atteinte'), '<p>' + esc(name) + '</p><div class="row"><button class="btn soft grow" id="arrSpot">' + ic('spot') + 'Ajouter en spot</button><button class="btn soft grow" id="arrPark">' + ic('parking') + 'Parkings autour</button></div><button class="btn ghost" id="arrFb">Un souci pendant ce trajet ? Dis-le-nous</button>', 'arrive');
  $('arrFb').onclick = () => openFeedback({ kind: 'bug', page: 'navigation' });
  $('arrSpot').onclick = () => openAddSpot(S.pos);
  $('arrPark').onclick = () => openPoiList('parking');
}

/* Écran allumé pendant la navigation */
/* Écran allumé uniquement quand ROUTA est au premier plan avec une navigation en cours (le système le relâche en arrière-plan) */
const KA = () => { const C = window.Capacitor; return C && C.Plugins && C.Plugins.KeepAwake; };
async function requestWake() {
  try { if (S.nav && KA()) await KA().keepAwake(); } catch (e) { /* */ }
  try { if (S.nav && RMP()) RMP().keepAwake().catch(() => { /* ancienne version de l'app */ }); } catch (e) { /* */ }
  try {
    if (!('wakeLock' in navigator) || !S.nav || document.visibilityState !== 'visible') return;
    if (S.wakeLock && !S.wakeLock.released) return;
    const w = await navigator.wakeLock.request('screen');
    S.wakeLock = w;
    w.addEventListener('release', () => { if (S.wakeLock === w) S.wakeLock = null; setTimeout(() => { if (S.nav && document.visibilityState === 'visible') requestWake(); }, 1500); });
  } catch (e) { /* refusé (économie d'énergie…) */ }
}
function releaseWake() { const w = S.wakeLock; S.wakeLock = null; try { w && w.release(); } catch (e) { /* */ } try { if (KA()) KA().allowSleep(); } catch (e) { /* */ } try { if (RMP()) RMP().allowSleep().catch(() => { /* */ }); } catch (e) { /* */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.nav) requestWake(); });

/* ======================= Essence / recharge / parking ======================= */
const OVERPASS_FILTER = {
  fuel: ['["amenity"="fuel"]'],
  charge: ['["amenity"="charging_station"]'],
  parking: ['["amenity"="parking"]["access"!~"^(private|no|customers|permissive_no)$"]'],
  food: ['["amenity"~"^(restaurant|fast_food|cafe)$"]'],
  shops: ['["shop"~"^(supermarket|convenience|bakery|kiosk|butcher|deli|mall|department_store|car_parts|car_repair|tyres|hardware|doityourself)$"]'],
  hospital: ['["amenity"="hospital"]'],
  pharmacy: ['["amenity"="pharmacy"]'],
  wc: ['["amenity"="toilets"]["access"!~"^(private|no)$"]'],
  truckstop: ['["amenity"="parking"]["hgv"~"^(yes|designated)$"]', '["highway"~"^(rest_area|services)$"]', '["amenity"="fuel"]["hgv"~"^(yes|designated)$"]']
};
const KIND_LABEL = { hospital: 'Hôpitaux', pharmacy: 'Pharmacies', wc: 'WC', fuel: 'Essence', charge: 'Recharge', parking: 'Parking', food: 'Restos', shops: 'Magasins', truckstop: 'Aires poids lourds', place: 'Lieu' };
const KIND_COLOR = { hospital: '#E5484D', pharmacy: '#16A05A', wc: '#0E7C86', fuel: 'var(--alert)', charge: 'var(--ok)', parking: 'var(--info)', food: '#FF9DA1', shops: '#C9A2FF', truckstop: '#7FE0C2', place: '#F2F4F7' };
const KIND_RADIUS = { hospital: 30000, pharmacy: 5000, wc: 2500, fuel: 6000, charge: 6000, parking: 2500, food: 2000, shops: 2500, truckstop: 20000 };
const RATED = { food: 1, shops: 1, truckstop: 1, fuel: 1, parking: 1, charge: 1, place: 1, wc: 1 };
const SHOP_FR = { supermarket: 'Supermarché', convenience: 'Épicerie', bakery: 'Boulangerie', kiosk: 'Kiosque', butcher: 'Boucherie', deli: 'Traiteur', mall: 'Centre commercial', department_store: 'Grand magasin', car_parts: 'Pièces auto', car_repair: 'Garage', tyres: 'Pneus', hardware: 'Quincaillerie', doityourself: 'Bricolage' };
const CUISINE_FR = { pizza: 'Pizza', burger: 'Burger', kebab: 'Kebab', italian: 'Italien', turkish: 'Turc', chinese: 'Chinois', japanese: 'Japonais', sushi: 'Sushi', indian: 'Indien', thai: 'Thaï', french: 'Français', swiss: 'Suisse', regional: 'Régional', asian: 'Asiatique', mexican: 'Mexicain', lebanese: 'Libanais', portuguese: 'Portugais', spanish: 'Espagnol', greek: 'Grec', vietnamese: 'Vietnamien', chicken: 'Poulet', sandwich: 'Sandwichs', coffee_shop: 'Café', ice_cream: 'Glaces', steak_house: 'Grill', seafood: 'Fruits de mer', vegetarian: 'Végétarien', vegan: 'Végan' };
function parseOsm(e, kind) {
  const t = e.tags || {};
  const lat = e.lat != null ? e.lat : e.center && e.center.lat;
  const lon = e.lon != null ? e.lon : e.center && e.center.lon;
  const DEF = { fuel: 'Station-service', charge: 'Borne de recharge', parking: 'Parking', food: 'Restaurant', shops: SHOP_FR[t.shop] || 'Magasin', truckstop: t.highway === 'services' ? 'Aire de service' : t.highway === 'rest_area' ? 'Aire de repos' : t.amenity === 'fuel' ? 'Station poids lourds' : 'Parking poids lourds' };
  let name = t.name || t.brand || t.operator || DEF[kind] || (kind === 'hospital' ? 'Hôpital' : kind === 'pharmacy' ? 'Pharmacie' : kind === 'wc' ? 'WC public' : 'Lieu');
  if (kind === 'wc' && !t.name) name = 'WC public';
  if (t.brand && t.name && !t.name.toLowerCase().includes(t.brand.toLowerCase())) name = t.brand + ' · ' + t.name;
  const details = [];
  const osmClosed = /^(closed|off)$/i.test((t.opening_hours || '').trim());
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
  } else if (kind === 'hospital') {
    if (t.emergency === 'yes') details.push('Urgences');
  } else if (kind === 'pharmacy') {
    if (t.opening_hours === '24/7') details.push('24 h/24');
  } else if (kind === 'wc') {
    if (t.fee === 'yes') details.push(t.charge ? 'Payant · ' + t.charge : 'Payant'); else if (t.fee === 'no') details.push('Gratuit');
    if (t.access === 'customers') details.push('Réservé aux clients');
    if (t.wheelchair === 'yes') details.push('Accessible en fauteuil');
    if (t.changing_table === 'yes' || t.diaper === 'yes') details.push('Table à langer');
    if (t.opening_hours === '24/7') details.push('24 h/24');
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
  return { id: 'osm/' + e.type + '/' + e.id, name, lat, lon, details: [...new Set(details)].join(' · '), hours: t.opening_hours || '', tags: t, osmClosed };
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

/* #003 : prix officiels en France (prix-carburants.gouv.fr, données publiques sous Licence Ouverte). Aucun prix inventé. */
const inFR = (p) => p && p.lat > 41.2 && p.lat < 51.2 && p.lon > -5.3 && p.lon < 9.7;
async function attachOfficialFR(list) {
  const fr = list.filter(inFR); if (!fr.length) return;
  const groups = []; fr.forEach((p) => { const g = groups.find((x) => dist(x.c, p) < 15000); if (g) g.l.push(p); else if (groups.length < 4) groups.push({ c: p, l: [p] }); });
  const F = [['e10', 'SP95-E10'], ['sp95', 'SP95'], ['sp98', 'SP98'], ['gazole', 'Gazole'], ['e85', 'E85'], ['gplc', 'GPL']];
  await Promise.all(groups.map(async (g) => {
    const u = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&select=id,gazole_prix,gazole_maj,sp95_prix,sp95_maj,e10_prix,e10_maj,sp98_prix,sp98_maj,e85_prix,e85_maj,gplc_prix,gplc_maj,geom&where=' + encodeURIComponent("within_distance(geom, geom'POINT(" + g.c.lon.toFixed(5) + ' ' + g.c.lat.toFixed(5) + ")', 16km)");
    let rows = [];
    try { const j = await fetchJson(u, 8000); rows = (j.results || []).filter((r) => r.geom); } catch (e) { return; }
    g.l.forEach((p) => {
      let best = null, bd = 150; rows.forEach((r) => { const d = dist(p, { lat: r.geom.lat, lon: r.geom.lon }); if (d < bd) { bd = d; best = r; } });
      if (!best) return;
      p.offFR = F.filter(([k]) => best[k + '_prix'] != null).map(([k, n]) => ({ fuel: n, price: best[k + '_prix'], at: best[k + '_maj'] }));
      if (p.offFR.length && p.mainPrice == null) { const m = p.offFR[0]; p.mainPrice = m.price; p.mainFuel = m.fuel; p.priceAt = m.at; p.priceLabel = Number(m.price).toFixed(2); }
    });
  }));
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
  if (kind === 'fuel') { await attachPrices(list); await attachOfficialFR(list); }
  if (RATED[kind]) await attachRatings(list);
  renderPoiList(kind, list, c);
}
/* Hôpitaux et pharmacies : le plus proche ouvert en premier */
function hospScore(p) {
  const t = p.tags || {}; const n = (p.name || '') + ' ' + (t.official_name || ''); const sp = t['healthcare:speciality'] || '';
  if (/\bEMS\b|cabinet|ost[eé]o|physio|dentaire|v[ée]t[ée]rinaire|psychiatr/i.test(n + ' ' + sp)) return 1e7;
  if (/h[oô]pital|hospitalier|\bCHUV\b|\bHUG\b|\beHnv\b|\bHFR\b|\bHRC\b|\bGHOL\b|\bRHNe\b|Kantonsspital|Spital/i.test(n)) return 0;
  if (t.emergency === 'yes' && !sp) return 600;
  if (/intensive/.test(sp)) return 1500;
  if (t.emergency === 'yes') return 2500;
  return 4000;
}
function healthStatus(p, kind) {
  const t = p.tags || {};
  if (kind === 'hospital') {
    if (t.emergency === 'yes') return { open: true, txt: 'Urgences 24 h/24' };
    if (hospScore(p) === 0) return { open: true, txt: 'Hôpital' };
  }
  return ohStatus(ohParse(p.hours));
}
function renderHealthList(kind, list) {
  let sorted;
  list.forEach((p) => { p.st = healthStatus(p, kind); });
  if (kind === 'hospital') {
    sorted = list.filter((p) => hospScore(p) < 1e7).sort((a, b) => (a.dist + hospScore(a)) - (b.dist + hospScore(b)));
  } else {
    list.forEach((p) => { p.rank = p.st ? (p.st.open ? 0 : 2) : 1; });
    sorted = list.slice().filter((p) => kind !== 'wc' || !S.wcFree || (p.tags || {}).fee !== 'yes').sort((a, b) => a.rank - b.rank || a.dist - b.dist);
  }
  sorted = sorted.slice(0, 40);
  showPois(sorted, kind);
  const body = $('sheetBody');
  let html = '';
  const anyOpen = sorted.some((p) => p.st && p.st.open);
  const best = kind === 'hospital' ? sorted[0] : (sorted.find((p) => p.st && p.st.open) || sorted[0]);
  if (best) {
    const head = kind === 'hospital' ? 'Hôpital le plus proche' : (best.st && best.st.open ? 'Le plus proche ouvert' : 'Le plus proche');
    html += '<div class="banner">' + ic(kind) + '<span><b>' + head + '</b><br>' + esc(best.name) + ' · ' + fmtDist(best.dist) + (best.st ? ' · ' + esc(best.st.txt) : '') + '</span></div>';
    html += '<button class="btn block" id="hGo">' + ic('nav') + 'Y aller</button>';
  }
  if (kind === 'wc') html = '<div class="seg" id="wcSeg"><button data-f="0" class="' + (S.wcFree ? '' : 'on') + '">Tous</button><button data-f="1" class="' + (S.wcFree ? 'on' : '') + '">Gratuits</button></div>' + html;
  if (kind === 'pharmacy' && !anyOpen) html += '<div class="banner">' + ic('info') + '<span><b>Aucune pharmacie ouverte trouvée</b><br>' + (best && inVaud(best) ? 'Pour la pharmacie de garde, appelle la Centrale des médecins de garde : <a href="tel:0848133133">0848 133 133</a> (Vaud).' : 'Cherche la pharmacie de garde de la région (affichée sur la porte des pharmacies ou sur le site officiel local).') + '</span></div>';
  if (kind === 'hospital' && best && inVaud(best)) html += medigoBlock();
  if (!sorted.length) html += '<div class="empty">Rien trouvé dans ce coin. Déplace la carte et réessaie.</div>';
  html += sorted.map((p, i) => '<button class="card tap" data-i="' + i + '"><div class="ico" style="background:' + KIND_COLOR[kind] + '">' + ic(kind) + '</div><div class="grow"><b>' + esc(p.name) + '</b><div class="sub">' +
    (p.st ? '<span class="' + (p.st.open ? 'oh-open' : 'oh-closed') + '">' + esc(p.st.txt) + '</span>' + (kind === 'wc' && p.details ? ' · ' + esc(p.details) : '') : esc(p.details || 'Horaires inconnus')) + '</div></div><div class="val"><small>' + fmtDist(p.dist) + '</small></div></button>').join('');
  html += '<p class="muted small">Lieux et horaires : OpenStreetMap, parfois pas à jour. En cas d\'urgence vitale : ' + (best && !inCH(best) ? '112' : '144') + '.</p>';
  body.innerHTML = html;
  const g = body.querySelector('#hGo'); if (g) g.onclick = () => { closeSheet(); chooseDestination({ name: best.name, sub: KIND_LABEL[kind], lat: best.lat, lon: best.lon }); };
  body.querySelectorAll('.card').forEach((b) => { b.onclick = () => openPoi(sorted[+b.dataset.i], kind); });
  body.querySelectorAll('#wcSeg button').forEach((b) => { b.onclick = () => { S.wcFree = b.dataset.f === '1'; renderHealthList(kind, list); }; });
  S.lastPoiList = { kind, list };
}
function renderPoiList(kind, list, c) {
  if (S.sheetView !== 'poi-' + kind) return;
  if (kind === 'hospital' || kind === 'pharmacy' || kind === 'wc') { renderHealthList(kind, list); return; }
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
/* Erreur de carte (adresse, lieu, entrée, sens unique, route, restriction) : passe par « Donner mon avis », avec la position */
function mapErrBtn(body, p, name) {
  const b = el('<button class="btn ghost" id="mapErr">' + esc(I18N.t('Signaler une erreur sur la carte')) + '</button>');
  b.onclick = () => openFeedback({ kind: 'bug', page: 'erreur carte ' + p.lat.toFixed(5) + ',' + p.lon.toFixed(5), text: (name ? name + ' · ' : '') + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + '\n' + I18N.t('Ce qui est faux (adresse, lieu, entrée, sens unique, route, restriction) :') + ' ' });
  body.appendChild(b);
}
function openPoi(p, kind) {
  const d = S.pos ? fmtDist(dist(S.pos, p)) : '';
  let html = '<div class="row"><div class="ico" style="background:' + KIND_COLOR[kind] + '">' + ic(kind) + '</div><div class="grow"><div class="muted small">' + esc(KIND_LABEL[kind]) + (d ? ' · ' + d : '') + '</div><div>' + esc(p.details || '') + '</div>' + '</div></div>' + placeInfoHtml(p);
  if (S.settings.googleLinks) html += '<a class="btn soft block gbtn" href="' + esc(googleUrl(p)) + '" target="_blank" rel="noopener">' + ic('star') + 'Voir les avis Google</a>';
  if (kind === 'fuel') {
    html += '<h3>Prix signalés</h3>' + ((p.prices && p.prices.length) ? p.prices.map((r) => '<div class="card"><div class="grow"><b>' + esc(r.fuel) + '</b><div class="sub">' + ago(r.created_at) + '</div></div><div class="val">' + Number(r.price).toFixed(2) + ' <small>CHF/L</small></div></div>').join('') : '<div class="empty">Aucun prix signalé. Sois le premier !</div>');
    if (p.offFR && p.offFR.length) html += '<h3>' + esc(I18N.t('Prix officiels (France)')) + '</h3>' + p.offFR.map((r) => '<div class="card"><div class="grow"><b>' + esc(r.fuel) + '</b><div class="sub">' + (r.at ? ago(r.at) : '') + '</div></div><div class="val">' + Number(r.price).toFixed(3) + ' <small>€/L</small></div></div>').join('') + '<p class="muted small">' + esc(I18N.t('Source : prix-carburants.gouv.fr (données publiques). Le prix affiché à la pompe fait foi.')) + '</p>';
    html += '<button class="btn soft block" id="poiPrice">Signaler un prix</button>';
  }
  if (RATED[kind]) {
    html += '<h3>Avis des testeurs</h3>' + (p.rating != null ? '<div class="row"><span class="stars-big">' + starsTxt(p.rating) + '</span><span class="muted">' + p.ratingCount + ' avis</span></div>' : '') +
      ((p.reviews && p.reviews.length) ? p.reviews.slice().sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at)).slice(0, 8).map((r) => '<div class="card"><div class="grow"><b>' + '★'.repeat(r.stars) + '<span class="muted">' + '★'.repeat(5 - r.stars) + '</span></b>' + (ctrlSafe(r.comment) ? '<div>' + esc(r.comment) + '</div>' : '') + '<div class="sub">' + esc(r.pseudo || 'Testeur') + ' · ' + ago(r.created_at) + '</div></div></div>').join('') : '<div class="empty">Pas encore d\'avis. Donne le tien !</div>') +
      '<button class="btn soft block" id="poiRate">' + ic('star') + 'Noter cet endroit</button>';
  }
  html += '<button class="btn block" id="poiGo">' + ic('nav') + 'Y aller</button>';
  html += '<button class="btn soft block" id="poiFav">' + ic('star') + (favAt(p, 25) ? 'Dans tes favoris' : 'Enregistrer en favori') + '</button>';
  const body = openSheet(p.name, html, 'poi');
  if (kind === 'hospital' && inVaud(p)) body.insertAdjacentHTML('afterbegin', medigoBlock());
  const rb = body.querySelector('#poiRate'); if (rb) rb.onclick = () => openRateForm(p, kind);
  body.querySelector('#poiGo').onclick = () => { closeSheet(); chooseDestination({ name: p.name, sub: KIND_LABEL[kind], lat: p.lat, lon: p.lon }); };
  body.querySelector('#poiFav').onclick = () => addFav({ name: p.name, addr: p.addr || '', lat: p.lat, lon: p.lon });
  if (window.ROUTA_X && ROUTA_X.poiExtra) ROUTA_X.poiExtra(p, kind, body);
  closedBlock(body, p);
  mapErrBtn(body, p, p.name);
  const pb = body.querySelector('#poiPrice'); if (pb) pb.onclick = () => openPriceForm(p);
}
/* #067 Lieux temporairement fermés : on n'affirme rien sans source (OpenStreetMap ou signalements confirmés de conducteurs) */
const CLOSED_TTL = 7 * 86400000;
function closedFor(p) {
  return [...S.closed.values()].filter((c) => Date.parse(c.expires_at) > Date.now() && (c.denies || 0) < (c.confirms || 1) && dist(c, p) < 60 && (!c.comment || !p.name || c.comment === p.name)).sort((a, b) => (b.confirms || 1) - (a.confirms || 1))[0] || null;
}
function closedBlock(body, p) {
  const c = closedFor(p);
  const box = el('<div class="closedbox"></div>');
  if (p.osmClosed) box.appendChild(el('<div class="banner warnb">' + ic('info') + '<span><b>' + esc(I18N.t('Indiqué fermé')) + '</b> · ' + esc(I18N.t('source : OpenStreetMap, peut ne pas être à jour.')) + '</span></div>'));
  if (c) {
    const n = c.confirms || 1;
    box.appendChild(el('<div class="banner warnb">' + ic('info') + '<span><b>' + esc(I18N.t('Signalé fermé temporairement')) + '</b> · ' + esc(I18N.t('par {n} conducteur(s), {t}. Non vérifié par ROUTA.').replace('{n}', n).replace('{t}', I18N.t(ago(c.created_at)))) + '</span></div>'));
    if (c.created_by !== S.me.id && !votedAlerts.has(c.id)) {
      const row = el('<div class="row"><button class="btn soft grow" data-v="1">' + esc(I18N.t('Toujours fermé')) + '</button><button class="btn soft grow" data-v="0">' + esc(I18N.t('C\'est rouvert')) + '</button></div>');
      row.querySelectorAll('button').forEach((b) => { b.onclick = () => {
        votedAlerts.add(c.id); store.set('routa.voted', [...votedAlerts].slice(-300));
        if (b.dataset.v === '1') DB.updateClosed(c.id, { confirms: n + 1, expires_at: new Date(Math.max(Date.parse(c.expires_at), Date.now() + CLOSED_TTL)).toISOString() });
        else { const d = (c.denies || 0) + 1; DB.updateClosed(c.id, d >= n ? { denies: d, expires_at: new Date().toISOString() } : { denies: d }); }
        toast(I18N.t('Merci, c\'est noté.')); row.remove();
      }; });
      box.appendChild(row);
    }
  } else {
    const b = el('<button class="btn ghost">' + esc(I18N.t('Signaler fermé temporairement')) + '</button>');
    b.onclick = async () => {
      const a = { id: uuid(), type: 'lieu_ferme', lat: p.lat, lon: p.lon, comment: (p.name || '').slice(0, 80) || null, created_by: S.me.id, created_name: S.me.pseudo, confirms: 1, denies: 0, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + CLOSED_TTL).toISOString() };
      if (await DB.addClosed(a)) { toast(I18N.t('Merci ! Les autres conducteurs pourront le confirmer.')); b.remove(); } else toast(I18N.t('Envoi impossible pour le moment. Réessaie plus tard.'));
    };
    box.appendChild(b);
  }
  // fermeture connue : visible tout de suite, sous le nom du lieu
  if (c || p.osmClosed) body.insertBefore(box, body.children[1] || null); else body.appendChild(box);
}
/* ======================= Tous les établissements ======================= */
const POI_LAYERS = ['poi_r1', 'poi_r7', 'poi_r20'];
const SUB_FR = { restaurant: 'Restaurant', fast_food: 'Fast-food', cafe: 'Café', bar: 'Bar', pub: 'Pub', beer: 'Bar', ice_cream: 'Glacier', bakery: 'Boulangerie', supermarket: 'Supermarché', grocery: 'Épicerie', convenience: 'Épicerie', butcher: 'Boucherie', pharmacy: 'Pharmacie', bank: 'Banque', atm: 'Bancomat', fuel: 'Station-service', parking: 'Parking', hotel: 'Hôtel', motel: 'Motel', clothes: 'Vêtements', clothing_store: 'Vêtements', shoes: 'Chaussures', hairdresser: 'Coiffeur', beauty: 'Institut de beauté', car_repair: 'Garage', car: 'Concession auto', car_wash: 'Lavage auto', car_parts: 'Pièces auto', tyres: 'Pneus', doctors: 'Médecin', dentist: 'Dentiste', hospital: 'Hôpital', clinic: 'Clinique', post_office: 'Poste', school: 'École', kindergarten: 'Crèche', college: 'Haute école', university: 'Université', place_of_worship: 'Lieu de culte', museum: 'Musée', cinema: 'Cinéma', theatre: 'Théâtre', library: 'Bibliothèque', florist: 'Fleuriste', kiosk: 'Kiosque', mobile_phone: 'Téléphonie', electronics: 'Électronique', computer: 'Informatique', hardware: 'Quincaillerie', doityourself: 'Bricolage', optician: 'Opticien', laundry: 'Laverie', dry_cleaning: 'Pressing', bicycle: 'Vélos', books: 'Librairie', jewelry: 'Bijouterie', alcohol: 'Boissons', alcohol_shop: 'Boissons', beverages: 'Boissons', department_store: 'Grand magasin', mall: 'Centre commercial', furniture: 'Meubles', garden_centre: 'Jardinerie', toys: 'Jouets', sports: 'Sport', pet: 'Animalerie', veterinary: 'Vétérinaire', police: 'Police', townhall: 'Administration', fire_station: 'Pompiers', attraction: 'Attraction', viewpoint: 'Point de vue', gym: 'Salle de sport', fitness_centre: 'Salle de sport', swimming_pool: 'Piscine', stadium: 'Stade', park: 'Parc', playground: 'Place de jeux', charging_station: 'Borne de recharge', tobacco: 'Tabac', deli: 'Traiteur', chemist: 'Droguerie', variety_store: 'Bazar', gift: 'Cadeaux', travel_agency: 'Agence de voyage', estate_agent: 'Immobilier', insurance: 'Assurance', lawyer: 'Avocat', dentist_office: 'Dentiste', parcel_locker: 'Casier à colis', post_box: 'Boîte aux lettres', vending_machine: 'Distributeur', toilets: 'Toilettes', drinking_water: 'Fontaine', recycling: 'Recyclage', bicycle_parking: 'Parking vélos', bicycle_rental: 'Location de vélos', information: 'Information', fountain: 'Fontaine', marketplace: 'Marché', nightclub: 'Discothèque', casino: 'Casino', bus: 'Arrêt de bus', rail: 'Gare', taxi: 'Taxi', car_rental: 'Location de voitures', hostel: 'Auberge', guest_house: 'Maison d\'hôtes', camp_site: 'Camping', caravan_site: 'Aire de camping-cars', motorcycle: 'Motos', music: 'Musique', photo: 'Photo', stationery: 'Papeterie', newsagent: 'Kiosque', pastry: 'Pâtisserie', confectionery: 'Confiserie', cheese: 'Fromagerie', wine: 'Vins', seafood: 'Poissonnerie', greengrocer: 'Primeur', tailor: 'Retouches', massage: 'Massage', tattoo: 'Tatouage', nails: 'Onglerie' };
const FOOD_CLS = /^(restaurant|fast_food|cafe|bar|beer|pub|ice_cream|food_court|biergarten)$/;
const SHOP_CLS = /^(shop|grocery|bakery|butcher|alcohol_shop|clothing_store|jewelry|furniture|hardware|car|bicycle|books|florist|supermarket|convenience|electronics|mobile_phone|shoes|toys|sports|pet|garden_centre|department_store|mall|doityourself|optician|deli|kiosk|gift|variety_store|computer|chemist|beauty|hairdresser|laundry|tobacco)$/;
/* Arrêts de bus et de tram : masqués par défaut, prochains départs au toucher */
const TRANSIT_STOP = ['any', ['==', ['get', 'class'], 'bus'], ['==', ['get', 'class'], 'railway'], ['==', ['get', 'class'], 'rail'], ['==', ['get', 'class'], 'ferry_terminal'], ['==', ['get', 'subclass'], 'bus_stop'], ['==', ['get', 'subclass'], 'bus_station'], ['==', ['get', 'subclass'], 'tram_stop'], ['==', ['get', 'subclass'], 'subway'], ['==', ['get', 'subclass'], 'station'], ['==', ['get', 'subclass'], 'halt']];
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
  // #046 : arrêt trouvé une seule fois, départs rafraîchis toutes les 30 s, filtre par ligne, retards et changements de voie
  let st = null, filt = null;
  const load = async () => {
    let html = '';
    try {
      if (!st) {
        const loc = await fetch('https://transport.opendata.ch/v1/locations?x=' + g[1] + '&y=' + g[0] + '&type=station').then((r) => r.json());
        st = (loc.stations || []).filter((x) => x.id).sort((a, b) => (a.distance || 0) - (b.distance || 0))[0];
        if (!st || (st.distance || 0) > 400) { st = null; throw new Error('loin'); }
      }
      const sb = await fetch('https://transport.opendata.ch/v1/stationboard?id=' + st.id + '&limit=24').then((r) => r.json());
      const now = Date.now();
      const linesSeen = [];
      const rows = (sb.stationboard || []).map((d) => {
        const t = d.stop && d.stop.departure ? new Date(d.stop.departure.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) : null;
        if (!t || isNaN(t)) return '';
        const delay = +(d.stop.delay || 0);
        const m = Math.round((t.getTime() + delay * 60000 - now) / 60000);
        if (m < -1) return '';
        const cat = String(d.category || '').trim(); const num = String(d.number || '').trim();
        const train = !LINE_ONLY.test(cat);
        const line = train ? cat + (num && num.length < 4 ? num : '') : (num || cat);
        if (!linesSeen.some((x) => x[0] === line)) linesSeen.push([line, train]);
        if (filt && filt !== line) return '';
        const hm = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
        const when = m <= 0 ? '<b>' + esc(I18N.t('maintenant')) + '</b>' : m < 60 ? '<b>' + m + ' min</b>' : '<b>' + hm + '</b>';
        const pf0 = d.stop.platform, pf1 = d.stop.prognosis && d.stop.prognosis.platform;
        const pfTxt = pf1 && pf1 !== pf0 ? '<small class="pfchg"> · <span>' + esc(I18N.t('voie')) + '</span> ' + esc(pf1) + ' (' + esc(I18N.t('changement')) + ')</small>' : pf0 ? '<small class="muted"> · <span>' + esc(I18N.t('voie')) + '</span> ' + esc(pf0) + '</small>' : '';
        return '<li class="dep"><span class="ln' + (train ? ' train' : '') + '">' + esc(line) + '</span><span class="to">' + esc(d.to || '') + pfTxt + '</span><span class="tm">' + when + (delay > 0 ? '<small class="late">+' + delay + '</small>' : '') + '</span></li>';
      }).filter(Boolean);
      const chips = linesSeen.length > 1 ? '<div class="row wrap depfilt">' + '<button class="pill' + (!filt ? ' on' : '') + '" data-l="">' + esc(I18N.t('Toutes')) + '</button>' + linesSeen.slice(0, 12).map(([l, tr]) => '<button class="pill' + (filt === l ? ' on' : '') + '" data-l="' + esc(l) + '">' + esc(l) + '</button>').join('') + '</div>' : '';
      html = chips + (rows.length ? '<h3>Prochains départs</h3><ul class="deps">' + rows.slice(0, 14).join('') + '</ul>' : '<p class="muted">Aucun départ prévu pour le moment.</p>') + '<p class="muted small">' + esc(I18N.t('Mis à jour à {h}').replace('{h}', hhmm(new Date()))) + '</p>' + link + '<p class="muted small">Horaires en temps réel : opendata.ch</p>';
    } catch (e) {
      html = '<p class="muted">Horaires en direct indisponibles pour cet arrêt.</p>' + link;
    }
    if (token !== S.stopTok || S.sheetView !== 'poistop') return false;
    $('sheetBody').innerHTML = html;
    $('sheetBody').querySelectorAll('.depfilt button').forEach((b) => { b.onclick = () => { filt = b.dataset.l || null; load(); }; });
    return true;
  };
  if (await load()) {
    const iv = setInterval(async () => { if (token !== S.stopTok || S.sheetView !== 'poistop' || $('sheetWrap').hidden || !(await load())) clearInterval(iv); }, 30000);
  }
}
/* Lieux essentiels (hôpitaux, pharmacies, police) : toujours visibles et faciles à reconnaître */
const ESS = [
  { id: 'hosp', f: ['all', ['==', ['get', 'class'], 'hospital'], ['==', ['get', 'subclass'], 'hospital']], min: 11, lab: 13, fill: '#E5484D', ring: '#FFFFFF', glyph: '+', txt: '#C62828', big: 1.25 },
  { id: 'police', f: ['==', ['get', 'class'], 'police'], min: 13, lab: 15, fill: '#FFFFFF', ring: '#1E4FD8', icon: 'police', txt: '#1E4FD8' },
  { id: 'pharm', f: ['==', ['get', 'class'], 'pharmacy'], min: 14, lab: 16, fill: '#16A05A', ring: '#FFFFFF', glyph: '+', txt: '#0F7A43' },
  { id: 'wc', f: ['==', ['get', 'class'], 'toilets'], min: 14.5, lab: 99, fill: '#0E7C86', ring: '#FFFFFF', glyph: 'WC', gs: 0.5, txt: '#0E7C86' }
];
const ESS_ANY = ['any'].concat(ESS.map((k) => k.f));
const ESS_DOTS = ESS.map((k) => 'ess-' + k.id);
function setupEssentials() {
  try {
    if (!map.getSource('openmaptiles')) return;
    POI_LAYERS.concat(['poi_transit']).forEach((id) => { if (!map.getLayer(id)) return; const f = map.getFilter(id); map.setFilter(id, f ? ['all', f, ['!', ESS_ANY]] : ['!', ESS_ANY]); });
    const before = map.getLayer('route-casing') ? 'route-casing' : undefined;
    const pt = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
    ESS.forEach((k) => {
      const filt = ['all', pt, k.f];
      map.addLayer({ id: 'ess-' + k.id, type: 'circle', source: 'openmaptiles', 'source-layer': 'poi', minzoom: k.min, filter: filt,
        paint: { 'circle-color': k.fill, 'circle-radius': ['interpolate', ['linear'], ['zoom'], k.min, 7 * (k.big || 1), 15, 11 * (k.big || 1), 18, 15 * (k.big || 1)], 'circle-stroke-color': k.ring, 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], k.min, k.icon ? 2.5 : 1.5, 16, k.icon ? 4 : 3] } }, before);
      map.addLayer(k.icon
        ? { id: 'ess-' + k.id + '-g', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: k.min, filter: filt,
          layout: { 'icon-image': k.icon, 'icon-size': ['interpolate', ['linear'], ['zoom'], k.min, 0.6, 15, 0.95, 18, 1.3], 'icon-allow-overlap': true, 'icon-ignore-placement': true } }
        : { id: 'ess-' + k.id + '-g', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: k.min, filter: filt,
          layout: { 'text-field': k.glyph, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], k.min, 13 * (k.big || 1) * (k.gs || 1), 15, 19 * (k.big || 1) * (k.gs || 1), 18, 26 * (k.big || 1) * (k.gs || 1)], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-offset': [0, -0.05] },
          paint: { 'text-color': '#FFFFFF' } }, before);
      if (k.lab < 24) map.addLayer({ id: 'ess-' + k.id + '-n', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: k.lab, filter: filt,
        layout: { 'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 1.2], 'text-max-width': 9, 'text-optional': true },
        paint: { 'text-color': k.txt, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 } }, before);
    });
  } catch (e) { console.warn('lieux essentiels', e); }
  map.on('click', (e) => {
    if (e._routaDone || S.placing || S.nav) return;
    const layers = ESS_DOTS.filter((id) => map.getLayer(id));
    if (!layers.length) return;
    const pad = 26;
    const fs = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers });
    if (!fs.length) return;
    let best = fs[0], bd = Infinity;
    fs.forEach((f) => { const g = f.geometry && f.geometry.coordinates; if (!g) return; const p = map.project(g); const d = Math.hypot(p.x - e.point.x, p.y - e.point.y); if (d < bd) { bd = d; best = f; } });
    e._routaDone = true;
    if ((best.properties || {}).class === 'toilets') openWcAt(best.geometry.coordinates); else openPlace(best);
  });
}
async function openWcAt(g) {
  openSheet('WC public', '<p class="muted">Chargement…</p>', 'place');
  let p = null;
  try {
    const els = await overpass('[out:json][timeout:10];nwr(around:30,' + g[1] + ',' + g[0] + ')["amenity"="toilets"];out center tags 3;', inCH({ lat: g[1], lon: g[0] }));
    if (els && els.length) p = parseOsm(els[0], 'wc');
  } catch (e) { /* hors ligne */ }
  if (!p) p = { id: 'wc@' + g[1].toFixed(5) + ',' + g[0].toFixed(5), name: 'WC public', lat: g[1], lon: g[0], details: '', tags: {} };
  if (S.sheetView === 'place') openPoi(p, 'wc');
}
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const inVaud = (p) => p && p.lat > 46.18 && p.lat < 47.0 && p.lon > 6.06 && p.lon < 7.25;
function medigoBlock() {
  const url = IS_IOS ? 'https://apps.apple.com/ch/app/urgences-vaud/id1091227650' : 'https://medigo.ch/';
  return '<div class="banner">' + ic('clock') + '<span><b>Horaires et affluence en temps réel</b><br>Les horaires à jour et le temps d\'attente en direct des urgences vaudoises sont dans l\'app Medigo, plus fiable que nos horaires.</span></div>' +
    '<a class="btn soft block" target="_blank" rel="noopener" href="' + url + '">' + ic('clock') + 'Voir les horaires et l\'affluence sur Medigo</a>';
}
function setupPlaces() {
  setupTransit();
  setupEssentials();
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
  const name = pr['name:' + I18N.lang] || pr.name || pr['name:latin'] || I18N.t(label);
  const kind = FOOD_CLS.test(pr.class) || FOOD_CLS.test(sub) ? 'food' : pr.class === 'fuel' ? 'fuel' : pr.class === 'parking' ? 'parking' : (SHOP_CLS.test(pr.class) || SHOP_CLS.test(sub)) ? 'shops' : 'place';
  const p = { id: 'map/' + name.toLowerCase().replace(/\s+/g, ' ').trim() + '@' + g[1].toFixed(4) + ',' + g[0].toFixed(4), name, lat: g[1], lon: g[0], details: label };
  openSheet(name, '<p class="muted">Chargement…</p>', 'place');
  const [addr, tags] = await Promise.all([reverseAddr(p), fetchPlaceTags(p), attachRatings([p]).catch(() => {})]);
  if (tags) p.tags = tags;
  p.addr = addr;
  if (addr) p.details = label + ' · ' + addr;
  if (S.sheetView === 'place') {
    openPoi(p, kind);
    if (pr.class === 'hospital' && inVaud(p)) { const b = $('sheetBody'); if (b) b.insertAdjacentHTML('afterbegin', medigoBlock()); }
  }
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
    if (ctrlBlocked($('rateTxt').value)) { toast('Pas de mention de contrôles de police ou de radars : c\'est interdit en Suisse.'); return; }
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
    if (kind === 'fuel') { await attachPrices(list); await attachOfficialFR(list); }
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
  const moving = (S.speed || 0) * 3.6 > 15;
  const body = openSheet('Que se passe-t-il ?',
    (moving ? '<div class="banner proto">' + ic('info') + '<span>Au volant, ne touche pas ton téléphone : demande à un passager, utilise le micro ou arrête-toi.</span></div>' : '') +
    '<div class="grid4">' + Object.keys(ALERT_TYPES).map((k) => '<button class="typebtn" data-t="' + k + '">' + ic(k) + esc(ALERT_TYPES[k].label) + '</button>').join('') + '</div>' +
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
    if (!p) { toast("Position inconnue : place l'alerte sur la carte."); placePoint('Où est le problème ?', (pt) => sendAlert(type, pt)); return; }
    closeSheet();
    sendAlert(type, p);
  };
  $('repSend').onclick = () => send();
  const pl = $('repPlace'); if (pl) pl.onclick = () => { if (!type) { toast("Choisis d'abord le type d'alerte."); return; } const t = type; placePoint('Où est le problème ?', (pt) => sendAlert(t, pt)); };
  const vb = $('repVoice'); if (vb) vb.onclick = () => voiceReport(SR, at);
}
async function sendAlert(type, p) {
  // déjà signalé tout près (même type, moins de 150 m, encore actif) : on confirme l'alerte existante au lieu d'en créer une deuxième
  const dup = [...S.alerts.values()].find((x) => x.type === type && alertVisible(x) && dist(x, p) < 150);
  if (dup) {
    if (dup.created_by === S.me.id || votedAlerts.has(dup.id)) { toast(I18N.t('Déjà signalé ici. Merci !')); return; }
    voteAlert(dup.id, true, true); toast(I18N.t('Déjà signalé ici : ta confirmation a été ajoutée. Merci !')); return;
  }
  const a = { id: uuid(), type, lat: p.lat, lon: p.lon, comment: null, created_by: S.me.id, created_name: S.me.pseudo, confirms: 1, denies: 0, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + alertTtl(type)).toISOString() };
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
    if (hit) { closeSheet(); sendAlert(hit[0], at || S.pos); say('Alerte ' + ALERT_TYPES[hit[0]].say + ' envoyée'); }
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
    '<div class="row wrap"><span class="pill ' + alertReliability(a)[0] + '">' + esc(I18N.t(alertReliability(a)[1])) + '</span><span class="pill warn">' + esc(I18N.t('Signalé {t}').replace('{t}', I18N.t(ago(a.created_at)))) + '</span><span class="pill ok">' + esc(I18N.t('Confirmé {n} fois').replace('{n}', a.confirms || 1)) + '</span>' + ((a.denies || 0) ? '<span class="pill">' + esc(I18N.t('Plus là : {n}').replace('{n}', a.denies)) + '</span>' : '') + (S.pos ? '<span class="pill">' + fmtDist(dist(S.pos, a)) + '</span>' : '') + '</div>' +
    (a.created_name ? '<p class="muted small">Par ' + esc(a.created_name) + '</p>' : '') +
    (mine || votedAlerts.has(id) ? '<p class="muted small">' + esc(I18N.t(mine ? 'C\'est ton alerte : les autres conducteurs la confirment.' : 'Tu as déjà donné ton avis sur cette alerte.')) + '</p>' : '<div class="row"><button class="btn grow" id="aYes">Toujours là</button><button class="btn ghost grow" id="aNo">Plus là</button></div>') +
    (mine ? '<button class="btn danger" id="aDel">' + ic('trash') + 'Supprimer mon alerte</button>' : ''), 'alert');
  const yb = body.querySelector('#aYes'); if (yb) yb.onclick = () => { closeSheet(); voteAlert(id, true); };
  const nb = body.querySelector('#aNo'); if (nb) nb.onclick = () => { closeSheet(); voteAlert(id, false); };
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
  mapErrBtn(body, p, p.addr || '');
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
    (ctrlSafe(s.description) ? '<p>' + esc(s.description) + '</p>' : '') +
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
  const collect = () => { const name = $('spName').value.trim(); if (name.length < 2) { toast('Donne un nom au spot.'); return null; } if (ctrlBlocked(name, $('spDesc').value)) { toast('Pas de mention de contrôles de police ou de radars : c\'est interdit en Suisse.'); return null; } return { name, desc: $('spDesc').value.trim() }; };
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
function visLabel(v) { return v === 'invisible' ? 'Invisible' : 'Visible'; }
function setAvatar() {
  const b = $('btnProfile');
  b.firstChild.nodeType === 3 ? (b.firstChild.nodeValue = initials(S.me.pseudo)) : b.insertBefore(document.createTextNode(initials(S.me.pseudo)), b.firstChild);
  const cc = curColor(), ink = lum(cc) > 0.5 ? '#0E1116' : '#FFFFFF'; // même couleur que le curseur GPS
  b.style.background = cc; b.style.color = ink;
  const m = $('fabMenu'); if (m) { m.textContent = initials(S.me.pseudo); m.style.background = cc; m.style.color = ink; m.classList.toggle('ringed', lum(cc) < 0.2 || lum(cc) > 0.86); }
}
function updateVisChip() {
  if (S.me && S.me.vis === 'amis') { S.me.vis = 'invisible'; saveMe(); }
  const dot = $('visDot');
  dot.className = 'dot' + (S.me.vis === 'tous' ? ' on' : '');
  $('visLabel').textContent = visLabel(S.me.vis);
}
function visSeg(id) {
  return '<div class="seg" id="' + id + '">' + [['tous', 'Visible'], ['invisible', 'Invisible']].map(([k, v]) => '<button data-v="' + k + '" class="' + (S.me.vis === k ? 'on' : '') + '">' + v + '</button>').join('') + '</div>';
}
function bindVisSeg(root, id, after) {
  root.querySelectorAll('#' + id + ' button').forEach((b) => {
    b.onclick = () => {
      S.me.vis = b.dataset.v; saveMe(); updateVisChip(); pushPresence(true);
      root.querySelectorAll('#' + id + ' button').forEach((x) => x.classList.toggle('on', x === b));
      toast(S.me.vis === 'invisible' ? 'Tu es invisible.' : 'Les autres conducteurs voient seulement une zone d\'environ 1 km autour de toi.');
      if (after) after();
    };
  });
}
function openDriver(id) {
  const d = driversList().find((x) => x.id === id); if (!d) { toast("Ce conducteur n'est plus visible."); return; }
  const body = openSheet(d.pseudo,
    '<div class="row"><div class="ico" style="background:' + esc(d.color || '#FF8A3D') + ';border-radius:22px">' + esc(initials(d.pseudo)) + '</div><div class="grow"><b>' + esc(d.car || 'Voiture inconnue') + '</b><div class="sub">' + (d.fuzzy ? 'Zone approximative · ' : '') + (d.dist != null ? fmtDist(d.dist) : '') + ' · vu ' + ago(d.updated_at) + '</div></div></div>' +
    '<button class="btn soft block" id="dJoin">' + ic('nav') + 'Le rejoindre</button>' +
    '<button class="btn ghost" id="dReport">' + esc(I18N.t('Signaler ce pseudo')) + '</button>', 'driver');
  body.querySelector('#dReport').onclick = () => openFeedback({ kind: 'autre', page: 'signalement pseudo ' + d.id, text: I18N.t('Pseudo signalé :') + ' ' + (d.pseudo || '') + (d.car ? ' (' + d.car + ')' : '') + '\n' });
  body.querySelector('#dJoin').onclick = () => { closeSheet(); chooseDestination({ name: d.pseudo, sub: d.car || '', lat: d.vlat, lon: d.vlon }); };
}
function onIncoming(m) { /* bumps, amis et messages entre conducteurs retirés : rien à afficher */ }

/* Amis */

/* ======================= Mon véhicule ======================= */
function updateVehChip() {
  const v = veh();
  $('vehLabel').textContent = [S.vehicle.brand, S.vehicle.model].filter(Boolean).join(' ') || v.label;
  $('vehIco').innerHTML = ic(v.icon);
  document.querySelectorAll('.chip.heavy-only').forEach((c) => { c.hidden = !v.heavy; });
  document.querySelectorAll('.chip.ev-only').forEach((c) => { c.hidden = !v.ev; });
}
/* ======================= Mon véhicule : assistant type › marque › modèle › année › motorisation › version, plusieurs véhicules ======================= */
const ENERGIES = [['essence', 'Essence'], ['diesel', 'Diesel'], ['hybride', 'Hybride'], ['phev', 'Hybride rechargeable'], ['electrique', 'Électrique'], ['gaz', 'Gaz (GPL, GNV)']];
const CAR_TYPES = ['voiture', 'electrique', 'hybride'];
function loadVehicles() {
  let list = store.get('routa.vehicles', null);
  if (!Array.isArray(list) || !list.length) { list = [Object.assign({ id: uuid() }, S.vehicle)]; store.set('routa.vehicles', list); }
  return list;
}
function vehName(v) { return [v.brand, v.model].filter(Boolean).join(' ') || (VEHICLES[v.type] || VEHICLES.voiture).label; }
function useVehicle(v) {
  const list = loadVehicles(); const i = list.findIndex((x) => x.id === v.id);
  if (i >= 0) list[i] = v; else list.push(v);
  store.set('routa.vehicles', list); store.set('routa.vehicleId', v.id);
  S.vehicle = v; store.set('routa.vehicle', v);
  updateVehChip();
}
/* Finitions par marque (noms commerciaux de la marque, Europe) : seules celles de la marque choisie sont proposées. « Autre » pour tout le reste. */
const BRAND_TRIMS = {
  'Peugeot': ['Like', 'Active', 'Active Pack', 'Allure', 'Allure Pack', 'GT', 'GT Line', 'GT Pack', 'Style'],
  'Citroën': ['Feel', 'Feel Pack', 'Shine', 'Shine Pack', 'Live', 'You', 'Plus', 'Max', 'C-Series'],
  'DS': ['Bastille', 'Performance Line', 'Rivoli', 'Opéra', 'Pallas', 'Étoile'],
  'Opel': ['Edition', 'Elegance', 'GS', 'GS Line', 'Ultimate', 'Innovation'],
  'Renault': ['Life', 'Zen', 'Intens', 'Equilibre', 'Evolution', 'Techno', 'Iconic', 'Esprit Alpine', 'R.S. Line', 'R.S.'],
  'Dacia': ['Access', 'Essential', 'Expression', 'Comfort', 'Journey', 'Extreme', 'Prestige'],
  'Volkswagen': ['Trendline', 'Comfortline', 'Highline', 'Life', 'Style', 'Elegance', 'R-Line', 'GTI', 'GTD', 'GTE', 'R'],
  'Škoda': ['Active', 'Ambition', 'Style', 'Selection', 'Sportline', 'Monte Carlo', 'Scout', 'RS', 'Laurin & Klement'],
  'Seat': ['Reference', 'Style', 'Xcellence', 'FR'],
  'Cupra': ['VZ', 'VZ1', 'VZ2', 'VZ3'],
  'Audi': ['Attraction', 'Ambition', 'Ambiente', 'Advanced', 'Design', 'S line', 'Black Edition'],
  'BMW': ['Advantage', 'Sport Line', 'Luxury Line', 'Modern Line', 'M Sport', 'xLine'],
  'Mercedes-Benz': ['Style', 'Progressive', 'Avantgarde', 'Exclusive', 'AMG Line'],
  'Mini': ['Classic', 'Favoured', 'Essential', 'Classic Trim', 'JCW Trim', 'John Cooper Works'],
  'Toyota': ['Comfort', 'Active', 'Trend', 'Style', 'Premium', 'GR Sport', 'Lounge'],
  'Ford': ['Trend', 'Cool & Connect', 'Titanium', 'ST-Line', 'ST-Line X', 'Active', 'Vignale', 'ST'],
  'Fiat': ['Pop', 'Easy', 'Lounge', 'Cross', 'Sport', 'La Prima', 'Dolcevita'],
  'Hyundai': ['Origo', 'Amplia', 'Vertex', 'N Line', 'N'],
  'Kia': ['Power', 'Style', 'GT-Line', 'GT'],
  'Mazda': ['Prime-Line', 'Centre-Line', 'Exclusive-Line', 'Homura', 'Takumi', 'Ambition', 'Revolution'],
  'Nissan': ['Visia', 'Acenta', 'N-Connecta', 'N-Design', 'Tekna', 'Tekna+'],
  'Volvo': ['Kinetic', 'Momentum', 'Inscription', 'R-Design', 'Core', 'Plus', 'Ultimate'],
  'Tesla': ['Propulsion', 'Grande Autonomie', 'Performance'],
  'Suzuki': ['Unico', 'Compact', 'Compact+', 'Compact Top', 'Piz Sulai'],
  'Subaru': ['Advantage', 'Swiss two', 'Swiss four', 'Luxury'],
  'Jeep': ['Longitude', 'Limited', 'Trailhawk', 'Summit', 'Altitude'],
  'Alfa Romeo': ['Super', 'Sprint', 'Ti', 'Veloce', 'Quadrifoglio'],
  'Honda': ['Comfort', 'Elegance', 'Advance', 'Sport', 'Type R'],
  'Porsche': ['Base', 'S', 'GTS', 'Turbo', 'Turbo S', 'GT3'],
  'Land Rover': ['S', 'SE', 'HSE', 'Dynamic', 'Autobiography'],
  'MG': ['Comfort', 'Luxury'],
  'Lexus': ['Comfort', 'Executive', 'F Sport', 'Excellence']
};
function openVehicle(after, editId) {
  const list = loadVehicles();
  const curId = store.get('routa.vehicleId', list[0].id);
  const base = list.find((x) => x.id === (editId || curId)) || list[0];
  const V = JSON.parse(JSON.stringify(editId === 'new' || editId === 'rental' ? { id: uuid(), type: 'voiture', dims: {}, hazmat: false, rental: editId === 'rental' } : base));
  if (!V.id) V.id = uuid();
  const DB0 = window.ROUTA_VDB || {};
  const kind = () => (CAR_TYPES.includes(V.type) ? 'voiture' : V.type);
  const KINDS = Object.entries(VEHICLES).filter(([k]) => k !== 'electrique' && k !== 'hybride');
  const opt = (v, l, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(l) + '</option>';
  const yNow = new Date().getFullYear();
  const body = openSheet('Mon véhicule',
    (list.length > 1 || editId === 'new' ? '<h3>Mes véhicules <span class="prem">PRO</span></h3>' + list.map((x) => '<button class="card tap vehcard' + (x.id === V.id ? ' sel' : '') + '" data-vid="' + esc(x.id) + '"><span class="ico">' + ic((VEHICLES[x.type] || VEHICLES.voiture).icon) + '</span><span class="grow"><b>' + esc(vehName(x)) + '</b><span class="sub">' + esc([x.year, x.energy && (x.energy === 'essence' && I18N.lang !== 'fr' ? I18N.t('Essence (moteur)') : I18N.t((ENERGIES.find((e) => e[0] === x.energy) || [0, ''])[1])), x.rental ? I18N.t('location') : '', x.id === curId ? I18N.t('Véhicule actif') : ''].filter(Boolean).join(' · ')) + '</span></span></button>').join('') : '') +
    '<p class="muted small">Le trajet, les alertes et les lieux proposés s\'adaptent à ton véhicule.</p>' +
    '<button class="card tap" id="vehLic"><span class="ico">' + ic('info') + '</span><span class="grow"><b>' + esc(I18N.t('Mon permis de conduire')) + '</b><span class="sub">' + esc(licSummary() || I18N.t('Catégories, pays, date')) + '</span></span></button>' +
    '<h3>Type</h3><div class="vehgrid" id="vehGrid">' + KINDS.map(([k, v]) => '<button class="typebtn' + (k === kind() ? ' sel' : '') + '" data-v="' + k + '">' + ic(v.icon) + esc(v.label) + '</button>').join('') + '</div>' +
    '<div id="vehAsst"></div><div id="vehDims"></div>' +
    '<button class="btn block" id="vehSave">Enregistrer</button>' +
    '<button class="btn soft block" id="vehAdd">' + ic('plus') + 'Ajouter un autre véhicule <span class="prem">PRO</span></button>' +
    (base.rental && editId !== 'new' && editId !== 'rental' ? '<button class="btn soft block" id="vehRentEnd">' + esc(I18N.t('Fin de la location : revenir à mon véhicule')) + '</button>' : editId === 'rental' ? '<p class="muted small">' + esc(I18N.t('Véhicule de location : ton véhicule principal est gardé, tu pourras y revenir en un geste.')) + '</p>' : '<button class="btn soft block" id="vehRent">' + ic('car') + esc(I18N.t('Véhicule de location (temporaire)')) + ' <span class="prem">PRO</span></button>') +
    (editId === 'new' || editId === 'rental' ? '' : '<div id="vehCarnet"></div>') +
    (list.length > 1 && editId !== 'new' ? '<button class="btn ghost" id="vehDel">Retirer ce véhicule</button>' : ''), 'vehicle');
  { const vl = body.querySelector('#vehLic'); if (vl) vl.onclick = () => openLicence(); }
  if (window.ROUTA_X && ROUTA_X.carnetInto) ROUTA_X.carnetInto(body.querySelector('#vehCarnet'));
  const drawAsst = () => {
    const TB = TYPE_BRANDS[V.type];
    if (TB) { // autres véhicules que la voiture : seulement les marques de ce type, modèle libre
      const other = V.brand && !TB.includes(V.brand);
      let h2 = '<label class="field" for="vaBrandT">' + esc(I18N.t('Marque')) + '<select id="vaBrandT">' + opt('', '—', !V.brand) + TB.map((b) => opt(b, b, V.brand === b)).join('') + opt('__other', I18N.t('Autre marque'), other) + '</select></label>';
      if (other || V.brandOther) h2 += '<label class="field" for="vaBrandO">' + esc(I18N.t('Autre marque')) + '<input id="vaBrandO" type="text" maxlength="30" value="' + esc(other ? V.brand : '') + '"></label>';
      h2 += '<label class="field" for="vaModelT">' + esc(I18N.t('Modèle')) + '<input id="vaModelT" type="text" maxlength="30" value="' + esc(V.model || '') + '"></label>';
      h2 += '<p class="muted small"><button class="txtlink" id="vaMissing">' + esc(I18N.t('Signaler un véhicule manquant')) + '</button></p>';
      $('vehAsst').innerHTML = h2;
      $('vaBrandT').onchange = (e) => { if (e.target.value === '__other') { V.brandOther = true; V.brand = ''; } else { V.brandOther = false; V.brand = e.target.value; } drawAsst(); };
      const bo = $('vaBrandO'); if (bo) bo.oninput = (e) => { V.brand = e.target.value.trim(); };
      $('vaModelT').oninput = (e) => { V.model = e.target.value.trim(); };
      $('vaMissing').onclick = () => openFeedback({ kind: 'idee', page: 'véhicule manquant', text: I18N.t('Véhicule manquant :') + ' ' + [V.brand, V.model].filter(Boolean).join(' ') });
      return;
    }
    const brands = Object.keys(DB0).sort((a, b) => a.localeCompare(b));
    const models = V.brand && DB0[V.brand] ? DB0[V.brand] : [];
    const two = !!(VEHICLES[V.type] || {}).two;
    const free = two || V.manual || (V.brand && !DB0[V.brand]) || (V.model && models.length && !models.includes(V.model));
    let h = '<label class="field" for="vaBrand">Marque' + (free ? '<input id="vaBrand" type="text" maxlength="30" value="' + esc(V.brand || '') + '" placeholder="' + (two ? 'Ex. : Yamaha' : 'Ex. : Peugeot') + '">' : '<select id="vaBrand">' + opt('', '—', !V.brand) + brands.map((x) => opt(x, x, x === V.brand)).join('') + '</select>') + '</label>';
    if (V.brand || free) h += '<label class="field" for="vaModel">Modèle' + (free ? '<input id="vaModel" type="text" maxlength="30" value="' + esc(V.model || '') + '" placeholder="' + (two ? 'Ex. : MT-07' : 'Ex. : 2008') + '">' : '<select id="vaModel">' + opt('', '—', !V.model) + models.map((x) => opt(x, x, x === V.model)).join('') + '</select>') + '</label>';
    if (V.model) h += '<label class="field" for="vaYear">Année<select id="vaYear">' + opt('', '—', !V.year) + Array.from({ length: yNow - 1979 }, (_, i) => yNow + 1 - i).map((y) => opt(String(y), String(y), String(V.year) === String(y))).join('') + '</select></label>';
    if (V.year) h += '<h3>Motorisation</h3><div class="seg energyseg" id="vaEnergy">' + ENERGIES.map(([k, l]) => '<button data-v="' + k + '" class="' + (V.energy === k ? 'on' : '') + '">' + esc(k === 'essence' && I18N.lang !== 'fr' ? I18N.t('Essence (moteur)') : I18N.t(l)) + '</button>').join('') + '</div>';
    // Version : choisie avec des listes (puissance, boîte, finition) plutôt qu'écrite à la main
    if (V.energy) {
      const PS = [60, 70, 75, 80, 90, 100, 110, 115, 120, 130, 136, 140, 150, 156, 160, 170, 180, 190, 200, 204, 220, 245, 250, 265, 300, 340, 400, 450, 500];
      const TRIMS = BRAND_TRIMS[V.brand] || [];
      h += '<h3>' + esc(I18N.t('Version')) + '</h3><div class="row">' +
        '<label class="field grow" for="vaPs">' + esc(I18N.t('Puissance')) + '<select id="vaPs">' + opt('', '—', !V.ps) + PS.map((p) => opt(String(p), p + ' ch', String(V.ps) === String(p))).join('') + opt('__o', I18N.t('Autre'), V.ps && !PS.includes(+V.ps)) + '</select></label>' +
        '<label class="field grow" for="vaGear">' + esc(I18N.t('Boîte')) + '<select id="vaGear">' + opt('', '—', !V.gear) + opt('man', I18N.t('Manuelle'), V.gear === 'man') + opt('auto', I18N.t('Automatique'), V.gear === 'auto') + '</select></label></div>' +
        (V.ps && !PS.includes(+V.ps) ? '<label class="field" for="vaPsO">' + esc(I18N.t('Puissance (ch)')) + '<input id="vaPsO" type="number" inputmode="numeric" value="' + esc(V.ps === '__o' ? '' : V.ps) + '"></label>' : '') +
        (TRIMS.length ? '<label class="field" for="vaTrim">' + esc(I18N.t('Finition')) + '<select id="vaTrim">' + opt('', '—', !V.trim) + TRIMS.map((t) => opt(t, t, V.trim === t)).join('') + opt('__o', I18N.t('Autre'), V.trim && !TRIMS.includes(V.trim)) + '</select></label>' : '') +
        (!TRIMS.length || (V.trim && !TRIMS.includes(V.trim)) ? '<label class="field" for="vaTrimO">' + esc(I18N.t('Finition')) + '<input id="vaTrimO" type="text" maxlength="30" value="' + esc(V.trim === '__o' ? '' : (V.trim || '')) + '"></label>' : '');
    }
    h += '<p class="muted small">' + (free ? '' : '<button class="txtlink" id="vaManual">Je ne trouve pas mon véhicule</button> · ') + '<button class="txtlink" id="vaMissing">Signaler un véhicule manquant</button></p>';
    $('vehAsst').innerHTML = h;
    const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };
    on('vaBrand', free ? 'oninput' : 'onchange', (e) => { V.brand = e.target.value.trim(); V.trim = ''; if (!free) { V.model = ''; V.year = ''; drawAsst(); } });
    on('vaModel', free ? 'oninput' : 'onchange', (e) => { V.model = e.target.value.trim(); if (!free) drawAsst(); else if (V.model && !$('vaYear')) drawAsst(); });
    on('vaYear', 'onchange', (e) => { V.year = e.target.value; drawAsst(); });
    const verUpd = () => { V.version = [V.ps && V.ps !== '__o' ? V.ps + ' ch' : '', V.gear === 'auto' ? I18N.t('Automatique') : V.gear === 'man' ? I18N.t('Manuelle') : '', V.trim && V.trim !== '__o' ? V.trim : ''].filter(Boolean).join(' · '); };
    on('vaPs', 'onchange', (e) => { V.ps = e.target.value; verUpd(); drawAsst(); });
    on('vaPsO', 'oninput', (e) => { V.ps = e.target.value.trim() || '__o'; verUpd(); });
    on('vaGear', 'onchange', (e) => { V.gear = e.target.value; verUpd(); });
    on('vaTrim', 'onchange', (e) => { V.trim = e.target.value; verUpd(); drawAsst(); });
    on('vaTrimO', 'oninput', (e) => { V.trim = e.target.value.trim() || '__o'; verUpd(); });
    on('vaManual', 'onclick', () => { V.manual = true; drawAsst(); });
    on('vaMissing', 'onclick', () => openFeedback({ kind: 'idee', page: 'véhicule manquant', text: I18N.t('Véhicule manquant :') + ' ' + [V.brand, V.model, V.year].filter(Boolean).join(' ') }));
    $('vehAsst').querySelectorAll('#vaEnergy button').forEach((b) => { b.onclick = () => {
      V.energy = b.dataset.v;
      if (CAR_TYPES.includes(V.type)) V.type = V.energy === 'electrique' ? 'electrique' : (V.energy === 'hybride' || V.energy === 'phev') ? 'hybride' : 'voiture';
      drawAsst();
    }; });
  };
  const drawDims = () => {
    const v = VEHICLES[V.type] || VEHICLES.voiture;
    if (!v.heavy) { $('vehDims').innerHTML = ''; return; }
    const dims = Object.assign({}, v.dims || {}, V.dims || {});
    $('vehDims').innerHTML = '<h3>Dimensions</h3><p class="muted small">Remplis avec les valeurs de ta carte grise ou de ton véhicule chargé.</p><div class="dimgrid">' +
      DIM_LABELS.map(([k, l, u]) => '<label class="field" for="dim_' + k + '">' + l + ' (' + u + ')<input id="dim_' + k + '" type="text" inputmode="decimal" value="' + String(dims[k] != null ? dims[k] : '').replace('.', ',') + '"></label>').join('') + '</div>' +
      (V.type === 'camion' ? '<label class="switch" for="dimHaz"><span>Matières dangereuses (ADR)</span><input id="dimHaz" type="checkbox"' + (V.hazmat ? ' checked' : '') + '></label>' : '');
  };
  drawAsst(); drawDims();
  body.querySelectorAll('#vehGrid .typebtn').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.v;
      V.type = k === 'voiture' ? (V.energy === 'electrique' ? 'electrique' : (V.energy === 'hybride' || V.energy === 'phev') ? 'hybride' : 'voiture') : k;
      V.dims = Object.assign({}, (VEHICLES[V.type] || {}).dims || {});
      body.querySelectorAll('#vehGrid .typebtn').forEach((x) => x.classList.toggle('sel', x === b));
      const tb = TYPE_BRANDS[V.type]; if (tb && V.brand && !tb.includes(V.brand) && !V.brandOther) { V.brand = ''; V.model = ''; V.year = ''; }
      drawAsst(); drawDims();
    };
  });
  body.querySelectorAll('[data-vid]').forEach((b) => { b.onclick = () => { const x = loadVehicles().find((y) => y.id === b.dataset.vid); if (!x) return; useVehicle(x); toast(I18N.t('Véhicule actif') + ' : <b>' + esc(vehName(x)) + '</b>'); openVehicle(after); }; });
  body.querySelector('#vehAdd').onclick = () => openVehicle(after, 'new');
  const vr = body.querySelector('#vehRent'); if (vr) vr.onclick = () => openVehicle(after, 'rental');
  const ve = body.querySelector('#vehRentEnd'); if (ve) ve.onclick = () => {
    const prevId = store.get('routa.rentalPrev', null);
    const rest = loadVehicles().filter((x) => x.id !== base.id); store.set('routa.vehicles', rest);
    const back = rest.find((x) => x.id === prevId) || rest[0]; store.set('routa.rentalPrev', null);
    if (back) useVehicle(back); toast(esc(I18N.t('Location terminée : {v}').split('{v}').join(vehName(back || {}))));
    openVehicle(after);
  };
  const del = body.querySelector('#vehDel');
  if (del) del.onclick = () => {
    if (!del.dataset.confirm) { del.dataset.confirm = '1'; del.textContent = I18N.t('Touche encore pour retirer ce véhicule'); return; }
    const rest = loadVehicles().filter((x) => x.id !== V.id); store.set('routa.vehicles', rest); useVehicle(rest[0]); openVehicle(after);
  };
  body.querySelector('#vehSave').onclick = () => {
    const v = VEHICLES[V.type] || VEHICLES.voiture; const nd = {};
    if (v.heavy) {
      const lim = { height: [1.5, 5], width: [1.5, 3.5], length: [3, 30], weight: [1, 60] };
      for (const [k, l] of DIM_LABELS) {
        const x = parseFloat(($('dim_' + k).value || '').replace(',', '.'));
        if (isNaN(x) || x < lim[k][0] || x > lim[k][1]) { toast(l + ' : entre une valeur entre ' + lim[k][0] + ' et ' + lim[k][1] + '.'); return; }
        nd[k] = Math.round(x * 100) / 100;
      }
      V.hazmat = V.type === 'camion' && $('dimHaz') ? $('dimHaz').checked : false;
    } else V.hazmat = false;
    V.dims = nd;
    if (ctrlBlocked(V.brand || '', (V.model || '') + ' ' + (V.version || ''))) { toast('Pas de mention de contrôles de police ou de radars : c\'est interdit en Suisse.'); return; }
    if (V.rental && !loadVehicles().some((x) => x.id === V.id)) store.set('routa.rentalPrev', store.get('routa.vehicleId', null) || (loadVehicles()[0] || {}).id || null);
    useVehicle(V);
    if (V.model) { S.me.car = vehName(V).slice(0, 30); saveMe(); pushPresence(true); }
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
    const lim = (k.lim || []).join(' / ') + (/mph/.test((k.lim || [''])[0]) ? '' : ' km/h');
    toast('Bienvenue ' + esc(k.in) + ' · urgences <b>' + esc(k.main) + '</b> · ' + esc(k.toll.label) + '<br><span class="small">' + esc(I18N.t('Limites : {l}').split('{l}').join(lim)) + (k.alc ? ' · ' + esc(I18N.t('alcool')) + ' ' + esc(k.alc) : '') + '</span>' + (k.must && k.must.length ? '<br><span class="small">' + esc(I18N.t('Obligatoire')) + ' : ' + k.must.map((m) => esc(I18N.t(m))).join(', ') + '</span>' : ''), { action: 'Infos', onAction: () => openCountry(cc, 'route'), ms: 15000 });
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
    if (veh().heavy) {
      const L = vehLimits(code);
      h += '<h3>' + esc(I18N.t('Mon véhicule')) + ' · ' + esc(vehSummary()) + '</h3>' + (L
        ? '<div class="limgrid">' + [['Ville', L.lim[0]], ['Hors localité', L.lim[1]], ['Autoroute', L.lim[2]]].map(([l, v]) => '<div class="limcell"><div class="limv">' + esc(v) + '</div><div class="sub">' + l + '</div></div>').join('') + '</div>' +
          (L.lim.join('').includes('*') ? '<p class="muted small">' + esc(I18N.t('* Seulement sous conditions (homologation, équipement, poids) : vérifie la source officielle.')) + '</p>' : '') +
          '<a class="btn soft block linkbtn" href="' + esc(L.src[1]) + '" target="_blank" rel="noopener">' + ic('web') + esc(L.src[0]) + '</a>'
        : '<p class="muted small">' + esc(I18N.t('Les limites propres à ton véhicule ne sont pas encore vérifiées pour ce pays : suis la signalisation et le site officiel.')) + '</p>');
      if (veh().type === 'camion' || veh().type === 'bus' || veh().type === 'minibus') { const pr = (L && L.pro) || (code !== 'CH' && window.ROUTA_PRO_EU); if (pr) h += '<a class="btn soft block linkbtn" href="' + esc(pr[1]) + '" target="_blank" rel="noopener">' + ic('web') + esc(I18N.t('Temps de conduite et de repos')) + ' · ' + esc(pr[0]) + '</a>'; }
    }
    if (c.tips.length) h += '<div class="card"><div class="grow"><b>Bon à savoir</b><div class="sub">' + c.tips.map(esc).join('<br>') + '</div></div></div>';
  } else {
    const badge = { vignette: ['Vignette obligatoire', 'warn'], peage: ['Péage', ''], gratuit: ['Gratuit en voiture', 'ok'] }[c.toll.type] || ['', ''];
    h += '<div class="row wrap"><span class="pill ' + badge[1] + '">' + badge[0] + '</span></div><p>' + esc(c.toll.text) + '</p>';
    h += c.toll.links.map(([l, u]) => '<a class="btn soft block linkbtn" href="' + esc(u) + '" target="_blank" rel="noopener">' + ic('web') + esc(l) + '</a>').join('');
    if (c.toll.type === 'vignette') h += '<div class="banner">' + ic('info') + '<span>Achète sur le <b>site officiel</b> : les sites revendeurs facturent souvent des frais en plus.</span></div>';
    if (c.toll.heavy && veh().heavy) h += '<div class="card"><div class="grow"><b>' + esc(I18N.t('Mon véhicule')) + ' (' + esc(vehSummary()) + ')</b><div class="sub">' + esc(c.toll.heavy) + '</div></div></div>' + (c.toll.heavyLinks || []).map(([l, u]) => '<a class="btn soft block linkbtn" href="' + esc(u) + '" target="_blank" rel="noopener">' + ic('web') + esc(l) + '</a>').join('');
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
      '<h3>' + esc(I18N.t('Visibilité sur la carte')) + '</h3>' + visSeg('pfVis') +
      '<p class="muted small">Visible : les autres conducteurs voient seulement une zone d\'environ 1 km autour de toi. Invisible : personne ne te voit.</p>',
    bind(root) {
      root.querySelectorAll('#pfColors .swatch').forEach((b) => { b.onclick = () => { color = b.dataset.c; root.querySelectorAll('#pfColors .swatch').forEach((x) => x.classList.toggle('sel', x === b)); }; });
      root.querySelectorAll('#pfVis button').forEach((b) => { b.onclick = () => { S.me.vis = b.dataset.v; root.querySelectorAll('#pfVis button').forEach((x) => x.classList.toggle('on', x === b)); }; });
      return () => {
        const name = $('pfName').value.trim();
        if (name.length < 2) { toast('Choisis un pseudo d\'au moins 2 caractères.'); return false; }
        if (ctrlBlocked(name, '')) { toast('Pas de mention de contrôles de police ou de radars : c\'est interdit en Suisse.'); return false; }
        if (rudeText(name)) { toast(I18N.t('Choisis un pseudo correct, sans insulte, e-mail ni numéro de téléphone.')); return false; }
        S.me.pseudo = name; S.me.color = color;
        saveMe(); updateVisChip(); setAvatar();
        pushPresence(true);
        return true;
      };
    }
  };
}
/* #024 : catégories de permis — champ privé, gardé seulement sur ce téléphone (jamais envoyé) */
const LIC_CATS = ['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE'];
const licGet = () => store.get('routa.licence', { cats: [], country: '', since: '' });
function licSummary() { const l = licGet(); return (l.cats || []).join(', '); }
function openLicence() {
  const L = licGet();
  const info = (c) => c === 'CH'
    ? '<p class="muted small">' + esc(I18N.t('Suisse : le permis à l\'essai dure trois ans. En cas de retrait pour une infraction moyennement grave ou grave, la période d\'essai est prolongée d\'une année.')) + ' <a href="https://ch.ch/fr/circulation-et-vehicules/permis-de-conduire/obtention-du-permis-de-conduire" target="_blank" rel="noopener" style="color:var(--info)">' + esc(I18N.t('Source officielle')) + '</a></p>'
    : c === 'FR'
      ? '<p class="muted small">' + esc(I18N.t('France : le premier permis est probatoire. Il dure 3 ans (2 ans après la conduite accompagnée), moins avec la formation complémentaire. Le signe « A » doit être apposé à l\'arrière du véhicule. Des limites de vitesse plus basses s\'appliquent : vérifie-les sur la fiche officielle.')) + ' <a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F2390" target="_blank" rel="noopener" style="color:var(--info)">' + esc(I18N.t('Source officielle')) + '</a></p>'
      : '';
  const body = openSheet(I18N.t('Mon permis de conduire'),
    '<p class="muted small">' + esc(I18N.t('Privé : ces informations restent sur ce téléphone et ne sont jamais partagées.')) + '</p>' +
    '<h3>' + esc(I18N.t('Catégories')) + '</h3><div class="chips" id="licCats">' + LIC_CATS.map((c) => '<button class="chip' + ((L.cats || []).includes(c) ? ' on' : '') + '" data-c="' + c + '" aria-pressed="' + ((L.cats || []).includes(c) ? 'true' : 'false') + '">' + c + '</button>').join('') + '</div>' +
    '<h3>' + esc(I18N.t('Pays du permis')) + '</h3><div class="seg" id="licCountry">' + [['CH', 'Suisse'], ['FR', 'France'], ['', 'Autre']].map(([k, n]) => '<button data-k="' + k + '"' + (L.country === k ? ' class="on"' : '') + '>' + esc(I18N.t(n)) + '</button>').join('') + '</div>' +
    '<label class="field" for="licSince"><span>' + esc(I18N.t('Date d\'obtention (facultatif)')) + '</span><input id="licSince" type="month" value="' + esc(L.since || '') + '"></label>' +
    '<div id="licInfo">' + info(L.country) + '</div>' +
    '<button class="btn block" id="licSave">' + esc(I18N.t('Enregistrer')) + '</button>', 'licence');
  body.querySelectorAll('#licCats .chip').forEach((b) => { b.onclick = () => { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false'); }; });
  body.querySelectorAll('#licCountry button').forEach((b) => { b.onclick = () => { body.querySelectorAll('#licCountry button').forEach((x) => x.classList.toggle('on', x === b)); body.querySelector('#licInfo').innerHTML = info(b.dataset.k); }; });
  body.querySelector('#licSave').onclick = () => {
    const cats = [...body.querySelectorAll('#licCats .chip.on')].map((b) => b.dataset.c);
    const on = body.querySelector('#licCountry button.on');
    store.set('routa.licence', { cats, country: on ? on.dataset.k : '', since: body.querySelector('#licSince').value || '' });
    toast(esc(I18N.t('Enregistré sur ce téléphone.'))); openProfile();
  };
}
function openProfile() {
  const f = profileForm(false);
  const body = openSheet('Mon profil', '<button class="card tap menuprof" id="pfSettings"><span class="ico">' + ic('gear') + '</span><span class="grow"><b>' + esc(I18N.t('Réglages')) + '</b><span class="sub">' + esc(I18N.t('Navigation, carte, véhicule, notifications, confidentialité et compte')) + '</span></span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>' +
    '<button class="btn soft block" id="pfVeh">' + ic(veh().icon) + esc(I18N.t('Mon véhicule')) + ' · ' + esc(vehSummary()) + '</button>' + f.html +
    '<button class="btn block" id="pfSave">Enregistrer</button>' +
    '<button class="btn block" id="pfFeedback">' + ic('msg') + 'Signaler un problème ou une idée</button>' +
    '<a class="btn soft block" href="aide.html" style="text-decoration:none">' + ic('info') + 'Aide et installation (iPhone, Android)</a>' +
    '<div class="banner">' + ic('info') + '<span>' + esc(I18N.t(S.online ? 'Mode en ligne : alertes, spots et positions partagés.' : 'Mode solo : tes alertes et spots restent sur ce téléphone.')) + ' ' + esc(I18N.t('Version')) + ' ' + VERSION + '.</span></div>' +
    '<p class="muted small"><a href="confidentialite.html" style="color:var(--info)">Confidentialité et règles d\'utilisation</a></p>', 'profile');
  const save = f.bind(body);
  body.querySelector('#pfSave').onclick = () => { if (save()) { toast('Profil enregistré.'); closeSheet(); } };
  body.querySelector('#pfFeedback').onclick = () => openFeedback();
  body.querySelector('#pfVeh').onclick = () => openVehicle();
  body.querySelector('#pfSettings').onclick = () => openSettings();
}
/* ======================= Réglages (accès direct depuis « Mon profil ») ======================= */
function openSettings() {
  const sw = (id, label, on, sub) => '<label class="switch" for="' + id + '"><span>' + label + (sub ? '<br><span class="muted small">' + sub + '</span>' : '') + '</span><input id="' + id + '" type="checkbox"' + (on ? ' checked' : '') + '></label>';
  const segH = (id, opts, cur) => '<div class="seg" id="' + id + '">' + opts.map(([k, v]) => '<button data-v="' + k + '" class="' + (k === cur ? 'on' : '') + '">' + esc(I18N.t(v)) + '</button>').join('') + '</div>';
  const body = openSheet('Réglages',
    '<button class="card tap curbtn" id="stCursor"><span class="cp">' + meHtml() + '</span><span class="grow"><b>' + esc(I18N.t('Curseur GPS')) + '</b><span class="sub">' + esc(I18N.t('Forme, couleur et taille')) + '</span></span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>' +
    '<h3>Navigation</h3>' +
    sw('stVoice', 'Guidage vocal', S.settings.voice) +
    '<p class="muted small" style="margin:0">Pendant la navigation, la carte tourne :</p>' + segH('stNavNorth', [['route', 'Dans le sens de la route'], ['north', 'Nord en haut']], S.settings.navNorth ? 'north' : 'route') +
    sw('stAlert', 'Alerte vocale si je dépasse la limite', S.settings.speedAlert) +
    '<h3>Carte</h3>' +
    '<p class="muted small" style="margin:0">Couleurs de la carte</p>' + segH('stNight', [['auto', 'Automatique'], ['off', 'Jour'], ['on', 'Nuit']], S.settings.night) +
    sw('stPlaces', 'Afficher les établissements sur la carte', S.settings.showPlaces) +
    sw('stGoogle', 'Bouton « Voir les avis Google » sur les lieux', S.settings.googleLinks) +
    '<button class="btn soft block" id="stMapView">' + ic('layers') + 'Plan, satellite, trafic et transports</button>' +
    '<h3>Véhicule</h3>' +
    '<button class="btn soft block" id="stVeh">' + ic(veh().icon) + esc(I18N.t('Mon véhicule')) + ' · ' + esc(vehSummary()) + '</button>' +
    '<h3>Notifications</h3>' +
    sw('stReminders', 'Rappels d\'entretien (pneus, service, batterie)', S.settings.reminders !== false) +
    '<h3>Confidentialité et compte</h3>' +
    '<button class="btn soft block" id="stProfile">' + ic('user') + 'Pseudo et visibilité</button>' +
    '<p class="muted small"><a href="confidentialite.html" style="color:var(--info)">Confidentialité et règles d\'utilisation</a></p>' +
    '<button class="btn ghost" id="pfReset">Réinitialiser mon profil sur ce téléphone</button>' +
    '<button class="btn danger block" id="pfWipe">Supprimer mes données</button>' +
    '<p class="muted small">' + esc(I18N.t('Version')) + ' ' + VERSION + '.</p>', 'settings');
  const ch = (id, fn) => { const e = body.querySelector('#' + id); if (e) e.onchange = (ev) => { fn(ev.target.checked !== undefined && ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value); saveSettings(); }; };
  ch('stVoice', (v) => { S.settings.voice = v; if (v) unlockVoice(); $('btnMute').classList.toggle('muted', !v); });
  ch('stAlert', (v) => { S.settings.speedAlert = v; });
  ch('stPlaces', (v) => { S.settings.showPlaces = v; applyPlaces(); });
  ch('stGoogle', (v) => { S.settings.googleLinks = v; });
  ch('stReminders', (v) => { S.settings.reminders = v; });
  body.querySelectorAll('#stNight button').forEach((b) => { b.onclick = () => { S.settings.night = b.dataset.v; saveSettings(); applyNight(); body.querySelectorAll('#stNight button').forEach((x) => x.classList.toggle('on', x === b)); }; });
  body.querySelectorAll('#stNavNorth button').forEach((b) => { b.onclick = () => { S.settings.navNorth = b.dataset.v === 'north'; saveSettings(); body.querySelectorAll('#stNavNorth button').forEach((x) => x.classList.toggle('on', x === b)); if (S.nav) { S.follow = true; followCam(); } updateCompass(); }; });
  body.querySelector('#stCursor').onclick = openCursor;
  body.querySelector('#stMapView').onclick = openMapView;
  body.querySelector('#stVeh').onclick = () => openVehicle();
  body.querySelector('#stProfile').onclick = openProfile;
  body.querySelector('#pfReset').onclick = () => {
    const b = body.querySelector('#pfReset');
    if (b.dataset.confirm) { try { localStorage.removeItem('routa.me'); } catch (e2) { /* */ } location.reload(); }
    else { b.dataset.confirm = '1'; b.textContent = 'Touche encore pour confirmer'; }
  };
  body.querySelector('#pfWipe').onclick = async () => {
    const b = body.querySelector('#pfWipe');
    if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Touche encore pour tout effacer (définitif)'; return; }
    b.disabled = true; b.textContent = 'Suppression…';
    await wipeMyData();
  };
}
async function wipeMyData() {
  const id = S.me && S.me.id;
  if (DB.sb && id) {
    const jobs = [['alerts', 'created_by'], ['spots', 'created_by'], ['place_ratings', 'created_by'], ['fuel_prices', 'created_by'], ['event_rsvp', 'driver_id'], ['events', 'created_by']];
    for (const [t, c] of jobs) { try { await DB.sb.from(t).delete().eq(c, id); } catch (e) { /* */ } }
    try { await DB.sb.rpc('messages_wipe', { me: id, s: DB.secret() }); } catch (e) { /* */ }
    try { await DB.sb.rpc('driver_delete', { did: id, s: DB.secret() }); } catch (e) { /* */ }
  }
  try { Object.keys(localStorage).filter((k) => /^routa\./.test(k) && k !== 'routa.lang').forEach((k) => localStorage.removeItem(k)); } catch (e) { /* */ }
  toast('Tes données ont été supprimées.');
  setTimeout(() => location.reload(), 1200);
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
    setTimeout(() => openNotice(), 1200);
  };
}

/* ======================= Boutons ======================= */
function openK(k) {
    if (k === 'drivers') openProfile();
    else if (k === 'spots') openSpots();
    else if (k === 'feedback') openFeedback();
    else if (k === 'vehicle') openVehicle(S.preview ? (() => { const d = S.preview.dest; return () => chooseDestination(d); })() : null);
    else if (k === 'restrictions') openRestrictions();
    else if (k === 'prolog' && window.ROUTA_X && ROUTA_X.openProLog) ROUTA_X.openProLog();
    else if (k === 'country') openCountry(S.country, 'sos');
    else if (k === 'favs') openFavs();
    else if (SLOTS[k]) goSlot(k);
    else if (k === 'mapview') openMapView();
    else if (k === 'profile') openProfile();
    else if (k === 'settings') openSettings();
    else if (k === 'credits') openCredits();
    else if (k === 'licence') openLicence();
    else if (k === 'share') shareApp();
    else if (k === 'help') location.href = 'aide.html';
    else if (k === 'privacy') location.href = 'confidentialite.html';
    else if (window.ROUTA_X && ROUTA_X.open && ROUTA_X.open(k)) { /* nouveautés */ }
    else openPoiList(k);
}
document.querySelectorAll('.chip[data-open]').forEach((b) => { b.onclick = () => { const k = b.dataset.open; if (!SLOTS[k]) exitSearch(); openK(k); }; });
$('fabSearch').onclick = enterSearch;
$('fabMenu').onclick = openMenu;
$('qback').onclick = () => { const fin = S.pickVia; exitSearch(); if (fin && !S.nav) chooseDestination(fin); };
function langSeg() {
  return '<label class="field langsel" for="langSel"><span>' + esc(I18N.t('Langue')) + '</span><select id="langSel" data-notr>' + Object.entries(I18N.langs).map(([k, v]) => '<option value="' + k + '"' + (k === I18N.lang ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label>';
}
function bindLangSeg(root) {
  const sel = root.querySelector('#langSel');
  if (sel) sel.onchange = () => { if (sel.value !== I18N.lang) I18N.setLang(sel.value); };
}
/* Crédits des cartes et des données (retirés de la carte pour la garder propre) */
function openCredits() {
  const L = [
    ['OpenStreetMap', '© ' + I18N.t('les contributeurs OpenStreetMap') + ' (ODbL)', 'https://www.openstreetmap.org/copyright'],
    ['OpenMapTiles', '© OpenMapTiles', 'https://openmaptiles.org'],
    ['OpenFreeMap', I18N.t('Fond de carte'), 'https://openfreemap.org'],
    ['Sentinel-2 cloudless', 'EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)', 'https://s2maps.eu'],
    ['IGN', I18N.t('Photos aériennes (France)'), 'https://geoservices.ign.fr'],
    ['swisstopo', I18N.t('Photos aériennes (Suisse)'), 'https://www.swisstopo.admin.ch'],
    ['TomTom', I18N.t('Trafic, itinéraires, travaux'), 'https://www.tomtom.com'],
    ['RainViewer', I18N.t('Radar de pluie'), 'https://www.rainviewer.com'],
    ['Open-Meteo', I18N.t('Météo'), 'https://open-meteo.com'],
    ['Valhalla / OSRM', I18N.t('Itinéraires'), 'https://valhalla.github.io/valhalla/'],
    ['Photon (komoot)', I18N.t('Recherche d\'adresses'), 'https://photon.komoot.io'],
    ['Mapzen / AWS Terrain Tiles', I18N.t('Relief'), 'https://registry.opendata.aws/terrain-tiles/'],
    ['Wikipedia', 'CC BY-SA', 'https://www.wikipedia.org']
  ];
  openSheet(I18N.t('Crédits de la carte'), L.map(([n, d, u]) => '<a class="card tap" href="' + esc(u) + '" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><span class="grow"><b>' + esc(n) + '</b><span class="sub">' + esc(d) + '</span></span></a>').join(''), 'credits');
}
function openMenu() {
  const X = window.ROUTA_X || {}; const XI = X.icons || {};
  const fr = X.pendingCount ? X.pendingCount() : 0;
  const v = veh();
  const XO = (k) => X.open && X.tiles && X.tiles().some((t) => t[0] === k);
  const xt = (k) => { const t = X.tiles ? X.tiles().find((x) => x[0] === k) : null; return t ? [t[0], t[1], t[2]] : null; };
  const PROI = '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6M12 2v3"/></svg>';
  const groups = [
    ['Communauté', [
      XO('shareme') && xt('shareme'),
      XO('badges') && xt('badges'),
      XO('ranking') && xt('ranking')
    ]],
    ['Mes déplacements', [
      ['vehicle', ic(v.icon), esc(I18N.t('Mon véhicule')) + ' · ' + esc(I18N.t(v.label))],
      X.open && ['parked', XI.park || ic('parking'), 'Parking'],
      XO('drive') && xt('drive'),
      XO('activity') && xt('activity'),
      XO('repair') && xt('repair'),
      XO('breakdown') && xt('breakdown'),
    ]],
    ['Carte et routes', [
      ['favs', ic('star'), 'Mes favoris'],
      XO('smart') && xt('smart'),
      XO('explore') && xt('explore'),
      v.ev && X.open && ['chargers', XI.plug || ic('charge'), 'Bornes libres'],
      ['mapview', '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>', 'Affichage de la carte'],
      X.openTrips && ['trips', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>', 'Mes trajets'],
      X.openOffline && ['offline', '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>', 'Carte hors connexion']
    ]],
    ['Sorties et convois', [
      X.open && ['convoy', XI.convoy || ic('car'), X.convoy ? 'Convoi · ' + esc(X.convoy.name) : 'Convoi'],
      X.open && ['events', XI.event || ic('spot'), 'Rassemblements'],
      ['spots', ic('spot'), 'Spots, routes et cols'],
      XO('plan') && xt('plan'),
      XO('checklists') && xt('checklists'),
      XO('voyage') && xt('voyage')
    ]],
    ['Pro', [
      X.openPro && ['pro', PROI, 'Temps de conduite'],
      XO('tour') && xt('tour'),
      XO('bans') && xt('bans'),
      X.openProLog && ['prolog', '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h4"/></svg>', 'Relevé de conduite'],
      ['truckstop', ic('truckstop'), 'Aires poids lourds'],
      ['restrictions', '<svg viewBox="0 0 24 24"><path d="M3 20h18"/><path d="M6 20V9l6-5 6 5v11"/><path d="M12 9v6M9 12h6"/></svg>', 'Restrictions autour']
    ]]
  ];
  // #008 : fonctions classées Premium (étiquette seulement pendant les tests, rien n'est verrouillé)
  const PREM_TILES = ['plan', 'convoy', 'events', 'checklists', 'spots', 'cols', 'voyage', 'pro', 'tour', 'bans', 'prolog', 'truckstop', 'restrictions'];
  const tile = (t) => '<button class="tile" data-k="' + t[0] + '">' + (PREM_TILES.includes(t[0]) ? '<i class="prem tileprem">PRO</i>' : '') + t[1] + '<span>' + t[2] + '</span></button>';
  const body = openSheet('Menu',
    '<button class="card tap menuprof" data-k="profile"><span class="avatarmini" style="background:' + curColor() + ';color:' + (lum(curColor()) > 0.5 ? '#0E1116' : '#FFFFFF') + '">' + esc(initials(S.me.pseudo || '?')) + '</span><span class="grow"><b>' + esc(S.me.pseudo || 'Mon profil') + '</b><span class="sub">' + esc(visLabel(S.me.vis)) + (S.me.points ? ' · ' + S.me.points + ' pts' : '') + '</span></span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>' +
    '<button class="card tap menuprof" data-k="settings"><span class="ico">' + ic('gear') + '</span><span class="grow"><b>' + esc(I18N.t('Réglages')) + '</b><span class="sub">' + esc(I18N.t('Navigation, carte, véhicule, notifications, confidentialité et compte')) + '</span></span></button>' +
    '<button class="card tap menusos" data-k="country"><span class="sosdot big">SOS</span><span class="grow"><b>Urgences et infos pays</b><span class="sub">' + ($('ctryLabel').textContent === 'Infos pays' ? 'Numéros d\'urgence, règles, vignettes' : esc($('ctryLabel').textContent)) + '</span></span></button>' +
    groups.map(([g, ts]) => { const list = ts.filter(Boolean); if (!list.length) return ''; return '<h3 class="menuh' + (g === 'Pro' ? ' menupro' : '') + '">' + (g === 'Pro' ? esc(I18N.t('Outils pour les professionnels de la route')) : g) + '</h3><div class="tiles' + (list.length % 3 === 1 ? ' two' : '') + '">' + list.map(tile).join('') + '</div>'; }).join('') +
    '<button class="card tap menufb" data-k="feedback"><span class="ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg></span><span class="grow"><b>Donner mon avis</b><span class="sub">Un bug, un truc pas clair, une idée : dis-le-nous</span></span></button>' +
    '<div class="menulinks">' + (X.canInstall && X.canInstall() ? '<button data-k="install">Installer l\'app</button>' : '') + '<button data-k="share">Partager ROUTA</button><button data-k="help">Aide</button><button data-k="privacy">Confidentialité</button><button data-k="credits">' + esc(I18N.t('Crédits de la carte')) + '</button></div>' +
    langSeg() +
    '<p class="menusig">ROUTA par <b>ACKFIX</b></p>', 'menu');
  body.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => openK(b.dataset.k); });
  bindLangSeg(body);
}
$('btnProfile').onclick = openMenu;
$('btnLocate').onclick = () => {
  if (!S.pos) { startGps(); toast('Recherche de ta position…'); return; }
  S.follow = true; $('btnLocate').classList.add('active');
  S.lastCam = null; S.camZoom = null; // retour au zoom par défaut, centré sur ma position
  S.puckAt = Date.now() + 1100; S.camAt = 0; followCam(); setTimeout(renderMe, 1150);
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
  updateSpeed();
  startGps();
  await DB.init();
  try { await DB.loadAll(); } catch (e) { console.warn(e); }
  const draw = () => { renderAlerts(); renderSpots(); renderDrivers(); };
  draw();
  DB.subscribe();
  pushPresence(true);
  setTimeout(offerResume, 4000);
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
window.ROUTA = { CUR_COLORS, alertVisible, renderAlerts, reroute, saveActiveNav, alongRoute, clearPois, pickVia, updateSpeed, enterSearch, exitSearch, S, DB, map, CFG, I18N, esc, ic, el, toast, openSheet, closeSheet, userClose, say, vibrate, uuid, dist, fmtDist, fmtDur, fmtClock, ago, store, saveMe, pushPresence, chooseDestination, initials, veh, openDriver, startNav, openSpot, openPoi, capLimit, openCursor, openK, overpass, inCH, geoReverse, openCountry, renderSpots, geoSearch, parseOsm, renderPoiList, showPois, ohParse, ohStatus, OVERPASS_FILTER };
if (!S.me || !S.me.pseudo) onboarding(); else boot();

})();
