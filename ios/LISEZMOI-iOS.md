# ROUTA – mise à jour iPhone (carte native, écran allumé, musique, photos)

Ce fichier `RoutaMap.swift` remplace celui de ton projet Xcode. Il ajoute :
- **Carte toujours à plat** (plus d'inclinaison au doigt).
- **Écran allumé** pendant la navigation, seulement quand ROUTA est à l'écran.
- **Musique baissée** pendant une annonce vocale, puis remise à son volume (jamais coupée).
- **« Télécharger l'image »** de la story : enregistrement direct dans Photos.

## Étapes dans Xcode (menus en anglais)
1. Ouvre le projet ROUTA dans Xcode.
2. Dans la colonne de gauche (Project navigator), clique sur `RoutaMap.swift`, sélectionne tout son contenu (Cmd+A) et remplace-le par celui de ce fichier.
3. Clique sur le projet tout en haut à gauche › cible **App** › onglet **Info**.
4. Dans **Custom iOS Target Properties**, clique sur **+** et ajoute :
   - Clé : `Privacy - Photo Library Additions Usage Description`
   - Valeur : `ROUTA enregistre ici les images de tes stories de conduite.`
   (Obligatoire : sans cette ligne, l'app se ferme quand on enregistre une image.)
5. Menu **Product › Clean Build Folder**, puis **Product › Archive** pour envoyer la nouvelle version (TestFlight / App Store), comme d'habitude.

Le site (routa.ackfix.com) utilise automatiquement ces fonctions dès que la nouvelle version de l'app est installée. Avec l'ancienne version, rien ne casse : le site fait comme avant.
