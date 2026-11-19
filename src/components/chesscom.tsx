import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Crown, ExternalLink, RefreshCw, Sparkles, BadgeCheck, XCircle } from 'lucide-react'
import { acceptChesscomGame, chesscom } from '../lib/api'
import type { ChesscomGame, Match, MatchResult, TimeClass } from '../lib/types'
import { chessComProfile, outcomeFor, OUTCOME_LABEL, relativeTime } from '../lib/format'
import { useChampionship } from '../state/championship'
import { ErrorBox, Spinner, cx } from './ui'

export const TIME_CLASS_LABEL: Record<string, string> = {
  rapid: 'Rapide',
  blitz: 'Blitz',
  bullet: 'Bullet',
  daily: 'Quotidienne',
}

const COOLDOWN_MS = 2 * 60 * 1000

function gameDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Libellé d'un résultat, du point de vue du joueur connecté si possible. */
export function useResultText(match: Match, myColor: 'white' | 'black' | null) {
  const { nameOf } = useChampionship()
  return (r: MatchResult) =>
    myColor
      ? OUTCOME_LABEL[outcomeFor(r, myColor)]
      : r === 'draw'
        ? 'Match nul'
        : `Victoire de ${nameOf(r === 'white_win' ? match.white_id : match.black_id)}`
}

/** Lien compact vers la partie Chess.com liée à un match (historique). */
export function GameLinkIcon({ match }: { match: Match }) {
  const { chesscomGames } = useChampionship()
  const g = match.chesscom_game_id ? chesscomGames.find((x) => x.id === match.chesscom_game_id) : undefined
  if (!g) return null
  // Bouton (et non lien) : il est affiché à l'intérieur d'une ligne cliquable.
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        window.open(g.game_url, '_blank', 'noopener,noreferrer')
      }}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-[#8fa8ff] hover:bg-white/5"
      title="Voir la partie sur Chess.com"
      aria-label="Voir la partie sur Chess.com"
    >
      <ExternalLink size={15} />
    </button>
  )
}

/**
 * Bloc « Partie Chess.com » du détail d'un match.
 * La détection ne fait que proposer : accepter = déclarer, l'adversaire confirme ensuite.
 */
export function ChesscomMatchBlock({ match, myColor, weekOpen }: { match: Match; myColor: 'white' | 'black' | null; weekOpen: boolean }) {
  const { gamesOfMatch, profileOf, reload } = useChampionship()
  const games = gamesOfMatch(match.id)
  const linked = games.find((g) => g.id === match.chesscom_game_id)
  const certain = games.find((g) => g.confidence === 'certain')
  const resultText = useResultText(match, myColor)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const autoTried = useRef(false)

  const usernames = [profileOf(match.white_id)?.chesscom_username, profileOf(match.black_id)?.chesscom_username]
  const canSearch = usernames.every(Boolean) && (myColor !== null)
  const recentlyChecked = match.chesscom_checked_at && Date.now() - new Date(match.chesscom_checked_at).getTime() < COOLDOWN_MS

  async function search(silent = false) {
    setBusy('search')
    setError(null)
    setInfo(null)
    try {
      const r = await chesscom<{ status: string; reason?: string }>({ action: 'detect-match', match_id: match.id })
      await reload()
      if (!silent) {
        if (r.status === 'none') setInfo("Aucune partie trouvée pour l'instant. Chess.com peut publier les parties avec du retard : réessayez plus tard ou déclarez le résultat.")
        if (r.status === 'cooldown') setInfo('Recherche déjà effectuée il y a moins de 2 minutes.')
        if (r.status === 'no_username') setInfo('Les deux joueurs doivent avoir un pseudo Chess.com vérifié.')
      }
    } catch (e) {
      if (!silent) setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Recherche automatique à l'ouverture d'un match à jouer (une fois, hors délai de 2 min).
  useEffect(() => {
    if (autoTried.current || !canSearch || match.status !== 'scheduled' || recentlyChecked || certain) return
    autoTried.current = true
    void search(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id])

  async function accept(game: ChesscomGame) {
    setBusy(game.id)
    setError(null)
    try {
      await acceptChesscomGame(match.id, game.id)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Match validé ou en attente avec une partie liée : affichage des détails.
  if (linked) return <LinkedGame game={linked} match={match} myColor={myColor} />

  const showSearch = match.status === 'scheduled' && myColor && weekOpen
  if (!showSearch && games.length === 0) return null

  // Rien trouvé pour l'instant : une seule ligne discrète, pour garder l'écran court.
  if (games.length === 0) {
    return (
      <section className="card flex items-center gap-3 px-4 py-3">
        <Sparkles size={18} className="shrink-0 text-gold-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium">Partie Chess.com</p>
          <p className="text-[12px] text-muted">
            {!canSearch
              ? 'Pseudo Chess.com manquant : déclarez à la main.'
              : busy === 'search'
                ? 'Recherche en cours…'
                : info ?? (match.chesscom_checked_at ? `Pas encore trouvée · ${relativeTime(match.chesscom_checked_at)}` : 'Retrouvée automatiquement après la partie')}
          </p>
          {error && <p className="text-[12px] text-loss">{error}</p>}
        </div>
        {canSearch && (
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-[13px] text-ink hover:bg-white/10 disabled:opacity-40"
            onClick={() => void search()}
            disabled={busy !== null || !!recentlyChecked}
            title={recentlyChecked ? 'Nouvelle recherche possible dans 2 minutes' : undefined}
          >
            {busy === 'search' ? <Spinner className="size-4" /> : <RefreshCw size={14} />} Rechercher
          </button>
        )}
      </section>
    )
  }

  return (
    <section className="card space-y-3 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
          <Sparkles size={17} className="text-gold-400" /> Partie Chess.com
        </h2>
        {showSearch && canSearch && (
          <button
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted hover:bg-white/5 hover:text-ink disabled:opacity-50"
            onClick={() => void search()}
            disabled={busy !== null || !!recentlyChecked}
            title={recentlyChecked ? 'Nouvelle recherche possible dans 2 minutes' : undefined}
          >
            {busy === 'search' ? <Spinner className="size-4" /> : <RefreshCw size={14} />} Rechercher
          </button>
        )}
      </div>

      {!canSearch && showSearch && (
        <p className="text-[13px] text-muted">
          Détection impossible : les deux joueurs doivent renseigner leur pseudo Chess.com. Déclarez le résultat ci-dessous.
        </p>
      )}

      {certain && (
        <div className="space-y-3 rounded-xl border border-win/30 bg-win/[0.07] p-3">
          <p className="text-[14px]">
            Partie trouvée : <strong>{certain.result_for_match ? resultText(certain.result_for_match) : '—'}</strong>
          </p>
          <GameMeta game={certain} />
          {match.status === 'scheduled' && myColor && weekOpen && (
            <button className="btn-gold w-full text-[16px]" disabled={busy !== null} onClick={() => void accept(certain)}>
              {busy === certain.id ? <Spinner className="text-night-950" /> : <CheckCircle2 size={18} />} Accepter ce résultat
            </button>
          )}
          <p className="text-[12px] text-faint">
            Votre adversaire devra confirmer. Si ce n'est pas la bonne partie, déclarez le résultat manuellement ci-dessous.
          </p>
        </div>
      )}

      {!certain && games.length > 0 && (
        <div className="space-y-2.5">
          <p className="flex items-start gap-2 text-[13px] text-warn">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {games[0].uncertainty_reason ?? 'Correspondance incertaine'} : choisissez la bonne partie ou déclarez manuellement.
          </p>
          {games.map((g) => {
            const choosable = g.colors_match && g.time_class_ok && !!g.result_for_match
            return (
              <div key={g.id} className="rounded-xl bg-white/[0.03] p-3">
                <p className="text-[14px]">{g.result_for_match ? resultText(g.result_for_match) : 'Résultat non reconnu'}</p>
                <GameMeta game={g} />
                {match.status === 'scheduled' && myColor && weekOpen && (
                  choosable ? (
                    <button className="btn-ghost mt-2 w-full py-2 text-[14px]" disabled={busy !== null} onClick={() => void accept(g)}>
                      {busy === g.id ? <Spinner /> : <CheckCircle2 size={16} />} C'est cette partie
                    </button>
                  ) : (
                    <p className="mt-2 text-[12px] text-faint">
                      {!g.colors_match ? 'Couleurs inversées : seul l’administrateur peut retenir cette partie.' : 'Cadence non acceptée dans ce championnat.'}
                    </p>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}

      {info && <p className="text-[13px] text-muted">{info}</p>}
      <ErrorBox>{error}</ErrorBox>
    </section>
  )
}

function GameMeta({ game }: { game: ChesscomGame }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
      <span>{gameDate(game.end_time)}</span>
      <span>{TIME_CLASS_LABEL[game.time_class] ?? game.time_class}</span>
      <span className={cx(!game.colors_match && 'text-warn')}>
        ⚪ {game.white_username} · ⚫ {game.black_username}
      </span>
      {game.rated === false && <span>amicale</span>}
      <a href={game.game_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#8fa8ff] hover:underline">
        Voir la partie <ExternalLink size={11} />
      </a>
    </div>
  )
}

function LinkedGame({ game, match, myColor }: { game: ChesscomGame; match: Match; myColor: 'white' | 'black' | null }) {
  const resultText = useResultText(match, myColor)
  const acc = game.accuracies
  return (
    <section className="card space-y-2 px-4 py-4">
      <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
        <BadgeCheck size={18} className="text-win" /> Partie Chess.com liée
      </h2>
      {game.result_for_match && (
        <p className="text-[14px]">
          Résultat sur Chess.com : <strong>{resultText(game.result_for_match)}</strong>
        </p>
      )}
      <GameMeta game={game} />
      <dl className="grid grid-cols-2 gap-2 pt-1 text-[12px]">
        {(game.white_rating || game.black_rating) && (
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <dt className="text-faint">Elo au moment de la partie</dt>
            <dd>
              ⚪ {game.white_rating ?? '—'} · ⚫ {game.black_rating ?? '—'}
            </dd>
          </div>
        )}
        {acc && (acc.white || acc.black) && (
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <dt className="text-faint">Précision des coups</dt>
            <dd>
              ⚪ {acc.white?.toFixed(1) ?? '—'} % · ⚫ {acc.black?.toFixed(1) ?? '—'} %
            </dd>
          </div>
        )}
        {game.eco && (
          <div className="col-span-2 truncate rounded-lg bg-white/[0.03] px-3 py-2">
            <dt className="text-faint">Ouverture</dt>
            <dd className="truncate">{decodeURIComponent(game.eco.split('/').pop() ?? '').replace(/-/g, ' ')}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}

/** Avertissement : la déclaration manuelle contredit une partie détectée comme certaine. */
export function DeclarationMismatch({ match }: { match: Match }) {
  const { gamesOfMatch } = useChampionship()
  const certain = gamesOfMatch(match.id).find((g) => g.confidence === 'certain')
  if (!certain || match.declaration_source !== 'manual' || !match.declared_result) return null
  if (certain.result_for_match === match.declared_result) return null
  return (
    <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-[13px] text-warn">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>
        Cette déclaration ne correspond pas à la partie trouvée sur Chess.com.{' '}
        <a href={certain.game_url} target="_blank" rel="noreferrer" className="underline">
          Voir la partie
        </a>
        . En cas de doute, contestez : l'administrateur verra la partie.
      </span>
    </div>
  )
}

/** Bloc « Sur Chess.com — hors championnat » du profil. */
export function ChesscomStatsCard({ profileId, isMine }: { profileId: string; isMine: boolean }) {
  const { chesscomProfiles, profiles, tournament, reload } = useChampionship()
  const cc = chesscomProfiles.get(profileId)
  const profile = profiles.get(profileId)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!profile?.chesscom_username) return null

  async function refresh() {
    setBusy(true)
    setFailed(false)
    try {
      await chesscom({ action: 'sync-profile', profile_id: profileId })
      await reload()
    } catch {
      setFailed(true) // indisponible : les données en cache restent affichées
    } finally {
      setBusy(false)
    }
  }

  const main = (tournament?.chesscom_time_classes?.[0] ?? 'rapid') as TimeClass
  const r = cc?.ratings[main]
  const others = (['rapid', 'blitz', 'bullet', 'daily'] as const).filter((tc) => tc !== main && cc?.ratings[tc]?.current)
  const total = r ? r.win + r.draw + r.loss : 0
  const share = (v: number) => (total ? Math.round((v / total) * 100) : 0)
  const profileUrl = cc?.url ?? chessComProfile(profile.chesscom_username)

  return (
    <section className="overflow-hidden rounded-2xl border border-[#8fa8ff]/20 bg-linear-to-b from-[#8fa8ff]/[0.07] to-transparent">
      {/* Identité Chess.com */}
      <div className="flex items-center gap-3 px-4 pt-4">
        {cc?.avatar_url ? (
          <img src={cc.avatar_url} alt="" className="size-11 rounded-xl object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="grid size-11 place-items-center rounded-xl bg-[#8fa8ff]/10 text-[#b9c8ff]">
            <Crown size={20} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-wide text-[#b9c8ff] uppercase">Sur Chess.com</p>
          <p className="flex items-center gap-1.5 truncate font-display text-[18px] font-semibold">
            @{cc?.username ?? profile.chesscom_username}
            {cc?.status === 'verified' && <BadgeCheck size={16} className="shrink-0 text-win" aria-label="Compte vérifié" />}
          </p>
        </div>
        <a
          href={profileUrl}
          target="_blank"
          rel="noreferrer"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-[#b9c8ff] hover:bg-white/10"
          aria-label="Ouvrir le profil Chess.com"
          title="Ouvrir le profil Chess.com"
        >
          <ExternalLink size={16} />
        </a>
      </div>

      <div className="px-4 pt-3 pb-4">
        {!cc && <p className="text-[13px] text-muted">Pas encore synchronisé.</p>}

        {cc?.status === 'not_found' && (
          <p className="flex items-center gap-2 rounded-xl bg-loss/10 px-3 py-2.5 text-[13px] text-loss">
            <XCircle size={16} /> Ce pseudo est introuvable sur Chess.com.
          </p>
        )}

        {cc?.status === 'verified' && (
          <>
            {/* Cadence du championnat, mise en avant */}
            <div className="rounded-xl bg-white/[0.04] p-3.5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[12px] text-muted">Elo {TIME_CLASS_LABEL[main]}</p>
                  <p className="font-display text-[34px] leading-none font-bold">{r?.current ?? '—'}</p>
                </div>
                {r?.best && (
                  <p className="pb-0.5 text-right text-[12px] text-muted">
                    Meilleur
                    <span className="block font-display text-[17px] font-semibold text-gold-300">{r.best}</span>
                  </p>
                )}
              </div>
              {total > 0 ? (
                <>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                    <div className="bg-win" style={{ width: `${share(r!.win)}%` }} />
                    <div className="bg-draw" style={{ width: `${share(r!.draw)}%` }} />
                    <div className="bg-loss" style={{ width: `${share(r!.loss)}%` }} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 text-[12px]">
                    <span className="text-win">{r!.win} V · {share(r!.win)} %</span>
                    <span className="text-center text-draw">{r!.draw} N</span>
                    <span className="text-right text-loss">{r!.loss} D</span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[12px] text-faint">Aucune partie {TIME_CLASS_LABEL[main].toLowerCase()} classée.</p>
              )}
            </div>

            {/* Autres cadences */}
            {others.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {others.map((tc) => (
                  <span key={tc} className="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-muted">
                    {TIME_CLASS_LABEL[tc]} <strong className="ml-1 text-ink">{cc.ratings[tc]!.current}</strong>
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-faint">
          <span className="min-w-0 truncate">
            {cc?.joined_at && `Membre depuis ${new Date(cc.joined_at).getFullYear()} · `}
            {cc?.last_online && `vu ${relativeTime(cc.last_online)} · `}
            {cc && `mis à jour ${relativeTime(cc.fetched_at)}`}
          </span>
          {isMine && (
            <button
              onClick={() => void refresh()}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted hover:bg-white/5 hover:text-ink"
            >
              {busy ? <Spinner className="size-3.5" /> : <RefreshCw size={12} />} Actualiser
            </button>
          )}
        </div>
        {(failed || cc?.last_error) && (
          <p className="mt-1 text-[11px] text-warn">Chess.com ne répond pas pour le moment, réessayez plus tard.</p>
        )}
        <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-faint">
          Activité globale sur Chess.com : n'entre ni dans les points ni dans le classement du championnat.
        </p>
      </div>
    </section>
  )
}
