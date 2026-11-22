-- =====================================================================
-- Chess IR — Défi en deux temps et match « en direct »
-- =====================================================================
-- 1. Un joueur appuie sur « Défier » : un défi est ouvert, l'adversaire
--    est prévenu et a 5 minutes pour répondre.
-- 2. L'adversaire appuie à son tour (« J'y vais ») dans le délai : les deux
--    joueurs sont partis sur Chess.com, le match passe « en direct ».
-- Le direct s'éteint quand un résultat est déclaré / la partie retrouvée,
-- quand un joueur l'annule, ou au bout de 90 minutes.
-- L'état se déduit des horodatages : aucune tâche planifiée nécessaire.
-- =====================================================================

create table public.match_challenges (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches (id) on delete cascade,
  challenger_id uuid not null references public.participants (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,              -- fin du délai de réponse
  accepted_at   timestamptz,                       -- réponse de l'adversaire → en direct
  live_until    timestamptz,                       -- extinction automatique du direct
  ended_at      timestamptz,
  end_reason    text check (end_reason in ('expired', 'cancelled', 'declared', 'detected'))
);
create index match_challenges_match_idx on public.match_challenges (match_id, created_at desc);
create index match_challenges_open_idx on public.match_challenges (created_at desc) where ended_at is null;

alter table public.match_challenges enable row level security;
revoke all on public.match_challenges from anon;
create policy "lecture" on public.match_challenges for select to authenticated using (true);
alter publication supabase_realtime add table public.match_challenges;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('draw_published','result_to_confirm','result_confirmed','result_disputed','standings_updated',
                  'achievement','result_corrected','game_detected','chesscom_username_invalid','challenge','live'));

-- ---------------------------------------------------------------------
-- Défier / répondre (même bouton des deux côtés)
-- ---------------------------------------------------------------------
create or replace function public.challenge_match(p_match uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_m public.matches;
  v_me uuid;
  v_opp uuid;
  v_c public.match_challenges;
  v_opp_profile uuid;
  v_name text;
  v_title text;
begin
  select * into v_m from public.matches where id = p_match for update;
  if not found then raise exception 'Match introuvable'; end if;

  select p.id into v_me from public.participants p
   where p.id in (v_m.white_id, v_m.black_id) and p.profile_id = auth.uid();
  if v_me is null then
    raise exception 'Seuls les deux joueurs du match peuvent lancer un défi' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Compte suspendu' using errcode = '42501';
  end if;
  if exists (select 1 from public.rounds r join public.weeks w on w.id = r.week_id
             where r.id = v_m.round_id and w.status <> 'active') then
    raise exception 'Semaine clôturée';
  end if;
  if v_m.status <> 'scheduled' then raise exception 'Ce match a déjà un résultat'; end if;
  v_opp := case when v_me = v_m.white_id then v_m.black_id else v_m.white_id end;

  -- Les défis périmés sont refermés au passage.
  update public.match_challenges set ended_at = now(), end_reason = 'expired'
   where match_id = p_match and ended_at is null
     and ((accepted_at is null and expires_at <= now()) or (accepted_at is not null and live_until <= now()));

  -- Déjà en direct : rien à faire.
  select * into v_c from public.match_challenges
   where match_id = p_match and ended_at is null and accepted_at is not null;
  if found then
    return jsonb_build_object('state', 'live', 'id', v_c.id, 'live_until', v_c.live_until);
  end if;

  -- L'adversaire m'a défié : je réponds → en direct.
  select * into v_c from public.match_challenges
   where match_id = p_match and ended_at is null and accepted_at is null and challenger_id = v_opp
   order by created_at desc limit 1;
  if found then
    update public.match_challenges set accepted_at = now(), live_until = now() + interval '90 minutes'
     where id = v_c.id returning * into v_c;

    -- Toute la classe est prévenue (sauf les deux joueurs) : direction l'Arène.
    select pw.display_name || ' affronte ' || pb.display_name into v_title
      from public.participants w join public.profiles pw on pw.id = w.profile_id,
           public.participants b join public.profiles pb on pb.id = b.profile_id
     where w.id = v_m.white_id and b.id = v_m.black_id;
    insert into public.notifications (profile_id, type, title, body, link)
    select p.profile_id, 'live', '🔴 ' || v_title, 'Match en direct sur Chess.com : venez regarder !', '/arene'
      from public.participants p join public.profiles pr on pr.id = p.profile_id
     where p.tournament_id = v_m.tournament_id and p.status = 'active' and pr.is_active
       and p.id not in (v_m.white_id, v_m.black_id);
    return jsonb_build_object('state', 'live', 'id', v_c.id, 'live_until', v_c.live_until);
  end if;

  -- J'ai déjà un défi en attente : on ne relance pas la notification.
  select * into v_c from public.match_challenges
   where match_id = p_match and ended_at is null and accepted_at is null and challenger_id = v_me;
  if found then
    return jsonb_build_object('state', 'pending', 'id', v_c.id, 'expires_at', v_c.expires_at);
  end if;

  insert into public.match_challenges (match_id, challenger_id, expires_at)
  values (p_match, v_me, now() + interval '5 minutes') returning * into v_c;

  select profile_id into v_opp_profile from public.participants where id = v_opp;
  select display_name into v_name from public.profiles where id = auth.uid();
  perform public.notify(v_opp_profile, 'challenge', v_name || ' vous défie !',
    'Rejoignez-le sur Chess.com dans les 5 minutes.', '/arene');

  return jsonb_build_object('state', 'pending', 'id', v_c.id, 'expires_at', v_c.expires_at);
end;
$$;

-- ---------------------------------------------------------------------
-- Annuler un défi en attente ou un direct (fausse alerte)
-- ---------------------------------------------------------------------
create or replace function public.cancel_challenge(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_m public.matches;
begin
  select * into v_m from public.matches where id = p_match;
  if not found then raise exception 'Match introuvable'; end if;
  if not exists (select 1 from public.participants p
                  where p.id in (v_m.white_id, v_m.black_id) and p.profile_id = auth.uid())
     and not public.is_admin() then
    raise exception 'Seuls les deux joueurs du match peuvent annuler' using errcode = '42501';
  end if;
  update public.match_challenges set ended_at = now(), end_reason = 'cancelled'
   where match_id = p_match and ended_at is null;
end;
$$;

-- ---------------------------------------------------------------------
-- Fin automatique dès qu'un résultat est déclaré ou fixé (joueur, admin, Chess.com)
-- ---------------------------------------------------------------------
create or replace function public.end_challenges_on_result()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'scheduled' and new.status <> 'scheduled' then
    update public.match_challenges set ended_at = now(), end_reason = 'declared'
     where match_id = new.id and ended_at is null;
  end if;
  return new;
end;
$$;

create trigger end_challenges_on_result
  after update of status on public.matches
  for each row execute function public.end_challenges_on_result();

revoke all on function public.challenge_match(uuid) from public, anon;
revoke all on function public.cancel_challenge(uuid) from public, anon;
revoke all on function public.end_challenges_on_result() from public, anon, authenticated;
grant execute on function public.challenge_match(uuid) to authenticated;
grant execute on function public.cancel_challenge(uuid) to authenticated;
