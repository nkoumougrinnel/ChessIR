import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BadgeCheck, BarChart3, Pencil, Plus, UserPlus, RefreshCw, Search, UserCheck, UserMinus, X, XCircle } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { admin, chesscom } from '../lib/api'
import type { Participant, Profile } from '../lib/types'
import { Avatar, ErrorBox, PageLoader, Spinner, cx } from '../components/ui'
import { friendlyError } from '../lib/supabase'

type Filter = 'tous' | 'inscrits' | 'a-inscrire' | 'suspendus'
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'tous', label: 'Tous' },
  { value: 'inscrits', label: 'Inscrits' },
  { value: 'a-inscrire', label: 'À inscrire' },
  { value: 'suspendus', label: 'Suspendus' },
]

export default function AdminPlayers() {
  const { loading, tournament, profiles, participants, standings, reload, avatarOf, chesscomProfiles } = useChampionship()
  const [q, setQ] = useState('')
  const [params, setParams] = useSearchParams()
  const filter = (params.get('filtre') as Filter | null) ?? 'tous'
  const [editing, setEditing] = useState<Profile | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <PageLoader />

  const byProfile = new Map(participants.map((p) => [p.profile_id, p]))
  const all = [...profiles.values()]
  const isToEnroll = (p: Profile) => p.role !== 'admin' && p.is_active && !byProfile.has(p.id)
  const matchesFilter: Record<Filter, (p: Profile) => boolean> = {
    tous: () => true,
    inscrits: (p) => byProfile.get(p.id)?.status === 'active',
    'a-inscrire': isToEnroll,
    suspendus: (p) => byProfile.get(p.id)?.status === 'suspended' || !p.is_active,
  }
  const toEnroll = all.filter(isToEnroll)
  const list = all
    .filter(matchesFilter[filter])
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
        Chaque joueur crée son compte dans l'application, puis vous l'inscrivez au championnat. Un participant suspendu
        n'est plus tiré au sort mais reste au classement.
      </p>

      {canEnroll && toEnroll.length > 0 && (
        <div className="card flex flex-wrap items-center gap-3 border-gold-400/30 px-4 py-3">
          <UserPlus size={20} className="text-gold-300" />
          <p className="min-w-0 flex-1 text-[14px]">
            <strong>{toEnroll.length}</strong> compte{toEnroll.length > 1 ? 's' : ''} en attente d'inscription
          </p>
          <button
            className="btn-gold px-3 py-2 text-[14px]"
            disabled={busy === 'all'}
            onClick={() => {
              if (!window.confirm(`Inscrire ${toEnroll.length} joueur(s) au championnat « ${tournament!.name} » ?`)) return
              void run('all', async () => {
                for (const p of toEnroll) await admin.addParticipant(tournament!.id, p.id)
              })
            }}
          >
            {busy === 'all' ? <Spinner className="text-night-950" /> : <Plus size={16} />} Tout inscrire
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = all.filter(matchesFilter[f.value]).length
          return (
            <button
              key={f.value}
              onClick={() => {
                const next = new URLSearchParams(params)
                if (f.value === 'tous') next.delete('filtre')
                else next.set('filtre', f.value)
                setParams(next, { replace: true })
              }}
              className={cx(
                'rounded-full px-3 py-1 text-[13px] font-medium',
                filter === f.value ? 'bg-gold-400 text-night-950' : 'bg-white/5 text-muted hover:text-ink',
              )}
            >
              {f.label} ({count})
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
        <input className="input pl-10" placeholder="Rechercher un joueur" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorBox>{error}</ErrorBox>
      {list.length === 0 && <p className="card px-4 py-5 text-center text-[14px] text-muted">Aucun joueur dans cette liste.</p>}

      <ul className="space-y-2">
        {list.map((p) => {
          const part = byProfile.get(p.id)
          const st = part && standings.find((s) => s.participant_id === part.id)
          return (
            <li key={p.id} className={cx('card flex flex-wrap items-center gap-3 px-3.5 py-3', !p.is_active && 'opacity-60')}>
              <Avatar name={p.display_name} color={p.avatar_color} size={38} src={avatarOf(p.id)} />
              <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto">
                <p className="truncate font-medium">
                  {p.display_name}
                  {p.role === 'admin' && <span className="ml-2 text-[11px] text-gold-400">admin</span>}
                  {!p.is_active && <span className="ml-2 text-[11px] text-loss">compte suspendu</span>}
                </p>
                <p className="truncate text-[12px] text-muted">
                  <ChesscomStatus status={p.chesscom_username ? chesscomProfiles.get(p.id)?.status : undefined} />
                  {p.chesscom_username ? `@${p.chesscom_username}` : 'pas de pseudo Chess.com'} · Elo{' '}
                  {part?.initial_elo ?? p.declared_elo ?? '—'}
                  {st && ` · ${st.points} pts (#${st.rank}) · ${st.wins}V ${st.draws}N ${st.losses}D`}
                </p>
              </div>
              <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
                {part && (
                  <Link to={`/joueurs/${part.id}`} className="grid size-9 place-items-center rounded-lg bg-white/5 hover:bg-white/10" title="Statistiques">
                    <BarChart3 size={16} />
                  </Link>
                )}
                {p.chesscom_username && (
                  <button
                    className="grid size-9 place-items-center rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50"
                    title="Resynchroniser avec Chess.com"
                    disabled={busy === `cc-${p.id}`}
                    onClick={() => run(`cc-${p.id}`, async () => void (await chesscom({ action: 'sync-profile', profile_id: p.id, force: true })))}
                  >
                    {busy === `cc-${p.id}` ? <Spinner className="size-4" /> : <RefreshCw size={15} />}
                  </button>
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

function ChesscomStatus({ status }: { status?: 'verified' | 'not_found' | 'error' }) {
  if (status === 'verified') return <BadgeCheck size={12} className="mr-1 inline text-win" aria-label="Pseudo vérifié" />
  if (status === 'not_found') return <XCircle size={12} className="mr-1 inline text-loss" aria-label="Pseudo introuvable" />
  return null
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
      // Pseudo : vérifié auprès de Chess.com et tracé (l'admin peut le changer même en cours de championnat).
      if (chess.trim().toLowerCase() !== (profile.chesscom_username ?? '').toLowerCase()) {
        await chesscom({ action: 'set-username', profile_id: profile.id, username: chess.trim() })
      }
      await admin.updateProfile({
        id: profile.id,
        display_name: name,
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
        <Field label="Pseudo Chess.com (vérifié auprès de Chess.com, modification tracée)">
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
