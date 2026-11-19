import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Copy, Download, MessageCircle, Share2, Users, X } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { Spinner } from './ui'

/**
 * Partage « à la Duolingo » : aperçu de l'image générée, puis le menu de partage
 * du téléphone (WhatsApp → groupe) avec l'image et le message déjà prêts.
 * Pensé pour le téléphone. Si le navigateur ne sait pas partager d'image (rare,
 * surtout sur ordinateur) : télécharger l'image et ouvrir WhatsApp.
 * « Copier le message » sert aussi sur mobile, quand WhatsApp n'envoie pas la légende.
 */
export interface ShareSpec {
  /** Titre du panneau, ex. « Partager le résultat ». */
  title: string
  /** Message accompagnant l'image (le lien de l'application est ajouté automatiquement). */
  text: string
  filename: string
  build: () => Promise<Blob>
}

const Ctx = createContext<(spec: ShareSpec) => void>(() => undefined)

export function useShare() {
  return useContext(Ctx)
}

export function ShareProvider({ children }: { children: ReactNode }) {
  const [spec, setSpec] = useState<ShareSpec | null>(null)
  return (
    <Ctx.Provider value={setSpec}>
      {children}
      {spec && <ShareSheet spec={spec} onClose={() => setSpec(null)} />}
    </Ctx.Provider>
  )
}

function ShareSheet({ spec, onClose }: { spec: ShareSpec; onClose: () => void }) {
  const { whatsappUrl } = useChampionship()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const message = `${spec.text}\n\n👉 ${window.location.origin}`

  useEffect(() => {
    let url: string | null = null
    spec
      .build()
      .then((blob) => {
        url = URL.createObjectURL(blob)
        setPreview(url)
        setFile(new File([blob], spec.filename, { type: 'image/png' }))
      })
      .catch(() => setError("L'image n'a pas pu être générée."))
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [spec])

  const canShareFile = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  async function share() {
    if (!file) return
    try {
      if (canShareFile) await navigator.share({ files: [file], text: message })
      else if (navigator.share) await navigator.share({ text: message })
      else window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
    } catch {
      /* partage annulé */
    }
  }

  function download() {
    if (!preview) return
    const a = document.createElement('a')
    a.href = preview
    a.download = spec.filename
    a.click()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setNote('Message copié')
    } catch {
      setNote('Copie impossible')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={spec.title}
        className="pb-safe max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-night-850 p-4 sm:rounded-3xl animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[20px] font-semibold">{spec.title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        <div className="mx-auto aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-night-950 shadow-2xl">
          {preview ? (
            <img src={preview} alt="Aperçu de l'image partagée" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center">{error ? <p className="p-4 text-center text-[13px] text-loss">{error}</p> : <Spinner />}</div>
          )}
        </div>

        <p className="mt-3 line-clamp-3 rounded-xl bg-white/[0.04] px-3 py-2 text-[13px] whitespace-pre-line text-muted">{spec.text}</p>

        <button className="btn-gold mt-3 w-full" disabled={!file} onClick={() => void share()}>
          <Share2 size={18} /> Partager
        </button>
        <p className="mt-1.5 text-center text-[12px] text-faint">
          {canShareFile ? 'Choisissez WhatsApp, puis le groupe de la classe.' : 'Téléchargez l’image puis envoyez-la avec le message.'}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {!canShareFile && (
            <button className="btn-ghost px-3 py-2 text-[13px]" onClick={download} disabled={!preview}>
              <Download size={15} /> Image
            </button>
          )}
          <button className="btn-ghost px-3 py-2 text-[13px]" onClick={() => void copy()}>
            <Copy size={15} /> Copier le message
          </button>
          {!canShareFile && (
            <a
              className="btn-ghost px-3 py-2 text-[13px]"
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={15} /> WhatsApp
            </a>
          )}
          {whatsappUrl && (
            <a className="btn-ghost px-3 py-2 text-[13px]" href={whatsappUrl} target="_blank" rel="noreferrer">
              <Users size={15} /> Ouvrir le groupe
            </a>
          )}
        </div>
        {note && <p className="mt-2 text-center text-[12px] text-win">{note}</p>}
      </div>
    </div>
  )
}
