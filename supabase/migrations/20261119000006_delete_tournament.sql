-- =====================================================================
-- Suppression d'un championnat créé par erreur.
-- Autorisée uniquement tant qu'aucun tirage n'a été publié (aucune semaine) :
-- il n'existe alors ni match, ni résultat, ni point. Au-delà, on termine
-- le championnat (finish_tournament) pour conserver l'historique.
-- Confirmation obligatoire : le nom exact du championnat.
-- Les comptes des joueurs ne sont pas touchés, seules leurs inscriptions.
-- =====================================================================
create or replace function public.delete_tournament(p_tournament uuid, p_confirm_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t public.tournaments;
begin
  perform public.assert_admin();
  select * into v_t from public.tournaments where id = p_tournament for update;
  if not found then raise exception 'Championnat introuvable'; end if;
  if exists (select 1 from public.weeks where tournament_id = p_tournament) then
    raise exception 'Un tirage a déjà été publié : terminez le championnat au lieu de le supprimer';
  end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_t.name)) then
    raise exception 'Le nom saisi ne correspond pas au championnat';
  end if;
  delete from public.tournaments where id = p_tournament;
end $$;

revoke execute on function public.delete_tournament(uuid, text) from public, anon;
grant execute on function public.delete_tournament(uuid, text) to authenticated;
