import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Clock, Flag, Play, Users } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { admin } from '../lib/api'
import { ErrorBox, PageLoader, Spinner } from '../components/ui'
import { AdminCard } from './AdminLayout'
import { weekLabel, weekRange } from '../lib/format'
import { TIME_CLASS_LABEL } from '../components/chesscom'

type ChesscomSettings = { timeClasses: string[]; ratedOnly: boolean; timezone: string }
const TIMEZONES = ['Africa/Douala', 'Africa/Lagos', 'Africa/Abidjan', 'Africa/Dakar', 'Europe/Paris', 'Europe/Brussels', 'America/Montreal', 'UTC']

export const BYE_RULES = [
  { value: 0, label: '0 point', help: "L'exempt ne marque rien (neutre)." },
  { value: 1, label: '1 point', help: "L'exempt marque l'équivalent d'un nul (compromis courant)." },
  { value: 3, label: '3 points', help: "L'exempt marque l'équivalent d'une victoire (avantageux)." },
] as const

export default function AdminDashboard() {
  const { loading, tournament, participants, activeWeek, matches, reload } = useChampionship()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <PageLoader />

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!tournament || tournament.status === 'finished') {
    return (
      <div className="space-y-4">
        {tournament && (
          <p className="card px-4 py-3 text-[14px] text-muted">Le championnat « {tournament.name} » est terminé.</p>
        )}
        <TournamentForm
          busy={busy}
          error={error}
          onSubmit={(name, bye, cc) =>
            run(async () => {
              const id = await admin.createTournament(name, bye)
              await admin.updateChesscomSettings(id, cc)
            })
          }
        />
      </div>
    )
  }

  const active = participants.filter((p) => p.status === 'active').length
  const pending = matches.filter((m) => m.status === 'pending').length
  const disputed = matches.filter((m) => m.status === 'disputed').length

  return (
    <div className="space-y-4">
      <AdminCard title={tournament.name}>
        <dl className="grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
          <Info label="Statut" value={{ draft: 'En préparation', active: 'En cours', finished: 'Terminé' }[tournament.status]} />
          <Info label="Participants actifs" value={String(active)} />
          <Info label="Semaine" value={activeWeek ? weekLabel(activeWeek.number) : '—'} />
          <Info label="Règle d'exemption" value={`${tournament.bye_points} pt${tournament.bye_points > 1 ? 's' : ''}`} />
          <Info
            label="Parties Chess.com retenues"
            value={`${tournament.chesscom_time_classes.map((c) => TIME_CLASS_LABEL[c]).join(', ')}${tournament.chesscom_rated_only ? ' · classées' : ' · classées ou amicales'}`}
          />
          <Info label="Fuseau horaire" value={tournament.timezone} />
        </dl>
      </AdminCard>

      <ErrorBox>{error}</ErrorBox>

      {tournament.status === 'draft' && (
        <>
          <TournamentForm
            busy={busy}
            error={null}
            initial={{
              name: tournament.name,
              bye: tournament.bye_points,
              cc: { timeClasses: tournament.chesscom_time_classes, ratedOnly: tournament.chesscom_rated_only, timezone: tournament.timezone },
            }}
            onSubmit={(name, bye, cc) =>
              run(async () => {
                await admin.updateTournament(tournament.id, name, bye)
                await admin.updateChesscomSettings(tournament.id, cc)
              })
            }
          />
          <AdminCard title="Lancer le championnat">
            <p className="mb-3 text-[14px] text-muted">
              Ajoutez d'abord les participants. Au lancement, la règle d'exemption est figée ; vous pourrez ensuite
              générer le tirage de la semaine 1 (aléatoire).
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/joueurs" className="btn-ghost text-[15px]">
                <Users size={17} /> Gérer les participants ({active})
              </Link>
              <button className="btn-gold text-[15px]" disabled={busy || active < 2} onClick={() => run(() => admin.startTournament(tournament.id))}>
                <Play size={17} /> Démarrer
              </button>
            </div>
          </AdminCard>
        </>
      )}

      {tournament.status === 'active' && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Shortcut to="/admin/semaines" icon={CalendarDays} label={activeWeek ? `${weekLabel(activeWeek.number)} · ${weekRange(activeWeek.start_date)}` : 'Générer le prochain tirage'} />
            <Shortcut to="/admin/matchs?statut=pending" icon={Clock} label={`${pending} résultat${pending > 1 ? 's' : ''} en attente`} />
            <Shortcut
              to="/admin/matchs?statut=disputed"
              icon={AlertTriangle}
              label={`${disputed} contestation${disputed > 1 ? 's' : ''}`}
              alert={disputed > 0}
            />
          </div>
          <AdminCard title="Fin du championnat">
            <p className="mb-3 text-[14px] text-muted">
              Termine définitivement le championnat (après clôture de la dernière semaine). Le classement reste consultable.
            </p>
            <button
              className="btn-danger text-[15px]"
              disabled={busy || !!activeWeek}
              onClick={() => {
                if (window.confirm('Terminer définitivement le championnat ?')) void run(() => admin.finishTournament(tournament.id))
              }}
            >
              <Flag size={17} /> Terminer le championnat
            </button>
          </AdminCard>
        </>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-faint">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function Shortcut({ to, icon: Icon, label, alert }: { to: string; icon: typeof Clock; label: string; alert?: boolean }) {
  return (
    <Link to={to} className={`card card-hover flex items-center gap-3 px-4 py-3.5 ${alert ? 'border-loss/50' : ''}`}>
      <Icon size={20} className={alert ? 'text-loss' : 'text-gold-400'} />
      <span className="text-[14px]">{label}</span>
    </Link>
  )
}

function TournamentForm({
  initial,
  busy,
  error,
  onSubmit,
}: {
  initial?: { name: string; bye: number; cc: ChesscomSettings }
  busy: boolean
  error: string | null
  onSubmit: (name: string, bye: number, cc: ChesscomSettings) => void
}) {
  const [name, setName] = useState(initial?.name ?? 'Championnat Chess IR')
  const [bye, setBye] = useState<number | null>(initial?.bye ?? null)
  const [timeClasses, setTimeClasses] = useState<string[]>(initial?.cc.timeClasses ?? ['rapid'])
  const [ratedOnly, setRatedOnly] = useState(initial?.cc.ratedOnly ?? false)
  const [timezone, setTimezone] = useState(initial?.cc.timezone ?? 'Africa/Douala')
  function submit(e: FormEvent) {
    e.preventDefault()
    if (bye !== null && timeClasses.length) onSubmit(name.trim(), bye, { timeClasses, ratedOnly, timezone })
  }
  const toggleTc = (tc: string) =>
    setTimeClasses((cur) => (cur.includes(tc) ? cur.filter((x) => x !== tc) : [...cur, tc]))
  return (
    <AdminCard title={initial ? 'Paramètres' : 'Créer le championnat'}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="tname">
            Nom
          </label>
          <input id="tname" className="input" required minLength={3} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <fieldset>
          <legend className="label">Points attribués à un exempt (nombre impair de joueurs)</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {BYE_RULES.map((r) => (
              <label
                key={r.value}
                className={`card cursor-pointer px-3 py-2.5 ${bye === r.value ? 'border-gold-400/70 bg-gold-400/10' : ''}`}
              >
                <input type="radio" name="bye" className="sr-only" checked={bye === r.value} onChange={() => setBye(r.value)} />
                <span className="block font-semibold">{r.label}</span>
                <span className="text-[12px] text-muted">{r.help}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-faint">Cette règle sera affichée aux joueurs et figée au lancement.</p>
        </fieldset>
        <fieldset>
          <legend className="label">Détection des parties Chess.com</legend>
          <div className="flex flex-wrap gap-2">
            {(['rapid', 'blitz', 'bullet', 'daily'] as const).map((tc) => (
              <label
                key={tc}
                className={`card cursor-pointer px-3 py-2 text-[14px] ${timeClasses.includes(tc) ? 'border-gold-400/70 bg-gold-400/10' : ''}`}
              >
                <input type="checkbox" className="sr-only" checked={timeClasses.includes(tc)} onChange={() => toggleTc(tc)} />
                {TIME_CLASS_LABEL[tc]}
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-[14px]">
            <input type="checkbox" className="size-4 accent-[#f5b83d]" checked={ratedOnly} onChange={(e) => setRatedOnly(e.target.checked)} />
            Parties classées uniquement (sinon les parties amicales comptent aussi)
          </label>
          <label className="mt-3 block">
            <span className="label">Fuseau horaire (bornes des semaines)</span>
            <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-[12px] text-faint">
            La cadence principale ({TIME_CLASS_LABEL[timeClasses[0] ?? 'rapid']}) sert aussi à synchroniser l'Elo des joueurs. Figé au lancement.
          </p>
        </fieldset>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn-gold" disabled={busy || bye === null || timeClasses.length === 0}>
          {busy ? <Spinner className="text-night-950" /> : initial ? 'Enregistrer' : 'Créer'}
        </button>
      </form>
    </AdminCard>
  )
}
