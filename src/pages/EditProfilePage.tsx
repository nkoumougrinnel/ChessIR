import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../state/auth'
import { useChampionship } from '../state/championship'
import { updateMyProfile } from '../lib/api'
import { friendlyError } from '../lib/supabase'
import { AVATAR_COLORS, Avatar, ErrorBox, PageHeader, PageLoader, Spinner, cx } from '../components/ui'
import type { AvatarColor } from '../lib/types'

export default function EditProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const { reload, me } = useChampionship()
  const navigate = useNavigate()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [chess, setChess] = useState(profile?.chesscom_username ?? '')
  const [elo, setElo] = useState(profile?.declared_elo?.toString() ?? '')
  const [color, setColor] = useState<AvatarColor>(profile?.avatar_color ?? 'violet')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!profile) return <PageLoader />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updateMyProfile(profile!.id, {
        display_name: name.trim(),
        chesscom_username: chess.trim() || null,
        declared_elo: elo === '' ? null : Number(elo),
        avatar_color: color,
      })
      await Promise.all([refreshProfile(), reload()])
      navigate('/profil')
    } catch (err) {
      setError(friendlyError((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Modifier mon profil" back="/profil" />
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <Avatar name={name || '?'} color={color} size={88} ring />
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Couleur de l'avatar">
            {AVATAR_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cx('rounded-full p-0.5 transition', color === c ? 'ring-2 ring-gold-400' : 'opacity-70 hover:opacity-100')}
              >
                <Avatar name={name || '?'} color={c} size={30} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="name">
            Nom ou pseudonyme
          </label>
          <input id="name" className="input" required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="chess">
            Pseudo Chess.com
          </label>
          <input
            id="chess"
            className="input"
            value={chess}
            onChange={(e) => setChess(e.target.value)}
            pattern="[A-Za-z0-9_\-]{3,25}"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <p className="mt-1 text-[12px] text-faint">Indispensable pour que vos adversaires vous trouvent.</p>
        </div>
        <div>
          <label className="label" htmlFor="elo">
            Elo déclaré (Chess.com)
          </label>
          <input
            id="elo"
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={3500}
            value={elo}
            onChange={(e) => setElo(e.target.value)}
            placeholder="Laisser vide si vous n'avez pas d'Elo"
          />
          {me && (
            <p className="mt-1 text-[12px] text-faint">
              Votre Elo initial pour le championnat a été enregistré à l'inscription ({me.initial_elo ?? 'aucun'}).
              Seul l'administrateur peut le corriger.
            </p>
          )}
        </div>

        <ErrorBox>{error}</ErrorBox>
        <button type="submit" className="btn-gold w-full" disabled={busy}>
          {busy ? <Spinner className="text-night-950" /> : 'Enregistrer'}
        </button>
      </form>
    </>
  )
}
