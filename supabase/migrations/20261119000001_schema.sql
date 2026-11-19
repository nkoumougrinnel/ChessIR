-- =====================================================================
-- Chess IR — schéma principal
-- =====================================================================
-- Principes :
--  * Les participants ne peuvent écrire directement dans aucune table de jeu.
--    Toute écriture sensible passe par des fonctions `security definer`
--    (voir 20261119000002_functions.sql) qui contrôlent rôle et état.
--  * Les points ne sont jamais stockés : le classement est une vue calculée
--    exclusivement à partir des matchs au statut `validated` (+ exemptions).
--  * Les appariements publiés sont verrouillés par trigger.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text not null check (char_length(trim(display_name)) between 2 and 40),
  chesscom_username text check (chesscom_username ~ '^[A-Za-z0-9_-]{3,25}$'),
  declared_elo      integer check (declared_elo between 0 and 3500),
  avatar_color      text not null default 'violet'
                    check (avatar_color in ('violet','gold','blue','emerald','rose','cyan','orange','slate')),
  role              text not null default 'participant' check (role in ('participant','admin')),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Championnat
-- ---------------------------------------------------------------------
create table public.tournaments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 3 and 80),
  status      text not null default 'draft' check (status in ('draft','active','finished')),
  -- Points attribués à un exempt. Choisi par l'admin et figé au lancement.
  bye_points  smallint not null default 0 check (bye_points in (0, 1, 3)),
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);

create table public.participants (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete restrict,
  status        text not null default 'active' check (status in ('active','suspended')),
  initial_elo   integer check (initial_elo between 0 and 3500),
  joined_at     timestamptz not null default now(),
  unique (tournament_id, profile_id)
);
create index participants_profile_idx on public.participants (profile_id);

create table public.weeks (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  number        integer not null check (number >= 1),
  start_date    date not null check (extract(isodow from start_date) = 1), -- lundi
  status        text not null default 'active' check (status in ('active','closed')),
  published_by  uuid references public.profiles (id),
  published_at  timestamptz not null default now(),
  closed_at     timestamptz,
  unique (tournament_id, number),
  unique (tournament_id, start_date)
);
-- Une seule semaine ouverte à la fois par championnat.
create unique index weeks_one_active_idx on public.weeks (tournament_id) where status = 'active';

create table public.rounds (
  id        uuid primary key default gen_random_uuid(),
  week_id   uuid not null references public.weeks (id) on delete cascade,
  number    smallint not null check (number between 1 and 3),
  play_date date not null,
  unique (week_id, number)
);

create table public.matches (
  id                 uuid primary key default gen_random_uuid(),
  tournament_id      uuid not null references public.tournaments (id) on delete cascade,
  round_id           uuid not null references public.rounds (id) on delete cascade,
  white_id           uuid not null references public.participants (id) on delete cascade,
  black_id           uuid not null references public.participants (id) on delete cascade,
  -- Rang au classement général au moment du tirage (récompenses « surprise »).
  white_rank_at_draw integer,
  black_rank_at_draw integer,
  status             text not null default 'scheduled'
                     check (status in ('scheduled','pending','validated','disputed','unplayed')),
  -- Résultat officiel (uniquement si validated).
  result             text check (result in ('white_win','black_win','draw')),
  -- Déclaration en attente de confirmation.
  declared_result    text check (declared_result in ('white_win','black_win','draw')),
  declared_by        uuid references public.profiles (id),
  declared_at        timestamptz,
  validated_at       timestamptz,
  updated_at         timestamptz not null default now(),
  check (white_id <> black_id),
  check ((status = 'validated') = (result is not null)),
  check (status not in ('pending','disputed') or declared_result is not null)
);
create index matches_round_idx on public.matches (round_id);
create index matches_white_idx on public.matches (white_id);
create index matches_black_idx on public.matches (black_id);
create index matches_tournament_status_idx on public.matches (tournament_id, status);

-- Exemptions : pas de faux match, une ligne par ronde concernée.
create table public.byes (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null unique references public.rounds (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  points         smallint not null check (points in (0, 1, 3)),
  created_at     timestamptz not null default now()
);
create index byes_participant_idx on public.byes (participant_id);

-- Journal immuable des déclarations, confirmations, contestations et corrections.
create table public.match_results (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  action     text not null check (action in ('declare','confirm','contest','admin_set','admin_unplayed','admin_reset')),
  result     text check (result in ('white_win','black_win','draw')),
  actor_id   uuid references public.profiles (id),
  comment    text check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index match_results_match_idx on public.match_results (match_id, created_at);

-- Photo du classement à chaque clôture de semaine (progression, distinctions).
create table public.standings_snapshots (
  week_id        uuid not null references public.weeks (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  rank           integer not null,
  points         integer not null,
  primary key (week_id, participant_id)
);
create index standings_snapshots_participant_idx on public.standings_snapshots (participant_id);

-- ---------------------------------------------------------------------
-- Notifications et récompenses
-- ---------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in ('draw_published','result_to_confirm','result_confirmed',
                                           'result_disputed','standings_updated','achievement','result_corrected')),
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_profile_idx on public.notifications (profile_id, created_at desc);

create table public.achievements (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  kind        text not null check (kind in ('distinction','badge')),
  name        text not null,
  description text not null,
  icon        text not null,
  sort_order  integer not null default 0
);

create table public.player_achievements (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id),
  week_id        uuid references public.weeks (id) on delete cascade,
  match_id       uuid references public.matches (id) on delete set null,
  awarded_by     uuid references public.profiles (id), -- non nul = attribution manuelle
  note           text check (char_length(note) <= 200),
  created_at     timestamptz not null default now()
);
-- Un badge ne s'obtient qu'une fois ; une distinction une fois par semaine.
create unique index player_achievements_unique_idx
  on public.player_achievements (participant_id, achievement_id,
                                 coalesce(week_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index player_achievements_week_idx on public.player_achievements (week_id);

insert into public.achievements (code, kind, name, description, icon, sort_order) values
  ('week_champion',  'distinction', 'Champion de la semaine', 'Meilleur score de la semaine sur les trois rondes.', 'crown', 1),
  ('surprise_knight','distinction', 'Chevalier surprise',     'Victoire inattendue contre un joueur mieux classé.', 'zap', 2),
  ('best_progress',  'distinction', 'Meilleure progression',  'Plus forte remontée au classement de la semaine.', 'trending-up', 3),
  ('win_streak',     'distinction', 'Série gagnante',         'Plus longue série de victoires en cours (3 minimum).', 'flame', 4),
  ('first_game',     'badge', 'Premier pas',               'Disputer sa première partie officielle.', 'footprints', 10),
  ('first_win',      'badge', 'Première victoire',         'Remporter sa première partie.', 'star', 11),
  ('full_week',      'badge', 'Semaine complète',          'Jouer ses trois matchs dans la même semaine.', 'calendar-check', 12),
  ('five_wins',      'badge', 'Cinq victoires',            'Atteindre cinq victoires au total.', 'medal', 13),
  ('three_in_a_row', 'badge', 'Trois d''affilée',          'Enchaîner trois victoires consécutives.', 'flame', 14),
  ('beat_leader',    'badge', 'Tombeur du leader',         'Battre le leader du classement.', 'swords', 15),
  ('first_climb',    'badge', 'Première remontée',         'Gagner des places au classement d''une semaine à l''autre.', 'trending-up', 16);

-- ---------------------------------------------------------------------
-- Verrouillage des appariements publiés
-- ---------------------------------------------------------------------
create or replace function public.lock_pairings() returns trigger
language plpgsql as $$
begin
  if new.white_id <> old.white_id or new.black_id <> old.black_id
     or new.round_id <> old.round_id or new.tournament_id <> old.tournament_id then
    raise exception 'Les confrontations publiées sont verrouillées';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger matches_lock_pairings before update on public.matches
  for each row execute function public.lock_pairings();

create or replace function public.lock_bye_points() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' and new.bye_points <> old.bye_points then
    raise exception 'La règle d''exemption est figée une fois le championnat lancé';
  end if;
  return new;
end $$;

create trigger tournaments_lock_bye_points before update on public.tournaments
  for each row execute function public.lock_bye_points();

-- Le journal des résultats ne peut pas être réécrit (les clients n'ont de toute façon
-- aucun droit d'écriture). La suppression reste possible par cascade, lorsqu'un
-- championnat entier est supprimé.
create or replace function public.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Historique non modifiable';
end $$;

create trigger match_results_append_only before update on public.match_results
  for each row execute function public.forbid_change();

-- ---------------------------------------------------------------------
-- Création automatique du profil à l'inscription
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1));
  v_chess text := nullif(trim(new.raw_user_meta_data ->> 'chesscom_username'), '');
begin
  if char_length(v_name) < 2 then v_name := v_name || '_'; end if;
  insert into public.profiles (id, display_name, chesscom_username)
  values (new.id, left(v_name, 40),
          case when v_chess ~ '^[A-Za-z0-9_-]{3,25}$' then v_chess end);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Vues de lecture (security_invoker : la RLS des tables s'applique)
-- ---------------------------------------------------------------------

-- Chaque match vu depuis chacun des deux joueurs.
create view public.participant_games with (security_invoker = true) as
select
  m.id                 as match_id,
  m.tournament_id,
  w.id                 as week_id,
  w.number             as week_number,
  r.number             as round_number,
  r.play_date,
  s.participant_id,
  s.opponent_id,
  s.color,
  m.status,
  m.result,
  m.declared_result,
  m.declared_by,
  s.own_rank_at_draw,
  s.opponent_rank_at_draw,
  case when m.status = 'validated' then
    case when m.result = 'draw' then 'D'
         when (m.result = 'white_win') = (s.color = 'white') then 'W'
         else 'L' end
  end as outcome,
  case when m.status = 'validated' then
    case when m.result = 'draw' then 1
         when (m.result = 'white_win') = (s.color = 'white') then 3
         else 0 end
  end as points
from public.matches m
join public.rounds r on r.id = m.round_id
join public.weeks  w on w.id = r.week_id
cross join lateral (values
  (m.white_id, m.black_id, 'white', m.white_rank_at_draw, m.black_rank_at_draw),
  (m.black_id, m.white_id, 'black', m.black_rank_at_draw, m.white_rank_at_draw)
) as s (participant_id, opponent_id, color, own_rank_at_draw, opponent_rank_at_draw);

-- Classement général cumulatif.
-- Départage : points ▸ victoires ▸ Buchholz (somme des points des adversaires rencontrés).
create view public.standings with (security_invoker = true) as
with games as (
  select participant_id,
         count(outcome)                         as played,
         count(*) filter (where outcome = 'W')  as wins,
         count(*) filter (where outcome = 'D')  as draws,
         count(*) filter (where outcome = 'L')  as losses,
         coalesce(sum(points), 0)               as game_points
  from public.participant_games
  group by participant_id
), bye_totals as (
  select participant_id, count(*) as byes, sum(points) as bye_points
  from public.byes group by participant_id
), totals as (
  select p.id as participant_id, p.tournament_id, p.profile_id, p.status as participant_status,
         coalesce(g.played, 0)::int  as played,
         coalesce(g.wins, 0)::int    as wins,
         coalesce(g.draws, 0)::int   as draws,
         coalesce(g.losses, 0)::int  as losses,
         coalesce(b.byes, 0)::int    as byes,
         (coalesce(g.game_points, 0) + coalesce(b.bye_points, 0))::int as points
  from public.participants p
  left join games g      on g.participant_id = p.id
  left join bye_totals b on b.participant_id = p.id
), buchholz as (
  select pg.participant_id, sum(t.points)::int as buchholz
  from public.participant_games pg
  join totals t on t.participant_id = pg.opponent_id
  where pg.outcome is not null
  group by pg.participant_id
)
select t.*,
       coalesce(bh.buchholz, 0) as buchholz,
       rank() over (partition by t.tournament_id
                    order by t.points desc, t.wins desc, coalesce(bh.buchholz, 0) desc)::int as rank,
       pr.display_name, pr.avatar_color, pr.chesscom_username
from totals t
join public.profiles pr on pr.id = t.profile_id
left join buchholz bh on bh.participant_id = t.participant_id;

-- Classement d'une semaine (points marqués pendant la semaine).
create view public.week_standings with (security_invoker = true) as
with games as (
  select week_id, participant_id,
         count(outcome)                        as played,
         count(*) filter (where outcome = 'W') as wins,
         count(*) filter (where outcome = 'D') as draws,
         count(*) filter (where outcome = 'L') as losses,
         coalesce(sum(points), 0)              as game_points
  from public.participant_games group by week_id, participant_id
), bye_totals as (
  select r.week_id, b.participant_id, count(*) as byes, sum(b.points) as bye_points
  from public.byes b join public.rounds r on r.id = b.round_id
  group by r.week_id, b.participant_id
), totals as (
  select w.id as week_id, w.number as week_number, p.id as participant_id, p.tournament_id, p.profile_id,
         coalesce(g.played, 0)::int as played,
         coalesce(g.wins, 0)::int   as wins,
         coalesce(g.draws, 0)::int  as draws,
         coalesce(g.losses, 0)::int as losses,
         coalesce(b.byes, 0)::int   as byes,
         (coalesce(g.game_points, 0) + coalesce(b.bye_points, 0))::int as points
  from public.weeks w
  join public.participants p on p.tournament_id = w.tournament_id
  left join games g      on g.week_id = w.id and g.participant_id = p.id
  left join bye_totals b on b.week_id = w.id and b.participant_id = p.id
  -- Ne lister que les joueurs concernés par la semaine (tirés au sort).
  where g.participant_id is not null or b.participant_id is not null
)
select t.*,
       rank() over (partition by t.week_id order by t.points desc, t.wins desc)::int as rank,
       pr.display_name, pr.avatar_color, pr.chesscom_username
from totals t join public.profiles pr on pr.id = t.profile_id;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.matches, public.notifications, public.weeks;
