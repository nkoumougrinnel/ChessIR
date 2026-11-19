import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeCheck, Lock, XCircle } from 'lucide-react'
import { useAuth } from '../state/auth'
import { useChampionship } from '../state/championship'
import { chesscom, updateMyProfile } from '../lib/api'
import { friendlyError } from '../lib/supabase'
import { AVATAR_COLORS, Avatar, ErrorBox, PageHeader, PageLoader, Spinner, cx } from '../components/ui'
import { TIME_CLASS_LABEL } from '../components/chesscom'
import type { AvatarColor } from '../lib/types'

export default function EditProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const { reload, me, tournament, chesscomProfiles } = useChampionship()
  const navigate = useNavigate()
  const cc = profile ? chesscomProfiles.get(profile.id) : undefined
  const [name, setName] = useState(profile?.display_name ?? '')
  const [chess, setChess] = useState(profile?.chesscom_username ?? '')
  const [elo, setElo] = useState(profile?.declared_elo?.toString() ?? '')
  const [color, setColor] = useState<AvatarColor>(profile?.avatar_color ?? 'violet')
  const [useCcAvatar, setUseCcAvatar] = useState(profile?.use_chesscom_avatar ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!profile) return <PageLoader />

  // Pseudo figé pendant un championnat en cours (modifiable par l'admin uniquement).
  const usernameLocked = !!me && tournament?.status === 'active'
  const cadence = tournament?.chesscom_time_classes?.[0] ?? 'rapid'
  const syncedElo = cc?.status === 'verified' ? (cc.ratings[cadence]?.current ?? null) : null
  const usernameChanged = chess.trim().toLowerCase() !== (profile.chesscom_username ?? '').toLowerCase()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // 1. Pseudo Chess.com : vérifié côté serveur auprès de Chess.com.
      if (usernameChanged && !usernameLocked) {
        await chesscom({ action: 'set-username', username: chess.trim() })
      }
      // 2. Champs libres du profil. L'Elo n'est saisi à la main qu'à défaut de classement Chess.com.
      await updateMyProfile(profile!.id, {
        display_name: name.trim(),
        avatar_color: color,
        use_chesscom_avatar: useCcAvatar,
        ...(syncedElo === null ? { declared_elo: elo === '' ? null : Number(elo) } : {}),
      })
      await Promise.all([refreshProfile(), reload()])
      navigate('/profil')
    } catch (err) {
      setError(friendlyError((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  const previewSrc = useCcAvatar && cc?.status === 'verified' ? (cc.avatar_url ?? undefined) : undefined

  return (
    <>
      <PageHeader title="Modifier mon profil" back="/profil" />
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <Avatar name={name || '?'} color={color} size={88} ring src={previewSrc} />
          {cc?.status === 'verified' && cc.avatar_url && (
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <input
                type="checkbox"
                className="size-4 accent-[#f5b83d]"
                checked={useCcAvatar}
                onChange={(e) => setUseCcAvatar(e.target.checked)}
              />
              Utiliser mon avatar Chess.com
            </label>
          )}
          {!previewSrc && (
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
          )}
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
            disabled={usernameLocked}
          />
          {usernameLocked ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-faint">
              <Lock size={12} /> Championnat en cours : seul l'administrateur peut modifier votre pseudo.
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-faint">Vérifié auprès de Chess.com à l'enregistrement.</p>
          )}
          {!usernameChanged && cc?.status === 'verified' && (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-win">
              <BadgeCheck size={13} /> Compte Chess.com vérifié
            </p>
          )}
          {!usernameChanged && cc?.status === 'not_found' && (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-loss">
              <XCircle size={13} /> Pseudo introuvable sur Chess.com
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="elo">
            Elo
          </label>
          {syncedElo !== null ? (
            <p className="input flex items-center justify-between text-muted">
              <span className="text-ink">{syncedElo}</span>
              <span className="text-[12px]">synchronisé · Chess.com {TIME_CLASS_LABEL[cadence]}</span>
            </p>
          ) : (
            <input
              id="elo"
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={3500}
              value={elo}
              onChange={(e) => setElo(e.target.value)}
              placeholder="Pas de classement Chess.com : laisser vide ou saisir"
            />
          )}
          {me && (
            <p className="mt-1 text-[12px] text-faint">
              Elo initial du championnat : {me.initial_elo ?? 'aucun'} (repris de Chess.com, corrigeable par l'administrateur).
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
