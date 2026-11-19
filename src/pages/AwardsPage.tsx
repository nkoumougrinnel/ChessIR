import { Link } from 'react-router-dom'
import { Rocket, Share2 } from 'lucide-react'
import { useShareActions } from '../hooks/useShareActions'
import { useChampionship } from '../state/championship'
import { AchievementBadge, achievementIcon, usePlayerAchievements } from '../components/achievements'
import { Avatar, PageHeader, PageLoader } from '../components/ui'
import { weekLabel } from '../lib/format'

export default function AwardsPage() {
  const { loading, me, tournament, achievements, weekById, weeks, nameOf, profileOf, avatarOf } = useChampionship()
  const all = usePlayerAchievements({ tournamentId: tournament?.id })
  const shareActions = useShareActions()

  if (loading || all === null) return <PageLoader />

  const byId = new Map(achievements.map((a) => [a.id, a]))
  const mine = all.filter((a) => a.participant_id === me?.id)
  const myCounts = new Map<string, number>()
  for (const a of mine) myCounts.set(a.achievement_id, (myCounts.get(a.achievement_id) ?? 0) + 1)
  const latestDistinction = mine
    .filter((a) => byId.get(a.achievement_id)?.kind === 'distinction')
    .sort((x, y) => (weekById.get(y.week_id ?? '')?.number ?? 0) - (weekById.get(x.week_id ?? '')?.number ?? 0))[0]
  const hero = latestDistinction ? byId.get(latestDistinction.achievement_id) : null
  const HeroIcon = hero ? achievementIcon(hero.icon) : null

  // Distinctions par semaine (les plus récentes d'abord).
  const distinctionsByWeek = weeks
    .map((w) => ({
      week: w,
      items: all.filter((a) => a.week_id === w.id && byId.get(a.achievement_id)?.kind === 'distinction'),
    }))
    .filter((x) => x.items.length > 0)

  return (
    <>
      <PageHeader title="Récompenses" back />
      <div className="space-y-6">
        {me && hero && HeroIcon && (
          <div className="relative flex flex-col items-center overflow-hidden px-4 pt-4 pb-2 text-center animate-rise">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_55%_at_50%_40%,rgba(245,184,61,0.28),transparent_70%)]"
            />
            <div className="relative grid size-32 place-items-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 size-full drop-shadow-[0_0_24px_rgba(245,184,61,0.45)]">
                <defs>
                  <linearGradient id="hero-gold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ffe6a8" />
                    <stop offset="1" stopColor="#c47d14" />
                  </linearGradient>
                </defs>
                <path d="M50 4 L88 18 V50 C88 72 70 88 50 96 C30 88 12 72 12 50 V18 Z" fill="#17122e" stroke="url(#hero-gold)" strokeWidth="5" />
              </svg>
              <HeroIcon size={52} className="relative text-gold-300" />
            </div>
            <h2 className="relative mt-3 font-display text-[26px] font-bold">{hero.name}</h2>
            <p className="relative text-[14px] text-[#8fa8ff]">
              {latestDistinction?.week_id && weekById.get(latestDistinction.week_id)
                ? `${hero.description} · ${weekLabel(weekById.get(latestDistinction.week_id)!.number)}`
                : hero.description}
            </p>
            <button
              className="btn-gold relative mt-4 px-5 py-2.5 text-[15px]"
              onClick={() => shareActions.award(hero, latestDistinction!.participant_id, latestDistinction!.week_id)}
            >
              <Share2 size={17} /> Partager
            </button>
          </div>
        )}

        {me && (
          <section>
            <h3 className="section-title mb-3 text-ink">Mes badges</h3>
            <div className="card grid grid-cols-3 gap-x-2 gap-y-5 px-3 py-5">
              {achievements.map((a) => (
                <AchievementBadge key={a.id} achievement={a} unlocked={myCounts.has(a.id)} count={myCounts.get(a.id)} />
              ))}
            </div>
            <p className="mt-3 flex items-center justify-center gap-2 text-[13px] text-muted">
              <Rocket size={16} className="text-gold-400" />
              {mine.length === 0 ? 'Jouez votre première partie pour débloquer un badge !' : 'Continue sur cette lancée !'}
            </p>
          </section>
        )}

        <section>
          <h3 className="section-title mb-3">Distinctions de la semaine</h3>
          {distinctionsByWeek.length === 0 ? (
            <p className="card px-4 py-4 text-center text-[14px] text-muted">
              Les distinctions sont attribuées à la clôture de chaque semaine.
            </p>
          ) : (
            <div className="space-y-3">
              {distinctionsByWeek.map(({ week, items }) => (
                <div key={week.id} className="card px-4 py-3">
                  <p className="mb-2 text-[12px] font-semibold tracking-wide text-faint uppercase">{weekLabel(week.number)}</p>
                  <ul className="space-y-2.5">
                    {items.map((pa) => {
                      const a = byId.get(pa.achievement_id)!
                      const Icon = achievementIcon(a.icon)
                      const p = profileOf(pa.participant_id)
                      return (
                        <li key={pa.id} className="flex items-center">
                          <Link to={`/joueurs/${pa.participant_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                            <Icon size={20} className="shrink-0 text-gold-400" />
                            <span className="flex-1 text-[14px] text-muted">{a.name}</span>
                            <Avatar name={p?.display_name ?? '?'} color={p?.avatar_color} size={24} src={avatarOf(p?.id)} />
                            <span className="max-w-[40%] truncate font-medium">{nameOf(pa.participant_id)}</span>
                          </Link>
                          <button
                            onClick={() => shareActions.award(a, pa.participant_id, pa.week_id)}
                            className="ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-white/5 hover:text-gold-300"
                            aria-label={`Partager : ${a.name}`}
                          >
                            <Share2 size={15} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="section-title mb-3 text-ink">Comment les obtenir</h3>
          <ul className="card divide-y divide-white/[0.06]">
            {achievements.map((a) => {
              const Icon = achievementIcon(a.icon)
              return (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <Icon size={18} className="mt-0.5 shrink-0 text-gold-400" />
                  <div>
                    <p className="text-[14px] font-medium">
                      {a.name}{' '}
                      <span className="text-[11px] text-faint">{a.kind === 'distinction' ? '· hebdomadaire' : '· badge'}</span>
                    </p>
                    <p className="text-[13px] text-muted">{a.description}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </>
  )
}
