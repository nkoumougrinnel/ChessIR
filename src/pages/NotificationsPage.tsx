import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, Bell, CalendarPlus, CheckCircle2, Clock, AlertTriangle, Trophy, Gavel } from 'lucide-react'
import { fetchNotifications, markNotificationsRead } from '../lib/api'
import type { Notification } from '../lib/types'
import { useChampionship } from '../state/championship'
import { EmptyState, PageHeader, PageLoader, cx } from '../components/ui'
import { relativeTime } from '../lib/format'

const ICON = {
  draw_published: CalendarPlus,
  result_to_confirm: Clock,
  result_confirmed: CheckCircle2,
  result_disputed: AlertTriangle,
  standings_updated: Trophy,
  achievement: Award,
  result_corrected: Gavel,
} as Record<string, typeof Bell>

export default function NotificationsPage() {
  const { unread, reload } = useChampionship()
  const [items, setItems] = useState<Notification[] | null>(null)

  useEffect(() => {
    fetchNotifications()
      .then(setItems)
      .catch(() => setItems([]))
  }, [unread])

  // Marque tout comme lu après affichage.
  useEffect(() => {
    if (!items?.some((n) => !n.read_at)) return
    const t = setTimeout(() => {
      void markNotificationsRead().then(reload)
    }, 1200)
    return () => clearTimeout(t)
  }, [items, reload])

  if (!items) return <PageLoader />

  return (
    <>
      <PageHeader title="Notifications" back />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="Rien de neuf">
          Vous serez prévenu ici des tirages, des résultats à confirmer et de vos distinctions.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const Icon = ICON[n.type] ?? Bell
            const body = (
              <div className={cx('card flex items-start gap-3 px-4 py-3', !n.read_at && 'border-gold-400/30 bg-night-700/60')}>
                <Icon size={20} className={cx('mt-0.5 shrink-0', n.read_at ? 'text-muted' : 'text-gold-400')} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">{n.title}</p>
                  {n.body && <p className="text-[13px] text-muted">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-faint">{relativeTime(n.created_at)}</p>
                </div>
                {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gold-400" />}
              </div>
            )
            return <li key={n.id}>{n.link ? <Link to={n.link}>{body}</Link> : body}</li>
          })}
        </ul>
      )}
    </>
  )
}
