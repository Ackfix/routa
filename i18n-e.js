/* ROUTA – textes ajoutés après les langues (toutes les langues, indexés par le texte français) */
window.ROUTA_I18N_X2 = (function () {
  const F = [
    "Au volant, ne touche pas ton téléphone : demande à un passager, utilise le micro ou arrête-toi.",
    "Pas de mention de contrôles de police ou de radars : c'est interdit en Suisse.",
    "Images satellite : swisstopo (Suisse), Sentinel-2 cloudless – EOX (monde).",
    "Supprimer mes données",
    "Touche encore pour tout effacer (définitif)",
    "Suppression…",
    "Tes données ont été supprimées.",
    "Confidentialité et règles d'utilisation",
    "Confidentialité",
    "Destinations",
    "Signaler",
    "Aucune destination enregistrée : ajoute des favoris sur ton téléphone.",
    "Alerte envoyée"
  ];
  const T = {
    en: ["While driving, don't touch your phone: ask a passenger, use the microphone or stop.", "No mention of police checks or speed cameras: it's illegal in Switzerland.", "Satellite images: swisstopo (Switzerland), Sentinel-2 cloudless – EOX (world).", "Delete my data", "Tap again to erase everything (permanent)", "Deleting…", "Your data has been deleted.", "Privacy and terms of use", "Privacy", "Destinations", "Report", "No saved destinations: add favourites on your phone.", "Alert sent"],
    tr: ["Sürüş sırasında telefonuna dokunma: bir yolcudan iste, mikrofonu kullan ya da dur.", "Polis kontrolü veya radar bildirmek yasak: İsviçre'de bu yasaktır.", "Uydu görüntüleri: swisstopo (İsviçre), Sentinel-2 cloudless – EOX (dünya).", "Verilerimi sil", "Her şeyi silmek için tekrar dokun (kalıcı)", "Siliniyor…", "Verilerin silindi.", "Gizlilik ve kullanım kuralları", "Gizlilik", "Hedefler", "Bildir", "Kayıtlı hedef yok: telefonundan favori ekle.", "Uyarı gönderildi"],
    de: ["Am Steuer das Handy nicht berühren: Frag einen Beifahrer, nutze das Mikrofon oder halte an.", "Keine Hinweise auf Polizeikontrollen oder Radare: Das ist in der Schweiz verboten.", "Satellitenbilder: swisstopo (Schweiz), Sentinel-2 cloudless – EOX (Welt).", "Meine Daten löschen", "Nochmals tippen, um alles zu löschen (endgültig)", "Wird gelöscht…", "Deine Daten wurden gelöscht.", "Datenschutz und Nutzungsregeln", "Datenschutz", "Ziele", "Melden", "Keine gespeicherten Ziele: Füge auf deinem Handy Favoriten hinzu.", "Warnung gesendet"],
    it: ["Alla guida non toccare il telefono: chiedi a un passeggero, usa il microfono o fermati.", "Nessun riferimento a controlli di polizia o radar: è vietato in Svizzera.", "Immagini satellitari: swisstopo (Svizzera), Sentinel-2 cloudless – EOX (mondo).", "Elimina i miei dati", "Tocca di nuovo per cancellare tutto (definitivo)", "Eliminazione…", "I tuoi dati sono stati eliminati.", "Privacy e regole d'uso", "Privacy", "Destinazioni", "Segnala", "Nessuna destinazione salvata: aggiungi dei preferiti sul telefono.", "Segnalazione inviata"],
    pt: ["Ao volante, não toques no telemóvel: pede a um passageiro, usa o microfone ou para.", "Sem menção a controlos policiais ou radares: é proibido na Suíça.", "Imagens de satélite: swisstopo (Suíça), Sentinel-2 cloudless – EOX (mundo).", "Apagar os meus dados", "Toca de novo para apagar tudo (definitivo)", "A apagar…", "Os teus dados foram apagados.", "Privacidade e regras de utilização", "Privacidade", "Destinos", "Assinalar", "Nenhum destino guardado: adiciona favoritos no telemóvel.", "Alerta enviado"],
    es: ["Al volante, no toques el móvil: pide ayuda a un pasajero, usa el micrófono o detente.", "Nada de mencionar controles policiales o radares: está prohibido en Suiza.", "Imágenes de satélite: swisstopo (Suiza), Sentinel-2 cloudless – EOX (mundo).", "Borrar mis datos", "Toca otra vez para borrarlo todo (definitivo)", "Borrando…", "Tus datos se han borrado.", "Privacidad y normas de uso", "Privacidad", "Destinos", "Avisar", "No hay destinos guardados: añade favoritos en tu móvil.", "Alerta enviada"],
    sq: ["Në timon mos e prek telefonin: kërkoji një pasagjeri, përdor mikrofonin ose ndalo.", "Asnjë përmendje e kontrolleve të policisë ose radarëve: është e ndaluar në Zvicër.", "Imazhet satelitore: swisstopo (Zvicër), Sentinel-2 cloudless – EOX (bota).", "Fshi të dhënat e mia", "Prek përsëri për të fshirë gjithçka (përfundimisht)", "Duke fshirë…", "Të dhënat e tua u fshinë.", "Privatësia dhe rregullat e përdorimit", "Privatësia", "Destinacionet", "Sinjalizo", "Asnjë destinacion i ruajtur: shto të preferuara në telefon.", "Sinjalizimi u dërgua"],
    sr: ["Za volanom ne diraj telefon: zamoli suvozača, koristi mikrofon ili stani.", "Bez pominjanja policijskih kontrola ili radara: to je zabranjeno u Švajcarskoj.", "Satelitski snimci: swisstopo (Švajcarska), Sentinel-2 cloudless – EOX (svet).", "Obriši moje podatke", "Dodirni ponovo da obrišeš sve (trajno)", "Brisanje…", "Tvoji podaci su obrisani.", "Privatnost i pravila korišćenja", "Privatnost", "Odredišta", "Prijavi", "Nema sačuvanih odredišta: dodaj omiljene na telefonu.", "Upozorenje poslato"]
  };
  const out = {};
  Object.keys(T).forEach((l) => { out[l] = {}; F.forEach((f, i) => { out[l][f] = T[l][i]; }); });
  return out;
})();
