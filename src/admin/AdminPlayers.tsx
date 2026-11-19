import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Pencil, Plus, Search, UserCheck, UserMinus, X } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { admin } from '../lib/api'
import type { Participant, Profile } from '../lib/types'
import { Avatar, ErrorBox, PageLoader, Spinner, cx } from '../components/ui'
import { friendlyError } from '../lib/supabase'

export default function AdminPlayers() {
  const { loading, tournament, profiles, participants, standings, reload } = useChampionship()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Profile | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <PageLoader />

  const byProfile = new Map(participants.map((p) => [p.profile_id, p]))
  const list = [...profiles.values()]
    .filter((p) => p.display_name.toLowerCase().includes(q.toLowerCase()) || p.chesscom_username?.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(byProfile.has(b.id)) - Number(byProfile.has(a.id)) || a.display_name.localeCompare(b.display_name, 'fr'))

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setError(friendlyError((e as Error).message))
    } finally {
      setBusy(null)
    }
  }

  const canEnroll = tournament && tournament.status !== 'finished'

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">
        Les joueurs créent leur compte depuis l'écran d'inscription, puis vous les ajoutez au championnat. Un participant
        suspendu n'est plus inclus dans les tirages mais reste au classement.
      </p>
      <div className="relative">
        <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
        <input className="input pl-10" placeholder="Rechercher un joueur" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorBox>{error}</ErrorBox>
      <p className="text-[12px] text-faint">
        {participants.filter((p) => p.status === 'active').length} participant(s) actif(s) · {profiles.size} compte(s)
      </p>

      <ul className="space-y-2">
        {list.map((p) => {
          const part = byProfile.get(p.id)
          const st = part && standings.find((s) => s.participant_id === part.id)
          return (
            <li key={p.id} className={cx('card flex flex-wrap items-center gap-3 px-3.5 py-3', !p.is_active && 'opacity-60')}>
              <Avatar name={p.display_name} color={p.avatar_color} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {p.display_name}
                  {p.role === 'admin' && <span className="ml-2 text-[11px] text-gold-400">admin</span>}
                  {!p.is_active && <span className="ml-2 text-[11px] text-loss">compte suspendu</span>}
                </p>
                <p className="truncate text-[12px] text-muted">
                  {p.chesscom_username ? `@${p.chesscom_username}` : 'pas de pseudo Chess.com'} · Elo{' '}
                  {part?.initial_elo ?? p.declared_elo ?? '—'}
                  {st && ` · ${st.points} pts (#${st.rank}) · ${st.wins}V ${st.draws}N ${st.losses}D`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {part && (
                  <Link to={`/joueurs/${part.id}`} className="grid size-9 place-items-center rounded-lg bg-white/5 hover:bg-white/10" title="Statistiques">
                    <BarChart3 size={16} />
                  </Link>
                )}
                <button
                  className="grid size-9 place-items-center rounded-lg bg-white/5 hover:bg-white/10"
                  title="Modifier"
                  onClick={() => setEditing(p)}
                >
                  <Pencil size={16} />
                </button>
                {canEnroll && !part && (
                  <button
                    className="btn-gold px-3 py-1.5 text-[14px]"
                    disabled={busy === p.id}
                    onClick={() => run(p.id, () => admin.addParticipant(tournament!.id, p.id))}
                  >
                    {busy === p.id ? <Spinner className="text-night-950" /> : <Plus size={16} />} Inscrire
                  </button>
                )}
                {part && <ParticipationToggle part={part} busy={busy === part.id} onToggle={(s) => run(part.id, () => admin.setParticipantStatus(part.id, s))} />}
              </div>
            </li>
          )
        })}
      </ul>

      {editing && (
        <EditPlayer
          profile={editing}
          participant={byProfile.get(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}

function ParticipationToggle({ part, busy, onToggle }: { part: Participant; busy: boolean; onToggle: (s: 'active' | 'suspended') => void }) {
  return part.status === 'active' ? (
    <button className="btn-ghost px-3 py-1.5 text-[14px]" disabled={busy} onClick={() => onToggle('suspended')} title="Suspendre la participation">
      <UserMinus size={16} /> Suspendre
    </button>
  ) : (
    <button className="btn-ghost px-3 py-1.5 text-[14px] text-win" disabled={busy} onClick={() => onToggle('active')}>
      <UserCheck size={16} /> Réactiver
    </button>
  )
}

function EditPlayer({
  profile,
  participant,
  onClose,
  onSaved,
}: {
  profile: Profile
  participant?: Participant
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(profile.display_name)
  const [chess, setChess] = useState(profile.chesscom_username ?? '')
  const [elo, setElo] = useState(profile.declared_elo?.toString() ?? '')
  const [initialElo, setInitialElo] = useState(participant?.initial_elo?.toString() ?? '')
  const [active, setActive] = useState(profile.is_active)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await admin.updateProfile({
        id: profile.id,
        display_name: name,
        chesscom_username: chess || null,
        declared_elo: elo === '' ? null : Number(elo),
        is_active: active,
        initial_elo: participant && initialElo !== '' ? Number(initialElo) : null,
      })
      await onSaved()
    } catch (e) {
      setError(friendlyError((e as Error).message))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={`Modifier ${profile.display_name}`}
        className="w-full max-w-md space-y-3 rounded-t-3xl border border-white/10 bg-night-850 p-5 sm:rounded-3xl animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[20px] font-semibold">Modifier le joueur</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        <Field label="Nom">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Pseudo Chess.com">
          <input className="input" value={chess} onChange={(e) => setChess(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Elo déclaré (profil)">
            <input className="input" type="number" min={0} max={3500} value={elo} onChange={(e) => setElo(e.target.value)} />
          </Field>
          <Field label="Elo initial (championnat)">
            <input
              className="input"
              type="number"
              min={0}
              max={3500}
              disabled={!participant}
              value={initialElo}
              onChange={(e) => setInitialElo(e.target.value)}
            />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-[14px]">
          <input type="checkbox" className="size-4 accent-[#f5b83d]" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Compte actif (décocher pour bloquer toute action du joueur)
        </label>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn-gold w-full" disabled={busy} onClick={save}>
          {busy ? <Spinner className="text-night-950" /> : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}
