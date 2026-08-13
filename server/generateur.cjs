/**
 * Blason — le générateur d'exercices, tous domaines.
 *
 * POURQUOI CE FICHIER EXISTE (13/08/2026)
 *
 * curriculum.cjs contient 46 exercices écrits à la main, tous sur
 * l'architecture cloud et IA. Mesure sur quatre annonces réelles : 100 % de
 * contenu sur mesure pour un poste d'architecte IA, 17 % pour un poste
 * d'architecte ERP. Blason est public sur GitHub — un commercial, un
 * comptable, une infirmière qui l'installent n'auraient que la fiche
 * générique. Un outil d'apprentissage qui ne couvre qu'un métier n'aide
 * qu'une personne.
 *
 * Écrire à la main une banque par métier n'est pas tenable. Ce fichier
 * délègue donc l'écriture à un modèle qui raisonne, QUAND une clé est
 * configurée. Sans clé, rien ne change : banques écrites à la main, puis
 * fiche générique. Le zéro-clé reste le mode par défaut et il fonctionne.
 *
 * TROIS PRINCIPES
 *
 * 1. ON NE FAIT PAS CONFIANCE À LA SORTIE. Les exercices sont contraints par
 *    un schéma (sorties structurées), PUIS revérifiés ici, champ par champ.
 *    Un exercice mal formé est rejeté, pas rafistolé : un QCM dont l'indice
 *    de bonne réponse pointe hors des choix noterait faux tout le monde.
 * 2. ON NE PAIE QU'UNE FOIS. Le résultat est écrit en base et réutilisé.
 *    Générer à chaque séance coûterait cher et donnerait un contenu
 *    instable — on ne peut pas réviser ce qui change à chaque passage.
 * 3. ON DIT CE QUI VIENT D'OÙ. Chaque exercice généré porte sa provenance,
 *    affichée à l'utilisateur. Du contenu écrit par une machine ne se fait
 *    pas passer pour du contenu relu par un humain.
 */
const Anthropic = require('@anthropic-ai/sdk')

// Le SDK exporte la classe en `default` sous CommonJS.
const Client = Anthropic.default || Anthropic

// ---------------------------------------------------------------------------
// CHAQUE UTILISATEUR SA CLÉ (corrigé le 13/08/2026)
//
// La première version lisait BLASON_IA_CLE dans l'environnement du serveur.
// Sur une instance publique — et Blason en est une — cela veut dire UNE SEULE
// clé pour tout le monde : n'importe qui crée un compte et consomme le crédit
// du propriétaire du serveur. Ce n'est pas une option de configuration
// discutable, c'est un trou.
//
// La clé vient donc de l'appelant, qui la tient du compte de l'utilisateur
// (chiffrée au repos, voir moteur.cjs). Le serveur n'en détient aucune.
//
// UNE SEULE exception, explicite et fermée par défaut : une installation
// personnelle mono-utilisateur peut poser BLASON_IA_CLE **et**
// BLASON_IA_CLE_PARTAGEE=oui. Il faut les DEUX. Une clé seule ne suffit pas,
// précisément pour qu'on ne partage jamais son crédit par inadvertance en
// recopiant une ligne de configuration.
// ---------------------------------------------------------------------------
const MODELE = process.env.BLASON_IA_MODELE || 'claude-opus-5'
const CLE_PARTAGEE =
  process.env.BLASON_IA_CLE_PARTAGEE === 'oui'
    ? (process.env.BLASON_IA_CLE || process.env.ANTHROPIC_API_KEY || '')
    : ''

// La clé de secours vaut pour tout le monde : on ne la sert que si elle a été
// explicitement partagée.
function cleDeSecours() {
  return CLE_PARTAGEE
}

// Un client par clé, gardé en mémoire : reconstruire un client à chaque appel
// jetterait le pool de connexions. La Map est bornée — sur une instance
// publique, un client par compte finirait par peser.
const clients = new Map()
const CLIENTS_MAX = 50
function obtenirClient(cle) {
  if (!cle) {
    const e = new Error(
      "Aucune clé d'API pour ce compte. Renseigne la tienne dans ton profil : "
      + "elle reste chiffrée, n'est jamais renvoyée, et seule TA clé paie TES "
      + 'générations. Sans clé, Blason fonctionne en génération simple.',
    )
    e.nonConfigure = true
    throw e
  }
  let c = clients.get(cle)
  if (!c) {
    if (clients.size >= CLIENTS_MAX) clients.delete(clients.keys().next().value)
    c = new Client({ apiKey: cle })
    clients.set(cle, c)
  }
  return c
}

// ---------------------------------------------------------------------------
// Le schéma de sortie.
//
// C'est lui qui garantit la FORME. Les sorties structurées contraignent le
// modèle au schéma côté serveur d'Anthropic : on ne reçoit pas du JSON à
// parser en croisant les doigts. La vérification métier reste faite ici.
// ---------------------------------------------------------------------------
const SCHEMA = {
  type: 'object',
  properties: {
    exercices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['qcm', 'chiffre', 'arbitrage', 'design', 'star'] },
          question: { type: 'string' },
          situation: { type: 'string' },
          enonce: { type: 'string' },
          choix: { type: 'array', items: { type: 'string' } },
          bonne: { type: 'integer' },
          options: { type: 'array', items: { type: 'string' } },
          recommande: { type: 'integer' },
          reponse: { type: 'number' },
          tolerance: { type: 'number' },
          unite: { type: 'string' },
          grille: { type: 'array', items: { type: 'string' } },
          seuil: { type: 'integer' },
          pourquoi: { type: 'string' },
        },
        required: ['type', 'pourquoi'],
        additionalProperties: false,
      },
    },
  },
  required: ['exercices'],
  additionalProperties: false,
}

// ---------------------------------------------------------------------------
// La consigne.
//
// Elle est STABLE et volumineuse : elle est donc marquée pour la mise en
// cache. Seul le nom de la compétence change d'un appel à l'autre, et il est
// placé APRÈS — le préfixe stable se relit à un dixième du prix.
// ---------------------------------------------------------------------------
const CONSIGNE = `Tu écris des exercices d'entraînement pour Blason, une application qui
transforme une offre d'emploi en parcours d'apprentissage. L'utilisateur
prépare un entretien d'embauche sur une compétence précise.

Le métier peut être N'IMPORTE LEQUEL : commerce, comptabilité, soin,
logistique, droit, artisanat, enseignement, industrie, informatique. N'écris
pas des exercices d'informatique pour un métier qui n'en est pas.

CINQ FAMILLES D'EXERCICES. Utilise-les selon ce que la compétence permet.

- "qcm" : rappel rapide. Champs : question, choix (3 à 5), bonne (indice
  0-based de la bonne réponse dans choix), pourquoi.
- "chiffre" : un ordre de grandeur à connaître. Champs : question, reponse
  (nombre), tolerance (écart accepté, 0 si la valeur est exacte), unite,
  pourquoi. N'invente JAMAIS un chiffre : n'utilise que des valeurs
  structurelles, réglementaires ou arithmétiques vérifiables. Si aucun
  chiffre fiable n'existe pour cette compétence, n'écris pas d'exercice de
  ce type.
- "arbitrage" : un choix professionnel à justifier. Champs : situation
  (le cas, 2 à 4 phrases), options (3 ou 4), recommande (indice 0-based),
  pourquoi.
- "design" : une épreuve de conception ou de méthode, notée sur grille.
  Champs : enonce, grille (4 à 8 critères que le jury coche), seuil
  (nombre de critères à atteindre, environ 60 % de la grille), pourquoi.
- "star" : comportemental, noté sur grille. Champs : question, grille
  (4 à 6 critères), seuil, pourquoi.

RÈGLES DE FOND, elles comptent plus que la forme :

1. Le "pourquoi" est la partie la plus importante. Il n'annonce pas la bonne
   réponse : il explique ce que la question révèle, pourquoi un
   professionnel expérimenté répond ainsi, et quelle erreur fréquente elle
   attrape. Trois à cinq phrases. Une correction sans explication sanctionne,
   elle n'enseigne pas.
2. Vise ce qui distingue quelqu'un qui a PRATIQUÉ de quelqu'un qui a LU.
   Les cas limites, les arbitrages coûteux, les pannes réelles, ce qu'on
   évite. Pas les définitions de manuel.
3. Les mauvaises réponses d'un QCM doivent être plausibles — des erreurs que
   des gens commettent réellement, pas des absurdités qui se repèrent sans
   rien connaître.
4. Écris en français, dans la langue du métier concerné, sans jargon inutile
   et sans anglicismes quand un mot français existe.
5. N'invente aucune donnée chiffrée, aucune loi, aucune norme dont tu n'es
   pas sûr. Dans le doute, pose la question autrement.

Réponds uniquement selon le schéma fourni.`

// ---------------------------------------------------------------------------
// Vérification — on ne fait pas confiance, on contrôle.
// ---------------------------------------------------------------------------
const TEXTE_MAX = 1200
const estTexte = (v, min) => typeof v === 'string' && v.trim().length >= (min || 12) && v.length <= TEXTE_MAX

function verifier(ex) {
  const rejets = []
  const T = (v, min) => estTexte(v, min)

  if (!T(ex.pourquoi, 60)) rejets.push('le « pourquoi » est absent ou trop court')

  if (ex.type === 'qcm') {
    if (!T(ex.question)) rejets.push('question absente')
    if (!Array.isArray(ex.choix) || ex.choix.length < 3 || ex.choix.length > 6) rejets.push('il faut 3 à 6 choix')
    else if (!ex.choix.every((c) => T(c, 3))) rejets.push('un choix est vide ou trop long')
    // LE CONTRÔLE QUI COMPTE : un indice hors bornes noterait faux tout le
    // monde, en silence, pour toujours.
    if (!Number.isInteger(ex.bonne) || ex.bonne < 0 || ex.bonne >= (ex.choix || []).length)
      rejets.push('l indice de bonne réponse ne pointe sur aucun choix')
  } else if (ex.type === 'arbitrage') {
    if (!T(ex.situation, 40)) rejets.push('situation absente ou trop courte')
    if (!Array.isArray(ex.options) || ex.options.length < 3 || ex.options.length > 5) rejets.push('il faut 3 à 5 options')
    else if (!ex.options.every((c) => T(c, 3))) rejets.push('une option est vide ou trop longue')
    if (!Number.isInteger(ex.recommande) || ex.recommande < 0 || ex.recommande >= (ex.options || []).length)
      rejets.push('l indice recommandé ne pointe sur aucune option')
  } else if (ex.type === 'chiffre') {
    if (!T(ex.question)) rejets.push('question absente')
    if (typeof ex.reponse !== 'number' || !Number.isFinite(ex.reponse)) rejets.push('la réponse n est pas un nombre')
    if (ex.tolerance !== undefined && (typeof ex.tolerance !== 'number' || ex.tolerance < 0))
      rejets.push('tolérance invalide')
    if (!T(ex.unite, 1)) rejets.push('unité absente')
  } else if (ex.type === 'design' || ex.type === 'star') {
    const enonce = ex.type === 'design' ? ex.enonce : ex.question
    if (!T(enonce, 40)) rejets.push('énoncé absent ou trop court')
    if (!Array.isArray(ex.grille) || ex.grille.length < 3 || ex.grille.length > 10) rejets.push('il faut 3 à 10 critères')
    else if (!ex.grille.every((c) => T(c, 10))) rejets.push('un critère est vide ou trop long')
    // Un seuil supérieur au nombre de critères rend l exercice impossible.
    if (!Number.isInteger(ex.seuil) || ex.seuil < 1 || ex.seuil > (ex.grille || []).length)
      rejets.push('le seuil est hors de la grille')
  } else {
    rejets.push('type inconnu : ' + ex.type)
  }
  return rejets
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------
/**
 * Écrit des exercices pour une compétence, quel que soit le domaine.
 *
 * @param {string} competence  ce que l'annonce demande (« Négociation
 *                             commerciale », « Paie », « Soins palliatifs »…)
 * @param {object} contexte    {poste, entreprise, extrait} — situe la
 *                             compétence dans SON métier. Sans lui, « Suivi »
 *                             ou « Qualité » pourrait signifier n'importe quoi.
 * @param {number} combien     nombre d'exercices visé (borné 3–8)
 */
async function generer(cle, competence, contexte, combien) {
  if (!cle) {
    const e = new Error(
      "La génération n'est pas configurée : aucune clé d'API. "
      + "Renseigne la tienne dans ton profil — elle reste chiffrée et n'est jamais renvoyée. "
      + 'Sans clé, Blason continue en génération simple : banques écrites à la main et fiche générique.',
    )
    e.nonConfigure = true
    throw e
  }
  const n = Math.max(3, Math.min(8, Number(combien) || 6))
  const c = contexte || {}

  // Le contexte du poste est placé APRÈS la consigne mise en cache : le
  // préfixe stable reste identique d'un appel à l'autre, seule la fin change.
  const demande = [
    `Compétence à travailler : « ${competence} »`,
    c.poste ? `Poste visé : ${c.poste}` : null,
    c.entreprise ? `Entreprise : ${c.entreprise}` : null,
    c.extrait
      ? `Extrait de l'annonce, pour situer la compétence dans son métier :\n"""\n${String(c.extrait).slice(0, 2500)}\n"""`
      : null,
    '',
    `Écris ${n} exercices sur cette compétence, en variant les familles.`,
    'Si la compétence ne se prête pas à un ordre de grandeur fiable, omets ce type plutôt que d inventer un chiffre.',
  ].filter(Boolean).join('\n')

  const reponse = await obtenirClient(cle).messages.create({
    model: MODELE,
    max_tokens: 16000,
    // Pensée adaptative : ces exercices demandent de raisonner sur un métier,
    // pas de recopier un gabarit. C'est le défaut sur ce modèle ; on le pose
    // explicitement pour que l'intention soit lisible.
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    system: [
      // Préfixe stable → mis en cache. Relire coûte environ un dixième.
      { type: 'text', text: CONSIGNE, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: demande }],
  })

  // Un refus se présente en HTTP 200 : on le lit AVANT le contenu, sinon on
  // déréférence un tableau vide.
  if (reponse.stop_reason === 'refusal') {
    const e = new Error(
      'Le modèle a décliné cette demande'
      + (reponse.stop_details && reponse.stop_details.category
        ? ` (motif : ${reponse.stop_details.category})` : '')
      + '. Reformule la compétence, ou écris ces exercices à la main.',
    )
    e.refus = true
    throw e
  }
  if (reponse.stop_reason === 'max_tokens') {
    throw new Error('Réponse tronquée : réessaie avec moins d exercices.')
  }

  const bloc = reponse.content.find((b) => b.type === 'text')
  if (!bloc) throw new Error('Réponse vide du modèle.')
  let brut
  try {
    brut = JSON.parse(bloc.text)
  } catch (e) {
    throw new Error('La réponse du modèle n est pas du JSON exploitable.')
  }

  const gardes = []
  const rejets = []
  for (const ex of brut.exercices || []) {
    const problemes = verifier(ex)
    if (problemes.length) { rejets.push({ type: ex.type, problemes }); continue }
    gardes.push(ex)
  }

  return {
    exercices: gardes,
    rejets,
    usage: {
      entree: reponse.usage.input_tokens,
      sortie: reponse.usage.output_tokens,
      cache_ecrit: reponse.usage.cache_creation_input_tokens || 0,
      cache_lu: reponse.usage.cache_read_input_tokens || 0,
    },
    modele: reponse.model,
  }
}

// ---------------------------------------------------------------------------
// LIRE LES COMPÉTENCES D'UNE ANNONCE, TOUS MÉTIERS (13/08/2026)
//
// extraireCompetences() dans index.cjs compte des mots-clés d'une liste écrite
// à la main. Cette liste ne contient que de l'informatique. Mesure sur une
// annonce de commercial terrain B2B — négociation grands comptes, prospection,
// recouvrement, animation d'un réseau de distributeurs : la liste en tire
// exactement UNE compétence, « Communication ».
//
// Générer des exercices pour n'importe quel métier ne sert donc à rien si
// l'étape d'avant ne sait pas lire le métier. Aucune liste de mots-clés ne
// couvrira jamais tous les métiers : quand une clé est là, on demande au
// modèle. Sinon, on garde le comptage pondéré, qui reste correct sur les
// annonces techniques.
// ---------------------------------------------------------------------------
const SCHEMA_COMPETENCES = {
  type: 'object',
  properties: {
    metier: { type: 'string' },
    competences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          pourquoi: { type: 'string' },
          centrale: { type: 'boolean' },
        },
        required: ['nom', 'pourquoi', 'centrale'],
        additionalProperties: false,
      },
    },
  },
  required: ['metier', 'competences'],
  additionalProperties: false,
}

const CONSIGNE_COMPETENCES = `Tu lis une offre d'emploi et tu en extrais les compétences que le poste
exige VRAIMENT — celles sur lesquelles un entretien va porter.

Le métier peut être n'importe lequel : commerce, comptabilité, soin,
logistique, droit, artisanat, enseignement, industrie, informatique.

RÈGLES :

1. Six à huit compétences, pas plus. Au-delà, on dilue.
2. Nomme-les comme le métier les nomme, en français, en deux ou trois mots :
   « Négociation grands comptes », « Clôture comptable », « Soins palliatifs ».
   Pas de phrase, pas de verbe conjugué.
3. Ne retiens que ce que l'annonce demande RÉELLEMENT. Une annonce répète
   souvent des mots creux (« rigueur », « dynamisme », « esprit d'équipe ») :
   ne les retiens que si l'annonce en fait un vrai attendu du poste, décrit.
4. Distingue le central de l'accessoire : « centrale » est vrai pour ce qui
   fait le cœur du poste, faux pour ce qui est secondaire ou souhaité.
5. « pourquoi » cite ce qui, dans l'annonce, justifie cette compétence —
   quelques mots, en t'appuyant sur le texte, sans le recopier en entier.
6. N'invente rien. Si l'annonce est trop courte pour dire quoi que ce soit,
   rends une liste courte plutôt qu'une liste inventée.

Réponds uniquement selon le schéma fourni.`

/**
 * Extrait les compétences d'une annonce, quel que soit le métier.
 * Lève une erreur si aucune clé n'est configurée — l'appelant retombe alors
 * sur le comptage pondéré de mots-clés.
 */
async function extraireIA(cle, texte, titre) {
  if (!cle) {
    const e = new Error('Génération non configurée')
    e.nonConfigure = true
    throw e
  }
  const reponse = await obtenirClient(cle).messages.create({
    model: MODELE,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    output_config: {
      // Lire une annonce est moins exigeant qu'écrire des exercices : un
      // effort moyen suffit, et coûte nettement moins.
      effort: 'medium',
      format: { type: 'json_schema', schema: SCHEMA_COMPETENCES },
    },
    system: [
      { type: 'text', text: CONSIGNE_COMPETENCES, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{
      role: 'user',
      content: (titre ? `Intitulé : ${titre}\n\n` : '')
        + `Annonce :\n"""\n${String(texte).slice(0, 20000)}\n"""`,
    }],
  })

  if (reponse.stop_reason === 'refusal') {
    const e = new Error('Le modèle a décliné la lecture de cette annonce.')
    e.refus = true
    throw e
  }
  const bloc = reponse.content.find((b) => b.type === 'text')
  if (!bloc) throw new Error('Réponse vide du modèle.')
  const brut = JSON.parse(bloc.text)

  // On revérifie : des noms vides ou à rallonge casseraient l'affichage et
  // les identifiants d'exercices.
  const noms = []
  for (const c of brut.competences || []) {
    const nom = String(c.nom || '').trim()
    if (nom.length < 2 || nom.length > 60) continue
    if (noms.some((x) => x.nom.toLowerCase() === nom.toLowerCase())) continue
    noms.push({ nom, pourquoi: String(c.pourquoi || '').slice(0, 300), centrale: Boolean(c.centrale) })
  }
  // Les compétences centrales d'abord : la séance doit balayer le cœur du
  // poste avant ses à-côtés.
  noms.sort((a, b) => Number(b.centrale) - Number(a.centrale))

  return {
    metier: String(brut.metier || '').slice(0, 120),
    competences: noms.slice(0, 8),
    usage: {
      entree: reponse.usage.input_tokens,
      sortie: reponse.usage.output_tokens,
      cache_lu: reponse.usage.cache_read_input_tokens || 0,
    },
  }
}

module.exports = { generer, extraireIA, verifier, cleDeSecours, obtenirClient, MODELE }
