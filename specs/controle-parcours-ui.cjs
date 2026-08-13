/**
 * Blason — controle du parcours depuis l'interface.
 *
 * Le moteur savait lire une annonce depuis le premier jour, mais l'endpoint
 * n'etait appelable qu'en ligne de commande : le Royaume disait « genere un
 * parcours » sans qu'aucun bouton ne le permette. Ce controle verifie la
 * chaine telle qu'un utilisateur la vit :
 *
 *   fiche d'une offre -> bouton « Generer le parcours » -> competences
 *   reelles + fiche « pret pour les USA » -> entree dans le Royaume.
 *
 * Prerequis : chromedriver sur 9515, et BLASON_TEST_EMAIL / BLASON_TEST_MDP.
 */
const DRIVER = 'http://127.0.0.1:9515'
const SITE = 'http://localhost:8088'
const fs = require('node:fs')

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
let sid = null
const S = (p) => '/session/' + sid + p

async function wd(m, c, b) {
  const r = await fetch(DRIVER + c, {
    method: m, headers: { 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (j.value && j.value.error) throw new Error(j.value.error + ' — ' + (j.value.message || '').slice(0, 220))
  return j.value
}
const evaluer = (script) => wd('POST', S('/execute/sync'), { script, args: [] })
const bloc = (t) => console.log('\n── ' + t)
const ligne = (k, v) => console.log('   ' + String(k).padEnd(20), v)

async function main() {
  const email = process.env.BLASON_TEST_EMAIL
  const mdp = process.env.BLASON_TEST_MDP
  if (!email || !mdp) throw new Error('Renseigne BLASON_TEST_EMAIL et BLASON_TEST_MDP.')

  const cx = await fetch(SITE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: mdp }),
  }).then((r) => r.json())
  if (!cx.access_token) throw new Error('connexion impossible')
  const A = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cx.access_token }

  // Une offre NEUVE, pour tomber sur le cas « pas encore de parcours ».
  const texte = fs.readFileSync('/tmp/offre-anthropic-enterprise-tech.txt', 'utf8')
  const cree = await fetch(SITE + '/api/from/offres', {
    method: 'POST', headers: A,
    body: JSON.stringify({
      titre: 'Applied AI Architect, Enterprise Tech',
      entreprise: 'Anthropic', url: 'https://job-boards.greenhouse.io/anthropic/jobs/5383335008',
      domaine: 'ia-agents', statut: 'nouvelle', notes: texte,
    }),
  }).then((r) => r.json())
  const offreId = cree.id || (cree[0] && cree[0].id)

  let echecs = 0
  sid = (await wd('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: ['--headless=new', '--no-sandbox', '--disable-gpu',
            '--disable-dev-shm-usage', '--window-size=1280,1000'],
        },
      },
    },
  })).sessionId

  try {
    await wd('POST', S('/url'), { url: SITE + '/' })
    await evaluer('localStorage.setItem("questforge-token", ' + JSON.stringify(cx.access_token) + '); return true;')
    await wd('POST', S('/url'), { url: SITE + '/app/offres/' + offreId })
    await attendre(2600)

    // 1. La carte « Parcours » existe-t-elle, avec son bouton ?
    const avant = await evaluer(`
      var t = document.body.innerText;
      var b = Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return /Générer le parcours/i.test(x.textContent) });
      return { carteVisible: /Parcours d/i.test(t), bouton: !!b,
               libelle: b ? b.textContent.trim() : null };`)
    bloc('1. La fiche de l offre propose-t-elle un parcours ?')
    for (const [k, v] of Object.entries(avant)) ligne(k, v)
    if (!avant.carteVisible || !avant.bouton) {
      console.log('   ✘ aucun moyen de generer un parcours depuis l interface'); echecs++
      throw new Error('le bouton manque : la suite du controle n a pas de sens')
    }
    console.log('   ✔ le bouton est la')
    const b1 = await wd('GET', S('/screenshot'))
    fs.writeFileSync('/tmp/parcours-1-avant.png', Buffer.from(b1, 'base64'))

    // 2. On clique, comme un utilisateur.
    await evaluer(`
      Array.prototype.find.call(document.querySelectorAll('button'),
        function (x) { return /Générer le parcours/i.test(x.textContent) }).click();
      return true;`)
    for (let i = 0; i < 30; i++) {
      await attendre(500)
      const pret = await evaluer("return /Compétences exigées/i.test(document.body.innerText);")
      if (pret) break
    }

    const apres = await evaluer(`
      var t = document.body.innerText;
      var badges = Array.prototype.map.call(
        document.querySelectorAll('.badge'), function (b) { return b.textContent.trim() });
      var lienRoyaume = document.querySelector('a[href^="/royaume/"]');
      return {
        competences: /Compétences exigées/i.test(t),
        ficheUS: /Prêt pour les USA/i.test(t),
        nbPointsUS: (t.match(/Prêt pour les USA — (\\d+) points/) || [])[1] || null,
        marqueUS: badges.some(function (b) { return /poste américain/i.test(b) }),
        salaire: badges.find(function (b) { return /\\$/.test(b) }) || null,
        lienRoyaume: lienRoyaume ? lienRoyaume.getAttribute('href') : null,
        competencesListees: badges.filter(function (b) {
          return /^(Agents IA|AWS|MLOps|Sécurité|Securite|Données|Donnees|RAG|Marche US|Marché US|Communication|Python|Kubernetes|Azure|Terraform|Cout|Coût)\\s*\\d*$/.test(b)
        }),
      };`)
    bloc('2. Ce que le parcours affiche')
    for (const [k, v] of Object.entries(apres)) ligne(k, Array.isArray(v) ? v.join(', ') : v)
    if (!apres.competences) { console.log('   ✘ aucune competence affichee'); echecs++ }
    if (!apres.ficheUS) { console.log('   ✘ la fiche « pret pour les USA » manque sur une offre americaine'); echecs++ }
    if (!apres.lienRoyaume) { console.log('   ✘ aucun lien vers le Royaume'); echecs++ }
    if (!echecs) console.log('   ✔ competences, fiche USA et entree du Royaume')
    const b2 = await wd('GET', S('/screenshot'))
    fs.writeFileSync('/tmp/parcours-2-apres.png', Buffer.from(b2, 'base64'))

    // 3. Le lien mene-t-il a un Royaume peuple ?
    if (apres.lienRoyaume) {
      await wd('POST', S('/url'), { url: SITE + apres.lienRoyaume })
      await attendre(2600)
      const roy = await evaluer(`
        var m = document.getElementById('mur');
        var cv = document.getElementById('jeu');
        function nonVide(c){try{var x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
          var n=0;for(var i=3;i<x.length;i+=4000) if(x[i]>0) n++;return n;}catch(e){return -1}}
        return { murVisible: !m.classList.contains('off'),
                 dessine: cv ? nonVide(cv) : null,
                 parcours: (document.getElementById('titreParcours')||{}).textContent };`)
      bloc('3. Le Royaume ouvert sur ce parcours')
      for (const [k, v] of Object.entries(roy)) ligne(k, v)
      if (roy.murVisible) { console.log('   ✘ un mur s affiche au lieu de la carte'); echecs++ }
      else if (!roy.dessine) { console.log('   ✘ la carte est vide'); echecs++ }
      else console.log('   ✔ carte peuplee, ouverte sur le bon parcours')
      const b3 = await wd('GET', S('/screenshot'))
      fs.writeFileSync('/tmp/parcours-3-royaume.png', Buffer.from(b3, 'base64'))
    }

    let sev = []
    const types = await wd('GET', S('/se/log/types')).catch(() => null)
    if (types && types.includes('browser')) {
      const l = await wd('POST', S('/se/log'), { type: 'browser' }).catch(() => [])
      sev = (l || []).filter((x) => x.level === 'SEVERE')
        .filter((x) => !/favicon|fonts\.g/.test(x.message)).map((x) => x.message.slice(0, 200))
    }
    bloc('Console')
    if (!sev.length) console.log('   aucune erreur SEVERE')
    else { sev.forEach((e) => console.log('   ✘ ' + e)); echecs++ }

    console.log('\n' + (echecs ? '✘ ' + echecs + ' controle(s) en echec.' : '✔ La chaine offre → parcours → Royaume tient de bout en bout.'))
    console.log('   captures : /tmp/parcours-1-avant.png  /tmp/parcours-2-apres.png  /tmp/parcours-3-royaume.png')
    process.exitCode = echecs ? 1 : 0
  } finally {
    await wd('DELETE', S('')).catch(() => {})
  }
}
main().catch((e) => { console.error('\n✘ ECHEC : ' + e.message); process.exit(1) })
