/**
 * Barème et classement — miroir TypeScript de la vue SQL `standings`.
 * Utilisé pour les tests et par l'outil admin « Vérifier les calculs »,
 * qui recalcule le classement depuis les matchs bruts et le compare à la vue.
 */

export type MatchResult = 'white_win' | 'black_win' | 'draw'
export type MatchStatus = 'scheduled' | 'pending' | 'validated' | 'disputed' | 'unplayed'

export const POINTS = { win: 3, draw: 1, loss: 0 } as const

export interface ScoringMatch {
  white_id: string
  black_id: string
  status: MatchStatus
  result: MatchResult | null
}

export interface ScoringBye {
  participant_id: string
  points: number
}

export interface StandingRow {
  participant_id: string
  played: number
  wins: number
  draws: number
  losses: number
  byes: number
  points: number
  buchholz: number
  rank: number
}

/** Points obtenus par un joueur dans un match validé. */
export function pointsFor(result: MatchResult, color: 'white' | 'black'): number {
  if (result === 'draw') return POINTS.draw
  const won = (result === 'white_win' && color === 'white') || (result === 'black_win' && color === 'black')
  return won ? POINTS.win : POINTS.loss
}

/**
 * Classement : seuls les matchs `validated` comptent. Départage :
 * points ▸ victoires ▸ Buchholz (somme des points des adversaires) ▸ nom.
 * Deux joueurs parfaitement à égalité (hors nom) partagent le même rang.
 */
export function computeStandings(
  participants: Array<{ id: string; name: string }>,
  matches: ScoringMatch[],
  byes: ScoringBye[] = [],
): StandingRow[] {
  const rows = new Map<string, StandingRow & { opponents: string[]; name: string }>()
  for (const p of participants) {
    rows.set(p.id, {
      participant_id: p.id,
      name: p.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      byes: 0,
      points: 0,
      buchholz: 0,
      rank: 0,
      opponents: [],
    })
  }

  for (const m of matches) {
    if (m.status !== 'validated' || !m.result) continue
    for (const color of ['white', 'black'] as const) {
      const id = color === 'white' ? m.white_id : m.black_id
      const row = rows.get(id)
      if (!row) continue
      const pts = pointsFor(m.result, color)
      row.played += 1
      row.points += pts
      if (pts === POINTS.win) row.wins += 1
      else if (pts === POINTS.draw) row.draws += 1
      else row.losses += 1
      row.opponents.push(color === 'white' ? m.black_id : m.white_id)
    }
  }
  for (const b of byes) {
    const row = rows.get(b.participant_id)
    if (!row) continue
    row.byes += 1
    row.points += b.points
  }
  for (const row of rows.values()) {
    row.buchholz = row.opponents.reduce((s, o) => s + (rows.get(o)?.points ?? 0), 0)
  }

  const sorted = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points || b.wins - a.wins || b.buchholz - a.buchholz || a.name.localeCompare(b.name, 'fr'),
  )
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1]
    row.rank =
      prev && prev.points === row.points && prev.wins === row.wins && prev.buchholz === row.buchholz
        ? prev.rank
        : i + 1
  })
  return sorted.map(({ opponents: _o, name: _n, ...r }) => r)
}
