-- QuestForge — schéma SQLite (backend local, zéro clé, zéro paiement)
-- Traduction du schéma Supabase/PostgreSQL d'origine.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  career_goal TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','company','admin')),
  xp INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  emblem TEXT NOT NULL DEFAULT '',
  motto TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  max_members INTEGER NOT NULL DEFAULT 6,
  xp INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, user_id),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS guild_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  story TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  skills TEXT NOT NULL DEFAULT '[]',
  resources TEXT NOT NULL DEFAULT '[]',
  difficulty TEXT NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner','intermediate','advanced','expert')),
  xp_reward INTEGER NOT NULL DEFAULT 100,
  estimated_hours INTEGER NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai')),
  job_posting TEXT,
  created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quest_assignments (
  id TEXT PRIMARY KEY,
  quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  guild_id TEXT REFERENCES guilds(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','completed','abandoned')),
  accepted_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  CHECK ((user_id IS NOT NULL AND guild_id IS NULL) OR (user_id IS NULL AND guild_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES quest_assignments(id) ON DELETE CASCADE,
  submitted_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  github_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  deliverable_urls TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  feedback TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  guild_id TEXT REFERENCES guilds(id) ON DELETE SET NULL,
  quest_id TEXT REFERENCES quests(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guild_messages ON guild_messages (guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quests_status ON quests (status);
CREATE INDEX IF NOT EXISTS idx_assign_quest ON quest_assignments (quest_id);
CREATE INDEX IF NOT EXISTS idx_assign_guild ON quest_assignments (guild_id);
CREATE INDEX IF NOT EXISTS idx_subs_assignment ON submissions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_guild ON xp_events (guild_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Table carrière : les offres d'emploi, par domaine
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offres (
  id TEXT PRIMARY KEY,
  titre TEXT NOT NULL,
  entreprise TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  domaine TEXT NOT NULL DEFAULT 'inconnu',
  tags TEXT NOT NULL DEFAULT '[]',
  date_parution TEXT,
  statut TEXT NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle','postulee','contactee','realisation_en_cours','realisation_envoyee','terminee')),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table carrière : les entretiens (préparation d'un poste)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entretiens (
  id TEXT PRIMARY KEY,
  offre_id TEXT REFERENCES offres(id) ON DELETE SET NULL,
  poste TEXT NOT NULL,
  entreprise TEXT NOT NULL DEFAULT '',
  date_entretien TEXT,
  etat TEXT NOT NULL DEFAULT 'a_preparer' CHECK (etat IN ('a_preparer','preparation','pret','passe')),
  preparation TEXT NOT NULL DEFAULT '',
  questions_reelles TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table carrière : la réalisation par projet (une offre -> un projet qui
-- démontre une compétence, avec un lien + un accès à envoyer à l'entreprise).
-- Le mot « preuve » et ses synonymes sont volontairement absents : on parle
-- de RÉALISATION.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS realisations (
  id TEXT PRIMARY KEY,
  offre_id TEXT REFERENCES offres(id) ON DELETE SET NULL,
  poste TEXT NOT NULL DEFAULT '',
  projet TEXT NOT NULL DEFAULT '',
  competence TEXT NOT NULL DEFAULT '',
  lien TEXT NOT NULL DEFAULT '',
  acces_login TEXT NOT NULL DEFAULT '',
  acces_mot_de_passe TEXT NOT NULL DEFAULT '',
  etat TEXT NOT NULL DEFAULT 'brainstorming' CHECK (etat IN ('brainstorming','construction','securite','pret','envoyee')),
  circuit_id INTEGER,
  created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
