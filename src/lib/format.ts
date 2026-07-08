import type { AssignmentStatus, QuestDifficulty, SubmissionStatus } from './types'

export const DIFFICULTY_LABELS: Record<QuestDifficulty, string> = {
  beginner: 'Novice',
  intermediate: 'Aventurier',
  advanced: 'Vétéran',
  expert: 'Légendaire',
}

export const DIFFICULTY_BADGE: Record<QuestDifficulty, string> = {
  beginner: 'badge-success',
  intermediate: 'badge-info',
  advanced: 'badge-warning',
  expert: 'badge-error',
}

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  in_progress: 'En cours',
  submitted: 'Soumise',
  completed: 'Complétée',
  abandoned: 'Abandonnée',
}

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: 'En attente',
  approved: 'Validée',
  rejected: 'Rejetée',
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days} j`
  return formatDate(iso)
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}
