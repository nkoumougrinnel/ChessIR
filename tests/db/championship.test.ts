/**
 * Tests d'intégration contre le Supabase local : RLS, tirage, déclaration et
 * validation des résultats, arbitrage, clôture de semaine et classement.
 *
 * ⚠️ Supprime les championnats existants : à lancer sur la base locale uniquement
 *    (`npx supabase db reset` puis `npm run test:db`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, createUser, deleteUsers, resetTournaments, rpc, service, type TestUser } from './helpers'
import { generateWeekDraw } from '../../src/lib/pairing'

let adminU: TestUser
let players: TestUser[] = []
let outsider: TestUser
let tournamentId: string
const participantOf = new Map<string, string>() // profile id -> participant id

const MONDAY = '2030-01-07'

async function standings() {
  const { data, error } = await adminU.client.from('standings').select('*').eq('tournament_id', tournamentId)
  if (error) throw error
  return new Map(data.map((r) => [r.participant_id as string, r]))
}

async function weekMatches(weekId: string) {
  const { data, error } = await service
    .from('matches')
    .select('*, rounds!inner(week_id, number)')
    .eq('rounds.week_id', weekId)
  if (error) throw error
  return data
}

function userOfParticipant(pid: string) {
  const profileId = [...participantOf.entries()].find(([, p]) => p === pid)![0]
  return players.find((u) => u.id === profileId)!
}

async function publish(startDate: string, random: boolean) {
  const { data: parts } = await service.from('participants').select('id').eq('tournament_id', tournamentId).eq('status', 'active')
  const st = await standings()
  const { data: past } = await service.from('matches').select('white_id, black_id').eq('tournament_id', tournamentId)
  const draw = generateWeekDraw(
    parts!.map((p) => ({ id: p.id, points: st.get(p.id)?.points ?? 0, rank: st.get(p.id)?.rank ?? 1 })),
    { games: (past ?? []).map((m) => ({ white: m.white_id, black: m.black_id })), byes: [] },
    { random, seed: 7 },
  )
  return (await rpc(adminU.client, 'publish_week', {
    p_tournament: tournamentId,
    p_start_date: startDate,
    p_draw: { rounds: draw.rounds },
  })) as string
}

beforeAll(async () => {
  await resetTournaments()
  adminU = await createUser('Admin Test', { admin: true })
  players = await Promise.all(['Ateba', 'Bachirou', 'Dibo', 'Sanama', 'Omarou'].map((n, i) => createUser(n, { elo: 600 + i * 150 })))
  outsider = await createUser('Curieux')
})

afterAll(async () => {
  await resetTournaments()
  await deleteUsers([adminU, outsider, ...players])
})

describe('sécurité (RLS)', () => {
  it("un visiteur non connecté ne lit rien", async () => {
    const { data, error } = await anonClient().from('profiles').select('*')
    expect(error ?? data?.length === 0).toBeTruthy()
  })

  it("un participant ne peut pas se promouvoir administrateur", async () => {
    const { error } = await players[0].client.from('profiles').update({ role: 'admin' }).eq('id', players[0].id)
    expect(error).not.toBeNull()
    const { data } = await service.from('profiles').select('role').eq('id', players[0].id).single()
    expect(data!.role).toBe('participant')
  })

  it("un participant peut modifier son pseudo mais pas le profil d'un autre", async () => {
    await players[0].client.from('profiles').update({ chesscom_username: 'ateba_new' }).eq('id', players[0].id)
    await players[0].client.from('profiles').update({ display_name: 'Pirate' }).eq('id', players[1].id)
    const { data } = await service.from('profiles').select('id, display_name, chesscom_username').in('id', [players[0].id, players[1].id])
    expect(data!.find((p) => p.id === players[0].id)!.chesscom_username).toBe('ateba_new')
    expect(data!.find((p) => p.id === players[1].id)!.display_name).toBe('Bachirou')
  })

  it("un participant ne peut pas créer de championnat ni écrire dans les tables de jeu", async () => {
    await expect(rpc(players[0].client, 'create_tournament', { p_name: 'Hack', p_bye_points: 3 })).rejects.toThrow(/administrateur/)
    const { error } = await players[0].client.from('tournaments').insert({ name: 'Hack' })
    expect(error).not.toBeNull()
  })
})

describe('cycle complet du championnat', () => {
  it("l'admin crée le championnat, inscrit les joueurs et le démarre", async () => {
    tournamentId = (await rpc(adminU.client, 'create_tournament', { p_name: 'Championnat test', p_bye_points: 1 })) as string
    await expect(rpc(adminU.client, 'create_tournament', { p_name: 'Doublon', p_bye_points: 0 })).rejects.toThrow(/déjà/)
    for (const p of players) {
      participantOf.set(p.id, (await rpc(adminU.client, 'add_participant', { p_tournament: tournamentId, p_profile: p.id })) as string)
    }
    const { data } = await service.from('participants').select('initial_elo').eq('id', participantOf.get(players[4].id)!).single()
    expect(data!.initial_elo).toBe(1200) // Elo initial figé à l'inscription
    await rpc(adminU.client, 'start_tournament', { p_tournament: tournamentId })
    // Règle d'exemption figée après le lancement.
    await expect(rpc(adminU.client, 'update_tournament', { p_tournament: tournamentId, p_name: 'X', p_bye_points: 3 })).rejects.toThrow(/figée/)
  })

  it('refuse un tirage incomplet ou publié par un participant', async () => {
    const bad = { rounds: [1, 2, 3].map((r) => ({ round: r, pairings: [], bye: null })) }
    await expect(rpc(adminU.client, 'publish_week', { p_tournament: tournamentId, p_start_date: MONDAY, p_draw: bad })).rejects.toThrow(/incomplet/)
    await expect(rpc(players[0].client, 'publish_week', { p_tournament: tournamentId, p_start_date: MONDAY, p_draw: bad })).rejects.toThrow(
      /administrateur/,
    )
    await expect(rpc(adminU.client, 'publish_week', { p_tournament: tournamentId, p_start_date: '2030-01-08', p_draw: bad })).rejects.toThrow(/lundi/)
  })

  let week1: string
  it('publie la semaine 1 : 3 rondes, 2 matchs + 1 exempt par ronde', async () => {
    week1 = await publish(MONDAY, true)
    const matches = await weekMatches(week1)
    expect(matches).toHaveLength(6)
    const { data: byes } = await service.from('byes').select('*, rounds!inner(week_id)').eq('rounds.week_id', week1)
    expect(byes).toHaveLength(3)
    expect(byes!.every((b) => b.points === 1)).toBe(true)
    const { data: rounds } = await service.from('rounds').select('number, play_date').eq('week_id', week1).order('number')
    expect(rounds!.map((r) => r.play_date)).toEqual(['2030-01-07', '2030-01-09', '2030-01-11'])
    // Notification « tirage publié » pour chaque participant.
    const { count } = await service.from('notifications').select('*', { count: 'exact', head: true }).eq('type', 'draw_published')
    expect(count).toBe(5)
    // Un second tirage est refusé tant que la semaine n'est pas clôturée.
    await expect(publish('2030-01-14', false)).rejects.toThrow(/clôturée/)
  })

  it('les confrontations publiées sont verrouillées', async () => {
    const [m] = await weekMatches(week1)
    const { error } = await service.from('matches').update({ white_id: m.black_id, black_id: m.white_id }).eq('id', m.id)
    expect(error?.message).toMatch(/verrouillées/)
  })

  it('déclaration → confirmation : le résultat devient officiel et les points sont attribués', async () => {
    const [m] = (await weekMatches(week1)).sort((a, b) => a.rounds.number - b.rounds.number)
    const white = userOfParticipant(m.white_id)
    const black = userOfParticipant(m.black_id)

    // Un tiers ne peut pas déclarer.
    await expect(rpc(outsider.client, 'declare_result', { p_match: m.id, p_result: 'white_win' })).rejects.toThrow(/joueurs/)

    await rpc(white.client, 'declare_result', { p_match: m.id, p_result: 'white_win' })
    // Pas de double déclaration.
    await expect(rpc(black.client, 'declare_result', { p_match: m.id, p_result: 'black_win' })).rejects.toThrow(/déjà/)
    // Le déclarant ne peut pas confirmer lui-même.
    await expect(rpc(white.client, 'respond_result', { p_match: m.id, p_accept: true })).rejects.toThrow(/adversaire/)
    // Pas encore de points tant que non confirmé.
    expect((await standings()).get(m.white_id)!.points).toBe(0)

    await rpc(black.client, 'respond_result', { p_match: m.id, p_accept: true })
    await expect(rpc(black.client, 'respond_result', { p_match: m.id, p_accept: true })).rejects.toThrow(/attente/)

    const st = await standings()
    expect(st.get(m.white_id)!.points).toBeGreaterThanOrEqual(3)
    expect(st.get(m.white_id)!.wins).toBe(1)
    expect(st.get(m.black_id)!.losses).toBe(1)

    const { data: log } = await service.from('match_results').select('action').eq('match_id', m.id).order('created_at')
    expect(log!.map((l) => l.action)).toEqual(['declare', 'confirm'])

    // Badges « Premier pas » et « Première victoire ».
    const { data: badges } = await service
      .from('player_achievements')
      .select('achievements(code)')
      .eq('participant_id', m.white_id)
    expect(badges!.map((b) => (b.achievements as unknown as { code: string }).code).sort()).toEqual(['first_game', 'first_win'])
  })

  it('les déclarations simultanées ne créent pas de double résultat', async () => {
    const m = (await weekMatches(week1)).find((x) => x.status === 'scheduled')!
    const white = userOfParticipant(m.white_id)
    const black = userOfParticipant(m.black_id)
    const results = await Promise.allSettled([
      rpc(white.client, 'declare_result', { p_match: m.id, p_result: 'draw' }),
      rpc(black.client, 'declare_result', { p_match: m.id, p_result: 'draw' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const { count } = await service.from('match_results').select('*', { count: 'exact', head: true }).eq('match_id', m.id)
    expect(count).toBe(1)
    const declarer = (await service.from('matches').select('declared_by').eq('id', m.id).single()).data!.declared_by
    const responder = declarer === white.id ? black : white
    await rpc(responder.client, 'respond_result', { p_match: m.id, p_accept: true })
  })

  it("contestation → en attente jusqu'à l'arbitrage de l'admin", async () => {
    const m = (await weekMatches(week1)).find((x) => x.status === 'scheduled')!
    const white = userOfParticipant(m.white_id)
    const black = userOfParticipant(m.black_id)
    await rpc(white.client, 'declare_result', { p_match: m.id, p_result: 'white_win' })
    await expect(rpc(black.client, 'respond_result', { p_match: m.id, p_accept: false })).rejects.toThrow(/expliquer/)
    await rpc(black.client, 'respond_result', { p_match: m.id, p_accept: false, p_comment: "C'est moi qui ai gagné au temps" })

    const before = await standings()
    expect(before.get(m.white_id)!.played + before.get(m.black_id)!.played).toBeLessThan(10)
    const { data: mm } = await service.from('matches').select('status').eq('id', m.id).single()
    expect(mm!.status).toBe('disputed')

    // L'admin est notifié.
    const { count } = await service
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', adminU.id)
      .eq('type', 'result_disputed')
    expect(count).toBe(1)

    // Clôture impossible tant qu'une contestation est ouverte.
    await expect(rpc(adminU.client, 'close_week', { p_week: week1 })).rejects.toThrow(/contestés/)

    await expect(
      rpc(players[0].client, 'admin_resolve_match', { p_match: m.id, p_action: 'set', p_result: 'black_win', p_comment: 'x' }),
    ).rejects.toThrow(/administrateur/)
    await expect(rpc(adminU.client, 'admin_resolve_match', { p_match: m.id, p_action: 'set', p_result: 'black_win', p_comment: '' })).rejects.toThrow(
      /motif/,
    )
    await rpc(adminU.client, 'admin_resolve_match', {
      p_match: m.id,
      p_action: 'set',
      p_result: 'black_win',
      p_comment: 'Capture d’écran Chess.com vérifiée',
    })
    const after = await standings()
    expect(after.get(m.black_id)!.wins).toBeGreaterThanOrEqual(1)
  })

  it("correction d'un résultat : le classement est recalculé sans double attribution", async () => {
    const m = (await weekMatches(week1)).find((x) => x.status === 'validated' && x.result === 'white_win')!
    const before = await standings()
    const totalBefore = [...before.values()].reduce((s, r) => s + r.points, 0)
    await rpc(adminU.client, 'admin_resolve_match', { p_match: m.id, p_action: 'set', p_result: 'draw', p_comment: 'Erreur de saisie' })
    const after = await standings()
    expect(after.get(m.white_id)!.points).toBe(before.get(m.white_id)!.points - 2)
    expect(after.get(m.black_id)!.points).toBe(before.get(m.black_id)!.points + 1)
    expect([...after.values()].reduce((s, r) => s + r.points, 0)).toBe(totalBefore - 1)
  })

  it('clôture : matchs non déclarés → non joués (0 point), photo du classement, distinctions', async () => {
    const remaining = (await weekMatches(week1)).filter((x) => x.status === 'scheduled')
    expect(remaining.length).toBeGreaterThan(0)
    await rpc(adminU.client, 'close_week', { p_week: week1 })

    const after = await weekMatches(week1)
    for (const r of remaining) expect(after.find((x) => x.id === r.id)!.status).toBe('unplayed')

    const st = await standings()
    const { data: snaps } = await service.from('standings_snapshots').select('*').eq('week_id', week1)
    expect(snaps).toHaveLength(5)
    for (const s of snaps!) expect(s.points).toBe(st.get(s.participant_id)!.points)

    // Les points d'exemption (1 pt × 3 rondes) sont comptés.
    const totalByes = [...st.values()].reduce((s, r) => s + r.byes, 0)
    expect(totalByes).toBe(3)

    const { data: champs } = await service
      .from('player_achievements')
      .select('participant_id, achievements!inner(code)')
      .eq('week_id', week1)
      .eq('achievements.code', 'week_champion')
    const best = Math.max(...[...st.values()].map((r) => r.points))
    expect(champs!.length).toBeGreaterThanOrEqual(1)
    for (const c of champs!) expect(st.get(c.participant_id)!.points).toBe(best)

    // Plus de déclaration possible sur une semaine clôturée.
    const m = after[0]
    await expect(
      rpc(userOfParticipant(m.white_id).client, 'declare_result', { p_match: m.id, p_result: 'draw' }),
    ).rejects.toThrow()
  })

  it('semaine 2 : un joueur suspendu est exclu du tirage', async () => {
    await rpc(adminU.client, 'set_participant_status', { p_participant: participantOf.get(players[4].id), p_status: 'suspended' })
    const week2 = await publish('2030-01-14', false)
    const matches = await weekMatches(week2)
    expect(matches).toHaveLength(6) // 4 joueurs → 2 matchs × 3 rondes, pas d'exempt
    const suspended = participantOf.get(players[4].id)
    expect(matches.some((m) => m.white_id === suspended || m.black_id === suspended)).toBe(false)
    // Le joueur suspendu reste au classement.
    expect((await standings()).has(suspended!)).toBe(true)
  })
})
