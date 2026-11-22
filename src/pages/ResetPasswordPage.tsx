import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, KeyRound, MailCheck } from 'lucide-react'
import { authLink, friendlyError, supabase } from '../lib/supabase'
import { useAuth } from '../state/auth'
import { ErrorBox, PageLoader, Spinner } from '../components/ui'
import logo from '../assets/logo.png'

/** Adresse où mène le lien de l'e-mail (doit figurer dans les « Redirect URLs » de Supabase). */
export const RESET_PATH = '/nouveau-mot-de-passe'

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}${RESET_PATH}`,
  })
  if (error) throw error
}

/** Formulaire « recevoir un lien » (écran de connexion et lien expiré). */
export function ForgotPasswordForm({ initialEmail = '', onBack }: { initialEmail?: string; onBack?: () => void }) {
  const [email, setEmail] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(friendlyError((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <MailCheck size={40} className="mx-auto text-win" />
        <p className="text-[15px]">
          Si un compte existe pour <strong>{email.trim()}</strong>, un e-mail vient de partir.
        </p>
        <p className="text-[13px] text-muted">
          Ouvrez-le sur ce téléphone et touchez le lien : vous choisirez votre nouveau mot de passe. Pensez à regarder dans les
          spams.
        </p>
        {onBack && (
          <button type="button" className="btn-ghost w-full" onClick={onBack}>
            Retour à la connexion
          </button>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <p className="text-[14px] text-muted">Indiquez l'e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
      <div>
        <label className="label" htmlFor="reset-email">
          E-mail
        </label>
        <input
          id="reset-email"
          type="email"
          className="input"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <ErrorBox>{error}</ErrorBox>
      <button type="submit" className="btn-gold w-full" disabled={busy}>
        {busy ? <Spinner className="text-night-950" /> : 'Recevoir le lien'}
      </button>
      {onBack && (
        <button type="button" className="w-full py-2 text-center text-[14px] text-muted hover:text-ink" onClick={onBack}>
          Retour à la connexion
        </button>
      )}
    </form>
  )
}

/**
 * Page ouverte depuis le lien de l'e-mail de réinitialisation.
 * Supabase ouvre une session temporaire à partir du lien ; on y choisit le nouveau mot de passe.
 */
export default function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) return setError('Le mot de passe doit contenir au moins 6 caractères.')
    if (password !== confirm) return setError('Les deux mots de passe ne sont pas identiques.')
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
    } catch (err) {
      setError(friendlyError((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageLoader />

  let content
  if (done) {
    content = (
      <div className="space-y-4 text-center">
        <CheckCircle2 size={44} className="mx-auto text-win" />
        <p className="font-display text-[20px] font-semibold">Mot de passe modifié</p>
        <p className="text-[14px] text-muted">Vous êtes connecté. Utilisez ce nouveau mot de passe la prochaine fois.</p>
        <button className="btn-gold w-full" onClick={() => navigate('/', { replace: true })}>
          Continuer
        </button>
      </div>
    )
  } else if (!session) {
    content = (
      <div className="space-y-4">
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[14px] text-warn">
          {authLink.linkError
            ? 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau ci-dessous.'
            : 'Ouvrez le lien reçu par e-mail pour choisir un nouveau mot de passe, ou demandez un nouveau lien.'}
        </div>
        <ForgotPasswordForm onBack={() => navigate('/connexion', { replace: true })} />
      </div>
    )
  } else {
    content = (
      <form onSubmit={submit} className="space-y-3.5">
        <p className="text-[14px] text-muted">
          Compte : <strong className="text-ink">{session.user.email}</strong>
        </p>
        <div>
          <label className="label" htmlFor="new-password">
            Nouveau mot de passe
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? 'text' : 'password'}
              className="input pr-12"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center text-faint hover:text-ink"
              aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="mt-1 text-[12px] text-faint">6 caractères minimum.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm-password">
            Confirmer le mot de passe
          </label>
          <input
            id="confirm-password"
            type={show ? 'text' : 'password'}
            className="input"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <button type="submit" className="btn-gold w-full" disabled={busy}>
          {busy ? <Spinner className="text-night-950" /> : 'Enregistrer le mot de passe'}
        </button>
        <Link to="/" className="block py-2 text-center text-[14px] text-muted hover:text-ink">
          Annuler
        </Link>
      </form>
    )
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_60%_at_50%_30%,rgba(245,184,61,0.16),transparent_70%)]"
      />
      <div className="relative mb-6 flex flex-col items-center text-center animate-rise">
        <img src={logo} alt="" width={72} height={72} className="mb-4 rounded-[26%]" />
        <h1 className="flex items-center gap-2 font-display text-[24px] font-bold">
          <KeyRound size={22} className="text-gold-400" /> Nouveau mot de passe
        </h1>
      </div>
      <div className="relative animate-rise [animation-delay:80ms]">{content}</div>
    </div>
  )
}
