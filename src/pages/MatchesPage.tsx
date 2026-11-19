import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { History, Info, Swords } from 'lucide-react'
import { useAuth } from '../state/auth'
import { useChampionship } from '../state/championship'
import { ByeCard, HistoryRow, WeekMatchCard, useByesOf, useGamesOf } from '../components/matches'
import { EmptyState, PageHeader, PageLoader, Segmented, Stat, InfoBox } from '../components/ui'
import { BellButton } from '../components/Layout'
import { pad2, weekRange } from '../lib/format'

export default function MatchesPage() {
  const { profile } = useAuth()
  const { loading, me, activeWeek, weeks } = useChampionship()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'week' | 'history'>(params.get('vue') === 'historique' ? 'history' : 'week')
  const games = useGamesOf(me?.id, profile?.id)
  const week = activeWeek ?? weeks[0] ?? null
  const byes = useByesOf(me?.id, week?.id)

  if (loading) return <PageLoader />

  type Item = { n: number; game?: (typeof games)[number]; bye?: (typeof byes)[number] }
  const weekItems: Item[] = [
    ...games.filter((g) => g.week.id === week?.id).map((g) => ({ n: g.round.number, game: g })),
    ...byes.map((b) => ({ n: b.round.number, bye: b })),
  ].sort((a, b) => a.n - b.n)
  const history = games.filter((g) => g.week.id !== week?.id || g.match.status !== 'scheduled')
  const done = games.filter((g) => g.outcome)
  const count = (o: string) => done.filter((g) => g.outcome === o).length

  return (
    <>
      <PageHeader title="Confrontations" right={<BellButton />} />
      {!me ? (
        <EmptyState icon={Swords} title="Pas encore de confrontations">
          Vous apparaîtrez ici dès que l'administrateur vous aura inscrit et publié un tirage.
        </EmptyState>
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'week', label: week ? `Semaine ${pad2(week.number)}` : 'Semaine' },
              { value: 'history', label: 'Historique' },
            ]}
          />

          {tab === 'week' && (
            <div className="space-y-3">
              {week && (
                <p className="-mt-1 text-center text-[13px] text-muted">
                  {weekRange(week.start_date)} · {week.status === 'active' ? 'en cours' : 'clôturée'}
                </p>
              )}
              {weekItems.length === 0 ? (
                <EmptyState icon={Swords} title="Pas de tirage cette semaine">
                  Le tirage est publié le dimanche. Vos trois adversaires apparaîtront ici.
                </EmptyState>
              ) : (
                weekItems.map((item, i) =>
                  item.game ? (
                    <WeekMatchCard key={item.game.match.id} game={item.game} index={i} />
                  ) : (
                    <ByeCard
                      key={item.bye!.bye.id}
                      bye={item.bye!.bye}
                      playDate={item.bye!.round.play_date}
                      roundNumber={item.bye!.round.number}
                    />
                  ),
                )
              )}
              <InfoBox icon={Info}>
                Les matchs se jouent sur Chess.com. Annoncez la partie dans le groupe avant de commencer, puis
                déclarez le résultat ici : votre adversaire le confirmera.
              </InfoBox>
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2.5">
                <Stat value={count('win')} label="Victoires" tone="win" />
                <Stat value={count('draw')} label="Nuls" tone="draw" />
                <Stat value={count('loss')} label="Défaites" tone="loss" />
              </div>
              {history.length === 0 ? (
                <EmptyState icon={History} title="Aucun match joué">
                  Vos résultats validés apparaîtront ici.
                </EmptyState>
              ) : (
                history.map((g) => <HistoryRow key={g.match.id} game={g} />)
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
