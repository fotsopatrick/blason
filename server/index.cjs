#!/usr/bin/env node
/**
 * Blason — serveur local (Express + SQLite natif Node).
 * Remplaçant de Supabase : zéro clé, zéro compte, zéro paiement.
 *
 * Sert :
 *  - le build React (dist/) en statique,
 *  - une API JSON : auth simple par token, CRUD par table,
 *    RPC (join_guild, review_submission, leaderboards, admin_stats),
 *    storage (avatars, deliverables), realtime polling (guild_messages).
 *
 * Base : server/blason.db (créée au premier démarrage).
 */
const express = require('express')
const { DatabaseSync } = require('node:sqlite')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

// LE FICHIER DE CONFIGURATION — corrige le 13/08/2026.
//
// Il n'etait charge NULLE PART. En production ca ne se voyait pas :
// systemd fournit les variables par EnvironmentFile. Mais quiconque
// clonait le depot creait son fichier comme le disait le README... et
// il etait ignore en silence. Le jeton de signature restait vide, et
// une cle HMAC vide veut dire que n'importe qui peut se fabriquer une
// session valide.
//
// process.loadEnvFile existe dans Node 22+, que le projet exige deja :
// aucune dependance a ajouter.
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'))
} catch {
  // Absent : normal en production, ou les variables viennent de
  // systemd. On ne dit rien ici ; le controle du jeton, plus bas,
  // refusera de demarrer si l'essentiel manque vraiment.
}

const PORT = process.env.PORT || 8088
const HOST = process.env.HOST || '0.0.0.0'
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const DATA_DIR = path.join(__dirname)
const DB_PATH = path.join(DATA_DIR, 'blason.db')
const STORAGE_DIR = path.join(DATA_DIR, 'storage')
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000 // 30 jours

fs.mkdirSync(STORAGE_DIR, { recursive: true })

// Charger le .env du projet (sans dépendance) : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET…
const ENV_PATH = path.join(ROOT, '.env')
if (fs.existsSync(ENV_PATH)) {
  for (const raw of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const line = raw.replace(/\r$/, '')
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
}

const db = new DatabaseSync(DB_PATH)
db.exec(fs.readFileSync(path.join(DATA_DIR, 'schema.sql'), 'utf8'))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const uuid = () => crypto.randomUUID()
const hash = (pwd) =>
  // Le sel garde son ancien nom EXPRES (renommage Blason, 13/08/2026) :
  // le changer recalculerait toutes les empreintes et rendrait chaque
  // compte existant inaccessible, avec pour seul message « mot de passe
  // incorrect ». Un renommage cosmetique ne casse pas un etat stocke.
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

// Sessions par JWT signe (HMAC-SHA256) : contrairement a l'ancien Map en
// memoire, les sessions survivent aux redemarrages du serveur (point de la
// tache 1435, meme modele que Duelle). Le secret vit dans le .env.
const JWT_SECRET = process.env.JWT_SECRET || ''
if (!JWT_SECRET) {
  // ON REFUSE DE DEMARRER (13/08/2026).
  //
  // Avant, on affichait une erreur et on continuait. Le serveur tournait
  // donc avec une cle de signature VIDE : n'importe qui pouvait forger un
  // jeton de session et se faire passer pour un autre. Un avertissement
  // dans la console ne protege personne : il defile et on l'oublie.
  //
  // Une regle ecrite n'est pas suivie ; une regle codee l'est.
  console.error('')
  console.error('  DEMARRAGE REFUSE : le jeton de signature est vide.')
  console.error('')
  console.error('  Il signe les sessions. Sans lui, les jetons ne seraient')
  console.error("  pas signes, et n'importe qui pourrait s'en fabriquer un.")
  console.error('')
  console.error("  1. copie le fichier d'exemple a la racine")
  console.error('  2. genere la valeur :  openssl rand -base64 48')
  console.error('  3. colle-la sur la ligne JWT_SECRET=')
  console.error('')
  process.exit(1)
}
function signJWT(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url')
  return header + '.' + body + '.' + sig
}
function verifyJWT(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) return null
    const [h, b, s] = parts
    const expect = crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + b).digest('base64url')
    if (s.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expect))) return null
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'))
    if (payload.exp && payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function issueToken(userId) {
  return signJWT({ uid: userId, exp: Date.now() + TOKEN_TTL_MS })
}

function bearerToken(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

function auth(req) {
  const token = bearerToken(req)
  const payload = token ? verifyJWT(token) : null
  if (!payload || !payload.uid) return null
  const profile = db
    .prepare('SELECT * FROM profiles WHERE id = ?')
    .get(payload.uid)
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

// CONTROLE DE CHARGE (13/08/2026) — installe AVANT toute route.
//
// `node:sqlite` est synchrone : chaque requete SQL bloque la boucle
// d'evenements. Sans plafond, la couche 2D (qui interroge le serveur en
// boucle) peut mettre le service a genoux depuis un seul onglet oublie.
// Details et reglages : server/charge.cjs.
require('./charge.cjs').installer(app)

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
  res.json({ ok: true })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.auth.user.id, email: req.auth.user.email }, profile: req.auth.profile })
})

// ---------------------------------------------------------------------------
// Google OAuth 2.0 (connexion avec un compte Gmail)
// ---------------------------------------------------------------------------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8088/api/auth/google/callback'

// 1) Redirige vers l'écran de consentement Google.
app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID)
    return res.status(500).json({ message: 'GOOGLE_CLIENT_ID manquant (voir .env)' })
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    access_type: 'online',
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
})

// 2) Callback : échange le code contre un jeton Google, retrouve/crée l'utilisateur,
//    émet le jeton Blason et ramène le navigateur sur /auth/callback.
app.get('/api/auth/google/callback', async (req, res) => {
  const code = req.query.code
  const oauthError = req.query.error
  if (oauthError)
    return res.redirect('/login?google_error=' + encodeURIComponent(String(oauthError)))
  if (!code) return res.status(400).json({ message: 'code d’autorisation manquant' })
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET)
    return res.status(500).json({ message: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants (voir .env)' })
  try {
    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })
    const tokJson = await tokRes.json()
    if (!tokRes.ok)
      throw new Error('échange du code refusé : ' + (tokJson.error_description || tokJson.error || tokRes.status))
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokJson.access_token}` },
    })
    const g = await infoRes.json()
    if (!infoRes.ok || !g.email)
      throw new Error('profil Google illisible : ' + (g.error?.message || infoRes.status))

    const email = String(g.email).toLowerCase()
    let id = db.prepare('SELECT id FROM users WHERE email = ?').get(email)?.id
    let createdProfile = false
    if (!id) {
      id = uuid()
      db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
        .run(id, email, '') // compte Google : pas de mot de passe local
    }
    if (!db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(id)) {
      const base = (email.split('@')[0] || 'hero').replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'hero'
      let finalUname = base
      let n = 0
      while (db.prepare('SELECT id FROM profiles WHERE username = ?').get(finalUname)) {
        n += 1
        finalUname = base.slice(0, 14) + '_' + n
      }
      db.prepare('INSERT INTO profiles (id, username, display_name, avatar_url) VALUES (?, ?, ?, ?)')
        .run(id, finalUname, g.name || finalUname, g.picture || null)
      createdProfile = true
    }
    const questToken = issueToken(id)
    res.redirect(`/auth/callback?access_token=${questToken}&new=${createdProfile ? 1 : 0}`)
  } catch (e) {
    console.error('Google OAuth :', e.message)
    res.redirect('/login?google_error=' + encodeURIComponent(e.message))
  }
})

// ---------------------------------------------------------------------------
// Table générique (le « from('table').select().eq().order() » du front)
// ---------------------------------------------------------------------------
function splitSelectParts(s) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function parseSelect(selectStr) {
  if (!selectStr || selectStr === '*') return { cols: '*', rels: [] }
  const parts = splitSelectParts(selectStr)
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
  // cols === ['*'] (ou null) signifie « toutes les colonnes » : on ne supprime rien.
  const allCols = !rel.cols || (rel.cols.length === 1 && rel.cols[0] === '*')
  if (rel.cols && !allCols) {
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
    const relFilters = []
    for (const [k, v] of Object.entries(req.query)) {
      if (['order', 'limit', 'select', 'or', 'asc'].includes(k)) continue
      if (k.includes('.')) {
        const dot = k.indexOf('.')
        relFilters.push({ rel: k.slice(0, dot), col: k.slice(dot + 1), val: v })
      } else {
        filters.push({ op: 'eq', col: k, val: v })
      }
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
    // Relations nécessaires : celles du select + celles des filtres relationnels.
    const relsToApply = [...parsed.rels]
    for (const rf of relFilters) {
      if (!relsToApply.some((r) => (r.table || r) === rf.rel)) relsToApply.push(rf.rel)
    }
    for (const rel of relsToApply) {
      for (const r of rows) applyRelation(r, table, rel)
    }
    // Filtres sur colonnes de relation (ex. quest_assignments.quest_id) : en mémoire.
    for (const rf of relFilters) {
      rows = rows.filter((r) => {
        const child = Array.isArray(r[rf.rel]) ? r[rf.rel][0] : r[rf.rel]
        return !!child && String(child[rf.col]) === String(rf.val)
      })
    }
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
// « Functions » : génération IA (provider local = pas de clé ; extrait les
// compétences du texte de l'offre et bâtit une quête structurée).
// ---------------------------------------------------------------------------
// TROISIEME COLONNE : LE POIDS (ajoute le 13/08/2026).
//
// Mesure sur l'offre « Principal AI Engineering Architect » (Robots & Pencils,
// US Remote) : le mot « cloud » y apparait 11 fois, « agentic » 9 fois,
// « multi-agent » 5, « bedrock » 4, « agentcore » 4. Au simple comptage,
// « Cloud » gagnait — et le parcours genere portait sur « Cloud », un mot qui
// ne dit rien, au lieu des systemes multi-agents qui sont TOUT le poste.
//
// Un mot generique repete ne vaut pas un mot precis. Poids :
//   3 = technologie nommee, rare, discriminante (agentcore, langgraph, bedrock)
//   2 = technologie identifiable (kubernetes, terraform, snowflake) — defaut
//   1 = mot-valise (cloud, api, architecture, security) : present partout,
//       ne caracterise aucun poste a lui seul.
const SKILL_HINTS = [
  // --- IA agentique et LLM (ajoute le 13/08/2026) -------------------------
  // Ces mots manquaient TOUS. Sur une offre d'architecte IA, le generateur
  // etait donc aveugle a l'essentiel de l'annonce.
  ['agentic', 'Agents IA', 3], ['multi-agent', 'Agents IA', 3],
  ['multi agent', 'Agents IA', 3], ['agent orchestration', 'Agents IA', 3],
  ['langgraph', 'Agents IA', 3], ['langchain', 'Agents IA', 3],
  ['crewai', 'Agents IA', 3], ['autogen', 'Agents IA', 3],
  ['llamaindex', 'Agents IA', 3], ['tool use', 'Agents IA', 3],
  ['agentcore', 'AWS', 3], ['bedrock', 'AWS', 3], ['sagemaker', 'AWS', 3],
  ['lambda', 'AWS', 2], ['eventbridge', 'AWS', 2], ['cloudformation', 'Terraform', 2],
  ['vertex ai', 'MLOps', 3], ['mlops', 'MLOps', 3], ['llmops', 'MLOps', 3],
  ['mlflow', 'MLOps', 3], ['kubeflow', 'MLOps', 3], ['hugging face', 'MLOps', 3],
  ['pytorch', 'MLOps', 2], ['tensorflow', 'MLOps', 2], ['model serving', 'MLOps', 3],
  ['feature store', 'MLOps', 3], ['fine-tuning', 'MLOps', 2], ['fine tuning', 'MLOps', 2],
  ['rag', 'RAG', 3], ['retrieval-augmented', 'RAG', 3], ['retrieval augmented', 'RAG', 3],
  ['vector database', 'RAG', 3], ['vector store', 'RAG', 3], ['vector', 'RAG', 2],
  ['embedding', 'RAG', 3], ['pinecone', 'RAG', 3], ['weaviate', 'RAG', 3],
  ['pgvector', 'RAG', 3], ['chunking', 'RAG', 3], ['reranking', 'RAG', 3],
  ['prompt engineering', 'Agents IA', 2], ['prompt injection', 'Securite', 3],
  ['responsible ai', 'Securite', 3], ['ai safety', 'Securite', 3],
  ['guardrail', 'Securite', 3], ['pii', 'Securite', 2],
  ['token economics', 'Cout', 3], ['cost optimization', 'Cout', 3],
  ['model routing', 'Cout', 3], ['quantization', 'Cout', 3],
  ['caching', 'Cout', 2], ['inference', 'MLOps', 2],
  ['observability', 'MLOps', 2], ['evaluation framework', 'MLOps', 3],
  ['system design', 'Architecture', 2], ['event-driven', 'Architecture', 2],
  ['microservices', 'Architecture', 2], ['serverless', 'Architecture', 2],
  ['dbt', 'Donnees', 3], ['prefect', 'Donnees', 3], ['redshift', 'Donnees', 3],
  ['bigquery', 'Donnees', 3], ['data lake', 'Donnees', 2], ['streaming', 'Donnees', 2],
  ['soc2', 'Securite', 3], ['soc 2', 'Securite', 3], ['hipaa', 'Securite', 3],
  ['h-1b', 'Marche US', 3], ['green card', 'Marche US', 3], ['sponsorship', 'Marche US', 3],
  ['work authorization', 'Marche US', 3],
  // --- socle historique ---------------------------------------------------
  ['azure', 'Azure'], ['aws', 'AWS'], ['gcp', 'Google Cloud'], ['kubernetes', 'Kubernetes'],
  ['docker', 'Docker'], ['terraform', 'Terraform'], ['ansible', 'Ansible'], ['jenkins', 'Jenkins'],
  ['kubernetes', 'Kubernetes'], ['python', 'Python'], ['typescript', 'TypeScript'],
  ['javascript', 'JavaScript'], ['react', 'React'], ['node', 'Node.js'], ['odoo', 'Odoo'],
  ['c#', 'C# / .NET'], ['.net', 'C# / .NET'], ['java', 'Java'], ['sql', 'SQL'],
  ['postgres', 'PostgreSQL'], ['mysql', 'MySQL'], ['mongo', 'MongoDB'], ['linux', 'Linux'],
  ['devops', 'DevOps'], ['ci/cd', 'CI/CD'], ['git', 'Git', 1], ['api', 'API', 1],
  ['machine learning', 'Machine learning'], ['llm', 'LLM'], ['agents', 'Agents IA'],
  ['artificial intelligence', 'IA'], ['intelligence artificielle', 'IA'],
  ['agile', 'Agile'], ['scrum', 'Scrum'], ['powershell', 'PowerShell'],
  ['bash', 'Bash'], ['cloud', 'Cloud', 1], ['security', 'Securite', 1], ['graphql', 'GraphQL'],
  ['flask', 'Flask'], ['django', 'Django'], ['vue', 'Vue.js'], ['flutter', 'Flutter'],
  ['redis', 'Redis'], ['rabbitmq', 'RabbitMQ'], ['prometheus', 'Prometheus'],
  ['grafana', 'Grafana'], ['nginx', 'Nginx'], ['caddy', 'Caddy'],
  // Progiciels de gestion et metiers (ajoutes le 13/08/2026) : une offre
  // d'architecte IFS ne donnait qu'une competence parce qu'aucun de ces
  // mots n'etait connu.
  ['ifs', 'IFS Cloud'], ['sap', 'SAP'], ['salesforce', 'Salesforce'],
  ['dynamics', 'Microsoft Dynamics'], ['netsuite', 'NetSuite'],
  ['workday', 'Workday'], ['servicenow', 'ServiceNow'], ['sage', 'Sage'],
  ['erp', 'ERP'], ['crm', 'CRM'], ['mes', 'MES'], ['plm', 'PLM'],
  ['eam', 'EAM'], ['wms', 'WMS'], ['scm', 'Supply Chain'],
  // Donnees et analyse
  ['power bi', 'Power BI'], ['tableau', 'Tableau'], ['looker', 'Looker'],
  ['snowflake', 'Snowflake'], ['databricks', 'Databricks'],
  ['airflow', 'Airflow'], ['spark', 'Spark'], ['kafka', 'Kafka'],
  ['etl', 'ETL'], ['data warehouse', 'Data warehouse'],
  // Langages et cadres manquants
  ['golang', 'Go'], ['rust', 'Rust'], ['php', 'PHP'], ['ruby', 'Ruby'],
  ['kotlin', 'Kotlin'], ['swift', 'Swift'], ['angular', 'Angular'],
  ['spring', 'Spring'], ['laravel', 'Laravel'], ['symfony', 'Symfony'],
  // Metier, methode et conformite
  ['itil', 'ITIL'], ['togaf', 'TOGAF'], ['prince2', 'PRINCE2'],
  ['iso 27001', 'ISO 27001'], ['rgpd', 'RGPD'], ['gdpr', 'RGPD'],
  ['architecte', 'Architecture', 1], ['architect', 'Architecture', 1],
  ['integration', 'Integration', 1], ['migration', 'Migration', 1],
  ['conseil', 'Conseil', 1], ['consulting', 'Conseil', 1],
  ['finance', 'Finance', 1], ['procurement', 'Achats'],
  ['manufacturing', 'Production'], ['maintenance', 'Maintenance', 1],
]

// FRONTIERES DE MOT (13/08/2026) — correction d'un bug silencieux et grave.
//
// Le comptage se faisait par indexOf(), donc sur des SOUS-CHAINES. Mesure sur
// l'offre « Principal AI Engineering Architect » : le motif « eam » sortait 7
// fois... dont 6 a l'interieur du mot « team ». Le parcours genere contenait
// donc « EAM » (gestion d'actifs industriels), une competence qui n'a
// strictement rien a voir avec le poste.
//
// Meme classe de faux positifs, tous verifies sur des annonces reelles :
//   « sage »  dans mes-sage-, u-sage-        -> Sage (ERP)
//   « git »   dans di-git-al, le-git-imate   -> Git
//   « api »   dans r-api-d, -api-ece         -> API
//   « java »  dans -java-script              -> Java
//   « mes »   dans so-mes-, ti-mes-          -> MES
//
// On exige donc que le motif ne soit colle ni a une lettre ni a un chiffre.
// Deux precautions : les motifs qui commencent ou finissent par autre chose
// qu'une lettre (« .net », « c# », « ci/cd ») n'ont pas de frontiere de ce
// cote-la, sinon « asp.net » ne matcherait jamais ; et le pluriel anglais est
// accepte (« agents » compte pour « agent »).
const RE_CACHE = new Map()
function motifRegex(motif) {
  let re = RE_CACHE.get(motif)
  if (re) return re
  const echappe = motif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // « multi-agent » doit aussi matcher « multi agent ».
  const corps = echappe.replace(/[-\s]/g, '[-\\s]')
  const debutAlnum = /^[a-z0-9]/.test(motif)
  const finAlnum = /[a-z0-9]$/.test(motif)
  re = new RegExp(
    (debutAlnum ? '(?<![a-z0-9])' : '') + corps + (finAlnum ? '(?:s|es)?(?![a-z0-9])' : ''),
    'g',
  )
  RE_CACHE.set(motif, re)
  return re
}

function extraireCompetences(texte) {
  const bas = String(texte || '').toLowerCase()
  // CLASSEMENT PAR FREQUENCE PONDEREE (13/08/2026).
  //
  // Avant, on gardait les six PREMIERS de SKILL_HINTS, pas les six plus
  // pertinents. Mesure sur une offre d'architecte IFS chez Accenture :
  // le mot « IFS » y revient une quinzaine de fois, « azure » une seule —
  // et la quete sortait sur Azure, parce qu'azure est en tete de liste.
  //
  // Le comptage seul ne suffisait pas non plus : un mot-valise repete
  // (« cloud », 11 fois) ecrasait la technologie qui fait le poste
  // (« agentic », 9 fois + « multi-agent », 5). D'ou le poids, troisieme
  // colonne de SKILL_HINTS. Ce que l'annonce repete compte ; ce qu'elle
  // NOMME PRECISEMENT compte davantage.
  const compte = new Map()
  for (const [motif, nom, poids] of SKILL_HINTS) {
    const m = bas.match(motifRegex(motif))
    if (!m || !m.length) continue
    compte.set(nom, (compte.get(nom) || 0) + m.length * (poids === undefined ? 2 : poids))
  }
  return [...compte.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([nom]) => nom)
    .slice(0, 6)
}

app.post('/api/functions/generate-quest', requireAuth, (req, res) => {
  const job = req.body?.job_posting || req.body?.jobPosting || ''
  const skillsDemandees = (req.body?.skills || []).map(String)
  const titreTxt = String(job).replace(/\s+/g, ' ').trim()
  const titre = (titreTxt ? titreTxt.slice(0, 70) : 'Maîtrise — ' + (skillsDemandees[0] || 'compétence')) || 'Nouvelle quête'
  const competences = extraireCompetences(job).concat(
    skillsDemandees.filter((s) => !extraireCompetences(job).includes(s)),
  ).slice(0, 6)
  const cibles = competences.length ? competences : ['les fondamentaux du poste']
  // Autant d'etapes que de competences trouvees (13/08/2026).
  // Le plafond etait fige a 3 alors qu'on en extrait jusqu'a 6 :
  // trois competences s'affichaient sans jamais devenir du travail.
  const etapes = cibles.map((c) => ({
    title: 'Maîtriser — ' + c,
    description: 'Ressource : le manuel officiel ou la documentation de ' + c + '. Lis-la, note les 5 points clés, applique-les dans un mini-exercice.',
  }))
  const q = {
    title: titre,
    story: 'Une offre est tombée : « ' + (titreTxt || 'un poste') + ' ». Pour y répondre, il faut prouver par l’action ce que l’on maîtrise.',
    description: 'Quête générée depuis l’offre, sans clé API : chaque étape prépare une compétence demandée par le poste.',
    steps: etapes,
    skills: cibles,
    resources: [],
    difficulty: 'intermediate',
    estimated_hours: 8,
    xp_reward: 150,
    provider: 'local-sqlite',
  }
  // AVERTISSEMENT (13/08/2026) : une annonce trop courte produit une
  // quete pauvre, et rien ne le disait. Patrick a colle une annonce
  // dont la copie s'etait arretee au pli « Full job description » :
  // 181 caracteres au lieu de 12 000, une seule competence trouvee,
  // une seule etape. Il a cru que le generateur etait faible.
  // Un outil qui rend un resultat pauvre doit dire POURQUOI.
  const nbCar = titreTxt.length
  if (nbCar < 300) {
    q.avertissement =
      `L'annonce ne fait que ${nbCar} caracteres : la quete sera pauvre. ` +
      `Colle le texte COMPLET de l'offre (souvent replie derriere un ` +
      `« voir plus » sur Indeed ou LinkedIn). ` +
      `${competences.length} competence(s) trouvee(s).`
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
// LE MOTEUR D'APPRENTISSAGE (13/08/2026)
//
// Exercices notes, repetition espacee, serie quotidienne, coeurs, blason,
// et le parcours genere depuis une offre reelle. Voir specs/BLASON-ECART-US.md
// pour ce qui manquait et pourquoi.
//
// Installe ICI, apres extraireCompetences() dont il se sert, et avant le
// service des fichiers statiques qui capture tout le reste.
// ---------------------------------------------------------------------------
require('./moteur.cjs').installer(app, db, {
  requireAuth, rowOut, extraireCompetences,
})

// ---------------------------------------------------------------------------
// LE ROYAUME — la couche 2D.
//
// La source React de Blason a disparu (le depot ne contient que dist/).
// Le Royaume est donc une page autonome, sans dependance, servie a cote du
// React existant : aucune regression possible sur ce qui marche deja.
// ---------------------------------------------------------------------------
const ROYAUME = path.join(ROOT, 'royaume')
app.use('/royaume', express.static(ROYAUME))

// ---------------------------------------------------------------------------
// Statique : le build React
// ---------------------------------------------------------------------------
app.use(express.static(DIST))
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'introuvable' })
  return res.sendFile(path.join(DIST, 'index.html'))
})

app.listen(PORT, HOST, () => {
  console.log(`Blason local → http://localhost:${PORT}`)
  console.log(`Base SQLite : ${DB_PATH}`)
})
