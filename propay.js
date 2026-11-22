/* ROUTA – abonnement PRO : BASE, RIEN N'EST PAYANT NI ACTIVÉ.
   - ROUTA_PRO.active() dit si les fonctions PRO sont ouvertes. Tant que config.js n'a pas proPay: true, TOUT reste ouvert (tests).
   - Écran « ROUTA PRO » (prix validés le 17/11, essai 7 jours, mensuel / annuel -20 %), visible seulement en aperçu :
     ajouter ?pro=1 à l'adresse de l'app, ou proPreview: true dans config.js. Les boutons d'achat restent « Bientôt disponible ».
   - À l'activation : brancher Google Play Billing / Apple In-App Purchase (extension native, nouvelle version des apps),
     les prix affichés viendront alors des stores (dans la monnaie du téléphone). */
(function () {
  'use strict';
  const A = window.ROUTA, X = window.ROUTA_X;
  if (!A || !X) return;
  const { esc, openSheet, store } = A;
  const CFG = A.CFG || window.ROUTA_CONFIG || {};
  const T = (s, v) => { let o = (A.I18N && A.I18N.t) ? A.I18N.t(s) : s; if (v) Object.keys(v).forEach((k) => { o = o.split('{' + k + '}').join(v[k]); }); return o; };

  // Droits : lus depuis le téléphone (plus tard : confirmés par Google / Apple)
  const ent = () => store.get('routa.proEnt', null);
  window.ROUTA_PRO = {
    active: () => !CFG.proPay || !!(ent() && ent().until > Date.now()),
    payOn: () => !!CFG.proPay
  };

  // Prix validés par Ackfix (17/11). Turquie à réviser tous les 2-3 mois.
  const ZONES = [
    [['CH', 'LI'], '5,90 CHF', '56,90 CHF'],
    [['FR', 'DE', 'IT', 'AT', 'BE', 'NL', 'LU', 'MC'], '4,99 €', '47,90 €'],
    [['ES', 'PT', 'PL', 'RO', 'HR'], '3,49 €', '33,49 €'],
    [['RS', 'AL', 'XK', 'ME', 'MK', 'BA'], '2,49 €', '23,90 €'],
    [['TR'], '99,99 TL', '959,99 TL']
  ];
  const priceFor = (cc) => { const z = ZONES.find((x) => x[0].includes(cc)) || ZONES[1]; return { m: z[1], y: z[2] }; };

  const FEATS = ['Temps de conduite', 'Tournée de livraisons', 'Interdictions de circuler', 'Mes échéances', 'Cadran de conduite', 'Plusieurs véhicules', 'Spots, routes et cols', 'Convois'];

  function openPay() {
    const pr = priceFor(A.S.country || 'CH');
    let plan = 'y';
    const body = openSheet('ROUTA PRO',
      '<p class="muted" style="margin:0">' + esc(T('Toutes les fonctions avancées de ROUTA, pour la route et pour les pros.')) + '</p>' +
      '<div class="ppfeat">' + FEATS.map((f) => '<span>✓ ' + esc(T(f)) + '</span>').join('') + '</div>' +
      '<div class="ppplans">' +
        '<button class="ppplan" data-p="y"><b>' + esc(T('Annuel')) + '</b><span class="pprice">' + esc(pr.y) + '</span><span class="sub">' + esc(T('par an')) + '</span><i class="ppbadge">-20 %</i></button>' +
        '<button class="ppplan" data-p="m"><b>' + esc(T('Mensuel')) + '</b><span class="pprice">' + esc(pr.m) + '</span><span class="sub">' + esc(T('par mois')) + '</span></button>' +
      '</div>' +
      '<p class="small" style="margin:0"><b>' + esc(T('7 jours d\'essai gratuit')) + '</b></p>' +
      '<button class="btn block" id="ppBuy" disabled>' + esc(T('Bientôt disponible')) + '</button>' +
      '<button class="btn ghost" id="ppRestore" disabled>' + esc(T('Restaurer mes achats')) + '</button>' +
      '<p class="muted small">' + esc(T('Après l\'essai, l\'abonnement se renouvelle automatiquement au même prix, sauf si tu l\'annules au moins 24 h avant la fin de la période dans les réglages de ton compte Google Play ou Apple. Le paiement passe par Google Play ou l\'App Store.')) + '</p>' +
      '<p class="small"><a href="confidentialite.html" target="_blank" rel="noopener">' + esc(T('Conditions et confidentialité')) + '</a></p>' +
      (CFG.proPay ? '' : '<p class="muted small">' + esc(T('Pendant les tests, toutes les fonctions sont gratuites.')) + '</p>'), 'propay');
    const draw = () => body.querySelectorAll('.ppplan').forEach((b) => b.classList.toggle('on', b.dataset.p === plan));
    body.querySelectorAll('.ppplan').forEach((b) => { b.onclick = () => { plan = b.dataset.p; draw(); }; });
    draw();
  }

  const open0 = X.open;
  X.open = (k) => { if (k === 'propay') { openPay(); return true; } return open0 ? open0(k) : false; };
  // Aperçu uniquement (rien de visible pour les testeurs) : ?pro=1 dans l'adresse, ou proPreview dans config.js
  if (CFG.proPreview || /[?&]pro=1\b/.test(location.search)) setTimeout(openPay, 2500);
})();
