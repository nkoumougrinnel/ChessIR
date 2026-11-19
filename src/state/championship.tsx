import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import * as api from '../lib/api'
import type {
  Achievement,
  Bye,
  ChesscomGame,
  ChesscomProfile,
  Match,
  Participant,
  Profile,
  Round,
  StandingRow,
  Tournament,
  Week,
} from '../lib/types'
import { useAuth } from './auth'

/**
 * Données du championnat chargées en une fois (une classe = quelques dizaines
 * de joueurs et quelques centaines de matchs) puis rafraîchies en temps réel.
 * Les pages en dérivent ce dont elles ont besoin.
 */
export interface ChampionshipData {
  tournament: Tournament | null
  participants: Participant[]
  profiles: Map<string, Profile>
  weeks: Week[] // la plus récente d'abord
  rounds: Round[]
  matches: Match[]
  byes: Bye[]
  standings: StandingRow[]
  achievements: Achievement[]
  unread: number
  /** Données publiques Chess.com, séparées des statistiques du championnat. */
  chesscomProfiles: Map<string, ChesscomProfile>
  chesscomGames: ChesscomGame[]
}

interface ChampionshipState extends ChampionshipData {
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Participation de l'utilisateur connecté au championnat courant. */
  me: Participant | null
  activeWeek: Week | null
  participantById: Map<string, Participant>
  roundById: Map<string, Round>
  weekById: Map<string, Week>
  nameOf: (participantId: string) => string
  profileOf: (participantId: string) => Profile | undefined
  /** URL de l'avatar Chess.com à afficher pour un profil (ou undefined → initiales). */
  avatarOf: (profileId: string | undefined) => string | undefined
  gamesOfMatch: (matchId: string) => ChesscomGame[]
}

const empty: ChampionshipData = {
  tournament: null,
  participants: [],
  profiles: new Map(),
  weeks: [],
  rounds: [],
  matches: [],
  byes: [],
  standings: [],
  achievements: [],
  unread: 0,
  chesscomProfiles: new Map(),
  chesscomGames: [],
}

const Ctx = createContext<ChampionshipState | null>(null)

export function ChampionshipProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [data, setData] = useState<ChampionshipData>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const reload = useCallback(async () => {
    if (!session) return
    try {
      const [tournament, profiles, achievements, notifications, ccProfiles] = await Promise.all([
        api.fetchCurrentTournament(),
        api.fetchProfiles(),
        api.fetchAchievements(),
        api.fetchNotifications(),
        api.fetchChesscomProfiles(),
      ])
      const base = {
        tournament,
        profiles: new Map(profiles.map((p) => [p.id, p])),
        achievements,
        unread: notifications.filter((n) => !n.read_at).length,
        chesscomProfiles: new Map(ccProfiles.map((c) => [c.profile_id, c])),
      }
      if (!tournament) {
        setData({ ...empty, ...base })
      } else {
        const [participants, weeks, matches, standings, chesscomGames] = await Promise.all([
          api.fetchParticipants(tournament.id),
          api.fetchWeeks(tournament.id),
          api.fetchTournamentMatches(tournament.id),
          api.fetchStandings(tournament.id),
          api.fetchChesscomGames(tournament.id),
        ])
        const rounds = await api.fetchRounds(weeks.map((w) => w.id))
        const byes = await api.fetchByes(rounds.map((r) => r.id))
        setData({ ...base, participants, weeks, rounds, matches, byes, standings, chesscomGames })
      }
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (!session) {
      setData(empty)
      setLoading(false)
      return
    }
    setLoading(true)
    void reload()
    // Temps réel : toute modification de match, semaine ou notification déclenche un rechargement groupé.
    const schedule = () => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void reload(), 400)
    }
    const channel = supabase
      .channel('championnat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weeks' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chesscom_games' }, schedule)
      .subscribe()
    const onFocus = () => schedule()
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearTimeout(timer.current)
      void supabase.removeChannel(channel)
    }
  }, [session, reload])

  // Synchronisation de mon profil Chess.com : au plus une fois par 24 h (cache côté serveur).
  const syncedOnce = useRef(false)
  useEffect(() => {
    const myId = session?.user.id
    if (!myId || syncedOnce.current || loading) return
    const me = data.profiles.get(myId)
    if (!me?.chesscom_username) return
    const cc = data.chesscomProfiles.get(myId)
    const fresh = cc && cc.username.toLowerCase() === me.chesscom_username.toLowerCase() &&
      Date.now() - new Date(cc.fetched_at).getTime() < 24 * 3600 * 1000
    syncedOnce.current = true
    if (fresh) return
    api
      .chesscom({ action: 'sync-profile' })
      .then(() => reload())
      .catch(() => undefined) // Chess.com indisponible : l'application continue sans.
  }, [session, loading, data.profiles, data.chesscomProfiles, reload])

  const value = useMemo<ChampionshipState>(() => {
    const participantById = new Map(data.participants.map((p) => [p.id, p]))
    const roundById = new Map(data.rounds.map((r) => [r.id, r]))
    const weekById = new Map(data.weeks.map((w) => [w.id, w]))
    const me = data.participants.find((p) => p.profile_id === session?.user.id) ?? null
    const profileOf = (pid: string) => {
      const p = participantById.get(pid)
      return p ? data.profiles.get(p.profile_id) : undefined
    }
    return {
      ...data,
      loading,
      error,
      reload,
      me,
      activeWeek: data.weeks.find((w) => w.status === 'active') ?? null,
      participantById,
      roundById,
      weekById,
      profileOf,
      nameOf: (pid) => profileOf(pid)?.display_name ?? 'Joueur',
      avatarOf: (profileId) => {
        if (!profileId) return undefined
        const p = data.profiles.get(profileId)
        const cc = data.chesscomProfiles.get(profileId)
        return p?.use_chesscom_avatar && cc?.status === 'verified' && cc.avatar_url ? cc.avatar_url : undefined
      },
      gamesOfMatch: (matchId) => data.chesscomGames.filter((g) => g.match_id === matchId),
    }
  }, [data, loading, error, reload, session])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useChampionship() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useChampionship hors ChampionshipProvider')
  return ctx
}

/** Vue enrichie d'un match pour l'affichage. */
export interface MatchView {
  match: Match
  round: Round
  week: Week
}

export function useMatchViews() {
  const { matches, roundById, weekById } = useChampionship()
  return useMemo(() => {
    const views: MatchView[] = []
    for (const match of matches) {
      const round = roundById.get(match.round_id)
      const week = round && weekById.get(round.week_id)
      if (round && week) views.push({ match, round, week })
    }
    return views.sort((a, b) => b.week.number - a.week.number || a.round.number - b.round.number)
  }, [matches, roundById, weekById])
}
