/**
 * Client API local — remplace supabase-js.
 * Parle au serveur Express + SQLite (server/index.cjs).
 * Zéro clé, zéro compte tiers : le token vit en localStorage.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api'

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------
// Cle inchangee EXPRES (renommage Blason, 13/08/2026) : la renommer
// deconnecterait d'un coup tous les utilisateurs deja connectes.
const TOKEN_KEY = 'questforge-token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* stockage indisponible : session sans persistance */
  }
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const h: Record<string, string> = {}
  const token = getToken()
  if (token) h.Authorization = `Bearer ${token}`
  const opts: RequestInit = { method, headers: h }
  if (body !== undefined) {
    h['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, opts)
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    const message = (data as { message?: string } | null)?.message ?? `Erreur ${res.status}`
    throw new Error(message)
  }
  return data
}

// ---------------------------------------------------------------------------
// Session (le type local, sans refresh_token/OAuth)
// ---------------------------------------------------------------------------
export interface LocalUser {
  id: string
  email: string
}
export interface LocalSession {
  access_token: string
  user: LocalUser
  profile: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Query builder générique
// ---------------------------------------------------------------------------
type Filter =
  | { op: 'eq' | 'neq' | 'like'; col: string; val: unknown }
  | { op: 'or'; str: string }

class QueryBuilder<T = any> {
  private filters: Filter[] = []
  private orderCol?: string
  private orderAsc = true
  private limitN?: number
  private selectStr = '*'
  private write: { kind: 'insert' | 'update' | 'delete'; values?: Record<string, unknown> } | null = null
  private readonly table: string

  constructor(table: string) {
    this.table = table
  }

  select(s: string) {
    this.selectStr = s
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push({ op: 'eq', col, val })
    return this
  }
  neq(col: string, val: unknown) {
    this.filters.push({ op: 'neq', col, val })
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col
    this.orderAsc = opts?.ascending !== false
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  or(str: string) {
    this.filters.push({ op: 'or', str })
    return this
  }

  insert(values: Record<string, unknown>) {
    this.write = { kind: 'insert', values }
    return this
  }
  update(values: Record<string, unknown>) {
    this.write = { kind: 'update', values }
    return this
  }
  delete() {
    this.write = { kind: 'delete' }
    return this
  }

  private qs() {
    const params = new URLSearchParams()
    params.set('select', this.selectStr)
    for (const f of this.filters) {
      if (f.op === 'or') {
        const cur = params.get('or')
        params.set('or', cur ? `${cur},${f.str}` : f.str)
      } else if (f.val === null) {
        params.set(f.col, 'null')
      } else {
        params.set(f.col, String(f.val))
      }
    }
    if (this.orderCol) params.set('order', this.orderCol)
    if (this.orderCol) params.set('asc', String(this.orderAsc))
    if (this.limitN) params.set('limit', String(this.limitN))
    return params.toString()
  }

  private async runWrite(): Promise<{ data: T[]; error: Error | null }> {
    const w = this.write!
    try {
      if (w.kind === 'insert') {
        const row = (await request('POST', `/from/${this.table}`, w.values)) as T
        return { data: [row], error: null }
      }
      const eq = this.filters.find((f) => f.op === 'eq' && f.col === 'id') as
        | { op: 'eq'; col: string; val: unknown }
        | undefined
      const id = eq?.val
      if (!id) throw new Error(`${w.kind} exige un filtre eq sur id`)
      if (w.kind === 'update') {
        const row = (await request('PATCH', `/from/${this.table}/${id}`, w.values)) as T
        return { data: [row], error: null }
      }
      await request('DELETE', `/from/${this.table}/${id}`)
      return { data: [], error: null }
    } catch (e) {
      return { data: [], error: e as Error }
    }
  }

  private async runResult(): Promise<{ data: T[]; error: Error | null }> {
    if (this.write) {
      return this.runWrite()
    }
    const rows = (await request('GET', `/from/${this.table}?${this.qs()}`)) as T[]
    return { data: rows ?? [], error: null }
  }

  then(
    onOk?: (v: { data: T[]; error: Error | null }) => unknown,
    onErr?: (e: unknown) => unknown,
  ) {
    return this.runResult().then(
      (r) => (onOk ? onOk(r) : r),
      (e: unknown) => {
        if (onErr) return onErr(e)
        throw e
      },
    )
  }

  async maybeSingle() {
    const r = await this.runResult()
    return { data: (r.data[0] ?? null) as T | null, error: r.error }
  }
  single = this.maybeSingle
}

// ---------------------------------------------------------------------------
// Storage local
// ---------------------------------------------------------------------------
function blobToBase64(file: Blob | File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const storage = {
  from(bucket: string) {
    return {
      async upload(
        path: string,
        file: Blob | File,
        _opts?: { upsert?: boolean },
      ): Promise<{ error: Error | null }> {
        try {
          const b64 = await blobToBase64(file)
          await request('POST', '/storage/upload', {
            bucket,
            path,
            data: b64,
            contentType: file.type || 'application/octet-stream',
          })
          return { error: null }
        } catch (e) {
          return { error: e as Error }
        }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: `${BASE}/storage/${path}` } }
      },
    }
  },
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
const listeners = new Set<(event: string, session: LocalSession | null) => void>()

function notify(session: LocalSession | null) {
  for (const fn of listeners) fn('SIGNED_IN', session)
}

const auth = {
  async signUp(body: {
    email: string
    password: string
    options?: { data?: Record<string, unknown> }
  }) {
    try {
      const data = (await request('POST', '/auth/register', {
        email: body.email,
        password: body.password,
        username: body.options?.data?.username,
        display_name: body.options?.data?.display_name,
        role: body.options?.data?.role,
      })) as LocalSession
      setToken(data.access_token)
      notify(data)
      return { data, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },
  async signInWithPassword(body: { email: string; password: string }) {
    try {
      const data = (await request('POST', '/auth/login', body)) as LocalSession
      setToken(data.access_token)
      notify(data)
      return { data, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },
  async signOut() {
    try {
      await request('POST', '/auth/logout')
    } catch {
      /* déjà déconnecté */
    }
    setToken(null)
    notify(null)
    return { error: null }
  },
  async getSession() {
    if (!getToken()) return { data: { session: null } }
    try {
      const data = (await request('GET', '/auth/me')) as {
        user: LocalUser
        profile: Record<string, unknown>
      }
      return {
        data: { session: { ...data, access_token: getToken() } as LocalSession },
      }
    } catch {
      setToken(null)
      return { data: { session: null } }
    }
  },
  onAuthStateChange(cb: (event: string, session: LocalSession | null) => void) {
    listeners.add(cb)
    return {
      data: { subscription: { unsubscribe: () => listeners.delete(cb) } },
    }
  },
  async signInWithOAuth() {
    window.location.href = '/api/auth/google'
    return { data: null, error: null }
  },
}

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------
async function rpc(name: string, args?: Record<string, unknown>) {
  try {
    const data = await request('POST', `/rpc/${name}`, args ?? {})
    return { data, error: null }
  } catch (e) {
    return { data: null, error: e as Error }
  }
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------
const functions = {
  async invoke(name: string, opts?: { body?: unknown }) {
    try {
      const data: any = await request('POST', `/functions/${name}`, opts?.body ?? {})
      return { data, error: null }
    } catch (e) {
      return { data: null, error: e as Error }
    }
  },
}

// ---------------------------------------------------------------------------
// Realtime : polling (remplace le canal websocket Supabase)
// ---------------------------------------------------------------------------
function channel(_name: string) {
  return {
    on(_event: string, filter: unknown, cb: (payload: { new: unknown }) => void) {
      return {
        subscribe() {
          const f = (filter ?? {}) as { filter?: string }
          const guildId = (f.filter || '').replace('guild_id=eq.', '')
          let lastSeq = 0
          const timer = setInterval(async () => {
            try {
              const q = new URLSearchParams({ guild_id: guildId, since: String(lastSeq) })
              const data = (await request('GET', `/realtime/guild_messages?${q}`)) as {
                messages: { id: number }[]
                last_seq: number
              }
              for (const m of data.messages) {
                if (m.id > lastSeq) {
                  lastSeq = m.id
                  cb({ new: m })
                }
              }
              lastSeq = data.last_seq
            } catch {
              /* silencieux : le chat reste lisible */
            }
          }, 2000)
          return { unsubscribe: () => clearInterval(timer) }
        },
      }
    },
  }
}

async function removeChannel(_c?: unknown) {
  /* le polling est autonettoyé par unsubscribe() */
}

// ---------------------------------------------------------------------------
// Export : l'objet « supabase » local
// ---------------------------------------------------------------------------
export const supabase = {
  from<T = any>(table: string) {
    return new QueryBuilder<T>(table)
  },
  auth,
  rpc,
  storage,
  functions,
  channel,
  removeChannel,
}
