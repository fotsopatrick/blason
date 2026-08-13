/**
 * Blason — le moteur d'apprentissage.
 *
 * Ce que ce fichier ajoute au serveur, et pourquoi :
 *
 *  - des EXERCICES NOTES tires de curriculum.cjs (le « lis la doc » ne
 *    faisait monter personne en compétence) ;
 *  - la REPETITION ESPACEE (SM-2 allégé), parce qu'une compétence revue une
 *    fois est oubliee avant l'entretien ;
 *  - la BOUCLE QUOTIDIENNE : série, objectif du jour, coeurs, enchainement.
 *    C'est ce qui ramene demain — Duolingo ne tient pas par autre chose ;
 *  - le BLASON : chaque compétence maîtrisée ajoute un quartier a l'écu.
 *    C'est le cran au-dessus de la série Duolingo : on ne collectionne pas
 *    des points, on construit un objet qui nous représente ;
 *  - le PARCOURS : une offre réelle -> les compétences, le curriculum,
 *    l'entretien, et la fiche « pret pour les USA ».
 *
 * REGLE QUI GOUVERNE TOUT : jamais un point sans registre. Chaque XP affiche
 * correspond a une ligne dans xp_events, et chaque ligne de xp_events a une
 * réponse horodatée dans `réponses` derriere elle. Aucune jauge inventee.
 */
const crypto = require('node:crypto')
const cur = require('./curriculum.cjs')
// Le generateur : ecrit des exercices pour n'importe quel metier quand une
// cle d'API est configuree. Sans cle, il repond qu'il n'est pas configure
// et le reste de Blason fonctionne a l'identique. Voir generateur.cjs.
const gen = require('./generateur.cjs')

const uuid = () => crypto.randomUUID()
const jour = (d) => (d || new Date()).toISOString().slice(0, 10)
const ajouterJours = (dateISO, n) => {
  const d = new Date(dateISO + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Schéma
// ---------------------------------------------------------------------------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS competences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  reussites INTEGER NOT NULL DEFAULT 0,
  echecs INTEGER NOT NULL DEFAULT 0,
  -- SM-2 : facilite, intervalle en jours, nombre de repetitions reussies
  facilite REAL NOT NULL DEFAULT 2.5,
  intervalle INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  -- La meilleure serie de reussites consecutives jamais atteinte.
  -- Elle sert au NIVEAU affiche, pas a la planification des revisions.
  -- Voir niveauDe() pour la raison — decouverte en testant, pas en concevant.
  meilleure_serie INTEGER NOT NULL DEFAULT 0,
  a_revoir_le TEXT,
  maj TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, skill)
);

-- Le registre. Sans lui, aucun chiffre affiche n'a le droit d'exister.
CREATE TABLE IF NOT EXISTS reponses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  exercice_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  type TEXT NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  note INTEGER NOT NULL DEFAULT 0,      -- 0..100
  reponse TEXT NOT NULL DEFAULT '',
  duree_ms INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rythme (
  user_id TEXT PRIMARY KEY,
  serie INTEGER NOT NULL DEFAULT 0,
  record INTEGER NOT NULL DEFAULT 0,
  dernier_jour TEXT,
  objectif_xp INTEGER NOT NULL DEFAULT 50,
  xp_du_jour INTEGER NOT NULL DEFAULT 0,
  jour_courant TEXT,
  coeurs INTEGER NOT NULL DEFAULT 5,
  coeurs_maj TEXT,
  gels INTEGER NOT NULL DEFAULT 0,
  combo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS parcours (
  id TEXT PRIMARY KEY,
  offre_id TEXT,
  user_id TEXT NOT NULL,
  titre TEXT NOT NULL,
  entreprise TEXT NOT NULL DEFAULT '',
  pays TEXT NOT NULL DEFAULT 'FR',
  competences TEXT NOT NULL DEFAULT '[]',
  entretien TEXT NOT NULL DEFAULT '[]',
  us_check TEXT NOT NULL DEFAULT '[]',
  salaire TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Les exercices écrits par le modèle, pour les compétences qui n'ont pas de
-- banque à la main. On les STOCKE : générer à chaque séance coûterait cher
-- et donnerait un contenu instable — on ne révise pas ce qui change à
-- chaque passage. Voir server/generateur.cjs.
CREATE TABLE IF NOT EXISTS exercices_generes (
  id TEXT PRIMARY KEY,              -- identifiant stable, comme la banque
  skill TEXT NOT NULL,
  type TEXT NOT NULL,
  corps TEXT NOT NULL,              -- l'exercice complet, en JSON
  modele TEXT NOT NULL DEFAULT '',
  cree_par TEXT,                    -- qui a demandé la génération
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gen_skill ON exercices_generes (skill);

CREATE INDEX IF NOT EXISTS idx_rep_user ON reponses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rep_ex ON reponses (user_id, exercice_id);
CREATE INDEX IF NOT EXISTS idx_comp_revoir ON competences (user_id, a_revoir_le);
CREATE INDEX IF NOT EXISTS idx_parcours_user ON parcours (user_id, created_at DESC);
`

// ---------------------------------------------------------------------------
// Lecture d'une annonce : pays, salaire, droit au travail, fuseau
//
// C'est le manque 6 de la spec : ce qui fait echouer une candidature depuis
// la France n'est presque jamais technique. On lit donc l'annonce pour ces
// signaux-la, et on les rend visibles AVANT de postuler.
// ---------------------------------------------------------------------------
function lireContexteUS(texte, titre) {
  const t = String(texte || '') + ' ' + String(titre || '')
  const bas = t.toLowerCase()

  const marqueursUS = [
    'united states', 'usa', 'u.s.', 'us remote', 'remote (us', 'san francisco',
    'new york', 'seattle', 'austin', 'boston', 'chicago', 'denver', 'atlanta',
    ', ca', ', ny', ', wa', ', tx', ', ma', ', il', ', co', ', ga',
    '401(k)', '401k', 'usd', 'h-1b', 'green card', 'ead', 'opt',
  ]
  const scoreUS = marqueursUS.filter((m) => bas.includes(m)).length
  const pays = scoreUS >= 2 ? 'US' : 'FR'

  // Fourchette de salaire : « $180,375 – $230,625 » et variantes.
  let salaire = ''
  const mSal = t.match(/\$\s?([\d][\d ,.]{3,})\s*(?:[-–—]|to)\s*\$?\s?([\d][\d ,.]{3,})/)
  if (mSal) salaire = '$' + mSal[1].trim() + ' – $' + mSal[2].trim()
  else {
    const mUn = t.match(/\$\s?([\d]{2,3}[ ,.][\d]{3})/)
    if (mUn) salaire = '$' + mUn[1].trim()
  }

  // Droit au travail : on cherche la mention, et on dit ce qu'elle implique.
  let sponsor = 'non précise'
  if (/will not sponsor|unable to sponsor|no sponsorship|without sponsorship|not provide sponsorship/i.test(t))
    sponsor = 'refuse explicitement'
  else if (/sponsorship (is )?available|will sponsor|visa sponsorship/i.test(t))
    sponsor = 'possible'
  else if (/authorized to work|work authorization|legally authorized/i.test(t))
    sponsor = 'autorisation exigée, sponsoring non promis'

  const distanciel = /\bremote\b|\btelework\b|\bteletravail\b/i.test(t)
  const hybride = /\bhybrid\b/i.test(t)

  // Fuseau : on devine la cote à partir des villes citees.
  let fuseau = ''
  if (/san francisco|seattle|portland|los angeles|san jose|\bca\b|\bwa\b|\bor\b/i.test(t)) fuseau = 'PT'
  if (/new york|boston|atlanta|miami|washington|\bny\b|\bma\b|\bdc\b/i.test(t)) fuseau = fuseau ? fuseau + '/ET' : 'ET'
  if (/austin|dallas|houston|chicago|denver/i.test(t)) fuseau = fuseau ? fuseau + '/CT' : 'CT'

  return { pays, salaire, sponsor, distanciel, hybride, fuseau }
}

// La fiche « pret pour les USA » : des points a cocher, pas des conseils en l'air.
function ficheUS(ctx) {
  const decalage = ctx.fuseau.includes('PT') ? 9 : ctx.fuseau.includes('CT') ? 7 : 6
  const debut = (9 + decalage) % 24
  const items = [
    {
      cle: 'droit-travail',
      titre: 'Droit de travailler aux USA',
      etat: ctx.sponsor === 'refuse explicitement' ? 'bloquant'
        : ctx.sponsor === 'possible' ? 'favorable' : 'a-verifier',
      dit:
        ctx.sponsor === 'refuse explicitement'
          ? "L'annonce refuse le sponsoring. Depuis la France, cette offre est fermée sauf si tu as déjà un statut : ne perds pas trois soirées dessus."
          : ctx.sponsor === 'possible'
            ? "L'annonce évoque le sponsoring. C'est rare et ça vaut la candidature : mets ta situation en une ligne factuelle dans la lettre, sans t'excuser."
            : "L'annonce ne dit rien. Pose la question au premier échange, avant l'entretien technique : c'est la question qui annule tout le reste.",
    },
    {
      cle: 'localisation',
      titre: 'Localisation exigée',
      etat: ctx.distanciel && ctx.pays === 'US' ? 'a-verifier' : 'info',
      dit: ctx.distanciel
        ? "« Remote » dans une annonce américaine veut presque toujours dire « depuis le sol américain » : paie, impôts et assurance y sont attaches. A confirmer explicitement."
        : 'Poste sur site ou hybride : la question du déménagement se pose dès la première candidature.',
    },
    {
      cle: 'fuseau',
      titre: 'Fuseau horaire' + (ctx.fuseau ? ' (' + ctx.fuseau + ')' : ''),
      etat: ctx.fuseau ? 'a-preparer' : 'info',
      dit: ctx.fuseau
        ? `Une journee 9 h-17 h ${ctx.fuseau} se vit ${debut} h-${(debut + 8) % 24} h en France. Arrive avec une reponse prete (« je tiens 4 h de recouvrement, telles heures ») : l'improviser inquiete le recruteur.`
        : "Fuseau non identifie dans l'annonce. A demander : c'est la contrainte de vie la plus lourde d'un poste US depuis l'Europe.",
    },
    {
      cle: 'salaire',
      titre: 'Ancrage salarial',
      etat: ctx.salaire ? 'a-preparer' : 'a-verifier',
      dit: ctx.salaire
        ? `Fourchette publiee : ${ctx.salaire}. Vise 50-75 % si tu coches la plupart des criteres. Demander le bas « pour maximiser ses chances » envoie un mauvais signal et on obtient ce qu'on demande.`
        : "Aucune fourchette publiée. La Californie et l'État de New York l'imposent : son absence indique souvent un poste hors de ces États. Prepare ta fourchette avant l'appel.",
    },
    {
      cle: 'cv-ats',
      titre: 'CV au format américain',
      etat: 'a-preparer',
      dit: "1 page (2 au-dela de 10 ans), aucune photo, aucun age, aucune nationalite, aucune situation de famille. Verbes d'action, résultats chiffres, et les mots-clés de l'annonce repris TELS QUELS pour passer l'ATS.",
    },
    {
      cle: 'realisation',
      titre: 'Une réalisation ouvrable en 30 secondes',
      etat: 'a-preparer',
      dit: "Un lien qui s'ouvre et fonctionne, sans installation : demo en ligne + schéma d'architecture lisible + depot. Un depot Git seul est rarement lu.",
    },
    {
      cle: 'star',
      titre: 'Recits STAR',
      etat: 'a-preparer',
      dit: "Un recit prepare par grande responsabilité de l'annonce. Aux USA le comportemental élimine autant que la technique. « J'ai », pas « nous avons ».",
    },
  ]
  return items
}

// ---------------------------------------------------------------------------
// Le parcours : une offre -> de quoi travailler pendant des semaines
// ---------------------------------------------------------------------------
function construireParcours({ texte, titre, entreprise, competences }) {
  const ctx = lireContexteUS(texte, titre)
  const skills = []
  const vus = new Set()
  for (const brut of competences) {
    const n = cur.normaliser(brut)
    if (vus.has(n)) continue
    vus.add(n)
    skills.push({
      nom: n,
      brut,
      couvert: cur.aUneBanque(n),
      nb_exercices: cur.exercicesPour(n).length,
    })
  }
  if (!skills.length) {
    skills.push({ nom: 'Communication', brut: 'Communication', couvert: true, nb_exercices: cur.exercicesPour('Communication').length })
  }
  // Le marche US est une compétence à part entière dès que l'offre est américaine.
  if (ctx.pays === 'US' && !vus.has('Marche US')) {
    skills.push({ nom: 'Marche US', brut: 'Marche US', couvert: true, nb_exercices: cur.exercicesPour('Marche US').length })
  }

  // Les questions d'entretien : tirees des exercices de type design/arbitrage/star
  // des compétences du poste. On ne les invente pas, on les recolte.
  const entretien = []
  for (const s of skills) {
    for (const e of cur.exercicesPour(s.nom)) {
      if (e.type === 'design') entretien.push({ skill: s.nom, genre: 'system design', question: e.enonce, grille: e.grille })
      else if (e.type === 'star') entretien.push({ skill: s.nom, genre: 'comportemental', question: e.question, grille: e.grille })
      else if (e.type === 'arbitrage') entretien.push({ skill: s.nom, genre: 'arbitrage', question: e.situation, grille: e.options })
    }
  }

  return {
    titre: titre || 'Poste',
    entreprise: entreprise || '',
    pays: ctx.pays,
    salaire: ctx.salaire,
    competences: skills,
    entretien,
    us_check: ctx.pays === 'US' ? ficheUS(ctx) : [],
    contexte: ctx,
  }
}

// ---------------------------------------------------------------------------
// Répétition espacée — SM-2 allégé
// ---------------------------------------------------------------------------
function majSRS(etat, qualite) {
  // qualité 0..5 ; en-dessous de 3, on repart de zéro mais on ne punit pas la facilite a l'excès
  let { facilite, intervalle, repetitions } = etat
  if (qualite < 3) {
    repetitions = 0
    intervalle = 1
  } else {
    repetitions += 1
    intervalle = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(intervalle * facilite)
  }
  facilite = facilite + (0.1 - (5 - qualite) * (0.08 + (5 - qualite) * 0.02))
  if (facilite < 1.3) facilite = 1.3
  if (facilite > 2.8) facilite = 2.8
  if (intervalle > 180) intervalle = 180
  return { facilite, intervalle, repetitions, a_revoir_le: ajouterJours(jour(), intervalle) }
}

// Le niveau affiche derive UNIQUEMENT des réponses enregistrees.
// 0 inconnue, 1 abordee, 2 pratiquee, 3 solide, 4 maîtrisée, 5 exemplaire.
//
// LE PIEGE, TROUVE EN TESTANT (13/08/2026)
//
// La première version lisait `répétitions`, c'est-a-dire le nombre de
// réussites CONSECUTIVES au sens SM-2. Une seule erreur le remet a zéro.
// Conséquence a l'écran : un compte avec 9 réussites sur AWS affichait
// niveau 2, et le batiment du Royaume s'effondrait de la Tour a la Cabane
// pour une question ratee.
//
// C'est juste pour PLANIFIER une révision — après une erreur, il faut
// effectivement revoir demain. C'est faux pour AFFICHER une maîtrise : on
// n'oublie pas neuf réussites parce qu'on en rate une.
//
// On garde donc `répétitions` pour la planification, et on lit ici la
// MEILLEURE série atteinte, moins un. Une erreur coûte au plus un niveau,
// jamais quatre. Le chiffre reste entièrement derive du registre : aucune
// indulgence inventee, juste une mesure qui mesure la bonne chose.
function niveauDe(c) {
  if (!c || c.reussites === 0) return 0
  const total = c.reussites + c.echecs
  const taux = c.reussites / total
  const ancrage = Math.max(c.repetitions, Math.max(0, (c.meilleure_serie || 0) - 1))
  if (ancrage >= 5 && taux >= 0.85 && c.reussites >= 10) return 5
  if (ancrage >= 4 && taux >= 0.75 && c.reussites >= 7) return 4
  if (ancrage >= 3 && c.reussites >= 5) return 3
  if (c.reussites >= 3) return 2
  return 1
}

// ---------------------------------------------------------------------------
// Correction
// ---------------------------------------------------------------------------
function corriger(ex, reponse) {
  if (ex.type === 'qcm' || ex.type === 'arbitrage') {
    const attendu = ex.type === 'qcm' ? ex.bonne : ex.recommande
    const donne = Number(reponse)
    const ok = donne === attendu
    return { correct: ok, note: ok ? 100 : 0, qualite: ok ? 5 : 1, attendu }
  }
  if (ex.type === 'chiffre') {
    const donne = Number(String(reponse).replace(/[^\d.,-]/g, '').replace(',', '.'))
    if (!Number.isFinite(donne)) return { correct: false, note: 0, qualite: 0, attendu: ex.reponse }
    const ok = Math.abs(donne - ex.reponse) <= (ex.tolerance || 0)
    // Un ordre de grandeur juste vaut mieux que rien : on note la proximite.
    const ecart = ex.reponse === 0 ? 1 : Math.abs(donne - ex.reponse) / Math.abs(ex.reponse)
    const note = ok ? 100 : ecart <= 0.25 ? 50 : 0
    return { correct: ok, note, qualite: ok ? 5 : note ? 3 : 1, attendu: ex.reponse }
  }
  if (ex.type === 'design' || ex.type === 'star') {
    // Auto-évaluation SUR GRILLE : l'utilisateur coche les critères qu'il a
    // réellement couverts. La grille est publiée après coup, jamais avant :
    // sinon on recopie la grille au lieu de réfléchir.
    const coches = Array.isArray(reponse) ? reponse.filter((x) => x === true || x === 1).length
      : Number(reponse) || 0
    const total = ex.grille.length
    const seuil = ex.seuil || Math.ceil(total * 0.6)
    const note = Math.round((Math.min(coches, total) / total) * 100)
    const ok = coches >= seuil
    return { correct: ok, note, qualite: ok ? (note >= 90 ? 5 : 4) : note >= 40 ? 2 : 1, attendu: seuil, coches, total }
  }
  return { correct: false, note: 0, qualite: 0, attendu: null }
}

const XP_BASE = { qcm: 10, chiffre: 12, arbitrage: 15, design: 25, star: 20 }

// ---------------------------------------------------------------------------
// Installation sur l'application Express
// ---------------------------------------------------------------------------
function installer(app, db, deps) {
  const { requireAuth, rowOut } = deps
  db.exec(SCHEMA)

  // MIGRATION — `CREATE TABLE IF NOT EXISTS` n'ajoute rien a une table qui
  // existe déjà. Une colonne ajoutee après coup doit l'être explicitement,
  // sinon le code neuf tourne sur un schéma ancien et échoue a la première
  // ecriture, en production, sans que rien ne l'ait annonce.
  const colonnes = db.prepare('PRAGMA table_info(competences)').all().map((c) => c.name)
  if (!colonnes.includes('meilleure_serie')) {
    db.exec('ALTER TABLE competences ADD COLUMN meilleure_serie INTEGER NOT NULL DEFAULT 0')
    // Rattrapage : pour les comptes existants, la meilleure série connue est
    // au moins la série en cours. On ne peut pas reconstituer mieux sans
    // rejouer tout le registre, et ce serait mentir sur ce qu'on sait.
    db.exec('UPDATE competences SET meilleure_serie = repetitions WHERE meilleure_serie < repetitions')
  }

  const q = (sql) => db.prepare(sql)

  // ---------------------------------------------------------------------
  // OÙ VIVENT LES EXERCICES D'UNE COMPÉTENCE (13/08/2026)
  //
  // Trois sources, dans cet ordre :
  //   1. la banque écrite à la main (curriculum.cjs) — la meilleure ;
  //   2. les exercices générés et STOCKÉS pour cette compétence ;
  //   3. la fiche générique — le filet, jamais vide.
  //
  // La 2 n'existe que si une clé d'API est configurée et que quelqu'un a
  // demandé l'enrichissement. Sans clé, on retombe exactement sur le
  // comportement d'avant : rien ne casse, rien n'est masqué.
  // ---------------------------------------------------------------------
  function exercicesDe(skill) {
    if (cur.aUneBanque(skill)) return cur.exercicesPour(skill)
    const lignes = q('SELECT corps FROM exercices_generes WHERE skill = ? ORDER BY id').all(skill)
    if (lignes.length) {
      return lignes.map((l) => JSON.parse(l.corps))
    }
    return cur.exercicesPour(skill)
  }

  function compteGeneres(skill) {
    return q('SELECT COUNT(*) n FROM exercices_generes WHERE skill = ?').get(skill).n
  }

  // ---- rythme (série, coeurs, objectif) --------------------------------
  const COEUR_MAX = 5
  const COEUR_DELAI_MS = 4 * 3600 * 1000 // un coeur toutes les 4 h

  function rythme(uid) {
    let r = q('SELECT * FROM rythme WHERE user_id = ?').get(uid)
    if (!r) {
      q('INSERT INTO rythme (user_id, coeurs, coeurs_maj, jour_courant) VALUES (?, ?, ?, ?)')
        .run(uid, COEUR_MAX, new Date().toISOString(), jour())
      r = q('SELECT * FROM rythme WHERE user_id = ?').get(uid)
    }
    // Regeneration des coeurs au fil du temps
    if (r.coeurs < COEUR_MAX && r.coeurs_maj) {
      const ecoule = Date.now() - new Date(r.coeurs_maj).getTime()
      const gagnes = Math.floor(ecoule / COEUR_DELAI_MS)
      if (gagnes > 0) {
        const n = Math.min(COEUR_MAX, r.coeurs + gagnes)
        q('UPDATE rythme SET coeurs = ?, coeurs_maj = ? WHERE user_id = ?')
          .run(n, new Date().toISOString(), uid)
        r.coeurs = n
      }
    }
    // Changement de jour : on remet le compteur du jour a zéro, et on tranche la série
    const aujourdhui = jour()
    if (r.jour_courant !== aujourdhui) {
      let serie = r.serie
      if (r.dernier_jour) {
        const hier = ajouterJours(aujourdhui, -1)
        if (r.dernier_jour !== hier && r.dernier_jour !== aujourdhui) {
          // Un gel sauve la série une fois.
          if (r.gels > 0) {
            q('UPDATE rythme SET gels = gels - 1 WHERE user_id = ?').run(uid)
          } else {
            serie = 0
          }
        }
      }
      q('UPDATE rythme SET jour_courant = ?, xp_du_jour = 0, serie = ?, combo = 0 WHERE user_id = ?')
        .run(aujourdhui, serie, uid)
      r = q('SELECT * FROM rythme WHERE user_id = ?').get(uid)
    }
    return r
  }

  function competence(uid, skill) {
    let c = q('SELECT * FROM competences WHERE user_id = ? AND skill = ?').get(uid, skill)
    if (!c) {
      q('INSERT INTO competences (user_id, skill) VALUES (?, ?)').run(uid, skill)
      c = q('SELECT * FROM competences WHERE user_id = ? AND skill = ?').get(uid, skill)
    }
    return c
  }

  // Le blason : chaque compétence de niveau >= 3 pose un quartier sur l'écu.
  // C'est le sens du nom de l'appli — et c'est ce qui dépasse la série
  // Duolingo : on ne collectionne pas des points, on construit un objet.
  const MEUBLES = ['lion', 'aigle', 'tour', 'epee', 'etoile', 'croix', 'chevron', 'losange', 'roue', 'flamme', 'ancre', 'cle']
  const EMAUX = ['#b91c1c', '#1d4ed8', '#15803d', '#a16207', '#6d28d9', '#0f766e', '#be185d', '#0369a1']

  function blason(uid) {
    const comps = q('SELECT * FROM competences WHERE user_id = ? ORDER BY skill').all(uid)
    const quartiers = []
    for (const c of comps) {
      const n = niveauDe(c)
      if (n < 3) continue
      const i = cur.competencesConnues().indexOf(c.skill)
      const k = i >= 0 ? i : Math.abs(hashCode(c.skill))
      quartiers.push({
        skill: c.skill, niveau: n,
        meuble: MEUBLES[k % MEUBLES.length],
        email: EMAUX[k % EMAUX.length],
      })
    }
    return { quartiers, devise: quartiers.length >= 6 ? 'Par la preuve' : 'En construction' }
  }
  const hashCode = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h }

  // ---- état du joueur ---------------------------------------------------
  app.get('/api/moi/etat', requireAuth, (req, res) => {
    const uid = req.auth.profile.id
    const r = rythme(uid)
    const comps = q('SELECT * FROM competences WHERE user_id = ? ORDER BY skill').all(uid)
    const aujourdhui = jour()
    const dues = comps.filter((c) => c.a_revoir_le && c.a_revoir_le <= aujourdhui).length
    const total = q('SELECT COALESCE(SUM(amount),0) x FROM xp_events WHERE user_id = ?').get(uid).x
    res.json({
      xp: total,
      niveau: Math.floor(Math.sqrt(total / 50)) + 1,
      serie: r.serie, record: r.record, gels: r.gels,
      coeurs: r.coeurs, coeurs_max: COEUR_MAX,
      objectif_xp: r.objectif_xp, xp_du_jour: r.xp_du_jour,
      objectif_atteint: r.xp_du_jour >= r.objectif_xp,
      combo: r.combo,
      a_revoir: dues,
      competences: comps.map((c) => ({
        skill: c.skill, niveau: niveauDe(c),
        reussites: c.reussites, echecs: c.echecs,
        a_revoir_le: c.a_revoir_le,
        du: Boolean(c.a_revoir_le && c.a_revoir_le <= aujourdhui),
      })),
      blason: blason(uid),
    })
  })

  // ---- génération d'un parcours depuis une offre -----------------------
  app.post('/api/parcours/generer', requireAuth, async (req, res) => {
    const uid = req.auth.profile.id
    let texte = String(req.body?.job_posting || req.body?.texte || '')
    let titre = String(req.body?.titre || '')
    let entreprise = String(req.body?.entreprise || '')
    let offreId = req.body?.offre_id || null

    if (offreId) {
      const o = q('SELECT * FROM offres WHERE id = ?').get(offreId)
      if (!o) return res.status(404).json({ message: 'Offre introuvable' })
      texte = o.notes || ''
      titre = titre || o.titre
      entreprise = entreprise || o.entreprise
    }
    if (!texte.trim()) return res.status(400).json({ message: "Colle le texte de l'offre (job_posting) ou donne offre_id." })

    // LIRE L ANNONCE (13/08/2026).
    //
    // Deux lectures possibles, et la seconde n existe que si une cle est
    // configuree :
    //
    //   - le comptage pondere de mots-cles : sans cle, gratuit, instantane,
    //     correct sur les annonces techniques. Sur une annonce de commercial
    //     terrain, il ne sort qu une competence — sa liste ne connait que
    //     l informatique ;
    //   - le modele : lit n importe quel metier, nomme les competences comme
    //     le metier les nomme.
    //
    // On tente le modele, on retombe SILENCIEUSEMENT sur les mots-cles s il
    // echoue. Une panne de la generation ne doit jamais empecher de creer un
    // parcours — c est un supplement, pas une dependance.
    let competences = deps.extraireCompetences(texte + ' ' + titre)
    let lecture = { par: 'mots-cles', metier: '' }
    if (gen.disponible() && req.body?.sans_ia !== true) {
      try {
        const ia = await gen.extraireIA(texte, titre)
        if (ia.competences.length >= 3) {
          competences = ia.competences.map((c) => c.nom)
          lecture = { par: 'modele', metier: ia.metier, detail: ia.competences }
        }
      } catch (e) {
        // On note la raison sans casser : le parcours se cree quand meme.
        lecture.echec_ia = e.message
      }
    }
    const p = construireParcours({ texte, titre, entreprise, competences })
    p.lecture = lecture

    const id = uuid()
    q(`INSERT INTO parcours (id, offre_id, user_id, titre, entreprise, pays, competences, entretien, us_check, salaire)
       VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      id, offreId, uid, p.titre, p.entreprise, p.pays,
      JSON.stringify(p.competences), JSON.stringify(p.entretien),
      JSON.stringify(p.us_check), p.salaire,
    )

    const avert = []
    if (texte.length < 1500) {
      avert.push(
        `L'annonce ne fait que ${texte.length} caracteres. Sur Indeed et LinkedIn, ` +
        `la description complete est repliee derriere « voir plus » : sans elle, ` +
        `le parcours porte sur les mots du titre, pas sur le poste.`)
    }
    const nonCouvertes = p.competences.filter((c) => !c.couvert).map((c) => c.nom)
    if (nonCouvertes.length) {
      avert.push(
        `Pas encore de banque d'exercices dediee pour : ${nonCouvertes.join(', ')}. ` +
        `Ces competences recoivent la fiche generique (role, limites, cout, panne) — ` +
        `du travail reel, mais moins fin que les competences couvertes.`)
    }
    res.json({ id, ...p, avertissements: avert })
  })

  app.get('/api/parcours', requireAuth, (req, res) => {
    const uid = req.auth.profile.id
    const rows = q('SELECT * FROM parcours WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(uid)
    res.json(rows.map(rowOut))
  })

  app.get('/api/parcours/:id', requireAuth, (req, res) => {
    const p = q('SELECT * FROM parcours WHERE id = ? AND user_id = ?').get(req.params.id, req.auth.profile.id)
    if (!p) return res.status(404).json({ message: 'Parcours introuvable' })
    res.json(rowOut(p))
  })

  // ---- enrichir une competence : ecrire des exercices pour N'IMPORTE
  //      QUEL metier, quand une cle d'API est configuree ------------------
  //
  // Blason est public. 46 exercices ecrits a la main couvrent l'architecture
  // cloud et IA — un commercial, un comptable, une infirmiere n'auraient que
  // la fiche generique. Ecrire une banque par metier a la main n'est pas
  // tenable ; on delegue l'ecriture a un modele qui raisonne.
  //
  // Sans cle, cette route repond 501 avec la marche a suivre, et TOUT LE
  // RESTE continue de fonctionner. Le zero-cle demeure le mode par defaut.
  app.get('/api/curriculum/etat', requireAuth, (req, res) => {
    const skill = req.query.skill ? cur.normaliser(String(req.query.skill)) : null
    res.json({
      generation_disponible: gen.disponible(),
      modele: gen.disponible() ? gen.MODELE : null,
      competences_ecrites_main: cur.competencesConnues(),
      ...(skill ? {
        skill,
        source: cur.aUneBanque(skill) ? 'banque ecrite a la main'
          : compteGeneres(skill) ? 'exercices generes'
            : 'fiche generique',
        nb_exercices: exercicesDe(skill).length,
        nb_generes: compteGeneres(skill),
      } : {}),
    })
  })

  app.post('/api/curriculum/generer', requireAuth, async (req, res) => {
    const uid = req.auth.profile.id
    const brut = String(req.body?.skill || '').trim()
    if (!brut) return res.status(400).json({ message: 'skill requis' })
    const skill = cur.normaliser(brut)

    if (cur.aUneBanque(skill)) {
      return res.status(409).json({
        message: `« ${skill} » a deja une banque ecrite a la main : `
          + `${cur.exercicesPour(skill).length} exercices relus. On ne la remplace pas par du genere.`,
      })
    }
    // On ne regenere pas ce qui existe : le contenu doit etre STABLE pour
    // pouvoir etre revise, et regenerer serait payer deux fois.
    const deja = compteGeneres(skill)
    if (deja > 0 && !req.body?.encore) {
      return res.status(409).json({
        message: `« ${skill} » a deja ${deja} exercices generes. `
          + 'Passe `encore: true` pour en ajouter davantage.',
        nb_existants: deja,
      })
    }
    // Plafond dur : sans lui, une boucle cote client peut faire grimper la
    // facture sans que personne ne s'en apercoive.
    const PLAFOND = 24
    if (deja >= PLAFOND) {
      return res.status(409).json({
        message: `« ${skill} » a deja ${deja} exercices, c'est le plafond. `
          + 'De quoi tenir plusieurs semaines de revisions espacees.',
      })
    }

    // On situe la competence dans SON metier : « Suivi » ou « Qualite »
    // ne veut rien dire hors contexte.
    let contexte = { poste: '', entreprise: '', extrait: '' }
    const p = q('SELECT * FROM parcours WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(uid)
      .find((row) => JSON.parse(row.competences).some((c) => c.nom === skill))
    if (p) {
      contexte.poste = p.titre
      contexte.entreprise = p.entreprise
      if (p.offre_id) {
        const o = q('SELECT notes FROM offres WHERE id = ?').get(p.offre_id)
        if (o) contexte.extrait = o.notes
      }
    }

    try {
      const r = await gen.generer(skill, contexte, req.body?.combien)
      if (!r.exercices.length) {
        return res.status(502).json({
          message: 'Aucun exercice n a passe la verification.',
          rejets: r.rejets,
        })
      }
      const slug = cur.slug(skill)
      let n = deja
      const gardes = []
      for (const ex of r.exercices) {
        if (n >= PLAFOND) break
        n += 1
        const id = slug + '-ia-' + n
        const corps = { ...ex, id, skill, origine: 'genere' }
        q(`INSERT INTO exercices_generes (id, skill, type, corps, modele, cree_par)
           VALUES (?,?,?,?,?,?)`)
          .run(id, skill, ex.type, JSON.stringify(corps), r.modele, uid)
        gardes.push({ id, type: ex.type })
      }
      res.json({
        skill,
        ajoutes: gardes.length,
        total: compteGeneres(skill),
        types: gardes.map((g) => g.type),
        // On dit ce qui a ete refuse : un generateur qui cache ses rebuts
        // laisse croire qu'il ne se trompe jamais.
        rejetes: r.rejets,
        modele: r.modele,
        usage: r.usage,
      })
    } catch (e) {
      if (e.nonConfigure) return res.status(501).json({ message: e.message, non_configure: true })
      if (e.refus) return res.status(422).json({ message: e.message })
      // Les erreurs du SDK portent un statut : on ne le maquille pas en 500.
      const statut = e.status && e.status >= 400 && e.status < 600 ? e.status : 502
      return res.status(statut).json({
        message: 'La generation a echoue : ' + (e.message || 'raison inconnue'),
      })
    }
  })

  // ---- la seance : 7 exercices choisis, pas tires au hasard -------------
  const TAILLE_SEANCE = 7

  function choisirExercices(uid, skills, taille) {
    const aujourdhui = jour()
    const dejaVus = new Map()
    for (const r of q('SELECT exercice_id, correct, created_at FROM reponses WHERE user_id = ? ORDER BY id DESC LIMIT 500').all(uid)) {
      if (!dejaVus.has(r.exercice_id)) dejaVus.set(r.exercice_id, r)
    }
    const comps = new Map(q('SELECT * FROM competences WHERE user_id = ?').all(uid).map((c) => [c.skill, c]))

    const pool = []
    for (const s of skills) {
      const c = comps.get(s)
      const du = Boolean(c && c.a_revoir_le && c.a_revoir_le <= aujourdhui)
      for (const ex of exercicesDe(s)) {
        const vu = dejaVus.get(ex.id)
        let priorite
        if (!vu) priorite = 2                      // jamais fait : le coeur de l'apprentissage
        else if (!vu.correct) priorite = 1         // rate : a refaire en premier
        else if (du) priorite = 3                  // réussi mais la compétence est due
        else priorite = 9                          // réussi et pas du : on évite
        pool.push({ ex, priorite })
      }
    }
    // TOURNIQUET ENTRE COMPETENCES (13/08/2026).
    //
    // Un simple tri par priorité donnait une seance entière sur une seule
    // compétence : tous les exercices jamais faits ont la même priorité, et
    // l'ordre du tableau les groupait par compétence. Mesure sur le parcours
    // « Principal AI Engineering Architect » : les 4 premiers exercices
    // tombaient sur Communication et Cloud, et AWS n'arrivait qu'en 5e.
    //
    // Une seance doit balayer le poste, pas une case du poste. On distribue
    // donc a tour de rôle : d'abord un exercice par compétence, puis un
    // deuxieme, etc. — en respectant la priorité a l'intérieur de chacune.
    const files = new Map()
    for (const p of pool) {
      if (!files.has(p.ex.skill)) files.set(p.ex.skill, [])
      files.get(p.ex.skill).push(p)
    }
    for (const f of files.values()) f.sort((a, b) => a.priorite - b.priorite)

    // Les compétences les plus en retard passent en premier dans le tour.
    const ordre = [...files.keys()].sort((a, b) => {
      const pa = files.get(a)[0].priorite, pb = files.get(b)[0].priorite
      return pa - pb
    })

    const choisis = []
    let tour = 0
    while (choisis.length < taille && tour < 12) {
      let ajouteCeTour = 0
      for (const s of ordre) {
        if (choisis.length >= taille) break
        const f = files.get(s)
        if (!f.length) continue
        // Priorité 9 = déjà réussi et pas encore du : on n'en met qu'en
        // dernier recours, pour ne pas faire réviser ce qui est acquis.
        if (f[0].priorite === 9 && tour < 2) continue
        choisis.push(f.shift().ex)
        ajouteCeTour++
      }
      if (!ajouteCeTour) break
      tour++
    }
    return choisis
  }

  // L'énoncé envoye au client ne contient JAMAIS la réponse.
  // Sinon la correction se lit dans l'onglet réseau, et la note ne vaut rien.
  function sansReponse(ex) {
    const o = {
      id: ex.id, skill: ex.skill, type: ex.type,
      question: ex.question, enonce: ex.enonce, situation: ex.situation,
      unite: ex.unite,
    }
    if (ex.type === 'qcm') o.choix = ex.choix
    if (ex.type === 'arbitrage') o.options = ex.options
    if (ex.type === 'design' || ex.type === 'star') o.nb_criteres = ex.grille.length
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
    return o
  }

  app.get('/api/seance', requireAuth, (req, res) => {
    const uid = req.auth.profile.id
    const r = rythme(uid)
    let skills = []
    if (req.query.parcours_id) {
      const p = q('SELECT * FROM parcours WHERE id = ? AND user_id = ?').get(req.query.parcours_id, uid)
      if (!p) return res.status(404).json({ message: 'Parcours introuvable' })
      skills = JSON.parse(p.competences).map((c) => c.nom)
    } else if (req.query.skill) {
      skills = [cur.normaliser(String(req.query.skill))]
    } else {
      const p = q('SELECT * FROM parcours WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(uid)
      skills = p ? JSON.parse(p.competences).map((c) => c.nom) : cur.competencesConnues().slice(0, 4)
    }
    const taille = Math.max(1, Math.min(20, Number(req.query.taille) || TAILLE_SEANCE))
    const ex = choisirExercices(uid, skills, taille)
    res.json({
      exercices: ex.map(sansReponse),
      coeurs: r.coeurs, serie: r.serie,
      objectif_xp: r.objectif_xp, xp_du_jour: r.xp_du_jour,
      // On ne bloque pas : sans coeur, les exercices notes sur grille restent
      // ouverts. Punir l'apprenant en l'empechant de travailler serait absurde.
      sans_coeur: r.coeurs <= 0,
    })
  })

  // ---- la réponse : correction, XP, SRS, série -------------------------
  // Retrouver un exercice dans la banque a partir de son identifiant.
  // JAMAIS depuis le corps de la requete : le client ne doit pas pouvoir se
  // fabriquer un exercice, ni se noter lui-meme.
  function trouverExercice(uid, exId) {
    for (const s of cur.competencesConnues()) {
      const t = exercicesDe(s).find((e) => e.id === exId)
      if (t) return t
    }
    // Exercice generique : sa competence n'est pas dans la banque, on la
    // retrouve par les parcours de l'utilisateur.
    const p = q('SELECT * FROM parcours WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(uid)
    for (const row of p) {
      for (const c of JSON.parse(row.competences)) {
        const t = exercicesDe(c.nom).find((e) => e.id === exId)
        if (t) return t
      }
    }
    return null
  }

  // LA GRILLE DU JURY (ajoute le 13/08/2026).
  //
  // Les exercices de type design et star se notent sur grille : l'apprenant
  // repond a voix haute, PUIS decouvre les criteres et coche honnetement ce
  // qu'il a reellement dit.
  //
  // La premiere version n'envoyait jamais le texte des criteres. L'ecran
  // affichait « Critere 1 » a « Critere 5 », des cases a cocher sans
  // libelle : impossible de s'auto-evaluer contre des criteres invisibles.
  // L'exercice etait inutilisable.
  //
  // La grille n'est donc PAS dans la seance — sinon on la lit avant de
  // reflechir, et on recopie au lieu de chercher — mais elle se demande, au
  // moment ou l'apprenant declare avoir repondu. C'est lui qui decide quand
  // lever le voile ; l'honnetete de l'auto-evaluation lui appartient.
  app.get('/api/seance/grille', requireAuth, (req, res) => {
    const ex = trouverExercice(req.auth.profile.id, String(req.query.exercice_id || ''))
    if (!ex) return res.status(404).json({ message: 'Exercice inconnu' })
    if (ex.type !== 'design' && ex.type !== 'star') {
      return res.status(400).json({ message: 'Cet exercice ne se note pas sur grille.' })
    }
    res.json({
      exercice_id: ex.id,
      grille: ex.grille,
      seuil: ex.seuil || Math.ceil(ex.grille.length / 2),
    })
  })

  app.post('/api/seance/reponse', requireAuth, (req, res) => {
    const uid = req.auth.profile.id
    const exId = String(req.body?.exercice_id || '')
    if (!exId) return res.status(400).json({ message: 'exercice_id requis' })

    const ex = trouverExercice(uid, exId)
    if (!ex) return res.status(404).json({ message: 'Exercice inconnu' })

    const r = rythme(uid)
    const res_ = corriger(ex, req.body?.reponse)
    const c = competence(uid, ex.skill)

    // XP : la base du type, multipliee par la note, avec bonus d'enchainement.
    // L'enchainement plafonné a x2 : au-dela, il recompense la vitesse plutôt
    // que la comprehension, et pousse a cliquer sans lire.
    const combo = res_.correct ? Math.min(r.combo + 1, 10) : 0
    const mult = 1 + Math.min(combo, 10) * 0.1
    let xp = Math.round((XP_BASE[ex.type] || 10) * (res_.note / 100) * mult)
    if (xp < 0) xp = 0

    // SRS
    const srs = majSRS(c, res_.qualite)
    q(`UPDATE competences SET reussites = reussites + ?, echecs = echecs + ?,
        facilite = ?, intervalle = ?, repetitions = ?,
        meilleure_serie = MAX(meilleure_serie, ?),
        a_revoir_le = ?, maj = datetime('now')
       WHERE user_id = ? AND skill = ?`)
      .run(res_.correct ? 1 : 0, res_.correct ? 0 : 1, srs.facilite, srs.intervalle,
        srs.repetitions, srs.repetitions, srs.a_revoir_le, uid, ex.skill)

    // Le registre AVANT le point : c'est la règle.
    q(`INSERT INTO reponses (user_id, exercice_id, skill, type, correct, note, reponse, duree_ms, xp)
       VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(uid, ex.id, ex.skill, ex.type, res_.correct ? 1 : 0, res_.note,
        JSON.stringify(req.body?.reponse ?? null), Number(req.body?.duree_ms) || 0, xp)

    if (xp > 0) {
      q('INSERT INTO xp_events (user_id, amount, reason) VALUES (?,?,?)')
        .run(uid, xp, `${ex.type} · ${ex.skill} · ${ex.id}`)
      q('UPDATE profiles SET xp = xp + ? WHERE id = ?').run(xp, uid)
    }

    // Coeurs : on n'en perd que sur les exercices a réponse unique.
    let coeurs = r.coeurs
    if (!res_.correct && (ex.type === 'qcm' || ex.type === 'chiffre' || ex.type === 'arbitrage')) {
      coeurs = Math.max(0, coeurs - 1)
      q('UPDATE rythme SET coeurs = ?, coeurs_maj = ? WHERE user_id = ?')
        .run(coeurs, new Date().toISOString(), uid)
    }

    // Série et objectif du jour
    const aujourdhui = jour()
    const xpJour = r.xp_du_jour + xp
    let serie = r.serie, record = r.record, dernier = r.dernier_jour
    const atteintAvant = r.xp_du_jour >= r.objectif_xp
    const atteintMaintenant = xpJour >= r.objectif_xp
    let serieGagnee = false
    if (atteintMaintenant && !atteintAvant) {
      // La série ne s'incremente qu'une fois par jour, a l'atteinte de l'objectif.
      if (dernier !== aujourdhui) {
        serie = dernier === ajouterJours(aujourdhui, -1) ? serie + 1 : 1
        dernier = aujourdhui
        if (serie > record) record = serie
        serieGagnee = true
        // Un gel gagne tous les 5 jours de série : il sauve un jour manque.
        if (serie % 5 === 0) q('UPDATE rythme SET gels = MIN(gels + 1, 3) WHERE user_id = ?').run(uid)
      }
    }
    q('UPDATE rythme SET xp_du_jour = ?, combo = ?, serie = ?, record = ?, dernier_jour = ? WHERE user_id = ?')
      .run(xpJour, combo, serie, record, dernier, uid)

    const compMaj = q('SELECT * FROM competences WHERE user_id = ? AND skill = ?').get(uid, ex.skill)
    const niveauApres = niveauDe(compMaj)

    res.json({
      correct: res_.correct,
      note: res_.note,
      attendu: res_.attendu,
      coches: res_.coches, total: res_.total,
      pourquoi: ex.pourquoi,
      grille: (ex.type === 'design' || ex.type === 'star') ? ex.grille : undefined,
      xp, combo,
      coeurs,
      serie, serie_gagnee: serieGagnee,
      xp_du_jour: xpJour, objectif_xp: r.objectif_xp,
      objectif_atteint: atteintMaintenant,
      skill: ex.skill,
      niveau: niveauApres,
      a_revoir_le: srs.a_revoir_le,
      quartier_gagne: niveauApres >= 3 && niveauDe(c) < 3 ? ex.skill : null,
    })
  })

  // ---- objectif quotidien reglable -------------------------------------
  app.post('/api/moi/objectif', requireAuth, (req, res) => {
    const n = Math.max(10, Math.min(500, Number(req.body?.objectif_xp) || 50))
    q('UPDATE rythme SET objectif_xp = ? WHERE user_id = ?').run(n, req.auth.profile.id)
    res.json({ objectif_xp: n })
  })

  // ---- la carte du Royaume (couche 2D) ---------------------------------
  // Chaque compétence du parcours devient un batiment. Le niveau atteint
  // décide de l'aspect du batiment : une ruine devient une forteresse.
  app.get('/api/royaume/carte', requireAuth, (req, res) => {
    const uid = req.auth.profile.id
    const r = rythme(uid)
    let p = null
    if (req.query.parcours_id) p = q('SELECT * FROM parcours WHERE id = ? AND user_id = ?').get(req.query.parcours_id, uid)
    if (!p) p = q('SELECT * FROM parcours WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(uid)

    const skills = p ? JSON.parse(p.competences).map((c) => c.nom) : cur.competencesConnues().slice(0, 6)
    const comps = new Map(q('SELECT * FROM competences WHERE user_id = ?').all(uid).map((c) => [c.skill, c]))
    const aujourdhui = jour()

    // Placement en anneau autour de la place centrale : lisible, stable
    // (le même parcours redonne la même carte), et sans chevauchement.
    const centre = { x: 20, y: 12 }
    const batiments = skills.map((s, i) => {
      const c = comps.get(s)
      const n = niveauDe(c)
      const angle = (i / Math.max(1, skills.length)) * Math.PI * 2 - Math.PI / 2
      const rayon = 8 + (i % 2) * 3
      return {
        skill: s,
        x: Math.round(centre.x + Math.cos(angle) * rayon),
        y: Math.round(centre.y + Math.sin(angle) * rayon * 0.62),
        niveau: n,
        reussites: c ? c.reussites : 0,
        echecs: c ? c.echecs : 0,
        du: Boolean(c && c.a_revoir_le && c.a_revoir_le <= aujourdhui),
        nb_exercices: exercicesDe(s).length,
        couvert: cur.aUneBanque(s) || compteGeneres(s) > 0,
      }
    })

    res.json({
      parcours: p ? { id: p.id, titre: p.titre, entreprise: p.entreprise, pays: p.pays, salaire: p.salaire } : null,
      centre,
      batiments,
      joueur: { serie: r.serie, coeurs: r.coeurs, coeurs_max: COEUR_MAX, xp_du_jour: r.xp_du_jour, objectif_xp: r.objectif_xp },
      blason: blason(uid),
    })
  })

  return { lireContexteUS, construireParcours, niveauDe, majSRS, corriger }
}

module.exports = { installer, lireContexteUS, construireParcours, majSRS, niveauDe, corriger, SCHEMA }
