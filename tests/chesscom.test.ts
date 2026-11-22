import { describe, expect, it } from 'vitest'
import {
  detectGames,
  extractRatings,
  localMidnightToUnix,
  mapApiResult,
  monthsBetween,
  searchWindowStart,
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

describe('détection : règle du championnat', () => {
  it('partie conforme (rapid, classée, bonnes couleurs, dans la fenêtre) → suggérée', () => {
    const d = detectGames([game()], ctx)
    expect(d.confidence).toBe('certain')
    expect(d.candidates[0].resultForMatch).toBe('white_win')
  })

  it('aucune partie → pas de proposition', () => {
    expect(detectGames([], ctx).confidence).toBeNull()
    expect(detectGames([game({ b: 'quelquun_dautre' })], ctx).confidence).toBeNull()
  })

  it('hors de la fenêtre → ignorée', () => {
    expect(detectGames([game({ end_time: START - 60 })], ctx).confidence).toBeNull()
    expect(detectGames([game({ end_time: END + 60 })], ctx).confidence).toBeNull()
  })

  it('jouée un autre jour que le jour conseillé, mais dans la fenêtre → acceptée', () => {
    expect(detectGames([game({ end_time: day(6, 22) })], ctx).confidence).toBe('certain')
  })

  it('parties amicales ignorées : blitz, non classée, couleurs inversées, variante', () => {
    const amicales = [
      game({ time_class: 'blitz' }),
      game({ time_class: 'bullet' }),
      game({ rated: false }),
      game({ w: 'ateba_c', b: 'nkoumou_ir', wr: 'win', br: 'checkmated' }),
      game({ rules: 'chess960' }),
    ]
    const d = detectGames(amicales, ctx)
    expect(d.confidence).toBeNull()
    expect(d.candidates).toHaveLength(0)
  })

  it('un avant-match en blitz ne gêne pas le match officiel en rapid', () => {
    const d = detectGames([game({ time_class: 'blitz', end_time: day(1) }), game({ end_time: day(2) })], ctx)
    expect(d.confidence).toBe('certain')
    expect(d.candidates).toHaveLength(1)
    expect(d.candidates[0].game.time_class).toBe('rapid')
  })

  it('plusieurs parties conformes → la première est suggérée, les autres restent au choix', () => {
    const later = game({ end_time: day(3), wr: 'resigned', br: 'win' })
    const first = game({ end_time: day(1) })
    const d = detectGames([later, first], ctx)
    expect(d.confidence).toBe('certain')
    expect(d.candidates.map((c) => c.game.url)).toEqual([first.url, later.url])
    expect(d.reason).toMatch(/première/)
  })

  it('partie déjà liée à une autre confrontation → ignorée', () => {
    const g = game()
    expect(detectGames([g], { ...ctx, alreadyLinked: new Set([g.url]) }).confidence).toBeNull()
  })

  it('code de résultat inconnu → ignorée', () => {
    expect(detectGames([game({ wr: 'bughousepartnerlose', br: 'win' })], ctx).confidence).toBeNull()
  })

  it('doublons (même partie dans les archives des deux joueurs) → comptée une fois', () => {
    const g = game()
    expect(detectGames([g, { ...g }], ctx).candidates).toHaveLength(1)
  })

  it('fenêtre : commence à la publication du tirage, même avant le lundi', () => {
    // Tirage publié le vendredi 20/11 à 21 h (Douala), semaine du lundi 23/11.
    const start = searchWindowStart('2026-11-20T20:00:00Z', '2026-11-23', 'Africa/Douala')
    expect(start).toBe(Date.UTC(2026, 10, 20, 20) / 1000)
    // Partie du samedi 21/11 → dans la fenêtre.
    const saturday = Date.UTC(2026, 10, 21, 15) / 1000
    expect(detectGames([game({ end_time: saturday })], { ...ctx, windowStart: start }).confidence).toBe('certain')
    // Publication tardive (mardi) : la fenêtre part quand même du lundi.
    expect(searchWindowStart('2026-11-24T10:00:00Z', '2026-11-23', 'Africa/Douala')).toBe(localMidnightToUnix('2026-11-23', 'Africa/Douala'))
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
