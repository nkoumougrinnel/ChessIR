import { describe, expect, it } from 'vitest'
import { generateWeekDraw, pairKey, type PairingHistory, type PairingPlayer, type WeekDraw } from '../src/lib/pairing'

const makePlayers = (n: number, points: (i: number) => number = () => 0): PairingPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${String(i + 1).padStart(2, '0')}`, points: points(i), rank: i + 1 }))

const empty: PairingHistory = { games: [], byes: [] }

function checkStructure(draw: WeekDraw, players: PairingPlayer[]) {
  expect(draw.rounds).toHaveLength(3)
  for (const round of draw.rounds) {
    const seen = new Set<string>()
    for (const p of round.pairings) {
      expect(p.white).not.toBe(p.black)
      expect(seen.has(p.white) || seen.has(p.black)).toBe(false)
      seen.add(p.white)
      seen.add(p.black)
    }
    if (round.bye) {
      expect(seen.has(round.bye)).toBe(false)
      seen.add(round.bye)
    }
    // Chaque participant joue ou est exempt — personne n'est oublié.
    expect(seen.size).toBe(players.length)
  }
}

describe('generateWeekDraw', () => {
  it('génère 3 rondes complètes pour un nombre pair de joueurs', () => {
    const players = makePlayers(12)
    const draw = generateWeekDraw(players, empty, { random: true, seed: 1 })
    checkStructure(draw, players)
    draw.rounds.forEach((r) => {
      expect(r.pairings).toHaveLength(6)
      expect(r.bye).toBeNull()
    })
  })

  it("n'apparie jamais deux fois les mêmes joueurs dans une semaine", () => {
    for (const n of [4, 6, 8, 10, 12, 13, 20, 31]) {
      for (let seed = 1; seed <= 20; seed++) {
        const players = makePlayers(n, (i) => (n - i) % 4)
        const draw = generateWeekDraw(players, empty, { seed })
        const keys = draw.rounds.flatMap((r) => r.pairings.map((p) => pairKey(p.white, p.black)))
        expect(new Set(keys).size, `n=${n} seed=${seed}`).toBe(keys.length)
        expect(draw.repeats).toHaveLength(0)
      }
    }
  })

  it('gère un nombre impair : un exempt différent à chaque ronde, sans faux match', () => {
    const players = makePlayers(7, (i) => 7 - i)
    const draw = generateWeekDraw(players, empty, { seed: 3 })
    checkStructure(draw, players)
    const byes = draw.rounds.map((r) => r.bye)
    expect(byes.every(Boolean)).toBe(true)
    expect(new Set(byes).size).toBe(3)
    draw.rounds.forEach((r) => expect(r.pairings).toHaveLength(3))
  })

  it("donne l'exemption aux joueurs jamais exemptés, en partant du bas du classement", () => {
    const players = makePlayers(5, (i) => 10 - i)
    const draw = generateWeekDraw(players, { games: [], byes: ['p05', 'p04'] }, { seed: 9 })
    expect(draw.rounds[0].bye).toBe('p03')
    expect(new Set(draw.rounds.map((r) => r.bye))).toEqual(new Set(['p03', 'p02', 'p01']))
  })

  it("évite les adversaires déjà rencontrés lors des semaines précédentes", () => {
    const players = makePlayers(10)
    const w1 = generateWeekDraw(players, empty, { random: true, seed: 5 })
    const history: PairingHistory = { games: w1.rounds.flatMap((r) => r.pairings), byes: [] }
    const w2 = generateWeekDraw(players, history, { seed: 6 })
    const old = new Set(history.games.map((g) => pairKey(g.white, g.black)))
    for (const r of w2.rounds) for (const p of r.pairings) expect(old.has(pairKey(p.white, p.black))).toBe(false)
    expect(w2.repeats).toHaveLength(0)
  })

  it("autorise et signale une répétition quand elle est inévitable", () => {
    const players = makePlayers(4)
    const w1 = generateWeekDraw(players, empty, { random: true, seed: 2 })
    const w2 = generateWeekDraw(players, { games: w1.rounds.flatMap((r) => r.pairings), byes: [] }, { seed: 3 })
    checkStructure(w2, players)
    // 4 joueurs : les 6 paires possibles sont toutes jouées en semaine 1.
    expect(w2.repeats.length).toBe(6)
  })

  it('fonctionne avec 2 ou 3 joueurs (répétitions dans la semaine inévitables)', () => {
    for (const n of [2, 3]) {
      const players = makePlayers(n)
      const draw = generateWeekDraw(players, empty, { seed: 1 })
      checkStructure(draw, players)
    }
  })

  it('regroupe les joueurs de score voisin à partir de la semaine 2', () => {
    // Deux groupes nettement séparés : 4 joueurs à 9 pts, 4 joueurs à 0 pt.
    const players = makePlayers(8, (i) => (i < 4 ? 9 : 0))
    const draw = generateWeekDraw(players, empty, { seed: 11 })
    const top = new Set(['p01', 'p02', 'p03', 'p04'])
    for (const r of draw.rounds) {
      for (const p of r.pairings) expect(top.has(p.white)).toBe(top.has(p.black))
    }
  })

  it('équilibre les couleurs (écart max de 1 sur la semaine pour un nombre pair)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const players = makePlayers(12, (i) => i % 3)
      const draw = generateWeekDraw(players, empty, { seed })
      const balance = new Map<string, number>()
      for (const r of draw.rounds)
        for (const p of r.pairings) {
          balance.set(p.white, (balance.get(p.white) ?? 0) + 1)
          balance.set(p.black, (balance.get(p.black) ?? 0) - 1)
        }
      for (const b of balance.values()) expect(Math.abs(b)).toBeLessThanOrEqual(1)
    }
  })

  it('compense les couleurs des semaines précédentes', () => {
    const players = makePlayers(2)
    // p01 a eu 3 fois les Blancs : il doit avoir les Noirs en ronde 1.
    const history: PairingHistory = {
      games: [1, 2, 3].map(() => ({ white: 'p01', black: 'p02' })),
      byes: [],
    }
    const draw = generateWeekDraw(players, history, { seed: 4 })
    expect(draw.rounds[0].pairings[0]).toEqual({ white: 'p02', black: 'p01' })
  })

  it('est déterministe pour une même graine', () => {
    const players = makePlayers(14)
    expect(generateWeekDraw(players, empty, { random: true, seed: 42 })).toEqual(
      generateWeekDraw(players, empty, { random: true, seed: 42 }),
    )
  })

  it('refuse un participant en double ou un effectif insuffisant', () => {
    expect(() => generateWeekDraw(makePlayers(1), empty)).toThrow()
    const p = makePlayers(3)
    expect(() => generateWeekDraw([...p, p[0]], empty)).toThrow()
  })
})
