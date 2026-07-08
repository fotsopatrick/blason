// Courbe de niveaux : le niveau n est atteint à 50 * n * (n - 1) XP.
// Miroir de public.level_for_xp côté SQL.

export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2))
}

export function xpForLevel(level: number): number {
  return 50 * level * (level - 1)
}

export interface LevelProgress {
  level: number
  currentLevelXp: number
  nextLevelXp: number
  progress: number // 0..1 vers le niveau suivant
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp)
  const currentLevelXp = xpForLevel(level)
  const nextLevelXp = xpForLevel(level + 1)
  const progress = Math.min(1, (xp - currentLevelXp) / (nextLevelXp - currentLevelXp))
  return { level, currentLevelXp, nextLevelXp, progress }
}

const LEVEL_TITLES = [
  'Apprenti·e',
  'Écuyer·ère',
  'Compagnon·ne',
  'Artisan·e',
  'Forgeron·ne',
  'Maître Forgeron·ne',
  'Champion·ne',
  'Héros / Héroïne',
  'Légende',
  'Mythe vivant',
]

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, level - 1)]
}
