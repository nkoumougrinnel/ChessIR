import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Lève une erreur lisible si Supabase répond en erreur. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(friendlyError(res.error.message))
  return res.data as T
}

export function friendlyError(message: string): string {
  if (/Invalid login credentials/i.test(message)) return 'E-mail ou mot de passe incorrect.'
  if (/User already registered/i.test(message)) return 'Un compte existe déjà avec cet e-mail.'
  if (/Password should be at least/i.test(message)) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (/chesscom_username_check/.test(message)) return 'Pseudo Chess.com invalide (3 à 25 caractères : lettres, chiffres, - ou _).'
  if (/display_name_check/.test(message)) return 'Le nom doit contenir entre 2 et 40 caractères.'
  if (/declared_elo_check/.test(message)) return 'Elo invalide (entre 0 et 3500).'
  if (/Failed to fetch/i.test(message)) return 'Connexion impossible. Vérifiez votre réseau.'
  return message
}
