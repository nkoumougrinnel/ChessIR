/**
 * Chess IR — Edge Function `chesscom-sync`
 *
 * Seul composant qui interroge l'API publique de Chess.com (lecture seule).
 * Vérifie l'identité et les droits de l'appelant, puis écrit en base avec la
 * clé de service (les clients n'ont aucun droit d'écriture sur ces tables).
 *
 * Actions (corps JSON { action, ... }) :
 *   set-username   { username, profile_id? }  vérifie et enregistre un pseudo (admin pour un autre profil)
 *   sync-profile   { profile_id?, force? }     synchronise profil, avatar et classements
 *   detect-match   { match_id }                recherche la partie d'une confrontation
 *   sync-week      { week_id }                 recherche les parties de tous les matchs d'une semaine (admin)
 *
 * Variables d'environnement :
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (fournies par Supabase)
 *   CHESSCOM_CONTACT  contact inclus dans le User-Agent (recommandé par Chess.com)
 *   CHESSCOM_API_BASE (optionnel, tests) — défaut https://api.chess.com/pub
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  detectGames,
  extractRatings,
  localMidnightToUnix,
  monthsBetween,
  USERNAME_RE,
  type ApiGame,
  type ApiPlayer,
  type ApiStats,
} from '../_shared/chesscom.ts'

const API = Deno.env.get('CHESSCOM_API_BASE') ?? 'https://api.chess.com/pub'
const CONTACT = Deno.env.get('CHESSCOM_CONTACT') ?? 'non renseigné'
const USER_AGENT = `ChessIR/1.1 (championnat d'échecs de classe; contact: ${CONTACT})`
const PROFILE_TTL_MS = 24 * 3600 * 1000
const DETECT_COOLDOWN_MS = 2 * 60 * 1000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/* ------------------------------------------------------------------ */
/* Client PubAPI : requêtes en série, User-Agent, gestion des erreurs  */
/* ------------------------------------------------------------------ */

let queue: Promise<unknown> = Promise.resolve()

/** GET sérialisé (Chess.com renvoie 429 sur les requêtes parallèles). null si 404. */
function apiGet<T>(path: string): Promise<T | null> {
  const run = async (): Promise<T | null> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${API}${path}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
      if (res.status === 404 || res.status === 410) return null
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      if (!res.ok) throw new HttpError(502, `Chess.com indisponible (${res.status})`)
      return (await res.json()) as T
    }
    throw new HttpError(503, 'Chess.com limite les requêtes, réessayez dans quelques minutes')
  }
  const p = queue.then(run, run)
  queue = p.catch(() => undefined)
  return p
}

const archiveCache = new Map<string, ApiGame[]>()
async function monthGames(username: string, month: string): Promise<ApiGame[]> {
  const key = `${username.toLowerCase()}|${month}`
  if (!archiveCache.has(key)) {
    const data = await apiGet<{ games: ApiGame[] }>(`/player/${encodeURIComponent(username.toLowerCase())}/games/${month}`)
    archiveCache.set(key, data?.games ?? [])
  }
  return archiveCache.get(key)!
}

/* ------------------------------------------------------------------ */
/* Profils                                                             */
/* ------------------------------------------------------------------ */

async function syncProfile(db: SupabaseClient, profileId: string, force: boolean) {
  const { data: profile } = await db.from('profiles').select('id, chesscom_username').eq('id', profileId).single()
  if (!profile) throw new HttpError(404, 'Profil introuvable')
  if (!profile.chesscom_username) {
    await db.from('chesscom_profiles').delete().eq('profile_id', profileId)
    return { status: 'missing' }
  }
  const { data: cached } = await db.from('chesscom_profiles').select('*').eq('profile_id', profileId).maybeSingle()
  if (
    !force &&
    cached &&
    cached.username.toLowerCase() === profile.chesscom_username.toLowerCase() &&
    Date.now() - new Date(cached.fetched_at).getTime() < PROFILE_TTL_MS
  ) {
    return { status: cached.status, cached: true }
  }

  const username = profile.chesscom_username.toLowerCase()
  try {
    const player = await apiGet<ApiPlayer>(`/player/${encodeURIComponent(username)}`)
    if (!player) {
      await db.from('chesscom_profiles').upsert({
        profile_id: profileId,
        username: profile.chesscom_username,
        status: 'not_found',
        ratings: {},
        fetched_at: new Date().toISOString(),
        last_error: null,
      })
      if (cached?.status !== 'not_found') {
        await db.from('notifications').insert({
          profile_id: profileId,
          type: 'chesscom_username_invalid',
          title: 'Pseudo Chess.com introuvable',
          body: `« ${profile.chesscom_username} » n'existe pas sur Chess.com. Corrigez-le dans votre profil.`,
          link: '/profil/modifier',
        })
      }
      return { status: 'not_found' }
    }
    const stats = (await apiGet<ApiStats>(`/player/${encodeURIComponent(username)}/stats`)) ?? {}
    const ratings = extractRatings(stats)
    await db.from('chesscom_profiles').upsert({
      profile_id: profileId,
      username: player.username,
      player_id: player.player_id,
      avatar_url: player.avatar ?? null,
      url: player.url ?? null,
      status: 'verified',
      ratings,
      joined_at: player.joined ? new Date(player.joined * 1000).toISOString() : null,
      last_online: player.last_online ? new Date(player.last_online * 1000).toISOString() : null,
      fetched_at: new Date().toISOString(),
      last_error: null,
    })

    // Elo synchronisé depuis Chess.com (cadence du championnat, rapid par défaut).
    const { data: t } = await db
      .from('tournaments')
      .select('chesscom_time_classes')
      .neq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const cadence = (t?.chesscom_time_classes?.[0] ?? 'rapid') as keyof typeof ratings
    const elo = ratings[cadence]?.current ?? null
    if (elo !== null) {
      await db.from('profiles').update({ declared_elo: elo }).eq('id', profileId)
      // Elo initial : renseigné depuis Chess.com s'il ne l'est pas encore.
      await db.from('participants').update({ initial_elo: elo }).eq('profile_id', profileId).is('initial_elo', null)
    }
    return { status: 'verified', elo }
  } catch (e) {
    await db.from('chesscom_profiles').upsert({
      profile_id: profileId,
      username: profile.chesscom_username,
      status: cached?.status ?? 'error',
      ratings: cached?.ratings ?? {},
      fetched_at: cached?.fetched_at ?? new Date().toISOString(),
      last_error: (e as Error).message,
    })
    throw e
  }
}

async function setUsername(db: SupabaseClient, callerId: string, isAdmin: boolean, profileId: string, raw: string) {
  const username = raw.trim()
  if (username && !USERNAME_RE.test(username)) {
    throw new HttpError(400, 'Pseudo Chess.com invalide (3 à 25 caractères : lettres, chiffres, - ou _)')
  }
  if (profileId !== callerId && !isAdmin) throw new HttpError(403, 'Action réservée à l’administrateur')

  const { data: profile } = await db.from('profiles').select('chesscom_username').eq('id', profileId).single()
  if (!profile) throw new HttpError(404, 'Profil introuvable')
  if ((profile.chesscom_username ?? '').toLowerCase() === username.toLowerCase()) {
    return syncProfile(db, profileId, true)
  }

  // Verrou : pendant un championnat en cours, seul l'admin peut changer un pseudo.
  if (!isAdmin) {
    const { data: locked } = await db
      .from('participants')
      .select('id, tournaments!inner(status)')
      .eq('profile_id', profileId)
      .eq('tournaments.status', 'active')
      .limit(1)
    if (locked?.length) {
      throw new HttpError(409, 'Championnat en cours : demandez à l’administrateur de modifier votre pseudo Chess.com')
    }
  }

  if (username) {
    const player = await apiGet<ApiPlayer>(`/player/${encodeURIComponent(username.toLowerCase())}`)
    if (!player) throw new HttpError(404, `« ${username} » n'existe pas sur Chess.com`)
  }
  const { error } = await db.from('profiles').update({ chesscom_username: username || null }).eq('id', profileId)
  if (error) throw new HttpError(400, error.message)
  await db.from('username_changes').insert({
    profile_id: profileId,
    old_value: profile.chesscom_username,
    new_value: username || null,
    changed_by: callerId,
  })
  return syncProfile(db, profileId, true)
}

/* ------------------------------------------------------------------ */
/* Détection des parties                                               */
/* ------------------------------------------------------------------ */

interface MatchRow {
  id: string
  tournament_id: string
  status: string
  white_id: string
  black_id: string
  chesscom_game_id: string | null
  chesscom_checked_at: string | null
  round: { week: { start_date: string; status: string; closed_at: string | null } }
}

async function loadMatch(db: SupabaseClient, matchId: string) {
  const { data } = await db
    .from('matches')
    .select('id, tournament_id, status, white_id, black_id, chesscom_game_id, chesscom_checked_at, round:rounds!inner(week:weeks!inner(start_date, status, closed_at))')
    .eq('id', matchId)
    .single()
  return data as unknown as MatchRow | null
}

async function detectMatch(db: SupabaseClient, m: MatchRow) {
  const { data: t } = await db
    .from('tournaments')
    .select('chesscom_time_classes, chesscom_rated_only, timezone')
    .eq('id', m.tournament_id)
    .single()
  const { data: parts } = await db
    .from('participants')
    .select('id, profile_id, profiles!inner(chesscom_username, display_name)')
    .in('id', [m.white_id, m.black_id])
  const byId = new Map(
    (parts ?? []).map((p) => [p.id, p.profiles as unknown as { chesscom_username: string | null; display_name: string }]),
  )
  const white = byId.get(m.white_id)
  const black = byId.get(m.black_id)
  const now = new Date().toISOString()
  await db.from('matches').update({ chesscom_checked_at: now }).eq('id', m.id)
  if (!white?.chesscom_username || !black?.chesscom_username) {
    return { status: 'no_username' as const }
  }

  const week = m.round.week
  const windowStart = localMidnightToUnix(week.start_date, t!.timezone)
  const windowEnd = Math.floor((week.closed_at ? new Date(week.closed_at).getTime() : Date.now()) / 1000)

  const games: ApiGame[] = []
  for (const month of monthsBetween(windowStart, windowEnd)) {
    games.push(...(await monthGames(white.chesscom_username, month)))
  }

  // Parties déjà retenues pour un AUTRE match.
  const { data: taken } = await db.from('chesscom_games').select('game_url').neq('match_id', m.id)
  const detection = detectGames(games, {
    whiteUsername: white.chesscom_username,
    blackUsername: black.chesscom_username,
    windowStart,
    windowEnd,
    timeClasses: t!.chesscom_time_classes,
    ratedOnly: t!.chesscom_rated_only,
    alreadyLinked: new Set((taken ?? []).map((g) => g.game_url)),
  })

  // Remplace les candidates non liées de ce match par le résultat de la nouvelle recherche.
  const { data: previous } = await db.from('chesscom_games').select('id, game_url, confidence').eq('match_id', m.id)
  const keep = new Set(m.chesscom_game_id ? [m.chesscom_game_id] : [])
  const stale = (previous ?? []).filter((g) => !keep.has(g.id)).map((g) => g.id)
  if (stale.length) await db.from('chesscom_games').delete().in('id', stale)
  const linkedUrl = (previous ?? []).find((g) => keep.has(g.id))?.game_url

  const rows = detection.candidates
    .filter((c) => c.game.url !== linkedUrl)
    .map((c) => ({
      tournament_id: m.tournament_id,
      match_id: m.id,
      game_url: c.game.url,
      game_uuid: c.game.uuid ?? null,
      end_time: new Date(c.game.end_time * 1000).toISOString(),
      time_class: c.game.time_class,
      time_control: c.game.time_control ?? null,
      rated: c.game.rated ?? null,
      white_username: c.game.white.username,
      black_username: c.game.black.username,
      white_rating: c.game.white.rating ?? null,
      black_rating: c.game.black.rating ?? null,
      white_result: c.game.white.result,
      black_result: c.game.black.result,
      result_for_match: c.resultForMatch,
      colors_match: c.colorsMatch,
      time_class_ok: c.timeClassOk,
      confidence: detection.confidence!,
      uncertainty_reason: detection.reason,
      eco: c.game.eco ?? null,
      accuracies: c.game.accuracies ?? null,
    }))
  if (rows.length) {
    const { error } = await db.from('chesscom_games').insert(rows)
    if (error) throw new HttpError(500, error.message)
  }

  // Notification : nouvelle partie certaine sur un match encore à jouer.
  const wasCertain = (previous ?? []).some((g) => g.confidence === 'certain')
  if (detection.confidence === 'certain' && !wasCertain && m.status === 'scheduled') {
    for (const p of parts ?? []) {
      await db.from('notifications').insert({
        profile_id: p.profile_id,
        type: 'game_detected',
        title: 'Partie trouvée sur Chess.com',
        body: `${white.display_name} – ${black.display_name} : acceptez le résultat proposé ou déclarez-le.`,
        link: `/matchs/${m.id}`,
      })
    }
  }
  return { status: detection.confidence ?? 'none', reason: detection.reason, candidates: detection.candidates.length }
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('Authorization') ?? ''
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: auth } = await asUser.auth.getUser()
    if (!auth.user) throw new HttpError(401, 'Connexion requise')
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: me } = await db.from('profiles').select('id, role, is_active').eq('id', auth.user.id).single()
    if (!me?.is_active) throw new HttpError(403, 'Compte suspendu')
    const isAdmin = me.role === 'admin'

    const body = await req.json().catch(() => ({}))
    switch (body.action) {
      case 'set-username':
        return json(await setUsername(db, me.id, isAdmin, body.profile_id ?? me.id, String(body.username ?? '')))

      case 'sync-profile': {
        const target = body.profile_id ?? me.id
        // Tout connecté peut rafraîchir un profil (données publiques), au plus 1 fois / 24 h hors admin.
        return json(await syncProfile(db, target, isAdmin && !!body.force))
      }

      case 'detect-match': {
        const m = await loadMatch(db, String(body.match_id))
        if (!m) throw new HttpError(404, 'Match introuvable')
        if (!isAdmin) {
          const { data: mine } = await db
            .from('participants')
            .select('id')
            .in('id', [m.white_id, m.black_id])
            .eq('profile_id', me.id)
          if (!mine?.length) throw new HttpError(403, 'Seuls les joueurs du match peuvent lancer la recherche')
          if (m.chesscom_checked_at && Date.now() - new Date(m.chesscom_checked_at).getTime() < DETECT_COOLDOWN_MS) {
            return json({ status: 'cooldown' })
          }
        }
        return json(await detectMatch(db, m))
      }

      case 'sync-week': {
        if (!isAdmin) throw new HttpError(403, 'Action réservée à l’administrateur')
        const { data: matches } = await db
          .from('matches')
          .select('id, rounds!inner(week_id)')
          .eq('rounds.week_id', String(body.week_id))
          .in('status', ['scheduled', 'pending', 'disputed', 'unplayed', 'validated'])
          .is('chesscom_game_id', null)
        const summary: Record<string, number> = {}
        for (const row of matches ?? []) {
          const m = await loadMatch(db, row.id)
          if (!m) continue
          const r = await detectMatch(db, m)
          summary[r.status] = (summary[r.status] ?? 0) + 1
        }
        return json({ status: 'ok', summary })
      }

      default:
        throw new HttpError(400, 'Action inconnue')
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    return json({ error: (e as Error).message }, status)
  }
})
