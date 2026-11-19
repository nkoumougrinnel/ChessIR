import { supabase, unwrap } from './supabase'
import type {
  Achievement,
  Bye,
  Match,
  MatchLog,
  MatchResult,
  Notification,
  Participant,
  ParticipantGame,
  PlayerAchievement,
  Profile,
  Round,
  Snapshot,
  StandingRow,
  Tournament,
  Week,
  WeekStandingRow,
} from './types'
import type { WeekDraw } from './pairing'

/* ----------------------------- Lectures ----------------------------- */

export async function fetchProfile(id: string): Promise<Profile | null> {
  return unwrap(await supabase.from('profiles').select('*').eq('id', id).maybeSingle())
}

export async function fetchProfiles(): Promise<Profile[]> {
  return unwrap(await supabase.from('profiles').select('*').order('display_name'))
}

/** Championnat courant : le plus récent en préparation ou en cours, sinon le dernier terminé. */
export async function fetchCurrentTournament(): Promise<Tournament | null> {
  const rows: Tournament[] = unwrap(
    await supabase.from('tournaments').select('*').order('created_at', { ascending: false }).limit(5),
  )
  return rows.find((t) => t.status !== 'finished') ?? rows[0] ?? null
}

export async function fetchParticipants(tournamentId: string): Promise<Participant[]> {
  return unwrap(await supabase.from('participants').select('*').eq('tournament_id', tournamentId))
}

export async function fetchWeeks(tournamentId: string): Promise<Week[]> {
  return unwrap(
    await supabase.from('weeks').select('*').eq('tournament_id', tournamentId).order('number', { ascending: false }),
  )
}

export async function fetchRounds(weekIds: string[]): Promise<Round[]> {
  if (!weekIds.length) return []
  return unwrap(await supabase.from('rounds').select('*').in('week_id', weekIds).order('number'))
}

export async function fetchStandings(tournamentId: string): Promise<StandingRow[]> {
  return unwrap(
    await supabase.from('standings').select('*').eq('tournament_id', tournamentId).order('rank').order('display_name'),
  )
}

export async function fetchWeekStandings(weekId: string): Promise<WeekStandingRow[]> {
  return unwrap(await supabase.from('week_standings').select('*').eq('week_id', weekId).order('rank').order('display_name'))
}

export async function fetchGamesOf(participantId: string): Promise<ParticipantGame[]> {
  return unwrap(
    await supabase
      .from('participant_games')
      .select('*')
      .eq('participant_id', participantId)
      .order('week_number', { ascending: false })
      .order('round_number', { ascending: false }),
  )
}

export async function fetchTournamentMatches(tournamentId: string): Promise<Match[]> {
  return unwrap(await supabase.from('matches').select('*').eq('tournament_id', tournamentId))
}

export async function fetchByes(roundIds: string[]): Promise<Bye[]> {
  if (!roundIds.length) return []
  return unwrap(await supabase.from('byes').select('*').in('round_id', roundIds))
}

export async function fetchMatch(id: string): Promise<Match | null> {
  return unwrap(await supabase.from('matches').select('*').eq('id', id).maybeSingle())
}

export async function fetchMatchLog(matchId: string): Promise<MatchLog[]> {
  return unwrap(await supabase.from('match_results').select('*').eq('match_id', matchId).order('created_at'))
}

export async function fetchSnapshots(participantId: string): Promise<Snapshot[]> {
  return unwrap(await supabase.from('standings_snapshots').select('*').eq('participant_id', participantId))
}

export async function fetchAchievements(): Promise<Achievement[]> {
  return unwrap(await supabase.from('achievements').select('*').order('sort_order'))
}

export async function fetchPlayerAchievements(filter: { participantId?: string; tournamentId?: string } = {}) {
  let q = supabase.from('player_achievements').select('*, participants!inner(tournament_id)').order('created_at', { ascending: false })
  if (filter.participantId) q = q.eq('participant_id', filter.participantId)
  if (filter.tournamentId) q = q.eq('participants.tournament_id', filter.tournamentId)
  return unwrap(await q) as PlayerAchievement[]
}

export async function fetchNotifications(): Promise<Notification[]> {
  return unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50))
}

/* ----------------------------- Joueur ----------------------------- */

export async function updateMyProfile(
  id: string,
  patch: Pick<Profile, 'display_name' | 'chesscom_username' | 'declared_elo' | 'avatar_color'>,
) {
  unwrap(await supabase.from('profiles').update(patch).eq('id', id).select('id'))
}

export async function declareResult(matchId: string, result: MatchResult) {
  unwrap(await supabase.rpc('declare_result', { p_match: matchId, p_result: result }))
}

export async function withdrawDeclaration(matchId: string) {
  unwrap(await supabase.rpc('withdraw_declaration', { p_match: matchId }))
}

export async function respondResult(matchId: string, accept: boolean, comment?: string) {
  unwrap(await supabase.rpc('respond_result', { p_match: matchId, p_accept: accept, p_comment: comment ?? null }))
}

export async function markNotificationsRead() {
  unwrap(await supabase.rpc('mark_notifications_read'))
}

/* ----------------------------- Admin ----------------------------- */

export const admin = {
  async createTournament(name: string, byePoints: number) {
    return unwrap(await supabase.rpc('create_tournament', { p_name: name, p_bye_points: byePoints })) as string
  },
  async updateTournament(id: string, name: string, byePoints: number) {
    unwrap(await supabase.rpc('update_tournament', { p_tournament: id, p_name: name, p_bye_points: byePoints }))
  },
  async startTournament(id: string) {
    unwrap(await supabase.rpc('start_tournament', { p_tournament: id }))
  },
  async finishTournament(id: string) {
    unwrap(await supabase.rpc('finish_tournament', { p_tournament: id }))
  },
  async addParticipant(tournamentId: string, profileId: string) {
    unwrap(await supabase.rpc('add_participant', { p_tournament: tournamentId, p_profile: profileId }))
  },
  async setParticipantStatus(id: string, status: 'active' | 'suspended') {
    unwrap(await supabase.rpc('set_participant_status', { p_participant: id, p_status: status }))
  },
  async updateProfile(p: {
    id: string
    display_name: string
    chesscom_username: string | null
    declared_elo: number | null
    is_active: boolean
    initial_elo: number | null
  }) {
    unwrap(
      await supabase.rpc('admin_update_profile', {
        p_profile: p.id,
        p_display_name: p.display_name,
        p_chesscom: p.chesscom_username ?? '',
        p_elo: p.declared_elo,
        p_is_active: p.is_active,
        p_initial_elo: p.initial_elo,
      }),
    )
  },
  async publishWeek(tournamentId: string, startDate: string, draw: WeekDraw) {
    return unwrap(
      await supabase.rpc('publish_week', {
        p_tournament: tournamentId,
        p_start_date: startDate,
        p_draw: { rounds: draw.rounds },
      }),
    ) as string
  },
  async closeWeek(weekId: string) {
    unwrap(await supabase.rpc('close_week', { p_week: weekId }))
  },
  async resolveMatch(matchId: string, action: 'set' | 'unplayed' | 'reset', result: MatchResult | null, comment: string) {
    unwrap(
      await supabase.rpc('admin_resolve_match', { p_match: matchId, p_action: action, p_result: result, p_comment: comment }),
    )
  },
  async award(participantId: string, code: string, weekId: string | null, note: string) {
    unwrap(await supabase.rpc('admin_award', { p_participant: participantId, p_code: code, p_week: weekId, p_note: note }))
  },
  async revokeAward(id: string) {
    unwrap(await supabase.rpc('admin_revoke_award', { p_award: id }))
  },
}
