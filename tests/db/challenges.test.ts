/**
 * Défi en deux temps : défier → l'adversaire répond dans les 5 minutes → en direct.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUser, deleteUsers, resetTournaments, rpc, service, type TestUser } from './helpers'

let adminU: TestUser
let a: TestUser, b: TestUser, c: TestUser, d: TestUser
let tournamentId: string
const pid = new Map<string, string>()
let matchAB: string
let matchCD: string
let matchAC: string

async function open(matchId: string) {
  const { data } = await service.from('match_challenges').select('*').eq('match_id', matchId).is('ended_at', null)
  return data ?? []
}

beforeAll(async () => {
  await resetTournaments()
  adminU = await createUser('Admin Défi', { admin: true })
  ;[a, b, c, d] = await Promise.all(['Ana', 'Bob', 'Cid', 'Dan'].map((x) => createUser(x)))
  tournamentId = (await rpc(adminU.client, 'create_tournament', { p_name: 'Test défis', p_bye_points: 0 })) as string
  for (const u of [a, b, c, d]) pid.set(u.id, (await rpc(adminU.client, 'add_participant', { p_tournament: tournamentId, p_profile: u.id })) as string)
  await rpc(adminU.client, 'start_tournament', { p_tournament: tournamentId })
  const [pa, pb, pc, pd] = [a, b, c, d].map((u) => pid.get(u.id)!)
  const rounds = [
    { round: 1, pairings: [{ white: pa, black: pb }, { white: pc, black: pd }], bye: null },
    { round: 2, pairings: [{ white: pa, black: pc }, { white: pb, black: pd }], bye: null },
    { round: 3, pairings: [{ white: pa, black: pd }, { white: pb, black: pc }], bye: null },
  ]
  const weekId = await rpc(adminU.client, 'publish_week', { p_tournament: tournamentId, p_start_date: '2031-01-06', p_draw: { rounds } })
  const { data: ms } = await service.from('matches').select('id, white_id, black_id, rounds!inner(week_id)').eq('rounds.week_id', weekId)
  const find = (w: string, bl: string) => ms!.find((m) => m.white_id === w && m.black_id === bl)!.id
  matchAB = find(pa, pb)
  matchCD = find(pc, pd)
  matchAC = find(pa, pc)
})

afterAll(async () => {
  await resetTournaments()
  await deleteUsers([adminU, a, b, c, d])
})

describe('défi en deux temps', () => {
  it('défier ouvre un défi de 5 minutes et prévient l’adversaire seulement', async () => {
    const r = (await rpc(a.client, 'challenge_match', { p_match: matchAB })) as { state: string; expires_at: string }
    expect(r.state).toBe('pending')
    const left = new Date(r.expires_at).getTime() - Date.now()
    expect(left).toBeGreaterThan(4 * 60_000)
    expect(left).toBeLessThanOrEqual(5 * 60_000 + 5_000)

    const { data: notifB } = await service.from('notifications').select('type, title').eq('profile_id', b.id).eq('type', 'challenge')
    expect(notifB).toHaveLength(1)
    expect(notifB![0].title).toMatch(/Ana vous défie/)
    const { data: notifC } = await service.from('notifications').select('id').eq('profile_id', c.id).eq('type', 'challenge')
    expect(notifC).toHaveLength(0)
  })

  it('appuyer à nouveau sur Défier ne relance pas la notification', async () => {
    const r = (await rpc(a.client, 'challenge_match', { p_match: matchAB })) as { state: string }
    expect(r.state).toBe('pending')
    expect(await open(matchAB)).toHaveLength(1)
    const { data } = await service.from('notifications').select('id').eq('profile_id', b.id).eq('type', 'challenge')
    expect(data).toHaveLength(1)
  })

  it('l’adversaire répond dans le délai → en direct pendant 90 minutes', async () => {
    const r = (await rpc(b.client, 'challenge_match', { p_match: matchAB })) as { state: string; live_until: string }
    expect(r.state).toBe('live')
    const left = new Date(r.live_until).getTime() - Date.now()
    expect(left).toBeGreaterThan(85 * 60_000)
    const [ch] = await open(matchAB)
    expect(ch.accepted_at).not.toBeNull()
    // Toute la classe est prévenue, sauf les deux joueurs.
    const { data: live } = await service.from('notifications').select('profile_id, title, link').eq('type', 'live')
    expect(live!.map((x) => x.profile_id).sort()).toEqual([c.id, d.id].sort())
    expect(live![0].title).toMatch(/Ana affronte Bob/)
    expect(live![0].link).toBe('/arene')
    // Un appui de plus ne change rien.
    expect(((await rpc(a.client, 'challenge_match', { p_match: matchAB })) as { state: string }).state).toBe('live')
  })

  it('le direct s’éteint dès qu’un résultat est déclaré', async () => {
    await rpc(a.client, 'declare_result', { p_match: matchAB, p_result: 'white_win' })
    expect(await open(matchAB)).toHaveLength(0)
    const { data } = await service.from('match_challenges').select('end_reason').eq('match_id', matchAB)
    expect(data![0].end_reason).toBe('declared')
    await expect(rpc(b.client, 'challenge_match', { p_match: matchAB })).rejects.toThrow(/déjà un résultat/)
  })

  it('réponse hors délai → le défi expiré est refermé et un nouveau défi part', async () => {
    await rpc(c.client, 'challenge_match', { p_match: matchCD })
    // Simule l'expiration du délai de 5 minutes.
    await service.from('match_challenges').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('match_id', matchCD)
    const r = (await rpc(d.client, 'challenge_match', { p_match: matchCD })) as { state: string }
    expect(r.state).toBe('pending') // Dan devient le défieur, Cid est prévenu.
    const { data } = await service.from('match_challenges').select('challenger_id, end_reason').eq('match_id', matchCD).order('created_at')
    expect(data!.map((x) => x.end_reason)).toEqual(['expired', null])
    expect(data![1].challenger_id).toBe(pid.get(d.id))
  })

  it('un joueur peut annuler (fausse alerte)', async () => {
    await rpc(c.client, 'cancel_challenge', { p_match: matchCD })
    expect(await open(matchCD)).toHaveLength(0)
  })

  it('seuls les deux joueurs du match peuvent défier ou annuler', async () => {
    await expect(rpc(b.client, 'challenge_match', { p_match: matchAC })).rejects.toThrow(/Seuls les deux joueurs/)
    await rpc(a.client, 'challenge_match', { p_match: matchAC })
    await expect(rpc(d.client, 'cancel_challenge', { p_match: matchAC })).rejects.toThrow(/Seuls les deux joueurs/)
    expect(await open(matchAC)).toHaveLength(1)
  })

  it('personne ne peut écrire directement dans la table des défis', async () => {
    const { error } = await a.client.from('match_challenges').insert({ match_id: matchAC, challenger_id: pid.get(a.id), expires_at: new Date().toISOString() })
    expect(error).not.toBeNull()
    await a.client.from('match_challenges').update({ ended_at: new Date().toISOString() }).eq('match_id', matchAC)
    // Sans politique d'écriture, la mise à jour ne touche aucune ligne.
    expect(await open(matchAC)).toHaveLength(1)
  })

  it('tout connecté voit les défis (pour l’Arène)', async () => {
    const { data } = await d.client.from('match_challenges').select('id').eq('match_id', matchAC)
    expect(data).toHaveLength(1)
  })
})
