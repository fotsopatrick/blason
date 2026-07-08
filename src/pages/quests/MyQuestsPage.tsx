import { Link } from 'react-router-dom'
import { useMyAssignments } from '@/hooks/queries'
import { EmptyState, LoadingState, PageHeader } from '@/components/ui'
import { ASSIGNMENT_STATUS_LABELS, formatRelative } from '@/lib/format'
import type { AssignmentStatus } from '@/lib/types'

const STATUS_BADGE: Record<AssignmentStatus, string> = {
  in_progress: 'badge-info',
  submitted: 'badge-warning',
  completed: 'badge-success',
  abandoned: 'badge-ghost',
}

export default function MyQuestsPage() {
  const { data: assignments, isLoading } = useMyAssignments()

  return (
    <div>
      <PageHeader
        title="Mes quêtes"
        subtitle="Ton journal d'aventures : solo et quêtes de guilde."
      />

      {isLoading ? (
        <LoadingState label="Ouverture du journal…" />
      ) : assignments && assignments.length > 0 ? (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-0">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Quête</th>
                    <th>Mode</th>
                    <th>XP</th>
                    <th>Statut</th>
                    <th>Acceptée</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id} className="hover">
                      <td className="max-w-xs">
                        <Link to={`/app/quests/${a.quest_id}`} className="link-hover font-medium">
                          {a.quests?.title}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap text-sm">
                        {a.guild_id ? `🛡️ ${a.guilds?.name ?? 'Guilde'}` : '👤 Solo'}
                      </td>
                      <td className="whitespace-nowrap">⚡ {a.quests?.xp_reward}</td>
                      <td>
                        <span className={`badge badge-sm ${STATUS_BADGE[a.status]}`}>
                          {ASSIGNMENT_STATUS_LABELS[a.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-sm text-base-content/60">
                        {formatRelative(a.accepted_at)}
                      </td>
                      <td>
                        <Link to={`/app/workspace/${a.id}`} className="btn btn-outline btn-xs">
                          🏕️ Espace
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon="🗺️"
          title="Ton journal est vide"
          hint="Accepte ta première quête depuis le tableau des quêtes."
          action={<Link to="/app/quests" className="btn btn-primary btn-sm">Parcourir les quêtes</Link>}
        />
      )}
    </div>
  )
}
