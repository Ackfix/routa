/*
  ROUTA – configuration
  ---------------------
  Pour activer le mode en ligne (voir les autres conducteurs, alertes partagées,
  messages, spots et prix partagés), colle ici l'adresse et la clé publique
  de ton projet Supabase (voir le guide LISEZMOI.html, étape 2).

  Si ces deux champs restent vides, l'app fonctionne en « mode solo » :
  carte, GPS, navigation, essence/recharge/parking marchent, mais les alertes
  et les spots restent uniquement sur ton téléphone.
*/
window.ROUTA_CONFIG = {
  supabaseUrl: "https://bmepkbuunwjzilgljnzl.supabase.co",   // exemple : "https://abcdefghijkl.supabase.co"
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtZXBrYnV1bndqemlsZ2xqbnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMDI5MzQsImV4cCI6MjEwOTg3ODkzNH0.Uge44-nTh35UGbM_HUlm6r5P1y6YoQJvC4ef7soF6XU",   // la clé « anon public » (ou « publishable »)

  // Services utilisés (gratuits, pas besoin d'y toucher pour le prototype)
  mapStyle: "https://tiles.openfreemap.org/styles/liberty",
  routingUrl: "https://router.project-osrm.org",
  valhallaUrl: "https://valhalla1.openstreetmap.de",   // trajets poids lourds, bus, camping-cars
  searchUrl: "https://photon.komoot.io/api/",
  overpassUrl: "https://overpass-api.de/api/interpreter",
  tomtomKey: "6GKzIRads0cuwM23GPjbELnp7WTnb2Ra",   // clé TomTom (gratuite) pour le trafic en direct

  // Nombre de testeurs visé avant l'ouverture au public (affiché dans « Mon avis »)
  testerGoal: 100,

  // Point de départ de la carte si le GPS n'est pas encore disponible (Lausanne)
  defaultCenter: [6.6323, 46.5197],
  defaultZoom: 11
};
