-- =====================================================================
-- Chess IR — fonctions serveur (opérations sensibles)
-- =====================================================================
-- Toutes en `security definer` avec search_path figé. Chacune vérifie
-- elle-même l'identité (auth.uid()) et le rôle de l'appelant.
-- =====================================================================

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.assert_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Action réservée à l''administrateur' using errcode = '42501';
  end if;
end $$;

create or replace function public.notify(p_profile uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (profile_id, type, title, body, link)
  values (p_profile, p_type, p_title, p_body, p_link);
$$;

create or replace function public.result_label(p_result text) returns text
language sql immutable as $$
  select case p_result when 'white_win' then 'victoire des Blancs'
                       when 'black_win' then 'victoire des Noirs'
                       when 'draw' then 'match nul' end;
$$;

-- ---------------------------------------------------------------------
-- Badges (idempotents) — appelés après chaque résultat validé
-- ---------------------------------------------------------------------
create or replace function public.grant_achievement(
  p_participant uuid, p_code text, p_week uuid default null, p_match uuid default null,
  p_awarded_by uuid default null, p_note text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_ach public.achievements;
  v_profile uuid;
  v_rows int;
begin
  select * into v_ach from public.achievements where code = p_code;
  if not found then raise exception 'Distinction inconnue : %', p_code; end if;
  insert into public.player_achievements (participant_id, achievement_id, week_id, match_id, awarded_by, note)
  values (p_participant, v_ach.id, p_week, p_match, p_awarded_by, p_note)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    select profile_id into v_profile from public.participants where id = p_participant;
    perform public.notify(v_profile, 'achievement',
      case when v_ach.kind = 'badge' then 'Badge débloqué : ' else 'Distinction : ' end || v_ach.name,
      v_ach.description, '/profil/recompenses');
  end if;
  return v_rows > 0;
end $$;

create or replace function public.award_badges(p_participant uuid, p_match uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_played int;
  v_wins int;
  v_last3 text;
  v_game record;
begin
  select count(outcome), count(*) filter (where outcome = 'W')
    into v_played, v_wins
  from public.participant_games where participant_id = p_participant;

  if v_played >= 1 then perform public.grant_achievement(p_participant, 'first_game'); end if;
  if v_wins >= 1 then perform public.grant_achievement(p_participant, 'first_win', null, p_match); end if;
  if v_wins >= 5 then perform public.grant_achievement(p_participant, 'five_wins', null, p_match); end if;

  -- Trois victoires consécutives (dans l'ordre du calendrier).
  select string_agg(outcome, '' order by week_number desc, round_number desc) into v_last3
  from (select outcome, week_number, round_number from public.participant_games
        where participant_id = p_participant and outcome is not null
        order by week_number desc, round_number desc limit 3) s;
  if v_last3 = 'WWW' then perform public.grant_achievement(p_participant, 'three_in_a_row', null, p_match); end if;

  -- Semaine complète : trois matchs validés dans une même semaine.
  if exists (select 1 from public.participant_games where participant_id = p_participant and outcome is not null
             group by week_id having count(*) >= 3) then
    perform public.grant_achievement(p_participant, 'full_week');
  end if;

  -- Tombeur du leader : victoire contre le n°1 au moment du tirage (hors semaine 1).
  if p_match is not null then
    select * into v_game from public.participant_games
    where match_id = p_match and participant_id = p_participant;
    if v_game.outcome = 'W' and v_game.opponent_rank_at_draw = 1 and v_game.week_number > 1 then
      perform public.grant_achievement(p_participant, 'beat_leader', null, p_match);
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Administration du championnat
-- ---------------------------------------------------------------------
create or replace function public.create_tournament(p_name text, p_bye_points smallint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.assert_admin();
  if exists (select 1 from public.tournaments where status in ('draft','active')) then
    raise exception 'Un championnat est déjà en préparation ou en cours';
  end if;
  insert into public.tournaments (name, bye_points, created_by)
  values (trim(p_name), p_bye_points, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.update_tournament(p_tournament uuid, p_name text, p_bye_points smallint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  update public.tournaments set name = trim(p_name), bye_points = p_bye_points where id = p_tournament;
end $$;

create or replace function public.start_tournament(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments;
begin
  perform public.assert_admin();
  select * into v_t from public.tournaments where id = p_tournament for update;
  if v_t.status <> 'draft' then raise exception 'Le championnat est déjà lancé'; end if;
  if (select count(*) from public.participants where tournament_id = p_tournament and status = 'active') < 2 then
    raise exception 'Il faut au moins 2 participants actifs';
  end if;
  update public.tournaments set status = 'active', started_at = now() where id = p_tournament;
end $$;

create or replace function public.finish_tournament(p_tournament uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if exists (select 1 from public.weeks where tournament_id = p_tournament and status = 'active') then
    raise exception 'Clôturez d''abord la semaine en cours';
  end if;
  update public.tournaments set status = 'finished', finished_at = now()
  where id = p_tournament and status = 'active';
end $$;

create or replace function public.add_participant(p_tournament uuid, p_profile uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.assert_admin();
  if (select status from public.tournaments where id = p_tournament) = 'finished' then
    raise exception 'Championnat terminé';
  end if;
  insert into public.participants (tournament_id, profile_id, initial_elo)
  select p_tournament, id, declared_elo from public.profiles where id = p_profile
  on conflict (tournament_id, profile_id) do update set status = 'active'
  returning id into v_id;
  if v_id is null then raise exception 'Profil introuvable'; end if;
  return v_id;
end $$;

create or replace function public.set_participant_status(p_participant uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  update public.participants set status = p_status where id = p_participant;
end $$;

create or replace function public.admin_update_profile(
  p_profile uuid, p_display_name text, p_chesscom text, p_elo integer, p_is_active boolean, p_initial_elo integer default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_profile = auth.uid() and not p_is_active then
    raise exception 'Vous ne pouvez pas suspendre votre propre compte';
  end if;
  update public.profiles
     set display_name = trim(p_display_name),
         chesscom_username = nullif(trim(p_chesscom), ''),
         declared_elo = p_elo,
         is_active = p_is_active
   where id = p_profile;
  if p_initial_elo is not null then
    update public.participants set initial_elo = p_initial_elo where profile_id = p_profile;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Publication du tirage hebdomadaire
-- ---------------------------------------------------------------------
-- p_draw : {"rounds":[{"round":1,"pairings":[{"white":uuid,"black":uuid}],"bye":uuid|null}, ...]}
-- Le tirage est calculé par l'algorithme (src/lib/pairing.ts) côté admin puis
-- intégralement revalidé ici avant d'être enregistré et verrouillé.
create or replace function public.publish_week(p_tournament uuid, p_start_date date, p_draw jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tournaments;
  v_week uuid;
  v_round uuid;
  v_number int;
  v_active uuid[];
  v_round_json jsonb;
  v_pair jsonb;
  v_seen uuid[];
  v_bye uuid;
  v_white uuid;
  v_black uuid;
  v_profile uuid;
  v_ranks jsonb;
begin
  perform public.assert_admin();
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found or v_t.status <> 'active' then raise exception 'Le championnat n''est pas en cours'; end if;
  if exists (select 1 from public.weeks where tournament_id = p_tournament and status = 'active') then
    raise exception 'La semaine en cours doit être clôturée avant un nouveau tirage';
  end if;
  if extract(isodow from p_start_date) <> 1 then raise exception 'La semaine doit commencer un lundi'; end if;
  if exists (select 1 from public.weeks where tournament_id = p_tournament and start_date >= p_start_date) then
    raise exception 'Cette semaine a déjà été jouée';
  end if;
  if jsonb_array_length(coalesce(p_draw -> 'rounds', '[]')) <> 3 then
    raise exception 'Le tirage doit contenir exactement 3 rondes';
  end if;

  select array_agg(id) into v_active from public.participants
  where tournament_id = p_tournament and status = 'active';
  if cardinality(coalesce(v_active, '{}')) < 2 then raise exception 'Pas assez de participants actifs'; end if;

  select coalesce(max(number), 0) + 1 into v_number from public.weeks where tournament_id = p_tournament;
  insert into public.weeks (tournament_id, number, start_date, published_by)
  values (p_tournament, v_number, p_start_date, auth.uid()) returning id into v_week;

  -- Rang de chacun au moment du tirage.
  select jsonb_object_agg(participant_id, rank) into v_ranks
  from public.standings where tournament_id = p_tournament;

  for i in 1..3 loop
    v_round_json := p_draw -> 'rounds' -> (i - 1);
    insert into public.rounds (week_id, number, play_date)
    values (v_week, i, p_start_date + (i - 1) * 2)  -- lundi, mercredi, vendredi
    returning id into v_round;

    v_seen := '{}';
    for v_pair in select * from jsonb_array_elements(coalesce(v_round_json -> 'pairings', '[]')) loop
      v_white := (v_pair ->> 'white')::uuid;
      v_black := (v_pair ->> 'black')::uuid;
      if v_white = v_black or not (v_white = any (v_active)) or not (v_black = any (v_active))
         or v_white = any (v_seen) or v_black = any (v_seen) then
        raise exception 'Tirage invalide (ronde %)', i;
      end if;
      v_seen := v_seen || v_white || v_black;
      insert into public.matches (tournament_id, round_id, white_id, black_id, white_rank_at_draw, black_rank_at_draw)
      values (p_tournament, v_round, v_white, v_black,
              (v_ranks ->> v_white::text)::int,
              (v_ranks ->> v_black::text)::int);
    end loop;

    v_bye := nullif(v_round_json ->> 'bye', '')::uuid;
    if v_bye is not null then
      if not (v_bye = any (v_active)) or v_bye = any (v_seen) then raise exception 'Exempt invalide (ronde %)', i; end if;
      v_seen := v_seen || v_bye;
      insert into public.byes (round_id, participant_id, points) values (v_round, v_bye, v_t.bye_points);
    end if;

    -- Chaque participant actif doit jouer ou être exempt, et un seul exempt au maximum.
    if cardinality(v_seen) <> cardinality(v_active) then
      raise exception 'Tirage incomplet (ronde %) : chaque participant actif doit être apparié', i;
    end if;
    if v_bye is not null and cardinality(v_active) % 2 = 0 then
      raise exception 'Exempt interdit avec un nombre pair de participants';
    end if;
  end loop;

  for v_profile in select profile_id from public.participants where id = any (v_active) loop
    perform public.notify(v_profile, 'draw_published', 'Semaine ' || v_number || ' : tirage publié',
      'Vos trois adversaires de la semaine sont connus.', '/matchs');
  end loop;
  return v_week;
end $$;

-- ---------------------------------------------------------------------
-- Déclaration et validation des résultats
-- ---------------------------------------------------------------------
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
  select * into v_m from public.matches where id = p_match for update; -- verrou : pas de double déclaration
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
     set status = 'pending', declared_result = p_result, declared_by = auth.uid(), declared_at = now()
   where id = p_match;
  insert into public.match_results (match_id, action, result, actor_id) values (p_match, 'declare', p_result, auth.uid());

  v_opponent := case when auth.uid() = v_white_profile then v_black_profile else v_white_profile end;
  select display_name into v_name from public.profiles where id = auth.uid();
  perform public.notify(v_opponent, 'result_to_confirm', 'Résultat à confirmer',
    v_name || ' a déclaré : ' || public.result_label(p_result) || '.', '/matchs/' || p_match);
end $$;

-- Annulation par le déclarant tant que l'adversaire n'a pas répondu.
create or replace function public.withdraw_declaration(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_m public.matches;
begin
  select * into v_m from public.matches where id = p_match for update;
  if v_m.status <> 'pending' or v_m.declared_by is distinct from auth.uid() then
    raise exception 'Aucune déclaration à annuler';
  end if;
  update public.matches set status = 'scheduled', declared_result = null, declared_by = null, declared_at = null
   where id = p_match;
  insert into public.match_results (match_id, action, actor_id, comment)
  values (p_match, 'admin_reset', auth.uid(), 'Déclaration retirée par son auteur');
end $$;

create or replace function public.respond_result(p_match uuid, p_accept boolean, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_m public.matches;
  v_white_profile uuid;
  v_black_profile uuid;
  v_admin uuid;
  v_name text;
begin
  select * into v_m from public.matches where id = p_match for update;
  if not found then raise exception 'Match introuvable'; end if;
  if v_m.status <> 'pending' then raise exception 'Aucun résultat en attente de confirmation'; end if;

  select profile_id into v_white_profile from public.participants where id = v_m.white_id;
  select profile_id into v_black_profile from public.participants where id = v_m.black_id;
  if auth.uid() not in (v_white_profile, v_black_profile) or auth.uid() = v_m.declared_by then
    raise exception 'Seul l''adversaire du déclarant peut répondre' using errcode = '42501';
  end if;
  select display_name into v_name from public.profiles where id = auth.uid();

  if p_accept then
    update public.matches set status = 'validated', result = declared_result, validated_at = now() where id = p_match;
    insert into public.match_results (match_id, action, result, actor_id, comment)
    values (p_match, 'confirm', v_m.declared_result, auth.uid(), p_comment);
    perform public.notify(v_m.declared_by, 'result_confirmed', 'Résultat confirmé',
      v_name || ' a confirmé : ' || public.result_label(v_m.declared_result) || '.', '/matchs/' || p_match);
    perform public.award_badges(v_m.white_id, p_match);
    perform public.award_badges(v_m.black_id, p_match);
  else
    if coalesce(trim(p_comment), '') = '' then raise exception 'Merci d''expliquer la contestation'; end if;
    update public.matches set status = 'disputed' where id = p_match;
    insert into public.match_results (match_id, action, result, actor_id, comment)
    values (p_match, 'contest', v_m.declared_result, auth.uid(), p_comment);
    perform public.notify(v_m.declared_by, 'result_disputed', 'Résultat contesté',
      v_name || ' conteste le résultat. L''administrateur va arbitrer.', '/matchs/' || p_match);
    for v_admin in select id from public.profiles where role = 'admin' and is_active loop
      perform public.notify(v_admin, 'result_disputed', 'Contestation à arbitrer',
        v_name || ' : « ' || left(p_comment, 120) || ' »', '/admin/matchs/' || p_match);
    end loop;
  end if;
end $$;

-- Arbitrage / correction par l'administrateur.
-- p_action : 'set' (avec p_result), 'unplayed', 'reset' (retour à « à jouer »).
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
           declared_at = null, validated_at = null
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

-- ---------------------------------------------------------------------
-- Clôture de semaine : photo du classement + distinctions
-- ---------------------------------------------------------------------
create or replace function public.close_week(p_week uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_w public.weeks;
  v_prev uuid;
  v_r record;
  v_best int;
  v_profile uuid;
begin
  perform public.assert_admin();
  select * into v_w from public.weeks where id = p_week for update;
  if not found or v_w.status <> 'active' then raise exception 'Semaine introuvable ou déjà clôturée'; end if;
  perform 1 from public.tournaments where id = v_w.tournament_id for update;

  if exists (select 1 from public.matches m join public.rounds r on r.id = m.round_id
             where r.week_id = p_week and m.status in ('pending','disputed')) then
    raise exception 'Des résultats sont en attente ou contestés : arbitrez-les avant de clôturer';
  end if;

  -- Les matchs jamais déclarés sont marqués « non joué » : 0 point, aucun vainqueur.
  -- L'administrateur peut toujours corriger ensuite.
  insert into public.match_results (match_id, action, actor_id, comment)
  select m.id, 'admin_unplayed', auth.uid(), 'Non déclaré à la clôture de la semaine'
  from public.matches m join public.rounds r on r.id = m.round_id
  where r.week_id = p_week and m.status = 'scheduled';
  update public.matches m set status = 'unplayed'
  from public.rounds r where r.id = m.round_id and r.week_id = p_week and m.status = 'scheduled';

  update public.weeks set status = 'closed', closed_at = now() where id = p_week;

  insert into public.standings_snapshots (week_id, participant_id, rank, points)
  select p_week, participant_id, rank, points from public.standings where tournament_id = v_w.tournament_id;

  select id into v_prev from public.weeks
  where tournament_id = v_w.tournament_id and number = v_w.number - 1;

  -- Champion de la semaine (ex aequo possibles).
  select max(points) into v_best from public.week_standings where week_id = p_week;
  if v_best > 0 then
    for v_r in select participant_id from public.week_standings where week_id = p_week and points = v_best loop
      perform public.grant_achievement(v_r.participant_id, 'week_champion', p_week);
    end loop;
  end if;

  -- Chevalier surprise : plus grand écart de classement (≥ 3 places) battu,
  -- ou, en semaine 1, écart d'Elo déclaré ≥ 200.
  for v_r in
    with wins as (
      select pg.participant_id, pg.match_id,
             coalesce(pg.own_rank_at_draw - pg.opponent_rank_at_draw, 0) as rank_gap,
             coalesce(op.initial_elo - me.initial_elo, 0) as elo_gap
      from public.participant_games pg
      join public.participants me on me.id = pg.participant_id
      join public.participants op on op.id = pg.opponent_id
      where pg.week_id = p_week and pg.outcome = 'W'
    ), eligible as (
      select *, case when rank_gap >= 3 then rank_gap * 1000 + elo_gap
                     when elo_gap >= 200 then elo_gap else null end as surprise
      from wins
    )
    select participant_id, match_id from eligible
    where surprise is not null and surprise = (select max(surprise) from eligible)
  loop
    perform public.grant_achievement(v_r.participant_id, 'surprise_knight', p_week, v_r.match_id);
  end loop;

  -- Meilleure progression et première remontée (comparaison avec la semaine précédente).
  if v_prev is not null then
    select max(o.rank - n.rank) into v_best
    from public.standings_snapshots n
    join public.standings_snapshots o on o.participant_id = n.participant_id and o.week_id = v_prev
    where n.week_id = p_week;
    for v_r in
      select n.participant_id, o.rank - n.rank as gain
      from public.standings_snapshots n
      join public.standings_snapshots o on o.participant_id = n.participant_id and o.week_id = v_prev
      where n.week_id = p_week and o.rank > n.rank
    loop
      perform public.grant_achievement(v_r.participant_id, 'first_climb', null);
      if v_r.gain = v_best then
        perform public.grant_achievement(v_r.participant_id, 'best_progress', p_week);
      end if;
    end loop;
  end if;

  -- Série gagnante : plus longue série de victoires en cours (≥ 3).
  for v_r in
    with ordered as (
      select participant_id, outcome,
             row_number() over (partition by participant_id order by week_number desc, round_number desc) as rn
      from public.participant_games
      where tournament_id = v_w.tournament_id and outcome is not null
    ), streaks as (
      select participant_id,
             coalesce(min(rn) filter (where outcome <> 'W') - 1, max(rn)) as streak
      from ordered group by participant_id
    )
    select participant_id from streaks
    where streak >= 3 and streak = (select max(streak) from streaks)
  loop
    perform public.grant_achievement(v_r.participant_id, 'win_streak', p_week);
  end loop;

  for v_profile in select profile_id from public.participants where tournament_id = v_w.tournament_id loop
    perform public.notify(v_profile, 'standings_updated', 'Semaine ' || v_w.number || ' clôturée',
      'Le classement et les distinctions de la semaine sont disponibles.', '/classement');
  end loop;
end $$;

create or replace function public.admin_award(p_participant uuid, p_code text, p_week uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if not public.grant_achievement(p_participant, p_code, p_week, null, auth.uid(), p_note) then
    raise exception 'Distinction déjà attribuée';
  end if;
end $$;

create or replace function public.admin_revoke_award(p_award uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  delete from public.player_achievements where id = p_award;
end $$;

create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where profile_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------
-- Droits d'exécution : jamais pour anon ; fonctions internes non exposées.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_admin(),
  public.create_tournament(text, smallint),
  public.update_tournament(uuid, text, smallint),
  public.start_tournament(uuid),
  public.finish_tournament(uuid),
  public.add_participant(uuid, uuid),
  public.set_participant_status(uuid, text),
  public.admin_update_profile(uuid, text, text, integer, boolean, integer),
  public.publish_week(uuid, date, jsonb),
  public.declare_result(uuid, text),
  public.withdraw_declaration(uuid),
  public.respond_result(uuid, boolean, text),
  public.admin_resolve_match(uuid, text, text, text),
  public.close_week(uuid),
  public.admin_award(uuid, text, uuid, text),
  public.admin_revoke_award(uuid),
  public.mark_notifications_read(),
  public.result_label(text)
to authenticated;
