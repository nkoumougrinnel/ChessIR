/**
 * Captures d'écran de l'application (base LOCALE uniquement) pour la vidéo.
 *
 * Histoire suivie : Marie Kamga, du tirage de la semaine à sa distinction.
 * Le script met la base locale dans l'état voulu pour chaque plan, puis la
 * remet EXACTEMENT comme avant (copie de sauvegarde des tables touchées).
 *
 * Prérequis : Supabase local démarré, application lancée (`npx vite --port 5180` à la racine).
 *   npm run capture
 */
import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const APP = process.env.APP_URL ?? 'http://localhost:5180'
const ROOT = new URL('../..', import.meta.url).pathname
const OUT = new URL('../public/captures/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const status = JSON.parse(execSync('npx supabase status -o json', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString())
if (!/127\.0\.0\.1|localhost/.test(status.API_URL)) throw new Error('Base locale uniquement')
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } })

/** SQL direct sur la base locale (conteneur Docker du projet). */
function sql(query) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_chess-ir', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A'], {
    input: query,
  }).toString()
}

async function as(email) {
  const c = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'chessir-demo' })
  if (error) throw new Error(`${email} : ${error.message}`)
  return { client: c, session: data.session }
}

/* ---------------------------------------------------------------- */
/* Sauvegarde / restauration                                         */
/* ---------------------------------------------------------------- */
const TABLES = ['weeks', 'matches', 'match_results', 'chesscom_games', 'match_challenges', 'player_achievements', 'standings_snapshots', 'notifications']
sql(`create schema if not exists video_bak;\n${TABLES.map((t) => `drop table if exists video_bak.${t}; create table video_bak.${t} as table public.${t};`).join('\n')}`)
function restore() {
  sql(`begin; set session_replication_role = replica;
${TABLES.map((t) => `delete from public.${t}; insert into public.${t} select * from video_bak.${t};`).join('\n')}
commit;`)
}

/* ---------------------------------------------------------------- */
/* Repères                                                           */
/* ---------------------------------------------------------------- */
const { data: profiles } = await admin.from('profiles').select('id, display_name')
const { data: parts } = await admin.from('participants').select('id, profile_id')
const { data: { users } } = await admin.auth.admin.listUsers()
const emailOf = (name) => users.find((u) => u.id === profiles.find((p) => p.display_name === name).id).email
const pidOf = (name) => parts.find((p) => p.profile_id === profiles.find((x) => x.display_name === name).id).id
const { data: allMatches } = await admin.from('matches').select('id, white_id, black_id, round_id')
const matchOf = (a, b) => allMatches.find((m) => [m.white_id, m.black_id].sort().join() === [pidOf(a), pidOf(b)].sort().join())
const { data: week } = await admin.from('weeks').select('id').eq('status', 'active').single()

const MARIE = emailOf('Marie Kamga')
const vsKevin = matchOf('Marie Kamga', 'Kevin Bilong') // ronde 1, gagné par Marie (partie Chess.com liée)
const vsAicha = matchOf('Marie Kamga', 'Aïcha Daouda') // ronde 2
const vsIbrahim = matchOf('Marie Kamga', 'Ibrahim Sali') // ronde 3, gagné par Marie
const aichaKevin = matchOf('Aïcha Daouda', 'Kevin Bilong') // le direct
const graceSandra = matchOf('Grace Nana', 'Sandra Tchami') // le défi en attente

const reset = (ids) =>
  sql(`set session_replication_role = replica;
update public.matches set status='scheduled', result=null, declared_result=null, declared_by=null, declared_at=null,
  validated_at=null, chesscom_game_id=null, declaration_source=null where id in (${ids.map((i) => `'${i}'`).join(',')});
delete from public.chesscom_games where match_id in (${ids.map((i) => `'${i}'`).join(',')});`)
const clearChallenges = () => sql(`delete from public.match_challenges; delete from public.notifications where type in ('challenge','live');`)

async function challenge(match, by, accept, minutesAgo = 0) {
  await (await as(emailOf(by))).client.rpc('challenge_match', { p_match: match.id })
  if (accept) {
    await (await as(emailOf(accept))).client.rpc('challenge_match', { p_match: match.id })
    sql(`update public.match_challenges set accepted_at = now() - interval '${minutesAgo} minutes' where match_id = '${match.id}';`)
  } else {
    // Défi lancé il y a 28 s : compte à rebours vers 4:32.
    sql(`update public.match_challenges set created_at = now() - interval '28 seconds', expires_at = now() + interval '272 seconds' where match_id = '${match.id}';`)
  }
}

/* ---------------------------------------------------------------- */
/* Prise de vue                                                      */
/* ---------------------------------------------------------------- */
const RECTS = {}
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars'],
})

async function screen(name, email, path, opts = {}) {
  const { session } = await as(email)
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.evaluateOnNewDocument((s) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify(s))
    localStorage.setItem('chessir-install-dismissed', '1')
    localStorage.setItem('chessir-push-later', String(Date.now()))
  }, session)
  // Entrée par une page neutre (évite l'ouverture automatique de l'Arène), puis navigation interne.
  await page.goto(`${APP}/classement`, { waitUntil: 'networkidle0' })
  if (path !== '/classement') {
    await page.evaluate((p) => {
      history.pushState({}, '', p)
      dispatchEvent(new PopStateEvent('popstate'))
    }, path)
  }
  await new Promise((r) => setTimeout(r, opts.wait ?? 2400))
  await page.addStyleTag({ content: 'a[aria-label="Espace administrateur"]{display:none!important}' })
  if (opts.before) await opts.before(page)
  await new Promise((r) => setTimeout(r, 500))
  await page.screenshot({ path: `${OUT}${name}.png` })
  // Position des éléments à animer (en points CSS, écran 390×844).
  if (opts.rects) {
    RECTS[name] = await page.evaluate((specs) => {
      const box = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }
      const byText = (sel, text, up) => {
        const el = [...document.querySelectorAll(sel)].find((e) => e.textContent?.includes(text))
        return up && el ? el.closest(up) : el
      }
      const out = {}
      for (const [k, spec] of Object.entries(specs)) {
        if (spec.all) out[k] = [...document.querySelectorAll(spec.all)].slice(0, spec.max ?? 20).map(box)
        else if (spec.text) out[k] = box(byText(spec.sel, spec.text, spec.up))
        else out[k] = box(document.querySelector(spec.sel))
      }
      return out
    }, opts.rects)
  }
  console.log('✓', name)
  await page.close()
}

try {
  // 1-2. Début de semaine : les trois matchs de Marie sont à jouer.
  restore()
  clearChallenges()
  reset([vsKevin.id, vsAicha.id, vsIbrahim.id])
  await screen('semaine', MARIE, '/matchs', { rects: { cartes: { all: 'main a[href^="/matchs/"]', max: 3 } } })

  // 3. Kevin défie Marie.
  await challenge(vsKevin, 'Kevin Bilong')
  await screen('defi', MARIE, '/', { rects: { jyvais: { sel: 'a', text: "J'y vais" } } })

  // 4. Fin de partie : victoire de Marie, retrouvée sur Chess.com.
  restore()
  clearChallenges()
  reset([vsAicha.id])
  await screen('victoire', MARIE, `/matchs/${vsKevin.id}`, {
    rects: { resultat: { sel: 'p', text: 'Victoire (pour vous)', up: '.card' }, partager: { sel: 'button[aria-label="Partager le résultat"]' } },
  })

  // 5-6. Aïcha et Kevin en direct ; Sandra a défié Grace.
  await challenge(aichaKevin, 'Aïcha Daouda', 'Kevin Bilong', 4)
  await challenge(graceSandra, 'Sandra Tchami')
  await screen('accueil-direct', MARIE, '/', { rects: { arene: { sel: 'nav a[href="/arene"] > span' } } })
  await screen('arene', MARIE, '/arene', { rects: { direct: { sel: 'article' }, defis: { sel: 'h2', text: 'Défis lancés', up: 'section' } } })

  // 7. Marie gagne aussi contre Aïcha : elle passe en tête.
  restore()
  clearChallenges()
  sql(`set session_replication_role = replica;
update public.matches set status='validated', result='white_win', declared_result='white_win', validated_at=now()
 where id='${vsAicha.id}' and white_id='${pidOf('Marie Kamga')}';
update public.matches set status='validated', result='black_win', declared_result='black_win', validated_at=now()
 where id='${vsAicha.id}' and black_id='${pidOf('Marie Kamga')}';`)
  await screen('classement', MARIE, '/classement', { rects: { lignes: { all: 'main li', max: 7 } } })

  // 8. Clôture de la semaine : distinctions.
  const paul = await as(emailOf('Paul Mbarga'))
  const { error } = await paul.client.rpc('close_week', { p_week: week.id })
  if (error) throw new Error('Clôture : ' + error.message)
  await screen('distinctions', MARIE, '/recompenses', { rects: { heros: { sel: 'h2', text: 'Champion', up: 'div' } } })
} finally {
  restore()
  sql('drop schema video_bak cascade;')
  console.log('Base locale remise dans son état initial.')
}

/* ---------------------------------------------------------------- */
/* Images de partage (avec la vraie adresse du site)                  */
/* ---------------------------------------------------------------- */
{
  const page = await browser.newPage()
  await page.goto(`${APP}/connexion`, { waitUntil: 'networkidle0' })
  const images = await page.evaluate(async () => {
    const m = await import('/src/lib/shareImage.ts')
    const toB64 = async (blob) => {
      const buf = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (const x of buf) s += String.fromCharCode(x)
      return btoa(s)
    }
    const url = 'https://chessir.vercel.app'
    return {
      resultat: await toB64(
        await m.renderMatchCard({
          kicker: 'Résultat',
          white: { name: 'Kevin Bilong', color: 'blue', chesscom: 'kevin_bilong' },
          black: { name: 'Marie Kamga', color: 'rose', chesscom: 'marie_kamga' },
          when: 'Semaine 1 · Ronde 1',
          result: 'black_win',
          url,
        }),
      ),
      direct: await toB64(
        await m.renderMatchCard({
          kicker: 'Arène',
          white: { name: 'Aïcha Daouda', color: 'orange', chesscom: 'aicha_d' },
          black: { name: 'Kevin Bilong', color: 'blue', chesscom: 'kevin_bilong' },
          when: 'Semaine 1 · Ronde 3',
          live: true,
          url,
        }),
      ),
    }
  })
  for (const [k, v] of Object.entries(images)) {
    writeFileSync(`${OUT}partage-${k}.png`, Buffer.from(v, 'base64'))
    console.log('✓ partage-' + k)
  }
  await page.close()
}

writeFileSync(new URL('../src/rects.json', import.meta.url), JSON.stringify(RECTS, null, 2))
console.log('✓ positions des éléments → src/rects.json')
await browser.close()
