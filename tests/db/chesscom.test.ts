/**
 * Intégration Chess.com côté base : la détection ne fait que proposer,
 * la validation humaine reste obligatoire, et rien n'influence le classement.
 * Les parties sont des fixtures insérées avec la clé de service (aucun appel à Chess.com).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUser, deleteUsers, resetTournaments, rpc, service, type TestUser } from './helpers'

let adminU: TestUser
let a: TestUser, b: TestUser, c: TestUser, d: TestUser
let tournamentId: string
let weekId: string
const pid = new Map<string, string>()
let matchAB: { id: string; white_id: string; black_id: string }
let matchCD: { id: string; white_id: string; black_id: string }

const userOf = (participantId: string) => [a, b, c, d].find((u) => pid.get(u.id) === participantId)!

let n = 0
async function insertGame(match: { id: string }, patch: Record<string, unknown> = {}) {
  n++
  const { data, error } = await service
    .from('chesscom_games')
    .insert({
      tournament_id: tournamentId,
      match_id: match.id,
      game_url: `https://www.chess.com/game/live/test-${Date.now()}-${n}`,
      end_time: new Date().toISOString(),
      time_class: 'rapid',
      white_username: 'w',
      black_username: 'b',
      white_result: 'win',
      black_result: 'resigned',
      result_for_match: 'white_win',
      colors_match: true,
      time_class_ok: true,
      confidence: 'certain',
      ...patch,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

async function standingsSnapshot() {
  const { data } = await service.from('standings').select('participant_id, points, rank').eq('tournament_id', tournamentId)
  return JSON.stringify((data ?? []).sort((x, y) => x.participant_id.localeCompare(y.participant_id)))
}

beforeAll(async () => {
  await resetTournaments()
  adminU = await createUser('Admin CC', { admin: true })
  ;[a, b, c, d] = await Promise.all(['Alpha', 'Bravo', 'Charlie', 'Delta'].map((x) => createUser(x)))
  tournamentId = (await rpc(adminU.client, 'create_tournament', { p_name: 'Test Chess.com', p_bye_points: 0 })) as string
  for (const u of [a, b, c, d]) pid.set(u.id, (await rpc(adminU.client, 'add_participant', { p_tournament: tournamentId, p_profile: u.id })) as string)
  await rpc(adminU.client, 'start_tournament', { p_tournament: tournamentId })
  const [pa, pb, pc, pd] = [a, b, c, d].map((u) => pid.get(u.id)!)
  const rounds = [
    { round: 1, pairings: [{ white: pa, black: pb }, { white: pc, black: pd }], bye: null },
    { round: 2, pairings: [{ white: pa, black: pc }, { white: pb, black: pd }], bye: null },
    { round: 3, pairings: [{ white: pa, black: pd }, { white: pb, black: pc }], bye: null },
  ]
  weekId = (await rpc(adminU.client, 'publish_week', { p_tournament: tournamentId, p_start_date: '2031-01-06', p_draw: { rounds } })) as string
  const { data: ms } = await service.from('matches').select('id, white_id, black_id, rounds!inner(week_id, number)').eq('rounds.week_id', weekId)
  matchAB = ms!.find((m) => m.white_id === pa && m.black_id === pb)!
  matchCD = ms!.find((m) => m.white_id === pc && m.black_id === pd)!
})

afterAll(async () => {
  await resetTournaments()
  await deleteUsers([adminU, a, b, c, d])
})

describe('sécurité des données Chess.com', () => {
  it('un participant ne peut pas écrire dans les tables Chess.com', async () => {
    const { error } = await a.client.from('chesscom_games').insert({ match_id: matchAB.id })
    expect(error).not.toBeNull()
    const { error: e2 } = await a.client.from('chesscom_profiles').insert({ profile_id: a.id, username: 'x', status: 'verified' })
    expect(e2).not.toBeNull()
  })

  it('un participant ne peut plus modifier son pseudo directement (passage obligé par la vérification)', async () => {
    await a.client.from('profiles').update({ chesscom_username: 'quelquun_dautre' }).eq('id', a.id)
    const { data } = await service.from('profiles').select('chesscom_username').eq('id', a.id).single()
    expect(data!.chesscom_username).not.toBe('quelquun_dautre')
  })

  it('les paramètres de détection sont figés après le lancement', async () => {
    await expect(
      rpc(adminU.client, 'update_chesscom_settings', {
        p_tournament: tournamentId,
        p_time_classes: ['blitz'],
        p_rated_only: true,
        p_timezone: 'UTC',
      }),
    ).rejects.toThrow(/figées/)
  })
})

describe('proposition de résultat', () => {
  it("accepter une partie certaine = déclarer : l'adversaire doit encore confirmer", async () => {
    const before = await standingsSnapshot()
    const game = await insertGame(matchAB)
    // Un tiers ne peut pas accepter.
    await expect(rpc(c.client, 'accept_chesscom_game', { p_match: matchAB.id, p_game: game })).rejects.toThrow(/joueurs/)

    await rpc(b.client, 'accept_chesscom_game', { p_match: matchAB.id, p_game: game })
    const { data: m } = await service.from('matches').select('*').eq('id', matchAB.id).single()
    expect(m!.status).toBe('pending') // pas de validation automatique
    expect(m!.declared_result).toBe('white_win')
    expect(m!.declaration_source).toBe('chesscom')
    expect(m!.chesscom_game_id).toBe(game)
    expect(await standingsSnapshot()).toBe(before) // aucun point tant que non confirmé

    // Le déclarant ne peut pas confirmer lui-même ; l'adversaire si.
    await expect(rpc(b.client, 'respond_result', { p_match: matchAB.id, p_accept: true })).rejects.toThrow(/adversaire/)
    await rpc(a.client, 'respond_result', { p_match: matchAB.id, p_accept: true })
    const { data: st } = await service.from('standings').select('points').eq('participant_id', matchAB.white_id).single()
    expect(st!.points).toBe(3)
  })

  it('une partie ne peut pas être acceptée pour un autre match', async () => {
    const game = await insertGame(matchCD)
    await expect(rpc(a.client, 'accept_chesscom_game', { p_match: matchAB.id, p_game: game })).rejects.toThrow(/introuvable/)
  })

  it('couleurs inversées ou cadence refusée : les joueurs ne peuvent pas la retenir', async () => {
    const [{ data: r2 }] = await Promise.all([
      service.from('matches').select('id, white_id, black_id, rounds!inner(week_id, number)').eq('rounds.week_id', weekId).eq('rounds.number', 2),
    ])
    const m = r2![0]
    const reversed = await insertGame(m, { colors_match: false, confidence: 'uncertain', uncertainty_reason: 'Couleurs inversées' })
    const blitz = await insertGame(m, { time_class: 'blitz', time_class_ok: false, confidence: 'uncertain' })
    const player = userOf(m.white_id)
    await expect(rpc(player.client, 'accept_chesscom_game', { p_match: m.id, p_game: reversed })).rejects.toThrow(/administrateur/)
    await expect(rpc(player.client, 'accept_chesscom_game', { p_match: m.id, p_game: blitz })).rejects.toThrow(/Cadence/)

    // L'admin peut lier la partie (sans changer le résultat).
    await expect(rpc(player.client, 'admin_link_game', { p_match: m.id, p_game: reversed, p_comment: 'x' })).rejects.toThrow(/administrateur/)
    await rpc(adminU.client, 'admin_link_game', { p_match: m.id, p_game: reversed, p_comment: 'Couleurs inversées acceptées' })
    const { data: after } = await service.from('matches').select('status, chesscom_game_id').eq('id', m.id).single()
    expect(after!.chesscom_game_id).toBe(reversed)
    expect(after!.status).toBe('scheduled')
    const { data: log } = await service.from('match_results').select('action').eq('match_id', m.id)
    expect(log!.map((l) => l.action)).toContain('link_game')
  })

  it("retirer une déclaration issue de Chess.com délie la partie", async () => {
    const game = await insertGame(matchCD, { game_url: `https://www.chess.com/game/live/retrait-${Date.now()}` })
    await rpc(c.client, 'accept_chesscom_game', { p_match: matchCD.id, p_game: game })
    await rpc(c.client, 'withdraw_declaration', { p_match: matchCD.id })
    const { data: m } = await service.from('matches').select('status, chesscom_game_id, declaration_source').eq('id', matchCD.id).single()
    expect(m).toEqual({ status: 'scheduled', chesscom_game_id: null, declaration_source: null })
  })

  it('une même partie ne peut pas être enregistrée pour deux matchs', async () => {
    const url = `https://www.chess.com/game/live/unique-${Date.now()}`
    await insertGame(matchCD, { game_url: url })
    await expect(insertGame(matchAB, { game_url: url })).rejects.toBeTruthy()
  })

  it('la clôture ne valide jamais une partie détectée non déclarée', async () => {
    // matchCD a des parties détectées mais reste « à jouer ».
    await rpc(adminU.client, 'close_week', { p_week: weekId })
    const { data: m } = await service.from('matches').select('status, result').eq('id', matchCD.id).single()
    expect(m).toEqual({ status: 'unplayed', result: null })
  })

  it('les données Chess.com ne modifient pas le classement', async () => {
    const before = await standingsSnapshot()
    await service.from('chesscom_profiles').upsert(
      [a, b, c, d].map((u, i) => ({
        profile_id: u.id,
        username: `u${i}`,
        status: 'verified',
        ratings: { rapid: { current: 3000 - i * 500, best: 3000, win: 999, loss: 0, draw: 0 } },
      })),
    )
    expect(await standingsSnapshot()).toBe(before)
  })
})
