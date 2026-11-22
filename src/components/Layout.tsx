import { useEffect, useRef } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Flame, Home, Swords, Trophy, User, Shield } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { useAuth } from '../state/auth'
import { cx } from './ui'
import { challengeState, IncomingChallengeBanner, useNow } from './challenge'
import { play } from '../lib/sound'
import logo from '../assets/logo.png'

const TABS = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/matchs', label: 'Matchs', icon: Swords },
  { to: '/arene', label: 'Arène', icon: Flame },
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

/** Nombre de matchs où le joueur doit agir : confirmer un résultat ou accepter une partie détectée. */
function useActionsNeeded() {
  const { profile } = useAuth()
  const { me, matches, chesscomGames } = useChampionship()
  if (!me || !profile) return 0
  return matches.filter((m) => {
    if (m.white_id !== me.id && m.black_id !== me.id) return false
    if (m.status === 'pending') return m.declared_by !== profile.id
    if (m.status === 'scheduled') return chesscomGames.some((g) => g.match_id === m.id && g.confidence === 'certain')
    return false
  }).length
}

/** Activité de l'Arène : matchs en direct + défis reçus par le joueur connecté. */
/**
 * Son + vibration quand, app ouverte, un défi m'arrive ou qu'un match passe en direct.
 * Les défis déjà présents à l'ouverture ne sonnent pas (la notification push s'en est chargée).
 */
function useArenaAlerts() {
  const { challenges, matches, me, loading } = useChampionship()
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (loading) return
    const now = Date.now()
    const keyOf = (c: (typeof challenges)[number]) => `${c.id}:${c.accepted_at ? 'live' : 'pending'}`
    const active = challenges.filter((c) => challengeState(c, now))
    if (!seen.current) {
      seen.current = new Set(active.map(keyOf))
      return
    }
    let sound: 'challenge' | 'live' | null = null
    for (const c of active) {
      const key = keyOf(c)
      if (seen.current.has(key)) continue
      seen.current.add(key)
      const m = matches.find((x) => x.id === c.match_id)
      if (!m || !me) continue
      const mine = m.white_id === me.id || m.black_id === me.id
      if (!c.accepted_at && mine && c.challenger_id !== me.id) sound = 'challenge'
      else if (c.accepted_at && !mine && sound === null) sound = 'live'
    }
    if (sound) void play(sound)
  }, [challenges, matches, me, loading])
}

function useArenaActivity() {
  const { challenges, matches, me } = useChampionship()
  const now = useNow(5000)
  let live = 0
  let incoming = 0
  for (const c of challenges) {
    const state = challengeState(c, now)
    const m = matches.find((x) => x.id === c.match_id)
    if (!state || !m) continue
    if (state === 'live') live++
    else if (me && c.challenger_id !== me.id && (m.white_id === me.id || m.black_id === me.id)) incoming++
  }
  return { live, incoming }
}

export default function Layout() {
  const { profile } = useAuth()
  const { loading } = useChampionship()
  const actions = useActionsNeeded()
  const arena = useArenaActivity()
  useArenaAlerts()
  const location = useLocation()
  const navigate = useNavigate()

  // À l'ouverture de l'app : un défi m'attend → direction l'Arène (le compte à rebours tourne).
  const routedOnce = useRef(false)
  useEffect(() => {
    if (loading || routedOnce.current) return
    routedOnce.current = true
    if (arena.incoming > 0 && location.pathname === '/') navigate('/arene')
  }, [loading, arena.incoming, location.pathname, navigate])

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <IncomingChallengeBanner />
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
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map(({ to, label, icon: Icon, end }) =>
            to === '/arene' ? (
              <ArenaTab key={to} live={arena.live} incoming={arena.incoming} />
            ) : (
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
                    <span className="relative">
                      <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
                      {to === '/matchs' && actions > 0 && (
                        <span
                          className="absolute -top-1.5 -right-2.5 grid min-w-[17px] place-items-center rounded-full bg-gold-400 px-1 text-[10px] font-bold text-night-950 ring-2 ring-night-900"
                          aria-label={`${actions} action(s) en attente`}
                        >
                          {actions}
                        </span>
                      )}
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            ),
          )}
        </div>
      </nav>
    </div>
  )
}

/** Onglet central surélevé. Pulse et affiche un compteur quand il se passe quelque chose. */
function ArenaTab({ live, incoming }: { live: number; incoming: number }) {
  const count = live + incoming
  return (
    <NavLink
      to="/arene"
      className="flex flex-col items-center pb-2.5 text-[11px] font-medium"
      aria-label={count ? `Arène (${count} en cours)` : 'Arène'}
    >
      {({ isActive }) => (
        <>
          <span
            className={cx(
              'relative -mt-6 mb-0.5 grid size-14 place-items-center rounded-full border-4 border-night-950 bg-linear-to-b from-gold-300 to-gold-500 text-night-950 shadow-[0_8px_24px_rgba(245,184,61,0.35)] transition-transform',
              isActive && 'scale-105',
              count > 0 && 'animate-tab-glow',
            )}
          >
            <Flame size={26} strokeWidth={2.4} className={cx(count > 0 && 'animate-clash')} />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 grid min-w-[20px] place-items-center rounded-full bg-loss px-1 text-[11px] font-bold text-white ring-2 ring-night-950">
                {count}
              </span>
            )}
          </span>
          <span className={isActive ? 'text-gold-300' : count > 0 ? 'text-loss' : 'text-muted'}>
            {count > 0 && live > 0 ? 'En direct' : 'Arène'}
          </span>
        </>
      )}
    </NavLink>
  )
}
