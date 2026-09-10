# Filoustics — secrétariat associatif local

Une application Windows pour préparer les réunions, rédiger les procès-verbaux et conserver la mémoire d’une crèche parentale. Interface ardoise et sauge, conçue pour Microsoft Edge dans une fenêtre de **879 × 645 pixels**. Le tableau de bord occupe aussi toute la largeur dans une grande fenêtre. Aucun compte, aucune base de données, aucun service distant.

[**Aperçu en images**](docs/apercu.md) : une capture d’écran par espace de l’application.

## Prérequis

- Windows 10 ou 11 et Microsoft Edge installé.
- Node.js **24 LTS**, version 24.13 ou supérieure. Le lanceur reconnaît votre installation `D:\js\nodejs`.
- Un dossier local accessible en écriture pour les données de l’association, par exemple `C:\CrecheParentale`.
- Internet uniquement pour la première installation des dépendances. Toutes les fonctionnalités, PDF compris, fonctionnent ensuite sans Internet. Aucune ressource d’interface ne vient d’un CDN.

## Installation

Depuis ce dossier, dans PowerShell :

```powershell
$env:PATH = "D:\js\nodejs;" + $env:PATH
npm.cmd install
npm.cmd run build
```

`package-lock.json` verrouille les dépendances. Pour réinstaller exactement ces versions : `npm.cmd ci`.

## Lancement quotidien

**Double-cliquer sur `Demarrer.cmd`.** Le lanceur installe les dépendances et compile si nécessaire, puis démarre l’application et ouvre Edge.

L’adresse locale par défaut est **http://127.0.0.1:4317**. Si Edge ne s’ouvre pas automatiquement, saisir cette adresse dans Edge. Le serveur démarre en arrière-plan et la fenêtre du lanceur se ferme automatiquement. Le lanceur vérifie l’identité du serveur et empêche les démarrages simultanés. À chaque double-clic, il compare une empreinte du code source à celle utilisée lors du dernier démarrage : si rien n’a changé, l’instance déjà en cours s’ouvre aussitôt sans reconstruction ; si le code a changé depuis, il arrête proprement cette instance (fermeture normale, y compris du moteur PDF), recompile, puis redémarre — même si l’instance précédente tournait encore en arrière-plan. Ses erreurs sont affichées dans la console ; celles du serveur sont conservées dans `.local/demarrage.log`. Fermer l’onglet Edge ne supprime aucune donnée.

Le raccourci **Filoustics** du Bureau utilise ce même lanceur. Node.js et Edge doivent rester installés. Pour diagnostiquer le démarrage sans ouvrir de fenêtre : `node scripts/launch.mjs --check`.

Pour démarrer manuellement avec la console ouverte :

```powershell
npm.cmd run start
```

Au premier démarrage, saisir le nom de l’association et le chemin du répertoire de travail. L’application accepte un **dossier vide** ou un **dossier Filoustics existant valide**. Elle refuse d’initialiser un dossier non vide qui ne correspond pas à son format.

Choisir un répertoire **hors OneDrive, Dropbox ou autre dossier synchronisé**, conformément au fonctionnement local souhaité. Le code source peut résider dans le dossier actuel ; le répertoire métier est choisi séparément. L’application ne configure ni n’utilise de synchronisation.

## Utilisation

- **Accueil** : prochaine réunion, préparation, trois prochaines dates et actions en attente.
- **Réunions** : un type principal et un second type facultatif, obligatoirement différent. Les filtres reconnaissent les deux types, qui apparaissent aussi dans les PDF et leurs noms de fichiers. Lieu « À la crèche » ou saisie libre. Création rapide puis onglets Résumé, Ordre du jour, Convocation, PV et Documents.
- **Ordre du jour** : ajout, édition, duplication et déplacement par flèches. Les notes internes restent hors des PDF.
- **Convocation** : destinataires issus des membres, génération locale, ouverture et régénération PDF, date d’envoi saisie manuellement. Aucun e-mail n’est envoyé.
- **PV** : présences, absences, excusés, procurations, échanges, décisions, votes facultatifs, actions liées et heure de clôture. Enregistrer avant de prévisualiser. La validation protège la réunion dans l’interface et l’API ; sa réouverture nécessite une confirmation. Régénérer le PDF après la validation pour y faire apparaître sa date.
- **Actions** : statut, responsable, échéance et lien vers la réunion source. Après création depuis une décision, compléter le responsable et l’échéance dans Actions.
- **Agenda** : dates de début et de fin, identiques par défaut. Une période (catégorie « Vacances » par exemple) apparaît chaque jour, début et fin inclus. Les événements en cours restent visibles sur l’accueil. Les liens vers une réunion et une action sont regroupés sur une même ligne. Les réunions et échéances d’actions apparaissent aussi automatiquement ; leur sélection ouvre leur fiche source.
- **Documents** : import, ouverture, renommage, changement de catégorie, archivage et corbeille. Formats acceptés : PDF, TXT, PNG, JPG, JPEG, DOCX, XLSX, ODT et ODS, jusqu’à 20 Mo. Les PDF, images et textes s’ouvrent dans Edge ; les formats bureautiques sont proposés au téléchargement. L’application n’exécute jamais un fichier importé.
- **Membres** : nom et prénom dans un seul champ, prénom de l’enfant facultatif, fonction et coordonnées utiles au secrétariat. Pas de dates d’entrée ou de sortie à renseigner.
- **Planning** : emploi du temps hebdomadaire des créneaux de garde, chacun associé à un membre responsable, avec heure de début et de fin. Navigation semaine par semaine ; un créneau s’ouvre en cliquant dessus pour être modifié ou supprimé (récupérable depuis la corbeille). Un créneau peut se **répéter chaque semaine** jusqu’à une date choisie (deux ans au maximum) : la même personne et le même horaire couvrent alors toutes les semaines concernées en une seule saisie. Modifier ou supprimer une occurrence d’une répétition propose ensuite le choix entre « cette occurrence seulement » et « cette occurrence et toutes les suivantes », pour ajuster une exception ponctuelle sans toucher au reste de l’année ou, au contraire, répercuter un changement durable sur toutes les semaines à venir.
- **Contacts** : répertoire des interlocuteurs extérieurs à l’association (CAF, PMI, mairie, assurance, fournisseurs…), avec structure, fonction et coordonnées. Distinct des Membres, qui reste réservé au bureau et aux adhérents.
- **Recherche** : réunions, documents, membres, actions, dates importantes, créneaux de planning et contacts.
- **Notes** : création, lecture et modification de notes avec catégorie libre et niveau Normal, Important ou Prioritaire. Recherche dans le titre et le contenu, filtres cumulables par catégorie et importance, tris par modification (récente ou ancienne), titre, importance et catégorie. Les notes apparaissent aussi dans la recherche globale et sont protégées par les sauvegardes et la corbeille.
- **Statistiques** : indicateurs calculés à partir des données déjà présentes — réunions par statut et par type, taux de présence moyen sur les PV clôturés, actions en retard et taux de complétion, membres actifs par fonction, documents par catégorie, répartition des créneaux de garde par responsable, notes par importance.
- **Rappel automatique avant une réunion** : un bandeau apparaît sur tous les écrans dès qu’une réunion à venir entre dans la fenêtre définie par **Paramètres → Rappel avant une réunion (jours)** (3 jours par défaut, réglable de 0 à 30). Le bandeau se ferme d’un clic pour la session en cours et réapparaît au prochain démarrage tant que la réunion approche. Aucune notification n’est envoyée en dehors de l’application : sans service en tâche de fond ni e-mail, ce rappel n’est visible que lorsque Filoustics est ouvert.

Raccourcis : `Ctrl+N` nouvelle réunion, `Ctrl+S` enregistrer le formulaire ouvert, `Ctrl+K` rechercher, `Échap` fermer un dialogue.

Les membres actifs et inactifs sont comptés dans la rubrique Membres et ses filtres. Les anciennes fonctions « Président » et « Trésorier adjoint » s’affichent désormais comme « Présidente » et « Vice-trésorière », sans réécriture automatique des fichiers.

Le lieu d’une réunion peut être « À la crèche », « En ligne » ou une saisie libre. Dans la convocation et le PV, « Ajouter tous les membres actifs » ajoute les membres manquants sans doublon ni remise à zéro des présences déjà saisies. Les choix individuels affichent le parent suivi du prénom de l’enfant entre parenthèses. La convocation affiche uniquement les destinataires ; les présences et procurations sont renseignées dans l’onglet PV.

Dans les listes de participants des PDF, seul le prénom de l’enfant est imprimé. Si ce prénom manque, « Enfant non renseigné » remplace le nom du parent. Les procurations utilisent également les prénoms des enfants. Le total Pour + Contre + Abstention d’un vote est limité au nombre de membres présents et représentés par procuration : contrôle de saisie, contrôle à l’enregistrement, à la validation et à la génération du PV. Si une présence change après la saisie d’un vote et rend le total invalide, corrigez le vote avant d’enregistrer.

Le lien « Ouvrir le PV PDF » se trouve en haut, à côté de « Générer PDF ». Aucun bloc de signature n’est imprimé dans les PV, ordres du jour ou convocations : ni Bureau, ni Présidence, ni Secrétariat, ni signature HTML. Les anciens champs Secrétaire et Président ne sont plus proposés dans les paramètres. Les PDF présentent un encadré date/horaires/lieu, des décisions et votes distincts, un tableau des actions et un pied de page avec le nom de l’association et la pagination.

Les confirmations sont intégrées à l’interface, sans `alert`, `confirm` ou `prompt` JavaScript. Les modifications non enregistrées d’une réunion sont conservées temporairement dans l’onglet et proposées à la reprise après un rechargement. Ce brouillon ne remplace pas l’enregistrement ni les sauvegardes ; il disparaît avec la fermeture définitive de la session du navigateur.

### Signature et logo des PDF

Dans **Paramètres → Présentation des PDF**, choisissez un logo unique (PNG, JPEG ou WebP, jusqu’à 10 Mo avant préparation). L’image est redimensionnée à 1 200 pixels maximum et conservée en PNG de moins de 1 Mo dans `config.json`. Une nouvelle sélection remplace la précédente ; « Retirer le logo » rétablit le nom de l’association en haut des documents. Le logo fait partie des sauvegardes et restaurations.

La **signature HTML** reste conservée dans les paramètres et les sauvegardes, avec son aperçu et son filtrage de sécurité, mais elle n’est plus imprimée dans les PDF. Le logo reste vérifié avant l’enregistrement et la génération. Les documents utilisent une pagination discrète et des marges fixes.

Les PDF existants restent conservés. Régénérez un document pour y appliquer les nouveaux paramètres ; la version précédente est sauvegardée.

## Organisation des données

```text
C:\CrecheParentale\
├── config.json
├── membres.json
├── notes.json
├── agenda.json
├── actions.json
├── planning.json           # créneaux de garde
├── contacts.json           # interlocuteurs extérieurs
├── documents.json          # index documentaire
├── reunions\
│   └── 2026\
│       └── 2026-09-15_CA_<identifiant>\
│           ├── reunion.json
│           ├── Convocation_CA_2026-09-15.pdf
│           ├── OrdreDuJour_CA_2026-09-15.pdf
│           ├── PV_CA_2026-09-15.pdf
│           └── ...html     # modèles remplis, indépendants de l’interface
├── documents\
│   ├── statuts\
│   ├── reglements\
│   ├── conventions\
│   ├── administratif\
│   └── divers\
├── sauvegardes\
├── corbeille\
└── logs\
```

Chaque réunion possède son JSON. Son dossier conserve sa date et son type **initiaux** pour éviter un déplacement multiple lors d’un changement de date. Les nouveaux PDF utilisent toujours la date et le type actuels. Les documents importés ont un nom physique basé sur leur identifiant ; leur nom lisible et leur description figurent dans `documents.json`.

Le chemin choisi est enregistré dans `.local/application.json`, près du programme. Ce petit fichier ne contient pas les données métier. Le journal technique principal est `.local/logs/application.log`, accessible depuis Paramètres ; il reste disponible même si le dossier de données devient inaccessible. Il ne contient ni documents, ni coordonnées des membres.

Compatibilité : les anciens champs `prenom` et `nom` des membres sont regroupés en `nomComplet` à la lecture. Les anciens événements d’une journée reçoivent une fin identique au début, et les réunions existantes conservent leur type unique. Cette conversion en mémoire ne réécrit pas les fichiers. Lors d’une édition explicite, la sauvegarde préalable conserve la version d’origine. Les anciennes dates d’entrée et de sortie sont conservées lorsqu’elles existent, mais ne sont plus demandées dans le formulaire.

Changer le répertoire dans Paramètres ouvre un autre espace, sans déplacer ni supprimer l’ancien. Pour déplacer réellement les données : arrêter l’application, copier **l’intégralité** du dossier vers sa destination, puis sélectionner cette destination.

## Fiabilité et sécurité des fichiers

- Validation Zod en lecture et en écriture, `schemaVersion: 1` sur les JSON métier.
- Versions inconnues refusées ; point d’entrée explicite pour de futures migrations.
- Sauvegarde complète avant toute modification persistée.
- Écriture dans un fichier temporaire unique, synchronisation du fichier sur disque, relecture et validation, puis renommage atomique. L’ancien JSON n’est jamais écrasé directement.
- Opérations d’écriture mises en file dans le serveur ; contrôle de version des fiches pour refuser une modification obsolète provenant d’un autre onglet.
- Chemins normalisés et confinés au workspace ; traversées, jonctions, liens symboliques et flux alternatifs NTFS refusés.
- Serveur lié uniquement à `127.0.0.1`, vérification de l’hôte et de l’origine des requêtes. Aucune API générique d’écriture de fichiers.
- HTML des PDF échappé ; toutes les requêtes réseau du moteur PDF sont bloquées.

**Performance.** Les réunions sont indexées à la demande (dossier `reunions/`) : une seule exploration ciblée des fichiers `reunion.json`, partagée par la lecture, la modification, la génération de PDF et la corbeille, au lieu d’un parcours répété du dossier — sans jamais mettre les données en cache d’une requête à l’autre, puisque chaque opération continue de relire et revalider les fichiers sur disque (garantie nécessaire pour détecter un JSON corrompu). Sur un espace de démonstration de 150 réunions, cela réduit d’environ 70 % les appels système de listage de répertoire pour les opérations courantes.

Éviter de modifier manuellement les JSON pendant que l’application tourne. Un incident lors d’une opération portant sur plusieurs fichiers peut nécessiter une restauration ; la copie préalable reste disponible. Une coupure matérielle ou la perte du disque ne peut pas être couverte par des sauvegardes situées sur ce même disque : une copie périodique du dossier sur un support local externe reste possible.

## Sauvegardes

Les sauvegardes sont des **copies complètes lisibles**, avec manifeste et empreintes SHA-256 vérifiées avant restauration, dans `sauvegardes/<date-heure-identifiant>/`. Elles incluent JSON, PDF, HTML, documents et corbeille, mais ne se recopient pas elles-mêmes.

Par défaut, les **20 dernières sauvegardes** sont conservées. Le nombre est réglable de 2 à 100 dans Paramètres. Une création supplémentaire retire les plus anciennes au-delà de cette limite. Le vidage de la corbeille crée aussi une sauvegarde.

Une suppression déplace les données vers `corbeille/` ; elle reste récupérable tant que cette corbeille, ou une sauvegarde la contenant, existe.

### Sauvegarde hors-site (.zip)

Les sauvegardes ci-dessus restent sur le même disque que les données ; une panne matérielle ou un vol de l’ordinateur les emporte avec le reste. Dans **Paramètres → Sauvegardes**, le bouton **Créer et télécharger une sauvegarde hors-site (.zip)** crée une sauvegarde puis propose immédiatement son téléchargement en une seule archive .zip, à enregistrer sur une clé USB ou un espace personnel en dehors de cet ordinateur. Chaque sauvegarde déjà existante peut aussi être téléchargée individuellement via le bouton **.zip** de sa ligne. Cette archive est une copie lisible, sans compte ni service distant : elle ne remplace pas une politique de sauvegarde régulière, mais permet d’en conserver une copie ailleurs.

## Restauration

1. Ouvrir **Paramètres → Sauvegardes**.
2. Choisir une sauvegarde et cliquer sur **Restaurer**.
3. Confirmer le remplacement des données actuelles.

L’application valide la sauvegarde avant de restaurer et conserve une copie de récupération de l’état actuel, y compris s’il contient un JSON corrompu. Cette copie supplémentaire peut provisoirement dépasser la limite de conservation.

Un JSON invalide n’est jamais réparé silencieusement. Le message d’erreur indique son nom et renvoie aux sauvegardes. Les paramètres de restauration restent accessibles même si une collection est illisible.

Si une restauration est interrompue, `restauration-en-cours.json` bloque les nouvelles modifications. Relancer la restauration depuis Paramètres ; ne pas effacer ce marqueur pour contourner le blocage.

Pour récupérer un seul élément : **Paramètres → Corbeille → Restaurer**. Un élément existant n’est jamais remplacé implicitement.

## Développement

```powershell
npm.cmd run dev
```

Vue est servi par Vite intégré au même serveur Express, à `127.0.0.1:4317`. Recharger Edge après une modification de l’interface ; redémarrer la commande après une modification serveur. Aucun serveur Vite n’écoute sur le réseau local.

Architecture :

```text
src/components/    composants réutilisables
src/views/         écrans
src/domain/        types, schémas Zod, règles métier
src/services/      client REST local
src/composables/   état partagé et erreurs
src/styles/        design sombre
server/app.ts      opérations REST métier
server/services/  stockage, sauvegardes, corbeille, PDF
scripts/           démonstration et vérification PDF
tests/             métier, filesystem, serveur HTTP, composants et Edge
```

L’état partagé utilise la réactivité Vue ; Pinia n’est pas nécessaire à cette application mono-utilisateur. Les imports `lucide-vue-next` utilisent un alias npm vers le paquet maintenu `@lucide/vue`, le nom historique ayant été déprécié par son éditeur. Les icônes restent locales et fournies par Lucide.

### Qualité du code

```powershell
npm.cmd run lint
```

ESLint (configuration plate, `eslint.config.js`) avec `typescript-eslint` et `eslint-plugin-vue`, sans recoupement avec Prettier (`eslint-config-prettier`). Le typage TypeScript est strict (`strict: true`) et renforcé par `noImplicitReturns`, `noFallthroughCasesInSwitch` et `forceConsistentCasingInFileNames` ; `npm.cmd run build` fait échouer la compilation en cas d’erreur de typage.

## Démonstration

```powershell
npm.cmd run demo
```

Ouvrir **http://127.0.0.1:4318** dans Edge. Le dossier séparé `demo-data/` contient 5 membres fictifs, 3 réunions, 4 événements, 3 actions et 2 documents texte fictifs. Ces données ne sont **jamais ajoutées au workspace réel**. Le mode de démonstration réutilise son propre dossier lors des lancements suivants.

## Tests

```powershell
npm.cmd test
npm.cmd run test:coverage
npm.cmd run test:e2e
```

- **Vitest** : règles métier, validation, statuts, dates, noms, chemins, sérialisation et migrations.
- **Filesystem réel** : dossiers temporaires nettoyés, écritures, sauvegardes, restaurations, corbeille, corruption, coupure simulée avant renommage et confinement des chemins.
- **Serveur HTTP réel** : `createApp` démarré sur un port libre dans `tests/app.test.ts` — garde-fous Host/Origine, sauvegarde hors-site en .zip, routes Planning et Contacts, bornes du réglage de rappel — sans dépendre d’Edge.
- **Vue Test Utils** : création de réunion, ordre du jour, participants, calendrier, actions, dialogue et validation.
- **Playwright** : Microsoft Edge explicitement sélectionné avec `channel: 'msedge'`, fenêtre 879 × 645, scénarios de non-régression (dont Planning, Contacts, Statistiques et le rappel automatique), sécurité et premier lancement compilé. Chaque test utilise son propre dossier temporaire ; les données réelles ne sont jamais chargées.
- **Régression visuelle** : références de l’accueil, des réunions, de la fiche, de l’agenda, des documents et du PV, avec tolérance aux petites variations de rendu.
- **Couverture** : `test:coverage` (V8) couvre les composants réutilisables, le domaine, les composables et le serveur — pas les écrans (`src/views`, `App.vue`), qui dépendent du routeur et sont couverts par Playwright à la place. Le rapport HTML se trouve dans `coverage/index.html`.

`test:e2e` compile avant l’exécution. Le rapport HTML se trouve dans `playwright-report/index.html` ; traces et captures d’échecs dans `test-results/`. Réviser une modification visuelle avant de mettre à jour les références :

```powershell
npm.cmd run test:visual:update
```

Ne pas lancer deux suites Edge simultanément : leurs ports de test sont 4398 et 4399. Edge doit être installé ; aucun navigateur n’est téléchargé automatiquement.

## Build

```powershell
npm.cmd run build
```

Vérifie TypeScript strict, produit le frontend dans `dist/` et le serveur dans `dist-server/`. Le serveur de production n’a pas besoin d’un serveur Vite actif. Après modification du code, recompiler et relancer l’application.

## Dépannage

| Symptôme                               | Solution                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node introuvable                       | Vérifier `D:\js\nodejs\node.exe` ou installer Node LTS et l’ajouter au PATH.                                                                                       |
| Port déjà occupé                       | Réutiliser l’instance déjà ouverte ou fermer son lanceur.                                                                                                          |
| Edge ne s’ouvre pas                    | Ouvrir manuellement `http://127.0.0.1:4317`.                                                                                                                       |
| Répertoire inaccessible                | Vérifier le chemin, les droits Windows et la disponibilité du disque.                                                                                              |
| JSON invalide                          | Ouvrir Paramètres et restaurer une sauvegarde valide. Ne pas remplacer le fichier par un JSON vide.                                                                |
| Écriture refusée car la fiche a changé | Recharger la fiche pour récupérer la version enregistrée.                                                                                                          |
| PV non modifiable                      | Utiliser explicitement « Rouvrir le PV ».                                                                                                                          |
| PDF indiquant encore « Brouillon »     | Régénérer le PDF après validation du PV.                                                                                                                           |
| PDF impossible à générer               | Vérifier qu’Edge est installé et que le répertoire autorise l’écriture ; consulter les logs.                                                                       |
| Échec d’installation                   | Vérifier l’accès initial au registre npm ; ensuite l’utilisation reste hors ligne.                                                                                 |
| Configuration de lancement endommagée  | Arrêter l’application, conserver une copie de `.local/application.json`, puis le retirer pour sélectionner de nouveau le workspace existant au prochain démarrage. |

Variables techniques facultatives : `PORT`, `APP_CONFIG_DIR`, `APP_WORKSPACE`, `NO_OPEN=1`. Elles servent au développement et aux tests. Ne pas faire tourner deux serveurs contre le même workspace.
