# SynApps — consignes pour Claude

Dépôt des mini apps publiques de l33ko, publiées sur **https://app.synapsium.com** (GitHub Pages, branche `main`, fichier `CNAME`). Tout ce qui arrive sur `main` est **immédiatement en production**.

## Règle n°0 : maquettes validées avant de coder une grosse fonctionnalité

**Grosse fonctionnalité** = nouvelle app, nouveau module ou nouvel écran, refonte d'un écran existant, nouveau parcours (connexion, partage, famille…). Les corrections de bugs, retouches de textes et petits ajustements passent directement par la règle n°1. En cas de doute, demander.

1. **Reformuler le besoin** en quelques lignes et poser les questions qui changent le design (pour qui, sur quel appareil, ce qui compte le plus). Ne pas écrire de code de l'app à ce stade.
2. **Proposer 2 ou 3 pistes de maquettes vraiment différentes** (disposition, parcours, manière d'interagir — pas seulement des couleurs), chacune montrée **sur iPhone et sur ordinateur**, avec des données fictives réalistes, en français, dans le style propre à l'app concernée (chaque app garde volontairement le sien). Les principaux enchaînements d'écrans peuvent être cliquables, sans logique réelle derrière.
   Chaque piste est dessinée par un agent **`maquettiste`** distinct, lancés **en parallèle**, chacun avec un angle différent (voir « Agents »). Chaque piste est un fichier `maquettes/<sujet>/piste-<lettre>.html`.
   Puis, **avant de pousser**, faire parcourir les pistes par l'agent **`utilisateur-temoin`** (dans la peau du public de l'app ; il les ouvre en local), corriger ce qui bloque et garder ses remarques.
3. Les publier sur une **branche `maquettes-<sujet>`**, avec `maquettes/<sujet>/index.html` : une page qui présente toutes les pistes côte à côte (chacune dans un cadre iPhone et un cadre ordinateur, avec ses points forts et ses limites, et un lien pour l'ouvrir en grand). **Pas de pull request** : cette branche n'est jamais fusionnée.
4. Donner au propriétaire le lien de la version test : `https://maquettes-<sujet>.synapps-bhl.pages.dev/maquettes/<sujet>/`, avec le résumé de l'utilisateur-témoin pour chaque piste.
5. **Attendre son choix explicite** (« piste B », « A avec le menu de C », retouches…). Les retouches se font sur la même branche, la version test se met à jour.
6. Une fois la maquette validée, coder sur une **nouvelle branche** selon la règle n°1, en respectant la maquette choisie. Rappeler le lien de la maquette dans la pull request et signaler tout écart qui s'est imposé en cours de route.

## Règle n°1 : rien ne part en production sans validation

1. **Ne jamais pousser directement sur `main`**, ni fusionner une pull request de sa propre initiative.
2. Travailler sur une **branche dédiée** au nom parlant (ex. `jardin-panneau-mobile`), créée à partir de `origin/main` à jour.
3. Pousser la branche et **ouvrir une pull request sans la fusionner**. Avant de la présenter, faire passer la **relecture indépendante** (voir « Agents » ; allégée pour une toute petite retouche) et corriger ce qu'elle trouve.
4. Donner au propriétaire :
   - le **lien de la version test** (voir ci-dessous) vers l'app concernée ;
   - un résumé simple de ce qui change et de ce qu'il faut tester ;
   - les captures d'écran iPhone et ordinateur du `testeur-appareils` (si une page a changé) ;
   - le verdict des agents en une ligne (et ce qui a été corrigé suite à leur relecture).
5. **Attendre une validation explicite** (« validé », « ok pour la prod »…) avant de fusionner (squash).
   Une demande de correction se fait sur la même branche : la version test se met à jour.
6. Après la fusion, rappeler que la mise en ligne prend quelques minutes et que le bandeau « Une nouvelle version est disponible » proposera la mise à jour.

## Versions test (Cloudflare Pages)

Le dépôt est relié à Cloudflare Pages, projet `synapps` (sous-domaine **`synapps-bhl.pages.dev`**). Chaque branche poussée obtient automatiquement une adresse de test :

```
https://<nom-de-branche>.synapps-bhl.pages.dev/<dossier-de-l-app>/
```

Exemple : `https://jardin-panneau-mobile.synapps-bhl.pages.dev/mon-jardin/`. La branche `main` y est aussi publiée (`https://synapps-bhl.pages.dev/`), simple copie de la production. Les caractères spéciaux du nom de branche deviennent des tirets ; l'adresse exacte figure aussi dans le statut « Cloudflare Pages » de la pull request.

La version test a sa propre adresse : ses données locales (plans, réglages…) sont séparées de celles de la production. Un badge orange « Version test » s'y affiche en bas à gauche.

## Deux projets Supabase : production et test

- **Synapps_public** = production : utilisé uniquement sur `app.synapsium.com` et sa copie `synapps-bhl.pages.dev` (et l'ancienne adresse `l33ko.github.io`).
- **Synapps_test** = test : utilisé partout ailleurs (versions test, maquettes, ordinateur local). Les tests n'écrivent donc jamais dans les vraies données. Redirect URL à y garder : `https://*.synapps-bhl.pages.dev/**`.
- Le choix se fait dans la constante `SB` de chaque app, selon `location.hostname`. Toute nouvelle app avec Supabase reprend la même expression ; toute nouvelle page reprend le script du badge « Version test » (placé juste avant `</body>`).
- **Changement de base de données** (tables, colonnes, règles RLS, fonctions) :
  1. le script SQL est d'abord exécuté par le propriétaire dans **Synapps_test**, et testé sur la version test ;
  2. il doit rester **compatible avec la version en ligne** : ajouter des tables ou des colonnes, ne rien supprimer ni renommer tant que la production s'en sert ;
  3. après validation, juste **avant la fusion**, le propriétaire l'exécute dans **Synapps_public**. Le rappeler explicitement au moment de demander la validation.
  Le fichier `supabase.sql` de chaque app reste le script complet à jour ; une modification ponctuelle est donnée en plus, à part, pour être exécutée sur une base existante.
- Une Edge Function modifiée se déploie de la même façon : d'abord dans Synapps_test, puis dans Synapps_public au moment de la mise en production.

Si la version test n'est pas disponible, publier la page modifiée en aperçu privé et le signaler, sans fusionner pour autant.

## Surveillance de la production

- **Remontée des erreurs** : chaque page commence, juste après `<meta charset="utf-8">`, par le script « SynApps — signalement des erreurs ». Il envoie les erreurs JavaScript des visiteurs, sans donnée personnelle (paramètres d'adresse et e-mails retirés ; table protégée contre l'abus : date imposée par le serveur, 200 erreurs par heure et 1000 par jour au plus), dans la table `erreurs` (Synapps_public en production, Synapps_test ailleurs ; script `supabase-erreurs.sql` à la racine). La table est en écriture seule depuis les apps. **Toute nouvelle page reprend ce script.**
- **Robot de surveillance** (GitHub Actions, `.github/workflows/surveillance.yml` et `outils/surveillance.mjs`). Il ouvre chaque page de production sur iPhone (moteur WebKit, celui de Safari), Android et ordinateur, lit les erreurs des visiteurs (secret GitHub `SUPABASE_SECRET_KEY`) et efface celles de plus de 90 jours. Il tourne :
  - **après chaque fusion dans `main`**, une fois GitHub Pages publié : il ne vérifie que les pages et ne publie un compte rendu que s'il trouve un problème ;
  - **chaque lundi à 7 h** (8 h en été), heure de Paris : pages et erreurs des visiteurs de la semaine, compte rendu systématique ;
  - à la main, depuis l'onglet Actions.
  Ses comptes rendus vont dans l'issue GitHub « Surveillance de la production ».
- **Toute nouvelle app** est ajoutée à la liste `PAGES` de `outils/surveillance.mjs`.
- Quand le propriétaire colle un compte rendu de la surveillance, traiter chaque point comme un bug (règle n°1 : branche, PR, validation).

## Agents

Des agents spécialisés sont définis dans `.claude/agents/`. Ce sont d'autres instances de Claude, lancées avec l'outil Agent, qui démarrent **sans connaître le travail en cours** : c'est ce qui rend leur regard utile. Leur donner dans la demande tout ce dont ils ont besoin (branche, but de la modification, apps concernées, parcours à tester).

| Agent | Rôle | Quand |
|---|---|---|
| `relecteur` | Relit la branche à froid : bugs, règles du dépôt, secrets. Rend un verdict, ne modifie rien. | Avant chaque demande de validation, sauf toute petite retouche (voir plus bas). |
| `testeur-appareils` | Ouvre les pages modifiées dans un iPhone, un Android et un ordinateur simulés, relève les erreurs, fait les captures. | Dès qu'une page change. |
| `gardien-supabase` | Vérifie qu'un script SQL ou une Edge Function est sûr pour la production et prépare le script ponctuel. | Dès qu'un `.sql` ou une Edge Function change. |
| `maquettiste` | Dessine **une** piste de maquette. | Règle n°0 : un par piste, en parallèle. |
| `utilisateur-temoin` | Parcourt les pistes ou un écran dans la peau du vrai public de l'app, relève ce qui bloque ou gêne. Ne juge pas le style : chaque app a volontairement le sien. | Règle n°0, avant de montrer les pistes ; en option sur une grosse modification d'écran. |

- **Relecture indépendante** : lancer `relecteur` et `testeur-appareils` (et `gardien-supabase` si besoin) **en même temps**, une fois le travail terminé et poussé. Corriger les points bloquants sur la même branche, puis relancer l'agent concerné si la correction est importante.
- Les agents ne poussent, ne fusionnent et ne publient rien : la session principale reste seule responsable de la branche et de la pull request.
- **Toute petite retouche** (un texte, une couleur, une icône) : le `testeur-appareils` seul suffit, sans `relecteur`.
- **Audit sur demande** : le propriétaire peut demander un passage d'agents sur plusieurs apps à la fois (un agent par app, en parallèle), par exemple pour l'accessibilité ou l'affichage sur iPhone.

## Organisation du dépôt

- Une app = un dossier avec un seul `index.html` autonome (HTML, CSS, JS dans le fichier, sans outil de build). Page d'accueil : `index.html` à la racine.
- Apps : `cahier-du-cp`, `lego-builder`, `mon-jardin`, `pixel-arts`, `recettes`, `retro-console`, `synapse`.
- Interface et textes **en français**, pensés pour iPhone autant que pour ordinateur, sans oublier Android (les visiteurs ne sont pas tous sur iPhone).
- Chaque page se termine par le script « SynApps — nouvelle version disponible ? » (bandeau de mise à jour contre le cache) : le conserver dans toute nouvelle page. Il compare les scripts et styles de la page affichée avec ceux de la page en ligne : **tout script placé après lui** (comme celui du badge « Version test ») doit porter l'attribut `data-runtime`, sinon le bandeau s'affiche à tort à chaque ouverture.
- Synchronisation des apps publiques : projets Supabase **Synapps_public** / **Synapps_test** (voir plus haut ; URL et clé publique *publishable* dans la constante `SB` de chaque app), session commune `synapps-auth`, connexion par lien reçu par e-mail (envoi via Brevo). Les scripts `supabase.sql` de chaque app sont à exécuter par le propriétaire dans le SQL Editor. Ne jamais mettre de clé secrète (`service_role`, `sb_secret_…`) dans le dépôt.
- Messages de commit et descriptions de pull request en français.
