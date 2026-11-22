import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, Check, ChevronDown, ChevronRight, Clock, Flag, Lock, Play, ShieldAlert, Shuffle, Trash2, UserPlus, Users } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { admin } from '../lib/api'
import { ErrorBox, PageLoader, Spinner, cx } from '../components/ui'
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
  const { loading, tournament, participants, profiles, activeWeek, matches, weeks, roundById, reload } = useChampionship()
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
          <div className="card flex items-center gap-3 px-4 py-3.5">
            <Flag size={20} className="text-gold-400" />
            <p className="text-[14px] text-muted">
              « {tournament.name} » est terminé. Le classement reste consultable. Créez le prochain championnat ci-dessous.
            </p>
          </div>
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
        <WhatsAppSetting />
      </div>
    )
  }

  const enrolled = new Set(participants.map((p) => p.profile_id))
  const active = participants.filter((p) => p.status === 'active').length
  const toEnroll = [...profiles.values()].filter((p) => p.role !== 'admin' && p.is_active && !enrolled.has(p.id)).length
  const weekMatches = activeWeek
    ? matches.filter((m) => roundById.get(m.round_id)?.week_id === activeWeek.id)
    : []
  const n = (s: string) => weekMatches.filter((m) => m.status === s).length
  const pending = matches.filter((m) => m.status === 'pending').length
  const disputed = matches.filter((m) => m.status === 'disputed').length
  const settled = n('validated') + n('unplayed')
  const isDraft = tournament.status === 'draft'

  return (
    <div className="space-y-4">
      {/* En-tête du championnat */}
      <div className="card relative overflow-hidden px-4 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-[radial-gradient(circle,rgba(245,184,61,0.18),transparent_65%)]"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-wide text-faint uppercase">Championnat</p>
            <h2 className="font-display text-[24px] leading-tight font-bold">{tournament.name}</h2>
          </div>
          <span
            className={cx(
              'shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold',
              isDraft ? 'bg-gold-400/15 text-gold-300' : 'bg-win/15 text-win',
            )}
          >
            {isDraft ? 'En préparation' : 'En cours'}
          </span>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <Kpi value={active} label="joueurs actifs" />
          <Kpi value={weeks.length} label={weeks.length > 1 ? 'semaines' : 'semaine'} />
          <Kpi value={matches.filter((m) => m.status === 'validated').length} label="matchs validés" />
        </div>
      </div>

      <ErrorBox>{error}</ErrorBox>

      {/* Prochaine étape : une seule action mise en avant */}
      {isDraft ? (
        <NextStep title="Préparer le lancement">
          <ol className="space-y-2.5">
            <Step done label="Règles définies" hint="Modifiables jusqu'au lancement (ci-dessous)." />
            <Step
              done={active >= 2}
              label={`Inscrire les joueurs (${active} inscrit${active > 1 ? 's' : ''})`}
              hint={toEnroll ? `${toEnroll} compte(s) en attente d'inscription` : 'Au moins 2 joueurs'}
              action={
                <Link to="/admin/joueurs" className="btn-ghost px-3 py-1.5 text-[13px]">
                  <Users size={15} /> Joueurs
                </Link>
              }
            />
            <Step done={false} label="Démarrer le championnat" hint="Les règles seront figées." />
          </ol>
          <button
            className="btn-gold mt-4 w-full"
            disabled={busy || active < 2}
            onClick={() => run(() => admin.startTournament(tournament.id))}
          >
            {busy ? <Spinner className="text-night-950" /> : <Play size={18} />} Démarrer le championnat
          </button>
        </NextStep>
      ) : !activeWeek ? (
        <NextStep title={`Publier le tirage de la ${weekLabel(weeks.length + 1)}`}>
          <p className="text-[14px] text-muted">
            {weeks.length === 0
              ? 'Première semaine : tirage au sort intégral. Les joueurs seront notifiés.'
              : 'La semaine précédente est clôturée. Prévisualisez le tirage suisse, puis publiez-le.'}
          </p>
          <Link to="/admin/semaines" className="btn-gold mt-4 w-full">
            <Shuffle size={18} /> Préparer le tirage
          </Link>
        </NextStep>
      ) : (
        <NextStep title={`${weekLabel(activeWeek.number)} en cours`} subtitle={weekRange(activeWeek.start_date)}>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
              <span className="text-muted">Matchs réglés</span>
              <span className="font-display text-[18px] font-bold">
                {settled}
                <span className="text-[13px] font-normal text-faint"> / {weekMatches.length}</span>
              </span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="bg-win" style={{ width: pct(n('validated'), weekMatches.length) }} />
              <div className="bg-[#8b7cff]" style={{ width: pct(n('pending'), weekMatches.length) }} />
              <div className="bg-loss" style={{ width: pct(n('disputed'), weekMatches.length) }} />
              <div className="bg-white/25" style={{ width: pct(n('unplayed'), weekMatches.length) }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
              <Legend color="bg-win" label={`${n('validated')} validés`} />
              <Legend color="bg-[#8b7cff]" label={`${n('pending')} en attente`} />
              <Legend color="bg-loss" label={`${n('disputed')} contestés`} />
              <Legend color="bg-white/25" label={`${n('scheduled')} à jouer`} />
            </div>
          </div>
          <Link to="/admin/semaines" className="btn-gold mt-4 w-full">
            <CalendarDays size={18} /> {pending + disputed > 0 ? 'Suivre la semaine' : 'Suivre et clôturer la semaine'}
          </Link>
        </NextStep>
      )}

      {/* À traiter */}
      {(disputed > 0 || pending > 0 || (!isDraft && toEnroll > 0)) && (
        <section className="space-y-2">
          <h3 className="px-1 text-[12px] font-semibold tracking-wide text-faint uppercase">À traiter</h3>
          {disputed > 0 && (
            <TodoLink
              to="/admin/matchs?statut=disputed"
              icon={AlertTriangle}
              tone="loss"
              label={`${disputed} contestation${disputed > 1 ? 's' : ''} à arbitrer`}
            />
          )}
          {pending > 0 && (
            <TodoLink
              to="/admin/matchs?statut=pending"
              icon={Clock}
              tone="violet"
              label={`${pending} résultat${pending > 1 ? 's' : ''} en attente de confirmation`}
            />
          )}
          {!isDraft && toEnroll > 0 && (
            <TodoLink to="/admin/joueurs?filtre=a-inscrire" icon={UserPlus} tone="gold" label={`${toEnroll} compte(s) à inscrire`} />
          )}
        </section>
      )}

      {/* Règles */}
      {isDraft ? (
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
      ) : (
        <AdminCard title="Règles du championnat" action={<Lock size={15} className="text-faint" aria-label="Figées" />}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
            <Info label="Barème" value="3 / 1 / 0" />
            <Info label="Exempt" value={`${tournament.bye_points} pt${tournament.bye_points > 1 ? 's' : ''}`} />
            <Info
              label="Parties Chess.com"
              value={`${tournament.chesscom_time_classes.map((c) => TIME_CLASS_LABEL[c]).join(', ')}} · classées`}
            />
            <Info label="Fuseau horaire" value={tournament.timezone} />
          </dl>
        </AdminCard>
      )}

      <WhatsAppSetting />

      {/* Zone sensible, repliée */}
      <details className="group card px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-semibold text-muted">
          <span className="flex items-center gap-2">
            <ShieldAlert size={16} /> Zone sensible
          </span>
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-3">
          {tournament.status === 'active' && (
            <div className="rounded-xl border border-white/[0.06] p-3">
              <p className="text-[14px] font-medium">Terminer le championnat</p>
              <p className="mt-0.5 mb-2.5 text-[13px] text-muted">
                Après clôture de la dernière semaine. Le classement reste consultable.
              </p>
              <button
                className="btn-danger px-3 py-2 text-[14px]"
                disabled={busy || !!activeWeek}
                title={activeWeek ? 'Clôturez d’abord la semaine en cours' : undefined}
                onClick={() => {
                  if (window.confirm('Terminer définitivement le championnat ?')) void run(() => admin.finishTournament(tournament.id))
                }}
              >
                <Flag size={16} /> Terminer
              </button>
            </div>
          )}
          {weeks.length === 0 && (
            <DeleteTournament name={tournament.name} busy={busy} onDelete={(confirm) => run(() => admin.deleteTournament(tournament.id, confirm))} />
          )}
        </div>
      </details>
    </div>
  )
}

const pct = (part: number, total: number) => (total ? `${(part / total) * 100}%` : '0%')

function Kpi({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
      <p className="font-display text-[24px] leading-none font-bold text-gold-300">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{label}</p>
    </div>
  )
}

function NextStep({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card border-gold-400/25 bg-linear-to-b from-gold-400/[0.07] to-transparent px-4 py-4">
      <p className="text-[12px] font-semibold tracking-wide text-gold-300 uppercase">Prochaine étape</p>
      <h2 className="font-display text-[20px] font-bold">{title}</h2>
      {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Step({ done, label, hint, action }: { done: boolean; label: string; hint?: string; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cx(
          'grid size-6 shrink-0 place-items-center rounded-full border',
          done ? 'border-win/50 bg-win/15 text-win' : 'border-white/15 text-faint',
        )}
      >
        {done ? <Check size={14} /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[14px]', done && 'text-muted')}>{label}</span>
        {hint && <span className="block text-[12px] text-faint">{hint}</span>}
      </span>
      {action}
    </li>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx('size-2 rounded-full', color)} />
      {label}
    </span>
  )
}

const TONES = {
  loss: 'border-loss/40 text-loss',
  violet: 'border-[#8b7cff]/40 text-[#b3a9ff]',
  gold: 'border-gold-400/40 text-gold-300',
}

function TodoLink({ to, icon: Icon, label, tone }: { to: string; icon: typeof Clock; label: string; tone: keyof typeof TONES }) {
  return (
    <Link to={to} className={cx('card card-hover flex items-center gap-3 px-4 py-3', TONES[tone])}>
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 text-[14px] text-ink">{label}</span>
      <ChevronRight size={16} className="text-faint" />
    </Link>
  )
}

function DeleteTournament({ name, busy, onDelete }: { name: string; busy: boolean; onDelete: (confirm: string) => void }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const matches = confirm.trim().toLowerCase() === name.trim().toLowerCase()
  return (
    <div className="rounded-xl border border-loss/20 p-3">
      <p className="text-[14px] font-medium">Supprimer le championnat</p>
      <p className="mt-0.5 mb-2.5 text-[13px] text-muted">
        Pour un championnat créé par erreur. Possible uniquement tant qu'aucun tirage n'a été publié. Les inscriptions
        sont supprimées, les comptes des joueurs sont conservés. <strong className="text-ink">Action définitive.</strong>
      </p>
      {!open ? (
        <button className="btn-danger px-3 py-2 text-[14px]" onClick={() => setOpen(true)}>
          <Trash2 size={16} /> Supprimer…
        </button>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="label">
              Pour confirmer, tapez le nom du championnat : <strong className="text-ink">{name}</strong>
            </span>
            <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost text-[15px]" onClick={() => (setOpen(false), setConfirm(''))}>
              Annuler
            </button>
            <button className="btn-danger text-[15px]" disabled={busy || !matches} onClick={() => onDelete(confirm)}>
              <Trash2 size={17} /> Supprimer définitivement
            </button>
          </div>
        </div>
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
  const ratedOnly = true // règle fixe : seules les parties classées comptent
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
          <p className="mt-2 text-[12px] text-faint">
            Seules les parties classées, avec les couleurs du tirage, sont retenues. Les autres sont des parties amicales.
          </p>
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

/** Lien du groupe WhatsApp de la classe : modifiable à tout moment. */
function WhatsAppSetting() {
  const { whatsappUrl, reload } = useChampionship()
  const [value, setValue] = useState(whatsappUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = value.trim() !== (whatsappUrl ?? '')

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      await admin.setSetting('whatsapp_group_url', value.trim())
      await reload()
      setMsg({ ok: true, text: value.trim() ? 'Lien enregistré' : 'Lien retiré' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminCard title="Groupe WhatsApp">
      <p className="mb-3 text-[13px] text-muted">
        Lien d'invitation du groupe de la classe. Il apparaît dans chaque partage (« Ouvrir le groupe ») pour publier
        tirages, résultats, classements et récompenses. Modifiable à tout moment.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input"
          inputMode="url"
          placeholder="https://chat.whatsapp.com/…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn-gold shrink-0 px-4 py-2.5 text-[15px]" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? <Spinner className="text-night-950" /> : 'Enregistrer'}
        </button>
      </div>
      {msg && <p className={cx('mt-2 text-[13px]', msg.ok ? 'text-win' : 'text-loss')}>{msg.text}</p>}
    </AdminCard>
  )
}
