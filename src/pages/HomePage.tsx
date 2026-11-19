import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUp, ArrowDown, CalendarDays, ChevronRight, Minus, Trophy, UserPlus, Coffee, BellRing } from 'lucide-react'
import { useAuth } from '../state/auth'
import { useChampionship } from '../state/championship'
import { useByesOf, useGamesOf } from '../components/matches'
import { useProgress } from '../hooks/useProgress'
import { BellButton, Brand, Logo } from '../components/Layout'
import { Avatar, EmptyState, PageLoader, StatusBadge, cx } from '../components/ui'
import { ProgressChart } from '../components/ProgressChart'
import { dayShort, ddmm, weekLabel, weekRange, OUTCOME_LABEL } from '../lib/format'

export default function HomePage() {
  const { profile } = useAuth()
  const { loading, tournament, me, activeWeek, weeks, nameOf } = useChampionship()
  const games = useGamesOf(me?.id, profile?.id)
  const progress = useProgress(me?.id)
  const currentWeek = activeWeek ?? weeks[0] ?? null
  const weekGames = games.filter((g) => g.week.id === currentWeek?.id).sort((a, b) => a.round.number - b.round.number)
  const weekByes = useByesOf(me?.id, currentWeek?.id)
  const toAnswer = games.filter((g) => g.needsMyAnswer)

  if (loading) return <PageLoader />

  return (
    <>
      <header className="flex h-16 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <Brand />
        </div>
        <BellButton />
      </header>

      {!tournament && (
        <EmptyState icon={Trophy} title="Aucun championnat pour l'instant">
          L'administrateur n'a pas encore créé le championnat. Revenez bientôt !
        </EmptyState>
      )}

      {tournament && (
        <div className="space-y-4">
          {/* Semaine */}
          <div className="card flex items-center gap-3.5 px-4 py-3.5 animate-rise">
            <div className="grid size-11 place-items-center rounded-xl bg-violet/15 text-[#b3a9ff]">
              <CalendarDays size={24} />
            </div>
            <div className="flex-1">
              <p className="font-display text-[19px] font-semibold">
                {currentWeek ? weekLabel(currentWeek.number) : tournament.name}
              </p>
              <p className="text-[13px] text-muted">
                {currentWeek ? weekRange(currentWeek.start_date) : 'En attente du premier tirage'}
              </p>
            </div>
            {activeWeek ? (
              <span className="rounded-full bg-win/15 px-3 py-1 text-[12px] font-semibold text-win">En cours</span>
            ) : (
              <span className="rounded-full bg-white/5 px-3 py-1 text-[12px] font-semibold text-muted">
                {tournament.status === 'finished' ? 'Terminé' : currentWeek ? 'Clôturée' : 'Bientôt'}
              </span>
            )}
          </div>

          {!me && (
            <EmptyState icon={UserPlus} title="Pas encore inscrit">
              Votre compte est prêt. L'administrateur doit vous ajouter au championnat « {tournament.name} ».
              {!profile?.chesscom_username && (
                <>
                  {' '}
                  Pensez à{' '}
                  <Link to="/profil/modifier" className="text-gold-300 underline">
                    renseigner votre pseudo Chess.com
                  </Link>
                  .
                </>
              )}
            </EmptyState>
          )}

          {me && progress.live && (
            <>
              {/* Joueur */}
              <Link to="/profil" className="card card-hover flex items-center gap-3.5 px-4 py-4 animate-rise [animation-delay:60ms]">
                <Avatar name={profile?.display_name ?? ''} color={profile?.avatar_color} size={52} ring />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[19px] font-semibold uppercase">{profile?.display_name}</p>
                  <p className="text-[13px] text-muted">
                    Elo : {me.initial_elo ?? profile?.declared_elo ?? '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-[28px] font-bold leading-none text-gold-gradient">#{progress.live.rank}</p>
                  <p className="text-[12px] text-faint">/ {progress.totalPlayers}</p>
                </div>
              </Link>

              {/* Points + évolution */}
              <div className="grid grid-cols-2 gap-3 animate-rise [animation-delay:120ms]">
                <div className="card flex items-center gap-3 px-4 py-3.5">
                  <Trophy size={30} className="text-gold-400" />
                  <div>
                    <p className="font-display text-[28px] font-bold leading-none text-gold-300">{progress.live.points}</p>
                    <p className="text-[12px] text-muted">Points</p>
                  </div>
                </div>
                <div className="card flex flex-col justify-center px-4 py-3.5">
                  <RankDelta delta={progress.rankDelta} />
                  <p className="mt-0.5 text-[12px] text-muted">vs semaine précédente</p>
                </div>
              </div>

              {/* À confirmer */}
              {toAnswer.length > 0 && (
                <Link
                  to={`/matchs/${toAnswer[0].match.id}`}
                  className="card flex items-center gap-3 border-violet/50 px-4 py-3.5 animate-rise"
                >
                  <BellRing size={22} className="text-[#b3a9ff]" />
                  <p className="flex-1 text-[14px]">
                    {toAnswer.length === 1
                      ? `${nameOf(toAnswer[0].opponentId)} attend votre confirmation`
                      : `${toAnswer.length} résultats attendent votre confirmation`}
                  </p>
                  <ChevronRight size={18} className="text-faint" />
                </Link>
              )}

              {/* Matchs de la semaine */}
              <section className="animate-rise [animation-delay:180ms]">
                <h2 className="section-title mb-2.5">{activeWeek ? 'Prochains matchs' : 'Matchs de la semaine'}</h2>
                {weekGames.length === 0 && weekByes.length === 0 ? (
                  <div className="card px-4 py-5 text-center text-[14px] text-muted">
                    Le tirage de la semaine n'est pas encore publié.
                  </div>
                ) : (
                  <div className="card divide-y divide-white/[0.06]">
                    {weekGames.map((g) => (
                      <Link
                        key={g.match.id}
                        to={`/matchs/${g.match.id}`}
                        className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03]"
                      >
                        <CalendarDays size={18} className="text-muted" />
                        <span className="w-20 text-[14px] text-muted">
                          {dayShort(g.round.play_date)} {ddmm(g.round.play_date)}
                        </span>
                        <span className="flex-1 truncate font-display text-[17px] font-semibold">vs {nameOf(g.opponentId)}</span>
                        {g.outcome ? (
                          <span className={cx('text-[13px] font-semibold', g.outcome === 'win' ? 'text-win' : g.outcome === 'draw' ? 'text-draw' : 'text-loss')}>
                            {OUTCOME_LABEL[g.outcome]}
                          </span>
                        ) : (
                          g.match.status !== 'scheduled' && <StatusBadge status={g.match.status} />
                        )}
                        <ChevronRight size={18} className="text-faint" />
                      </Link>
                    ))}
                    {weekByes.map(({ bye, round }) => (
                      <div key={bye.id} className="flex items-center gap-3 px-4 py-3.5 text-muted">
                        <Coffee size={18} />
                        <span className="w-20 text-[14px]">
                          {dayShort(round.play_date)} {ddmm(round.play_date)}
                        </span>
                        <span className="flex-1 text-[14px]">Exempt</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Progression */}
              {progress.points.length > 1 && (
                <Link to="/profil" className="card card-hover block px-4 pt-3.5 pb-2 animate-rise [animation-delay:240ms]">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-[17px] font-semibold">Ma progression</h2>
                    <ChevronRight size={18} className="text-faint" />
                  </div>
                  <ProgressChart data={progress.points.slice(-6)} height={120} />
                </Link>
              )}
            </>
          )}

          <Link to="/classement" className="btn-gold w-full animate-rise [animation-delay:300ms]">
            Voir le classement <ArrowRight size={18} />
          </Link>
        </div>
      )}
    </>
  )
}

function RankDelta({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) {
    return (
      <p className="flex items-center gap-1 font-display text-[22px] font-bold text-muted">
        <Minus size={18} /> {delta === null ? '—' : '0'}
      </p>
    )
  }
  const up = delta > 0
  return (
    <p className={cx('flex items-center gap-1 font-display text-[22px] font-bold', up ? 'text-win' : 'text-loss')}>
      {up ? <ArrowUp size={20} /> : <ArrowDown size={20} />}
      {up ? `+${delta}` : delta}
    </p>
  )
}
