-- =====================================================================
-- Chess IR — Row Level Security
-- =====================================================================
-- Lecture : réservée aux utilisateurs connectés (le championnat est
-- visible par toute la classe). Écriture : uniquement via les fonctions
-- `security definer`, sauf le profil personnel (colonnes limitées) et
-- l'état « lu » des notifications.
-- =====================================================================

alter table public.profiles            enable row level security;
alter table public.tournaments         enable row level security;
alter table public.participants        enable row level security;
alter table public.weeks               enable row level security;
alter table public.rounds              enable row level security;
alter table public.matches             enable row level security;
alter table public.byes                enable row level security;
alter table public.match_results       enable row level security;
alter table public.standings_snapshots enable row level security;
alter table public.notifications       enable row level security;
alter table public.achievements        enable row level security;
alter table public.player_achievements enable row level security;

-- Aucun accès anonyme.
revoke all on all tables in schema public from anon;

-- Lecture pour tout utilisateur connecté.
create policy "lecture" on public.profiles            for select to authenticated using (true);
create policy "lecture" on public.tournaments         for select to authenticated using (true);
create policy "lecture" on public.participants        for select to authenticated using (true);
create policy "lecture" on public.weeks               for select to authenticated using (true);
create policy "lecture" on public.rounds              for select to authenticated using (true);
create policy "lecture" on public.matches             for select to authenticated using (true);
create policy "lecture" on public.byes                for select to authenticated using (true);
create policy "lecture" on public.match_results       for select to authenticated using (true);
create policy "lecture" on public.standings_snapshots for select to authenticated using (true);
create policy "lecture" on public.achievements        for select to authenticated using (true);
create policy "lecture" on public.player_achievements for select to authenticated using (true);

-- Profil : chacun modifie le sien, et seulement les champs autorisés
-- (le rôle et l'activation ne sont modifiables que par l'admin, via RPC).
create policy "modifier son profil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name, chesscom_username, declared_elo, avatar_color) on public.profiles to authenticated;

-- Notifications : chacun ne voit que les siennes et ne peut que les marquer lues.
create policy "mes notifications" on public.notifications
  for select to authenticated using (profile_id = auth.uid());
create policy "marquer lue" on public.notifications
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Tables de jeu : aucune écriture directe pour les clients.
revoke insert, update, delete, truncate on
  public.tournaments, public.participants, public.weeks, public.rounds, public.matches,
  public.byes, public.match_results, public.standings_snapshots, public.achievements,
  public.player_achievements
from authenticated;

-- Vues : lecture seule pour les connectés.
revoke all on public.participant_games, public.standings, public.week_standings from anon;
grant select on public.participant_games, public.standings, public.week_standings to authenticated;
