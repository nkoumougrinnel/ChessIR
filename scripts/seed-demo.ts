/**
 * Jeu de données de DÉMONSTRATION (jamais en production).
 *
 * Crée 1 admin + 12 joueurs, un championnat, puis simule 2 semaines clôturées et
 * une semaine en cours partiellement jouée — en passant par les vraies fonctions
 * serveur (tirage, déclarations, confirmations, contestation, clôture).
 *
 *   npx supabase start && npm run seed:demo
 *
 * Par sécurité, le script refuse une URL non locale sauf avec --force.
 * Comptes : admin@demo.chessir / joueurNN@demo.chessir — mot de passe : chessir-demo
 */
import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { generateWeekDraw } from '../src/lib/pairing'

const PASSWORD = 'chessir-demo'
const PLAYERS: Array<[string, string, number | null, string]> = [
  ['Nkoumou T.J.G.', 'nkoumou_ir', 798, 'violet'],
  ['Ateba C.', 'ateba_c', 920, 'blue'],
  ['Bachirou O.', 'bachirou_o', 650, 'emerald'],
  ['Dibo N.', 'dibo_n', 1150, 'gold'],
  ['Sanama A.', 'sanama_a', null, 'rose'],
  ['Rabbiyatou', 'rabbiyatou', 400, 'cyan'],
  ['Omarou B.', 'omarou_b', 0, 'orange'],
  ['Ngoumba L.', 'ngoumba_l', 1020, 'slate'],
  ['Fadimatou K.', 'fadimatou_k', 520, 'violet'],
  ['Essomba P.', 'essomba_p', null, 'blue'],
  ['Mbarga S.', 'mbarga_s', 870, 'emerald'],
  ['Hamadou Y.', 'hamadou_y', 300, 'gold'],
]

function readEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY ?? '', service: process.env.SUPABASE_SERVICE_ROLE_KEY }
  }
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const env = Object.fromEntries(
    out.split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m![1], m![2]]),
  )
  return { url: env.API_URL, anon: env.ANON_KEY, service: env.SERVICE_ROLE_KEY }
}

const { url, anon, service: serviceKey } = readEnv()
if (!/127\.0\.0\.1|localhost/.test(url) && !process.argv.includes('--force')) {
  console.error(`Refus : ${url} n'est pas une instance locale. Ajoutez --force pour un projet de démonstration dédié.`)
  process.exit(1)
}
if (!anon) {
  console.error('SUPABASE_ANON_KEY manquante.')
  process.exit(1)
}

const service = createClient(url, serviceKey, { auth: { persistSession: false } })

let seed = 2026
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}

async function call(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}

async function user(email: string, name: string, chess: string | null): Promise<{ id: string; client: SupabaseClient }> {
  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 })
  let id = list.users.find((u) => u.email === email)?.id
  if (!id) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: name, chesscom_username: chess },
    })
    if (error) throw error
    id = data.user.id
  }
  const client = createClient(url, anon, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return { id, client }
}

function mondayWeeksAgo(n: number) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * n)
  return d.toISOString().slice(0, 10)
}

async function main() {
  console.log('→ Comptes de démonstration')
  const adminU = await user('admin@demo.chessir', 'Admin Chess IR', null)
  await service.from('profiles').update({ role: 'admin' }).eq('id', adminU.id)

  const players: Array<{ id: string; client: SupabaseClient; elo: number | null }> = []
  for (const [i, [name, chess, elo, color]] of PLAYERS.entries()) {
    const u = await user(`joueur${String(i + 1).padStart(2, '0')}@demo.chessir`, name, chess)
    await service.from('profiles').update({ declared_elo: elo, avatar_color: color, display_name: name }).eq('id', u.id)
    players.push({ ...u, elo })
  }

  console.log('→ Championnat')
  const { error: delError } = await service.from('tournaments').delete().in('status', ['draft', 'active'])
  if (delError) throw delError
  const tournamentId = (await call(adminU.client, 'create_tournament', { p_name: 'Championnat de la classe IR', p_bye_points: 1 })) as string
  const participantOf = new Map<string, string>()
  for (const p of players) {
    participantOf.set(p.id, (await call(adminU.client, 'add_participant', { p_tournament: tournamentId, p_profile: p.id })) as string)
  }
  const clientOfParticipant = new Map([...participantOf].map(([profileId, pid]) => [pid, players.find((p) => p.id === profileId)!]))
  await call(adminU.client, 'start_tournament', { p_tournament: tournamentId })

  for (let w = 0; w < 3; w++) {
    const startDate = mondayWeeksAgo(2 - w)
    console.log(`→ Semaine ${w + 1} (${startDate})`)
    const { data: st } = await service.from('standings').select('*').eq('tournament_id', tournamentId)
    const { data: past } = await service.from('matches').select('white_id, black_id, status').eq('tournament_id', tournamentId)
    const { data: byes } = await service.from('byes').select('participant_id, rounds!inner(week_id, weeks!inner(tournament_id))')
    const draw = generateWeekDraw(
      st!.map((s) => ({ id: s.participant_id, points: s.points, rank: s.rank })),
      {
        games: past!.filter((m) => m.status !== 'unplayed').map((m) => ({ white: m.white_id, black: m.black_id })),
        byes: (byes ?? []).map((b) => b.participant_id),
      },
      { random: w === 0, seed: 100 + w },
    )
    const weekId = (await call(adminU.client, 'publish_week', {
      p_tournament: tournamentId,
      p_start_date: startDate,
      p_draw: { rounds: draw.rounds },
    })) as string

    const { data: matches } = await service
      .from('matches')
      .select('id, white_id, black_id, rounds!inner(week_id, number)')
      .eq('rounds.week_id', weekId)
    const current = w === 2
    for (const m of matches!) {
      const round = (m.rounds as unknown as { number: number }).number
      if (current && round >= 2) continue // semaine en cours : rondes 2 et 3 à jouer
      const white = clientOfParticipant.get(m.white_id)!
      const black = clientOfParticipant.get(m.black_id)!
      if (!current && rand() < 0.06) continue // quelques matchs non joués
      // Le joueur à l'Elo le plus élevé gagne plus souvent, mais pas toujours.
      const ew = white.elo ?? 500
      const eb = black.elo ?? 500
      const pWhite = 1 / (1 + 10 ** ((eb - ew) / 400))
      const r = rand()
      const result = r < 0.12 ? 'draw' : r < 0.12 + pWhite * 0.88 ? 'white_win' : 'black_win'
      const declarer = rand() < 0.5 ? white : black
      const other = declarer === white ? black : white
      await call(declarer.client, 'declare_result', { p_match: m.id, p_result: result })
      if (current && rand() < 0.4) continue // en attente de confirmation
      if (!current && rand() < 0.08) {
        await call(other.client, 'respond_result', { p_match: m.id, p_accept: false, p_comment: 'Je pense avoir gagné au temps.' })
        await call(adminU.client, 'admin_resolve_match', {
          p_match: m.id,
          p_action: 'set',
          p_result: result,
          p_comment: 'Vérifié sur l’historique Chess.com',
        })
      } else {
        await call(other.client, 'respond_result', { p_match: m.id, p_accept: true })
      }
    }
    if (!current) await call(adminU.client, 'close_week', { p_week: weekId })
  }

  console.log('\n✓ Données de démonstration prêtes.')
  console.log(`  Admin   : admin@demo.chessir / ${PASSWORD}`)
  console.log(`  Joueurs : joueur01@demo.chessir … joueur12@demo.chessir / ${PASSWORD}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
