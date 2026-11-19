import { useState } from 'react'
import { Award, Trash2 } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { usePlayerAchievements, achievementIcon } from '../components/achievements'
import { admin } from '../lib/api'
import { ErrorBox, PageLoader, Spinner } from '../components/ui'
import { AdminCard } from './AdminLayout'

export default function AdminAwards() {
  const { loading, tournament, participants, achievements, weeks, nameOf, weekById, reload } = useChampionship()
  const [version, setVersion] = useState(0)
  const awards = usePlayerAchievements({ tournamentId: tournament?.id }, version)
  const [pid, setPid] = useState('')
  const [code, setCode] = useState('')
  const [weekId, setWeekId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading || awards === null) return <PageLoader />
  const byId = new Map(achievements.map((a) => [a.id, a]))
  const selected = achievements.find((a) => a.code === code)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await reload()
      setVersion(version + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <AdminCard title="Attribuer une distinction">
        <p className="mb-3 text-[13px] text-muted">
          Les distinctions et badges sont attribués automatiquement. Utilisez ce formulaire uniquement à titre
          exceptionnel (correction, geste fair-play remarquable…).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="input" value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Participant">
            <option value="">Participant…</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {nameOf(p.id)}
              </option>
            ))}
          </select>
          <select className="input" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Distinction">
            <option value="">Distinction ou badge…</option>
            {achievements.map((a) => (
              <option key={a.id} value={a.code}>
                {a.name} ({a.kind === 'distinction' ? 'hebdo' : 'badge'})
              </option>
            ))}
          </select>
          {selected?.kind === 'distinction' && (
            <select className="input" value={weekId} onChange={(e) => setWeekId(e.target.value)} aria-label="Semaine">
              <option value="">Semaine…</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  Semaine {w.number}
                </option>
              ))}
            </select>
          )}
          <input className="input" placeholder="Motif" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
        <button
          className="btn-gold mt-3"
          disabled={busy || !pid || !code || note.trim().length < 3 || (selected?.kind === 'distinction' && !weekId)}
          onClick={() =>
            run(async () => {
              await admin.award(pid, code, selected?.kind === 'distinction' ? weekId : null, note.trim())
              setNote('')
            })
          }
        >
          {busy ? <Spinner className="text-night-950" /> : <Award size={17} />} Attribuer
        </button>
      </AdminCard>

      <AdminCard title={`Distinctions attribuées (${awards.length})`}>
        {awards.length === 0 ? (
          <p className="text-[13px] text-muted">Aucune pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {awards.map((pa) => {
              const a = byId.get(pa.achievement_id)!
              const Icon = achievementIcon(a.icon)
              return (
                <li key={pa.id} className="flex items-center gap-3 py-2 text-[14px]">
                  <Icon size={17} className="shrink-0 text-gold-400" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{nameOf(pa.participant_id)}</span> · {a.name}
                    {pa.week_id && <span className="text-muted"> · S{weekById.get(pa.week_id)?.number}</span>}
                    {pa.awarded_by && <span className="text-[12px] text-gold-300"> · manuelle{pa.note && ` : ${pa.note}`}</span>}
                  </span>
                  <button
                    className="grid size-8 place-items-center rounded-lg text-faint hover:bg-loss/10 hover:text-loss"
                    aria-label="Retirer"
                    title="Retirer"
                    onClick={() => {
                      if (window.confirm(`Retirer « ${a.name} » à ${nameOf(pa.participant_id)} ?`)) void run(() => admin.revokeAward(pa.id))
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </AdminCard>
    </div>
  )
}
