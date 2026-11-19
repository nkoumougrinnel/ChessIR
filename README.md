<p align="center">
  <img src="docs/icone.png" alt="Icône Chess IR" width="140" height="140" />
</p>

<h1 align="center">Chess IR</h1>

<p align="center">
  <strong>Jouer. Progresser. Grimper.</strong><br />
  Le championnat d'échecs de la classe — application web mobile, installable sur le téléphone.<br />
  <a href="https://chessir.vercel.app"><strong>chessir.vercel.app</strong></a>
  · <a href="docs/guide/guide-chess-ir.pdf">Guide du participant (PDF)</a>
</p>

---

Les parties se jouent sur **Chess.com** ; **Chess IR** organise tout le reste : inscriptions, tirage
hebdomadaire (système suisse adapté), déclaration et validation des résultats, classement cumulatif,
statistiques, récompenses et partage dans le groupe WhatsApp de la classe.

L'application est pensée **d'abord pour le téléphone** : elle s'installe sur l'écran d'accueil comme une
application native (PWA) et se met à jour toute seule à chaque déploiement.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Règles du championnat](#règles-du-championnat)
- [Stack et architecture](#stack-et-architecture)
- [Sécurité et cohérence](#sécurité-et-cohérence)
- [Intégration Chess.com](#intégration-chesscom)
- [Application installable et mises à jour](#application-installable-et-mises-à-jour)
- [Développement local](#développement-local)
- [Tests](#tests)
- [Déploiement](#déploiement)
- [Administration du championnat](#administration-du-championnat)
- [Documentation](#documentation)

## Fonctionnalités

**Pour les joueurs**
- **Accueil** : semaine en cours, rang et points, évolution, carte « Mon prochain match » avec
  *Défier sur Chess.com* et *Déclarer* en un geste.
- **Matchs** : les 3 confrontations de la semaine (adversaire, jour, couleur, statut) et l'historique ;
  pastille sur l'onglet quand une action est attendue.
- **Déclaration et validation** : détection automatique de la partie sur Chess.com ou déclaration manuelle,
  confirmation par l'adversaire, contestation arbitrée par l'admin, journal complet.
- **Classement** général et hebdomadaire, avec les places gagnées ou perdues depuis la semaine précédente.
- **Profil** : statistiques du championnat, progression, distinctions, derniers matchs et un bloc séparé
  « Sur Chess.com — hors championnat » (Elo, bilan, avatar).
- **Récompenses** : distinctions hebdomadaires et badges qui valorisent aussi la participation.
- **Notifications** internes en temps réel.
- **Partage WhatsApp « à la Duolingo »** : image + message prêts à envoyer pour une annonce de match,
  un résultat, un classement, un tirage ou une récompense.

**Pour l'administrateur** (espace distinct, protégé côté serveur)
- Tableau de bord orienté « prochaine étape » : préparation, tirage, suivi et clôture de la semaine.
- Joueurs : inscription (y compris groupée), suspension, modification, état du pseudo Chess.com.
- Tirage : prévisualisation de l'appariement suisse, relance, publication verrouillée, partage.
- Matchs : filtres, arbitrage avec motif obligatoire, liaison des parties Chess.com.
- Classements avec **vérification indépendante des calculs**.
- Récompenses : consultation, attribution exceptionnelle.
- Réglages : lien du groupe WhatsApp, règles du championnat, suppression d'un championnat créé par erreur
  (avant tout tirage) ou clôture finale.

## Règles du championnat

Résumé (le détail, rédigé pour les participants, est dans le
[guide du participant](docs/guide/guide-chess-ir.pdf)) :

- **Un championnat = plusieurs semaines**, classement **cumulatif**, aucune élimination.
- **Chaque semaine** : tirage publié le dimanche par l'admin, 3 rondes (lundi, mercredi, vendredi) connues à
  l'avance et jouables n'importe quand dans la semaine ; clôture le dimanche.
- **Barème** : victoire 3, nul 1, défaite 0. Un match non déclaré à la clôture est « non joué » (0 point
  chacun, aucune victoire automatique).
- **Appariement** (`src/lib/pairing.ts`) : semaine 1 aléatoire, puis rapprochement par points ; jamais deux
  fois le même adversaire dans la semaine ; répétitions évitées (et signalées si inévitables) ; couleurs
  équilibrées ; nombre impair → un exempt par ronde, sans faux match.
- **Exempt** : 0, 1 ou 3 points, choisi par l'admin et figé au lancement.
- **Égalités** : points ▸ victoires ▸ Buchholz ; égalité parfaite = même rang.
- **Distinctions hebdomadaires** (à la clôture) : Champion de la semaine, Chevalier surprise, Meilleure
  progression, Série gagnante. **Badges** (immédiats) : Premier pas, Première victoire, Semaine complète,
  Cinq victoires, Trois d'affilée, Tombeur du leader, Première remontée.

## Stack et architecture

| Couche | Outils |
|---|---|
| Front | React 18, TypeScript, Vite, Tailwind CSS 4, Lucide, React Router — PWA (service worker, manifeste) |
| Back | Supabase : PostgreSQL, Auth, Realtime, Row Level Security, fonctions SQL `security definer`, 1 Edge Function |
| Tests | Vitest (unitaires + intégration sur Supabase local) |
| Hébergement | Vercel (front statique) + Supabase |

Pas de serveur Node/Django séparé : la logique sensible vit dans PostgreSQL, et l'unique Edge Function
sert d'intermédiaire avec l'API Chess.com.

```
src/
  lib/pairing.ts          Algorithme d'appariement (pur, testé)
  lib/scoring.ts          Barème et classement (miroir TS de la vue SQL, vérification admin)
  lib/api.ts              Accès Supabase (lectures + appels RPC)
  lib/pwa.ts              Installation, service worker, mises à jour automatiques
  lib/shareImage.ts       Images de partage dessinées en <canvas> (1080×1350)
  lib/splash.ts           Écran de lancement
  state/                  Authentification et données du championnat (temps réel)
  hooks/                  Progression, contenus partageables
  components/             Interface (cartes, partage, Chess.com, installation…)
  pages/                  Accueil, Matchs, Match, Classement, Profil, Récompenses, Notifications…
  admin/                  Espace administrateur (chargé à la demande)
public/
  sw.js                   Service worker
  manifest.webmanifest    Manifeste PWA + icônes
supabase/
  migrations/             Schéma, fonctions, RLS, Chess.com, réglages (7 migrations)
  functions/_shared/      Règles de correspondance Chess.com (pures, testées)
  functions/chesscom-sync Edge Function : seul composant qui appelle l'API Chess.com
scripts/seed-demo.ts      Données de démonstration (local uniquement)
tests/                    Unitaires (tests/*.test.ts) et intégration (tests/db)
docs/                     Cahier des charges, analyse Chess.com, guide du participant (LaTeX + PDF)
```

## Sécurité et cohérence

- **Aucune écriture directe** des participants dans les tables de jeu : la RLS n'autorise que la lecture.
  Les actions passent par des fonctions SQL qui vérifient l'identité (`auth.uid()`) et le rôle. Un
  participant ne modifie que quelques colonnes de son propre profil : ni son rôle, ni ses points, ni son
  pseudo Chess.com (vérifié et tracé via l'Edge Function).
- **Les points ne sont jamais stockés** : le classement (`standings`) est une vue calculée à partir des seuls
  matchs `validated` et des exemptions. Une correction recalcule tout, sans double attribution.
- **Concurrence** : verrou de ligne (`SELECT … FOR UPDATE`) à chaque déclaration ou réponse, verrou du
  championnat pendant un tirage, une seule semaine ouverte (index unique).
- **Tirage verrouillé** par trigger après publication ; **règles figées** au lancement.
- **Traçabilité** : `match_results` journalise déclarations, confirmations, contestations, liaisons de
  parties et décisions admin (motif obligatoire).
- Les boutons admin ne sont jamais la seule barrière : chaque fonction sensible revérifie le rôle.

## Intégration Chess.com

- **Lecture seule** via l'API publique (PubAPI). Chess.com reste la seule plateforme de jeu.
- **Pseudo vérifié** à la saisie (refusé s'il n'existe pas), **figé pendant un championnat en cours**.
- **Profil synchronisé** (au plus 1×/24 h) ; **l'Elo vient de Chess.com** dans la cadence principale du
  championnat (*rapid* par défaut), y compris l'Elo initial.
- **Détection** des parties : une partie est *certaine* seulement si elle est unique dans la semaine, dans
  une cadence acceptée et avec les couleurs du tirage ; sinon *incertaine* (les joueurs choisissent ou l'admin
  tranche).
- **Validation humaine obligatoire** : accepter une proposition = déclarer ; l'adversaire confirme.
  Jamais de validation automatique, même à la clôture.
- **Aucun effet sur le classement** : les vues de classement ne lisent aucune table Chess.com (testé).
- Chess.com indisponible ou en retard → la déclaration manuelle reste toujours possible.

## Application installable et mises à jour

- **Installation** : bouton « Installer l'application » (Chrome, Android) ou marche à suivre iPhone
  (Safari → Partager → Sur l'écran d'accueil). La proposition disparaît une fois l'app installée.
- **Écran de lancement** fidèle à la maquette (fond nuit, damier, logo, barre de chargement), défini dans
  `index.html` pour s'afficher instantanément.
- **Mises à jour automatiques** : chaque build publie `/version.json` (commit Vercel). L'app installée vérifie
  la version au retour au premier plan (rechargement immédiat) et toutes les 10 minutes (bandeau
  « Nouvelle version disponible »).
- Le service worker met en cache les fichiers du site, **jamais** les données Supabase ni Chess.com.

## Développement local

Prérequis : Node 20+, Docker (pour Supabase local).

```bash
npm install
npx supabase start            # Postgres/Auth/Realtime/Edge Functions + migrations
npx supabase status -o env    # affiche API_URL et ANON_KEY
cp .env.example .env          # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run seed:demo             # (optionnel) données de démonstration
npm run dev                   # http://localhost:5173 (ou --port 5180 si occupé)
```

Comptes de démonstration (après `seed:demo`) : `admin@demo.chessir` et `joueur01@demo.chessir` …
`joueur12@demo.chessir`, mot de passe `chessir-demo`. Les données Chess.com de la démo sont **fictives**.

Pour repartir de zéro : `npx supabase db reset`. Pour appliquer de nouvelles migrations sans perdre les
données locales : `npx supabase migration up`.

## Tests

```bash
npm test          # 48 tests unitaires : appariement, barème, classement, correspondance Chess.com
npm run test:db   # 27 tests d'intégration : RLS, tirage, déclaration/validation, contestation, arbitrage,
                  # concurrence, clôture, classement, Chess.com, suppression, réglages
```

⚠️ `test:db` supprime les championnats de la base **locale** : relancez `npm run seed:demo` ensuite.

## Déploiement

Production actuelle : front sur **Vercel** (`chessir.vercel.app`), backend sur un projet **Supabase**.

### 1. Supabase

1. Appliquer les migrations : `npx supabase link --project-ref <ref>` puis `npx supabase db push`.
2. Déployer l'Edge Function :
   ```bash
   npx supabase functions deploy chesscom-sync
   npx supabase secrets set CHESSCOM_CONTACT="contact général du club"   # facultatif, inclus dans le User-Agent
   ```
   `verify_jwt` est désactivé dans `supabase/config.toml` : la fonction authentifie elle-même l'appelant
   (`auth.getUser`), ce qui reste compatible avec les nouvelles clés de signature.
3. **Authentication → URL Configuration** : *Site URL* = `https://chessir.vercel.app`.
4. **Authentication → Sign In / Providers → Email** : désactiver « Confirm email » si aucun service d'envoi
   d'e-mails (SMTP) n'est configuré — l'envoi par défaut de Supabase est très limité.
5. Créer son compte dans l'application, puis se nommer administrateur (éditeur SQL) :
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'votre@email');
   ```

**Ne jamais lancer `seed:demo` en production** (le script refuse une URL non locale sans `--force`).

### 2. Vercel

1. Importer le dépôt (framework Vite, build `npm run build`, sortie `dist`).
2. Variables : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé *publishable/anon*, **jamais** la clé
   `service_role`).
3. `vercel.json` gère le routage côté client et l'absence de cache pour `sw.js`, `version.json` et le manifeste.
4. Chaque `git push` sur `main` redéploie ; les applications installées se mettent à jour d'elles-mêmes.

## Administration du championnat

1. **Tableau de bord** : créer le championnat (nom, points d'exempt, cadence Chess.com, fuseau horaire) et
   renseigner le **lien du groupe WhatsApp**.
2. **Joueurs** : chacun crée son compte (avec son pseudo Chess.com) ; l'admin l'inscrit, éventuellement en
   groupe avec « Tout inscrire ».
3. **Démarrer**, puis **Semaines & tirage** : prévisualiser, publier, **partager le tirage** dans le groupe.
4. Pendant la semaine : suivre la progression, arbitrer les contestations, « Synchroniser la semaine »
   avec Chess.com si besoin.
5. Le dimanche : **clôturer la semaine** (classement figé, distinctions), partager le classement, puis
   publier le tirage suivant.
6. **Classements → Vérifier** recalcule indépendamment le classement pour contrôler les calculs.
7. Fin de saison : **Terminer le championnat** (zone sensible du tableau de bord).

## Documentation

| Document | Contenu |
|---|---|
| [`docs/guide/guide-chess-ir.pdf`](docs/guide/guide-chess-ir.pdf) | Guide du participant : règles et utilisation de l'app (source LaTeX à côté) |
| [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md) | Cahier des charges v1.1 (avec l'intégration Chess.com) |
| [`docs/analyse-integration-chesscom.md`](docs/analyse-integration-chesscom.md) | Analyse de cohérence de l'intégration Chess.com |
| [`docs/maquette.png`](docs/maquette.png), [`docs/icone.png`](docs/icone.png) | Références visuelles |

Recompiler le guide : `cd docs/guide && latexmk -pdf guide-chess-ir.tex`.
