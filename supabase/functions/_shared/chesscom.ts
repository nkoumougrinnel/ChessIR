/**
 * Chess IR — logique pure de l'intégration Chess.com (PubAPI).
 *
 * Aucune dépendance (ni Deno, ni Node, ni Supabase) : ce module est utilisé par
 * l'Edge Function `chesscom-sync` et testé unitairement par Vitest.
 *
 * Règles : cahier des charges §3.7.
 */

export type TimeClass = 'rapid' | 'blitz' | 'bullet' | 'daily'
export type MatchResult = 'white_win' | 'black_win' | 'draw'

/* ------------------------------------------------------------------ */
/* Formats PubAPI (sous-ensemble utilisé)                              */
/* ------------------------------------------------------------------ */

export interface ApiPlayer {
  player_id: number
  username: string
  avatar?: string
  url?: string
  status?: string
  joined?: number
  last_online?: number
}

export interface ApiStatsCadence {
  last?: { rating: number; date: number }
  best?: { rating: number; date: number; game?: string }
  record?: { win: number; loss: number; draw: number }
}

export type ApiStats = Partial<Record<'chess_rapid' | 'chess_blitz' | 'chess_bullet' | 'chess_daily', ApiStatsCadence>>

export interface ApiGameSide {
  username: string
  rating?: number
  result: string
}

export interface ApiGame {
  url: string
  uuid?: string
  end_time: number // secondes Unix
  time_class: string
  time_control?: string
  rated?: boolean
  rules: string
  eco?: string
  accuracies?: { white?: number; black?: number }
  white: ApiGameSide
  black: ApiGameSide
}

/* ------------------------------------------------------------------ */
/* Résultats                                                           */
/* ------------------------------------------------------------------ */

const DRAW_CODES = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])
const LOSS_CODES = new Set(['checkmated', 'resigned', 'timeout', 'abandoned', 'lose'])

/** Traduit les codes des deux côtés en résultat (couleurs Chess.com), ou null si inconnu/incohérent. */
export function mapApiResult(white: string, black: string): MatchResult | null {
  if (white === 'win' && LOSS_CODES.has(black)) return 'white_win'
  if (black === 'win' && LOSS_CODES.has(white)) return 'black_win'
  if (DRAW_CODES.has(white) && DRAW_CODES.has(black)) return 'draw'
  return null
}

/* ------------------------------------------------------------------ */
/* Correspondance partie ↔ confrontation                              */
/* ------------------------------------------------------------------ */

export interface MatchContext {
  /** Pseudo Chess.com du joueur qui a les Blancs dans Chess IR. */
  whiteUsername: string
  blackUsername: string
  /** Fenêtre de la semaine, en secondes Unix. */
  windowStart: number
  windowEnd: number
  timeClasses: string[]
  ratedOnly: boolean
  /** URLs de parties déjà liées à une autre confrontation. */
  alreadyLinked?: Set<string>
}

export type Confidence = 'certain' | 'uncertain'

export interface Candidate {
  game: ApiGame
  /** Résultat exprimé dans les couleurs de la confrontation Chess IR (null si code inconnu). */
  resultForMatch: MatchResult | null
  colorsMatch: boolean
  timeClassOk: boolean
}

export interface Detection {
  candidates: Candidate[]
  confidence: Confidence | null // null = aucune partie
  reason: string | null
}

const lc = (s: string) => s.trim().toLowerCase()

/** Le résultat d'une partie, exprimé du point de vue des couleurs attribuées par le tirage. */
export function resultForMatch(game: ApiGame, ctx: Pick<MatchContext, 'whiteUsername'>): MatchResult | null {
  const r = mapApiResult(game.white.result, game.black.result)
  if (!r || r === 'draw') return r
  const chesscomWinner = r === 'white_win' ? game.white.username : game.black.username
  return lc(chesscomWinner) === lc(ctx.whiteUsername) ? 'white_win' : 'black_win'
}

/**
 * Recherche, parmi des parties Chess.com, celles qui correspondent à une confrontation.
 *
 * Candidate = bons adversaires, échecs standard, dans la fenêtre, classée si exigé,
 * non liée à un autre match. La cadence est vérifiée à part : une partie hors cadence
 * reste listée (pour l'admin) mais rend la correspondance incertaine.
 * Certaine = exactement une candidate, bonne cadence, bonnes couleurs, résultat connu.
 */
export function detectGames(games: ApiGame[], ctx: MatchContext): Detection {
  const w = lc(ctx.whiteUsername)
  const b = lc(ctx.blackUsername)
  const seen = new Set<string>()
  const candidates: Candidate[] = []
  for (const g of games) {
    if (seen.has(g.url)) continue
    seen.add(g.url)
    const gw = lc(g.white.username)
    const gb = lc(g.black.username)
    const players = (gw === w && gb === b) || (gw === b && gb === w)
    if (!players || g.rules !== 'chess') continue
    if (g.end_time < ctx.windowStart || g.end_time > ctx.windowEnd) continue
    if (ctx.ratedOnly && !g.rated) continue
    if (ctx.alreadyLinked?.has(g.url)) continue
    candidates.push({
      game: g,
      resultForMatch: resultForMatch(g, ctx),
      colorsMatch: gw === w,
      timeClassOk: ctx.timeClasses.includes(g.time_class),
    })
  }
  candidates.sort((x, y) => x.game.end_time - y.game.end_time)

  if (candidates.length === 0) return { candidates, confidence: null, reason: null }
  const eligible = candidates.filter((c) => c.timeClassOk)
  if (eligible.length > 1) return { candidates, confidence: 'uncertain', reason: 'Plusieurs parties trouvées entre les deux joueurs' }
  if (eligible.length === 0) return { candidates, confidence: 'uncertain', reason: 'Partie trouvée hors des cadences acceptées' }
  const only = eligible[0]
  if (!only.colorsMatch) return { candidates, confidence: 'uncertain', reason: 'Couleurs inversées par rapport au tirage' }
  if (!only.resultForMatch) return { candidates, confidence: 'uncertain', reason: 'Résultat Chess.com non reconnu' }
  return { candidates, confidence: 'certain', reason: null }
}

/* ------------------------------------------------------------------ */
/* Profils                                                             */
/* ------------------------------------------------------------------ */

export interface CadenceRating {
  current: number | null
  best: number | null
  win: number
  loss: number
  draw: number
}

export function extractRatings(stats: ApiStats): Partial<Record<TimeClass, CadenceRating>> {
  const out: Partial<Record<TimeClass, CadenceRating>> = {}
  for (const tc of ['rapid', 'blitz', 'bullet', 'daily'] as const) {
    const s = stats[`chess_${tc}`]
    if (!s) continue
    out[tc] = {
      current: s.last?.rating ?? null,
      best: s.best?.rating ?? null,
      win: s.record?.win ?? 0,
      loss: s.record?.loss ?? 0,
      draw: s.record?.draw ?? 0,
    }
  }
  return out
}

export const USERNAME_RE = /^[A-Za-z0-9_-]{3,25}$/

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/** Décalage (en minutes) d'un fuseau IANA à un instant donné. */
function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - instant.getTime()) / 60000)
}

/** Minuit (heure locale du fuseau) du jour `isoDate` → secondes Unix. */
export function localMidnightToUnix(isoDate: string, timeZone: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  const guess = new Date(Date.UTC(y, m - 1, d))
  const offset = tzOffsetMinutes(guess, timeZone)
  return Math.floor((guess.getTime() - offset * 60000) / 1000)
}

/** Mois (AAAA/MM) couverts par une fenêtre, pour interroger les archives mensuelles. */
export function monthsBetween(startUnix: number, endUnix: number): string[] {
  const out: string[] = []
  const d = new Date(startUnix * 1000)
  let y = d.getUTCFullYear()
  let m = d.getUTCMonth()
  const e = new Date(endUnix * 1000)
  while (y < e.getUTCFullYear() || (y === e.getUTCFullYear() && m <= e.getUTCMonth())) {
    out.push(`${y}/${String(m + 1).padStart(2, '0')}`)
    m++
    if (m === 12) {
      m = 0
      y++
    }
  }
  return out
}
