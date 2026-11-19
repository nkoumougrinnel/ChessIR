import type { MatchResult, MatchStatus } from './scoring'

export type { MatchResult, MatchStatus }

export type AvatarColor = 'violet' | 'gold' | 'blue' | 'emerald' | 'rose' | 'cyan' | 'orange' | 'slate'

export interface Profile {
  id: string
  display_name: string
  chesscom_username: string | null
  declared_elo: number | null
  avatar_color: AvatarColor
  use_chesscom_avatar: boolean
  role: 'participant' | 'admin'
  is_active: boolean
  created_at: string
}

export interface Tournament {
  id: string
  name: string
  status: 'draft' | 'active' | 'finished'
  bye_points: 0 | 1 | 3
  chesscom_time_classes: TimeClass[]
  chesscom_rated_only: boolean
  timezone: string
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface Participant {
  id: string
  tournament_id: string
  profile_id: string
  status: 'active' | 'suspended'
  initial_elo: number | null
  joined_at: string
}

export interface Week {
  id: string
  tournament_id: string
  number: number
  start_date: string
  status: 'active' | 'closed'
  published_at: string
  closed_at: string | null
}

export interface Round {
  id: string
  week_id: string
  number: 1 | 2 | 3
  play_date: string
}

export interface Match {
  id: string
  tournament_id: string
  round_id: string
  white_id: string
  black_id: string
  white_rank_at_draw: number | null
  black_rank_at_draw: number | null
  status: MatchStatus
  result: MatchResult | null
  declared_result: MatchResult | null
  declared_by: string | null
  declared_at: string | null
  validated_at: string | null
  chesscom_game_id: string | null
  declaration_source: 'manual' | 'chesscom' | null
  chesscom_checked_at: string | null
}

export interface Bye {
  id: string
  round_id: string
  participant_id: string
  points: number
}

export interface MatchLog {
  id: string
  match_id: string
  action: 'declare' | 'confirm' | 'contest' | 'admin_set' | 'admin_unplayed' | 'admin_reset' | 'detect' | 'link_game' | 'unlink_game'
  result: MatchResult | null
  actor_id: string | null
  comment: string | null
  created_at: string
}

/** Ligne de la vue `participant_games` : un match vu par un joueur. */
export interface ParticipantGame {
  match_id: string
  tournament_id: string
  week_id: string
  week_number: number
  round_number: number
  play_date: string
  participant_id: string
  opponent_id: string
  color: 'white' | 'black'
  status: MatchStatus
  result: MatchResult | null
  declared_result: MatchResult | null
  declared_by: string | null
  own_rank_at_draw: number | null
  opponent_rank_at_draw: number | null
  outcome: 'W' | 'D' | 'L' | null
  points: number | null
}

export interface StandingRow {
  participant_id: string
  tournament_id: string
  profile_id: string
  participant_status?: 'active' | 'suspended'
  played: number
  wins: number
  draws: number
  losses: number
  byes: number
  points: number
  buchholz?: number
  rank: number
  display_name: string
  avatar_color: AvatarColor
  chesscom_username: string | null
}

export interface WeekStandingRow extends StandingRow {
  week_id: string
  week_number: number
}

export interface Snapshot {
  week_id: string
  participant_id: string
  rank: number
  points: number
}

export interface Notification {
  id: string
  profile_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface Achievement {
  id: string
  code: string
  kind: 'distinction' | 'badge'
  name: string
  description: string
  icon: string
  sort_order: number
}

export interface PlayerAchievement {
  id: string
  participant_id: string
  achievement_id: string
  week_id: string | null
  match_id: string | null
  awarded_by: string | null
  note: string | null
  created_at: string
}

/* ----------------------------- Chess.com ----------------------------- */

export type TimeClass = 'rapid' | 'blitz' | 'bullet' | 'daily'

export interface CadenceRating {
  current: number | null
  best: number | null
  win: number
  loss: number
  draw: number
}

/** Données publiques Chess.com — jamais utilisées pour les points ni le classement. */
export interface ChesscomProfile {
  profile_id: string
  username: string
  player_id: number | null
  avatar_url: string | null
  url: string | null
  status: 'verified' | 'not_found' | 'error'
  ratings: Partial<Record<TimeClass, CadenceRating>>
  joined_at: string | null
  last_online: string | null
  fetched_at: string
  last_error: string | null
}

export interface ChesscomGame {
  id: string
  tournament_id: string
  match_id: string
  game_url: string
  end_time: string
  time_class: string
  time_control: string | null
  rated: boolean | null
  white_username: string
  black_username: string
  white_rating: number | null
  black_rating: number | null
  white_result: string
  black_result: string
  result_for_match: MatchResult | null
  colors_match: boolean
  time_class_ok: boolean
  confidence: 'certain' | 'uncertain'
  uncertainty_reason: string | null
  eco: string | null
  accuracies: { white?: number; black?: number } | null
  detected_at: string
}
