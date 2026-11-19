import type { MatchResult, MatchStatus } from './types'

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const DAYS_SHORT = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.']

/** Les dates SQL (YYYY-MM-DD) sont interprétées en heure locale, pas en UTC. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toIsoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const dayName = (iso: string) => DAYS[parseDay(iso).getDay()]
export const dayShort = (iso: string) => DAYS_SHORT[parseDay(iso).getDay()]
export const ddmm = (iso: string) => {
  const d = parseDay(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const weekLabel = (n: number) => `Semaine ${String(n).padStart(2, '0')}`

export function weekRange(startIso: string): string {
  const start = parseDay(startIso)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return `${ddmm(startIso)} – ${ddmm(toIsoDay(end))}`
}

/** Prochain lundi (ou aujourd'hui si on est lundi). */
export function nextMonday(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const delta = (8 - d.getDay()) % 7
  d.setDate(d.getDate() + delta)
  return toIsoDay(d)
}

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  if (diff < 7 * 86400) return `il y a ${Math.floor(diff / 86400)} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export const STATUS_LABEL: Record<MatchStatus, string> = {
  scheduled: 'À jouer',
  pending: 'En attente',
  validated: 'Validé',
  disputed: 'Contesté',
  unplayed: 'Non joué',
}

export const STATUS_LONG: Record<MatchStatus, string> = {
  scheduled: 'À jouer',
  pending: 'Résultat en attente de confirmation',
  validated: 'Validé',
  disputed: 'Contesté — arbitrage en cours',
  unplayed: 'Non joué',
}

export type Outcome = 'win' | 'draw' | 'loss'

/** Résultat vu par un joueur d'une couleur donnée. */
export function outcomeFor(result: MatchResult, color: 'white' | 'black'): Outcome {
  if (result === 'draw') return 'draw'
  return (result === 'white_win') === (color === 'white') ? 'win' : 'loss'
}

/** Résultat officiel correspondant à l'issue choisie par un joueur. */
export function resultFor(outcome: Outcome, color: 'white' | 'black'): MatchResult {
  if (outcome === 'draw') return 'draw'
  const whiteWins = (outcome === 'win') === (color === 'white')
  return whiteWins ? 'white_win' : 'black_win'
}

export const OUTCOME_LABEL: Record<Outcome, string> = { win: 'Victoire', draw: 'Nul', loss: 'Défaite' }
export const OUTCOME_POINTS: Record<Outcome, number> = { win: 3, draw: 1, loss: 0 }

export function chessComProfile(username: string) {
  return `https://www.chess.com/member/${encodeURIComponent(username)}`
}

export function chessComChallenge(username: string) {
  return `https://www.chess.com/play/online/new?opponent=${encodeURIComponent(username)}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase()
}

export const pad2 = (n: number) => String(n).padStart(2, '0')
