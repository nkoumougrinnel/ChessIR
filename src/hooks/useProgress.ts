import { useEffect, useMemo, useState } from 'react'
import { fetchSnapshots } from '../lib/api'
import type { Snapshot } from '../lib/types'
import { useChampionship } from '../state/championship'
import type { ProgressPoint } from '../components/ProgressChart'

/**
 * Progression d'un participant : une photo du classement par semaine clôturée,
 * plus le classement en direct de la semaine en cours.
 */
export function useProgress(participantId: string | null | undefined) {
  const { weeks, standings, activeWeek, matches } = useChampionship()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])

  useEffect(() => {
    if (!participantId) return
    let alive = true
    fetchSnapshots(participantId)
      .then((s) => alive && setSnapshots(s))
      .catch(() => alive && setSnapshots([]))
    return () => {
      alive = false
    }
    // `weeks` : recharger après une clôture de semaine.
  }, [participantId, weeks])

  return useMemo(() => {
    const live = standings.find((s) => s.participant_id === participantId)
    const byWeek = new Map(snapshots.map((s) => [s.week_id, s]))
    const points: ProgressPoint[] = [...weeks]
      .reverse()
      .filter((w) => byWeek.has(w.id))
      .map((w) => ({ label: `S${w.number}`, points: byWeek.get(w.id)!.points, rank: byWeek.get(w.id)!.rank }))
    if (activeWeek && live) points.push({ label: `S${activeWeek.number}`, points: live.points, rank: live.rank })
    const last = points.at(-1)
    const prev = points.at(-2)
    return {
      points,
      live,
      /** Places gagnées (positif) depuis la semaine précédente. */
      rankDelta: last && prev ? prev.rank - last.rank : null,
      totalPlayers: standings.length,
      matchesCount: matches.length,
    }
  }, [snapshots, weeks, standings, activeWeek, participantId, matches.length])
}
