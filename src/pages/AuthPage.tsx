import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { useAuth } from '../state/auth'
import { ErrorBox, Segmented, Spinner } from '../components/ui'
import { Eye, EyeOff } from 'lucide-react'
import { Brand } from '../components/Layout'
import logo from '../assets/logo.png'

export default function AuthPage() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [chess, setChess] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        if (chess && !/^[A-Za-z0-9_-]{3,25}$/.test(chess.trim())) {
          throw new Error('chesscom_username_check')
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: name.trim(), chesscom_username: chess.trim() },
            emailRedirectTo: window.location.origin,
          },
        })
        if (error) throw error
        if (!data.session) setInfo('Compte créé ! Confirmez votre adresse e-mail puis connectez-vous.')
      }
    } catch (err) {
      setError(friendlyError((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_60%_at_50%_30%,rgba(245,184,61,0.18),transparent_70%)]"
      />
      <div className="relative mb-8 flex flex-col items-center text-center animate-rise">
        <img
          src={logo}
          alt="Logo Chess IR"
          width={112}
          height={112}
          className="mb-5 rounded-[26%] shadow-[0_10px_40px_-8px_rgba(245,184,61,0.45)]"
        />
        <div className="scale-150">
          <Brand />
        </div>
        <p className="mt-4 text-[15px] tracking-wide text-muted">Jouer. Progresser. Grimper.</p>
      </div>

      <div className="relative animate-rise [animation-delay:80ms]">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m)
            setError(null)
          }}
          options={[
            { value: 'login', label: 'Connexion' },
            { value: 'signup', label: 'Inscription' },
          ]}
        />

        <form onSubmit={submit} className="space-y-3.5">
          {mode === 'signup' && (
            <>
              <div>
                <label className="label" htmlFor="name">
                  Nom ou pseudonyme
                </label>
                <input
                  id="name"
                  className="input"
                  required
                  minLength={2}
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="nickname"
                />
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
                  placeholder="ex. magnus_ir"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
            </>
          )}
          <div>
            <label className="label" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              className="input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="input pr-12"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 grid w-12 place-items-center text-faint hover:text-ink"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {mode === 'signup' && <p className="mt-1 text-[12px] text-faint">6 caractères minimum.</p>}
          </div>

          <ErrorBox>{error}</ErrorBox>
          {info && (
            <div className="rounded-xl border border-win/30 bg-win/10 px-4 py-3 text-[14px] text-win">{info}</div>
          )}

          <button type="submit" className="btn-gold mt-2 w-full" disabled={busy}>
            {busy ? <Spinner className="text-night-950" /> : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>
        {mode === 'signup' && (
          <p className="mt-4 text-center text-[12px] leading-relaxed text-faint">
            Après l'inscription, l'administrateur vous ajoute au championnat.
          </p>
        )}
      </div>
    </div>
  )
}
