#!/usr/bin/env node
/**
 * QuestForge — serveur local (Express + SQLite natif Node).
 * Remplaçant de Supabase : zéro clé, zéro compte, zéro paiement.
 *
 * Sert :
 *  - le build React (dist/) en statique,
 *  - une API JSON : auth simple par token, CRUD par table,
 *    RPC (join_guild, review_submission, leaderboards, admin_stats),
 *    storage (avatars, deliverables), realtime polling (guild_messages).
 *
 * Base : server/questforge.db (créée au premier démarrage).
 */
const express = require('express')
const { DatabaseSync } = require('node:sqlite')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const PORT = process.env.PORT || 8088
const HOST = process.env.HOST || '0.0.0.0'
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const DATA_DIR = path.join(__dirname)
const DB_PATH = path.join(DATA_DIR, 'questforge.db')
const STORAGE_DIR = path.join(DATA_DIR, 'storage')
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000 // 30 jours

fs.mkdirSync(STORAGE_DIR, { recursive: true })

const db = new DatabaseSync(DB_PATH)
db.exec(fs.readFileSync(path.join(DATA_DIR, 'schema.sql'), 'utf8'))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const uuid = () => crypto.randomUUID()
const hash = (pwd) =>
  crypto.scryptSync(pwd, 'questforge-sel', 32).toString('hex')

// Sérialiser les enregistrements : JSON pour les colonnes texte en JSON.
function rowOut(r) {
  if (!r) return null
  const out = { ...r }
  for (const k of Object.keys(out)) {
    const v = out[k]
    if (typeof v === 'string' && /^[\[{]/.test(v)) {
      try { out[k] = JSON.parse(v) } catch { /* garde tel quel */ }
    }
    if (v === null) out[k] = null
  }
  return out
}

const TOKENS = new Map() // token -> { user_id, exp }

function issueToken(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  TOKENS.set(token, { user_id: userId, exp: Date.now() + TOKEN_TTL_MS })
  return token
}

function bearerToken(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

function auth(req) {
  const token = bearerToken(req)
  const entry = token ? TOKENS.get(token) : null
  if (!entry || entry.exp < Date.now()) return null
  const profile = db
    .prepare('SELECT * FROM profiles WHERE id = ?')
    .get(entry.user_id)
  if (!profile) return null
  return { token, user: profile, profile: rowOut(profile) }
}

function requireAuth(req, res, next) {
  const a = auth(req)
  if (!a) return res.status(401).json({ message: 'Authentification requise' })
  req.auth = a
  next()
}

function requireAdmin(req, res, next) {
  if (req.auth?.profile?.role !== 'admin')
    return res.status(403).json({ message: 'Accès admin requis' })
  next()
}

// ---------------------------------------------------------------------------
// Énumérations (mêmes contraintes que le schéma d'origine)
// ---------------------------------------------------------------------------
const TABLES = new Set([
  'profiles', 'guilds', 'guild_members', 'guild_messages', 'quests',
  'quest_assignments', 'submissions', 'xp_events', 'offres', 'entretiens',
  'realisations',
])
const TEXT_JSON_COLS = new Set([
  'skills', 'steps', 'resources', 'deliverable_urls', 'tags',
])
// Relations simples (1-N / N-1) utilisées par le front via select('*, x(*)')
const RELATIONS = {
  guild_members: { guilds: ['guild_id', 'id'], profiles: ['user_id', 'id'] },
  quest_assignments: { quests: ['quest_id', 'id'], guilds: ['guild_id', 'id'], profiles: ['user_id', 'id'] },
  submissions: { quest_assignments: ['assignment_id', 'id'] },
  quests: { profiles: ['created_by', 'id'] },
  guilds: { profiles: ['created_by', 'id'] },
  guild_messages: { profiles: ['user_id', 'id'] },
  offres: { profiles: ['created_by', 'id'] },
  entretiens: { offres: ['offre_id', 'id'] },
  realisations: { offres: ['offre_id', 'id'] },
}
const REL_ALIAS = {
  quests: 'quests', profiles: 'profiles', guilds: 'guilds',
  offres: 'offres', quest_assignments: 'quest_assignments',
}

const app = express()
app.use(express.json({ limit: '10mb' }))

// ---------------------------------------------------------------------------
// Santé
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, base: 'sqlite-local', temps: new Date().toISOString() })
})

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post('/api/auth/register', (req, res) => {
  const { email, password, username, display_name, role } = req.body || {}
  if (!email || !password) return res.status(400).json({ message: 'email et mot de passe requis' })
  if (String(password).length < 8) return res.status(400).json({ message: 'mot de passe trop court (8 caractères minimum)' })
  const id = uuid()
  const uname = (username || email.split('@')[0]).replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'hero'
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (exists) return res.status(409).json({ message: 'cet email est déjà utilisé' })
  let finalUname = uname
  let n = 0
  while (db.prepare('SELECT id FROM profiles WHERE username = ?').get(finalUname)) {
    n += 1
    finalUname = uname.slice(0, 14) + '_' + n
  }
  const urole = ['student', 'company', 'admin'].includes(role) ? role : 'student'
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
    .run(id, email, hash(password))
  db.prepare('INSERT INTO profiles (id, username, display_name, role) VALUES (?, ?, ?, ?)')
    .run(id, finalUname, display_name || finalUname, urole)
  const token = issueToken(id)
  res.status(201).json({
    access_token: token,
    user: { id, email },
    profile: rowOut(db.prepare('SELECT * FROM profiles WHERE id = ?').get(id)),
  })
})

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ message: 'email et mot de passe requis' })
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!u || u.password_hash !== hash(password))
    return res.status(401).json({ message: 'adresse ou mot de passe incorrect' })
  const token = issueToken(u.id)
  res.json({
    access_token: token,
    user: { id: u.id, email: u.email },
    profile: rowOut(db.prepare('SELECT * FROM profiles WHERE id = ?').get(u.id)),
  })
})

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = bearerToken(req)
  if (token) TOKENS.delete(token)
  res.json({ ok: true })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.auth.user.id, email: req.auth.user.email }, profile: req.auth.profile })
})

// ---------------------------------------------------------------------------
// Table générique (le « from('table').select().eq().order() » du front)
// ---------------------------------------------------------------------------
function parseSelect(selectStr) {
  if (!selectStr || selectStr === '*') return { cols: '*', rels: [] }
  const parts = selectStr.split(',').map((s) => s.trim())
  const rels = []
  const cols = []
  for (const p of parts) {
    const m = p.match(/^([a-z_]+)(?:![a-z_]+)?\(([^)]*)\)$/)
    if (m) rels.push({ table: m[1], cols: m[2].split(',').map((c) => c.trim()).filter(Boolean) })
    else if (p.endsWith('(*)')) rels.push({ table: p.slice(0, -3), cols: null })
    else cols.push(p)
  }
  return { cols: cols.length ? cols.join(', ') : '*', rels }
}

function applyRelation(row, table, rel) {
  const spec = RELATIONS[table]
  if (!spec) return
  const relTable = rel.table || rel
  const entry = Object.entries(spec).find(([k]) => {
    const base = k.endsWith('s') ? k.slice(0, -1) : k
    return k === relTable || base === relTable || k === relTable + 's'
  })
  if (!entry) return
  const [fkCol, pkCol] = entry[1]
  const childTable = entry[0]
  if (!TABLES.has(childTable)) return
  const rows = db.prepare(`SELECT * FROM ${childTable} WHERE ${pkCol} = ?`).all(row[fkCol])
  const out = rows.map(rowOut)
  if (rel.cols) {
    for (const r of out) {
      for (const k of Object.keys(r)) {
        if (!rel.cols.includes(k)) delete r[k]
      }
    }
  }
  row[childTable] = out.length ? (rel.cols ? out[0] : out) : (rel.cols ? null : [])
}

function handleFrom(table) {
  const state = { filters: [], order: null, limit: null, select: '*', rels: [] }
  const chain = {
    select(str) {
      const p = parseSelect(str)
      state.select = p.cols
      state.rels = p.rels
      return chain
    },
    eq(col, val) { state.filters.push({ op: 'eq', col, val }); return chain },
    neq(col, val) { state.filters.push({ op: 'neq', col, val }); return chain },
    or(str) {
      // « user_id.eq.X,guild_id.eq.Y » simple (ou) — gère les paires col.op.val
      const clauses = String(str).split(',').map((c) => c.trim()).filter(Boolean)
      const orWhere = []
      for (const c of clauses) {
        const m = c.match(/^([a-z_]+)\.(eq|neq|like)\.(.+)$/)
        if (m) {
          const op = { eq: '=', neq: '<>', like: 'LIKE' }[m[2]]
          orWhere.push(`${m[1]} ${op} ?`)
          state.filters.push({ op: '_or', raw: `${m[1]} ${op} ?`, val: m[3] })
        }
      }
      return chain
    },
    order(col, opts) { state.order = { col, asc: !opts || opts.ascending !== false }; return chain },
    limit(n) { state.limit = n; return chain },
  }
  chain.single = async () => {
    const rows = await chainResult(table, state)
    return { data: rows[0] ?? null, error: null }
  }
  chain.maybeSingle = chain.single
  return chain
}

async function chainResult(table, state) {
  let where = []
  let params = []
  const orClauses = []
  for (const f of state.filters) {
    if (f.op === '_or') { orClauses.push(f.raw); params.push(f.val) }
    else { where.push(`${f.col} = ?`); params.push(f.val) }
  }
  if (orClauses.length) {
    where.push('(' + orClauses.join(' OR ') + ')')
  }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : ''
  const orderSql = state.order ? ` ORDER BY ${state.order.col} ${state.order.asc ? 'ASC' : 'DESC'}` : ''
  const limitSql = state.limit ? ` LIMIT ${Number(state.limit)}` : ''
  const sql = `SELECT ${state.select} FROM ${table}${whereSql}${orderSql}${limitSql}`
  let rows
  try {
    rows = db.prepare(sql).all(...params)
  } catch (e) {
    throw new Error('Requête invalide: ' + e.message)
  }
  rows = rows.map(rowOut)
  for (const r of rows) {
    for (const rel of state.rels) applyRelation(r, table, rel)
  }
  return rows
}
// ---------------------------------------------------------------------------
// Routes génériques par table
// ---------------------------------------------------------------------------
app.get('/api/from/:table', requireAuth, async (req, res) => {
  const table = req.params.table
  if (!TABLES.has(table)) return res.status(400).json({ message: 'table inconnue' })
  try {
    const sel = req.query.select || '*'
    const parsed = parseSelect(String(sel))
    const filters = []
    for (const [k, v] of Object.entries(req.query)) {
      if (['order', 'limit', 'select', 'or', 'asc'].includes(k)) continue
      filters.push({ op: 'eq', col: k, val: v })
    }
    const orStr = req.query.or ? String(req.query.or) : ''
    const state = {
      filters,
      order: req.query.order
        ? { col: String(req.query.order), asc: req.query.asc !== 'false' }
        : null,
      limit: req.query.limit ? Number(req.query.limit) : null,
      select: parsed.cols,
      rels: parsed.rels,
    }
    let rows = await chainResult(table, state)
    // Filtre OR côté serveur : « user_id.eq.X,guild_id.eq.Y »
    if (orStr) {
      rows = rows.filter((r) =>
        orStr.split(',').some((clause) => {
          const m = clause.trim().match(/^([a-z_]+)\.(eq|neq|like)\.(.+)$/)
          if (!m) return false
          const [, col, op, rawVal] = m
          const v = r[col]
          if (op === 'eq') return String(v ?? '') === rawVal
          if (op === 'neq') return String(v ?? '') !== rawVal
          if (op === 'like') return String(v ?? '').includes(rawVal)
          return false
        }),
      )
    }
    res.json(rows)
  } catch (e) {
    res.status(400).json({ message: e.message })
  }
})

// POST avec support { select } → retourne l'enregistrement créé
app.post('/api/from/:table', requireAuth, async (req, res) => {
  const table = req.params.table
  if (!TABLES.has(table)) return res.status(400).json({ message: 'table inconnue' })
  const body = req.body || {}
  const vals = { ...body }
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  const idCol = cols.find((c) => c === 'id')
  if (idCol && !vals.id) vals.id = uuid()
  // created_by par défaut = l'utilisateur courant quand la colonne existe
  if (cols.includes('created_by') && !vals.created_by) vals.created_by = req.auth.user.id
  for (const c of TEXT_JSON_COLS) {
    if (vals[c] && typeof vals[c] !== 'string') vals[c] = JSON.stringify(vals[c])
  }
  const insertCols = Object.keys(vals).filter((c) => cols.includes(c))
  const placeholders = insertCols.map(() => '?').join(', ')
  try {
    db.prepare(`INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders})`)
      .run(...insertCols.map((c) => vals[c]))
  } catch (e) {
    return res.status(400).json({ message: e.message })
  }
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(vals.id)
  res.status(201).json(rowOut(row))
})

app.patch('/api/from/:table/:id', requireAuth, async (req, res) => {
  const table = req.params.table
  if (!TABLES.has(table)) return res.status(400).json({ message: 'table inconnue' })
  const body = req.body || {}
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  const patchCols = Object.keys(body).filter((c) => cols.includes(c))
  if (!patchCols.length) return res.status(400).json({ message: 'aucun champ valide' })
  const vals = { ...body }
  for (const c of TEXT_JSON_COLS) {
    if (vals[c] && typeof vals[c] !== 'string') vals[c] = JSON.stringify(vals[c])
  }
  const setSql = patchCols.map((c) => `${c} = ?`).join(', ')
  try {
    db.prepare(`UPDATE ${table} SET ${setSql} WHERE id = ?`)
      .run(...patchCols.map((c) => vals[c]), req.params.id)
  } catch (e) {
    return res.status(400).json({ message: e.message })
  }
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id)
  res.json(rowOut(row))
})

app.delete('/api/from/:table/:id', requireAuth, (req, res) => {
  const table = req.params.table
  if (!TABLES.has(table)) return res.status(400).json({ message: 'table inconnue' })
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id)
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// RPC : les fonctions « security definer » d'origine, en SQLite
// ---------------------------------------------------------------------------
app.post('/api/rpc/join_guild', requireAuth, (req, res) => {
  const uid = req.auth.user.id
  const p_guild_id = req.body?.p_guild_id
  if (!p_guild_id) return res.status(400).json({ message: 'guilde requise' })
  const already = db.prepare('SELECT 1 FROM guild_members WHERE user_id = ?').get(uid)
  if (already) return res.status(400).json({ message: 'vous appartenez déjà à une guilde' })
  const g = db.prepare('SELECT max_members FROM guilds WHERE id = ?').get(p_guild_id)
  if (!g) return res.status(400).json({ message: 'guilde introuvable' })
  const count = db.prepare('SELECT COUNT(*) c FROM guild_members WHERE guild_id = ?').get(p_guild_id).c
  if (count >= g.max_members) return res.status(400).json({ message: 'guilde complète' })
  db.prepare('INSERT INTO guild_members (guild_id, user_id, role) VALUES (?, ?, ?)')
    .run(p_guild_id, uid, 'member')
  res.json({ ok: true })
})

app.post('/api/rpc/leave_guild', requireAuth, (req, res) => {
  const uid = req.auth.user.id
  const row = db.prepare('SELECT guild_id, role FROM guild_members WHERE user_id = ?').get(uid)
  if (!row) return res.status(400).json({ message: 'vous n’appartenez à aucune guilde' })
  const tx = db.exec('BEGIN')
  db.prepare('DELETE FROM guild_members WHERE user_id = ?').run(uid)
  if (row.role === 'leader') {
    const next = db.prepare('SELECT user_id FROM guild_members WHERE guild_id = ? ORDER BY joined_at ASC LIMIT 1').get(row.guild_id)
    if (!next) {
      db.prepare('DELETE FROM guilds WHERE id = ?').run(row.guild_id)
    } else {
      db.prepare("UPDATE guild_members SET role = 'leader' WHERE guild_id = ? AND user_id = ?")
        .run(row.guild_id, next.user_id)
    }
  }
  db.exec('COMMIT')
  res.json({ ok: true })
})

app.post('/api/rpc/create_guild', requireAuth, (req, res) => {
  const uid = req.auth.user.id
  const { p_name, p_emblem, p_motto, p_description, p_max_members } = req.body || {}
  if (!p_name) return res.status(400).json({ message: 'nom requis' })
  const already = db.prepare('SELECT 1 FROM guild_members WHERE user_id = ?').get(uid)
  if (already) return res.status(400).json({ message: 'vous appartenez déjà à une guilde' })
  const gid = uuid()
  db.prepare('INSERT INTO guilds (id, name, emblem, motto, description, max_members, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(gid, p_name, p_emblem || '', p_motto || '', p_description || '', p_max_members || 6, uid)
  db.prepare("INSERT INTO guild_members (guild_id, user_id, role) VALUES (?, ?, 'leader')").run(gid, uid)
  res.status(201).json({ id: gid })
})

app.post('/api/rpc/review_submission', requireAuth, (req, res) => {
  const { p_submission_id, p_approve, p_feedback } = req.body || {}
  if (!p_submission_id) return res.status(400).json({ message: 'soumission requise' })
  const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(p_submission_id)
  if (!sub) return res.status(400).json({ message: 'soumission introuvable' })
  if (sub.status !== 'pending') return res.status(400).json({ message: 'soumission déjà évaluée' })
  const assign = db.prepare('SELECT * FROM quest_assignments WHERE id = ?').get(sub.assignment_id)
  const quest = assign ? db.prepare('SELECT * FROM quests WHERE id = ?').get(assign.quest_id) : null
  const isAdmin = req.auth.profile.role === 'admin'
  if (quest && quest.created_by !== req.auth.user.id && !isAdmin)
    return res.status(403).json({ message: 'seul le créateur de la quête ou un admin peut évaluer' })
  db.prepare("UPDATE submissions SET status = ?, feedback = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?")
    .run(p_approve ? 'approved' : 'rejected', p_feedback || '', req.auth.user.id, p_submission_id)
  if (p_approve && assign && quest) {
    db.prepare("UPDATE quest_assignments SET status = 'completed', completed_at = datetime('now') WHERE id = ?")
      .run(assign.id)
    if (assign.guild_id) {
      const members = db.prepare('SELECT user_id FROM guild_members WHERE guild_id = ?').all(assign.guild_id)
      for (const m of members) {
        db.prepare('INSERT INTO xp_events (user_id, guild_id, quest_id, amount, reason) VALUES (?, ?, ?, ?, ?)')
          .run(m.user_id, assign.guild_id, quest.id, quest.xp_reward, 'Quête complétée : ' + quest.title)
        db.prepare('UPDATE profiles SET xp = xp + ? WHERE id = ?').run(quest.xp_reward, m.user_id)
      }
      db.prepare('UPDATE guilds SET xp = xp + ? WHERE id = ?').run(quest.xp_reward, assign.guild_id)
    } else {
      db.prepare('INSERT INTO xp_events (user_id, quest_id, amount, reason) VALUES (?, ?, ?, ?)')
        .run(assign.user_id, quest.id, quest.xp_reward, 'Quête complétée : ' + quest.title)
      db.prepare('UPDATE profiles SET xp = xp + ? WHERE id = ?').run(quest.xp_reward, assign.user_id)
    }
  } else if (!p_approve && assign) {
    db.prepare("UPDATE quest_assignments SET status = 'in_progress' WHERE id = ?").run(assign.id)
  }
  res.json({ ok: true })
})

app.post('/api/rpc/leaderboard_users', (req, res) => {
  const period = req.body?.p_period || 'all'
  const limit = req.body?.p_limit || 20
  const days = period === 'week' ? 7 : period === 'month' ? 30 : null
  const cutoff = days ? `datetime('now', '-${days} days')` : "'-infinity'"
  const rows = db.prepare(`
    SELECT p.id user_id, p.username, p.display_name, p.avatar_url,
           COALESCE(SUM(e.amount), 0) total_xp,
           COUNT(DISTINCT e.quest_id) quests_completed
    FROM profiles p JOIN xp_events e ON e.user_id = p.id
    WHERE e.created_at >= ${cutoff} AND p.is_banned = 0
    GROUP BY p.id ORDER BY total_xp DESC LIMIT ?`).all(limit)
  res.json(rows.map(rowOut))
})

app.post('/api/rpc/leaderboard_guilds', (req, res) => {
  const period = req.body?.p_period || 'all'
  const limit = req.body?.p_limit || 20
  const days = period === 'week' ? 7 : period === 'month' ? 30 : null
  const cutoff = days ? `datetime('now', '-${days} days')` : "'-infinity'"
  const rows = db.prepare(`
    SELECT g.id guild_id, g.name, g.emblem,
           (SELECT COUNT(*) FROM guild_members m WHERE m.guild_id = g.id) member_count,
           COALESCE(SUM(e.amount), 0) total_xp,
           COUNT(DISTINCT e.quest_id) quests_completed
    FROM guilds g JOIN xp_events e ON e.guild_id = g.id
    WHERE e.created_at >= ${cutoff}
    GROUP BY g.id ORDER BY total_xp DESC LIMIT ?`).all(limit)
  res.json(rows.map(rowOut))
})

app.get('/api/rpc/admin_stats', requireAuth, requireAdmin, (req, res) => {
  const q = (sql) => db.prepare(sql).get()
  res.json({
    total_users: q('SELECT COUNT(*) c FROM profiles').c,
    active_users_30d: q("SELECT COUNT(DISTINCT user_id) c FROM xp_events WHERE created_at >= datetime('now', '-30 days')").c,
    total_guilds: q('SELECT COUNT(*) c FROM guilds').c,
    total_quests: q('SELECT COUNT(*) c FROM quests').c,
    published_quests: q("SELECT COUNT(*) c FROM quests WHERE status = 'published'").c,
    quests_completed: q("SELECT COUNT(*) c FROM quest_assignments WHERE status = 'completed'").c,
    pending_submissions: q("SELECT COUNT(*) c FROM submissions WHERE status = 'pending'").c,
    total_xp_distributed: q('SELECT COALESCE(SUM(amount), 0) c FROM xp_events').c,
  })
})

// RPC « is_admin » / « my_role » utilisés par le front éventuellement
app.post('/api/rpc/is_admin', requireAuth, (req, res) => res.json(req.auth.profile.role === 'admin'))
app.post('/api/rpc/my_role', requireAuth, (req, res) => res.json(req.auth.profile.role))

// ---------------------------------------------------------------------------
// Storage (avatars, deliverables) — fichiers locaux
// ---------------------------------------------------------------------------
app.post('/api/storage/upload', requireAuth, (req, res) => {
  const { bucket, path: filePath, data, contentType } = req.body || {}
  if (!bucket || !filePath || data == null)
    return res.status(400).json({ message: 'bucket, chemin et données requis' })
  const safe = path.join(STORAGE_DIR, bucket, filePath.replace(/\.\./g, ''))
  if (!safe.startsWith(STORAGE_DIR)) return res.status(400).json({ message: 'chemin invalide' })
  fs.mkdirSync(path.dirname(safe), { recursive: true })
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64')
  fs.writeFileSync(safe, buf)
  res.json({ path: `${bucket}/${filePath}` })
})

app.get('/api/storage/:bucket/*splat', (req, res) => {
  const filePath = path.join(STORAGE_DIR, req.params.bucket, req.params.splat)
  if (!filePath.startsWith(STORAGE_DIR) || !fs.existsSync(filePath))
    return res.status(404).json({ message: 'introuvable' })
  res.sendFile(filePath)
})

// ---------------------------------------------------------------------------
// « Functions » : génération IA (provider local = pas de clé ; renvoie une
// trame structurée déterministe, modifiable ensuite à la main).
// ---------------------------------------------------------------------------
app.post('/api/functions/generate-quest', requireAuth, (req, res) => {
  const job = req.body?.job_posting || req.body?.jobPosting || ''
  const skills = (req.body?.skills || []).map(String)
  const titre = (job ? job.trim().slice(0, 60) : 'Maîtrise — ' + (skills[0] || 'compétence')) || 'Nouvelle quête'
  const q = {
    title: titre,
    story: `Une offre est tombée : ${job || 'un poste'}. Pour y répondre, il faut maîtriser ce qui est demandé.`,
    description: 'Quête générée localement (sans clé API). Adapte les étapes à la compétence visée.',
    steps: skills.slice(0, 4).map((s) => ({
      title: 'Maîtriser — ' + s,
      description: 'Trouve une ressource sur ' + s + ', lis-la, résume-la en 5 lignes.',
    })),
    skills,
    resources: [],
    difficulty: 'intermediate',
    estimated_hours: 8,
    xp_reward: 150,
    provider: 'local-sqlite',
  }
  res.json(q)
})

// ---------------------------------------------------------------------------
// Realtime : polling simple pour le chat de guilde (le front abonne un canal)
// ---------------------------------------------------------------------------
let msgSeq = 0
app.get('/api/realtime/guild_messages', (req, res) => {
  const guildId = req.query.guild_id
  if (!guildId) return res.status(400).json({ message: 'guild_id requis' })
  const rows = db.prepare('SELECT * FROM guild_messages WHERE guild_id = ? ORDER BY id ASC').all(guildId)
  const since = Number(req.query.since || 0)
  const fresh = rows.filter((r) => r.id > since)
  const last = rows.length ? rows[rows.length - 1].id : 0
  res.json({ messages: fresh.map(rowOut), last_seq: Math.max(msgSeq, last) })
})

// ---------------------------------------------------------------------------
// Statique : le build React
// ---------------------------------------------------------------------------
app.use(express.static(DIST))
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'introuvable' })
  return res.sendFile(path.join(DIST, 'index.html'))
})

app.listen(PORT, HOST, () => {
  console.log(`QuestForge local → http://localhost:${PORT}`)
  console.log(`Base SQLite : ${DB_PATH}`)
})
