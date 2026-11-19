import { NavLink, Outlet, Link } from 'react-router-dom'
import { ArrowLeft, Shield } from 'lucide-react'
import { cx } from '../components/ui'
import { useChampionship } from '../state/championship'

const TABS = [
  { to: '/admin', label: 'Championnat', end: true },
  { to: '/admin/joueurs', label: 'Joueurs' },
  { to: '/admin/semaines', label: 'Semaines & tirage' },
  { to: '/admin/matchs', label: 'Matchs' },
  { to: '/admin/classements', label: 'Classements' },
  { to: '/admin/recompenses', label: 'Récompenses' },
]

export default function AdminLayout() {
  const { matches } = useChampionship()
  const disputed = matches.filter((m) => m.status === 'disputed').length
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 pb-16">
      <header className="sticky top-0 z-20 -mx-4 bg-night-950/80 px-4 pt-3 backdrop-blur-md">
        <div className="flex h-11 items-center gap-3">
          <Link to="/" className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Retour à l'application">
            <ArrowLeft size={20} />
          </Link>
          <Shield size={20} className="text-gold-400" />
          <h1 className="font-display text-[21px] font-semibold tracking-wide">Administration</h1>
        </div>
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 py-2.5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx(
                  'relative shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                  isActive ? 'bg-gold-400 text-night-950' : 'bg-white/5 text-muted hover:text-ink',
                )
              }
            >
              {t.label}
              {t.to === '/admin/matchs' && disputed > 0 && (
                <span className="ml-1.5 rounded-full bg-loss px-1.5 text-[11px] text-white">{disputed}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="pt-3 animate-fade">
        <Outlet />
      </main>
    </div>
  )
}

export function AdminCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-[18px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
