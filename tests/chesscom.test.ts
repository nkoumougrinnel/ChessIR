import { describe, expect, it } from 'vitest'
import {
  detectGames,
  extractRatings,
  localMidnightToUnix,
  mapApiResult,
  monthsBetween,
  type ApiGame,
  type MatchContext,
} from '../supabase/functions/_shared/chesscom'

// Fenêtre : semaine du lundi 16/11/2026 (UTC pour simplifier).
const START = Date.UTC(2026, 10, 16) / 1000
const END = Date.UTC(2026, 10, 22, 23, 59, 59) / 1000
const day = (n: number, h = 18) => START + n * 86400 + h * 3600

const ctx: MatchContext = {
  whiteUsername: 'Nkoumou_IR',
  blackUsername: 'ateba_c',
  windowStart: START,
  windowEnd: END,
  timeClasses: ['rapid'],
  ratedOnly: false,
}

let n = 0
function game(p: Partial<ApiGame> & { w?: string; b?: string; wr?: string; br?: string } = {}): ApiGame {
  n++
  return {
    url: p.url ?? `https://www.chess.com/game/live/${n}`,
    end_time: p.end_time ?? day(2),
    time_class: p.time_class ?? 'rapid',
    time_control: '600',
    rated: p.rated ?? true,
    rules: p.rules ?? 'chess',
    white: { username: p.w ?? 'nkoumou_ir', result: p.wr ?? 'win', rating: 800 },
    black: { username: p.b ?? 'Ateba_C', result: p.br ?? 'resigned', rating: 900 },
  }
}

describe('traduction des résultats Chess.com', () => {
  it.each([
    ['win', 'checkmated', 'white_win'],
    ['win', 'resigned', 'white_win'],
    ['win', 'timeout', 'white_win'],
    ['win', 'abandoned', 'white_win'],
    ['checkmated', 'win', 'black_win'],
    ['timeout', 'win', 'black_win'],
    ['agreed', 'agreed', 'draw'],
    ['repetition', 'repetition', 'draw'],
    ['stalemate', 'stalemate', 'draw'],
    ['insufficient', 'insufficient', 'draw'],
    ['50move', '50move', 'draw'],
    ['timevsinsufficient', 'timevsinsufficient', 'draw'],
  ])('%s / %s → %s', (w, b, expected) => {
    expect(mapApiResult(w, b)).toBe(expected)
  })

  it('code inconnu ou incohérent → null', () => {
    expect(mapApiResult('kingofthehill', 'lose')).toBeNull()
    expect(mapApiResult('win', 'win')).toBeNull()
    expect(mapApiResult('agreed', 'resigned')).toBeNull()
  })
})

describe('détection de la partie d’une confrontation', () => {
  it('partie unique, bonnes couleurs, bonne cadence → certaine (pseudos insensibles à la casse)', () => {
    const d = detectGames([game()], ctx)
    expect(d.confidence).toBe('certain')
    expect(d.candidates[0].resultForMatch).toBe('white_win')
  })

  it('aucune partie → pas de proposition', () => {
    expect(detectGames([], ctx).confidence).toBeNull()
    expect(detectGames([game({ b: 'quelquun_dautre' })], ctx).confidence).toBeNull()
  })

  it('hors de la fenêtre de la semaine → ignorée', () => {
    expect(detectGames([game({ end_time: START - 60 })], ctx).confidence).toBeNull()
    expect(detectGames([game({ end_time: END + 60 })], ctx).confidence).toBeNull()
  })

  it('jouée un autre jour que le jour prévu, mais dans la semaine → acceptée', () => {
    expect(detectGames([game({ end_time: day(6, 22) })], ctx).confidence).toBe('certain')
  })

  it('variante (chess960…) → ignorée', () => {
    expect(detectGames([game({ rules: 'chess960' })], ctx).confidence).toBeNull()
  })

  it('plusieurs parties (revanche) → incertaine', () => {
    const d = detectGames([game({ end_time: day(1) }), game({ end_time: day(3), w: 'ateba_c', b: 'nkoumou_ir' })], ctx)
    expect(d.confidence).toBe('uncertain')
    expect(d.reason).toMatch(/Plusieurs/)
    expect(d.candidates).toHaveLength(2)
  })

  it('une partie rapid + une partie blitz → la blitz ne gêne pas la rapid', () => {
    const d = detectGames([game({ time_class: 'blitz', end_time: day(1) }), game({ end_time: day(2) })], ctx)
    expect(d.confidence).toBe('certain')
    expect(d.candidates).toHaveLength(2)
  })

  it('seulement une partie hors cadence → incertaine', () => {
    const d = detectGames([game({ time_class: 'bullet' })], ctx)
    expect(d.confidence).toBe('uncertain')
    expect(d.reason).toMatch(/cadence/)
  })

  it('couleurs inversées → incertaine, résultat exprimé dans les couleurs du tirage', () => {
    // Sur Chess.com, ateba a les Blancs et gagne ; dans Chess IR ateba a les Noirs.
    const d = detectGames([game({ w: 'ateba_c', b: 'nkoumou_ir', wr: 'win', br: 'checkmated' })], ctx)
    expect(d.confidence).toBe('uncertain')
    expect(d.reason).toMatch(/inversées/)
    expect(d.candidates[0].resultForMatch).toBe('black_win')
    expect(d.candidates[0].colorsMatch).toBe(false)
  })

  it('partie amicale refusée si « classées uniquement »', () => {
    expect(detectGames([game({ rated: false })], ctx).confidence).toBe('certain')
    expect(detectGames([game({ rated: false })], { ...ctx, ratedOnly: true }).confidence).toBeNull()
  })

  it('partie déjà liée à une autre confrontation → ignorée', () => {
    const g = game()
    expect(detectGames([g], { ...ctx, alreadyLinked: new Set([g.url]) }).confidence).toBeNull()
  })

  it('code de résultat inconnu → incertaine', () => {
    const d = detectGames([game({ wr: 'bughousepartnerlose', br: 'win' })], ctx)
    expect(d.confidence).toBe('uncertain')
  })

  it('doublons (même partie dans les archives des deux joueurs) → comptée une fois', () => {
    const g = game()
    expect(detectGames([g, { ...g }], ctx).confidence).toBe('certain')
  })
})

describe('profils et dates', () => {
  it('extrait les classements par cadence', () => {
    const r = extractRatings({
      chess_rapid: { last: { rating: 812, date: 0 }, best: { rating: 901, date: 0 }, record: { win: 10, loss: 8, draw: 2 } },
      chess_blitz: { last: { rating: 640, date: 0 } },
    })
    expect(r.rapid).toEqual({ current: 812, best: 901, win: 10, loss: 8, draw: 2 })
    expect(r.blitz?.current).toBe(640)
    expect(r.bullet).toBeUndefined()
  })

  it('minuit local selon le fuseau du championnat', () => {
    expect(localMidnightToUnix('2026-11-16', 'UTC')).toBe(START)
    // Douala = UTC+1 : minuit local = 23:00 UTC la veille.
    expect(localMidnightToUnix('2026-11-16', 'Africa/Douala')).toBe(START - 3600)
    // Paris en été = UTC+2.
    expect(localMidnightToUnix('2026-07-06', 'Europe/Paris')).toBe(Date.UTC(2026, 6, 5, 22) / 1000)
  })

  it('mois à interroger pour une semaine à cheval sur deux mois', () => {
    expect(monthsBetween(Date.UTC(2026, 10, 30) / 1000, Date.UTC(2026, 11, 6) / 1000)).toEqual(['2026/11', '2026/12'])
    expect(monthsBetween(Date.UTC(2026, 11, 28) / 1000, Date.UTC(2027, 0, 3) / 1000)).toEqual(['2026/12', '2027/01'])
  })
})
