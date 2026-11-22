/* ROUTA – Mes échéances (chauffeurs professionnels) : permis, carte conducteur, OACP / code 95, contrôle médical, ADR.
   Le chauffeur entre lui-même ses dates (aucun calcul légal automatique). Rappels dans l'app à 90, 60 et 30 jours.
   Tout reste sur ce téléphone. */
(function () {
  'use strict';
  const A = window.ROUTA, X = window.ROUTA_X;
  if (!A || !X) return;
  const { esc, toast, openSheet, store } = A;
  const T = (s, v) => { let o = (A.I18N && A.I18N.t) ? A.I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };
  const LG = () => { const l = (A.I18N && A.I18N.lang) || 'fr'; return l === 'en' ? 'en-GB' : l === 'sr' ? 'sr-Latn' : l; };
  const ICO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v3M16 3v3M4 9h16"/><path d="M9 14l2 2 4-4"/></svg>';
  const KEY = 'routa.proDocs';
  const ITEMS = [
    ['permis', 'Permis de conduire'],
    ['carte', 'Carte de conducteur (tachygraphe)'],
    ['oacp', 'Formation OACP / code 95'],
    ['medical', 'Contrôle médical'],
    ['adr', 'Certificat ADR']
  ];
  const CATS = ['B', 'BE', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE'];
  const load = () => Object.assign({ dates: {}, cats: [], told: {} }, store.get(KEY, {}) || {});
  let D = load();
  const save = () => store.set(KEY, D);
  const daysTo = (v) => Math.ceil((Date.parse(v + 'T12:00') - Date.now()) / 86400000);
  // vert : plus de 90 jours · jaune : 90 jours ou moins · rouge : expirée
  const level = (v) => { if (!v) return 'none'; const d = daysTo(v); return d < 0 ? 'late' : d <= 90 ? 'soon' : 'ok'; };
  const pill = (v) => {
    const l = level(v);
    if (l === 'none') return '<span class="muted">' + esc(T('Pas de date')) + '</span>';
    const d = daysTo(v);
    const txt = l === 'late' ? T('Expirée') : d === 0 ? T('Aujourd\'hui') : T('dans {n} j', { n: d });
    return '<span class="dlpill dl-' + l + '">' + esc(txt) + '</span> <span class="muted small">' + esc(new Date(v + 'T12:00').toLocaleDateString(LG())) + '</span>';
  };

  function openDocs() {
    const counts = { ok: 0, soon: 0, late: 0 };
    ITEMS.forEach(([k]) => { const l = level(D.dates[k]); if (counts[l] != null) counts[l]++; });
    const body = openSheet(T('Mes échéances'),
      '<p class="muted small" style="margin:0">' + esc(T('Entre tes dates d\'expiration : ROUTA te prévient 90, 60 et 30 jours avant.')) + '</p>' +
      '<div class="dlsum"><span class="dlpill dl-ok">' + esc(T('{n} à jour', { n: counts.ok })) + '</span><span class="dlpill dl-soon">' + esc(T('{n} bientôt', { n: counts.soon })) + '</span><span class="dlpill dl-late">' + esc(T('{n} expirée(s)', { n: counts.late })) + '</span></div>' +
      ITEMS.map(([k, l]) => '<div class="card remrow dlrow dl-b-' + level(D.dates[k]) + '"><div class="grow"><b>' + esc(T(l)) + '</b><div class="sub" id="dls_' + k + '">' + pill(D.dates[k] || '') + '</div></div>' +
        '<input class="remdate" id="dld_' + k + '" type="date" value="' + esc(D.dates[k] || '') + '" aria-label="' + esc(T(l)) + '"></div>').join('') +
      '<h3>' + esc(T('Mes catégories de permis')) + '</h3><div class="row wrap" id="dlCats">' + CATS.map((c) => '<button class="pill tap' + (D.cats.includes(c) ? ' on' : '') + '" data-c="' + c + '">' + c + '</button>').join('') + '</div>' +
      '<p class="muted small">' + esc(T('Vérifie toujours les dates sur tes documents officiels. Ces informations restent sur ce téléphone.')) + '</p>', 'docs');
    ITEMS.forEach(([k]) => {
      const inp = body.querySelector('#dld_' + k);
      inp.onchange = () => {
        if (inp.value) D.dates[k] = inp.value; else delete D.dates[k];
        D.told[k] = {}; save();
        body.querySelector('#dls_' + k).innerHTML = pill(D.dates[k] || '');
        const row = inp.closest('.dlrow'); row.className = row.className.replace(/dl-b-\w+/, 'dl-b-' + level(D.dates[k]));
      };
    });
    body.querySelectorAll('#dlCats [data-c]').forEach((b) => {
      b.onclick = () => { const c = b.dataset.c; D.cats = D.cats.includes(c) ? D.cats.filter((x) => x !== c) : D.cats.concat(c); save(); b.classList.toggle('on', D.cats.includes(c)); };
    });
  }

  /* Rappels dans l'app : une fois par seuil (90, 60, 30 jours, puis expirée), vérifiés une fois par jour */
  function reminders() {
    const today = new Date().toISOString().slice(0, 10);
    if (store.get('routa.proDocsCheck', '') === today) return;
    store.set('routa.proDocsCheck', today);
    const due = [];
    ITEMS.forEach(([k, l]) => {
      const v = D.dates[k]; if (!v) return;
      const d = daysTo(v), told = D.told[k] || (D.told[k] = {});
      const step = d < 0 ? 'late' : d <= 30 ? '30' : d <= 60 ? '60' : d <= 90 ? '90' : null;
      if (!step || told[step]) return;
      told[step] = true; due.push([l, d]);
    });
    if (!due.length) return;
    save();
    // un seul message (les messages ne s'empilent pas) : le détail est dans « Mes échéances »
    const msg = due.length === 1 ? '<b>' + esc(T(due[0][0])) + '</b> : ' + esc(due[0][1] < 0 ? T('Expirée') : T('expire dans {n} j', { n: due[0][1] })) : '<b>' + esc(T('{n} échéances à vérifier', { n: due.length })) + '</b>';
    toast(msg, { ms: 8000, action: T('Voir'), onAction: openDocs });
  }
  setTimeout(reminders, 6000);

  /* ---------- branchement au menu ---------- */
  const tiles0 = X.tiles;
  X.tiles = () => (tiles0 ? tiles0() : []).concat([['docs', ICO, T('Mes échéances')]]);
  const open0 = X.open;
  X.open = (k) => { if (k === 'docs') { openDocs(); return true; } return open0 ? open0(k) : false; };
})();
