import { Link } from 'react-router-dom'
import { PartyPopper, PenLine, Sparkles } from 'lucide-react'
import { ChallengeButton, ChallengeStatus } from './challenge'
import { useChampionship } from '../state/championship'
import type { MyGame } from './matches'
import { Avatar, PieceColor } from './ui'
import { dayName, dayShort, ddmm } from '../lib/format'
import { parseDay, toIsoDay } from '../lib/format'

/**
 * « Mon prochain match » : l'action principale du joueur, accessible en un geste
 * depuis l'accueil (défier sur Chess.com, puis déclarer le résultat).
 */
export function NextMatchCard({ games, weekOpen }: { games: MyGame[]; weekOpen: boolean }) {
  const { profileOf, avatarOf, gamesOfMatch } = useChampionship()
  if (!weekOpen || games.length === 0) return null
  const next = games.filter((g) => g.match.status === 'scheduled').sort((a, b) => a.round.number - b.round.number)[0]

  if (!next) {
    return (
      <div className="card flex items-center gap-3 px-4 py-3.5 animate-rise">
        <PartyPopper size={22} className="text-gold-400" />
        <p className="text-[14px]">Tous vos matchs de la semaine sont déclarés. Rendez-vous au prochain tirage !</p>
      </div>
    )
  }

  const opp = profileOf(next.opponentId)
  const today = toIsoDay(new Date())
  const when =
    next.round.play_date === today
      ? "Aujourd'hui"
      : parseDay(next.round.play_date) < parseDay(today)
        ? `${dayShort(next.round.play_date)} ${ddmm(next.round.play_date)} · en retard`
        : `${dayName(next.round.play_date)} ${ddmm(next.round.play_date)}`

  const found = gamesOfMatch(next.match.id).some((g) => g.confidence === 'certain')

  return (
    <section className="card relative overflow-hidden border-gold-400/25 px-4 py-4 animate-rise">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-[radial-gradient(circle,rgba(245,184,61,0.16),transparent_65%)]"
      />
      <p className="relative text-[12px] font-semibold tracking-wide text-gold-300 uppercase">
        Mon prochain match · {when}
      </p>
      <Link to={`/matchs/${next.match.id}`} className="relative mt-2.5 flex items-center gap-3">
        <Avatar name={opp?.display_name ?? '?'} color={opp?.avatar_color} size={48} src={avatarOf(opp?.id)} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[21px] font-bold">vs {opp?.display_name}</p>
          <div className="flex items-center gap-3">
            <PieceColor color={next.color} label />
            <span className="text-[12px] text-faint">Ronde {next.round.number}</span>
          </div>
        </div>
      </Link>
      {found && (
        <p className="relative mt-3 flex items-center gap-2 rounded-lg bg-win/10 px-3 py-2 text-[13px] text-win">
          <Sparkles size={15} /> Partie trouvée sur Chess.com : confirmez le résultat.
        </p>
      )}
      <div className="relative mt-3.5 grid grid-cols-2 gap-2.5">
        <ChallengeButton match={next.match} className="py-2.5" />
        <Link to={`/matchs/${next.match.id}`} className="btn-gold whitespace-nowrap px-3 py-2.5 text-[14px]">
          <PenLine size={16} /> {found ? 'Confirmer' : 'Déclarer'}
        </Link>
      </div>
      <ChallengeStatus match={next.match} className="relative mt-2.5" />
      {opp?.chesscom_username && (
        <p className="relative mt-2 text-center text-[12px] text-faint">
          Sur Chess.com, choisissez les <strong className="text-muted">{next.color === 'white' ? 'Blancs' : 'Noirs'}</strong> : sinon la
          partie ne compte pas.
        </p>
      )}
    </section>
  )
}
