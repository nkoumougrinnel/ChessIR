import { useEffect, useRef } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Award, BarChart3, CalendarDays, LayoutDashboard, Shield, Swords, Users } from 'lucide-react'
import { cx } from '../components/ui'
import { useChampionship } from '../state/championship'

const TABS = [
  { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/admin/joueurs', label: 'Joueurs', icon: Users },
  { to: '/admin/semaines', label: 'Semaines & tirage', icon: CalendarDays },
  { to: '/admin/matchs', label: 'Matchs', icon: Swords },
  { to: '/admin/classements', label: 'Classements', icon: BarChart3 },
  { to: '/admin/recompenses', label: 'Récompenses', icon: Award },
]

export default function AdminLayout() {
  const { matches, participants, profiles } = useChampionship()
  const disputed = matches.filter((m) => m.status === 'disputed').length
  const enrolled = new Set(participants.map((p) => p.profile_id))
  const toEnroll = [...profiles.values()].filter((p) => p.role !== 'admin' && p.is_active && !enrolled.has(p.id)).length
  const badges: Record<string, { n: number; tone: string }> = {
    '/admin/matchs': { n: disputed, tone: 'bg-loss text-white' },
    '/admin/joueurs': { n: toEnroll, tone: 'bg-gold-400 text-night-950' },
  }
  const nav = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [pathname])
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 pb-16">
      <header className="sticky top-0 z-20 -mx-4 border-b border-white/[0.04] bg-night-950/95 px-4 pt-3 backdrop-blur-lg">
        <div className="flex h-11 items-center gap-3">
          <Link to="/" className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Retour à l'application">
            <ArrowLeft size={20} />
          </Link>
          <Shield size={20} className="text-gold-400" />
          <h1 className="font-display text-[21px] font-semibold tracking-wide">Administration</h1>
        </div>
        <nav ref={nav} className="-mx-4 flex gap-1 overflow-x-auto px-4 py-2.5 [scrollbar-width:none]">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx(
                  'relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                  isActive ? 'bg-gold-400 text-night-950' : 'bg-white/5 text-muted hover:text-ink',
                )
              }
            >
              <t.icon size={14} />
              {t.label}
              {badges[t.to]?.n > 0 && (
                <span className={cx('ml-0.5 min-w-[18px] rounded-full px-1.5 text-center text-[11px]', badges[t.to].tone)}>
                  {badges[t.to].n}
                </span>
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
