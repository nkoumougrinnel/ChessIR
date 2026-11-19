import { RefreshCw } from 'lucide-react'
import { applyUpdate, useUpdateReady } from '../lib/pwa'

/** Affiché si une nouvelle version est mise en ligne pendant que l'application est ouverte. */
export function UpdateBanner() {
  const ready = useUpdateReady()
  if (!ready) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(env(safe-area-inset-top),8px)] animate-rise">
      <button
        onClick={applyUpdate}
        className="flex items-center gap-2 rounded-full border border-gold-400/40 bg-night-800 px-4 py-2 text-[13px] shadow-xl"
      >
        <RefreshCw size={15} className="text-gold-300" />
        Nouvelle version disponible · <span className="font-semibold text-gold-300">Actualiser</span>
      </button>
    </div>
  )
}
