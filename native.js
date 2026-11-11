/* ROUTA – position GPS par l'iPhone (une seule autorisation, celle d'iOS). Sur le web et Android, rien ne change. */
(function () {
  'use strict';
  const C = window.Capacitor;
  const G = C && C.Plugins && C.Plugins.RoutaGeo;
  if (!G || !C.getPlatform || C.getPlatform() !== 'ios' || !navigator.geolocation) return;
  const geo = navigator.geolocation;
  const orig = { w: geo.watchPosition.bind(geo), c: geo.clearWatch.bind(geo), g: geo.getCurrentPosition.bind(geo) };
  const watchers = new Map();
  let seq = 0, last = null, started = false, failed = false;
  const pos = (k) => ({ coords: { latitude: k.lat, longitude: k.lon, accuracy: k.acc, altitude: k.alt, altitudeAccuracy: null, speed: k.speed >= 0 ? k.speed : null, heading: k.heading >= 0 ? k.heading : null }, timestamp: k.t || Date.now() });
  const denied = { code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
  function begin() {
    if (started) return; started = true;
    G.addListener('position', (k) => {
      if (!k || !isFinite(k.lat) || !isFinite(k.lon)) return;
      last = pos(k);
      watchers.forEach((w) => { if (!w.native) { try { w.ok(last); } catch (e) { console.warn(e); } } });
    });
    G.addListener('error', (k) => {
      if (!k || k.code !== 1) return;
      const list = [...watchers.values()]; watchers.clear();
      list.forEach((w) => { if (w.err) { try { w.err(denied); } catch (e) { console.warn(e); } } });
    });
    Promise.resolve().then(() => G.start()).catch(() => {
      failed = true;
      watchers.forEach((w) => { if (w.native == null) w.native = orig.w(w.ok, w.err, w.opt); });
    });
  }
  geo.watchPosition = function (ok, err, opt) {
    const id = ++seq, w = { ok, err, opt, native: null };
    watchers.set(id, w);
    if (failed) w.native = orig.w(ok, err, opt);
    else { begin(); if (last) setTimeout(() => { if (watchers.has(id)) ok(last); }, 0); }
    return id;
  };
  geo.clearWatch = function (id) {
    const w = watchers.get(id);
    if (w && w.native != null) orig.c(w.native);
    watchers.delete(id);
  };
  geo.getCurrentPosition = function (ok, err, opt) {
    if (failed) return orig.g(ok, err, opt);
    if (last && Date.now() - last.timestamp < 15000) { setTimeout(() => ok(last), 0); return; }
    const id = geo.watchPosition((p) => { geo.clearWatch(id); ok(p); }, (e) => { geo.clearWatch(id); if (err) err(e); }, opt);
  };
})();

/* ROUTA – carte native iPhone.
   Dans l'app iPhone, la carte est dessinée par l'iPhone (MapLibre natif) sous l'interface web.
   La carte web reste en coulisses pour la logique (positions, clics, lieux) mais ne dessine plus rien.
   Sur le site web et Android, ce fichier ne fait rien. */
(function () {
  'use strict';
  const RM = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.RoutaMap;
  let off = false;
  try { off = localStorage.getItem('routa.nativeMap') === '0'; } catch (e) { /* */ }
  if (!RM || off || !window.maplibregl) return;

  const ML = window.maplibregl;
  const DOC = document.documentElement;
  DOC.classList.add('native-map');
  const css = document.createElement('style');
  css.textContent = 'html.native-map,html.native-map body{background:transparent!important}' +
    'html.native-map #map{opacity:0!important;pointer-events:none!important}' +
    'html.native-map #map .maplibregl-control-container{display:none!important}' +
    '.routa-stage{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none}';
  document.head.appendChild(css);

  const N = { map: null, ok: true, styleSent: false, syncing: false, recs: new Map(), byId: new Map(), seq: 0, sent: new Set() };
  window.ROUTA_NATIVE = N;
  const fail = (e) => {
    console.warn('carte native', e);
    if (!N.ok) return; N.ok = false;
    try { localStorage.setItem('routa.nativeMap', '0'); } catch (x) { /* */ }
    location.reload();
  };
  const call = (m, o) => { try { return RM[m](o || {}).catch((e) => console.warn('RoutaMap.' + m, e)); } catch (e) { console.warn(e); return Promise.resolve(); } };

  /* ---------- Carte ---------- */
  const Orig = ML.Map;
  class NativeMap extends Orig {
    constructor(o) {
      super(o);
      try { attach(this, o || {}); } catch (e) { fail(e); }
    }
  }
  ML.Map = NativeMap;

  function attach(map, o) {
    N.map = map;
    const noop = () => {};
    if (map.painter) map.painter.render = noop;
    const c = map.getCenter();
    const D = N.diag = { start: '…', style: 0, cam: 0, sent: 0, err: '' };
    RM.start({ styleURL: typeof o.style === 'string' ? o.style : '', lng: c.lng, lat: c.lat, zoom: map.getZoom() }).then(() => { D.start = 'ok'; }).catch((e) => { D.start = 'ERR'; fail(e); });

    /* caméra : page -> iPhone */
    const oj = map.jumpTo.bind(map), oe = map.easeTo.bind(map), of = map.flyTo.bind(map);
    const send = (duration, linear, fly) => {
      const cc = map.getCenter();
      call('setCamera', { lng: cc.lng, lat: cc.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), duration: duration || 0, linear: !!linear, fly: !!fly });
    };
    map.jumpTo = function (opt, ev) { oj(opt, ev); if (!N.syncing && !N.inner) send(0); return map; };
    map.easeTo = function (opt, ev) {
      opt = opt || {};
      if (N.syncing) return oe(opt, ev);
      const d = opt.animate === false ? 0 : (opt.duration == null ? 500 : opt.duration);
      N.inner = true; try { oe(Object.assign({}, opt, { duration: 0, animate: false }), ev); } finally { N.inner = false; }
      send(d, !!opt.easing);
      return map;
    };
    map.flyTo = function (opt, ev) {
      opt = opt || {};
      if (N.syncing) return of(opt, ev);
      N.inner = true; try { of(Object.assign({}, opt, { animate: false }), ev); } finally { N.inner = false; }
      if (opt.animate === false) send(0); else send(opt.duration == null ? -1 : opt.duration, false, true);
      return map;
    };

    /* caméra : iPhone -> page */
    const NEV = { type: 'native', target: null, preventDefault() {} };
    RM.addListener('camera', (k) => {
      if (!k || !isFinite(k.lng)) return;
      D.cam++;
      N.syncing = true;
      try { NEV.target = map.getCanvas(); oj({ center: [k.lng, k.lat], zoom: k.zoom, bearing: k.bearing, pitch: k.pitch }, k.gesture ? { originalEvent: NEV } : undefined); } catch (e) { console.warn(e); }
      N.syncing = false;
    });
    const fire = (type, k) => {
      const p = new ML.Point(k.x, k.y);
      map.fire(type, { point: p, lngLat: map.unproject(p), originalEvent: { type, target: map.getCanvas(), preventDefault() {}, stopPropagation() {} }, preventDefault() {} });
    };
    RM.addListener('tap', (k) => fire('click', k));
    RM.addListener('longpress', (k) => fire('contextmenu', k));
    RM.addListener('marker', (k) => {
      const r = N.byId.get(k && k.id);
      if (r && r.el) r.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    RM.addListener('style', () => { D.style++; flushMarkers(true); });

    /* style : toute modification structurelle renvoie le style complet ; les plus fréquentes passent en direct */
    const structural = ['addSource', 'addLayer', 'removeLayer', 'removeSource', 'setLayerZoomRange', 'setPaintProperty', 'setFilter', 'moveLayer'];
    structural.forEach((m) => {
      const f = map[m]; if (!f) return;
      map[m] = function () { const r = f.apply(map, arguments); scheduleStyle(); return r; };
    });
    const slp = map.setLayoutProperty;
    map.setLayoutProperty = function (id, k, v) {
      const r = slp.apply(map, arguments);
      if (k === 'visibility' && N.styleSent) call('setVisibility', { id, visible: v !== 'none' });
      else scheduleStyle();
      return r;
    };
    map.setTerrain = function () { return map; };

    /* la carte web ne dessine plus : les lieux et arrêts (symboles) sont retrouvés directement dans les données */
    const oq = map.queryRenderedFeatures.bind(map);
    map.queryRenderedFeatures = function (geom, opts) {
      if (geom && !Array.isArray(geom) && geom.x == null && opts === undefined) { opts = geom; geom = undefined; }
      let res = [];
      try { res = oq(geom, opts) || []; } catch (e) { res = []; }
      const ids = (opts && opts.layers) || [];
      const sym = ids.filter((id) => { const L = map.getLayer(id); return L && L.type === 'symbol'; });
      if (!sym.length) return res;
      res = res.filter((f) => !(f.layer && sym.includes(f.layer.id)));
      let x0, y0, x1, y1;
      if (Array.isArray(geom) && Array.isArray(geom[0])) { x0 = Math.min(geom[0][0], geom[1][0]); x1 = Math.max(geom[0][0], geom[1][0]); y0 = Math.min(geom[0][1], geom[1][1]); y1 = Math.max(geom[0][1], geom[1][1]); }
      else if (geom && (geom.x != null || Array.isArray(geom))) { const px = geom.x != null ? geom.x : geom[0], py = geom.y != null ? geom.y : geom[1]; x0 = px - 10; x1 = px + 10; y0 = py - 10; y1 = py + 10; }
      else { x0 = 0; y0 = 0; x1 = map.getContainer().clientWidth; y1 = map.getContainer().clientHeight; }
      const z = map.getZoom(), seen = new Set();
      for (const id of sym) {
        const L = map.getLayer(id);
        if (map.getLayoutProperty(id, 'visibility') === 'none' || z < (L.minzoom || 0) || z >= (L.maxzoom || 24)) continue;
        let fs = [];
        try { fs = map.querySourceFeatures(L.source, { sourceLayer: L.sourceLayer, filter: L.filter }); } catch (e) { fs = []; }
        for (const f of fs) {
          const g = f.geometry; if (!g) continue;
          const c = g.type === 'Point' ? g.coordinates : g.type === 'MultiPoint' ? g.coordinates[0] : null; if (!c) continue;
          const p = map.project(c); if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
          const k = id + '|' + c[0].toFixed(6) + ',' + c[1].toFixed(6); if (seen.has(k)) continue; seen.add(k);
          res.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: f.properties, layer: { id, type: 'symbol' }, source: L.source, sourceLayer: L.sourceLayer });
        }
      }
      return res;
    };
    map.on('load', () => scheduleStyle(50));
    new MutationObserver(() => {
      const k = nightKey(); if (k !== N.nightKey) { N.nightKey = k; if (N.styleSent) scheduleStyle(30); }
    }).observe(document.body || DOC, { attributes: true, attributeFilter: ['class'] });
    N.nightKey = nightKey();

    startRects();
  }

  /* sources GeoJSON : mise à jour directe */
  const GS = ML.GeoJSONSource && ML.GeoJSONSource.prototype;
  if (GS && GS.setData) {
    const sd = GS.setData;
    GS.setData = function (data) {
      const r = sd.apply(this, arguments);
      if (N.map && N.styleSent && this.map === N.map && this.id) call('setGeoJSON', { id: this.id, data: JSON.stringify(cleanGeo(data)) });
      return r;
    };
  }
  function cleanGeo(d) {
    const bad = (f) => !f || !f.geometry || (Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length < (f.geometry.type === 'LineString' ? 2 : 1));
    if (!d || typeof d !== 'object') return { type: 'FeatureCollection', features: [] };
    if (d.type === 'FeatureCollection') return { type: 'FeatureCollection', features: (d.features || []).filter((f) => !bad(f)) };
    if (d.type === 'Feature') return bad(d) ? { type: 'FeatureCollection', features: [] } : d;
    return d;
  }

  let styleT = 0;
  function scheduleStyle(ms) {
    if (!N.map || !N.map.isStyleLoaded || !N.map.loaded) return;
    clearTimeout(styleT);
    styleT = setTimeout(sendStyle, ms == null ? 250 : ms);
  }
  function nightKey() { const b = document.body; if (!b) return ''; return (b.classList.contains('night') ? 'n' : 'd') + (b.classList.contains('sat') ? 's' : 'p'); }
  function sendStyle() {
    const map = N.map; if (!map) return;
    let s;
    try { s = map.getStyle(); } catch (e) { return; }
    if (!s || !s.layers) return;
    s = JSON.parse(JSON.stringify(s));
    delete s.terrain;
    if (s.sources) {
      delete s.sources.dem;
      Object.keys(s.sources).forEach((k) => { const src = s.sources[k]; if (src.type === 'geojson' && src.data && typeof src.data === 'object') src.data = cleanGeo(src.data); });
    }
    const nk = nightKey();
    if (nk === 'np') s.layers.forEach(nightLayer);
    if (nk === 'ns') s.layers.forEach((l) => { if (l.id === 'sat-world') { l.paint = Object.assign({}, l.paint, { 'raster-brightness-max': 0.78 }); } });
    s.sources['routa-mk'] = { type: 'geojson', data: markersFC() };
    const lay = (id, al) => ({ id, type: 'symbol', source: 'routa-mk', filter: ['==', ['get', 'al'], al], layout: { 'icon-image': ['get', 'img'], 'icon-rotate': ['get', 'rot'], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': al === 'm' ? 'map' : 'viewport', 'icon-pitch-alignment': al === 'm' ? 'map' : 'viewport', 'symbol-sort-key': ['get', 'z'] } });
    s.layers.push(lay('routa-mk-v', 'v'), lay('routa-mk-m', 'm'));
    N.styleSent = true;
    if (N.diag) N.diag.sent++;
    call('setStyle', { json: JSON.stringify(s) });
  }

  /* mode nuit : même rendu que le filtre CSS de la version web */
  const COLOR_KEY = /-color$/;
  function nightLayer(l) {
    if (!l.paint || l.type === 'raster') return;
    Object.keys(l.paint).forEach((k) => { if (COLOR_KEY.test(k)) l.paint[k] = mapColors(l.paint[k]); });
  }
  function mapColors(v) {
    if (typeof v === 'string') { const c = parseColor(v); return c ? nightColor(c) : v; }
    if (Array.isArray(v)) return v.map(mapColors);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = mapColors(v[k]); }); return o; }
    return v;
  }
  const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };
  function parseColor(s) {
    s = s.trim().toLowerCase();
    if (NAMED[s]) return NAMED[s].slice();
    let m = s.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
    m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
    m = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (m) {
      const h = (+m[1] % 360) / 360, sat = +m[2] / 100, li = +m[3] / 100;
      const q = li < 0.5 ? li * (1 + sat) : li + sat - li * sat, p = 2 * li - q;
      const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
      return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255, m[4] == null ? 1 : +m[4]];
    }
    return null;
  }
  const cl = (x) => Math.max(0, Math.min(1, x));
  const mul = (M, v) => [cl(M[0] * v[0] + M[1] * v[1] + M[2] * v[2]), cl(M[3] * v[0] + M[4] * v[1] + M[5] * v[2]), cl(M[6] * v[0] + M[7] * v[1] + M[8] * v[2])];
  const HUE = (() => { const c = Math.cos(Math.PI), s = Math.sin(Math.PI); return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283, 0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]; })();
  const SAT = ((s) => [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s])(0.7);
  function nightColor(c) {
    let v = [c[0] / 255, c[1] / 255, c[2] / 255].map((x) => cl(0.92 + x * (1 - 2 * 0.92)));
    v = mul(HUE, v); v = mul(SAT, v); v = v.map((x) => cl(x * 0.95));
    return 'rgba(' + Math.round(v[0] * 255) + ',' + Math.round(v[1] * 255) + ',' + Math.round(v[2] * 255) + ',' + (+c[3].toFixed(3)) + ')';
  }

  /* ---------- Marqueurs : dessinés en image puis affichés par l'iPhone ---------- */
  const MP = ML.Marker.prototype;
  const oAdd = MP.addTo, oRem = MP.remove, oLL = MP.setLngLat, oRot = MP.setRotation;
  MP.addTo = function (map) {
    if (N.ok && map === N.map) {
      this._update = () => {};
      const r = oAdd.call(this, map);
      register(this);
      return r;
    }
    return oAdd.call(this, map);
  };
  MP.remove = function () { unregister(this); return oRem.apply(this, arguments); };
  MP.setLngLat = function () { const r = oLL.apply(this, arguments); if (N.recs.has(this)) touch(); return r; };
  MP.setRotation = function () { const r = oRot.apply(this, arguments); if (N.recs.has(this)) touch(); return r; };

  function register(mk) {
    if (N.recs.has(mk)) return;
    const el = mk.getElement();
    const rec = { mk, el, id: 'm' + (++N.seq), z: el.classList.contains('mk-me') ? 1e6 : N.seq, img: null, ver: 0 };
    N.recs.set(mk, rec); N.byId.set(rec.id, rec);
    rec.mo = new MutationObserver(() => queueRaster(rec));
    rec.mo.observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
    queueRaster(rec);
  }
  function unregister(mk) {
    const rec = N.recs.get(mk); if (!rec) return;
    rec.mo.disconnect(); N.recs.delete(mk); N.byId.delete(rec.id); touch();
  }

  const rq = new Set(); let rqT = 0;
  function queueRaster(rec) { rq.add(rec); if (!rqT) rqT = setTimeout(runRaster, 16); }
  async function runRaster() {
    rqT = 0;
    const list = [...rq]; rq.clear();
    const imgs = [];
    for (const rec of list) {
      if (!N.recs.has(rec.mk)) continue;
      const v = ++rec.ver;
      let out = null;
      try { out = await raster(rec); } catch (e) { console.warn('marqueur', e); }
      if (v !== rec.ver) continue;
      if (!out) { rec.img = null; continue; }
      if (!N.sent.has(out.name)) { N.sent.add(out.name); imgs.push({ name: out.name, data: out.data, scale: SCALE }); }
      rec.img = out.name;
    }
    if (N.sent.size > 500) { N.sent.clear(); await call('clearImages'); N.recs.forEach((r) => queueRaster(r)); return; }
    if (imgs.length) await call('setImages', { images: imgs });
    touch();
  }
  // le zoom change l'apparence de certains marqueurs (noms masqués de loin…)
  let lastMapCls = '';
  setInterval(() => {
    const m = document.getElementById('map'); if (!m) return;
    const k = m.className + '|' + (document.body ? document.body.className.match(/\bnight\b/) : '');
    if (k !== lastMapCls) { lastMapCls = k; N.recs.forEach((r) => queueRaster(r)); }
  }, 400);

  let flT = 0;
  function touch() { if (!flT) flT = setTimeout(() => flushMarkers(false), 16); }
  function markersFC() {
    const fs = [];
    N.recs.forEach((r) => {
      if (!r.img) return;
      const ll = r.mk.getLngLat(); if (!ll) return;
      const al = r.mk._rotationAlignment === 'map' ? 'm' : 'v';
      fs.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] }, properties: { id: r.id, img: r.img, rot: r.mk._rotation || 0, al, z: r.z } });
    });
    return { type: 'FeatureCollection', features: fs };
  }
  let lastFC = '';
  function flushMarkers(force) {
    flT = 0;
    if (!N.styleSent) return;
    const s = JSON.stringify(markersFC());
    if (!force && s === lastFC) return;
    lastFC = s;
    call('setGeoJSON', { id: 'routa-mk', data: s });
  }

  /* dessin d'un marqueur HTML dans une image (sans dépendance) */
  const SCALE = 3;
  const svgCache = new Map();
  let stage = null;
  function getStage() {
    const m = document.getElementById('map');
    if (!stage || !stage.isConnected) { stage = document.createElement('div'); stage.className = 'routa-stage'; m.appendChild(stage); }
    return stage;
  }
  async function raster(rec) {
    const st = getStage();
    const c = rec.el.cloneNode(true);
    c.style.transform = 'none'; c.style.position = 'absolute'; c.style.left = '0px'; c.style.top = '0px'; c.style.opacity = '1';
    st.appendChild(c);
    try {
      const R = c.getBoundingClientRect();
      if (R.width < 1 && R.height < 1) return null;
      const items = [];
      walk(c, 1, c, items);
      if (!items.length) return null;
      let x0 = 0, y0 = 0, x1 = R.width, y1 = R.height;
      items.forEach((it) => { const r = it.r; x0 = Math.min(x0, r.left - R.left - it.pad); y0 = Math.min(y0, r.top - R.top - it.pad); x1 = Math.max(x1, r.right - R.left + it.pad); y1 = Math.max(y1, r.bottom - R.top + it.pad); });
      const mk = rec.mk, an = mk._anchor || 'center', off = mk._offset || { x: 0, y: 0 };
      let ax = R.width / 2, ay = R.height / 2;
      if (/top/.test(an)) ay = 0; if (/bottom/.test(an)) ay = R.height;
      if (/left/.test(an)) ax = 0; if (/right/.test(an)) ax = R.width;
      ax -= off.x || 0; ay -= off.y || 0;
      const hx = Math.ceil(Math.max(ax - x0, x1 - ax)), hy = Math.ceil(Math.max(ay - y0, y1 - ay));
      const cv = document.createElement('canvas');
      cv.width = Math.max(2, hx * 2 * SCALE); cv.height = Math.max(2, hy * 2 * SCALE);
      const ctx = cv.getContext('2d');
      ctx.scale(SCALE, SCALE);
      ctx.translate(hx - ax, hy - ay);
      for (const it of items) await drawItem(ctx, it, R);
      const url = cv.toDataURL('image/png');
      const data = url.slice(url.indexOf(',') + 1);
      return { name: 'mk' + hash(data), data };
    } finally { c.remove(); }
  }
  function walk(e, alpha, root, items) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none') return;
    const a = alpha * (e === root ? 1 : parseFloat(cs.opacity || '1'));
    const vis = cs.visibility !== 'hidden';
    const r = e.getBoundingClientRect();
    const tag = e.tagName.toLowerCase();
    if (tag === 'svg') {
      if (vis && r.width > 0) {
        const sh = parseShadow(cs.boxShadow);
        items.push({ t: 'box', cs, r, a, sh, pad: sh ? sh.blur + Math.max(Math.abs(sh.x), Math.abs(sh.y)) + 2 : 0 });
        const bl = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0), bt = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0);
        const br = (parseFloat(cs.borderRightWidth) || 0) + (parseFloat(cs.paddingRight) || 0), bb = (parseFloat(cs.borderBottomWidth) || 0) + (parseFloat(cs.paddingBottom) || 0);
        const ir = { left: r.left + bl, top: r.top + bt, right: r.right - br, bottom: r.bottom - bb, width: r.width - bl - br, height: r.height - bt - bb };
        if (ir.width > 0 && ir.height > 0) items.push({ t: 'svg', e, r: ir, a, pad: 0 });
      }
      return;
    }
    if (tag === 'img') return;
    if (vis && r.width > 0 && r.height > 0) {
      const sh = parseShadow(cs.boxShadow);
      items.push({ t: 'box', cs, r, a, sh, pad: sh ? sh.blur + Math.max(Math.abs(sh.x), Math.abs(sh.y)) + 2 : 0 });
    }
    for (const n of e.childNodes) {
      if (n.nodeType === 3) { if (vis && n.nodeValue.trim()) items.push({ t: 'text', n, cs, r, a, pad: 0 }); }
      else if (n.nodeType === 1) walk(n, a, root, items);
    }
  }
  function parseShadow(s) {
    if (!s || s === 'none') return null;
    const m = s.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/i) || s.match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+-?[\d.]+px)?\s+(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i);
    if (!m) return null;
    if (/^[-\d]/.test(m[1])) return { c: m[4], x: +m[1], y: +m[2], blur: +m[3] };
    return { c: m[1], x: +m[2], y: +m[3], blur: +m[4] };
  }
  function radius(cs, w, h) {
    const v = cs.borderTopLeftRadius || '0';
    const n = parseFloat(v) || 0;
    const r = /%/.test(v) ? n / 100 * Math.min(w, h) : n;
    return Math.max(0, Math.min(r, w / 2, h / 2));
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  async function drawItem(ctx, it, R) {
    const x = it.r.left - R.left, y = it.r.top - R.top, w = it.r.width, h = it.r.height;
    ctx.save(); ctx.globalAlpha = it.a;
    if (it.t === 'box') {
      const cs = it.cs, rad = radius(cs, w, h), bg = cs.backgroundColor;
      if (!clear(bg)) {
        if (it.sh) { ctx.shadowColor = it.sh.c; ctx.shadowOffsetX = it.sh.x * SCALE; ctx.shadowOffsetY = it.sh.y * SCALE; ctx.shadowBlur = it.sh.blur * SCALE; }
        ctx.fillStyle = bg; rr(ctx, x, y, w, h, rad); ctx.fill();
        ctx.shadowColor = 'transparent';
      }
      const bw = parseFloat(cs.borderTopWidth) || 0;
      if (bw > 0 && cs.borderTopStyle !== 'none' && !clear(cs.borderTopColor)) {
        ctx.lineWidth = bw; ctx.strokeStyle = cs.borderTopColor;
        if (cs.borderTopStyle === 'dashed') ctx.setLineDash([bw * 2, bw * 1.5]);
        rr(ctx, x + bw / 2, y + bw / 2, w - bw, h - bw, Math.max(0, rad - bw / 2)); ctx.stroke();
      }
    } else if (it.t === 'text') {
      const cs = it.cs, range = document.createRange();
      range.selectNodeContents(it.n);
      const tr = range.getBoundingClientRect();
      let txt = it.n.nodeValue.replace(/\s+/g, ' ').trim();
      ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      ctx.fillStyle = cs.color; ctx.textBaseline = 'middle';
      const maxW = (it.r.right - (parseFloat(cs.paddingRight) || 0)) - tr.left;
      if (cs.textOverflow === 'ellipsis' && ctx.measureText(txt).width > maxW + 0.5) {
        while (txt.length > 1 && ctx.measureText(txt + '…').width > maxW) txt = txt.slice(0, -1);
        txt += '…';
      }
      ctx.fillText(txt, tr.left - R.left, tr.top - R.top + tr.height / 2);
    } else if (it.t === 'svg') {
      const img = await svgImage(it.e, w, h);
      if (img) ctx.drawImage(img, x, y, w, h);
    }
    ctx.restore();
  }
  async function svgImage(svg, w, h) {
    const cl2 = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll('*')], dst = [cl2, ...cl2.querySelectorAll('*')];
    src.forEach((s, i) => {
      const cs = getComputedStyle(s);
      dst[i].setAttribute('style', 'fill:' + cs.fill + ';stroke:' + cs.stroke + ';stroke-width:' + cs.strokeWidth + ';stroke-linecap:' + cs.strokeLinecap + ';stroke-linejoin:' + cs.strokeLinejoin + ';opacity:' + cs.opacity + ';fill-opacity:' + cs.fillOpacity + ';stroke-opacity:' + cs.strokeOpacity);
    });
    cl2.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    cl2.setAttribute('width', w); cl2.setAttribute('height', h);
    const xml = new XMLSerializer().serializeToString(cl2);
    if (svgCache.has(xml)) return svgCache.get(xml);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    try { await img.decode(); } catch (e) { return null; }
    if (svgCache.size > 300) svgCache.clear();
    svgCache.set(xml, img);
    return img;
  }
  function hash(s) {
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36);
  }

  /* diagnostic temporaire (40 s au démarrage) */
  function diagPanel(D) {
    const go = () => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 56px);transform:translateX(-50%);z-index:9999;background:rgba(0,0,0,.75);color:#7CFC9A;font:11px/1.35 monospace;padding:6px 8px;border-radius:8px;pointer-events:none;max-width:92vw;white-space:pre-wrap';
      document.body.appendChild(d);
      const t0 = Date.now();
      const iv = setInterval(() => {
        const W = innerWidth, H = innerHeight;
        const e = document.elementFromPoint(W / 2, H / 2);
        const cs = e ? getComputedStyle(e) : null;
        const hb = getComputedStyle(document.documentElement).backgroundColor + ' / ' + getComputedStyle(document.body).backgroundColor;
        d.textContent = 'NATIF start:' + D.start + ' style envoyé:' + D.sent + ' chargé:' + D.style + ' caméra:' + D.cam + ' marqueurs:' + N.recs.size +
          '\ncentre: ' + (e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className).slice(0, 40) + ' fond:' + cs.backgroundColor + ' opac:' + cs.opacity : '-') +
          '\nhtml/body: ' + hb;
        if (Date.now() - t0 > 40000) { clearInterval(iv); d.remove(); }
      }, 500);
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  /* ---------- Zones de l'interface : là, les touchers restent à la page ---------- */
  function startRects() {
    let t = 0, last = '';
    const run = () => {
      t = 0;
      const out = [];
      const mapEl = document.getElementById('map');
      const W = window.innerWidth, H = window.innerHeight;
      const walkR = (e, cover, clip) => {
        if (e === mapEl) return;
        const cs = getComputedStyle(e);
        if (cs.display === 'none') return;
        const r = e.getBoundingClientRect();
        let inc = false, rr2 = null;
        if (cs.pointerEvents !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) {
          let L = Math.max(r.left, clip.l, 0), T = Math.max(r.top, clip.t, 0), Rr = Math.min(r.right, clip.r, W), B = Math.min(r.bottom, clip.b, H);
          if (Rr > L && B > T) {
            rr2 = { l: L, t: T, r: Rr, b: B };
            if (!(cover && L >= cover.l && T >= cover.t && Rr <= cover.r && B <= cover.b)) { out.push(Math.round(L), Math.round(T), Math.round(Rr - L), Math.round(B - T)); inc = true; }
          }
        }
        let nclip = clip;
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') nclip = { l: Math.max(clip.l, r.left), t: Math.max(clip.t, r.top), r: Math.min(clip.r, r.right), b: Math.min(clip.b, r.bottom) };
        if (nclip.r <= nclip.l || nclip.b <= nclip.t) return;
        if (e.namespaceURI === 'http://www.w3.org/2000/svg') return;
        for (const ch of e.children) walkR(ch, inc ? rr2 : cover, nclip);
      };
      const all = { l: -1e5, t: -1e5, r: 1e5, b: 1e5 };
      for (const ch of document.body.children) walkR(ch, null, all);
      const k = out.join(',');
      if (k !== last) { last = k; call('setRects', { r: out }); }
    };
    const sched = () => { if (!t) t = setTimeout(run, 30); };
    const later = () => { sched(); setTimeout(sched, 260); setTimeout(sched, 600); };
    const mo = new MutationObserver((list) => {
      const mapEl = document.getElementById('map');
      for (const m of list) { if (!mapEl || !mapEl.contains(m.target)) { later(); return; } }
    });
    const go = () => {
      mo.observe(document.body, { attributes: true, childList: true, subtree: true, characterData: true });
      document.addEventListener('transitionend', later, true);
      document.addEventListener('animationend', later, true);
      window.addEventListener('resize', later);
      later();
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
    setInterval(sched, 1500);
  }
})();
