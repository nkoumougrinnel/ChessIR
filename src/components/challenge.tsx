import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ExternalLink, Radio, Swords, X } from 'lucide-react'
import * as api from '../lib/api'
import { chessComChallenge } from '../lib/format'
import type { Match, MatchChallenge } from '../lib/types'
import { useAuth } from '../state/auth'
import { useChampionship } from '../state/championship'
import { Avatar, cx } from './ui'

/**
 * Défi en deux temps.
 * 1. « Défier » : ouvre Chess.com et prévient l'adversaire (5 minutes pour répondre).
 * 2. L'adversaire appuie sur « J'y vais » dans le délai : Chess.com s'ouvre chez lui
 *    (vers le défieur, au cas où le défi Chess.com aurait déjà expiré) et le match
 *    passe « en direct » pour tout le monde.
 * Le bouton reste un vrai lien : Chess.com s'ouvre même si le réseau est lent ;
 * l'enregistrement du défi part en parallèle.
 */

export type ChallengeState = 'pending' | 'live'

export function challengeState(c: MatchChallenge | undefined, now: number): ChallengeState | null {
  if (!c || c.ended_at) return null
  if (c.accepted_at) return c.live_until && new Date(c.live_until).getTime() > now ? 'live' : null
  return new Date(c.expires_at).getTime() > now ? 'pending' : null
}

/** Horloge qui se met à jour (compte à rebours, « depuis 12 min »). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

export function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function liveSince(c: MatchChallenge, now: number) {
  const min = Math.max(0, Math.floor((now - new Date(c.accepted_at!).getTime()) / 60000))
  return min < 1 ? "à l'instant" : `depuis ${min} min`
}

/** Défi courant d'un match, vu par le joueur connecté. */
export function useMatchChallenge(match: Match) {
  const { challenges, me } = useChampionship()
  const now = useNow()
  const challenge = challenges.find((c) => c.match_id === match.id && challengeState(c, now) !== null)
  const state = challengeState(challenge, now)
  const mine = !!challenge && challenge.challenger_id === me?.id
  const remaining = challenge ? new Date(challenge.expires_at).getTime() - now : 0
  return { challenge, state, mine, remaining, now }
}

/** Bouton principal : Défier / J'y vais / Retour sur Chess.com. */
export function ChallengeButton({ match, className }: { match: Match; className?: string }) {
  const { me, profileOf, reload } = useChampionship()
  const { state, mine, remaining } = useMatchChallenge(match)
  const [error, setError] = useState<string | null>(null)
  const opponentId = match.white_id === me?.id ? match.black_id : match.white_id
  const opp = profileOf(opponentId)

  if (!opp?.chesscom_username) {
    return <span className={cx('btn-ghost pointer-events-none text-[12px] opacity-60', className)}>Pas de pseudo Chess.com</span>
  }

  const incoming = state === 'pending' && !mine
  const label =
    state === 'live' ? 'Sur Chess.com' : incoming ? `J'y vais · ${countdown(remaining)}` : state === 'pending' ? 'Rouvrir Chess.com' : 'Défier'

  return (
    <a
      href={chessComChallenge(opp.chesscom_username)}
      target="_blank"
      rel="noreferrer"
      title={error ?? undefined}
      onClick={() => {
        setError(null)
        // Pas d'appel quand le direct est déjà lancé : on retourne simplement sur Chess.com.
        if (state === 'live') return
        api
          .challengeMatch(match.id)
          .then(() => reload())
          .catch((e: Error) => setError(e.message))
      }}
      className={cx(
        'whitespace-nowrap px-3 text-[14px]',
        incoming ? 'btn-gold animate-pulse-soft' : 'btn-ghost',
        className,
      )}
    >
      {state === 'live' ? (
        <Radio size={16} className="shrink-0 text-loss" />
      ) : incoming ? (
        <Swords size={16} className="shrink-0" />
      ) : (
        <ExternalLink size={16} className="shrink-0" />
      )}
      {label}
    </a>
  )
}

/** Ligne d'état sous les boutons : défi envoyé, défi reçu, en direct (avec annulation). */
export function ChallengeStatus({ match, className }: { match: Match; className?: string }) {
  const { nameOf, reload } = useChampionship()
  const { challenge, state, mine, remaining, now } = useMatchChallenge(match)
  const [busy, setBusy] = useState(false)
  if (!challenge || !state) return null

  async function cancel() {
    setBusy(true)
    try {
      await api.cancelChallenge(match.id)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const text =
    state === 'live'
      ? `En direct ${liveSince(challenge, now)}`
      : mine
        ? `Défi envoyé : votre adversaire a ${countdown(remaining)} pour répondre`
        : `${nameOf(challenge.challenger_id)} vous défie : répondez dans ${countdown(remaining)}`

  return (
    <div
      className={cx(
        'flex items-center gap-2 rounded-xl px-3 py-2 text-[13px]',
        state === 'live' ? 'bg-loss/10 text-ink' : 'bg-gold-400/10 text-gold-200',
        className,
      )}
    >
      {state === 'live' ? <LiveDot /> : <Swords size={15} className="shrink-0 text-gold-300" />}
      <span className="min-w-0 flex-1">{text}</span>
      {(mine || state === 'live') && (
        <button
          onClick={() => void cancel()}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-white/5 hover:text-ink"
        >
          <X size={13} /> {state === 'live' ? 'Fausse alerte' : 'Annuler'}
        </button>
      )}
    </div>
  )
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cx('relative inline-flex size-2.5 shrink-0', className)} aria-hidden>
      <span className="absolute inset-0 animate-ping rounded-full bg-loss opacity-75" />
      <span className="relative inline-flex size-2.5 rounded-full bg-loss" />
    </span>
  )
}

/**
 * Bandeau global « X vous défie » : visible sur tous les écrans tant que le délai
 * de réponse court (sauf sur la fiche du match concerné, qui l'affiche déjà).
 */
export function IncomingChallengeBanner() {
  const { profile } = useAuth()
  const { challenges, matches, me, profileOf, avatarOf, nameOf, roundById } = useChampionship()
  const now = useNow()
  const location = useLocation()
  if (!me || !profile) return null
  const incoming = challenges.find((c) => {
    if (challengeState(c, now) !== 'pending' || c.challenger_id === me.id) return false
    const m = matches.find((x) => x.id === c.match_id)
    return !!m && (m.white_id === me.id || m.black_id === me.id)
  })
  if (!incoming) return null
  const match = matches.find((m) => m.id === incoming.match_id)!
  if (location.pathname === `/matchs/${match.id}` || location.pathname === '/arene') return null
  // Sur l'accueil, la carte « Mon prochain match » l'affiche déjà si c'est ce match-là.
  const next = matches
    .filter((m) => m.status === 'scheduled' && (m.white_id === me.id || m.black_id === me.id))
    .sort((x, y) => (roundById.get(x.round_id)?.number ?? 0) - (roundById.get(y.round_id)?.number ?? 0))[0]
  if (location.pathname === '/' && next?.id === match.id) return null
  const p = profileOf(incoming.challenger_id)

  return (
    <div className="pt-safe fixed inset-x-0 top-0 z-50 px-3 pt-2 animate-rise">
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-gold-400/40 bg-night-850/95 px-3 py-2.5 shadow-2xl backdrop-blur-lg">
        <Avatar name={p?.display_name ?? '?'} color={p?.avatar_color} size={36} src={avatarOf(p?.id)} />
        <Link to={`/matchs/${match.id}`} className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{nameOf(incoming.challenger_id)} vous défie !</p>
          <p className="text-[12px] text-muted">Répondez dans {countdown(new Date(incoming.expires_at).getTime() - now)}</p>
        </Link>
        <ChallengeButton match={match} className="py-2 text-[13px]" />
      </div>
    </div>
  )
}
