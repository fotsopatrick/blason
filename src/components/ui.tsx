import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { levelProgress, levelTitle } from '@/lib/levels'
import { DIFFICULTY_BADGE, DIFFICULTY_LABELS, initials } from '@/lib/format'
import type { QuestDifficulty } from '@/lib/types'

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-base-content/60">
      <span className="loading loading-spinner loading-lg text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function ErrorState({
  message = 'Une erreur est survenue.',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="text-5xl">🧨</div>
      <p className="max-w-md text-base-content/70">{message}</p>
      {onRetry && (
        <button className="btn btn-outline btn-sm" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  icon = '🗺️',
  title,
  hint,
  action,
}: {
  icon?: string
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="text-5xl">{icon}</div>
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-md text-sm text-base-content/60">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-base-content/60">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function UserAvatar({
  url,
  name,
  size = 'md',
}: {
  url?: string | null
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}) {
  const sizeClass = {
    xs: 'w-6 text-[10px]',
    sm: 'w-8 text-xs',
    md: 'w-10 text-sm',
    lg: 'w-16 text-xl',
    xl: 'w-24 text-3xl',
  }[size]
  if (url) {
    return (
      <div className="avatar">
        <div className={`${sizeClass} rounded-full ring-2 ring-primary/20`}>
          <img src={url} alt={name} />
        </div>
      </div>
    )
  }
  return (
    <div className="avatar avatar-placeholder">
      <div className={`${sizeClass} rounded-full bg-primary text-primary-content ring-2 ring-primary/20`}>
        <span>{initials(name) || '?'}</span>
      </div>
    </div>
  )
}

export function SkillTags({ skills, max }: { skills: string[]; max?: number }) {
  const shown = max ? skills.slice(0, max) : skills
  const rest = max ? skills.length - shown.length : 0
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((skill) => (
        <span key={skill} className="badge badge-outline badge-sm border-secondary/40 text-secondary">
          {skill}
        </span>
      ))}
      {rest > 0 && <span className="badge badge-ghost badge-sm">+{rest}</span>}
    </div>
  )
}

export function DifficultyBadge({ difficulty }: { difficulty: QuestDifficulty }) {
  return (
    <span className={`badge badge-sm ${DIFFICULTY_BADGE[difficulty]}`}>
      {DIFFICULTY_LABELS[difficulty]}
    </span>
  )
}

export function XPBar({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const { level, nextLevelXp, currentLevelXp, progress } = levelProgress(xp)
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-primary">
          Nv. {level}
          {!compact && <span className="ml-1 text-base-content/60">· {levelTitle(level)}</span>}
        </span>
        <span className="text-base-content/60">
          {xp - currentLevelXp} / {nextLevelXp - currentLevelXp} XP
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-base-300">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(2, progress * 100)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

export function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: string
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body p-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{icon}</div>
          <div className="min-w-0">
            <div className="text-xs text-base-content/60">{label}</div>
            <div className="truncate text-xl font-bold">{value}</div>
            {hint && <div className="text-xs text-base-content/50">{hint}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
