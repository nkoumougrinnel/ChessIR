/**
 * Chess IR — appariement de type suisse adapté à une programmation hebdomadaire fixe.
 *
 * Les trois rondes de la semaine sont générées en une fois, le dimanche, à partir
 * du classement disponible au moment du tirage. Module pur (aucune dépendance
 * Supabase) : il est testé unitairement et utilisé par l'espace admin pour
 * prévisualiser le tirage avant publication. La publication elle-même est
 * revalidée côté serveur par la fonction SQL `publish_week`.
 */

export interface PairingPlayer {
  id: string
  /** Points au classement général au moment du tirage. */
  points: number
  /** Rang au classement général (1 = leader). Sert de départage d'ordre. */
  rank: number
}

export interface PastGame {
  white: string
  black: string
}

export interface PairingHistory {
  /** Toutes les confrontations déjà publiées (toutes semaines confondues). */
  games: PastGame[]
  /** Participants ayant déjà été exemptés (une entrée par exemption). */
  byes: string[]
}

export interface Pairing {
  white: string
  black: string
}

export interface RoundDraw {
  round: number
  pairings: Pairing[]
  bye: string | null
}

export interface WeekDraw {
  rounds: RoundDraw[]
  /** Paires qui se rencontrent à nouveau malgré tout (inévitable si peu de joueurs). */
  repeats: Array<{ a: string; b: string; round: number }>
}

export interface DrawOptions {
  rounds?: number
  /** true pour la première semaine : ordre aléatoire, pas de regroupement par score. */
  random?: boolean
  /** Graine pour un tirage reproductible (tests, prévisualisation). */
  seed?: number
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

interface ColorState {
  /** blancs - noirs */
  balance: number
  /** dernières couleurs jouées, la plus récente à la fin ('w' | 'b') */
  recent: string
}

/* ------------------------------------------------------------------ */
/* Appariement d'une ronde                                             */
/* ------------------------------------------------------------------ */

interface RoundContext {
  order: string[] // joueurs triés (meilleur classement d'abord)
  scoreOf: Map<string, number>
  indexOf: Map<string, number>
  historyCount: Map<string, number> // rencontres avant cette semaine
  weekPairs: Set<string> // paires déjà formées cette semaine
}

/** Coût d'une paire : écart de score, écart de classement, répétitions. */
function pairCost(ctx: RoundContext, a: string, b: string, allowHistoryRepeat: boolean): number {
  const key = pairKey(a, b)
  if (ctx.weekPairs.has(key)) return Infinity
  const hist = ctx.historyCount.get(key) ?? 0
  if (hist > 0 && !allowHistoryRepeat) return Infinity
  const scoreGap = Math.abs((ctx.scoreOf.get(a) ?? 0) - (ctx.scoreOf.get(b) ?? 0))
  const rankGap = Math.abs((ctx.indexOf.get(a) ?? 0) - (ctx.indexOf.get(b) ?? 0))
  return scoreGap * 10 + rankGap + hist * 1000
}

const MAX_NODES = 200_000

/**
 * Recherche en profondeur avec retour arrière : le premier joueur non apparié
 * (dans l'ordre du classement) est associé au candidat de coût minimal,
 * puis on récursive. On garde la première solution complète trouvée, ce qui
 * reproduit le comportement « joueur du haut contre plus proche disponible »
 * du système suisse tout en garantissant l'absence de rencontre répétée.
 */
function matchRound(ctx: RoundContext, players: string[], allowHistoryRepeat: boolean): Array<[string, string]> | null {
  let nodes = 0
  const result: Array<[string, string]> = []
  const used = new Set<string>()

  const solve = (): boolean => {
    if (++nodes > MAX_NODES) return false
    const first = players.find((p) => !used.has(p))
    if (first === undefined) return true
    used.add(first)
    const candidates = players
      .filter((p) => !used.has(p))
      .map((p) => ({ p, c: pairCost(ctx, first, p, allowHistoryRepeat) }))
      .filter((x) => Number.isFinite(x.c))
      .sort((x, y) => x.c - y.c)
    for (const { p } of candidates) {
      used.add(p)
      result.push([first, p])
      if (solve()) return true
      result.pop()
      used.delete(p)
    }
    used.delete(first)
    return false
  }

  return solve() ? result : null
}

/* ------------------------------------------------------------------ */
/* Couleurs                                                            */
/* ------------------------------------------------------------------ */

function assignColors(a: string, b: string, colors: Map<string, ColorState>, aIsHigher: boolean): Pairing {
  const ca = colors.get(a)!
  const cb = colors.get(b)!
  // 1. Celui qui a joué le moins souvent avec les Blancs prend les Blancs.
  if (ca.balance !== cb.balance) {
    return ca.balance < cb.balance ? { white: a, black: b } : { white: b, black: a }
  }
  // 2. Alternance : celui qui avait les Noirs à sa dernière partie prend les Blancs.
  const la = ca.recent.at(-1)
  const lb = cb.recent.at(-1)
  if (la !== lb) {
    if (la === 'b') return { white: a, black: b }
    if (lb === 'b') return { white: b, black: a }
    if (la === 'w') return { white: b, black: a }
    if (lb === 'w') return { white: a, black: b }
  }
  // 3. À égalité parfaite, le mieux classé prend les Blancs.
  return aIsHigher ? { white: a, black: b } : { white: b, black: a }
}

function recordColors(p: Pairing, colors: Map<string, ColorState>) {
  const w = colors.get(p.white)!
  const b = colors.get(p.black)!
  w.balance += 1
  w.recent += 'w'
  b.balance -= 1
  b.recent += 'b'
}

/* ------------------------------------------------------------------ */
/* Tirage hebdomadaire                                                  */
/* ------------------------------------------------------------------ */

/**
 * Génère les trois rondes d'une semaine.
 *
 * Règles appliquées, par ordre de priorité :
 *  1. Deux joueurs ne se rencontrent jamais deux fois dans la même semaine
 *     (sauf s'il y a moins de 4 joueurs, où c'est mathématiquement inévitable).
 *  2. On évite les rencontres déjà jouées les semaines précédentes ; si c'est
 *     impossible, on autorise la répétition la moins fréquente.
 *  3. On rapproche les joueurs de score/classement voisin (sauf semaine 1 : aléatoire).
 *  4. Exempt (nombre impair) : joueur le moins souvent exempté, en partant du bas
 *     du classement ; jamais deux fois exempté dans la même semaine si possible.
 *  5. Couleurs équilibrées : écart blancs/noirs minimal, alternance.
 */
export function generateWeekDraw(
  players: PairingPlayer[],
  history: PairingHistory,
  options: DrawOptions = {},
): WeekDraw {
  const roundsCount = options.rounds ?? 3
  const rng = createRng(options.seed ?? Date.now())
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error('Participant en double dans le tirage')
  }
  if (players.length < 2) throw new Error('Il faut au moins 2 participants pour un tirage')

  // Ordre de référence : aléatoire en semaine 1, sinon classement
  // (les égalités parfaites sont mélangées pour ne pas favoriser l'ordre alphabétique).
  const shuffled = shuffle(players, rng)
  const ordered = options.random
    ? shuffled
    : [...shuffled].sort((a, b) => b.points - a.points || a.rank - b.rank)
  const order = ordered.map((p) => p.id)

  const scoreOf = new Map(players.map((p) => [p.id, p.points]))
  const indexOf = new Map(order.map((id, i) => [id, i]))
  const historyCount = new Map<string, number>()
  const colors = new Map<string, ColorState>(order.map((id) => [id, { balance: 0, recent: '' }]))
  for (const g of history.games) {
    const k = pairKey(g.white, g.black)
    historyCount.set(k, (historyCount.get(k) ?? 0) + 1)
    const w = colors.get(g.white)
    const b = colors.get(g.black)
    if (w) {
      w.balance += 1
      w.recent += 'w'
    }
    if (b) {
      b.balance -= 1
      b.recent += 'b'
    }
  }
  const byeCount = new Map<string, number>(order.map((id) => [id, 0]))
  for (const id of history.byes) if (byeCount.has(id)) byeCount.set(id, byeCount.get(id)! + 1)

  const ctx: RoundContext = { order, scoreOf, indexOf, historyCount, weekPairs: new Set() }
  const rounds: RoundDraw[] = []
  const repeats: WeekDraw['repeats'] = []
  const byesThisWeek = new Set<string>()

  for (let r = 1; r <= roundsCount; r++) {
    // --- Exempt ---
    let bye: string | null = null
    if (order.length % 2 === 1) {
      const candidates = [...order].reverse() // du bas du classement vers le haut
      candidates.sort((a, b) => {
        const wa = byesThisWeek.has(a) ? 1 : 0
        const wb = byesThisWeek.has(b) ? 1 : 0
        return wa - wb || byeCount.get(a)! - byeCount.get(b)!
      })
      bye = candidates[0]
      byesThisWeek.add(bye)
      byeCount.set(bye, byeCount.get(bye)! + 1)
    }
    const active = order.filter((id) => id !== bye)

    // --- Appariement : d'abord sans aucune répétition, puis en tolérant l'historique ---
    let pairs = matchRound(ctx, active, false) ?? matchRound(ctx, active, true)
    if (!pairs) {
      // Moins de 4 joueurs : on ne peut pas éviter une répétition dans la semaine.
      const relaxed: RoundContext = { ...ctx, weekPairs: new Set() }
      pairs = matchRound(relaxed, active, true)
    }
    if (!pairs) throw new Error(`Impossible d'apparier la ronde ${r}`)

    const pairings: Pairing[] = pairs.map(([a, b]) => {
      const key = pairKey(a, b)
      if ((historyCount.get(key) ?? 0) > 0 || ctx.weekPairs.has(key)) repeats.push({ a, b, round: r })
      const p = assignColors(a, b, colors, indexOf.get(a)! < indexOf.get(b)!)
      recordColors(p, colors)
      ctx.weekPairs.add(key)
      return p
    })
    rounds.push({ round: r, pairings, bye })
  }

  return { rounds, repeats }
}
