import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Coffee } from 'lucide-react'
import { useChampionship, useMatchViews, type MatchView } from '../state/championship'
import { dayName, ddmm, dayShort, outcomeFor, OUTCOME_LABEL, OUTCOME_POINTS, type Outcome } from '../lib/format'
import { Avatar, OutcomePill, PieceColor, StatusBadge, cx } from './ui'
import type { Bye } from '../lib/types'

export interface MyGame extends MatchView {
  color: 'white' | 'black'
  opponentId: string
  outcome: Outcome | null
  /** L'utilisateur doit agir (confirmer un résultat déclaré par l'adversaire). */
  needsMyAnswer: boolean
}

/** Matchs d'un participant, du plus récent au plus ancien. */
export function useGamesOf(participantId: string | null | undefined, myProfileId?: string) {
  const views = useMatchViews()
  return useMemo<MyGame[]>(() => {
    if (!participantId) return []
    return views
      .filter((v) => v.match.white_id === participantId || v.match.black_id === participantId)
      .map((v) => {
        const color = v.match.white_id === participantId ? 'white' : 'black'
        return {
          ...v,
          color,
          opponentId: color === 'white' ? v.match.black_id : v.match.white_id,
          outcome: v.match.status === 'validated' && v.match.result ? outcomeFor(v.match.result, color) : null,
          needsMyAnswer:
            v.match.status === 'pending' && !!myProfileId && v.match.declared_by !== myProfileId,
        } satisfies MyGame
      })
  }, [views, participantId, myProfileId])
}

/** Exemptions d'un participant pour une semaine donnée. */
export function useByesOf(participantId: string | null | undefined, weekId?: string) {
  const { byes, roundById } = useChampionship()
  return useMemo(
    () =>
      byes
        .filter((b) => b.participant_id === participantId)
        .map((b) => ({ bye: b, round: roundById.get(b.round_id)! }))
        .filter((x) => x.round && (!weekId || x.round.week_id === weekId)),
    [byes, roundById, participantId, weekId],
  )
}

/** Carte d'un match de la semaine (vue « Matchs »). */
export function WeekMatchCard({ game, index = 0 }: { game: MyGame; index?: number }) {
  const { nameOf, profileOf } = useChampionship()
  const opp = profileOf(game.opponentId)
  const { round, match } = game
  return (
    <Link
      to={`/matchs/${match.id}`}
      className={cx(
        'card card-hover block p-4 animate-rise',
        game.needsMyAnswer && 'border-violet/50 shadow-[0_0_0_1px_rgba(124,108,255,0.3)]',
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-[16px] font-semibold">
          {dayName(round.play_date)} · Ronde {round.number}
          <span className="ml-2 text-[13px] font-normal text-faint">{ddmm(round.play_date)}</span>
        </span>
        <ChevronRight size={18} className="text-faint" />
      </div>
      <div className="flex items-center gap-3">
        <Avatar name={opp?.display_name ?? '?'} color={opp?.avatar_color} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[18px] font-semibold">vs {nameOf(game.opponentId)}</p>
          <div className="mt-0.5 flex items-center gap-3">
            <PieceColor color={game.color} label />
            {opp?.chesscom_username && <span className="truncate text-[12px] text-faint">@{opp.chesscom_username}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {game.outcome ? (
            <>
              <OutcomePill outcome={game.outcome}>{OUTCOME_LABEL[game.outcome]}</OutcomePill>
              <span className="text-[12px] text-muted">+{OUTCOME_POINTS[game.outcome]} pt{game.outcome === 'win' ? 's' : ''}</span>
            </>
          ) : (
            <StatusBadge status={match.status} />
          )}
        </div>
      </div>
      {game.needsMyAnswer && (
        <p className="mt-3 rounded-lg bg-violet/10 px-3 py-2 text-[13px] text-[#c4bbff]">
          Votre adversaire a déclaré un résultat : confirmez ou contestez.
        </p>
      )}
    </Link>
  )
}

export function ByeCard({ bye, playDate, roundNumber }: { bye: Bye; playDate: string; roundNumber: number }) {
  return (
    <div className="card flex items-center gap-3 p-4 opacity-90">
      <div className="grid size-10 place-items-center rounded-full bg-white/5 text-muted">
        <Coffee size={20} />
      </div>
      <div className="flex-1">
        <p className="font-display text-[16px] font-semibold">
          {dayName(playDate)} · Ronde {roundNumber}
        </p>
        <p className="text-[13px] text-muted">
          Exempt cette ronde (nombre impair de joueurs) · {bye.points > 0 ? `+${bye.points} pt` : '0 pt'}
        </p>
      </div>
    </div>
  )
}

/** Ligne compacte d'historique. */
export function HistoryRow({ game, showWeek = true }: { game: MyGame; showWeek?: boolean }) {
  const { nameOf, profileOf } = useChampionship()
  const opp = profileOf(game.opponentId)
  return (
    <Link to={`/matchs/${game.match.id}`} className="card card-hover flex items-center gap-3 px-4 py-3">
      <Avatar name={opp?.display_name ?? '?'} color={opp?.avatar_color} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-faint">
          {dayShort(game.round.play_date)} {ddmm(game.round.play_date)}
          {showWeek && ` · S${game.week.number}`}
        </p>
        <p className="truncate font-display text-[17px] font-semibold">vs {nameOf(game.opponentId)}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        {game.outcome ? (
          <>
            <OutcomePill outcome={game.outcome}>{OUTCOME_LABEL[game.outcome]}</OutcomePill>
            <span className="text-[12px] text-muted">
              {OUTCOME_POINTS[game.outcome]} pt{OUTCOME_POINTS[game.outcome] > 1 ? 's' : ''}
            </span>
          </>
        ) : (
          <StatusBadge status={game.match.status} />
        )}
      </div>
      <ChevronRight size={16} className="text-faint" />
    </Link>
  )
}
