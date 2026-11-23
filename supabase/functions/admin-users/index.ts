/**
 * Chess IR — Edge Function `admin-users` (réservée à l'administrateur).
 *
 * Actions (corps JSON { action, ... }) :
 *   temp-password  { profile_id }  donne un mot de passe provisoire à un joueur qui a oublié le sien.
 *                                  Le mot de passe est généré ici, renvoyé UNE fois à l'admin, jamais stocké en clair.
 *                                  Le compte est aussi marqué comme confirmé (accès immédiat).
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Mot de passe lisible et facile à dicter : Echecs-xxxx-0000 (sans caractères ambigus). */
function generatePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const pick = (set: string, n: number) => {
    const bytes = crypto.getRandomValues(new Uint8Array(n))
    return Array.from(bytes, (b) => set[b % set.length]).join('')
  }
  return `Echecs-${pick(letters, 4)}-${pick(digits, 4)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: auth } = await asUser.auth.getUser()
    if (!auth.user) return json({ error: 'Connexion requise' }, 401)
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: me } = await db.from('profiles').select('role, is_active').eq('id', auth.user.id).single()
    if (me?.role !== 'admin' || !me.is_active) return json({ error: 'Action réservée à l’administrateur' }, 403)

    const body = await req.json().catch(() => ({}))
    if (body.action !== 'temp-password') return json({ error: 'Action inconnue' }, 400)
    const profileId = String(body.profile_id ?? '')
    if (profileId === auth.user.id) return json({ error: 'Pour votre propre compte, utilisez « Changer mon mot de passe » dans le profil.' }, 400)
    const { data: target } = await db.from('profiles').select('id, display_name').eq('id', profileId).maybeSingle()
    if (!target) return json({ error: 'Joueur introuvable' }, 404)

    const password = generatePassword()
    const { error } = await db.auth.admin.updateUserById(profileId, { password, email_confirm: true })
    if (error) return json({ error: error.message }, 500)
    return json({ password, display_name: target.display_name })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
