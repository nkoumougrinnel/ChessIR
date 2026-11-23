import { Link } from 'react-router-dom'
import { Crown, ExternalLink, Eye, Flame, Megaphone, Swords, Trophy } from 'lucide-react'
import { useShareActions } from '../hooks/useShareActions'
import { useChampionship } from '../state/championship'
import { challengeState, ChallengeButton, countdown, liveSince, LiveDot, useNow } from '../components/challenge'
import { Avatar, EmptyState, PageHeader, PageLoader, PieceColor, cx } from '../components/ui'
import { chessComProfile } from '../lib/format'
import type { Match, MatchChallenge, MatchResult } from '../lib/types'

/**
 * L'Arène : les matchs en direct de toute la classe.
 * - Défi reçu (avec compte à rebours) tout en haut.
 * - Cartes « face-à-face » pour chaque match en direct, avec « Regarder sur Chess.com ».
 * - Défis lancés par les autres, en attente de réponse.
 * - Matchs terminés dans la journée (célébration du vainqueur).
 * - Sans direct : les matchs restant à jouer cette semaine et les derniers résultats.
 */
export default function ArenaPage() {
  const { loading, me, challenges, matches, activeWeek, roundById } = useChampionship()
  const now = useNow()

  if (loading) return <PageLoader />

  const matchOf = (c: MatchChallenge) => matches.find((m) => m.id === c.match_id)
  const isMine = (m: Match) => !!me && (m.white_id === me.id || m.black_id === me.id)

  const incoming = challenges.filter((c) => {
    const m = matchOf(c)
    return challengeState(c, now) === 'pending' && m && isMine(m) && c.challenger_id !== me?.id
  })
  const live = challenges.filter((c) => challengeState(c, now) === 'live' && matchOf(c))
  const othersPending = challenges.filter((c) => {
    const m = matchOf(c)
    return challengeState(c, now) === 'pending' && m && !incoming.includes(c)
  })
  // Un seul « terminé » par match : le défi le plus récent qui a mené à un résultat.
  const seen = new Set<string>()
  const finished = challenges.filter((c) => {
    const m = matchOf(c)
    if (!m || !c.accepted_at || !c.ended_at || seen.has(m.id)) return false
    if (!['declared', 'detected'].includes(c.end_reason ?? '') || m.status === 'scheduled') return false
    seen.add(m.id)
    return true
  })

  const nothingLive = incoming.length === 0 && live.length === 0 && othersPending.length === 0

  return (
    <>
      <PageHeader title="Arène" icon={Flame} />
      <div className="space-y-6">
        {incoming.map((c) => (
          <IncomingCard key={c.id} challenge={c} match={matchOf(c)!} now={now} />
        ))}

        {live.length > 0 && (
          <section>
            <h2 className="section-title mb-3 flex items-center gap-2">
              <LiveDot /> En direct <span className="text-faint">· {live.length}</span>
            </h2>
            <div className="space-y-4">
              {live.map((c, i) => (
                <LiveCard key={c.id} challenge={c} match={matchOf(c)!} now={now} index={i} />
              ))}
            </div>
          </section>
        )}

        {othersPending.length > 0 && (
          <section>
            <h2 className="section-title mb-3">Défis lancés</h2>
            <ul className="card divide-y divide-white/[0.06]">
              {othersPending.map((c) => (
                <PendingRow key={c.id} challenge={c} match={matchOf(c)!} now={now} />
              ))}
            </ul>
          </section>
        )}

        {nothingLive && (
          <EmptyState icon={Swords} title="Aucun match en direct">
            Quand deux joueurs lancent leur match depuis l'application, il apparaît ici en direct.
          </EmptyState>
        )}

        {finished.length > 0 && (
          <section>
            <h2 className="section-title mb-3">Terminés aujourd'hui</h2>
            <div className="space-y-3">
              {finished.map((c) => (
                <FinishedCard key={c.id} challenge={c} match={matchOf(c)!} now={now} />
              ))}
            </div>
          </section>
        )}

        {nothingLive && activeWeek && <ToPlay weekId={activeWeek.id} roundOf={(m) => roundById.get(m.round_id)?.number ?? 0} />}
        {nothingLive && finished.length === 0 && <LatestResults />}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */

function usePlayer(participantId: string) {
  const { profileOf, avatarOf, standings } = useChampionship()
  const p = profileOf(participantId)
  return {
    profile: p,
    avatar: avatarOf(p?.id),
    rank: standings.find((s) => s.participant_id === participantId)?.rank ?? null,
  }
}

function Fighter({ participantId, color, side }: { participantId: string; color: 'white' | 'black'; side: 'left' | 'right' }) {
  const { profile, avatar, rank } = usePlayer(participantId)
  return (
    <Link
      to={`/joueurs/${participantId}`}
      className={cx('flex min-w-0 flex-col items-center text-center', side === 'left' ? 'animate-enter-left' : 'animate-enter-right')}
    >
      <div className="relative">
        <Avatar name={profile?.display_name ?? '?'} color={profile?.avatar_color} size={68} ring src={avatar} />
        {rank && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-night-950 px-1.5 text-[11px] font-bold text-gold-300 ring-1 ring-gold-400/40">
            #{rank}
          </span>
        )}
      </div>
      <p className="mt-2.5 w-full truncate font-display text-[17px] font-bold">{profile?.display_name}</p>
      <p className="text-[12px] text-muted">{profile?.declared_elo ? `Elo ${profile.declared_elo}` : '—'}</p>
      <div className="mt-1">
        <PieceColor color={color} label />
      </div>
    </Link>
  )
}

function WatchButton({ participantId }: { participantId: string }) {
  const { profile } = usePlayer(participantId)
  if (!profile?.chesscom_username) return null
  return (
    <a
      href={chessComProfile(profile.chesscom_username)}
      target="_blank"
      rel="noreferrer"
      className="btn-ghost min-w-0 px-2 py-2 text-[13px]"
    >
      <Eye size={15} className="shrink-0" />
      <span className="truncate">{profile.display_name}</span>
    </a>
  )
}

function LiveCard({ challenge, match, now, index }: { challenge: MatchChallenge; match: Match; now: number; index: number }) {
  const { me, roundById } = useChampionship()
  const shareActions = useShareActions()
  const mine = !!me && (match.white_id === me.id || match.black_id === me.id)
  return (
    <article
      className="card relative overflow-hidden border-loss/30 px-4 pt-4 pb-4 animate-rise"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_45%,rgba(248,113,113,0.16),transparent_70%)]" />
      <div className="relative mb-3 flex items-center justify-between text-[12px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-loss/15 px-2.5 py-1 font-bold tracking-wide text-loss uppercase">
          <LiveDot /> En direct
        </span>
        <span className="text-muted">
          Ronde {roundById.get(match.round_id)?.number} · {liveSince(challenge, now)}
        </span>
      </div>

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-1">
        <Fighter participantId={match.white_id} color="white" side="left" />
        <div className="relative grid size-16 place-items-center">
          <span aria-hidden className="absolute inset-0 animate-ping-slow rounded-full bg-gold-400/15" />
          <Swords size={34} className="relative animate-clash text-gold-300 drop-shadow-[0_0_10px_rgba(245,184,61,0.6)]" />
          <span className="absolute -bottom-3 font-display text-[15px] font-black text-gold-300">VS</span>
        </div>
        <Fighter participantId={match.black_id} color="black" side="right" />
      </div>

      <div className="relative mt-5">
        {mine ? (
          <div className="grid grid-cols-2 gap-2">
            <ChallengeButton match={match} />
            <Link to={`/matchs/${match.id}`} className="btn-gold px-3 text-[14px]">
              Déclarer
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-2 flex items-center justify-center gap-1.5 text-[12px] text-muted">
              <ExternalLink size={12} /> Regarder sur Chess.com, depuis le profil d'un joueur
            </p>
            <div className="grid grid-cols-2 gap-2">
              <WatchButton participantId={match.white_id} />
              <WatchButton participantId={match.black_id} />
            </div>
          </>
        )}
        <button
          onClick={() => shareActions.live(match)}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-loss/30 bg-loss/10 px-3 py-2.5 text-[14px] font-medium text-ink hover:bg-loss/15"
        >
          <Megaphone size={16} className="text-loss" /> Partager le direct au groupe
        </button>
      </div>
    </article>
  )
}

function IncomingCard({ challenge, match, now }: { challenge: MatchChallenge; match: Match; now: number }) {
  const { nameOf } = useChampionship()
  const { profile, avatar } = usePlayer(challenge.challenger_id)
  const left = new Date(challenge.expires_at).getTime() - now
  return (
    <section className="card relative overflow-hidden border-gold-400/50 px-4 py-4 animate-rise">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-[radial-gradient(circle,rgba(245,184,61,0.22),transparent_65%)]" />
      <div className="relative flex items-center gap-3">
        <Avatar name={profile?.display_name ?? '?'} color={profile?.avatar_color} size={52} src={avatar} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold tracking-wide text-gold-300 uppercase">Défi reçu</p>
          <p className="truncate font-display text-[20px] font-bold">{nameOf(challenge.challenger_id)} vous défie !</p>
        </div>
        <span className="font-display text-[26px] font-bold tabular-nums text-gold-300">{countdown(left)}</span>
      </div>
      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gold-400 transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.max(0, Math.min(100, (left / (5 * 60_000)) * 100))}%` }}
        />
      </div>
      <ChallengeButton match={match} className="relative mt-3 w-full py-3 text-[16px]" />
      <p className="relative mt-2 text-center text-[12px] text-faint">Chess.com s'ouvre : acceptez le défi, ou relancez-le si besoin.</p>
    </section>
  )
}

function PendingRow({ challenge, match, now }: { challenge: MatchChallenge; match: Match; now: number }) {
  const { nameOf, me } = useChampionship()
  const other = challenge.challenger_id === match.white_id ? match.black_id : match.white_id
  const mine = challenge.challenger_id === me?.id
  return (
    <li>
      <Link to={`/matchs/${match.id}`} className="flex items-center gap-3 px-4 py-3">
        <Swords size={17} className="shrink-0 text-gold-400" />
        <p className="min-w-0 flex-1 truncate text-[14px]">
          <strong>{mine ? 'Vous' : nameOf(challenge.challenger_id)}</strong> {mine ? 'avez défié' : 'a défié'} <strong>{nameOf(other)}</strong>
        </p>
        <span className="shrink-0 text-[12px] tabular-nums text-muted">{countdown(new Date(challenge.expires_at).getTime() - now)}</span>
      </Link>
    </li>
  )
}

function winnerOf(m: Match): { winner: string | null; result: MatchResult | null } {
  const r = m.result ?? m.declared_result
  if (!r) return { winner: null, result: null }
  return { winner: r === 'draw' ? null : r === 'white_win' ? m.white_id : m.black_id, result: r }
}

function FinishedCard({ challenge, match, now }: { challenge: MatchChallenge; match: Match; now: number }) {
  const { nameOf } = useChampionship()
  const { winner, result } = winnerOf(match)
  const fresh = now - new Date(challenge.ended_at!).getTime() < 10 * 60_000
  const w = usePlayer(winner ?? match.white_id)
  return (
    <Link to={`/matchs/${match.id}`} className="card card-hover relative flex items-center gap-3 overflow-hidden px-4 py-3">
      {fresh && winner && <Confetti />}
      {winner ? (
        <div className="relative">
          <Avatar name={w.profile?.display_name ?? '?'} color={w.profile?.avatar_color} size={44} src={w.avatar} />
          <Crown size={18} className={cx('absolute -top-3 left-1/2 -translate-x-1/2 text-gold-300', fresh && 'animate-crown')} />
        </div>
      ) : (
        <div className="grid size-11 place-items-center rounded-full bg-draw/15 text-draw">½</div>
      )}
      <div className="relative min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">
          {result === 'draw' ? 'Match nul' : `Victoire de ${nameOf(winner!)}`}
          {match.status === 'pending' && <span className="ml-1.5 text-[11px] font-normal text-faint">(à confirmer)</span>}
        </p>
        <p className="truncate text-[12px] text-muted">
          {nameOf(match.white_id)} – {nameOf(match.black_id)}
        </p>
      </div>
      <Trophy size={18} className="relative shrink-0 text-gold-400" />
    </Link>
  )
}

/** Petite pluie de confettis (une fois), pour un résultat tout frais. */
function Confetti() {
  const colors = ['#f5b83d', '#ffe6a8', '#7c6cff', '#34d399', '#f87171']
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 block h-2 w-1 animate-confetti rounded-sm"
          style={{
            left: `${(i * 53) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 6) * 0.12}s`,
          }}
        />
      ))}
    </div>
  )
}

function ToPlay({ weekId, roundOf }: { weekId: string; roundOf: (m: Match) => number }) {
  const { matches, roundById, nameOf } = useChampionship()
  const todo = matches
    .filter((m) => m.status === 'scheduled' && roundById.get(m.round_id)?.week_id === weekId)
    .sort((a, b) => roundOf(a) - roundOf(b))
  if (todo.length === 0) return null
  return (
    <section>
      <h2 className="section-title mb-3">
        À jouer cette semaine <span className="text-faint">· {todo.length}</span>
      </h2>
      <ul className="card divide-y divide-white/[0.06]">
        {todo.slice(0, 12).map((m) => (
          <li key={m.id}>
            <Link to={`/matchs/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
              <span className="w-8 shrink-0 text-[12px] text-faint">R{roundOf(m)}</span>
              <span className="min-w-0 flex-1 truncate">
                {nameOf(m.white_id)} <span className="text-faint">vs</span> {nameOf(m.black_id)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function LatestResults() {
  const { matches, nameOf } = useChampionship()
  const done = matches
    .filter((m) => m.status === 'validated' && m.result && m.validated_at)
    .sort((a, b) => b.validated_at!.localeCompare(a.validated_at!))
    .slice(0, 5)
  if (done.length === 0) return null
  return (
    <section>
      <h2 className="section-title mb-3">Derniers résultats</h2>
      <ul className="card divide-y divide-white/[0.06]">
        {done.map((m) => {
          const { winner } = winnerOf(m)
          return (
            <li key={m.id}>
              <Link to={`/matchs/${m.id}`} className="flex items-center gap-2 px-4 py-2.5 text-[14px]">
                <span className={cx('min-w-0 flex-1 truncate', winner === m.white_id && 'font-semibold text-ink')}>{nameOf(m.white_id)}</span>
                <span className="shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[12px] tabular-nums text-muted">
                  {m.result === 'white_win' ? '1 – 0' : m.result === 'black_win' ? '0 – 1' : '½ – ½'}
                </span>
                <span className={cx('min-w-0 flex-1 truncate text-right', winner === m.black_id && 'font-semibold text-ink')}>
                  {nameOf(m.black_id)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
