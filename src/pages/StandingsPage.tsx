import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Crown, Trophy, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Share2 } from 'lucide-react'
import { useShareActions } from '../hooks/useShareActions'
import { useChampionship } from '../state/championship'
import { fetchWeekSnapshots, fetchWeekStandings } from '../lib/api'
import type { StandingRow } from '../lib/types'
import { Avatar, EmptyState, PageHeader, PageLoader, Segmented, Spinner, cx } from '../components/ui'
import { pad2, weekRange } from '../lib/format'

export default function StandingsPage() {
  const { loading, standings, weeks, me, activeWeek, tournament } = useChampionship()
  const [tab, setTab] = useState<'general' | 'week'>('general')
  const shareActions = useShareActions()
  const [weekIdx, setWeekIdx] = useState(0) // index dans `weeks` (0 = plus récente)
  const [weekRows, setWeekRows] = useState<StandingRow[] | null>(null)
  const week = weeks[weekIdx] ?? null

  // Évolution des places : classement actuel comparé à la dernière semaine clôturée
  // (ou à l'avant-dernière s'il n'y a pas de semaine en cours).
  const closed = weeks.filter((w) => w.status === 'closed')
  const refWeek = activeWeek ? closed[0] : closed[1]
  const [prevRank, setPrevRank] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    if (!refWeek) return setPrevRank(new Map())
    fetchWeekSnapshots(refWeek.id)
      .then((s) => setPrevRank(new Map(s.map((x) => [x.participant_id, x.rank]))))
      .catch(() => setPrevRank(new Map()))
  }, [refWeek?.id])

  useEffect(() => {
    if (tab !== 'week' || !week) return
    setWeekRows(null)
    fetchWeekStandings(week.id).then(setWeekRows).catch(() => setWeekRows([]))
  }, [tab, week, standings])

  if (loading) return <PageLoader />

  const rows = tab === 'general' ? standings : (weekRows ?? [])

  return (
    <>
      <PageHeader
        title="Classement"
        icon={Trophy}
        right={
          rows.length > 0 ? (
            <button
              onClick={() => shareActions.standings(rows, { week: tab === 'week' ? (week ?? undefined) : undefined, myId: me?.id })}
              className="grid size-10 place-items-center rounded-full text-gold-300 hover:bg-white/5"
              aria-label="Partager le classement"
            >
              <Share2 size={20} />
            </button>
          ) : undefined
        }
      />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'general', label: 'Général' },
          { value: 'week', label: week ? `Semaine ${pad2(week.number)}` : 'Semaine' },
        ]}
      />

      {tab === 'week' && week && (
        <div className="mb-3 flex items-center justify-between">
          <button
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-white/5 disabled:opacity-30"
            disabled={weekIdx >= weeks.length - 1}
            onClick={() => setWeekIdx((i) => i + 1)}
            aria-label="Semaine précédente"
          >
            <ChevronLeft size={20} />
          </button>
          <p className="text-[13px] text-muted">
            {weekRange(week.start_date)} · {week.id === activeWeek?.id ? 'en cours' : 'clôturée'}
          </p>
          <button
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-white/5 disabled:opacity-30"
            disabled={weekIdx === 0}
            onClick={() => setWeekIdx((i) => i - 1)}
            aria-label="Semaine suivante"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      {tab === 'week' && week && !weekRows ? (
        <div className="grid place-items-center py-10">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Trophy} title="Classement vide">
          {tab === 'week' ? 'Aucune semaine jouée pour le moment.' : 'Aucun participant inscrit pour le moment.'}
        </EmptyState>
      ) : (
        <Table rows={rows} myId={me?.id} prevRank={tab === 'general' ? prevRank : undefined} />
      )}
      <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
        Victoire 3 pts · Nul 1 pt · Défaite 0 pt · Exempt {tournament?.bye_points ?? 0} pt. Égalité départagée par le nombre de victoires
        {tab === 'general' && ', puis par le Buchholz (points cumulés des adversaires rencontrés)'}.
      </p>
    </>
  )
}

function Table({ rows, myId, prevRank }: { rows: StandingRow[]; myId?: string; prevRank?: Map<string, number> }) {
  const { avatarOf } = useChampionship()
  const leaderPoints = useMemo(() => rows[0]?.points ?? 0, [rows])
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-[1.4rem_1fr_repeat(4,1.35rem)_2.1rem] items-center gap-1 border-b border-white/[0.06] px-3 py-2.5 text-[11px] font-semibold tracking-wide text-faint uppercase">
        <span>#</span>
        <span>Joueur</span>
        <span className="text-center" title="Matchs joués">J</span>
        <span className="text-center" title="Victoires">V</span>
        <span className="text-center" title="Nuls">N</span>
        <span className="text-center" title="Défaites">D</span>
        <span className="text-right">Pts</span>
      </div>
      <ol>
        {rows.map((r, i) => {
          const mine = r.participant_id === myId
          return (
            <li key={r.participant_id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              <Link
                to={`/joueurs/${r.participant_id}`}
                className={cx(
                  'grid grid-cols-[1.4rem_1fr_repeat(4,1.35rem)_2.1rem] items-center gap-1 border-b border-white/[0.04] px-3 py-2.5 text-[14px] transition-colors hover:bg-white/[0.03]',
                  mine && 'border-l-2 border-l-gold-400 bg-gold-400/10',
                )}
              >
                <span className={cx('font-display text-[16px] font-bold', r.rank <= 3 ? 'text-gold-300' : 'text-muted')}>
                  {r.rank}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="hidden min-[360px]:block"><Avatar name={r.display_name} color={r.avatar_color} size={26} src={avatarOf(r.profile_id)} /></span>
                  <span className={cx('truncate font-medium', r.participant_status === 'suspended' && 'text-faint line-through')}>
                    {r.display_name}
                  </span>
                  {r.rank === 1 && r.points > 0 && r.points === leaderPoints && (
                    <Crown size={15} className="shrink-0 text-gold-400" aria-label="Leader" />
                  )}
                  <RankMove before={prevRank?.get(r.participant_id)} now={r.rank} />
                </span>
                <span className="text-center text-muted">{r.played}</span>
                <span className="text-center text-win">{r.wins}</span>
                <span className="text-center text-draw">{r.draws}</span>
                <span className="text-center text-loss">{r.losses}</span>
                <span className="text-right font-display text-[17px] font-bold">{r.points}</span>
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function RankMove({ before, now }: { before?: number; now: number }) {
  if (!before || before === now) return null
  const up = before > now
  return (
    <span
      className={cx('inline-flex shrink-0 items-center text-[11px] font-semibold', up ? 'text-win' : 'text-loss')}
      title={up ? `Gagne ${before - now} place(s) depuis la semaine dernière` : `Perd ${now - before} place(s)`}
    >
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(before - now)}
    </span>
  )
}
