/** Réglages généraux : lien du groupe WhatsApp, modifiable par l'admin uniquement. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createUser, deleteUsers, rpc, service, type TestUser } from './helpers'

let adminU: TestUser
let player: TestUser
let previous: string | null = null

beforeAll(async () => {
  adminU = await createUser('Admin Settings', { admin: true })
  player = await createUser('Joueur Settings')
  const { data } = await service.from('app_settings').select('value').eq('key', 'whatsapp_group_url').maybeSingle()
  previous = data?.value ?? null
})

afterAll(async () => {
  await service.from('app_settings').upsert({ key: 'whatsapp_group_url', value: previous })
  await deleteUsers([adminU, player])
})

it("seul l'admin modifie le lien du groupe, qui doit être un lien WhatsApp valide", async () => {
  const url = 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv'
  await expect(rpc(player.client, 'set_app_setting', { p_key: 'whatsapp_group_url', p_value: url })).rejects.toThrow(/administrateur/)
  await expect(rpc(adminU.client, 'set_app_setting', { p_key: 'whatsapp_group_url', p_value: 'https://exemple.com/x' })).rejects.toThrow(
    /invalide/,
  )
  await rpc(adminU.client, 'set_app_setting', { p_key: 'whatsapp_group_url', p_value: url })
  const { data } = await player.client.from('app_settings').select('value').eq('key', 'whatsapp_group_url').single()
  expect(data!.value).toBe(url) // lisible par tous les connectés
  const { error } = await player.client.from('app_settings').update({ value: 'x' }).eq('key', 'whatsapp_group_url')
  const { data: after } = await service.from('app_settings').select('value').eq('key', 'whatsapp_group_url').single()
  expect(error !== null || after!.value === url).toBe(true)
  // Effacer le lien est possible.
  await rpc(adminU.client, 'set_app_setting', { p_key: 'whatsapp_group_url', p_value: '' })
  const { data: cleared } = await service.from('app_settings').select('value').eq('key', 'whatsapp_group_url').single()
  expect(cleared!.value).toBeNull()
})
