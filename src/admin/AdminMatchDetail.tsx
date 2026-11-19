import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ExternalLink, Gavel, Link2, Link2Off, RefreshCw } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { admin, chesscom, fetchMatchLog } from '../lib/api'
import { TIME_CLASS_LABEL } from '../components/chesscom'
import type { MatchLog, MatchResult } from '../lib/types'
import { ErrorBox, PageHeader, PageLoader, PieceColor, Spinner, StatusBadge, cx, useToast } from '../components/ui'
import { AdminCard } from './AdminLayout'
import { dayName, ddmm, relativeTime } from '../lib/format'

type Decision = MatchResult | 'unplayed' | 'reset'

export default function AdminMatchDetail() {
  const { id } = useParams()
  const { loading, matches, roundById, weekById, participantById, nameOf, profiles, reload, gamesOfMatch } = useChampionship()
  const [log, setLog] = useState<MatchLog[]>([])
  const [decision, setDecision] = useState<Decision | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast, toastNode } = useToast()
  const match = matches.find((m) => m.id === id)

  useEffect(() => {
    if (id) fetchMatchLog(id).then(setLog).catch(() => setLog([]))
  }, [id, match?.status, match?.result])

  if (loading) return <PageLoader />
  if (!match) return <p className="card px-4 py-4 text-muted">Match introuvable.</p>

  const round = roundById.get(match.round_id)!
  const week = weekById.get(round.week_id)!
  const W = nameOf(match.white_id)
  const B = nameOf(match.black_id)
  const resultName = (r: MatchResult | null) => (r === 'white_win' ? `Victoire de ${W}` : r === 'black_win' ? `Victoire de ${B}` : r === 'draw' ? 'Match nul' : '—')
  const actor = (pid: string | null) => (pid ? profiles.get(pid)?.display_name ?? '?' : 'Système')

  const choices: Array<{ value: Decision; label: string }> = [
    { value: 'white_win', label: `Victoire de ${W} (Blancs)` },
    { value: 'black_win', label: `Victoire de ${B} (Noirs)` },
    { value: 'draw', label: 'Match nul' },
    { value: 'unplayed', label: 'Non joué (0 point chacun)' },
    { value: 'reset', label: 'Remettre « à jouer »' },
  ]

  async function link(gameId: string | null) {
    setBusy(true)
    setError(null)
    try {
      await admin.linkGame(match!.id, gameId, comment.trim())
      await reload()
      toast(gameId ? 'Partie liée' : 'Partie déliée')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!decision) return
    setBusy(true)
    setError(null)
    try {
      const action = decision === 'unplayed' || decision === 'reset' ? decision : 'set'
      await admin.resolveMatch(match!.id, action, action === 'set' ? (decision as MatchResult) : null, comment.trim())
      await reload()
      setDecision(null)
      setComment('')
      toast('Décision enregistrée')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {toastNode}
      <PageHeader title="Arbitrage" back />
      <AdminCard title={`Semaine ${week.number} · Ronde ${round.number} · ${dayName(round.play_date)} ${ddmm(round.play_date)}`}>
        <div className="flex flex-wrap items-center gap-3 text-[15px]">
          <PieceColor color="white" /> <span className="font-medium">{W}</span>
          <span className="text-faint">vs</span>
          <PieceColor color="black" /> <span className="font-medium">{B}</span>
          <StatusBadge status={match.status} className="ml-auto" />
        </div>
        <dl className="mt-3 grid gap-1 text-[13px]">
          <div>
            <dt className="inline text-faint">Résultat officiel : </dt>
            <dd className="inline">{resultName(match.result)}</dd>
          </div>
          {match.declared_result && (
            <div>
              <dt className="inline text-faint">Déclaration : </dt>
              <dd className="inline">
                {resultName(match.declared_result)} par {actor(match.declared_by)}
              </dd>
            </div>
          )}
          <div>
            <dt className="inline text-faint">Rangs au tirage : </dt>
            <dd className="inline">
              #{match.white_rank_at_draw ?? '—'} / #{match.black_rank_at_draw ?? '—'} · Elo{' '}
              {participantById.get(match.white_id)?.initial_elo ?? '—'} / {participantById.get(match.black_id)?.initial_elo ?? '—'}
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard
        title="Parties Chess.com"
        action={
          <button
            className="btn-ghost px-3 py-1.5 text-[13px]"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true)
                setError(null)
                try {
                  await chesscom({ action: 'detect-match', match_id: match!.id })
                  await reload()
                } catch (e) {
                  setError((e as Error).message)
                } finally {
                  setBusy(false)
                }
              })()
            }
          >
            <RefreshCw size={14} /> Rechercher
          </button>
        }
      >
        {gamesOfMatch(match.id).length === 0 ? (
          <p className="text-[13px] text-muted">
            Aucune partie trouvée{match.chesscom_checked_at && ` (dernière recherche ${relativeTime(match.chesscom_checked_at)})`}.
          </p>
        ) : (
          <ul className="space-y-2">
            {gamesOfMatch(match.id).map((g) => {
              const linked = g.id === match.chesscom_game_id
              return (
                <li key={g.id} className={cx('rounded-xl px-3 py-2.5 text-[13px]', linked ? 'border border-win/40 bg-win/[0.06]' : 'bg-white/[0.03]')}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{resultName(g.result_for_match)}</span>
                    <span className="text-muted">{new Date(g.end_time).toLocaleString('fr-FR')}</span>
                    <span className="text-muted">{TIME_CLASS_LABEL[g.time_class] ?? g.time_class}{g.rated === false && ' · amicale'}</span>
                    <span className={g.colors_match ? 'text-muted' : 'text-warn'}>
                      ⚪ {g.white_username} · ⚫ {g.black_username}
                    </span>
                    <span className={g.confidence === 'certain' ? 'text-win' : 'text-warn'}>
                      {g.confidence === 'certain' ? 'certaine' : g.uncertainty_reason ?? 'incertaine'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={g.game_url} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1 text-[13px]">
                      <ExternalLink size={13} /> Voir
                    </a>
                    <button
                      className="btn-ghost px-3 py-1 text-[13px]"
                      disabled={busy || comment.trim().length < 3}
                      title={comment.trim().length < 3 ? 'Saisissez un motif ci-dessous' : undefined}
                      onClick={() => void link(linked ? null : g.id)}
                    >
                      {linked ? <Link2Off size={13} /> : <Link2 size={13} />} {linked ? 'Délier' : 'Lier à ce match'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-2 text-[12px] text-faint">
          Lier une partie ne change pas le résultat : fixez-le si besoin avec une décision ci-dessous (même motif).
        </p>
      </AdminCard>

      <AdminCard title="Journal">
        {log.length === 0 ? (
          <p className="text-[13px] text-muted">Aucune action pour l'instant.</p>
        ) : (
          <ol className="space-y-2 text-[13px]">
            {log.map((l) => (
              <li key={l.id} className="rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="font-medium">{actor(l.actor_id)}</span> · {ACTION[l.action]}
                {l.result && ` : ${resultName(l.result)}`}
                {l.comment && <span className="block text-muted">« {l.comment} »</span>}
                <span className="block text-[11px] text-faint">
                  {new Date(l.created_at).toLocaleString('fr-FR')} ({relativeTime(l.created_at)})
                </span>
              </li>
            ))}
          </ol>
        )}
      </AdminCard>

      <AdminCard title="Décision de l'administrateur">
        <p className="mb-3 text-[13px] text-muted">
          À utiliser pour une contestation, un match non joué, une déconnexion ou une correction exceptionnelle. Le motif
          est conservé dans le journal et notifié aux deux joueurs.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map((c) => (
            <button
              key={c.value}
              onClick={() => setDecision(c.value)}
              className={cx(
                'rounded-xl border px-3 py-2.5 text-left text-[14px] transition',
                decision === c.value ? 'border-gold-400/70 bg-gold-400/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="label">Motif (obligatoire)</span>
          <textarea className="input min-h-20" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
        <button className="btn-gold mt-3" disabled={!decision || comment.trim().length < 3 || busy} onClick={apply}>
          {busy ? <Spinner className="text-night-950" /> : <Gavel size={17} />} Appliquer
        </button>
      </AdminCard>
    </div>
  )
}

const ACTION: Record<MatchLog['action'], string> = {
  declare: 'déclaration',
  confirm: 'confirmation',
  contest: 'contestation',
  admin_set: 'arbitrage',
  admin_unplayed: 'non joué',
  admin_reset: 'remise à jouer',
  detect: 'partie détectée',
  link_game: 'partie Chess.com liée',
  unlink_game: 'partie Chess.com déliée',
}
