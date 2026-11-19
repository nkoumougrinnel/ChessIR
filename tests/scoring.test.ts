import { describe, expect, it } from 'vitest'
import { computeStandings, pointsFor, type ScoringMatch } from '../src/lib/scoring'

const players = ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id }))
const m = (white_id: string, black_id: string, result: ScoringMatch['result'], status: ScoringMatch['status'] = 'validated'): ScoringMatch => ({
  white_id,
  black_id,
  result,
  status,
})

describe('barème', () => {
  it('victoire 3, nul 1, défaite 0', () => {
    expect(pointsFor('white_win', 'white')).toBe(3)
    expect(pointsFor('white_win', 'black')).toBe(0)
    expect(pointsFor('black_win', 'black')).toBe(3)
    expect(pointsFor('draw', 'white')).toBe(1)
    expect(pointsFor('draw', 'black')).toBe(1)
  })

  it("exemple du cahier des charges : 2 victoires + 1 nul = 7 points", () => {
    const rows = computeStandings(players, [m('A', 'B', 'white_win'), m('C', 'A', 'black_win'), m('A', 'D', 'draw')])
    const a = rows.find((r) => r.participant_id === 'A')!
    expect(a.points).toBe(7)
    expect([a.wins, a.draws, a.losses, a.played]).toEqual([2, 1, 0, 3])
  })
})

describe('classement', () => {
  it('ne compte que les résultats validés', () => {
    const rows = computeStandings(players, [
      m('A', 'B', 'white_win', 'pending'),
      m('C', 'D', 'white_win', 'disputed'),
      m('A', 'C', null, 'unplayed'),
      m('B', 'D', null, 'scheduled'),
    ])
    expect(rows.every((r) => r.points === 0 && r.played === 0)).toBe(true)
  })

  it("un match non joué ne donne de victoire à personne", () => {
    const rows = computeStandings(players, [m('A', 'B', null, 'unplayed')])
    expect(rows.find((r) => r.participant_id === 'A')!.wins).toBe(0)
    expect(rows.find((r) => r.participant_id === 'B')!.losses).toBe(0)
  })

  it("ajoute les points d'exemption configurés", () => {
    const rows = computeStandings(players, [], [{ participant_id: 'D', points: 1 }])
    const d = rows.find((r) => r.participant_id === 'D')!
    expect(d.points).toBe(1)
    expect(d.byes).toBe(1)
    expect(d.played).toBe(0)
    expect(rows[0].participant_id).toBe('D')
  })

  it('départage par victoires puis Buchholz', () => {
    const rows = computeStandings(players, [
      m('A', 'B', 'white_win'), // A 3
      m('C', 'D', 'draw'), // C 1, D 1
      m('C', 'D', 'draw'), // C 2, D 2
      m('C', 'D', 'draw'), // C 3, D 3
    ])
    // A et C ont 3 pts ; A a plus de victoires.
    expect(rows[0].participant_id).toBe('A')
    expect(rows[1].participant_id).toBe('C')
    expect(rows[1].rank).toBe(2)
    // C et D sont parfaitement à égalité : même rang.
    expect(rows[2].rank).toBe(2)
  })

  it('recalcule après correction d’un résultat (pas de double attribution)', () => {
    const matches = [m('A', 'B', 'white_win')]
    let rows = computeStandings(players, matches)
    expect(rows.find((r) => r.participant_id === 'A')!.points).toBe(3)
    matches[0] = { ...matches[0], result: 'black_win' }
    rows = computeStandings(players, matches)
    expect(rows.find((r) => r.participant_id === 'A')!.points).toBe(0)
    expect(rows.find((r) => r.participant_id === 'B')!.points).toBe(3)
    expect(rows.reduce((s, r) => s + r.points, 0)).toBe(3)
  })
})
