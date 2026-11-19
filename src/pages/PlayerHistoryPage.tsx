import { useParams } from 'react-router-dom'
import { History } from 'lucide-react'
import { useChampionship } from '../state/championship'
import { HistoryRow, useGamesOf } from '../components/matches'
import { EmptyState, PageHeader, PageLoader } from '../components/ui'

/** Historique complet des matchs d'un joueur (depuis son profil). */
export default function PlayerHistoryPage() {
  const { participantId } = useParams()
  const { loading, nameOf } = useChampionship()
  const games = useGamesOf(participantId)
  if (loading) return <PageLoader />
  return (
    <>
      <PageHeader title={`Matchs de ${nameOf(participantId ?? '')}`} back />
      {games.length === 0 ? (
        <EmptyState icon={History} title="Aucun match" />
      ) : (
        <div className="space-y-2.5">
          {games.map((g) => (
            <HistoryRow key={g.match.id} game={g} />
          ))}
        </div>
      )}
    </>
  )
}
