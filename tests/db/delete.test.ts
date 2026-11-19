/** Suppression d'un championnat créé par erreur : uniquement avant le premier tirage. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUser, deleteUsers, resetTournaments, rpc, service, type TestUser } from './helpers'

let adminU: TestUser
let a: TestUser
let b: TestUser

beforeAll(async () => {
  await resetTournaments()
  adminU = await createUser('Admin Del', { admin: true })
  ;[a, b] = await Promise.all([createUser('Joueur A'), createUser('Joueur B')])
})

afterAll(async () => {
  await resetTournaments()
  await deleteUsers([adminU, a, b])
})

describe('suppression d’un championnat', () => {
  it('supprime un championnat sans tirage (inscriptions effacées, comptes conservés)', async () => {
    const id = (await rpc(adminU.client, 'create_tournament', { p_name: 'Créé par erreur', p_bye_points: 0 })) as string
    await rpc(adminU.client, 'add_participant', { p_tournament: id, p_profile: a.id })
    await rpc(adminU.client, 'add_participant', { p_tournament: id, p_profile: b.id })
    await rpc(adminU.client, 'start_tournament', { p_tournament: id }) // lancé mais sans tirage : encore supprimable

    // Un participant ne peut pas supprimer.
    await expect(rpc(a.client, 'delete_tournament', { p_tournament: id, p_confirm_name: 'Créé par erreur' })).rejects.toThrow(/administrateur/)
    // Mauvais nom de confirmation.
    await expect(rpc(adminU.client, 'delete_tournament', { p_tournament: id, p_confirm_name: 'autre' })).rejects.toThrow(/nom/)

    await rpc(adminU.client, 'delete_tournament', { p_tournament: id, p_confirm_name: '  créé par ERREUR ' })
    const { count: t } = await service.from('tournaments').select('*', { count: 'exact', head: true }).eq('id', id)
    const { count: p } = await service.from('participants').select('*', { count: 'exact', head: true }).eq('tournament_id', id)
    const { count: profiles } = await service.from('profiles').select('*', { count: 'exact', head: true }).in('id', [a.id, b.id])
    expect([t, p, profiles]).toEqual([0, 0, 2])

    // On peut ensuite recréer un championnat.
    await expect(rpc(adminU.client, 'create_tournament', { p_name: 'Le bon', p_bye_points: 0 })).resolves.toBeTruthy()
    await resetTournaments()
  })

  it('refuse la suppression dès qu’un tirage a été publié', async () => {
    const id = (await rpc(adminU.client, 'create_tournament', { p_name: 'Déjà joué', p_bye_points: 0 })) as string
    const pa = (await rpc(adminU.client, 'add_participant', { p_tournament: id, p_profile: a.id })) as string
    const pb = (await rpc(adminU.client, 'add_participant', { p_tournament: id, p_profile: b.id })) as string
    await rpc(adminU.client, 'start_tournament', { p_tournament: id })
    const rounds = [1, 2, 3].map((r) => ({ round: r, pairings: [r % 2 ? { white: pa, black: pb } : { white: pb, black: pa }], bye: null }))
    await rpc(adminU.client, 'publish_week', { p_tournament: id, p_start_date: '2032-01-05', p_draw: { rounds } })

    await expect(rpc(adminU.client, 'delete_tournament', { p_tournament: id, p_confirm_name: 'Déjà joué' })).rejects.toThrow(/terminez/)
    const { count } = await service.from('tournaments').select('*', { count: 'exact', head: true }).eq('id', id)
    expect(count).toBe(1)
  })
})
