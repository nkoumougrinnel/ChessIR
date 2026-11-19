import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { Bell, Home, Swords, Trophy, User, Shield } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { useAuth } from '../state/auth'
import { cx } from './ui'
import logo from '../assets/logo.png'

const TABS = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/matchs', label: 'Matchs', icon: Swords },
  { to: '/classement', label: 'Classement', icon: Trophy },
  { to: '/profil', label: 'Profil', icon: User },
]

export function Logo({ size = 28 }: { size?: number }) {
  return <img src={logo} alt="" width={size} height={size} className="rounded-[22%]" />
}

export function Brand() {
  return (
    <span className="font-display text-[24px] font-bold tracking-wide">
      Chess <span className="text-gold-gradient">IR</span>
    </span>
  )
}

export function BellButton() {
  const { unread } = useChampionship()
  return (
    <Link
      to="/notifications"
      className="relative grid size-10 place-items-center rounded-full text-ink hover:bg-white/5"
      aria-label={unread ? `Notifications (${unread} non lues)` : 'Notifications'}
    >
      <Bell size={22} />
      {unread > 0 && (
        <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-gold-400 px-1 text-[11px] font-bold text-night-950">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}

export default function Layout() {
  const { profile } = useAuth()
  const location = useLocation()
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <main key={location.pathname} className="flex-1 px-4 pb-28 animate-fade">
        <Outlet />
      </main>

      {profile?.role === 'admin' && (
        <Link
          to="/admin"
          className="fixed right-4 bottom-24 z-30 grid size-12 place-items-center rounded-full border border-gold-400/40 bg-night-800 text-gold-300 shadow-lg hover:bg-night-700"
          aria-label="Espace administrateur"
          title="Espace administrateur"
        >
          <Shield size={22} />
        </Link>
      )}

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.07] bg-night-900/90 backdrop-blur-lg">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-gold-300' : 'text-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
