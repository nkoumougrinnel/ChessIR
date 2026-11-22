/**
 * Notifications push : chacun ne gère que ses appareils ; un appareil passe au compte connecté.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createUser, deleteUsers, rpc, service, type TestUser } from './helpers'

let a: TestUser, b: TestUser
const endpoint = `https://push.example.test/${Math.random().toString(36).slice(2)}`

beforeAll(async () => {
  ;[a, b] = await Promise.all([createUser('Push A'), createUser('Push B')])
})

afterAll(async () => {
  await service.from('push_subscriptions').delete().eq('endpoint', endpoint)
  await deleteUsers([a, b])
})

describe('abonnements push', () => {
  it('un joueur enregistre son appareil et ne voit que les siens', async () => {
    await rpc(a.client, 'register_push_subscription', { p_endpoint: endpoint, p_p256dh: 'k', p_auth: 's', p_user_agent: 'test' })
    const { data: mine } = await a.client.from('push_subscriptions').select('endpoint')
    expect(mine!.map((x) => x.endpoint)).toContain(endpoint)
    const { data: theirs } = await b.client.from('push_subscriptions').select('endpoint')
    expect(theirs).toHaveLength(0)
  })

  it('le même téléphone connecté à un autre compte passe à ce compte', async () => {
    await rpc(b.client, 'register_push_subscription', { p_endpoint: endpoint, p_p256dh: 'k2', p_auth: 's2', p_user_agent: 'test' })
    const { data } = await service.from('push_subscriptions').select('profile_id').eq('endpoint', endpoint)
    expect(data).toEqual([{ profile_id: b.id }])
  })

  it('on ne peut ni ajouter un appareil à un autre compte, ni supprimer celui des autres', async () => {
    const { error } = await a.client.from('push_subscriptions').insert({ profile_id: b.id, endpoint: endpoint + 'x', p256dh: 'k', auth: 's' })
    expect(error).not.toBeNull()
    await a.client.from('push_subscriptions').delete().eq('endpoint', endpoint)
    const { data } = await service.from('push_subscriptions').select('id').eq('endpoint', endpoint)
    expect(data).toHaveLength(1)
  })

  it('adresse non sécurisée refusée', async () => {
    await expect(
      rpc(a.client, 'register_push_subscription', { p_endpoint: 'http://evil.test', p_p256dh: 'k', p_auth: 's', p_user_agent: '' }),
    ).rejects.toThrow(/invalide/)
  })

  it('la configuration de l’envoi est inaccessible aux utilisateurs', async () => {
    const { error } = await a.client.schema('private').from('push_config').select('*')
    expect(error).not.toBeNull()
  })
})
