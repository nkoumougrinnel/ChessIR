import { useState } from 'react'
import { BellOff, BellRing, Share, SquarePlus, Volume2, VolumeX, X } from 'lucide-react'
import { useSoundEnabled } from '../lib/sound'
import { usePush } from '../lib/push'
import { isIOS } from '../lib/pwa'
import { Spinner, cx } from './ui'

const LATER_KEY = 'chessir-push-later'
const LATER_MS = 3 * 24 * 3600 * 1000

function laterActive() {
  try {
    return Date.now() - Number(localStorage.getItem(LATER_KEY) ?? 0) < LATER_MS
  } catch {
    return false
  }
}

/**
 * Invitation à activer les notifications push.
 * - Accueil (`compact`) : visible tant que ce n'est pas activé ; « Plus tard » la masque 3 jours.
 * - Profil : réglage permanent (activer / désactiver sur ce téléphone).
 */
export function PushCard({ placement }: { placement: 'home' | 'settings' }) {
  const { status, busy, error, enable, disable } = usePush()
  const [later, setLater] = useState(() => placement === 'home' && laterActive())

  if (status === null || status === 'unsupported') return null
  if (placement === 'home' && (status === 'on' || later)) return null

  function remindLater() {
    setLater(true)
    try {
      localStorage.setItem(LATER_KEY, String(Date.now()))
    } catch {
      /* stockage indisponible */
    }
  }

  if (placement === 'settings') {
    return (
      <section className="card px-4 py-3.5">
        <div className="flex items-center gap-3">
          {status === 'on' ? <BellRing size={20} className="text-gold-400" /> : <BellOff size={20} className="text-faint" />}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">Notifications sur ce téléphone</p>
            <p className="text-[12px] text-muted">
              {status === 'on'
                ? 'Activées : défis, matchs en direct, résultats.'
                : status === 'denied'
                  ? 'Bloquées dans les réglages du téléphone.'
                  : status === 'ios-install'
                    ? "Installez d'abord l'app sur l'écran d'accueil."
                    : 'Désactivées.'}
            </p>
          </div>
          {(status === 'on' || status === 'off') && (
            <Switch
              on={status === 'on'}
              label="Notifications sur ce téléphone"
              disabled={busy}
              onChange={() => void (status === 'on' ? disable() : enable())}
            />
          )}
        </div>
        {status === 'denied' && <DeniedHelp />}
        {status === 'ios-install' && <IosHelp />}
        {error && <p className="mt-2 text-[12px] text-loss">{error}</p>}
      </section>
    )
  }

  return (
    <section className="card relative overflow-hidden border-gold-400/30 px-4 py-4 animate-rise">
      <button
        onClick={remindLater}
        className="absolute top-2 right-2 grid size-8 place-items-center rounded-full text-faint hover:bg-white/5"
        aria-label="Plus tard"
      >
        <X size={16} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold-400/15 text-gold-300">
          <BellRing size={22} />
        </span>
        <div>
          <p className="font-display text-[17px] font-semibold">Ne ratez aucun défi</p>
          <p className="mt-0.5 text-[13px] text-muted">
            Soyez prévenu sur votre téléphone, même app fermée, quand on vous défie ou qu'un match passe en direct.
          </p>
        </div>
      </div>
      {status === 'off' && (
        <button className="btn-gold mt-3 w-full" disabled={busy} onClick={() => void enable()}>
          {busy ? <Spinner className="text-night-950" /> : <BellRing size={18} />} Activer les notifications
        </button>
      )}
      {status === 'denied' && <DeniedHelp />}
      {status === 'ios-install' && <IosHelp />}
      {error && <p className="mt-2 text-[12px] text-loss">{error}</p>}
    </section>
  )
}

function DeniedHelp() {
  return (
    <div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13px] text-muted">
      <p className="font-medium text-ink">Les notifications sont bloquées. Pour les réactiver :</p>
      {isIOS() ? (
        <p className="mt-1">Réglages de l'iPhone › Notifications › Chess IR › Autoriser les notifications.</p>
      ) : (
        <p className="mt-1">
          Touchez l'icône à gauche de l'adresse (ou les ⋮ de l'app) › Paramètres du site › Notifications › Autoriser, puis
          revenez ici.
        </p>
      )}
    </div>
  )
}

function IosHelp() {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13px] text-muted">
      Sur iPhone, les notifications ne marchent que depuis l'app installée : touchez <Share size={14} className="inline text-ink" />{' '}
      puis « Sur l'écran d'accueil » <SquarePlus size={14} className="inline text-ink" />, et ouvrez Chess IR depuis l'icône.
    </p>
  )
}

/** Interrupteur « Son des alertes » (activé par défaut, mémorisé sur ce téléphone). */
export function SoundSetting() {
  const [on, setOn] = useSoundEnabled()
  return (
    <section className="card flex items-center gap-3 px-4 py-3.5">
      {on ? <Volume2 size={20} className="text-gold-400" /> : <VolumeX size={20} className="text-faint" />}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">Son des alertes</p>
        <p className="text-[12px] text-muted">Défi reçu, match en direct (app ouverte).</p>
      </div>
      <Switch on={on} label="Son des alertes" onChange={() => setOn(!on)} />
    </section>
  )
}

function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', on ? 'bg-gold-400' : 'bg-white/15')}
    >
      <span className={cx('absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-5')} />
    </button>
  )
}
