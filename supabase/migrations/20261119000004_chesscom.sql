-- =====================================================================
-- Chess IR — intégration Chess.com (cahier des charges v1.1, §3.7)
-- =====================================================================
-- * Les données Chess.com vivent dans des tables séparées, en lecture seule
--   pour les clients. Seule l'Edge Function `chesscom-sync` (clé de service)
--   y écrit.
-- * Elles ne sont lues par AUCUNE vue de classement.
-- * Une partie détectée ne fait que pré-remplir une déclaration : la
--   confirmation de l'adversaire reste obligatoire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Paramètres du championnat (figés au lancement)
-- ---------------------------------------------------------------------
alter table public.tournaments
  add column chesscom_time_classes text[] not null default '{rapid}'
    check (chesscom_time_classes <@ array['rapid','blitz','bullet','daily'] and cardinality(chesscom_time_classes) >= 1),
  add column chesscom_rated_only boolean not null default false,
  add column timezone text not null default 'Africa/Douala';

create or replace function public.lock_bye_points() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' and (
       new.bye_points <> old.bye_points
    or new.chesscom_time_classes <> old.chesscom_time_classes
    or new.chesscom_rated_only <> old.chesscom_rated_only
    or new.timezone <> old.timezone) then
    raise exception 'Les règles du championnat sont figées une fois le championnat lancé';
  end if;
  return new;
end $$;

create or replace function public.update_chesscom_settings(
  p_tournament uuid, p_time_classes text[], p_rated_only boolean, p_timezone text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Fuseau horaire inconnu : %', p_timezone;
  end if;
  update public.tournaments
     set chesscom_time_classes = p_time_classes, chesscom_rated_only = p_rated_only, timezone = p_timezone
   where id = p_tournament;
end $$;

-- ---------------------------------------------------------------------
-- Profils Chess.com
-- ---------------------------------------------------------------------
alter table public.profiles add column use_chesscom_avatar boolean not null default true;

create table public.chesscom_profiles (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  username    text not null,
  player_id   bigint,
  avatar_url  text,
  url         text,
  status      text not null check (status in ('verified','not_found','error')),
  -- {"rapid": {"current": 812, "best": 901, "win": 10, "loss": 8, "draw": 2}, ...}
  ratings     jsonb not null default '{}'::jsonb,
  joined_at   timestamptz,
  last_online timestamptz,
  fetched_at  timestamptz not null default now(),
  last_error  text
);

-- Trace des changements de pseudonyme.
create table public.username_changes (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  old_value  text,
  new_value  text,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index username_changes_profile_idx on public.username_changes (profile_id, created_at desc);

-- ---------------------------------------------------------------------
-- Parties Chess.com candidates / liées
-- ---------------------------------------------------------------------
create table public.chesscom_games (
  id                 uuid primary key default gen_random_uuid(),
  tournament_id      uuid not null references public.tournaments (id) on delete cascade,
  match_id           uuid not null references public.matches (id) on delete cascade,
  game_url           text not null unique, -- une partie ne compte que pour un seul match
  game_uuid          text,
  end_time           timestamptz not null,
  time_class         text not null,
  time_control       text,
  rated              boolean,
  white_username     text not null,
  black_username     text not null,
  white_rating       integer,
  black_rating       integer,
  white_result       text not null,
  black_result       text not null,
  -- Résultat exprimé dans les couleurs attribuées par le tirage Chess IR.
  result_for_match   text check (result_for_match in ('white_win','black_win','draw')),
  colors_match       boolean not null,
  time_class_ok      boolean not null,
  confidence         text not null check (confidence in ('certain','uncertain')),
  uncertainty_reason text,
  eco                text,
  accuracies         jsonb,
  detected_at        timestamptz not null default now()
);
create index chesscom_games_match_idx on public.chesscom_games (match_id);
create index chesscom_games_tournament_idx on public.chesscom_games (tournament_id);

alter table public.matches
  add column chesscom_game_id    uuid references public.chesscom_games (id) on delete set null,
  add column declaration_source  text check (declaration_source in ('manual','chesscom')),
  add column chesscom_checked_at timestamptz;

-- Nouvelles actions du journal et nouveaux types de notification.
alter table public.match_results drop constraint match_results_action_check;
alter table public.match_results add constraint match_results_action_check
  check (action in ('declare','confirm','contest','admin_set','admin_unplayed','admin_reset','detect','link_game','unlink_game'));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('draw_published','result_to_confirm','result_confirmed','result_disputed','standings_updated',
                  'achievement','result_corrected','game_detected','chesscom_username_invalid'));

-- ---------------------------------------------------------------------
-- Déclaration : source et partie liée
-- ---------------------------------------------------------------------

-- La déclaration manuelle existante enregistre désormais sa source.
create or replace function public.declare_result(p_match uuid, p_result text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_m public.matches;
  v_white_profile uuid;
  v_black_profile uuid;
  v_opponent uuid;
  v_name text;
begin
  if p_result not in ('white_win','black_win','draw') then raise exception 'Résultat invalide'; end if;
  select * into v_m from public.matches where id = p_match for update;
  if not found then raise exception 'Match introuvable'; end if;

  select profile_id into v_white_profile from public.participants where id = v_m.white_id;
  select profile_id into v_black_profile from public.participants where id = v_m.black_id;
  if auth.uid() not in (v_white_profile, v_black_profile) then
    raise exception 'Seuls les deux joueurs peuvent déclarer ce résultat' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Compte suspendu' using errcode = '42501';
  end if;
  if exists (select 1 from public.rounds r join public.weeks w on w.id = r.week_id
             where r.id = v_m.round_id and w.status <> 'active') then
    raise exception 'Semaine clôturée : contactez l''administrateur';
  end if;
  if v_m.status <> 'scheduled' then
    raise exception 'Un résultat a déjà été déclaré pour ce match';
  end if;

  update public.matches
     set status = 'pending', declared_result = p_result, declared_by = auth.uid(), declared_at = now(),
         declaration_source = 'manual'
   where id = p_match;
  insert into public.match_results (match_id, action, result, actor_id) values (p_match, 'declare', p_result, auth.uid());

  v_opponent := case when auth.uid() = v_white_profile then v_black_profile else v_white_profile end;
  select display_name into v_name from public.profiles where id = auth.uid();
  perform public.notify(v_opponent, 'result_to_confirm', 'Résultat à confirmer',
    v_name || ' a déclaré : ' || public.result_label(p_result) || '.', '/matchs/' || p_match);
end $$;

-- Accepter une partie détectée = déclarer son résultat, avec la partie liée.
-- Revérifie tout côté serveur ; la confirmation de l'adversaire reste requise.
create or replace function public.accept_chesscom_game(p_match uuid, p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_g public.chesscom_games;
begin
  select * into v_g from public.chesscom_games where id = p_game and match_id = p_match;
  if not found then raise exception 'Partie introuvable pour ce match'; end if;
  if v_g.result_for_match is null then raise exception 'Résultat Chess.com non reconnu : déclarez manuellement'; end if;
  if not v_g.colors_match then
    raise exception 'Couleurs inversées par rapport au tirage : seul l''administrateur peut retenir cette partie';
  end if;
  if not v_g.time_class_ok then raise exception 'Cadence non acceptée dans ce championnat'; end if;
  -- Mêmes contrôles et même circuit que la déclaration manuelle.
  perform public.declare_result(p_match, v_g.result_for_match);
  update public.matches set declaration_source = 'chesscom', chesscom_game_id = p_game where id = p_match;
  insert into public.match_results (match_id, action, actor_id, comment)
  values (p_match, 'link_game', auth.uid(), 'Résultat repris de la partie Chess.com ' || v_g.game_url);
end $$;

-- Retrait / remise à zéro : on délie aussi la partie.
create or replace function public.withdraw_declaration(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_m public.matches;
begin
  select * into v_m from public.matches where id = p_match for update;
  if v_m.status <> 'pending' or v_m.declared_by is distinct from auth.uid() then
    raise exception 'Aucune déclaration à annuler';
  end if;
  update public.matches set status = 'scheduled', declared_result = null, declared_by = null, declared_at = null,
         declaration_source = null, chesscom_game_id = null
   where id = p_match;
  insert into public.match_results (match_id, action, actor_id, comment)
  values (p_match, 'admin_reset', auth.uid(), 'Déclaration retirée par son auteur');
end $$;

-- L'arbitrage « reset » délie également la partie (le reste est inchangé).
create or replace function public.admin_resolve_match(p_match uuid, p_action text, p_result text, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_m public.matches;
  v_profile uuid;
  v_msg text;
begin
  perform public.assert_admin();
  if coalesce(trim(p_comment), '') = '' then raise exception 'Un motif est obligatoire'; end if;
  select * into v_m from public.matches where id = p_match for update;
  if not found then raise exception 'Match introuvable'; end if;

  if p_action = 'set' then
    if p_result not in ('white_win','black_win','draw') then raise exception 'Résultat invalide'; end if;
    update public.matches
       set status = 'validated', result = p_result, declared_result = coalesce(declared_result, p_result),
           validated_at = now()
     where id = p_match;
    insert into public.match_results (match_id, action, result, actor_id, comment)
    values (p_match, 'admin_set', p_result, auth.uid(), p_comment);
    v_msg := 'Résultat fixé par l''administrateur : ' || public.result_label(p_result) || '.';
  elsif p_action = 'unplayed' then
    update public.matches set status = 'unplayed', result = null where id = p_match;
    insert into public.match_results (match_id, action, actor_id, comment)
    values (p_match, 'admin_unplayed', auth.uid(), p_comment);
    v_msg := 'Match déclaré non joué par l''administrateur.';
  elsif p_action = 'reset' then
    update public.matches
       set status = 'scheduled', result = null, declared_result = null, declared_by = null,
           declared_at = null, validated_at = null, declaration_source = null, chesscom_game_id = null
     where id = p_match;
    insert into public.match_results (match_id, action, actor_id, comment)
    values (p_match, 'admin_reset', auth.uid(), p_comment);
    v_msg := 'Match remis « à jouer » par l''administrateur.';
  else
    raise exception 'Action inconnue';
  end if;

  for v_profile in select profile_id from public.participants where id in (v_m.white_id, v_m.black_id) loop
    perform public.notify(v_profile, 'result_corrected', 'Décision de l''administrateur',
      v_msg || ' Motif : ' || left(p_comment, 140), '/matchs/' || p_match);
  end loop;
  if p_action = 'set' then
    perform public.award_badges(v_m.white_id, p_match);
    perform public.award_badges(v_m.black_id, p_match);
  end if;
end $$;

-- Lier / délier manuellement une partie (admin), y compris couleurs inversées.
-- Ne change jamais le résultat : l'arbitrage reste une décision séparée.
create or replace function public.admin_link_game(p_match uuid, p_game uuid, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  perform public.assert_admin();
  perform 1 from public.matches where id = p_match for update;
  if p_game is null then
    update public.matches set chesscom_game_id = null where id = p_match;
    insert into public.match_results (match_id, action, actor_id, comment)
    values (p_match, 'unlink_game', auth.uid(), nullif(trim(p_comment), ''));
  else
    select game_url into v_url from public.chesscom_games where id = p_game and match_id = p_match;
    if v_url is null then raise exception 'Partie introuvable pour ce match'; end if;
    update public.matches set chesscom_game_id = p_game where id = p_match;
    insert into public.match_results (match_id, action, actor_id, comment)
    values (p_match, 'link_game', auth.uid(), coalesce(nullif(trim(p_comment), '') || ' — ', '') || v_url);
  end if;
end $$;

-- Modification d'un profil par l'admin : le pseudonyme Chess.com n'y figure plus
-- (il passe par l'Edge Function, qui le vérifie et trace le changement).
drop function public.admin_update_profile(uuid, text, text, integer, boolean, integer);
create function public.admin_update_profile(
  p_profile uuid, p_display_name text, p_elo integer, p_is_active boolean, p_initial_elo integer default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_profile = auth.uid() and not p_is_active then
    raise exception 'Vous ne pouvez pas suspendre votre propre compte';
  end if;
  update public.profiles
     set display_name = trim(p_display_name), declared_elo = p_elo, is_active = p_is_active
   where id = p_profile;
  if p_initial_elo is not null then
    update public.participants set initial_elo = p_initial_elo where profile_id = p_profile;
  end if;
end $$;

-- L'Elo initial d'un nouveau participant reprend l'Elo synchronisé depuis Chess.com
-- (add_participant copie profiles.declared_elo, que la synchronisation alimente).

-- ---------------------------------------------------------------------
-- Sécurité
-- ---------------------------------------------------------------------
alter table public.chesscom_profiles enable row level security;
alter table public.chesscom_games    enable row level security;
alter table public.username_changes  enable row level security;

create policy "lecture" on public.chesscom_profiles for select to authenticated using (true);
create policy "lecture" on public.chesscom_games    for select to authenticated using (true);
create policy "lecture admin ou soi" on public.username_changes
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());

revoke all on public.chesscom_profiles, public.chesscom_games, public.username_changes from anon;
revoke insert, update, delete, truncate on public.chesscom_profiles, public.chesscom_games, public.username_changes
  from authenticated;

-- Le pseudonyme n'est plus modifiable directement : il passe par l'Edge Function
-- (vérification de l'existence sur Chess.com + verrou pendant un championnat).
revoke update on public.profiles from authenticated;
grant update (display_name, declared_elo, avatar_color, use_chesscom_avatar) on public.profiles to authenticated;

revoke execute on function public.accept_chesscom_game(uuid, uuid), public.admin_link_game(uuid, uuid, text),
  public.update_chesscom_settings(uuid, text[], boolean, text),
  public.admin_update_profile(uuid, text, integer, boolean, integer)
  from public, anon;
grant execute on function public.accept_chesscom_game(uuid, uuid), public.admin_link_game(uuid, uuid, text),
  public.update_chesscom_settings(uuid, text[], boolean, text),
  public.admin_update_profile(uuid, text, integer, boolean, integer)
  to authenticated;

alter publication supabase_realtime add table public.chesscom_games;
