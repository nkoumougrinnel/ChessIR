import { useEffect, useState } from 'react'
import {
  CalendarCheck,
  Crown,
  Flame,
  Footprints,
  Medal,
  Star,
  Swords,
  TrendingUp,
  Zap,
  Award,
  type LucideIcon,
} from 'lucide-react'
import { fetchPlayerAchievements } from '../lib/api'
import type { Achievement, PlayerAchievement } from '../lib/types'
import { useChampionship } from '../state/championship'
import { cx } from './ui'

const ICONS: Record<string, LucideIcon> = {
  crown: Crown,
  zap: Zap,
  'trending-up': TrendingUp,
  flame: Flame,
  footprints: Footprints,
  star: Star,
  'calendar-check': CalendarCheck,
  medal: Medal,
  swords: Swords,
}

export const achievementIcon = (icon: string) => ICONS[icon] ?? Award

/** Badge hexagonal doré (débloqué) ou grisé (verrouillé). */
export function AchievementBadge({
  achievement,
  unlocked,
  count = 1,
  size = 64,
}: {
  achievement: Achievement
  unlocked: boolean
  count?: number
  size?: number
}) {
  const Icon = achievementIcon(achievement.icon)
  return (
    <div className="flex flex-col items-center text-center" title={achievement.description}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
          <defs>
            <linearGradient id="hex-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffe6a8" />
              <stop offset="1" stopColor="#c47d14" />
            </linearGradient>
          </defs>
          <polygon
            points="50,3 93,27 93,73 50,97 7,73 7,27"
            fill={unlocked ? '#1a1530' : '#10122b'}
            stroke={unlocked ? 'url(#hex-gold)' : 'rgba(255,255,255,0.12)'}
            strokeWidth="5"
          />
        </svg>
        <Icon
          className={cx('absolute inset-0 m-auto', unlocked ? 'text-gold-300' : 'text-faint')}
          size={size * 0.42}
          strokeWidth={2}
        />
        {count > 1 && (
          <span className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full bg-gold-400 text-[11px] font-bold text-night-950">
            ×{count}
          </span>
        )}
      </div>
      <span className={cx('mt-1.5 text-[12px] leading-tight font-medium', unlocked ? 'text-ink' : 'text-faint')}>
        {achievement.name}
      </span>
    </div>
  )
}

export function usePlayerAchievements(filter: { participantId?: string; tournamentId?: string }, refreshKey = 0) {
  const { weeks } = useChampionship()
  const [items, setItems] = useState<PlayerAchievement[] | null>(null)
  const key = `${filter.participantId ?? ''}|${filter.tournamentId ?? ''}`
  useEffect(() => {
    if (!filter.participantId && !filter.tournamentId) {
      setItems([])
      return
    }
    let alive = true
    fetchPlayerAchievements(filter)
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [key, weeks, refreshKey])
  return items
}
