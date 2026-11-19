# CHESS IR — Cahier des charges fonctionnel et technique
## Conception et développement d'une application web mobile de gestion d'un championnat d'échecs

> **Version 1.1** : ajout de l'intégration avec l'API publique Chess.com (PubAPI).
> Les passages ajoutés ou modifiés sont signalés par **🆕**. L'analyse de cohérence qui justifie ces
> ajouts se trouve dans [`analyse-integration-chesscom.md`](analyse-integration-chesscom.md).

---

# 1. PRÉSENTATION DU PROJET

Nous souhaitons développer une petite application web mobile appelée **Chess IR**.

Chess IR est une plateforme destinée à organiser et suivre un championnat d'échecs amical entre les étudiants de notre classe.

Le championnat réunira des joueurs de niveaux très différents :
- Des débutants qui viennent de découvrir les échecs.
- Des joueurs occasionnels.
- Des joueurs ayant déjà une certaine expérience (environ 900 Elo ou davantage).
- Des joueurs dont le classement Elo est encore nul ou inexistant.

L'objectif n'est pas de créer une compétition professionnelle, mais une activité conviviale qui permette à tout le monde de participer, de progresser, de se confronter aux autres et de s'amuser.

Les parties seront jouées sur **Chess.com**. Notre application ne servira donc pas à jouer directement aux échecs. Elle sera le centre de gestion du championnat.

Elle permettra notamment de :
- Gérer les participants.
- Organiser automatiquement les confrontations.
- Suivre les matchs de chaque semaine.
- Enregistrer et valider les résultats.
- Calculer les points.
- Afficher le classement général.
- Consulter les statistiques et les progressions.
- Ajouter des récompenses et des distinctions pour rendre la compétition plus amusante.
- 🆕 Communiquer en lecture seule avec l'API publique de Chess.com : synchroniser les profils, détecter les parties jouées pour proposer leur résultat, et relier chaque confrontation à sa partie Chess.com.

🆕 **Chess.com reste exclusivement la plateforme de jeu.** Chess IR n'intègre pas d'échiquier, ne lance pas de partie, ne contrôle pas les parties et ne modifie rien sur Chess.com (l'API publique est en lecture seule).

# 2. IDENTITÉ VISUELLE

Le nom officiel de l'application est **Chess IR**.

Deux références visuelles sont jointes à ce brief :

1. L'icône de Chess IR.
2. Une première maquette présentant plusieurs écrans de l'application.

Ces images doivent servir de références pour construire l'interface.

## Direction artistique

Nous souhaitons conserver :
- Une interface sombre et élégante.
- Un fond bleu nuit très profond, avec quelques nuances de violet.
- Des accents dorés pour les éléments importants.
- Des composants aux coins arrondis.
- Des cartes sobres, avec des contrastes bien maîtrisés.
- Des animations discrètes et fluides.
- Une typographie moderne et lisible.

L'icône possède une identité abstraite et originale. Il ne faut pas remplacer cette direction par un logo classique représentant simplement un cavalier, un roi ou un échiquier.

L'univers visuel doit évoquer la stratégie, la compétition et le jeu, sans tomber dans une esthétique trop classique.

Attention : la maquette jointe constitue une référence de direction artistique et de présentation. Il ne faut pas reproduire aveuglément tous ses éléments. Certaines informations et certains écrans doivent être simplifiés conformément aux exigences fonctionnelles ci-dessous.

🆕 Les éléments provenant de Chess.com (avatar, classements, lien de partie) sont affichés dans la charte Chess IR, sans reprendre le logo ni l'apparence de Chess.com. Un petit libellé « Chess.com » indique la provenance des données.

# 3. RÈGLES OFFICIELLES DU CHAMPIONNAT

## 3.1. Format général

Le championnat fonctionne selon un système d'appariement inspiré du système suisse.

Les principes fondamentaux sont :
- Aucun participant n'est éliminé.
- Tous les participants restent dans le championnat, quel que soit leur résultat.
- Les confrontations sont organisées pour favoriser progressivement des matchs entre joueurs ayant des résultats similaires.
- Les joueurs ne doivent pas rencontrer systématiquement les mêmes adversaires.
- Les joueurs peuvent défier des participants plus expérimentés.
- Le classement général est cumulatif et ne repart jamais à zéro chaque semaine.

## 3.2. Organisation hebdomadaire

Le championnat fonctionne par semaines.

Chaque semaine comporte exactement trois confrontations obligatoires par participant, sous réserve des contraintes liées au nombre de joueurs.

Le calendrier est le suivant :

| Jour | Activité |
|---|---|
| Dimanche | Clôture de la semaine précédente et génération du nouveau tirage |
| Lundi | Première confrontation |
| Mercredi | Deuxième confrontation |
| Vendredi | Troisième confrontation |

Le tirage est réalisé une seule fois au début de chaque semaine.

Les trois confrontations sont publiées simultanément. Les joueurs connaissent donc leurs trois adversaires dès le début de la semaine.

Il n'y a pas de nouveau tirage entre le lundi, le mercredi et le vendredi.

Les joueurs disposent de la semaine pour organiser leurs rencontres, en tenant compte de leurs cours et de leurs autres obligations.

Le championnat ne doit pas imposer une connexion quotidienne.

## 3.3. Système de points

Le barème officiel est le suivant :

| Résultat | Points attribués |
|---|---:|
| Victoire | 3 points |
| Match nul | 1 point |
| Défaite | 0 point |

Les points sont ajoutés au classement général après validation du résultat.

Exemple :

Un participant qui réalise deux victoires et un match nul pendant une semaine obtient :

3 + 3 + 1 = 7 points.

🆕 Les statistiques et classements Elo provenant de Chess.com **n'interviennent jamais** dans le calcul des points ni dans le classement officiel. Le classement repose exclusivement sur les résultats Chess IR validés.

## 3.4. Système d'appariement

Le système suisse est le mécanisme central du championnat.

Pour la première semaine, les confrontations sont générées aléatoirement.

À partir de la deuxième semaine, le système tient compte des résultats et du classement de la semaine précédente.

Les règles d'appariement doivent chercher à :

1. Regrouper autant que possible les joueurs ayant des scores similaires.
2. Éviter les confrontations répétées entre deux mêmes joueurs.
3. Équilibrer autant que possible les couleurs des pièces (Blancs et Noirs).
4. Éviter qu'un même joueur bénéficie trop souvent d'un avantage particulier.
5. Assurer une distribution cohérente des confrontations.

Une particularité importante doit être prise en compte : puisque les trois confrontations hebdomadaires sont générées simultanément le dimanche, l'algorithme doit préparer les trois rondes à partir du classement disponible au moment du tirage.

Il s'agit donc d'un **appariement de type suisse adapté à une programmation hebdomadaire fixe**, et non d'un système suisse classique recalculant chaque ronde après les résultats de la précédente.

Les résultats des trois rondes permettront de préparer les appariements de la semaine suivante.

L'algorithme devra conserver l'historique des confrontations pour éviter autant que possible les répétitions.

🆕 Les classements Chess.com ne sont pas utilisés par l'algorithme d'appariement, qui ne se fonde que sur le classement Chess IR.

### Nombre impair de participants

Le système doit également prévoir le cas où le nombre de participants est impair.

Il faudra gérer un exempt pour la ronde concernée, sans créer de faux match.

La règle d'attribution des points liés à un exempt devra être configurable par l'administrateur et clairement indiquée avant le lancement du championnat.

## 3.5. Gestion des matchs

Les rencontres sont jouées sur Chess.com.

Chaque participant doit renseigner son pseudonyme Chess.com dans son profil.

🆕 Le pseudonyme est vérifié auprès de l'API Chess.com lors de sa saisie : un pseudonyme inexistant est refusé. Pendant un championnat en cours, il ne peut plus être modifié que par l'administrateur, et chaque modification est tracée. Sans ce verrou, un joueur pourrait pointer vers un autre compte pour faire correspondre une partie.

Les matchs doivent être annoncés dans le groupe de discussion avant leur commencement, afin que les autres participants puissent suivre les affrontements.

Après chaque partie, le résultat est déclaré dans Chess IR.

Les résultats possibles sont :
- Victoire du joueur A.
- Victoire du joueur B.
- Match nul.

Un match non joué ne doit pas être automatiquement considéré comme une victoire pour l'un des joueurs.

Les indisponibilités et les matchs non joués doivent être gérés sans pénalités automatiques arbitraires. L'administrateur pourra examiner les situations particulières et prendre une décision.

Les déconnexions ne donnent pas automatiquement une victoire à l'adversaire. Les situations litigieuses pourront être examinées par l'administrateur.

🆕 Ce principe s'applique aussi aux parties détectées : une partie que Chess.com enregistre comme gagnée par abandon ou au temps (`abandoned`, `timeout`) est **proposée** comme telle, mais rien n'est validé sans confirmation humaine, et l'administrateur peut toujours requalifier une déconnexion.

Le fair-play est obligatoire : aucune assistance extérieure, aucun moteur d'échecs pendant les parties et aucune triche.

## 3.6. Validation des résultats

C'est un mécanisme essentiel du championnat.

Le fonctionnement est le suivant :

1. Un joueur déclare le résultat de la partie.
2. Son adversaire reçoit une demande de confirmation.
3. L'adversaire peut confirmer ou contester le résultat.
4. Si le résultat est confirmé, il devient officiel.
5. Les points et les statistiques sont actualisés.

En cas de contestation, le résultat reste en attente jusqu'à l'intervention de l'administrateur.

Un administrateur doit pouvoir corriger ou arbitrer un résultat.

Il faut conserver une trace des déclarations, confirmations et corrections.

🆕 **La validation humaine reste obligatoire dans tous les cas.** Une partie détectée sur Chess.com ne fait que **pré-remplir** l'étape 1 : le premier joueur qui accepte la proposition fait la déclaration, et son adversaire confirme ou conteste comme d'habitude (§3.7). Aucun résultat n'est validé automatiquement, ni en cours de semaine ni à la clôture.

## 🆕 3.7. Détection et vérification des parties sur Chess.com

### Principe

À partir des pseudonymes Chess.com des deux joueurs d'une confrontation programmée, Chess IR recherche leurs parties publiques récentes dans les archives mensuelles de l'API. Si une partie correspond à la confrontation, ses informations sont récupérées (résultat, couleurs, date, cadence, lien) et le résultat est **proposé** aux deux joueurs.

### Paramètres du championnat

Ces paramètres sont choisis par l'administrateur à la création, affichés aux joueurs, et **figés au lancement**, comme la règle d'exemption :

| Paramètre | Valeur par défaut | Rôle |
|---|---|---|
| Cadences acceptées | *rapid* (validé) | Cadences Chess.com (`rapid`, `blitz`, `bullet`, `daily`) dans lesquelles une partie peut compter. La première cadence sert aussi à synchroniser l'Elo. |
| Parties classées uniquement | non | Les débutants jouent souvent en partie amicale (non classée). |
| Fuseau horaire | `Africa/Douala` (modifiable) | Définit les bornes de la semaine (lundi 00:00 → dimanche 23:59). |

### Règles de correspondance

Une partie Chess.com est **candidate** pour une confrontation si toutes ces conditions sont réunies :
1. elle oppose exactement les deux pseudonymes (comparaison insensible à la casse) ;
2. ses règles sont celles des échecs standard (`rules = chess`) ;
3. elle s'est terminée pendant la semaine de la confrontation (du lundi 00:00 jusqu'à la clôture de la semaine), quel que soit le jour prévu (lundi, mercredi ou vendredi), puisque les joueurs organisent librement leur semaine ;
4. sa cadence fait partie des cadences acceptées, et elle est classée si le paramètre l'exige ;
5. elle n'est pas déjà liée à une autre confrontation (une partie Chess.com ne compte que pour un seul match).

La correspondance est **certaine** si et seulement si :
- il existe **exactement une** partie candidate, **et**
- les couleurs jouées sont celles attribuées par le tirage.

Dans tous les autres cas, la correspondance est **incertaine** : plusieurs candidates (revanche, parties amicales), couleurs inversées, ou une seule candidate hors cadence acceptée. Aucune proposition n'est alors faite automatiquement. Les candidates sont affichées : les joueurs peuvent en choisir une (ce qui revient à déclarer), ou déclarer manuellement. L'administrateur tranche si nécessaire, notamment pour des couleurs inversées.

### Traduction des résultats

| Codes Chess.com (côté d'un joueur) | Résultat Chess IR |
|---|---|
| `win` | victoire de ce joueur |
| `agreed`, `repetition`, `stalemate`, `insufficient`, `50move`, `timevsinsufficient` | match nul |
| `checkmated`, `resigned`, `timeout`, `abandoned`, `lose` | défaite de ce joueur |
| autre code inconnu | correspondance incertaine (pas de proposition) |

### Cycle de vie

1. **Recherche** : déclenchée à l'ouverture d'un match à jouer, par le bouton « Rechercher la partie sur Chess.com » (au plus une recherche toutes les 2 minutes par match), et par l'administrateur (« Synchroniser la semaine »). Une synchronisation planifiée (par exemple toutes les 30 minutes pendant une semaine active) est optionnelle.
2. **Proposition** : si la correspondance est certaine, les deux joueurs voient « Partie trouvée sur Chess.com : victoire de X — voir la partie » et sont notifiés.
3. **Déclaration** : le premier joueur qui accepte la proposition fait la déclaration (source « Chess.com », partie liée). Il peut aussi l'ignorer et déclarer manuellement.
4. **Confirmation** : l'adversaire confirme ou conteste, exactement comme pour une déclaration manuelle (§3.6).
5. **Partie introuvable ou pas encore disponible** : les données Chess.com peuvent arriver avec plusieurs heures de retard. Les joueurs déclarent manuellement, sans attendre. Une partie détectée plus tard pourra être liée au match a posteriori (lien seulement, sans changer le résultat validé).
6. **Désaccord** : si une déclaration manuelle contredit une partie détectée comme certaine, l'adversaire voit un avertissement, et la partie est jointe au dossier d'arbitrage en cas de contestation.
7. **Clôture** : aucune validation automatique. L'écran de clôture liste les parties détectées mais non déclarées ; l'administrateur peut s'en servir comme preuve pour arbitrer.

### Joueurs sans pseudonyme valide

La détection est impossible si l'un des deux joueurs n'a pas de pseudonyme vérifié. La déclaration manuelle s'applique, et le joueur concerné est invité à compléter son profil.

# 4. FONCTIONNALITÉS DE L'APPLICATION

Nous souhaitons une application simple. Il ne faut pas surcharger les écrans avec trop d'informations.

La navigation principale comporte quatre onglets :

- Accueil
- Matchs
- Classement
- Profil

🆕 L'intégration Chess.com **n'ajoute aucun onglet ni aucune page principale** : elle enrichit les pages existantes.

## 4.1. Accueil

C'est le tableau de bord personnel.

Il doit afficher simplement :
- La semaine en cours.
- La position du participant au classement.
- Son nombre de points.
- Ses prochains matchs.
- Un petit aperçu de sa progression.

🆕 Si une partie a été détectée pour l'un de ses matchs, le rappel « résultat à confirmer » existant devient « Partie trouvée sur Chess.com : confirmez le résultat ». Aucune statistique Chess.com n'est affichée sur l'accueil.

L'accueil doit être visuellement agréable et donner immédiatement les informations essentielles.

Éviter les statistiques trop nombreuses et les tableaux complexes sur cette page.

## 4.2. Matchs

C'est l'une des pages les plus importantes.

Elle doit permettre de consulter :
- Les trois confrontations de la semaine.
- Les adversaires.
- Les jours des rencontres.
- Les couleurs attribuées.
- Le statut de chaque match.
- Les résultats des matchs précédents.

Prévoir deux vues simples :
- Semaine en cours.
- Historique.

Les statuts possibles :
- À jouer.
- Résultat en attente de confirmation.
- Validé.
- Contesté.
- Non joué.

🆕 Ces cinq statuts restent inchangés. Une indication secondaire « Partie détectée » peut apparaître sur un match « À jouer », et une icône « vérifié Chess.com » sur un match validé lié à sa partie.

Chaque confrontation doit permettre d'accéder aux détails du match et de déclarer son résultat.

Le pseudonyme Chess.com et, si possible, un lien vers le profil du joueur doivent être accessibles.

🆕 **Détail d'un match** : un bloc « Partie Chess.com » est ajouté :
- s'il n'y a pas encore de partie : le bouton « Rechercher la partie sur Chess.com » et la date de la dernière recherche ;
- si la correspondance est certaine : le résultat proposé, la date, la cadence, le lien « Voir la partie sur Chess.com », et les boutons « Accepter ce résultat » / « Déclarer autrement » ;
- si elle est incertaine : la liste des parties candidates (date, cadence, couleurs, résultat, lien), avec le motif de l'incertitude ;
- si le match est validé avec une partie liée : le lien et, quand l'API les fournit, les informations complémentaires (cadence, ouverture ECO, précision des coups, classements des joueurs au moment de la partie).

🆕 **Historique** : chaque ligne d'un match lié à une partie Chess.com propose un accès direct à la partie.

## 4.3. Classement

Cette page affiche le classement général du championnat.

Les informations essentielles sont :
- Position.
- Nom du joueur.
- Nombre de matchs joués.
- Nombre de victoires.
- Nombre de nulles.
- Nombre de défaites.
- Nombre total de points.

Prévoir une possibilité de consulter :
- Le classement général.
- Le classement de la semaine.

Le classement général est cumulatif.

L'interface doit rester simple, lisible et adaptée au mobile.

🆕 Aucune donnée Chess.com n'apparaît dans le classement.

## 4.4. Profils

Chaque participant possède un profil avec :
- Nom ou pseudonyme.
- Avatar.
- Pseudonyme Chess.com.
- Elo initial déclaré.
- Points accumulés.
- Statistiques essentielles : victoires, nulles et défaites.
- Historique des matchs.

On peut également afficher une petite visualisation de l'évolution de sa position au classement.

Ne pas transformer les profils en pages de statistiques trop complexes.

🆕 **Profil synchronisé avec Chess.com** :
- **Avatar** : l'avatar Chess.com est utilisé s'il existe, sinon les initiales. Le joueur peut préférer ses initiales.
- **Pseudonyme** : affiché avec un indicateur « vérifié » ou « introuvable », et un lien vers le profil Chess.com.
- **Bloc séparé « Sur Chess.com — hors championnat »**, placé après les statistiques Chess IR et visuellement distinct : classements Rapid, Blitz, Bullet et Daily (actuel et meilleur), bilan global victoires/nuls/défaites, date d'inscription et dernière connexion sur Chess.com, et la date de dernière mise à jour. Une phrase rappelle que ces chiffres concernent toute l'activité du joueur sur Chess.com et ne comptent pas dans le championnat.
- **Elo synchronisé (décision validée)** : l'Elo affiché est celui de Chess.com dans la cadence principale du championnat (*rapid* par défaut), mis à jour à chaque synchronisation. L'**Elo initial** du participant est lui aussi repris de Chess.com : c'est le classement au moment de l'inscription, ou à la première synchronisation s'il manquait. L'administrateur peut le corriger. Sans classement Chess.com, le joueur peut saisir son Elo à la main. L'Elo n'intervient jamais dans les points ni dans le classement.

## 4.5. Historique et statistiques

Prévoir un historique permettant de retrouver les résultats précédents.

Afficher quelques statistiques pertinentes :
- Nombre total de victoires.
- Nombre de nulles.
- Nombre de défaites.
- Nombre de matchs joués.
- Progression au classement.

Cette section peut être intégrée au profil ou à la page Matchs. Il n'est pas nécessaire d'en faire un onglet principal supplémentaire.

🆕 Ces statistiques restent **exclusivement Chess IR**. L'historique donne accès aux parties Chess.com liées (voir §4.2).

## 4.6. Récompenses et distinctions

Cette fonctionnalité est importante pour le côté convivial du championnat.

Nous voulons des distinctions qui valorisent différents types de performances, pas uniquement les joueurs qui terminent premiers.

Exemples :

**Champion de la semaine**
- Participant ayant obtenu le meilleur score sur les trois rondes.

**Chevalier surprise**
- Participant ayant réalisé une victoire particulièrement inattendue contre un joueur mieux classé.

**Meilleure progression**
- Participant ayant réalisé la plus grande progression au classement.

**Série gagnante**
- Participant ayant obtenu la plus longue série de victoires.

Prévoir également des badges :
- Première victoire.
- Cinq victoires.
- Trois victoires consécutives.
- Première victoire contre le leader.
- Première remontée au classement.

Les distinctions peuvent être visibles sur le profil et dans une section dédiée.

Il faudra éviter de récompenser uniquement les meilleurs joueurs. Le but est de valoriser la participation et la progression.

🆕 Les distinctions se calculent uniquement sur les résultats Chess IR validés. « Mieux classé » s'entend au classement Chess IR, ou à l'Elo initial validé en semaine 1, jamais au classement Chess.com en direct.

## 4.7. Notifications

Prévoir des notifications internes simples :
- Nouvelle confrontation publiée.
- Résultat à confirmer.
- Résultat confirmé.
- Match contesté.
- Classement actualisé.
- Nouveau tirage disponible.
- Distinction obtenue.
- 🆕 Partie détectée sur Chess.com (résultat proposé, à accepter ou ignorer).
- 🆕 Pseudonyme Chess.com introuvable (à corriger).

Les notifications push ne sont pas indispensables à la première version.

# 5. ESPACE ADMINISTRATEUR

L'application doit disposer d'un espace administrateur distinct de l'interface classique.

L'administrateur est chargé de gérer le championnat.

Il doit pouvoir :

### Gestion des participants
- Ajouter un participant.
- Modifier ses informations.
- Activer ou suspendre un compte.
- Consulter ses statistiques.
- 🆕 Voir l'état du pseudonyme Chess.com de chaque joueur (vérifié, introuvable, absent) et forcer une nouvelle synchronisation.
- 🆕 Modifier un pseudonyme pendant un championnat en cours (action tracée).
- 🆕 Corriger si besoin l'Elo initial repris de Chess.com.

### Gestion du championnat
- Créer et démarrer le championnat.
- 🆕 Choisir les paramètres de détection (cadences acceptées, parties classées uniquement, fuseau horaire), figés au lancement.
- Consulter la semaine en cours.
- Clôturer une semaine.
- 🆕 Avant la clôture, consulter les parties détectées mais non déclarées.
- Générer le tirage de la semaine suivante.
- Consulter les anciennes rondes.

### Gestion des confrontations
- Consulter tous les matchs.
- Consulter les résultats.
- Intervenir en cas de contestation.
- 🆕 Consulter, dans le dossier d'arbitrage, les parties Chess.com candidates et leur lien.
- Corriger exceptionnellement un résultat.
- 🆕 Lier ou délier manuellement une partie Chess.com à une confrontation, notamment pour une correspondance incertaine comme des couleurs inversées.
- 🆕 Lancer « Synchroniser la semaine » (recherche des parties de tous les matchs à jouer).
- Gérer les matchs non joués.

### Gestion des classements
- Consulter le classement général.
- Consulter les classements hebdomadaires.
- Vérifier les calculs.

### Gestion des récompenses
- Consulter les distinctions attribuées.
- Attribuer exceptionnellement une distinction si nécessaire.

Le tirage hebdomadaire doit être déclenché explicitement par l'administrateur.

Une fois publié, il doit être verrouillé pour éviter que les confrontations soient modifiées accidentellement.

# 6. NAVIGATION ET EXPÉRIENCE UTILISATEUR

La navigation doit être pensée prioritairement pour les smartphones.

La barre de navigation inférieure comporte quatre entrées :

1. Accueil
2. Matchs
3. Classement
4. Profil

Les pages secondaires, comme l'historique, les récompenses et la validation d'un résultat, seront accessibles depuis les pages principales.

L'interface doit être :
- Responsive.
- Rapide.
- Facile à comprendre.
- Fluide.
- Cohérente avec l'identité visuelle de Chess IR.

Les actions importantes doivent être accessibles en peu de clics.

Un participant doit pouvoir :
1. Ouvrir l'application.
2. Voir ses adversaires.
3. Jouer sur Chess.com.
4. Déclarer son résultat.
5. Consulter son classement.

Le tout sans avoir à parcourir plusieurs menus.

🆕 **Parcours avec détection** (le parcours manuel ci-dessus reste toujours disponible) :
1. Ouvrir l'application et voir ses adversaires.
2. Jouer sur Chess.com (bouton « Défier sur Chess.com »).
3. Revenir dans Chess IR : la partie est retrouvée automatiquement ou en un clic (« Rechercher la partie »).
4. Accepter le résultat proposé (1 clic). L'adversaire reçoit la demande de confirmation.
5. L'adversaire confirme en 1 clic et le résultat devient officiel.
6. Si la partie n'est pas encore visible sur Chess.com : déclarer manuellement, sans attendre.

# 7. STACK TECHNIQUE

La stack est imposée.

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Lucide Icons

### Backend et base de données
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Realtime
- Row Level Security (RLS)

Les Edge Functions pourront être utilisées pour les opérations sensibles si nécessaire.

L'application doit être déployable sur une plateforme comme Vercel, avec Supabase comme backend.

Il ne faut pas développer un backend Django ou Node.js séparé sans justification particulière.

### 🆕 Intégration Chess.com

- **Une Edge Function Supabase `chesscom-sync`**, seul composant qui appelle l'API Chess.com. Elle s'exécute côté serveur pour une raison de confiance : si le navigateur écrivait la détection, un joueur pourrait fabriquer une « partie trouvée ». Elle vérifie le jeton de l'appelant et ses droits (joueur du match ou administrateur), interroge l'API, applique les règles de correspondance (§3.7), puis écrit le résultat avec la clé de service. Ses actions :
  - `verify-username` : vérifie l'existence d'un pseudonyme ;
  - `sync-profile` : synchronise le profil et les statistiques d'un joueur ;
  - `detect-match` : recherche la partie d'une confrontation ;
  - `sync-week` : recherche les parties de tous les matchs d'une semaine (admin).
- **Bonnes pratiques PubAPI** : requêtes **en série** (Chess.com renvoie 429 sur les requêtes parallèles), User-Agent identifiant l'application avec un contact défini en variable d'environnement (pas d'adresse personnelle en dur), recherche limitée à l'archive du mois de la semaine (et au mois précédent si la semaine chevauche deux mois).
- **Cache en base** : profils rafraîchis au plus une fois toutes les 24 h (sauf action explicite) ; une recherche par match au plus toutes les 2 minutes.
- **Synchronisation planifiée (optionnelle)** : `pg_cron` + `pg_net` appellent `sync-week` toutes les 30 minutes pendant une semaine active.
- **Tolérance aux pannes** : si Chess.com est indisponible, lent ou renvoie une erreur, Chess IR continue de fonctionner normalement (déclaration manuelle). L'erreur est enregistrée et affichée discrètement (« Chess.com indisponible, réessayez plus tard »).

## 7.1. Modèle de données indicatif

Prévoir une structure de base de données propre et normalisée.

Entités principales :

- profiles : informations des utilisateurs.
- tournaments : informations du championnat.
- participants : inscription des joueurs au championnat.
- weeks : périodes hebdomadaires.
- rounds : les trois rondes de chaque semaine.
- matches : confrontations entre joueurs.
- match_results : résultats déclarés et confirmés.
- notifications : notifications internes.
- achievements : distinctions et récompenses.
- player_achievements : distinctions obtenues par les participants.

🆕 Ajouts et modifications :

| Table | Changement | Contenu |
|---|---|---|
| `chesscom_profiles` | nouvelle | `profile_id` (clé, 1-1 avec `profiles`), `username`, `player_id` Chess.com, `avatar_url`, `status` (`verified`, `not_found`, `error`), `ratings` (JSON par cadence : actuel, meilleur, bilan V/N/D), `joined_at`, `last_online`, `fetched_at`, `last_error`. **Séparée des statistiques du championnat.** |
| `chesscom_games` | nouvelle | Parties Chess.com retenues comme candidates : `match_id`, `game_url` (**unique** : une partie ne compte que pour un seul match), `game_uuid`, `end_time`, `time_class`, `time_control`, `rated`, `white_username`, `black_username`, `white_result`, `black_result`, `mapped_result` (`white_win`, `black_win`, `draw` ou nul si code inconnu), `colors_match`, `confidence` (`certain`, `uncertain`), `uncertainty_reason`, `eco`, `accuracies`, `detected_at`. |
| `matches` | colonnes ajoutées | `chesscom_game_id` (partie liée, facultative), `declaration_source` (`manual`, `chesscom`), `chesscom_checked_at` (dernière recherche, pour la limite de fréquence). |
| `match_results` | actions ajoutées | `detect` (partie certaine trouvée), `link_game` / `unlink_game` (lien ajouté ou retiré par l'admin). |
| `tournaments` | colonnes ajoutées | `chesscom_time_classes` (liste, défaut `{rapid}`), `chesscom_rated_only` (défaut faux), `timezone`. Figées au lancement par le trigger existant. |
| `profiles` | colonne ajoutée | `use_chesscom_avatar` (défaut vrai). La modification de `chesscom_username` par le joueur est bloquée pendant un championnat en cours. |
| `username_changes` | nouvelle | Trace des modifications de pseudonyme : ancien, nouveau, auteur, date. |

Les relations, contraintes, index et politiques RLS doivent être correctement définis.

Les points ne doivent pas être modifiables librement par les participants.

Le calcul des classements doit reposer exclusivement sur les résultats officiels validés.

🆕 Les vues de classement (`standings`, `week_standings`) **ne lisent aucune table Chess.com**. Un test automatisé le vérifie.

# 8. SÉCURITÉ ET GESTION DES RÔLES

Prévoir au minimum deux rôles :

**Participant**
- Consulter le championnat.
- Consulter les confrontations.
- Déclarer un résultat.
- 🆕 Accepter un résultat proposé par la détection Chess.com (ce qui vaut déclaration).
- 🆕 Lancer la recherche de la partie d'un match auquel il participe.
- Confirmer ou contester un résultat lorsqu'il est concerné.
- Consulter les classements.
- Consulter les profils.

**Administrateur**
- Accéder à toutes les fonctionnalités de gestion.
- Générer les confrontations.
- Gérer les participants.
- Arbitrer les contestations.
- Corriger les résultats.
- Gérer les semaines.
- 🆕 Lier ou délier une partie Chess.com, modifier un pseudonyme en cours de championnat, synchroniser une semaine.

Les permissions doivent être contrôlées côté Supabase avec RLS et, pour les opérations sensibles, côté serveur.

Ne jamais se contenter de masquer les boutons d'administration dans React.

🆕 Règles propres à l'intégration :
- les tables `chesscom_profiles` et `chesscom_games` sont **en lecture seule** pour les clients ; seule l'Edge Function (clé de service) y écrit ;
- accepter une proposition passe par une fonction SQL qui revérifie côté serveur que la partie est liée à ce match, qu'elle est « certaine » et que l'appelant est l'un des deux joueurs ;
- la clé de service n'est jamais exposée au navigateur ;
- seules des données **publiques** de Chess.com sont collectées, au minimum nécessaire ; elles sont supprimées si le joueur retire son pseudonyme ou si son compte est supprimé.

# 9. PRINCIPES DE DÉVELOPPEMENT

Quelques exigences importantes :

1. Ne pas surdimensionner le projet. Il s'agit d'une application de championnat de classe, pas d'une plateforme commerciale.
2. Privilégier la simplicité et la qualité de l'expérience mobile.
3. Ne pas ajouter des fonctionnalités qui ne répondent pas à un besoin réel.
4. Éviter les données fictives dans la version de production.
5. Prévoir un jeu de données de démonstration distinct pour les tests.
6. Garantir la cohérence du classement après chaque résultat validé.
7. Éviter les doubles déclarations et les doubles attributions de points.
8. Prévoir les cas particuliers : nombre impair de participants, matchs non joués, contestations, égalités de points et répétition des adversaires.
9. Conserver un historique des semaines et des résultats.
10. Prévoir un fonctionnement fiable même lorsque plusieurs utilisateurs effectuent des actions simultanément.
11. 🆕 Chess IR doit rester **pleinement utilisable sans Chess.com** (API indisponible, données en retard, joueur sans pseudonyme) : la déclaration manuelle est toujours possible.
12. 🆕 Aucune donnée Chess.com ne doit influencer les points, le classement, l'appariement ou la validation d'un résultat.
13. 🆕 Prévoir les cas particuliers de la détection : partie pas encore publiée, plusieurs parties entre les deux joueurs, couleurs inversées, cadence non acceptée, pseudonyme introuvable ou modifié, partie déjà liée à un autre match, codes de résultat inconnus.
14. 🆕 Les données de démonstration et les tests ne doivent pas appeler la vraie API : utiliser des réponses Chess.com enregistrées (fixtures).

# 10. LIVRABLES ATTENDUS

Nous attendons une véritable application fonctionnelle, pas seulement une maquette visuelle.

Le travail devra comprendre :

- L'interface React complète.
- La configuration Supabase.
- Le schéma SQL de la base de données.
- Les politiques RLS.
- Le système d'authentification.
- La logique de génération des appariements.
- Le système de déclaration et de validation des résultats.
- Le calcul automatique du classement.
- L'espace administrateur.
- Les données de démonstration.
- Un README expliquant l'installation et le déploiement.
- 🆕 L'Edge Function `chesscom-sync` et sa documentation de déploiement (variables d'environnement, planification optionnelle).
- 🆕 La migration SQL de l'intégration (tables, colonnes, RLS, fonctions d'acceptation et de liaison).

Prévoir également des tests pour les règles essentielles : appariement, attribution des points, validation des résultats et recalcul du classement.

🆕 Tests supplémentaires :
- règles de correspondance : partie unique certaine, plusieurs candidates, couleurs inversées, hors fenêtre, cadence refusée, partie déjà liée ;
- traduction de chaque code de résultat Chess.com ;
- une proposition acceptée exige toujours la confirmation de l'adversaire ; aucune validation automatique, y compris à la clôture ;
- un participant ne peut ni écrire dans les tables Chess.com ni accepter la proposition d'un match qui n'est pas le sien ;
- le classement est identique avec ou sans données Chess.com ;
- API indisponible ou réponse 429 : l'application continue de fonctionner.

# 11. MÉTHODE DE TRAVAIL ATTENDUE

Avant de commencer à coder :

1. Examiner les deux références visuelles jointes.
2. Comprendre les règles du championnat.
3. Proposer une architecture technique cohérente.
4. Définir le modèle de données Supabase.
5. Identifier les cas particuliers à traiter.
6. Présenter brièvement le plan de développement.

Ensuite, développer l'application progressivement.

Priorité de développement :

**Phase 1 :**
- Authentification.
- Gestion des participants.
- Profils.
- Structure du championnat.

**Phase 2 :**
- Génération des confrontations.
- Gestion des rondes hebdomadaires.
- Déclaration et validation des résultats.
- Classement automatique.

**Phase 3 :**
- Tableau de bord.
- Historique.
- Statistiques.
- Récompenses et badges.

**Phase 4 :**
- Tests.
- Corrections.
- Optimisation mobile.
- Finalisation du déploiement.

🆕 **Phase 5 : intégration Chess.com** (les phases 1 à 4 sont livrées ; chaque étape est utilisable seule) :
1. Vérification et synchronisation des profils (pseudonyme vérifié, avatar, bloc « Sur Chess.com — hors championnat »).
2. Liens vers les parties : liaison manuelle par l'admin, affichage dans le détail du match et l'historique.
3. Détection automatique et proposition de résultat, intégrées au circuit de validation existant.
4. Synchronisation planifiée (optionnelle).

Ne pas se limiter à créer des écrans statiques. Les boutons, formulaires et interactions doivent être fonctionnels et reliés aux données réelles.

Si une information n'est pas encore définie, ne pas inventer une règle métier irréversible. Proposer une valeur configurable ou demander une clarification.

---

# 12. OBJECTIF FINAL

Nous voulons une application qui donne envie aux camarades de participer au championnat.

Chess IR doit rendre les affrontements intéressants, les classements accessibles et les progressions visibles.

L'application doit rester légère, élégante et conviviale.

**Notre devise pourrait être : Jouer. Progresser. Grimper.**

L'objectif est de disposer d'une première version fonctionnelle rapidement, tout en conservant une architecture propre et suffisamment solide pour faire évoluer le championnat au fil des semaines.
