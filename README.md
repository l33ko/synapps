# SynApps

Petites applications web, simples et accessibles à tous. Chaque application tient (sauf Rétro Console) dans un seul fichier `index.html` et fonctionne directement dans le navigateur, sur ordinateur comme sur téléphone.

La page d'accueil ([`index.html`](index.html)) présente toutes les applications, avec un lien vers chacune.

| Application | Dossier | Description |
|---|---|---|
| Mon cahier du CP | [`cahier-du-cp/`](cahier-du-cp/) | Lecture, écriture et calcul pour les enfants de CP. |
| Recettes | [`recettes/`](recettes/) | Carnet de recettes partagé en famille, avec import depuis un lien. |
| Synapse | [`synapse/`](synapse/) | Entraînement cérébral : 5 exercices au hasard par jour, 20 jeux, suivi de performance par thème. |
| Mon jardin | [`mon-jardin/`](mon-jardin/) | Éditeur de plan de jardin à l'échelle, façon paysagiste. |
| Lego Builder | [`lego-builder/`](lego-builder/) | Constructions Lego en 3D à monter pas à pas, pour les 8-10 ans. |
| Pixel arts | [`pixel-arts/`](pixel-arts/) | Modèles de pixel art à recopier sur papier ou en perles à repasser. |
| Rétro Console | [`retro-console/`](retro-console/) | Émulateur de consoles rétro (SNES, NES, Neo Geo, Mega Drive, Game Boy…) dans le navigateur. |

## Recettes

Le carnet de recettes de la famille, partagé entre plusieurs personnes et appareils :

- **Compte par e-mail**, sans mot de passe : code à 6 chiffres reçu par e-mail, à recopier dans l’app (le lien de l’e-mail marche aussi s’il s’ouvre dans le même navigateur). Le compte est commun aux apps SynApps.
- **Familles** : chaque compte commence avec « Mon carnet de recettes ». Un lien ou un code d'invitation (ex. `K7P-42Q`) permet d'y faire entrer d'autres personnes, qui voient et modifient les mêmes recettes. L'admin renomme la famille, retire des membres, change le code. On peut appartenir à plusieurs familles et passer de l'une à l'autre.
- **Temps réel** : une recette ajoutée ou modifiée sur un téléphone apparaît aussitôt sur les autres.
- **Import depuis un lien** (Marmiton, 750g, blogs…) : la recette est extraite et la fiche créée automatiquement.
- **Fiche** : portions ajustables (quantités recalculées), ingrédients et étapes à cocher, écran maintenu allumé, « ajoutée par … ».
- **Recettes d’exemple** : chaque nouveau carnet démarre avec 5 recettes (gougères, crackers aux graines, gaufres, gâteau au chocolat, tarte au citron meringuée), rédigées pour SynApps. Elles sont dans la table `recettes_exemples` ; un carnet existant peut les ajouter depuis l’écran vide.
- **Mon compte** : export des recettes en `.json`, suppression du compte. Page [confidentialité](recettes/confidentialite.html).

### Mise en place (projet Supabase public)

1. **SQL Editor** : exécuter [`recettes/supabase.sql`](recettes/supabase.sql) (tables `familles`, `membres_famille`, `recettes`, règles d'accès, temps réel).
2. **Edge Functions → Deploy a new function → Via Editor** : nom `import-recette`, coller [`recettes/import-recette.ts`](recettes/import-recette.ts), laisser « Verify JWT » activé.
3. **Authentication → URL Configuration → Redirect URLs** : ajouter `https://app.synapsium.com/**` (et `https://l33ko.github.io/synapps/**` tant que l’ancienne adresse sert).
4. Les e-mails de connexion partent par le SMTP configuré dans le projet (Brevo) ; les modèles « Magic Link » et « Confirm signup » doivent contenir le code `{{ .Token }}` (et peuvent garder le lien `{{ .ConfirmationURL }}`).

## Mises à jour

Les navigateurs gardent une copie des pages : après une mise en ligne, un appareil peut continuer d'afficher l'ancienne version (surtout sur iPhone et depuis l'écran d'accueil). Chaque app vérifie donc, à l'ouverture et quand on y revient, si son code en ligne a changé ; si oui, un bandeau « Une nouvelle version est disponible » propose **Mettre à jour**, qui recharge la page en contournant la copie gardée en mémoire.

## Synapse

Un entraînement cérébral court, façon Peak : chaque jour, 5 exercices tirés au hasard (le même tirage sur tous les appareils), environ 7 minutes.

- **20 jeux en 7 thèmes** : mémoire, attention, vitesse, calcul mental, logique, visuo-spatial, langage. Chaque jeu dure 45 secondes à 1 minute et ajuste sa difficulté (niveau de 1 à 20).
- **Accueil** : séance du jour, suivi quotidien (série et semaine), score global et une tuile par thème.
- **Jeux** : tous les jeux, pour s'entraîner librement.
- **Performance** : courbe par thème et globale (7 jours, 30 jours, tout), records par jeu, historique.
- **Compte** (facultatif) : connexion par e-mail, sans mot de passe (même compte que Recettes et Mon jardin). Les résultats sont sauvegardés et retrouvés sur tous les appareils ; sans compte, ils restent dans le navigateur. Le suivi mesure des progrès dans les exercices, pas un QI.

Pour activer la sauvegarde, exécuter [`synapse/supabase.sql`](synapse/supabase.sql) dans le SQL Editor du projet Supabase public (table `synapse_profil`, une ligne par compte, visible uniquement par son propriétaire).

## Mon jardin

Concevoir et visualiser son jardin, à l'échelle :

- **Plusieurs plans nommés**, retrouvés sur la page d'accueil (aperçu, surface, nombre de végétaux) ; renommer, dupliquer, exporter, supprimer.
- **Trois façons de commencer** : feuille blanche (rectangle), contour libre point par point, ou photo aérienne / plan scanné mis à l'échelle à partir d'une distance connue.
- **Relevé de l'existant sur la photo** : détection automatique des arbres et des piscines (à valider d'un toucher), et outils rapides pour tracer maison, piscine, terrasse, arbres et arbustes existants.
- **Formes orientables** : toute zone carrée ou rectangulaire (maison, piscine, terrasse, potager, serre…) pivote avec sa poignée, au degré près.
- **Palette végétale commune à tous les plans** (bouton ⚙), plus de 200 espèces dont une large sélection méditerranéenne, rangées par catégories : fruitiers à noyau, à pépins, à coque, agrumes, autres fruitiers, arbres d'ombrage, arbustes et haies, grimpantes, subtropicaux, potager, fleurs. Chaque espèce regroupe ses variétés ; on ajoute, modifie ou supprime espèces et variétés pour tous les plans à la fois. Sur le plan, l'espèce s'affiche en gras et la variété en petit italique.
- **Aménagements** : maison, terrasse, piscine, potager, poulailler, serre, bassin, ruche, chemins, clôtures, haies, irrigation, repères et étiquettes.
- **Deux vues** : détaillée (avec les noms des végétaux) et simplifiée ; curseur de croissance (de la plantation à l'âge adulte) ; contrôle des distances de plantation par rapport aux limites (art. 671 du Code civil).
- **Export** du plan en image PNG et en sauvegarde `.json`, importable sur un autre appareil.
- **Partage par lien** : 🔗 sur un plan crée un lien qui contient tout le plan ; la personne qui l'ouvre l'ajoute à ses propres plans et récupère les espèces et variétés dans sa palette. Aucun compte ni serveur.
- **Jardin-forêt** : chaque espèce a une strate (canopée, petits arbres, arbustes, herbacées, couvre-sol, racines, grimpantes) et des fonctions (fixatrice d'azote, mellifère, accumulatrice, brise-vent, fourragère), réglables dans la palette ; vue « Strates », filtres par fonction et bilan dans l'inventaire.
- **Import / export de la palette** en tableur (`.csv`) ou en fichier `.json`. Des palettes prêtes à charger se trouvent dans [`mon-jardin/palettes/`](mon-jardin/palettes/), dont la liste complète du jardin-forêt Sylvaniers.

Un exemple de plan est fourni au premier lancement : une maison avec piscine et un jardin méditerranéen.

Les plans sont enregistrés dans le navigateur de l'appareil utilisé, sans compte. Pour les retrouver sur plusieurs appareils, deux possibilités :

- **☁ Synchroniser** (facultatif) : on saisit son e-mail et on recopie le code à 6 chiffres reçu, sans mot de passe. Les plans, leurs photos de fond et la palette végétale se synchronisent ensuite automatiquement entre tous les appareils connectés à la même adresse (quelques secondes après chaque modification, à l'ouverture et toutes les minutes). Si un plan a été modifié sur deux appareils, la version la plus récente l'emporte. L'app reste utilisable sans connexion et rattrape au retour du réseau. La session est commune aux apps SynApps.
- **Export / import** d'un plan en fichier `.json`, ou partage par lien.

### Activer la synchronisation (Supabase)

« Mon jardin » utilise le projet Supabase des apps publiques (« Synapps_public »), déjà renseigné dans la constante `SB` de `mon-jardin/index.html`, avec la même session que les autres apps SynApps.

1. **SQL Editor** : exécuter [`mon-jardin/supabase.sql`](mon-jardin/supabase.sql). Il crée les tables `jardin_plans` (un plan par ligne, avec sa photo de fond) et `jardin_palette` (la palette du compte), et leurs règles d'accès : chaque compte ne voit que ses lignes.
2. **Authentication → URL Configuration → Redirect URLs** : `https://app.synapsium.com/**` doit y figurer. Le lien de l'e-mail ramène sur la page de l'app, déjà connecté.
3. Les e-mails de connexion partent par le SMTP configuré dans le projet (Brevo).

La connexion se fait par un lien reçu par e-mail, à ouvrir sur l'appareil à connecter. Si le modèle d'e-mail contient aussi le code (`{{ .Token }}`), on peut le saisir dans l'app à la place.

Si la constante `SB` est vide, le bouton ☁ n'apparaît pas et l'app fonctionne comme avant.

## Pixel arts

Des modèles de pixel art pour les enfants, à recopier sur papier quadrillé ou à reproduire en perles à repasser :

- **Catalogue de 30 modèles originaux** (animaux, mer, nature, fruits, objets, fêtes), avec la taille, le nombre de perles et un niveau de difficulté.
- **Mode papier** : grille avec repères (chiffres et lettres) et un trait plus marqué tous les 5 carreaux ; option « Numéros » + « Grille vide » pour un coloriage magique.
- **Mode perles** : le modèle sur une plaque à picots, avec la liste des perles à préparer par couleur et le total.
- **Image à garder** : une image du modèle avec sa légende, à enregistrer ou imprimer.
- **Invente un modèle** (onglet Créer) : on tape un mot (« dragon », « tracteur »…) ou on touche une suggestion, et l'app propose 6 pixel arts originaux dessinés par Claude, aux couleurs des perles ; on agrandit une idée (taille, perles par couleur, papier / perles) puis on l'ajoute à « Mes modèles ». Les mots inadaptés aux enfants et les personnages protégés sont refusés, avec des idées de remplacement ; un bouton 🔊 lit les consignes. Fonctionne avec l'Edge Function [`pixel-arts/genere-pixel.ts`](pixel-arts/genere-pixel.ts) (clé API Claude dans les secrets Supabase) et la table de [`pixel-arts/supabase.sql`](pixel-arts/supabase.sql), qui plafonne le nombre de recherches par jour.
- **Créer** : transformer une image en pixel art (taille et nombre de couleurs réglables, couleurs de perles courantes) ou dessiner case par case. Les créations s'ajoutent au catalogue dans « Mes modèles », enregistrées dans le navigateur de l'appareil.

## Rétro Console

Une console de jeux rétro dans le navigateur, sur ordinateur comme sur iPhone :

- **8 familles de consoles** : Super Nintendo, NES, Neo Geo / Arcade (FBNeo), Mega Drive (+ Master System, Game Gear), Game Boy / Color, Game Boy Advance, PC Engine, Atari 2600.
- **Commandes** : boutons tactiles sur téléphone, clavier ou manette sur ordinateur ; sauvegardes et états de jeu dans le menu de l'émulateur.
- **Ludothèque** : les jeux lancés sont gardés dans le navigateur pour les relancer en un geste. Le BIOS Neo Geo (`neogeo.zip`) est mémorisé après le premier chargement.
- **Fichiers acceptés** : ROM non compressée ou `.zip` (le `.7z` n'est pas pris en charge).

Aucun jeu n'est fourni : utilisez des jeux libres (homebrew, par exemple sur itch.io, PDRoms ou Homebrew Hub) ou vos propres sauvegardes de cartouches.

Contrairement aux autres applications, celle-ci n'est pas un fichier unique : elle embarque [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) 4.2.3 et des cœurs libretro dans [`retro-console/data/`](retro-console/data/), sous licence GPL-3.0 (voir [`retro-console/data/LICENSE`](retro-console/data/LICENSE)). Modifications apportées : décompression des archives par [fflate](https://github.com/101arrowz/fflate) au lieu des extracteurs d'origine, cœurs reconditionnés en `.zip` (extension `.wasm`), chargement du cœur sans URL `blob:` pour respecter une politique de sécurité stricte, et désactivation de la vérification de mise à jour.

