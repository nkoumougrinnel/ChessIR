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
import type { ChesscomGame, ChesscomProfile, MatchChallenge } from './types'

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

/** Photo du classement de tous les joueurs à la clôture d'une semaine. */
export async function fetchWeekSnapshots(weekId: string): Promise<Snapshot[]> {
  return unwrap(await supabase.from('standings_snapshots').select('*').eq('week_id', weekId))
}

/** Réglages généraux (ex. lien du groupe WhatsApp). */
export async function fetchSettings(): Promise<Record<string, string | null>> {
  const rows: Array<{ key: string; value: string | null }> = unwrap(await supabase.from('app_settings').select('key, value'))
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
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
  patch: Partial<Pick<Profile, 'display_name' | 'declared_elo' | 'avatar_color' | 'use_chesscom_avatar'>>,
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
  /** Paramètres de détection Chess.com (modifiables tant que le championnat n'est pas lancé). */
  async updateChesscomSettings(id: string, s: { timeClasses: string[]; ratedOnly: boolean; timezone: string }) {
    unwrap(
      await supabase.rpc('update_chesscom_settings', {
        p_tournament: id,
        p_time_classes: s.timeClasses,
        p_rated_only: s.ratedOnly,
        p_timezone: s.timezone,
      }),
    )
  },
  async setSetting(key: 'whatsapp_group_url', value: string) {
    unwrap(await supabase.rpc('set_app_setting', { p_key: key, p_value: value }))
  },
  async linkGame(matchId: string, gameId: string | null, comment: string) {
    unwrap(await supabase.rpc('admin_link_game', { p_match: matchId, p_game: gameId, p_comment: comment }))
  },
  async updateTournament(id: string, name: string, byePoints: number) {
    unwrap(await supabase.rpc('update_tournament', { p_tournament: id, p_name: name, p_bye_points: byePoints }))
  },
  async startTournament(id: string) {
    unwrap(await supabase.rpc('start_tournament', { p_tournament: id }))
  },
  /** Uniquement tant qu'aucun tirage n'a été publié ; `confirmName` = nom exact du championnat. */
  async deleteTournament(id: string, confirmName: string) {
    unwrap(await supabase.rpc('delete_tournament', { p_tournament: id, p_confirm_name: confirmName }))
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
    declared_elo: number | null
    is_active: boolean
    initial_elo: number | null
  }) {
    unwrap(
      await supabase.rpc('admin_update_profile', {
        p_profile: p.id,
        p_display_name: p.display_name,
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

/* ----------------------------- Chess.com ----------------------------- */

export async function fetchChesscomProfiles(): Promise<ChesscomProfile[]> {
  return unwrap(await supabase.from('chesscom_profiles').select('*'))
}

export async function fetchChesscomGames(tournamentId: string): Promise<ChesscomGame[]> {
  return unwrap(await supabase.from('chesscom_games').select('*').eq('tournament_id', tournamentId).order('end_time'))
}

export async function acceptChesscomGame(matchId: string, gameId: string) {
  unwrap(await supabase.rpc('accept_chesscom_game', { p_match: matchId, p_game: gameId }))
}

/** Appel de l'Edge Function `chesscom-sync` (seule à parler à l'API Chess.com). */
export async function chesscom<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('chesscom-sync', { body })
  if (error) {
    // Message d'erreur renvoyé par la fonction, si disponible.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null)
      if (payload?.error) throw new Error(payload.error)
    }
    throw new Error('Service Chess.com indisponible, réessayez plus tard.')
  }
  return data as T
}

/** Mot de passe provisoire pour un joueur (Edge Function `admin-users`, admin uniquement). */
export async function giveTempPassword(profileId: string): Promise<{ password: string; display_name: string }> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'temp-password', profile_id: profileId } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const payload = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
    throw new Error(payload?.error ?? 'Service indisponible, réessayez plus tard.')
  }
  return data
}

/* ------------------------------ Défis ------------------------------- */

/** Défis des dernières 24 h (ouverts ou terminés) : l'état exact se déduit des horodatages. */
export async function fetchRecentChallenges(): Promise<MatchChallenge[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  return unwrap(await supabase.from('match_challenges').select('*').gte('created_at', since).order('created_at', { ascending: false }))
}

export async function challengeMatch(matchId: string) {
  return unwrap(await supabase.rpc('challenge_match', { p_match: matchId })) as { state: 'pending' | 'live' }
}

export async function cancelChallenge(matchId: string) {
  unwrap(await supabase.rpc('cancel_challenge', { p_match: matchId }))
}
