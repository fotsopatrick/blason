import { Link } from 'react-router-dom'
import { DifficultyBadge, SkillTags } from '@/components/ui'
import type { Quest } from '@/lib/types'

export default function QuestCard({ quest }: { quest: Quest }) {
  return (
    <Link
      to={`/app/quests/${quest.id}`}
      className="card h-full bg-base-100 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="card-body">
        <div className="flex items-center justify-between gap-2">
          <DifficultyBadge difficulty={quest.difficulty} />
          <span className="badge badge-accent badge-sm font-semibold">⚡ {quest.xp_reward} XP</span>
        </div>
        <h2 className="card-title text-base leading-snug">{quest.title}</h2>
        {quest.story && (
          <p className="line-clamp-2 text-xs italic text-base-content/60">{quest.story}</p>
        )}
        <p className="line-clamp-3 text-sm text-base-content/70">{quest.description}</p>
        <div className="mt-auto pt-2">
          <SkillTags skills={quest.skills} max={4} />
          <div className="mt-2 flex items-center justify-between text-xs text-base-content/50">
            <span>⏱️ ~{quest.estimated_hours} h</span>
            <span className="flex items-center gap-1">
              {quest.source === 'ai' && <span title="Générée par IA">🤖</span>}
              {quest.profiles?.display_name ?? ''}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
