/* ROUTA – compte Google / Apple (BASE, PAS ENCORE ACTIVÉE).
   Ne fait rien tant que config.js n'a pas loginProviders: { google: true, apple: true }.
   Une fois activé :
   - après la connexion (page connexion.html), la fiche de ce téléphone est rattachée au compte (RPC routa_link, preuve = secret de l'appareil) ;
   - sur un nouveau téléphone sans profil, la fiche du compte est retrouvée (RPC routa_restore) ;
   - « Mon profil » montre le compte et permet de se déconnecter.
   Mobile natif (Android / iPhone) : il faudra ouvrir la connexion dans le navigateur du système et revenir dans l'app par un lien
   (schéma com.ackfix.routa) : Google refuse la connexion dans une vue web intégrée. À faire avec la prochaine version native. */
(function () {
  'use strict';
  const CFG = window.ROUTA_CONFIG || {};
  const ON = CFG.loginProviders || {};
  if (!Object.keys(ON).some((k) => ON[k]) || !window.supabase) return;
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true, storageKey: 'routa.auth' } });
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };
  const T = (s) => (window.ROUTA && window.ROUTA.I18N ? window.ROUTA.I18N.t(s) : s);
  let session = null;

  async function sync() {
    const r = await sb.auth.getSession(); session = r && r.data ? r.data.session : null;
    if (!session) return;
    const me = get('routa.me'), secret = get('routa.secret');
    if (me && me.id && secret) {
      if (get('routa.linked') !== session.user.id) { const x = await sb.rpc('routa_link', { did: me.id, s: secret }); if (x && x.data === true) set('routa.linked', session.user.id); }
      return;
    }
    // nouveau téléphone : on retrouve la fiche du compte, puis on recharge l'app avec ce profil
    const x = await sb.rpc('routa_restore');
    const d = x && x.data;
    if (d && d.id && d.secret) {
      set('routa.secret', d.secret);
      set('routa.me', { id: d.id, pseudo: d.pseudo || '', code: d.code || '', color: d.color || null, car: d.car || '', vis: d.visibility || 'tous', points: d.points || 0, friends: [] });
      set('routa.linked', session.user.id);
      location.replace(location.pathname);
    }
  }

  function fillProfile() {
    const box = document.getElementById('pfAccount');
    if (!box || box.dataset.done) return;
    box.dataset.done = '1';
    const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    if (session) {
      const prov = ((session.user.app_metadata || {}).provider || '').replace(/^./, (c) => c.toUpperCase());
      box.innerHTML = '<div class="card"><div class="grow"><b>' + esc(T('Compte')) + '</b><div class="sub">' + esc(T('Connecté avec {p}').replace('{p}', prov || 'Google')) + '</div></div><button class="btn ghost small" id="acOut">' + esc(T('Se déconnecter')) + '</button></div>';
      box.querySelector('#acOut').onclick = async () => { await sb.auth.signOut(); set('routa.linked', null); session = null; box.dataset.done = ''; fillProfile(); };
    } else {
      box.innerHTML = '<a class="card tap" href="connexion.html"><div class="grow"><b>' + esc(T('Se connecter')) + '</b><div class="sub">' + esc(T('Retrouve ton profil sur un autre téléphone (Google ou Apple).')) + '</div></div></a>';
    }
  }

  sync().catch(() => { /* hors ligne : on réessaiera au prochain lancement */ });
  const sheet = document.getElementById('sheetBody');
  if (sheet) new MutationObserver(fillProfile).observe(sheet, { childList: true });
})();
