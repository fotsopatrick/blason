// QuestForge — mise en scène des quêtes.
// Une quête (forgée depuis une offre d'emploi) devient une courte scène :
// un biome sombre déduit des compétences demandées, un gardien qui parle,
// et le récit de la quête raconté en dialogues.

import type { Quest } from '@/lib/types'

export type BiomeId = 'citadelle' | 'foret' | 'temple' | 'forge'

export interface QuestCinemaTheme {
  biome: BiomeId
  biomeName: string
  gardien: string
  accent: string
  accentSoft: string
  particles: 'embers' | 'fireflies' | 'runes' | 'sparks'
  lines: string[]
}

const KEYWORDS = {
  citadelle: [
    'kubernetes',
    'k8s',
    'docker',
    'devops',
    'cloud',
    'terraform',
    'ansible',
    'ci/cd',
    'cicd',
    'aws',
    'azure',
    'gcp',
    'backend',
    'server',
    'api',
    'database',
    'réseau',
    'reseau',
    'infra',
    'linux',
    'sécurité',
    'securite',
    'microservice',
  ],
  foret: [
    'react',
    'frontend',
    'javascript',
    'typescript',
    'css',
    'web',
    'mobile',
    'design',
    'ui',
    'ux',
    'interface',
    'tailwind',
    'figma',
    'accessibilité',
    'accessibilite',
  ],
  temple: [
    'python',
    'ai',
    'ia',
    'machine learning',
    'machine',
    'data',
    'ml',
    'llm',
    'sql',
    'analyse',
    'analytics',
    'science',
    'statistique',
    'ia générative',
    'deep learning',
    'prompt',
  ],
}

const BIOME_META: Record<
  BiomeId,
  { name: string; gardien: string; accent: string; accentSoft: string; particles: QuestCinemaTheme['particles'] }
> = {
  citadelle: {
    name: 'La Citadelle des Données',
    gardien: 'La Gardienne des Circuits',
    accent: '#e8c15c',
    accentSoft: '#8a6d2b',
    particles: 'runes',
  },
  foret: {
    name: 'La Forêt des Runes',
    gardien: 'Le Rôdeur des Runes',
    accent: '#7ee0a3',
    accentSoft: '#2f7d4f',
    particles: 'fireflies',
  },
  temple: {
    name: 'Le Temple des Savoirs',
    gardien: "L'Archiviste",
    accent: '#8fb4ff',
    accentSoft: '#3b5b9e',
    particles: 'sparks',
  },
  forge: {
    name: "La Forge des Héros",
    gardien: 'Le Maître Forgeron',
    accent: '#ff9a4d',
    accentSoft: '#9c4a12',
    particles: 'embers',
  },
}

function inferBiome(quest: Quest): BiomeId {
  const haystack = [
    quest.title,
    quest.description,
    quest.story,
    ...quest.skills,
    quest.job_posting ?? '',
  ]
    .join(' ')
    .toLowerCase()

  const score: Record<BiomeId, number> = { citadelle: 0, foret: 0, temple: 0, forge: 0 }
  for (const [biome, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      if (haystack.includes(w)) score[biome as BiomeId] += 1
    }
  }

  const best = (Object.entries(score) as [BiomeId, number][]).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : 'forge'
}

function splitLines(story: string, title: string, maxLines = 4): string[] {
  const clean = story.trim()
  if (!clean) {
    return [
      `${title} — cette quête t'attend.`,
      "Des compétences précises, une épreuve à relever, une preuve à forger.",
      "Rassemble ta guilde, avance étape par étape, et laisse l'XP parler.",
    ]
  }
  const sentences = clean
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const lines: string[] = []
  for (const s of sentences) {
    const chunks = s.length > 150 ? [s.slice(0, 150).trimEnd(), s.slice(150)] : [s]
    for (const c of chunks) {
      if (c.length < 2) continue
      lines.push(c.endsWith('.') || c.endsWith('!') || c.endsWith('?') ? c : `${c}.`)
      if (lines.length >= maxLines) break
    }
    if (lines.length >= maxLines) break
  }
  return lines.length > 0 ? lines : [`${title} — cette quête t'attend.`]
}

export function inferCinema(quest: Quest): QuestCinemaTheme {
  const biome = inferBiome(quest)
  const meta = BIOME_META[biome]
  return {
    biome,
    biomeName: meta.name,
    gardien: meta.gardien,
    accent: meta.accent,
    accentSoft: meta.accentSoft,
    particles: meta.particles,
    lines: splitLines(quest.story, quest.title),
  }
}

export function offreLabel(quest: Quest): string | null {
  const raw = (quest.job_posting ?? '').trim()
  if (!raw) return null
  const first = raw.split('\n')[0].trim()
  if (!first || first.length > 90) return null
  return first
}
