# Intégration Chess.com — analyse de cohérence

Analyse préalable à la mise à jour du cahier des charges (`docs/cahier-des-charges.md`). Elle confronte la
demande d'intégration de l'API publique Chess.com (PubAPI) au fonctionnement actuel de Chess IR (v1) et
liste les ajustements nécessaires.

## 1. Ce que l'API permet réellement

Vérifié le 19/11/2026 par appels directs :

| Besoin | Endpoint PubAPI | Constat |
|---|---|---|
| Profil | `GET /pub/player/{pseudo}` | `username`, `avatar`, `name`, `country`, `joined`, `last_online`, `status`, `url`. **404 si le pseudo n'existe pas** (sert à valider le pseudo). |
| Classements | `GET /pub/player/{pseudo}/stats` | `chess_rapid`, `chess_blitz`, `chess_bullet`, `chess_daily` : `last.rating`, `best`, `record {win, loss, draw}`. Clés absentes si le joueur n'a jamais joué la cadence. |
| Parties | `GET /pub/player/{pseudo}/games/{AAAA}/{MM}` | Archive mensuelle : `url`, `uuid`, `end_time` (timestamp), `time_class`, `time_control`, `rated`, `rules`, `white/black {username, rating, result}`, `eco`, `pgn`, parfois `accuracies`. Le mois en cours contient déjà les parties récentes. |
| CORS | — | `Access-Control-Allow-Origin: *`, cache court (`max-age=5`). |

Codes de résultat observés : `win`, `resigned`, `checkmated`, `timeout`, `abandoned`, `agreed`, `repetition`,
`stalemate`, `insufficient`, `50move`, `timevsinsufficient`. La documentation de Chess.com prévient que
les données peuvent être mises à jour avec du retard (jusqu'à plusieurs heures) : le **différé** doit être
prévu.

L'API est en **lecture seule** et **sans authentification** : impossible de prouver qu'un pseudo appartient
bien au participant qui l'a saisi, et impossible de lancer ou modifier quoi que ce soit sur Chess.com.

## 2. Ce qui est compatible sans changement

- **Chess.com reste la plateforme de jeu** : aucun échiquier dans Chess IR. Le bouton actuel « Défier sur
  Chess.com » est conservé tel quel.
- **Validation humaine** : le mécanisme actuel « un joueur déclare → l'adversaire confirme ou conteste →
  l'admin arbitre » couvre déjà le besoin. Une partie détectée devient simplement une **déclaration
  pré-remplie**, pas un nouveau circuit.
- **Classement** : la vue `standings` ne lit que les matchs `validated`. Les données Chess.com, rangées dans
  des tables séparées, ne peuvent pas l'influencer.
- **Navigation** : aucun nouvel onglet. Tout s'insère dans les pages Matchs (détail), Profil et l'espace admin.
- **Statuts des matchs** : les cinq statuts actuels (`scheduled`, `pending`, `validated`, `disputed`,
  `unplayed`) suffisent.

## 3. Ajustements nécessaires

| # | Point de friction | Situation actuelle (v1) | Ajustement proposé |
|---|---|---|---|
| A1 | **Où tourne la détection** | Tout passe par des fonctions SQL ; pas d'Edge Function. | La recherche de parties doit tourner **côté serveur** (Edge Function `chesscom-sync`). Si le navigateur écrivait la détection, un joueur pourrait inventer une « partie trouvée ». Postgres ne fait pas d'appels HTTP sortants de façon simple : l'Edge Function est la bonne place (déjà autorisée par le cahier des charges, §7). |
| A2 | **Pseudo Chess.com modifiable à tout moment** | Le joueur peut changer son pseudo à volonté (contrôle de format seulement). | Vérifier l'existence du pseudo (404 = refus). **Le figer pendant un championnat en cours** (modification par l'admin uniquement, tracée). Sinon, un joueur pourrait pointer vers un autre compte pour faire « correspondre » une partie. La propriété du compte ne peut pas être prouvée via l'API : l'admin reste garant à l'inscription. |
| A3 | **Règles de correspondance non définies** | Le cahier des charges ne fixe ni cadence, ni partie classée/amicale, ni fuseau horaire. | Nouveaux **paramètres du championnat**, choisis par l'admin et figés au lancement comme la règle d'exemption : cadences acceptées (par défaut *rapid*), parties classées seulement ou non, fuseau horaire. |
| A4 | **Fenêtre de jeu** | Les matchs sont programmés lundi/mercredi/vendredi mais peuvent être joués quand les joueurs veulent dans la semaine (§3.2). | La recherche couvre **toute la semaine** (du lundi 00:00 jusqu'à la clôture), pas seulement le jour prévu. |
| A5 | **Plusieurs parties entre les deux mêmes joueurs** | — | Fréquent (revanche, amicales). Plusieurs candidats = correspondance **incertaine** : aucune proposition automatique, les joueurs choisissent la bonne partie ou déclarent à la main. |
| A6 | **Couleurs inversées** | Les couleurs sont imposées par le tirage. | Partie trouvée avec les couleurs inversées = **incertaine** : signalée, jamais proposée comme certaine. L'admin décide si elle compte. |
| A7 | **Une partie Chess.com pour deux matchs** | — | Contrainte d'unicité : une partie Chess.com ne peut être liée qu'à **une seule** confrontation (utile en cas de répétition d'adversaires). |
| A8 | **Clôture de semaine** | `close_week` passe les matchs non déclarés en « non joué ». | Inchangé (pas de validation automatique, même avec une partie détectée). Mais l'écran de clôture doit **lister les parties détectées non déclarées**, pour que l'admin puisse arbitrer avec le lien comme preuve avant ou après la clôture. |
| A9 | **Déclaration manuelle contradictoire** | — | Si un joueur déclare un résultat différent d'une partie détectée « certaine », Chess IR affiche un avertissement à l'adversaire et joint la partie au dossier d'arbitrage en cas de contestation. La déclaration manuelle reste possible. |
| A10 | **Elo initial** | Saisi par le joueur (`declared_elo`), figé à l'inscription. Il sert à l'affichage et à la distinction « Chevalier surprise » en semaine 1. | Pré-remplissage possible depuis le classement Chess.com de la cadence du championnat, **validé par l'admin**. Il n'agit jamais sur les points. À confirmer : le cahier des charges interdit que les stats Chess.com « influencent les points ni le classement », mais une distinction n'est ni l'un ni l'autre. |
| A11 | **Avatar** | Initiales sur fond de couleur. | Avatar Chess.com affiché s'il existe, initiales en secours. Le joueur peut garder ses initiales. |
| A12 | **Limites de l'API** | — | Requêtes **en série** (Chess.com renvoie 429 sur les appels parallèles), User-Agent identifiant l'application avec un contact configurable (pas d'adresse personnelle en dur), mise en cache en base, et une recherche manuelle limitée à une toutes les 2 minutes par match. |
| A13 | **Séparation des statistiques** | — | Bloc distinct sur le profil, titré « Sur Chess.com — hors championnat », avec date de mise à jour. Les tables Chess.com ne sont jamais lues par les vues de classement (vérifié par un test). |

## 4. Décisions à prendre (valeurs par défaut proposées)

1. **Cadence(s) acceptée(s)** : *rapid* par défaut (adaptée à des débutants, parties de 10 à 15 min).
   Configurable.
2. **Parties classées uniquement ?** Non par défaut : des débutants à Elo nul jouent souvent en amical.
   Configurable.
3. **Fuseau horaire** du championnat : à choisir par l'admin à la création.
4. **Pseudo figé pendant le championnat** (A2) : proposé, à confirmer.
5. **Elo initial pré-rempli depuis Chess.com** (A10) : proposé avec validation admin, à confirmer.
6. **Synchronisation automatique planifiée** (toutes les 30 min pendant une semaine active, via `pg_cron`) :
   optionnelle. La recherche à la demande et le bouton admin « Synchroniser la semaine » suffisent en v1.

Le cahier des charges intégré (`docs/cahier-des-charges.md`) applique ces valeurs par défaut sous forme de
paramètres configurables, sans figer de règle irréversible.
