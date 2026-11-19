# Chess IR

**Jouer. Progresser. Grimper.** — Application web mobile de gestion du championnat d'échecs de la classe.
Les parties se jouent sur Chess.com ; Chess IR gère les participants, le tirage hebdomadaire (système
suisse adapté), la déclaration et la validation des résultats, le classement, les statistiques et les
récompenses. Une intégration en lecture seule avec l'API publique de Chess.com vérifie les pseudos,
synchronise profils et Elo, et retrouve les parties jouées pour **proposer** leur résultat.

Spécifications : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md) (v1.1) et
[`docs/analyse-integration-chesscom.md`](docs/analyse-integration-chesscom.md).

## Stack

| Couche | Outils |
|---|---|
| Front | React 18, TypeScript, Vite, Tailwind CSS 4, Lucide, React Router |
| Back | Supabase : PostgreSQL, Auth, Realtime, Row Level Security, fonctions SQL `security definer`, 1 Edge Function (Chess.com) |
| Tests | Vitest (unitaires + intégration sur Supabase local) |
| Hébergement | Vercel (front statique) + Supabase |

Pas de serveur Node/Django séparé : toute la logique sensible vit dans PostgreSQL.

## Architecture

```
src/
  lib/pairing.ts      Algorithme d'appariement (pur, testé)
  lib/scoring.ts      Barème et classement (miroir TS de la vue SQL, utilisé pour la vérification admin)
  lib/api.ts          Accès Supabase (lectures + appels RPC)
  state/              Contexte d'authentification et données du championnat (temps réel)
  pages/              Accueil, Matchs, Détail du match, Classement, Profil, Récompenses, Notifications
  admin/              Espace administrateur
supabase/migrations/
  …_schema.sql        Tables, contraintes, index, vues de classement, triggers
  …_functions.sql     Opérations sensibles (tirage, résultats, arbitrage, clôture, distinctions)
  …_rls.sql           Politiques RLS et droits
  …_chesscom.sql      Intégration Chess.com (tables séparées, acceptation, liaison, verrous)
supabase/functions/
  _shared/chesscom.ts     Règles de correspondance (pures, testées)
  chesscom-sync/index.ts  Edge Function : seul composant qui appelle l'API Chess.com
scripts/seed-demo.ts  Données de démonstration (local uniquement)
tests/                Tests unitaires (tests/*.test.ts) et d'intégration (tests/db)
```

### Principes de sécurité et de cohérence

- **Aucune écriture directe** des participants dans les tables de jeu : la RLS n'autorise que la
  lecture. Les actions passent par des fonctions SQL qui vérifient l'identité (`auth.uid()`) et le rôle.
  Un participant ne peut modifier que quelques colonnes de son propre profil (droits par colonne) :
  il ne peut ni changer son rôle, ni toucher aux points.
- **Les points ne sont jamais stockés.** Le classement (`standings`) est une vue calculée uniquement à
  partir des matchs `validated` et des exemptions. Une correction admin recalcule donc tout
  automatiquement, sans risque de double attribution.
- **Concurrence** : chaque déclaration ou réponse verrouille la ligne du match (`SELECT … FOR UPDATE`)
  et vérifie son statut ; la publication d'un tirage verrouille le championnat ; un index unique garantit
  une seule semaine ouverte.
- **Tirage verrouillé** : un trigger interdit toute modification des appariements publiés.
- **Traçabilité** : `match_results` journalise chaque déclaration, confirmation, contestation et décision
  admin (avec motif obligatoire).

## Règles implémentées

- Barème : victoire 3, nul 1, défaite 0.
- Semaine : tirage publié par l'admin (le dimanche), 3 rondes lundi / mercredi / vendredi, connues dès
  la publication. Pas de nouveau tirage pendant la semaine.
- **Appariement** (`src/lib/pairing.ts`) :
  - semaine 1 aléatoire ; ensuite, joueurs triés par points puis rang ;
  - jamais deux fois le même adversaire dans la semaine (sauf < 4 joueurs, inévitable) ;
  - adversaires déjà rencontrés évités ; si impossible, répétition autorisée et **signalée** à l'admin ;
  - rapprochement des scores voisins (recherche avec retour arrière) ;
  - couleurs équilibrées (écart Blancs/Noirs minimal, alternance) ;
  - nombre impair : un exempt par ronde, choisi parmi les moins souvent exemptés en partant du bas du
    classement, jamais deux fois dans la même semaine. **Aucun faux match** n'est créé (table `byes`).
  - L'admin prévisualise le tirage, peut le relancer, puis le publie : le serveur revalide intégralement
    (chaque participant actif présent une seule fois par ronde, exempt seulement si nombre impair…).
- **Points d'exempt** : 0, 1 ou 3, choisis par l'admin à la création, affichés aux joueurs et **figés au
  lancement**.
- **Résultats** : déclaration par un joueur → confirmation ou contestation (motif obligatoire) par
  l'adversaire. Le déclarant peut retirer sa déclaration tant qu'elle n'est pas confirmée. Un résultat
  contesté reste en attente jusqu'à l'arbitrage admin.
- **Matchs non joués / déconnexions** : aucune victoire automatique. À la clôture, les matchs jamais
  déclarés passent « non joué » (0 point pour chacun) ; l'admin peut ensuite fixer un autre résultat.
  La clôture est refusée tant qu'un résultat est en attente ou contesté.
- **Égalités** : points ▸ victoires ▸ Buchholz (somme des points des adversaires rencontrés). Les
  joueurs parfaitement à égalité partagent le même rang.
- **Récompenses** :
  - distinctions hebdomadaires, attribuées à la clôture : Champion de la semaine, Chevalier surprise
    (victoire contre un joueur classé ≥ 3 places au-dessus, ou Elo ≥ 200 de plus en semaine 1), Meilleure
    progression, Série gagnante (≥ 3 victoires d'affilée) ;
  - badges : Premier pas, Première victoire, Semaine complète, Cinq victoires, Trois d'affilée, Tombeur
    du leader, Première remontée. Plusieurs valorisent la participation plutôt que le niveau.

## Intégration Chess.com

- **Lecture seule**, via l'API publique (PubAPI). Chess.com reste la seule plateforme de jeu.
- **Pseudo vérifié** à la saisie (refusé s'il n'existe pas), **figé pendant un championnat en cours** (seul
  l'admin peut le changer, chaque changement est tracé).
- **Profil synchronisé** (au plus 1×/24 h) : avatar, classements par cadence, bilan global, affichés dans un
  bloc séparé « Sur Chess.com — hors championnat ». **L'Elo est synchronisé depuis Chess.com** dans la
  cadence principale du championnat (*rapid* par défaut), y compris l'Elo initial du participant.
- **Détection** : à l'ouverture d'un match, via « Rechercher » (1×/2 min par match) ou « Synchroniser la
  semaine » (admin). Une partie est *certaine* seulement si elle est unique dans la semaine, de la bonne
  cadence et avec les couleurs du tirage ; sinon *incertaine* (les joueurs choisissent, ou l'admin tranche).
- **Validation humaine obligatoire** : accepter une proposition = déclarer ; l'adversaire confirme ou
  conteste. Jamais de validation automatique, même à la clôture.
- **Jamais d'effet sur le classement** : les vues de classement ne lisent aucune table Chess.com (testé).
- Si Chess.com est indisponible ou en retard, la déclaration manuelle reste toujours possible.

## Installation locale

Prérequis : Node 20+, Docker (pour Supabase local).

```bash
npm install
npx supabase start            # démarre Postgres/Auth/Realtime et applique les migrations
npx supabase status -o env    # affiche API_URL et ANON_KEY
cp .env.example .env          # puis renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run seed:demo             # (optionnel) données de démonstration
npm run dev                   # http://localhost:5173
```

Les données Chess.com de la démo sont **fictives** (aucun appel à l'API) : une partie « détectée » attend
joueur01 sur l'un de ses matchs de la semaine.

Comptes de démonstration (après `seed:demo`) : `admin@demo.chessir` et `joueur01@demo.chessir` …
`joueur12@demo.chessir`, mot de passe `chessir-demo`.

Pour repartir de zéro : `npx supabase db reset`.

## Tests

```bash
npm test          # unitaires : appariement, barème, classement, correspondance Chess.com
npm run test:db   # intégration : RLS, tirage, déclaration/validation, contestation, arbitrage,
                  # concurrence, clôture, recalcul du classement, intégration Chess.com
```

⚠️ `test:db` supprime les championnats de la base **locale** : relancez `npm run seed:demo` ensuite si
besoin.

## Déploiement

### 1. Supabase (production)

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Lier et pousser le schéma :
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-du-projet>
   npx supabase db push
   ```
3. Dans **Authentication → URL Configuration**, renseigner l'URL Vercel comme *Site URL*.
4. Créer son compte depuis l'application, puis se nommer administrateur dans l'éditeur SQL :
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'votre@email');
   ```

**Ne pas lancer `seed:demo` en production** (le script refuse d'ailleurs une URL non locale sans `--force`).

### 2. Edge Function Chess.com

```bash
npx supabase functions deploy chesscom-sync
npx supabase secrets set CHESSCOM_CONTACT="contact du club ou de l'admin"   # inclus dans le User-Agent
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies automatiquement.
Optionnel : planifier `sync-week` (par ex. toutes les 30 min pendant une semaine active) avec `pg_cron` +
`pg_net`. Le bouton admin « Synchroniser la semaine » suffit sinon.

### 3. Vercel

1. Importer le dépôt dans Vercel (framework : Vite, build `npm run build`, sortie `dist`).
2. Variables d'environnement : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (clé *anon/publishable*,
   jamais la clé `service_role`).
3. `vercel.json` redirige toutes les routes vers `index.html` (routing côté client).

## Utilisation (admin)

1. **Championnat** : créer le championnat, choisir la règle d'exemption.
2. **Joueurs** : chaque élève s'inscrit dans l'application ; l'admin l'ajoute au championnat
   (l'Elo déclaré est alors enregistré comme Elo initial). Suspendre retire un joueur des prochains tirages
   sans l'enlever du classement.
3. **Démarrer**, puis **Semaines & tirage** : choisir le lundi, prévisualiser, publier.
4. Pendant la semaine : suivre les matchs, arbitrer les contestations (**Matchs**).
5. Le dimanche : **Clôturer la semaine** (photo du classement + distinctions), puis générer le tirage suivant.
6. **Classements → Vérifier** recalcule indépendamment le classement pour contrôler les calculs.
