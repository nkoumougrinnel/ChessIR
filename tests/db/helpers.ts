import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Lit les clés du Supabase local (`npx supabase start`). */
export function localEnv() {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const env = Object.fromEntries(
    out
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]]),
  )
  return { url: env.API_URL as string, anon: env.ANON_KEY as string, service: env.SERVICE_ROLE_KEY as string }
}

export const env = localEnv()

export const service = createClient(env.url, env.service, { auth: { persistSession: false } })

export function anonClient() {
  return createClient(env.url, env.anon, { auth: { persistSession: false } })
}

export interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

/** Crée un utilisateur confirmé et renvoie un client connecté en son nom. */
export async function createUser(name: string, opts: { admin?: boolean; elo?: number } = {}): Promise<TestUser> {
  const email = `${name.toLowerCase().replace(/\W/g, '')}-${Math.random().toString(36).slice(2, 8)}@test.chessir`
  const password = 'test-password-123'
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, chesscom_username: name.toLowerCase().replace(/\W/g, '') + '_ir' },
  })
  if (error) throw error
  const id = data.user.id
  if (opts.admin || opts.elo !== undefined) {
    const patch: Record<string, unknown> = {}
    if (opts.admin) patch.role = 'admin'
    if (opts.elo !== undefined) patch.declared_elo = opts.elo
    const { error: e } = await service.from('profiles').update(patch).eq('id', id)
    if (e) throw e
  }
  const client = anonClient()
  const { error: e2 } = await client.auth.signInWithPassword({ email, password })
  if (e2) throw e2
  return { id, email, client }
}

export async function rpc(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

export async function deleteUsers(users: TestUser[]) {
  for (const u of users) await service.auth.admin.deleteUser(u.id)
}

/** Remet à zéro les championnats (base de test locale uniquement). */
export async function resetTournaments() {
  await service.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const { error } = await service.from('tournaments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}
