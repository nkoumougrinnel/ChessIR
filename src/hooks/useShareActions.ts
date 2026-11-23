import { useChampionship } from '../state/championship'
import { useShare } from '../components/ShareSheet'
import { renderAwardCard, renderDrawCard, renderMatchCard, renderStandingsCard, type SharePlayer } from '../lib/shareImage'
import { dayName, ddmm, weekLabel, weekRange } from '../lib/format'
import type { Achievement, Match, StandingRow, Week } from '../lib/types'

const appUrl = () => window.location.origin

/** Contenus partageables (image + message) construits à partir des données du championnat. */
export function useShareActions() {
  const share = useShare()
  const { profileOf, nameOf, roundById, weekById, rounds, matches, byes, tournament } = useChampionship()

  const player = (participantId: string): SharePlayer => {
    const p = profileOf(participantId)
    return { name: p?.display_name ?? 'Joueur', color: p?.avatar_color ?? 'violet', chesscom: p?.chesscom_username }
  }

  return {
    /** Annonce d'un match à venir, ou résultat d'un match validé. */
    match(m: Match) {
      const round = roundById.get(m.round_id)!
      const week = weekById.get(round.week_id)!
      const white = player(m.white_id)
      const black = player(m.black_id)
      const when = `${weekLabel(week.number)} · Ronde ${round.number} · ${dayName(round.play_date)} ${ddmm(round.play_date)}`
      const validated = m.status === 'validated' && m.result
      const text = validated
        ? m.result === 'draw'
          ? `🤝 Match nul entre ${white.name} et ${black.name} (${weekLabel(week.number)}, ronde ${round.number}).`
          : `🏆 Victoire de ${m.result === 'white_win' ? white.name : black.name} contre ${m.result === 'white_win' ? black.name : white.name} (${weekLabel(week.number)}, ronde ${round.number}) !`
        : `♟️ ${white.name} (Blancs) vs ${black.name} (Noirs) — ${weekLabel(week.number)}, ronde ${round.number}. La partie commence sur Chess.com, venez suivre !`
      share({
        title: validated ? 'Partager le résultat' : 'Annoncer le match',
        text,
        filename: `chessir-${validated ? 'resultat' : 'match'}.png`,
        build: () =>
          renderMatchCard({
            kicker: validated ? 'Résultat' : 'Match du jour',
            white,
            black,
            when,
            result: validated ? m.result : null,
            url: appUrl(),
          }),
      })
    },

    /** Match en direct (Arène) : tout participant peut le partager au groupe. */
    live(m: Match) {
      const round = roundById.get(m.round_id)!
      const week = weekById.get(round.week_id)!
      const white = player(m.white_id)
      const black = player(m.black_id)
      const watch = [white, black]
        .filter((p) => p.chesscom)
        .map((p) => `• ${p.name} : https://www.chess.com/member/${p.chesscom}`)
      share({
        title: 'Partager le direct',
        text:
          `🔴 EN DIRECT : ${white.name} (Blancs) affronte ${black.name} (Noirs) — ${weekLabel(week.number)}, ronde ${round.number}.` +
          (watch.length ? `\nRegardez la partie sur Chess.com :\n${watch.join('\n')}` : '') +
          `\nToutes les parties en cours sont dans l'Arène 🔥`,
        filename: 'chessir-direct.png',
        build: () =>
          renderMatchCard({
            kicker: 'Arène',
            white,
            black,
            when: `${weekLabel(week.number)} · Ronde ${round.number}`,
            live: true,
            url: appUrl(),
          }),
      })
    },

    /** Classement général ou de la semaine (10 premiers). */
    standings(rows: StandingRow[], opts: { week?: Week; myId?: string }) {
      const title = opts.week ? `Classement · ${weekLabel(opts.week.number)}` : 'Classement général'
      const top = rows.slice(0, 3).map((r) => `${['🥇', '🥈', '🥉'][r.rank - 1] ?? `${r.rank}.`} ${r.display_name} — ${r.points} pts`)
      share({
        title: 'Partager le classement',
        text: `📊 ${title}${tournament ? ` — ${tournament.name}` : ''}\n${top.join('\n')}`,
        filename: 'chessir-classement.png',
        build: () =>
          renderStandingsCard({
            kicker: opts.week ? weekRange(opts.week.start_date) : 'Classement',
            title,
            rows: rows.map((r) => ({
              rank: r.rank,
              name: r.display_name,
              color: r.avatar_color,
              points: r.points,
              record: `${r.wins}V ${r.draws}N ${r.losses}D`,
              highlight: r.participant_id === opts.myId,
            })),
            url: appUrl(),
          }),
      })
    },

    /** Distinction ou badge obtenu par un joueur. */
    award(a: Achievement, participantId: string, weekId?: string | null) {
      const week = weekId ? weekById.get(weekId) : undefined
      const p = player(participantId)
      share({
        title: 'Partager la récompense',
        text:
          a.kind === 'distinction'
            ? `🏅 ${p.name} est « ${a.name} »${week ? ` de la ${weekLabel(week.number).toLowerCase()}` : ''} ! ${a.description}`
            : `🎖️ ${p.name} débloque le badge « ${a.name} » : ${a.description}`,
        filename: 'chessir-recompense.png',
        build: () =>
          renderAwardCard({
            kicker: week ? weekLabel(week.number) : a.kind === 'badge' ? 'Badge débloqué' : 'Distinction',
            award: a.name,
            description: a.description,
            icon: a.icon,
            player: p,
            url: appUrl(),
          }),
      })
    },

    /** Tirage complet d'une semaine (3 rondes). */
    draw(week: Week) {
      const weekRounds = rounds.filter((r) => r.week_id === week.id).sort((a, b) => a.number - b.number)
      share({
        title: 'Partager le tirage',
        text: `🎲 Tirage de la ${weekLabel(week.number).toLowerCase()} (${weekRange(week.start_date)}) : vos 3 adversaires sont connus. Bonne semaine à tous !`,
        filename: `chessir-tirage-semaine-${week.number}.png`,
        build: () =>
          renderDrawCard({
            kicker: weekRange(week.start_date),
            title: `Tirage · ${weekLabel(week.number)}`,
            rounds: weekRounds.map((r) => ({
              label: `${dayName(r.play_date)} · Ronde ${r.number}`,
              pairs: matches.filter((m) => m.round_id === r.id).map((m) => [nameOf(m.white_id), nameOf(m.black_id)] as [string, string]),
              bye: (() => {
                const b = byes.find((x) => x.round_id === r.id)
                return b ? nameOf(b.participant_id) : null
              })(),
            })),
            url: appUrl(),
          }),
      })
    },
  }
}
