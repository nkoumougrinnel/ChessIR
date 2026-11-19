import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { fetchWeekStandings } from '../lib/api'
import { computeStandings } from '../lib/scoring'
import type { StandingRow } from '../lib/types'
import { PageLoader } from '../components/ui'
import { AdminCard } from './AdminLayout'

export default function AdminStandings() {
  const { loading, standings, weeks, participants, matches, byes, nameOf, reload } = useChampionship()
  const [weekId, setWeekId] = useState<string>('general')
  const [weekRows, setWeekRows] = useState<StandingRow[]>([])
  const [check, setCheck] = useState<{ ok: boolean; diffs: string[] } | null>(null)

  useEffect(() => {
    if (weekId === 'general') return
    fetchWeekStandings(weekId).then(setWeekRows).catch(() => setWeekRows([]))
  }, [weekId, standings])

  if (loading) return <PageLoader />
  const rows = weekId === 'general' ? standings : weekRows

  /** Recalcule le classement à partir des matchs bruts et le compare à la vue SQL. */
  async function verify() {
    await reload()
    const recomputed = computeStandings(
      participants.map((p) => ({ id: p.id, name: nameOf(p.id) })),
      matches,
      byes.map((b) => ({ participant_id: b.participant_id, points: b.points })),
    )
    const diffs: string[] = []
    for (const r of recomputed) {
      const s = standings.find((x) => x.participant_id === r.participant_id)
      if (!s) {
        diffs.push(`${nameOf(r.participant_id)} absent de la vue`)
        continue
      }
      for (const k of ['points', 'played', 'wins', 'draws', 'losses', 'byes', 'rank'] as const) {
        if (s[k] !== r[k]) diffs.push(`${nameOf(r.participant_id)} : ${k} = ${s[k]} (attendu ${r[k]})`)
      }
    }
    const totalPoints = recomputed.reduce((a, r) => a + r.points, 0)
    const expected =
      matches.filter((m) => m.status === 'validated').reduce((a, m) => a + (m.result === 'draw' ? 2 : 3), 0) +
      byes.reduce((a, b) => a + b.points, 0)
    if (totalPoints !== expected) diffs.push(`Total des points ${totalPoints} ≠ ${expected} attendus`)
    setCheck({ ok: diffs.length === 0, diffs })
  }

  return (
    <div className="space-y-4">
      <AdminCard
        title="Vérification des calculs"
        action={
          <button className="btn-ghost px-3 py-1.5 text-[14px]" onClick={() => void verify()}>
            <RefreshCw size={15} /> Vérifier
          </button>
        }
      >
        <p className="text-[13px] text-muted">
          Recalcule indépendamment le classement à partir des seuls matchs validés et des exemptions, puis le compare au
          classement officiel.
        </p>
        {check && (
          <div className={`mt-3 rounded-xl px-4 py-3 text-[14px] ${check.ok ? 'bg-win/10 text-win' : 'bg-loss/10 text-loss'}`}>
            {check.ok ? (
              <p className="flex items-center gap-2">
                <CheckCircle2 size={18} /> Classement cohérent ({standings.length} joueurs).
              </p>
            ) : (
              <>
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle size={18} /> Écarts détectés
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {check.diffs.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </AdminCard>

      <AdminCard
        title="Classement"
        action={
          <select className="input w-auto py-1.5 text-[14px]" value={weekId} onChange={(e) => setWeekId(e.target.value)} aria-label="Classement">
            <option value="general">Général</option>
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                Semaine {w.number}
              </option>
            ))}
          </select>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] text-faint uppercase">
              <tr>
                <th className="py-1.5 pr-2">#</th>
                <th className="pr-2">Joueur</th>
                <th className="px-1 text-center">J</th>
                <th className="px-1 text-center">V</th>
                <th className="px-1 text-center">N</th>
                <th className="px-1 text-center">D</th>
                <th className="px-1 text-center">Ex.</th>
                {weekId === 'general' && <th className="px-1 text-center">Bh</th>}
                <th className="pl-1 text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.participant_id} className="border-t border-white/[0.05]">
                  <td className="py-1.5 pr-2 text-muted">{r.rank}</td>
                  <td className="pr-2">
                    {r.display_name}
                    {r.participant_status === 'suspended' && <span className="ml-1 text-[11px] text-loss">(suspendu)</span>}
                  </td>
                  <td className="px-1 text-center">{r.played}</td>
                  <td className="px-1 text-center text-win">{r.wins}</td>
                  <td className="px-1 text-center text-draw">{r.draws}</td>
                  <td className="px-1 text-center text-loss">{r.losses}</td>
                  <td className="px-1 text-center text-muted">{r.byes}</td>
                  {weekId === 'general' && <td className="px-1 text-center text-muted">{r.buchholz}</td>}
                  <td className="pl-1 text-right font-semibold">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  )
}
