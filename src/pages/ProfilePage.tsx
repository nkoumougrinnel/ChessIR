import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, ChevronRight, ExternalLink, History, LogOut, Pencil, Shield, UserX } from 'lucide-react'
import { useAuth } from '../state/auth'
import { useChampionship } from '../state/championship'
import { HistoryRow, useGamesOf } from '../components/matches'
import { useProgress } from '../hooks/useProgress'
import { ProgressChart } from '../components/ProgressChart'
import { AchievementBadge, usePlayerAchievements } from '../components/achievements'
import { Avatar, EmptyState, PageHeader, PageLoader, Stat } from '../components/ui'
import { chessComProfile } from '../lib/format'
import { ChesscomStatsCard } from '../components/chesscom'

export default function ProfilePage() {
  const { participantId } = useParams()
  const { profile: myProfile, signOut } = useAuth()
  const { loading, me, participantById, profiles, achievements, avatarOf, chesscomProfiles } = useChampionship()

  const participant = participantId ? participantById.get(participantId) ?? null : me
  const profile = participant ? profiles.get(participant.profile_id) : participantId ? undefined : myProfile
  const isMine = !!profile && profile.id === myProfile?.id

  const games = useGamesOf(participant?.id, isMine ? myProfile?.id : undefined)
  const progress = useProgress(participant?.id)
  const awards = usePlayerAchievements({ participantId: participant?.id })

  if (loading) return <PageLoader />
  if (!profile) {
    return (
      <>
        <PageHeader title="Profil" back />
        <EmptyState icon={UserX} title="Joueur introuvable" />
      </>
    )
  }

  const live = progress.live
  const done = games.filter((g) => g.outcome)
  const winRate = done.length ? Math.round((done.filter((g) => g.outcome === 'win').length / done.length) * 100) : null
  const awardCounts = new Map<string, number>()
  for (const a of awards ?? []) awardCounts.set(a.achievement_id, (awardCounts.get(a.achievement_id) ?? 0) + 1)
  const unlocked = achievements.filter((a) => awardCounts.has(a.id))

  return (
    <>
      <PageHeader
        title={isMine ? 'Mon profil' : 'Profil'}
        back={!isMine || !!participantId}
        right={
          isMine ? (
            <Link
              to="/profil/modifier"
              className="grid size-10 place-items-center rounded-full text-ink hover:bg-white/5"
              aria-label="Modifier mon profil"
            >
              <Pencil size={20} />
            </Link>
          ) : undefined
        }
      />

      <div className="space-y-5">
        <div className="flex flex-col items-center text-center animate-rise">
          <Avatar name={profile.display_name} color={profile.avatar_color} size={96} ring src={avatarOf(profile.id)} />
          <h2 className="mt-3 font-display text-[26px] font-bold uppercase tracking-wide">{profile.display_name}</h2>
          <p className="font-display text-[18px] text-gold-300">
            Elo initial : {participant?.initial_elo ?? profile.declared_elo ?? 'non renseigné'}
          </p>
          {profile.chesscom_username ? (
            <a
              href={chessComProfile(profile.chesscom_username)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[14px] text-[#8fa8ff] hover:underline"
            >
              {chesscomProfiles.get(profile.id)?.status === 'verified' && <BadgeCheck size={14} className="text-win" aria-label="Vérifié" />}
              Chess.com : @{profile.chesscom_username} <ExternalLink size={13} />
            </a>
          ) : (
            isMine && (
              <Link to="/profil/modifier" className="mt-1 text-[14px] text-gold-300 underline">
                Ajouter mon pseudo Chess.com
              </Link>
            )
          )}
          {participant?.status === 'suspended' && (
            <span className="mt-2 rounded-full bg-loss/15 px-3 py-0.5 text-[12px] text-loss">Participation suspendue</span>
          )}
        </div>

        {participant && live ? (
          <>
            <div className="grid grid-cols-4 gap-2 animate-rise [animation-delay:60ms]">
              <Stat value={live.points} label="Points" />
              <Stat value={live.wins} label="Victoires" tone="win" />
              <Stat value={live.draws} label="Nuls" tone="draw" />
              <Stat value={live.losses} label="Défaites" tone="loss" />
            </div>
            <p className="-mt-2 text-center text-[13px] text-muted">
              #{live.rank} sur {progress.totalPlayers} · {live.played} match{live.played > 1 ? 's' : ''} joué
              {live.played > 1 ? 's' : ''}
              {winRate !== null && ` · ${winRate} % de victoires`}
            </p>

            {progress.points.length > 0 && (
              <section className="card px-4 pt-3.5 pb-2 animate-rise [animation-delay:120ms]">
                <h3 className="font-display text-[17px] font-semibold">Progression</h3>
                <ProgressChart data={progress.points} />
              </section>
            )}

            <section className="animate-rise [animation-delay:180ms]">
              <Link to={isMine ? '/profil/recompenses' : '/recompenses'} className="mb-2.5 flex items-center justify-between">
                <h3 className="section-title">Distinctions</h3>
                <span className="flex items-center text-[13px] text-muted">
                  Tout voir <ChevronRight size={16} />
                </span>
              </Link>
              {unlocked.length === 0 ? (
                <p className="card px-4 py-4 text-center text-[14px] text-muted">
                  {isMine ? 'Votre premier badge arrive avec votre première partie !' : 'Pas encore de distinction.'}
                </p>
              ) : (
                <div className="card grid grid-cols-4 gap-3 px-3 py-4">
                  {unlocked.map((a) => (
                    <AchievementBadge key={a.id} achievement={a} unlocked count={awardCounts.get(a.id)} size={56} />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2.5">
              <h3 className="section-title">Historique des matchs</h3>
              {games.length === 0 ? (
                <EmptyState icon={History} title="Aucun match pour l'instant" />
              ) : (
                games.map((g) => <HistoryRow key={g.match.id} game={g} />)
              )}
            </section>
          </>
        ) : (
          <p className="card px-4 py-4 text-center text-[14px] text-muted">
            {isMine ? "Vous n'êtes pas encore inscrit au championnat." : "Ce joueur n'est pas inscrit au championnat."}
          </p>
        )}

        {/* Statistiques Chess.com : bloc séparé, hors championnat */}
        <ChesscomStatsCard profileId={profile.id} isMine={isMine} />

        {isMine && (
          <div className="space-y-2.5 pt-2">
            {myProfile?.role === 'admin' && (
              <Link to="/admin" className="btn-ghost w-full">
                <Shield size={18} /> Espace administrateur
              </Link>
            )}
            <button onClick={() => void signOut()} className="btn-ghost w-full text-muted">
              <LogOut size={18} /> Se déconnecter
            </button>
          </div>
        )}
      </div>
    </>
  )
}
