# Agenda de rendez-vous : VenCraft-CI

Une seule application pour l'entreprise et ses employés. L'en-tête (en haut) et la barre de navigation (en bas) restent fixes : seul le contenu au milieu défile.

## Ce que l'on peut faire
- **Agenda** : Aujourd'hui, Demain, Après-demain, **Calendrier**, et **Période personnalisée** (du … au …, raccourcis 7 jours / Ce mois / Mois dernier / Tout, et recherche par nom, téléphone ou motif). Quatre onglets : **À recevoir, Terminés, Annulés, Reportés**. Ils affichent automatiquement ce qui correspond au jour ou à la période choisie.
- **Sur chaque rendez-vous** : Appeler, WhatsApp, **Terminé, Reporter, Annuler**, Modifier, Supprimer.
  - **Reporter** : on choisit la nouvelle date (et l'heure, la même est proposée si elle est libre). L'ancien rendez-vous passe dans « Reportés », le nouveau apparaît dans « À recevoir ». Le créneau d'origine est libéré.
  - **Annuler** : motif facultatif, le créneau est libéré. « Rétablir » est possible.
  - Après un report ou une annulation, un bouton propose de prévenir le client sur WhatsApp.
- **Motif et note personnelle** : le motif décrit le rendez-vous ; la note personnelle (🔒) n'est jamais envoyée au client.
- **Rappels (1 ou 2 fois par rendez-vous)** : Réglages > Rappels : « La veille + peu avant », « La veille seulement », « Peu avant seulement » ou « Aucun », avec le nombre de minutes avant. Les rappels s'affichent dans l'application et, si vous activez les notifications, comme alertes du téléphone. **Limite** : sans serveur, aucun rappel ne peut apparaître si l'application est complètement fermée.
- **Bloc-notes** : notes écrites ou dictées, **enregistrement automatique**, catégories, couleur par note, favoris, épingles, recherche par mot, filtre par date (Aujourd'hui, 7 jours, mois, du … au …).
- **Ajouter**, **Bloquer** (jours ou heures), jours fermés chaque semaine.
- **Réglages** : nom, horaires, **durée d'un rendez-vous saisie à la main en minutes** (ou raccourcis), rappels. **Enregistrer** garde les réglages sur le téléphone et un message indique s'ils sont enregistrés ou non.

**Enregistrer ≠ Sauvegarder** : tout ce que vous faites est enregistré automatiquement sur le téléphone, sans rien télécharger. Le bouton **Sauvegarder** (Réglages) télécharge un seul fichier contenant les rendez-vous (avec leur statut), les notes et les réglages.

## Mettre l'application en ligne (obligatoire pour l'installer sur téléphone)
Un téléphone n'installe une application que si elle est sur un lien **https**. Deux façons simples :

**Option A : Netlify Drop (la plus rapide, 1 minute)**
1. Décompressez le zip sur un ordinateur.
2. Allez sur app.netlify.com/drop et glissez le **dossier décompressé**.
3. Netlify donne un lien https. Partagez ce lien à l'équipe.

**Option B : GitHub Pages**
1. Créez un dépôt GitHub, « Add file > Upload files », déposez **tout le contenu** du dossier (gardez `icons/`).
2. Settings > Pages > Source : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
3. Après 1 à 2 minutes : `https://VOTRE-NOM.github.io/VOTRE-DEPOT/`.

## Installer sur le téléphone
- **Android (Chrome)** : ouvrez le lien, touchez « Installer » (bandeau ou Réglages), ou menu ⋮ > Installer l'application.
- **iPhone (Safari)** : ouvrez le lien dans Safari, Partager > Sur l'écran d'accueil.

## Sauvegarder et restaurer les rendez-vous (sans compte, sans abonnement)
Les rendez-vous sont enregistrés **sur le téléphone** (stockage local). Pour ne jamais les perdre, ni changer de téléphone sans tout ressaisir : **Réglages > Sauvegarde des rendez-vous**.

**Sauvegarder**
1. Touchez **« Sauvegarder : télécharger le fichier »**. Un fichier `sauvegarde_rendez_vous_AAAA-MM-JJ.json` est créé (dossier Téléchargements ; sur iPhone, application Fichiers).
2. Mettez ce fichier dans **Google Drive** ou sur votre ordinateur.
3. La sauvegarde ne modifie jamais les rendez-vous existants. Un rappel apparaît dans l'agenda si la dernière sauvegarde date de plus de 7 jours.

**Restaurer sur un nouveau téléphone**
1. Ouvrez le **même lien** de l'agenda sur le nouveau téléphone.
2. Récupérez le fichier depuis Google Drive (téléchargez-le sur le téléphone).
3. Réglages > **« Restaurer ma sauvegarde »**, choisissez le fichier, vérifiez le récapitulatif, confirmez.

**Si le carnet contient déjà des données**, l'application demande de choisir : **Fusionner** (garde l'existant, ajoute ce qui manque, sans doublons) ou **Remplacer** (le carnet devient celui du fichier). Rien n'est jamais remplacé en silence, et **« Annuler la dernière restauration »** permet de revenir en arrière.

**À savoir**
- C'est une sauvegarde **manuelle**, pas une synchronisation : seul ce qui a été sauvegardé peut être restauré. Si le téléphone est perdu avant la première sauvegarde, les données ne peuvent pas être retrouvées avec le seul lien.
- Le fichier est vérifié avant toute restauration (format, version, intégrité). Un fichier modifié à la main ou abîmé est refusé.
- Sur iPhone, si l'agenda n'est pas ajouté à l'écran d'accueil, Safari peut effacer ses données après environ 7 jours sans utilisation : installez l'application et sauvegardez régulièrement.

## Partage entre téléphones (Firebase) : non utilisé
Cette version fonctionne **sans Firebase** : laissez `firebase: null` dans `config.js`. Le fichier `firestore.rules` n'est pas utilisé et peut être supprimé du dépôt.
