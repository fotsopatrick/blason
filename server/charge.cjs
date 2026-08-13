/**
 * Blason — controle de charge.
 *
 * POURQUOI (13/08/2026)
 *
 * Le serveur utilise `node:sqlite` (DatabaseSync). Le mot important est
 * SYNCHRONE : chaque requete SQL bloque la boucle d'evenements de Node.
 * Il n'y a pas de pool, pas de parallelisme, pas de file. Une seule requete
 * lente met TOUT le monde en attente, y compris /api/health.
 *
 * En temps normal ça ne se voit pas : les requetes durent moins d'une
 * milliseconde. Mais la couche 2D qu'on vient d'ajouter interroge le serveur
 * en boucle depuis un canvas anime. Un onglet oublie ouvert toute la nuit,
 * ou dix joueurs, et on decouvre la limite de la maniere desagreable.
 *
 * Quatre protections, dans cet ordre :
 *
 *   1. PLAFOND DE SIMULTANEITE — au-dela de N requetes API en vol, on repond
 *      503 avec Retry-After au lieu d'allonger une file invisible. Un refus
 *      rapide vaut mieux qu'une attente sans fin.
 *   2. SEAU A JETONS par identite (utilisateur si connu, sinon IP). Autorise
 *      les rafales normales d'une interface, coupe le matraquage.
 *   3. CACHE COURT sur les lectures chaudes. La carte du Royaume ne change
 *      pas entre deux images d'animation : la recalculer 60 fois par seconde
 *      est du gaspillage pur.
 *   4. SONDE — /api/charge dit ce qui se passe, avec des chiffres mesures.
 *      Sans mesure, on regle a l'aveugle.
 *
 * Aucune dependance ajoutee : tout tient en memoire du processus. C'est
 * suffisant pour un serveur mono-processus, et c'est exactement ce qu'on a.
 */

// ---------------------------------------------------------------------------
// Reglages — volontairement en un seul endroit, et surchargeables par .env
// ---------------------------------------------------------------------------
const REGLAGES = {
  // Simultaneite : au-dela, on refuse vite.
  MAX_EN_VOL: Number(process.env.BLASON_MAX_EN_VOL) || 40,
  // Seau a jetons : capacite (rafale) et recharge (regime permanent).
  SEAU_CAPACITE: Number(process.env.BLASON_SEAU_CAPACITE) || 60,
  SEAU_PAR_SEC: Number(process.env.BLASON_SEAU_PAR_SEC) || 8,
  // Ecriture : bien plus rare et bien plus couteuse qu'une lecture.
  SEAU_ECRITURE_CAPACITE: Number(process.env.BLASON_ECRITURE_CAPACITE) || 20,
  SEAU_ECRITURE_PAR_SEC: Number(process.env.BLASON_ECRITURE_PAR_SEC) || 1.5,
  // Cache des lectures chaudes.
  CACHE_MS: Number(process.env.BLASON_CACHE_MS) || 3000,
  CACHE_MAX: 500,
  // Au-dela, on considere la requete comme lente et on la journalise.
  LENT_MS: Number(process.env.BLASON_LENT_MS) || 120,
}

// ---------------------------------------------------------------------------
// Mesures
// ---------------------------------------------------------------------------
const mesures = {
  demarre: Date.now(),
  total: 0,
  refus_debit: 0,
  refus_simultaneite: 0,
  cache_touche: 0,
  cache_manque: 0,
  lentes: 0,
  en_vol: 0,
  en_vol_max: 0,
  // Fenetre glissante des durees, pour un p95 honnete sans dependance.
  durees: [],
  // Retard de la boucle d'evenements : LA mesure qui compte avec SQLite
  // synchrone. Si elle monte, le serveur bloque, quel que soit le CPU.
  retard_ms: 0,
  retard_max: 0,
}

function noterDuree(ms) {
  mesures.durees.push(ms)
  if (mesures.durees.length > 500) mesures.durees.shift()
  if (ms >= REGLAGES.LENT_MS) mesures.lentes += 1
}

function percentile(p) {
  if (!mesures.durees.length) return 0
  const t = [...mesures.durees].sort((a, b) => a - b)
  return Math.round(t[Math.min(t.length - 1, Math.floor(t.length * p))] * 100) / 100
}

// Sonde de retard de boucle : on se donne rendez-vous toutes les 500 ms et on
// mesure le retard reel. C'est la seule facon de voir un blocage synchrone.
let dernierRdv = Date.now()
const sondeBoucle = setInterval(() => {
  const maintenant = Date.now()
  const retard = Math.max(0, maintenant - dernierRdv - 500)
  dernierRdv = maintenant
  mesures.retard_ms = retard
  if (retard > mesures.retard_max) mesures.retard_max = retard
}, 500)
sondeBoucle.unref?.()

// ---------------------------------------------------------------------------
// Seau a jetons par identite
// ---------------------------------------------------------------------------
const seaux = new Map() // cle -> {jetons, maj, jetonsE, majE}

function identite(req) {
  // L'utilisateur connu prime sur l'IP : derriere un NAT d'entreprise,
  // limiter par IP punirait tout le monde pour un seul.
  const h = req.headers.authorization || ''
  if (h.startsWith('Bearer ')) return 'j:' + h.slice(7, 40)
  return 'i:' + (req.ip || req.socket?.remoteAddress || 'inconnu')
}

function prendreJeton(cle, ecriture) {
  const maintenant = Date.now()
  let s = seaux.get(cle)
  if (!s) {
    s = {
      jetons: REGLAGES.SEAU_CAPACITE, maj: maintenant,
      jetonsE: REGLAGES.SEAU_ECRITURE_CAPACITE, majE: maintenant,
    }
    seaux.set(cle, s)
  }
  if (ecriture) {
    s.jetonsE = Math.min(REGLAGES.SEAU_ECRITURE_CAPACITE,
      s.jetonsE + ((maintenant - s.majE) / 1000) * REGLAGES.SEAU_ECRITURE_PAR_SEC)
    s.majE = maintenant
    if (s.jetonsE < 1) return { ok: false, attendre: Math.ceil((1 - s.jetonsE) / REGLAGES.SEAU_ECRITURE_PAR_SEC) }
    s.jetonsE -= 1
  }
  s.jetons = Math.min(REGLAGES.SEAU_CAPACITE,
    s.jetons + ((maintenant - s.maj) / 1000) * REGLAGES.SEAU_PAR_SEC)
  s.maj = maintenant
  if (s.jetons < 1) return { ok: false, attendre: Math.ceil((1 - s.jetons) / REGLAGES.SEAU_PAR_SEC) }
  s.jetons -= 1
  return { ok: true }
}

// Menage : un seau plein depuis 10 minutes ne sert plus a rien.
const menage = setInterval(() => {
  const seuil = Date.now() - 10 * 60 * 1000
  for (const [k, s] of seaux) {
    if (s.maj < seuil && s.majE < seuil) seaux.delete(k)
  }
}, 60 * 1000)
menage.unref?.()

// ---------------------------------------------------------------------------
// Cache court des lectures chaudes
// ---------------------------------------------------------------------------
const cache = new Map() // cle -> {expire, corps}

function cacheLire(cle) {
  const e = cache.get(cle)
  if (!e) { mesures.cache_manque += 1; return null }
  if (e.expire < Date.now()) { cache.delete(cle); mesures.cache_manque += 1; return null }
  mesures.cache_touche += 1
  return e.corps
}

function cacheEcrire(cle, corps, ms) {
  if (cache.size >= REGLAGES.CACHE_MAX) {
    // Eviction simple : on retire la plus ancienne entree inseree.
    const premiere = cache.keys().next().value
    cache.delete(premiere)
  }
  cache.set(cle, { expire: Date.now() + (ms || REGLAGES.CACHE_MS), corps })
}

// Le cache est INVALIDE des qu'un utilisateur ecrit : sinon il verrait son
// propre XP figer pendant 3 secondes apres avoir repondu, et croirait a un bug.
function cacheVider(prefixe) {
  for (const k of cache.keys()) if (k.startsWith(prefixe)) cache.delete(k)
}

// Les seules routes mises en cache : lectures pures, couteuses, appelees en
// boucle par la couche 2D. Toute route qui ecrit en est exclue par construction.
const ROUTES_CACHEES = ['/api/royaume/carte', '/api/moi/etat', '/api/rpc/leaderboard_users', '/api/rpc/leaderboard_guilds']

// ---------------------------------------------------------------------------
// Le middleware
// ---------------------------------------------------------------------------
function installer(app) {
  app.set('trust proxy', 1)

  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next()

    // /api/charge doit repondre meme quand tout le reste refuse : une sonde
    // qui tombe en meme temps que le service ne sert a rien.
    if (req.path === '/api/charge') return next()

    mesures.total += 1

    // 1. Plafond de simultaneite
    if (mesures.en_vol >= REGLAGES.MAX_EN_VOL) {
      mesures.refus_simultaneite += 1
      res.set('Retry-After', '2')
      return res.status(503).json({
        message: 'Serveur sature, reessaie dans un instant.',
        en_vol: mesures.en_vol, plafond: REGLAGES.MAX_EN_VOL,
      })
    }

    // 2. Seau a jetons
    const ecriture = req.method !== 'GET' && req.method !== 'HEAD'
    const j = prendreJeton(identite(req), ecriture)
    if (!j.ok) {
      mesures.refus_debit += 1
      res.set('Retry-After', String(j.attendre || 1))
      return res.status(429).json({
        message: 'Trop de requetes. Ralentis.',
        reessayer_dans_s: j.attendre || 1,
      })
    }

    // 3. Cache court (lectures seules)
    const cachable = req.method === 'GET' && ROUTES_CACHEES.includes(req.path)
    const cleCache = cachable ? identite(req) + '|' + req.originalUrl : null
    if (cleCache) {
      const hit = cacheLire(cleCache)
      if (hit) {
        res.set('X-Blason-Cache', 'touche')
        return res.json(hit)
      }
    }

    // 4. Mesure + comptage en vol
    const t0 = process.hrtime.bigint()
    mesures.en_vol += 1
    if (mesures.en_vol > mesures.en_vol_max) mesures.en_vol_max = mesures.en_vol

    // On intercepte res.json pour remplir le cache sans toucher aux routes.
    const jsonOrigine = res.json.bind(res)
    res.json = (corps) => {
      if (cleCache && res.statusCode === 200) cacheEcrire(cleCache, corps)
      // Toute ecriture reussie invalide le cache de cette identite : l'etat
      // affiche doit bouger immediatement apres une reponse.
      if (ecriture && res.statusCode < 400) cacheVider(identite(req) + '|')
      return jsonOrigine(corps)
    }

    let fini = false
    const finir = () => {
      if (fini) return
      fini = true
      mesures.en_vol -= 1
      noterDuree(Number(process.hrtime.bigint() - t0) / 1e6)
    }
    res.on('finish', finir)
    res.on('close', finir)
    next()
  })

  // La sonde. Volontairement publique en lecture : elle ne divulgue aucune
  // donnee personnelle, et une sonde qu'il faut authentifier ne se surveille pas.
  app.get('/api/charge', (_req, res) => {
    const m = process.memoryUsage()
    const sec = Math.max(1, (Date.now() - mesures.demarre) / 1000)
    res.json({
      etat: mesures.retard_ms > 200 ? 'bloque'
        : mesures.en_vol >= REGLAGES.MAX_EN_VOL * 0.8 ? 'tendu'
          : 'sain',
      requetes: {
        total: mesures.total,
        par_sec: Math.round((mesures.total / sec) * 100) / 100,
        en_vol: mesures.en_vol,
        en_vol_max: mesures.en_vol_max,
        lentes: mesures.lentes,
      },
      latence_ms: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
      // Le retard de boucle est la mesure a surveiller : avec SQLite synchrone,
      // c'est lui qui trahit un blocage, pas le CPU.
      boucle_evenements_ms: { courant: mesures.retard_ms, max: mesures.retard_max },
      refus: { debit: mesures.refus_debit, simultaneite: mesures.refus_simultaneite },
      cache: {
        touche: mesures.cache_touche, manque: mesures.cache_manque,
        taux: mesures.cache_touche + mesures.cache_manque
          ? Math.round((mesures.cache_touche / (mesures.cache_touche + mesures.cache_manque)) * 100) + '%'
          : '—',
        entrees: cache.size,
      },
      memoire_mo: {
        tas: Math.round(m.heapUsed / 1048576), rss: Math.round(m.rss / 1048576),
      },
      seaux_actifs: seaux.size,
      reglages: REGLAGES,
      uptime_s: Math.round(sec),
    })
  })
}

module.exports = { installer, REGLAGES, mesures, cacheVider }
