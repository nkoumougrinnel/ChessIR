import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Coffee, Lock, RefreshCw, Send, ChevronDown, Sparkles, Share2 } from 'lucide-react'
import { useShareActions } from '../hooks/useShareActions'
import { useChampionship, useMatchViews } from '../state/championship'
import { admin, chesscom } from '../lib/api'
import { generateWeekDraw, type WeekDraw } from '../lib/pairing'
import type { Week } from '../lib/types'
import { ErrorBox, PageLoader, PieceColor, Spinner, StatusBadge, cx } from '../components/ui'
import { AdminCard } from './AdminLayout'
import { dayName, ddmm, nextMonday, parseDay, toIsoDay, weekLabel, weekRange, STATUS_LABEL } from '../lib/format'
import type { MatchStatus } from '../lib/types'

export default function AdminWeeks() {
  const { loading, tournament, activeWeek, weeks } = useChampionship()
  if (loading) return <PageLoader />
  if (!tournament || tournament.status !== 'active') {
    return (
      <p className="card px-4 py-4 text-[14px] text-muted">
        Le championnat doit être <Link to="/admin" className="text-gold-300 underline">démarré</Link> avant de générer un tirage.
      </p>
    )
  }
  return (
    <div className="space-y-4">
      {activeWeek ? <ActiveWeek week={activeWeek} /> : <NewDraw />}
      <PastWeeks weeks={weeks.filter((w) => w.status === 'closed')} />
    </div>
  )
}

/* --------------------------- Semaine en cours --------------------------- */

function ActiveWeek({ week }: { week: Week }) {
  const { reload, chesscomGames, nameOf, standings } = useChampionship()
  const shareActions = useShareActions()
  const [syncing, setSyncing] = useState(false)
  const [syncInfo, setSyncInfo] = useState<string | null>(null)
  const views = useMatchViews().filter((v) => v.week.id === week.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const count = (s: MatchStatus) => views.filter((v) => v.match.status === s).length
  const blocking = views.filter((v) => v.match.status === 'pending' || v.match.status === 'disputed')
  const scheduled = count('scheduled')
  // Parties trouvées sur Chess.com mais jamais déclarées : preuve utile avant la clôture.
  const detectedUndeclared = views.filter(
    (v) => v.match.status === 'scheduled' && chesscomGames.some((g) => g.match_id === v.match.id),
  )

  async function syncWeek() {
    setSyncing(true)
    setError(null)
    setSyncInfo(null)
    try {
      const r = await chesscom<{ summary: Record<string, number> }>({ action: 'sync-week', week_id: week.id })
      const s = r.summary ?? {}
      setSyncInfo(
        `${s.certain ?? 0} partie(s) certaine(s), ${s.uncertain ?? 0} incertaine(s), ${s.none ?? 0} sans partie, ${s.no_username ?? 0} sans pseudo.`,
      )
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  async function close() {
    const msg =
      `Clôturer la ${weekLabel(week.number)} ?` +
      (scheduled ? `\n\n${scheduled} match(s) jamais déclaré(s) seront marqués « non joué » (0 point, aucun vainqueur). Vous pourrez les corriger ensuite.` : '') +
      '\n\nLe classement sera figé pour la semaine et les distinctions attribuées.'
    if (!window.confirm(msg)) return
    setBusy(true)
    setError(null)
    try {
      await admin.closeWeek(week.id)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminCard title={`${weekLabel(week.number)} · en cours`}>
      <p className="mb-3 text-[13px] text-muted">{weekRange(week.start_date)} · tirage publié et verrouillé.</p>
      <div className="mb-4 grid grid-cols-5 gap-1.5 text-center">
        {(['scheduled', 'pending', 'validated', 'disputed', 'unplayed'] as MatchStatus[]).map((s) => (
          <div key={s} className="rounded-xl bg-white/[0.03] px-1 py-2">
            <p className="font-display text-[20px] leading-none font-bold">{count(s)}</p>
            <p className={cx('mt-1 truncate text-[10px] font-semibold', STATUS_TONE[s])}>{STATUS_LABEL[s]}</p>
          </div>
        ))}
      </div>
      <RoundsTable weekId={week.id} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-gold px-3 py-2 text-[14px]" onClick={() => shareActions.draw(week)}>
          <Share2 size={15} /> Partager le tirage
        </button>
        <button className="btn-ghost px-3 py-2 text-[14px]" onClick={() => shareActions.standings(standings, {})}>
          <Share2 size={15} /> Classement
        </button>
        <button className="btn-ghost px-3 py-2 text-[14px]" disabled={syncing} onClick={() => void syncWeek()}>
          {syncing ? <Spinner /> : <RefreshCw size={15} />} Synchroniser la semaine avec Chess.com
        </button>
        {syncInfo && <span className="text-[13px] text-muted">{syncInfo}</span>}
      </div>

      {detectedUndeclared.length > 0 && (
        <div className="mt-4 rounded-xl border border-[#8fa8ff]/30 bg-[#8fa8ff]/[0.06] px-4 py-3 text-[13px]">
          <p className="mb-1.5 flex items-center gap-2 font-semibold text-[#b9c8ff]">
            <Sparkles size={15} /> Parties trouvées sur Chess.com mais non déclarées
          </p>
          <ul className="space-y-1">
            {detectedUndeclared.map((v) => (
              <li key={v.match.id}>
                <Link to={`/admin/matchs/${v.match.id}`} className="underline">
                  R{v.round.number} — {nameOf(v.match.white_id)} vs {nameOf(v.match.black_id)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[12px] text-faint">
            Aucune validation automatique : à la clôture ces matchs passeront « non joué », sauf décision de votre part.
          </p>
        </div>
      )}

      {blocking.length > 0 && (
        <div className="mt-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[13px]">
          <p className="mb-1.5 flex items-center gap-2 font-semibold text-warn">
            <AlertTriangle size={16} /> À traiter avant la clôture
          </p>
          <ul className="space-y-1">
            {blocking.map((v) => (
              <li key={v.match.id}>
                <Link to={`/admin/matchs/${v.match.id}`} className="underline">
                  Ronde {v.round.number} — {v.match.status === 'disputed' ? 'contesté' : 'en attente de confirmation'}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <ErrorBox>{error}</ErrorBox>
      </div>
      <button className="btn-gold mt-3" disabled={busy || blocking.length > 0} onClick={close}>
        {busy ? <Spinner className="text-night-950" /> : <Lock size={17} />} Clôturer la semaine
      </button>
    </AdminCard>
  )
}

/* --------------------------- Nouveau tirage --------------------------- */

function NewDraw() {
  const { tournament, participants, standings, matches, byes, weeks, nameOf, reload } = useChampionship()
  const lastStart = weeks[0]?.start_date
  const minDate = lastStart ? addDays(lastStart, 7) : undefined
  const [startDate, setStartDate] = useState(() => {
    const n = nextMonday()
    return minDate && n < minDate ? minDate : n
  })
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isFirst = weeks.length === 0
  const active = participants.filter((p) => p.status === 'active')

  const draw = useMemo<{ draw?: WeekDraw; error?: string }>(() => {
    try {
      const rank = new Map(standings.map((s) => [s.participant_id, s]))
      const players = active.map((p) => ({
        id: p.id,
        points: rank.get(p.id)?.points ?? 0,
        rank: rank.get(p.id)?.rank ?? 999,
      }))
      const history = {
        // Un match non joué ne compte ni comme rencontre ni pour les couleurs.
        games: matches.filter((m) => m.status !== 'unplayed').map((m) => ({ white: m.white_id, black: m.black_id })),
        byes: byes.map((b) => b.participant_id),
      }
      return { draw: generateWeekDraw(players, history, { random: isFirst, seed }) }
    } catch (e) {
      return { error: (e as Error).message }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.length, standings, matches, byes, isFirst, seed])

  const isMonday = parseDay(startDate).getDay() === 1

  async function publish() {
    if (!draw.draw || !tournament) return
    if (!window.confirm(`Publier le tirage de la semaine ${weeks.length + 1} ?\n\nIl sera verrouillé et notifié à tous les participants.`)) return
    setBusy(true)
    setError(null)
    try {
      await admin.publishWeek(tournament.id, startDate, draw.draw)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminCard title={`Tirage de la ${weekLabel(weeks.length + 1)}`}>
      <p className="mb-3 text-[13px] text-muted">
        {isFirst
          ? 'Première semaine : les confrontations sont tirées au hasard.'
          : 'Appariement suisse : joueurs de score proche, sans répéter les adversaires déjà rencontrés, couleurs équilibrées.'}{' '}
        {active.length} participant(s) actif(s)
        {active.length % 2 === 1 && ` · nombre impair : un exempt par ronde (${tournament!.bye_points} pt)`}.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Lundi de la semaine</span>
          <input type="date" className="input w-auto" value={startDate} min={minDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <button className="btn-ghost text-[15px]" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>
          <RefreshCw size={16} /> Nouveau tirage
        </button>
      </div>
      {!isMonday && <ErrorBox>La date choisie doit être un lundi.</ErrorBox>}
      {draw.error && <ErrorBox>{draw.error}</ErrorBox>}

      {draw.draw && (
        <>
          {draw.draw.repeats.length > 0 && (
            <div className="mb-3 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[13px] text-warn">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={16} /> Répétitions inévitables avec ce nombre de joueurs :
              </p>
              <p className="mt-1">
                {draw.draw.repeats.map((r) => `${nameOf(r.a)} – ${nameOf(r.b)} (R${r.round})`).join(' · ')}
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {draw.draw.rounds.map((r) => (
              <div key={r.round} className="rounded-xl bg-white/[0.03] p-3">
                <p className="mb-2 font-display text-[16px] font-semibold text-gold-300">
                  {dayName(addDays(startDate, (r.round - 1) * 2))} · Ronde {r.round}
                </p>
                <ul className="space-y-1.5 text-[13px]">
                  {r.pairings.map((p) => (
                    <li key={p.white + p.black} className="flex items-center gap-1.5">
                      <PieceColor color="white" />
                      <span className="truncate">{nameOf(p.white)}</span>
                      <span className="text-faint">–</span>
                      <PieceColor color="black" />
                      <span className="truncate">{nameOf(p.black)}</span>
                    </li>
                  ))}
                  {r.bye && (
                    <li className="flex items-center gap-1.5 text-muted">
                      <Coffee size={13} /> Exempt : {nameOf(r.bye)}
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mt-4">
        <ErrorBox>{error}</ErrorBox>
      </div>
      <button className="btn-gold mt-3" disabled={busy || !draw.draw || !isMonday} onClick={publish}>
        {busy ? <Spinner className="text-night-950" /> : <Send size={17} />} Publier et verrouiller
      </button>
    </AdminCard>
  )
}

/* --------------------------- Historique --------------------------- */

function PastWeeks({ weeks }: { weeks: Week[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (weeks.length === 0) return null
  return (
    <AdminCard title="Semaines clôturées">
      <ul className="space-y-2">
        {weeks.map((w) => (
          <li key={w.id} className="rounded-xl bg-white/[0.03]">
            <button className="flex w-full items-center justify-between px-3 py-2.5 text-left" onClick={() => setOpen(open === w.id ? null : w.id)}>
              <span className="font-medium">
                {weekLabel(w.number)} <span className="text-[13px] text-muted">· {weekRange(w.start_date)}</span>
              </span>
              <ChevronDown size={18} className={cx('transition-transform', open === w.id && 'rotate-180')} />
            </button>
            {open === w.id && (
              <div className="px-3 pb-3">
                <RoundsTable weekId={w.id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </AdminCard>
  )
}

function RoundsTable({ weekId }: { weekId: string }) {
  const { rounds, byes, nameOf } = useChampionship()
  const views = useMatchViews().filter((v) => v.week.id === weekId)
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {rounds
        .filter((r) => r.week_id === weekId)
        .map((r) => {
          const bye = byes.find((b) => b.round_id === r.id)
          return (
            <div key={r.id} className="rounded-xl bg-white/[0.03] p-3">
              <p className="mb-2 text-[13px] font-semibold text-gold-300">
                {dayName(r.play_date)} {ddmm(r.play_date)} · R{r.number}
              </p>
              <ul className="space-y-1.5 text-[12px]">
                {views
                  .filter((v) => v.round.id === r.id)
                  .map((v) => (
                    <li key={v.match.id}>
                      <Link to={`/admin/matchs/${v.match.id}`} className="flex items-center gap-1.5 hover:underline">
                        <span className="min-w-0 flex-1 truncate">
                          {nameOf(v.match.white_id)} – {nameOf(v.match.black_id)}
                        </span>
                        <StatusBadge status={v.match.status} className="px-1.5 text-[10px]" />
                      </Link>
                    </li>
                  ))}
                {bye && (
                  <li className="flex items-center gap-1.5 text-muted">
                    <Coffee size={12} /> {nameOf(bye.participant_id)} ({bye.points} pt)
                  </li>
                )}
              </ul>
            </div>
          )
        })}
    </div>
  )
}

const STATUS_TONE: Record<MatchStatus, string> = {
  scheduled: 'text-gold-300',
  pending: 'text-[#b3a9ff]',
  validated: 'text-win',
  disputed: 'text-loss',
  unplayed: 'text-muted',
}

function addDays(iso: string, n: number) {
  const d = parseDay(iso)
  d.setDate(d.getDate() + n)
  return toIsoDay(d)
}
