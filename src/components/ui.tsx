import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Loader2, type LucideIcon } from 'lucide-react'
import type { AvatarColor, MatchStatus } from '../lib/types'
import { initials, STATUS_LABEL } from '../lib/format'

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

/* ------------------------------ Avatar ------------------------------ */

const AVATAR_BG: Record<AvatarColor, string> = {
  violet: 'from-[#8b7cff] to-[#4b3bd1]',
  gold: 'from-gold-300 to-gold-600',
  blue: 'from-[#6aa8ff] to-[#2a55c9]',
  emerald: 'from-[#4fe0a8] to-[#11896a]',
  rose: 'from-[#ff8fb0] to-[#c33a6b]',
  cyan: 'from-[#6fe7ff] to-[#1b8fb3]',
  orange: 'from-[#ffb071] to-[#d4581d]',
  slate: 'from-[#a6add6] to-[#4a5185]',
}
export const AVATAR_COLORS = Object.keys(AVATAR_BG) as AvatarColor[]

export function Avatar({
  name,
  color = 'violet',
  size = 40,
  ring = false,
  src,
}: {
  name: string
  color?: AvatarColor
  size?: number
  ring?: boolean
  /** Avatar Chess.com (sinon initiales). */
  src?: string
}) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={cx(
          'shrink-0 rounded-full bg-night-700 object-cover',
          ring && 'ring-2 ring-gold-400/70 ring-offset-2 ring-offset-night-900',
        )}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className={cx(
        'grid shrink-0 place-items-center rounded-full bg-linear-to-br font-display font-semibold text-white shadow-inner',
        AVATAR_BG[color] ?? AVATAR_BG.violet,
        ring && 'ring-2 ring-gold-400/70 ring-offset-2 ring-offset-night-900',
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </div>
  )
}

/* ------------------------------ Badges ------------------------------ */

const STATUS_STYLE: Record<MatchStatus, string> = {
  scheduled: 'bg-gold-400/15 text-gold-300 border-gold-400/30',
  pending: 'bg-violet/15 text-[#b3a9ff] border-violet/30',
  validated: 'bg-win/15 text-win border-win/30',
  disputed: 'bg-loss/15 text-loss border-loss/30',
  unplayed: 'bg-white/5 text-muted border-white/10',
}

export function StatusBadge({ status, className }: { status: MatchStatus; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold',
        STATUS_STYLE[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

const OUTCOME_STYLE = {
  win: 'bg-win/15 text-win border-win/30',
  draw: 'bg-draw/15 text-draw border-draw/30',
  loss: 'bg-loss/15 text-loss border-loss/30',
}

export function OutcomePill({ outcome, children }: { outcome: 'win' | 'draw' | 'loss'; children: ReactNode }) {
  return (
    <span className={cx('inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold', OUTCOME_STYLE[outcome])}>
      {children}
    </span>
  )
}

/** Pastille de couleur des pièces. */
export function PieceColor({ color, label = false }: { color: 'white' | 'black'; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
      <span
        className={cx(
          'inline-block size-3 rounded-full border',
          color === 'white' ? 'border-white/60 bg-white' : 'border-white/40 bg-black',
        )}
        title={color === 'white' ? 'Blancs' : 'Noirs'}
      />
      {label && (color === 'white' ? 'Blancs' : 'Noirs')}
    </span>
  )
}

/* ------------------------------ Mise en page ------------------------------ */

export function PageHeader({
  title,
  back,
  right,
  icon: Icon,
}: {
  title: ReactNode
  back?: boolean | string
  right?: ReactNode
  icon?: LucideIcon
}) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-4 flex h-14 items-center gap-2 bg-night-950/70 px-4 backdrop-blur-md">
      <div className="w-10">
        {back && (
          <button
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
            className="-ml-2 grid size-10 place-items-center rounded-full text-ink hover:bg-white/5"
            aria-label="Retour"
          >
            <ChevronLeft size={24} />
          </button>
        )}
      </div>
      <h1 className="title flex flex-1 items-center justify-center gap-2 truncate text-center">
        {Icon && <Icon size={22} className="text-gold-400" />}
        {title}
      </h1>
      <div className="flex w-10 justify-end">{right}</div>
    </header>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: ReactNode }>
}) {
  return (
    <div className="mb-4 flex gap-1 rounded-2xl border border-white/[0.07] bg-night-800/70 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-xl px-3 py-2.5 font-display text-[16px] font-semibold tracking-wide transition-all duration-200',
            value === o.value
              ? 'bg-linear-to-b from-gold-300 to-gold-500 text-night-950 shadow-[0_4px_14px_-4px_rgba(245,184,61,0.6)]'
              : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin text-gold-400', className)} size={22} />
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner />
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center animate-rise">
      <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-gold-400/10 text-gold-400">
        <Icon size={28} />
      </div>
      <p className="font-display text-[19px] font-semibold">{title}</p>
      {children && <div className="mt-1.5 max-w-xs text-[14px] text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div role="alert" className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-[14px] text-loss">
      {children}
    </div>
  )
}

export function InfoBox({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="card flex items-start gap-3 px-4 py-3 text-[13px] leading-relaxed text-muted">
      <Icon size={20} className="mt-0.5 shrink-0 text-[#8fa8ff]" />
      <div>{children}</div>
    </div>
  )
}

export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: 'gold' | 'win' | 'draw' | 'loss' }) {
  const color = {
    gold: 'text-gold-300',
    win: 'text-win',
    draw: 'text-draw',
    loss: 'text-loss',
  }[tone ?? 'gold']
  return (
    <div className="card flex flex-col items-center px-2 py-3">
      <span className={cx('font-display text-[26px] font-bold leading-none', color)}>{value}</span>
      <span className="mt-1.5 text-[11px] font-medium text-muted">{label}</span>
    </div>
  )
}

export function RowLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={cx('card card-hover block', className)}>
      {children}
    </Link>
  )
}

/** Petit toast éphémère. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(t)
  }, [msg])
  const node = msg ? (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 animate-rise">
      <div className="rounded-xl border border-gold-400/30 bg-night-800 px-4 py-2.5 text-[14px] shadow-xl">{msg}</div>
    </div>
  ) : null
  return { toast: setMsg, toastNode: node }
}
