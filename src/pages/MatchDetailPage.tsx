import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ExternalLink,
  Handshake,
  Megaphone,
  ShieldCheck,
  Swords,
  Trophy,
  X,
  Check,
  Undo2,
  AlertTriangle,
  Clock,
  ScrollText,
  Share2,
} from 'lucide-react'
import { useAuth } from '../state/auth'
import { useChampionship } from '../state/championship'
import * as api from '../lib/api'
import type { MatchLog, MatchResult } from '../lib/types'
import {
  chessComChallenge,
  chessComProfile,
  dayName,
  ddmm,
  outcomeFor,
  OUTCOME_LABEL,
  relativeTime,
  resultFor,
  STATUS_LONG,
  type Outcome,
} from '../lib/format'
import { ChesscomMatchBlock, DeclarationMismatch } from '../components/chesscom'
import { useShareActions } from '../hooks/useShareActions'
import { Avatar, EmptyState, ErrorBox, PageHeader, PageLoader, PieceColor, Spinner, StatusBadge, cx, useToast } from '../components/ui'

const OPTIONS: Array<{ value: Outcome; title: string; sub: string; icon: typeof Trophy; style: string }> = [
  { value: 'win', title: 'Victoire', sub: '+3 points', icon: Trophy, style: 'border-win/60 bg-win/10 text-win' },
  { value: 'draw', title: 'Match nul', sub: '+1 point chacun', icon: Handshake, style: 'border-draw/60 bg-draw/10 text-draw' },
  { value: 'loss', title: 'Défaite', sub: '+0 point', icon: X, style: 'border-loss/60 bg-loss/10 text-loss' },
]

export default function MatchDetailPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const { loading, matches, roundById, weekById, participantById, profileOf, nameOf, reload } = useChampionship()
  const [log, setLog] = useState<MatchLog[]>([])
  const [choice, setChoice] = useState<Outcome | null>(null)
  const [contesting, setContesting] = useState(false)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast, toastNode } = useToast()
  const shareActions = useShareActions()

  const match = matches.find((m) => m.id === id)

  useEffect(() => {
    if (!id) return
    api.fetchMatchLog(id).then(setLog).catch(() => setLog([]))
  }, [id, match?.status, match?.result])

  if (loading) return <PageLoader />
  if (!match) {
    return (
      <>
        <PageHeader title="Match" back />
        <EmptyState icon={Swords} title="Match introuvable" />
      </>
    )
  }

  const round = roundById.get(match.round_id)!
  const week = weekById.get(round.week_id)!
  const white = participantById.get(match.white_id)!
  const black = participantById.get(match.black_id)!
  const myColor: 'white' | 'black' | null =
    white.profile_id === profile?.id ? 'white' : black.profile_id === profile?.id ? 'black' : null
  const opponentId = myColor === 'white' ? match.black_id : match.white_id
  const opponent = profileOf(opponentId)
  const declaredByMe = match.declared_by === profile?.id
  const weekOpen = week.status === 'active'

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await reload()
      toast(success)
      setChoice(null)
      setContesting(false)
      setComment('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const announce = () => shareActions.match(match)

  const resultText = (r: MatchResult) =>
    myColor ? OUTCOME_LABEL[outcomeFor(r, myColor)] + ' (pour vous)' : r === 'draw' ? 'Match nul' : `Victoire de ${nameOf(r === 'white_win' ? match.white_id : match.black_id)}`

  return (
    <>
      <PageHeader title={myColor ? 'Mon match' : 'Match'} back />
      {toastNode}

      <div className="space-y-4">
        {/* Face-à-face */}
        <div className="card relative overflow-hidden px-4 py-5 animate-rise">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_47%,rgba(245,184,61,0.5)_50%,transparent_53%)] opacity-40"
          />
          <p className="relative mb-4 text-center text-[13px] text-muted">
            Semaine {week.number} · {dayName(round.play_date)} {ddmm(round.play_date)} · Ronde {round.number}
          </p>
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <PlayerSide participantId={match.white_id} color="white" isMe={myColor === 'white'} />
            <span className="font-display text-[20px] font-bold text-gold-300">VS</span>
            <PlayerSide participantId={match.black_id} color="black" isMe={myColor === 'black'} />
          </div>
          <div className="relative mt-4 flex justify-center">
            <StatusBadge status={match.status} />
          </div>
        </div>

        {/* Raccourcis Chess.com */}
        {myColor && match.status === 'scheduled' && (
          <div className="grid grid-cols-2 gap-3">
            {opponent?.chesscom_username ? (
              <a
                href={chessComChallenge(opponent.chesscom_username)}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost whitespace-nowrap px-3 text-[14px]"
              >
                <ExternalLink size={16} /> Défier sur Chess.com
              </a>
            ) : (
              <span className="btn-ghost pointer-events-none text-[13px] opacity-60">Pseudo Chess.com manquant</span>
            )}
            <button onClick={announce} className="btn-ghost whitespace-nowrap px-3 text-[14px]">
              <Megaphone size={16} /> Annoncer au groupe
            </button>
          </div>
        )}

        <ErrorBox>{error}</ErrorBox>

        {match.status === 'validated' && match.result && (
          <div className="card flex items-center gap-3 border-win/30 px-4 py-4">
            <Trophy size={26} className="text-gold-400" />
            <div>
              <p className="font-display text-[19px] font-semibold">{resultText(match.result)}</p>
              <p className="text-[13px] text-muted">Résultat officiel, intégré au classement.</p>
            </div>
            <button
              onClick={announce}
              className="ml-auto grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-gold-300 hover:bg-white/10"
              aria-label="Partager le résultat"
              title="Partager le résultat"
            >
              <Share2 size={18} />
            </button>
          </div>
        )}

        {/* Partie Chess.com : détection, proposition, partie liée */}
        <ChesscomMatchBlock match={match} myColor={myColor} weekOpen={weekOpen} />

        {/* Déclaration */}
        {myColor && match.status === 'scheduled' && weekOpen && (
          <section className="space-y-2.5 animate-rise">
            <h2 className="section-title text-ink">Déclarer le résultat</h2>
            {OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setChoice(o.value)}
                aria-pressed={choice === o.value}
                className={cx(
                  'card flex w-full items-center gap-4 px-4 py-3.5 text-left transition-all duration-150',
                  choice === o.value ? cx('border-2', o.style) : 'hover:border-white/15',
                )}
              >
                <o.icon size={30} className={choice === o.value ? '' : 'text-muted'} />
                <span>
                  <span className="block font-display text-[19px] font-semibold text-ink">{o.title}</span>
                  <span className="text-[13px] text-muted">{o.sub}</span>
                </span>
              </button>
            ))}
            <button
              className="btn-gold mt-2 w-full"
              disabled={!choice || busy}
              onClick={() =>
                run(() => api.declareResult(match.id, resultFor(choice!, myColor)), 'Résultat envoyé à votre adversaire')
              }
            >
              {busy ? <Spinner className="text-night-950" /> : 'Confirmer'}
            </button>
            <p className="flex items-center justify-center gap-2 text-center text-[12px] text-faint">
              <ShieldCheck size={15} className="text-gold-400" /> Le résultat sera envoyé pour confirmation à votre
              adversaire.
            </p>
          </section>
        )}

        {myColor && match.status === 'scheduled' && !weekOpen && (
          <div className="card px-4 py-3.5 text-[14px] text-muted">
            La semaine est clôturée. Contactez l'administrateur pour régulariser ce match.
          </div>
        )}

        {/* En attente : déclaré par moi */}
        {match.status === 'pending' && declaredByMe && (
          <div className="card space-y-3 px-4 py-4">
            <p className="flex items-start gap-2 text-[15px]">
              <Clock size={18} className="mt-0.5 shrink-0 text-[#b3a9ff]" />
              <span>
                Vous avez déclaré : <strong>{resultText(match.declared_result!)}</strong>
              </span>
            </p>
            <p className="text-[13px] text-muted">En attente de la confirmation de votre adversaire ({opponent?.display_name})</p>
            <button
              className="btn-ghost w-full text-[15px]"
              disabled={busy}
              onClick={() => run(() => api.withdrawDeclaration(match.id), 'Déclaration retirée')}
            >
              <Undo2 size={17} /> Retirer ma déclaration
            </button>
          </div>
        )}

        {/* En attente : à confirmer par moi */}
        {match.status === 'pending' && myColor && !declaredByMe && (
          <div className="card space-y-3 border-violet/50 px-4 py-4 animate-rise">
            <p className="text-[15px]">
              {opponent?.display_name} a déclaré : <strong>{resultText(match.declared_result!)}</strong>
              {match.declaration_source === 'chesscom' && (
                <span className="ml-1 text-[12px] text-win">(d'après la partie Chess.com)</span>
              )}
            </p>
            <DeclarationMismatch match={match} />
            {!contesting ? (
              <div className="grid grid-cols-2 gap-3">
                <button className="btn-danger text-[16px]" disabled={busy} onClick={() => setContesting(true)}>
                  <AlertTriangle size={17} /> Contester
                </button>
                <button
                  className="btn-gold text-[16px]"
                  disabled={busy}
                  onClick={() => run(() => api.respondResult(match.id, true), 'Résultat validé !')}
                >
                  <Check size={18} /> Confirmer
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="label" htmlFor="contest">
                  Pourquoi contestez-vous ce résultat ?
                </label>
                <textarea
                  id="contest"
                  className="input min-h-24"
                  maxLength={500}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="ex. j'ai gagné au temps, déconnexion…"
                />
                <div className="grid grid-cols-2 gap-3">
                  <button className="btn-ghost text-[16px]" onClick={() => setContesting(false)}>
                    Annuler
                  </button>
                  <button
                    className="btn-danger text-[16px]"
                    disabled={busy || comment.trim().length < 3}
                    onClick={() => run(() => api.respondResult(match.id, false, comment.trim()), 'Contestation envoyée')}
                  >
                    Envoyer
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {match.status === 'pending' && !myColor && (
          <div className="card px-4 py-3.5 text-[14px] text-muted">{STATUS_LONG.pending}.</div>
        )}

        {match.status === 'disputed' && (
          <div className="card flex items-start gap-3 border-loss/40 px-4 py-3.5 text-[14px]">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-loss" />
            <p>Résultat contesté. L'administrateur va examiner la situation et arbitrer.</p>
          </div>
        )}

        {match.status === 'unplayed' && (
          <div className="card px-4 py-3.5 text-[14px] text-muted">
            Match non joué : aucun point attribué. Une situation particulière ? Contactez l'administrateur.
          </div>
        )}

        {/* Journal */}
        {log.length > 0 && (
          <section>
            <h2 className="mb-2 flex items-center gap-2 font-display text-[16px] font-semibold text-muted">
              <ScrollText size={17} /> Historique du résultat
            </h2>
            <ol className="card divide-y divide-white/[0.06]">
              {log.map((l) => (
                <li key={l.id} className="px-4 py-2.5 text-[13px]">
                  <span className="text-ink">{logLabel(l, (pid) => pidName(pid))}</span>
                  {l.comment && l.action !== 'link_game' && <span className="block text-muted">« {l.comment} »</span>}
                  <span className="block text-[11px] text-faint">{relativeTime(l.created_at)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  )

  function pidName(profileId: string | null) {
    if (!profileId) return 'Système'
    if (profileId === white.profile_id) return nameOf(white.id)
    if (profileId === black.profile_id) return nameOf(black.id)
    return 'Administrateur'
  }
}

function logLabel(l: MatchLog, who: (id: string | null) => string) {
  const r = l.result ? (l.result === 'draw' ? 'match nul' : l.result === 'white_win' ? 'victoire des Blancs' : 'victoire des Noirs') : ''
  switch (l.action) {
    case 'declare':
      return `${who(l.actor_id)} déclare : ${r}`
    case 'confirm':
      return `${who(l.actor_id)} confirme`
    case 'contest':
      return `${who(l.actor_id)} conteste`
    case 'admin_set':
      return `Arbitrage : ${r}`
    case 'admin_unplayed':
      return 'Déclaré non joué'
    case 'admin_reset':
      return l.comment?.startsWith('Déclaration retirée') ? `${who(l.actor_id)} retire sa déclaration` : 'Remis « à jouer »'
    case 'detect':
      return 'Partie détectée sur Chess.com'
    case 'link_game':
      return l.comment?.startsWith('Résultat repris') ? 'Partie Chess.com associée à la déclaration' : 'Partie Chess.com liée par l’administrateur'
    case 'unlink_game':
      return 'Partie Chess.com déliée par l’administrateur'
  }
}

function PlayerSide({ participantId, color, isMe }: { participantId: string; color: 'white' | 'black'; isMe: boolean }) {
  const { profileOf, avatarOf } = useChampionship()
  const p = profileOf(participantId)
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <Link to={`/joueurs/${participantId}`} className="flex min-w-0 max-w-full flex-col items-center gap-2">
        <Avatar name={p?.display_name ?? '?'} color={p?.avatar_color} size={64} ring={isMe} src={avatarOf(p?.id)} />
        <span className="max-w-full truncate font-display text-[18px] font-semibold">{isMe ? 'Vous' : p?.display_name}</span>
      </Link>
      <PieceColor color={color} label />
      {p?.chesscom_username && (
        <a
          href={chessComProfile(p.chesscom_username)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1 truncate text-[12px] text-[#8fa8ff] hover:underline"
        >
          @{p.chesscom_username} <ExternalLink size={11} />
        </a>
      )}
    </div>
  )
}
