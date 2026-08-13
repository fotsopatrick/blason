export type UserRole = 'student' | 'company' | 'admin'
export type QuestDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert'
export type QuestStatus = 'draft' | 'published' | 'archived'
export type AssignmentStatus = 'in_progress' | 'submitted' | 'completed' | 'abandoned'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface Profile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string
  skills: string[]
  career_goal: string
  role: UserRole
  xp: number
  is_banned: boolean
  created_at: string
}

export interface Guild {
  id: string
  name: string
  emblem: string
  motto: string
  description: string
  max_members: number
  xp: number
  created_by: string
  created_at: string
}

export interface GuildMember {
  guild_id: string
  user_id: string
  role: 'leader' | 'member'
  joined_at: string
  profiles?: Profile
}

export interface GuildMessage {
  id: number
  guild_id: string
  user_id: string
  content: string
  created_at: string
}

export interface QuestStep {
  title: string
  description: string
}

export interface QuestResource {
  label: string
  url: string
}

export interface Quest {
  id: string
  title: string
  story: string
  description: string
  steps: QuestStep[]
  skills: string[]
  resources: QuestResource[]
  difficulty: QuestDifficulty
  xp_reward: number
  estimated_hours: number
  status: QuestStatus
  source: 'manual' | 'ai'
  job_posting: string | null
  // L'offre d'ou la quete a ete forgee. Vide pour un parcours libre
  // (les onze quetes Kubernetes, par exemple). Le champ existait en base
  // depuis le debut, il manquait au contrat TypeScript (13/08/2026).
  offre_id: string | null
  created_by: string
  created_at: string
  profiles?: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>
}

export interface QuestAssignment {
  id: string
  quest_id: string
  user_id: string | null
  guild_id: string | null
  status: AssignmentStatus
  accepted_by: string
  accepted_at: string
  completed_at: string | null
  quests?: Quest
  guilds?: Guild
  profiles?: Profile
}

export interface Submission {
  id: string
  assignment_id: string
  submitted_by: string
  github_url: string
  notes: string
  deliverable_urls: string[]
  status: SubmissionStatus
  feedback: string
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  profiles?: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>
}

export interface GeneratedQuest {
  title: string
  story: string
  description: string
  steps: QuestStep[]
  skills: string[]
  resources: QuestResource[]
  difficulty: QuestDifficulty
  estimated_hours: number
  xp_reward: number
  provider: string
}

export interface LeaderboardUser {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  total_xp: number
  quests_completed: number
}

export interface LeaderboardGuild {
  guild_id: string
  name: string
  emblem: string
  member_count: number
  total_xp: number
  quests_completed: number
}

export interface AdminStats {
  total_users: number
  active_users_30d: number
  total_guilds: number
  total_quests: number
  published_quests: number
  quests_completed: number
  pending_submissions: number
  total_xp_distributed: number
}
