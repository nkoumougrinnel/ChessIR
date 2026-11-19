import { useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useInstall } from '../lib/pwa'

const DISMISS_KEY = 'chessir-install-dismissed'

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Proposition d'installation de l'application.
 * `dismissible` : sur l'accueil, l'utilisateur peut la masquer (mémorisé sur cet appareil).
 */
export function InstallCard({ dismissible = false }: { dismissible?: boolean }) {
  const { installed, canPrompt, iosManual, install, markInstalled } = useInstall()
  const [dismissed, setDismissed] = useState(() => dismissible && readDismissed())
  const [showIos, setShowIos] = useState(false)

  if (installed || dismissed || (!canPrompt && !iosManual)) return null

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* stockage indisponible : masqué pour cette session seulement */
    }
  }

  return (
    <div className="card relative px-4 py-3.5 animate-rise">
      {dismissible && (
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 grid size-8 place-items-center rounded-full text-faint hover:bg-white/5"
          aria-label="Masquer"
        >
          <X size={16} />
        </button>
      )}
      <div className="flex items-center gap-3 pr-6">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-400/15 text-gold-300">
          <Download size={20} />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-semibold">Installer Chess IR</p>
          <p className="text-[12px] text-muted">Sur l'écran d'accueil, comme une vraie application.</p>
        </div>
      </div>

      {canPrompt && (
        <button className="btn-gold mt-3 w-full py-2.5 text-[15px]" onClick={() => void install()}>
          <Download size={17} /> Installer l'application
        </button>
      )}

      {!canPrompt && iosManual && (
        <>
          {!showIos ? (
            <button className="btn-ghost mt-3 w-full py-2.5 text-[15px]" onClick={() => setShowIos(true)}>
              Comment faire sur iPhone ?
            </button>
          ) : (
            <ol className="mt-3 space-y-2 text-[13px] text-muted">
              <li className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-white/5 text-[12px] text-ink">1</span>
                Dans Safari, touchez <Share size={15} className="text-[#8fa8ff]" /> <strong className="text-ink">Partager</strong>
              </li>
              <li className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-white/5 text-[12px] text-ink">2</span>
                Choisissez <SquarePlus size={15} className="text-[#8fa8ff]" />{' '}
                <strong className="text-ink">Sur l'écran d'accueil</strong>
              </li>
              <li className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-white/5 text-[12px] text-ink">3</span>
                Touchez <strong className="text-ink">Ajouter</strong>
              </li>
            </ol>
          )}
          <button onClick={markInstalled} className="mt-2 w-full py-1.5 text-center text-[12px] text-faint hover:text-muted">
            Elle est déjà sur mon écran d'accueil
          </button>
        </>
      )}
    </div>
  )
}
