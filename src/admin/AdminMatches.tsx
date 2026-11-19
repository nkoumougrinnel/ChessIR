import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useChampionship, useMatchViews } from '../state/championship'
import { PageLoader, StatusBadge, cx } from '../components/ui'
import { dayShort, ddmm, STATUS_LABEL } from '../lib/format'
import type { MatchStatus } from '../lib/types'

const FILTERS: Array<MatchStatus | 'all'> = ['all', 'disputed', 'pending', 'scheduled', 'validated', 'unplayed']

export default function AdminMatches() {
  const { loading, weeks, nameOf } = useChampionship()
  const views = useMatchViews()
  const [params, setParams] = useSearchParams()
  const status = (params.get('statut') as MatchStatus | null) ?? 'all'
  const weekId = params.get('semaine') ?? 'all'

  if (loading) return <PageLoader />

  const filtered = views.filter(
    (v) => (status === 'all' || v.match.status === status) && (weekId === 'all' || v.week.id === weekId),
  )
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v === 'all') next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const n = f === 'all' ? views.length : views.filter((v) => v.match.status === f).length
          return (
            <button
              key={f}
              onClick={() => set('statut', f)}
              className={cx(
                'rounded-full px-3 py-1 text-[13px] font-medium',
                status === f ? 'bg-gold-400 text-night-950' : 'bg-white/5 text-muted hover:text-ink',
              )}
            >
              {f === 'all' ? 'Tous' : STATUS_LABEL[f]} ({n})
            </button>
          )
        })}
      </div>
      <select className="input w-auto py-2 text-[14px]" value={weekId} onChange={(e) => set('semaine', e.target.value)} aria-label="Semaine">
        <option value="all">Toutes les semaines</option>
        {weeks.map((w) => (
          <option key={w.id} value={w.id}>
            Semaine {w.number}
          </option>
        ))}
      </select>

      {filtered.length === 0 ? (
        <p className="card px-4 py-6 text-center text-[14px] text-muted">Aucun match.</p>
      ) : (
        <ul className="card divide-y divide-white/[0.05]">
          {filtered.map((v) => (
            <li key={v.match.id}>
              <Link to={`/admin/matchs/${v.match.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-white/[0.03]">
                <span className="w-24 shrink-0 text-[12px] text-faint">
                  S{v.week.number} · R{v.round.number}
                  <br />
                  {dayShort(v.round.play_date)} {ddmm(v.round.play_date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px]">
                  <span className={cx(v.match.result === 'white_win' && 'font-semibold text-win')}>{nameOf(v.match.white_id)}</span>
                  <span className="text-faint"> – </span>
                  <span className={cx(v.match.result === 'black_win' && 'font-semibold text-win')}>{nameOf(v.match.black_id)}</span>
                  {v.match.result === 'draw' && <span className="text-draw"> (nul)</span>}
                </span>
                <StatusBadge status={v.match.status} />
                <ChevronRight size={16} className="text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
